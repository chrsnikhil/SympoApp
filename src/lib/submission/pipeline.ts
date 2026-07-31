import { ObjectId } from "mongodb";
import { LIMITS, type EventKey } from "@/lib/config";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import { graderFor } from "@/lib/graders";
import { appendScore } from "@/lib/score/ledger";
import type { SessionClaims } from "@/lib/auth/session";

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

export async function submit(args: SubmitArgs): Promise<SubmitOutcome> {
  // 1 ── FAIRNESS ANCHOR. Nothing above this line touches the network.
  const receivedAt = new Date();

  const { event, challengeSlug, payload, session } = args;
  const teamId = new ObjectId(session.teamId);
  const participantId = new ObjectId(session.sub);

  // 2 ── Cheap guards first.
  if (Buffer.byteLength(payload, "utf8") > LIMITS.maxPayloadBytes) {
    return { ok: false, status: 400, error: "Submission too large" };
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
  if (!challenge?._id) return { ok: false, status: 404, error: "Challenge not found" };

  if (challenge.opensAt && receivedAt < challenge.opensAt) {
    return { ok: false, status: 403, error: "Not open yet" };
  }
  if (challenge.closesAt && receivedAt > challenge.closesAt) {
    return { ok: false, status: 403, error: "Closed" };
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

  // 7 ── Only successful scoring touches the ledger. Zero-point correct
  //      answers still append, so the history shows the solve.
  if (result.correct) {
    await appendScore({
      teamId,
      event,
      points: result.points,
      reason: `${event}:${challenge.slug}`,
      submissionId,
      at: receivedAt,
    });
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
