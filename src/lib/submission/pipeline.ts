import { ObjectId } from "mongodb";
import { LIMITS, type EventKey } from "@/lib/config";
import { collections } from "@/lib/db/client";
import { FROZEN_MESSAGE, isTeamFrozen } from "@/lib/quiz/proctorGuard";
import { withThrottleRetry } from "@/lib/db/retry";
import { graderFor } from "@/lib/graders";
import { appendScore } from "@/lib/score/ledger";
import { materialize } from "@/lib/leaderboard/materialize";
import type { SessionClaims } from "@/lib/auth/session";
import type { QuizRound } from "@/lib/db/types";

/**
 * THE submission pipeline. Every user action in every event flows through
 * here, which is what keeps the four events consistent: identical rate limits,
 * identical timestamping, identical scoring, one place to audit.
 *
 * Order matters and is deliberate:
 *   1. stamp the server clock FIRST — before any I/O, so a slow database
 *      lookup can't disadvantage whoever submitted at the same instant
 *   2. cheap rejections (size, rate limit) before expensive ones
 *   3. grade
 *   4. append to the ledger; the leaderboard picks it up within ~5s
 */

export type SubmitOutcome =
  | { ok: true; status: 200; submissionId: string; correct: boolean; points: number; meta?: Record<string, unknown> }
  | { ok: true; status: 202; submissionId: string; pending: true }
  | { ok: false; status: 400 | 403 | 404 | 429; error: string };

export interface SubmitArgs {
  event: EventKey;
  challengeSlug: string;
  payload: string;
  session: SessionClaims;
}
async function checkSectionBonus(
  teamId: ObjectId,
  difficulty: string,
  receivedAt: Date,
  event: EventKey
) {
  const challenges = await collections.challenges();
  const submissions = await collections.submissions();
  const scoreEvents = await collections.scoreEvents();

  // Bonus only for CTF
  if (event !== "ctf") return;

  // Already received any section bonus?
  const alreadyBonus = await scoreEvents.findOne({
    teamId,
    reason: {
      $in: [
        "easy-section-bonus",
        "medium-section-bonus",
        "hard-section-bonus",
      ],
    },
  });

  if (alreadyBonus) return;

  const diff = difficulty.toLowerCase();

  const limits: Record<string, number> = {
    easy: 15,
    medium: 25,
    hard: 30,
  };

  const limit = limits[diff];
  if (!limit) return;

  // All challenges of this difficulty
  const challengeList = await challenges
    .find({
      type: "ctf",
      $or: [
        { "config.difficulty": { $regex: new RegExp(`^${diff}$`, "i") } },
        { "config.category": { $regex: new RegExp(`^${diff}$`, "i") } },
      ],
    })
    .toArray();

  const ids = challengeList.map((c) => c._id);

  // Correct solves by this team
  const solves = await submissions
    .find({
      teamId,
      challengeId: { $in: ids },
      "verdict.correct": true,
    })
    .sort({ receivedAt: 1 })
    .toArray();

  // Haven't solved every challenge yet
  if (solves.length !== challengeList.length) return;

  const start = solves[0].receivedAt.getTime();
  const end = solves[solves.length - 1].receivedAt.getTime();

  const minutes = (end - start) / 60000;

  if (minutes <= limit) {
    await appendScore({
      teamId,
      event: "ctf",
      points: 50,
      reason: `${diff}-section-bonus`,
      at: receivedAt,
    });

    console.log(`Awarded ${diff} bonus to ${teamId}`);
  }
}
export async function submit(args: SubmitArgs): Promise<SubmitOutcome> {
  // 1 ── FAIRNESS ANCHOR. Nothing above this line touches the network.
  const receivedAt = new Date();

  const { event, challengeSlug, payload, session } = args;
  const teamId = new ObjectId(session.teamId);
  const participantId = new ObjectId(session.sub);

  // Check if team is banned
  const teamsColl = await collections.teams();
  const teamDoc = await teamsColl.findOne({ _id: teamId });
  if (teamDoc?.banned) {
    return { ok: false, status: 403, error: `Your team has been banned: ${teamDoc.bannedReason || "Rule violation"}` };
  }

  const subs = await collections.submissions();

  const windowStart = new Date(receivedAt.getTime() - LIMITS.rateLimit.windowMs);
  const recent = await withThrottleRetry(() => subs.countDocuments({ teamId, receivedAt: { $gte: windowStart } }));
  if (recent >= LIMITS.rateLimit.max) {
    return { ok: false, status: 429, error: "Slow down — too many submissions" };
  }

  // 3 ── Resolve the challenge and check its window.
  const challenges = await collections.challenges();
  const challenge = await withThrottleRetry(() => challenges.findOne({ type: event, slug: challengeSlug }));

  /**
   * A frozen team cannot submit.
   *
   * The freeze used to exist only in the UI: `/api/quiz/round1` reported it so
   * the client could paint an overlay, and no write path ever asked. So it
   * stopped an honest team and nobody else — a second tab still polling, or
   * DevTools, played straight through it.
   *
   * Placed after the challenge lookup because the round comes off the challenge
   * (freezes are recorded per quiz round), and quiz-only because no other event
   * runs the tab-switch proctor, so there is nothing to look up for them.
   */
  if (event === "quiz") {
    const round = challenge?.config.round as QuizRound | undefined;
    if (round && (await isTeamFrozen(teamId, round))) {
      return { ok: false, status: 403, error: FROZEN_MESSAGE };
    }
  }
  if (!challenge?._id) return { ok: false, status: 404, error: "Challenge not found" };

  if (challenge.config?.format !== "prompt-image") {
    if (challenge.opensAt && receivedAt < challenge.opensAt) {
      return { ok: false, status: 403, error: "Not open yet" };
    }
    if (challenge.closesAt && receivedAt > challenge.closesAt) {
      return { ok: false, status: 403, error: "Closed" };
    }
  }

  if (challenge.config?.format === "prompt-image") {
    await withThrottleRetry(() => subs.deleteMany({ challengeId: challenge._id, teamId, status: "running" }));
  }

  // 4 ── Record the attempt before grading, so even a crash mid-grade leaves a
  //      trail and the receipt time is already committed.
  const insert = await withThrottleRetry(() =>
    subs.insertOne({
      type: event,
      challengeId: challenge._id,
      teamId,
      participantId,
      receivedAt,
      payload: event === "code" ? undefined : payload,
      status: event === "code" ? "queued" : "running",
    })
  );
  const submissionId = insert.insertedId;

  // 5 ── Hand to the per-event grader.
  const result = await graderFor(event)({
    challenge,
    teamId,
    participantId,
    submissionId,
    payload,
    receivedAt,
  });

  // 6 ── Async path: accepted, verdict comes later via the judge.
  if (result.pending) {
    return { ok: true, status: 202, submissionId: submissionId.toString(), pending: true };
  }

  await withThrottleRetry(() =>
    subs.updateOne(
      { _id: submissionId },
      { $set: { status: "done", verdict: { correct: result.correct, points: result.points, meta: result.meta } } }
    )
  );

  // 7 ── Append to score ledger for solves OR non-zero penalties (e.g. wrong answer / timeout penalties)
  if (result.correct || (result.points !== 0 && !result.pending)) {
    await appendScore({
      teamId,
      event,
      points: result.points,
      reason: `${event}:${challenge.slug}`,
      submissionId,
      at: receivedAt,
    });
    // Immediately re-materialize the leaderboard so score updates live for the team
    await checkSectionBonus(
      teamId,
      challenge.config?.difficulty as "Easy" | "Medium" | "Hard",
      receivedAt,
      event
    );
    try {
      await materialize(event);
    } catch (e) {
      console.error("[pipeline] materialize error:", e);
    }
  }

  return {
    ok: true,
    status: 200,
    submissionId: submissionId.toString(),
    correct: result.correct,
    points: result.points,
    meta: result.meta,
  };
}
