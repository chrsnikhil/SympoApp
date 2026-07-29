import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import { appendScore } from "@/lib/score/ledger";
import type { Challenge, QuizServe } from "@/lib/db/types";
import type { GradeResult } from "@/lib/graders/types";

/**
 * Per-format scoring for Rounds 2 & 3's two-phase MCQs, plus the two Round 1
 * mini-games ("Guess the Number", "Image Replication") that can't be scored
 * the instant an answer arrives.
 */

// ── Rounds 2 & 3 — two-phase MCQ ─────────────────────────────────────────────

/**
 * Flat scoring, no speed bonus: the rules doc gives rounds 2/3 as "Knowledge"
 * / "Knowledge + comeback bonus" at a fixed per-question value, unlike the
 * draft PDF's decaying speed bonus. A late answer (before the read phase ends,
 * or after the select phase ends) scores zero — "no exceptions" per the rules.
 */
export function scoreMcq(challenge: Challenge, payload: string, serve: QuizServe, receivedAt: Date): GradeResult {
  const choice = Number.parseInt(payload, 10);
  if (Number.isNaN(choice)) {
    return { correct: false, points: 0, meta: { reason: "bad-choice" } };
  }
  if (serve.skipped) {
    return { correct: false, points: 0, meta: { reason: "skipped" } };
  }

  // A small grace window absorbs network latency — a team that clicked right
  // at the edge shouldn't lose the question because their request took 300ms
  // on venue wifi. The people punished without this are the ones with the
  // worst connection.
  const GRACE_MS = 1_000;

  // Read phase: the question is visible but answering is locked. The real UI
  // never lets this fire, but the server is the actual boundary, not the UI.
  if (receivedAt.getTime() < serve.readUntil.getTime() - GRACE_MS) {
    return { correct: false, points: 0, meta: { reason: "too-early" } };
  }
  if (receivedAt.getTime() > serve.answerableUntil.getTime() + GRACE_MS) {
    return { correct: false, points: 0, meta: { reason: "too-late" } };
  }

  // A fifty-fifty removes options; picking one anyway means a stale/tampered client.
  if ((serve.eliminated ?? []).includes(choice)) {
    return { correct: false, points: 0, meta: { reason: "eliminated-option" } };
  }

  if (choice !== challenge.config.correctIndex) {
    return { correct: false, points: 0 };
  }

  return { correct: true, points: challenge.points, meta: { abilitiesUsed: serve.abilitiesUsed } };
}

// ── Round 1, Game 3 — Guess the Number (deferred: needs everyone's guess) ───

/**
 * Accepted now, scored once the coordinator closes the question — the winner
 * depends on what the OTHER teams guessed, so no single submission can be
 * graded when it arrives. Validated as a number here so a team learns
 * immediately that "about a million" won't be accepted, while they can still
 * fix it.
 */
export function acceptEstimate(payload: string): GradeResult {
  const guess = Number(payload.replace(/[,\s_]/g, ""));
  if (!Number.isFinite(guess)) {
    return { correct: false, points: 0, meta: { reason: "not-a-number" } };
  }
  return { correct: false, points: 0, pending: true, meta: { guess } };
}

export interface ResolvedAward {
  teamId: string;
  points: number;
  detail: Record<string, unknown>;
}

/**
 * Settle Guess the Number: whoever is nearest the true value takes the 5
 * points. Exact ties both score — splitting five points three ways to avoid a
 * shared win creates more argument on stage than it prevents.
 */
export async function resolveEstimate(slug: string): Promise<ResolvedAward[]> {
  const [challenges, subs] = await Promise.all([collections.challenges(), collections.submissions()]);

  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge?._id) throw new Error(`No such quiz challenge: ${slug}`);

  const truth = challenge.config.answerValue;
  if (truth === undefined) throw new Error(`${slug} has no answerValue to resolve against`);

  // "running", not "queued" — see the note in lib/quiz/judge.ts: the shared
  // pipeline only writes "queued" for `code` events. A pending quiz
  // submission sits at "running" until something resolves it.
  const attempts = await subs.find({ challengeId: challenge._id, status: "running" }).toArray();
  if (attempts.length === 0) return [];

  // One guess per team — the earliest, so a team can't fish with several.
  const firstByTeam = new Map<string, (typeof attempts)[number]>();
  for (const a of [...attempts].sort((x, y) => x.receivedAt.getTime() - y.receivedAt.getTime())) {
    const key = String(a.teamId);
    if (!firstByTeam.has(key)) firstByTeam.set(key, a);
  }

  const scored = [...firstByTeam.entries()].map(([teamId, sub]) => {
    const guess = Number((sub.payload ?? "").replace(/[,\s_]/g, ""));
    return { teamId, sub, guess, error: Number.isFinite(guess) ? Math.abs(guess - truth) : Infinity };
  });

  const best = Math.min(...scored.map((s) => s.error));
  const awards: ResolvedAward[] = [];

  for (const s of scored) {
    const won = Number.isFinite(s.error) && s.error === best;
    const points = won ? challenge.points : 0;

    await withThrottleRetry(() =>
      subs.updateOne(
        { _id: s.sub._id },
        { $set: { status: "done", verdict: { correct: won, points, meta: { guess: s.guess, error: s.error, truth } } } }
      )
    );

    if (won) {
      await appendScore({
        teamId: new ObjectId(s.teamId),
        event: "quiz",
        points,
        reason: `quiz:${slug}`,
        submissionId: s.sub._id,
        at: s.sub.receivedAt,
      });
    }

    awards.push({ teamId: s.teamId, points, detail: { guess: s.guess, error: s.error } });
  }

  return awards;
}

// ── Round 1, Game 1 — Image Replication (deferred: vision-judged) ───────────

/**
 * Accepted now, scored by the vision judge. The payload is the id of an image
 * the team uploaded via /api/quiz/image, not the image itself — a base64
 * picture is three orders of magnitude past the pipeline's 64KB payload cap.
 * Ownership is checked too: an id alone would let a team submit against
 * another team's upload.
 */
export async function acceptPromptImage(payload: string, teamId: ObjectId, challengeSlug: string): Promise<GradeResult> {
  const id = payload.trim();
  if (!id) return { correct: false, points: 0, meta: { reason: "empty" } };
  if (!ObjectId.isValid(id)) {
    return { correct: false, points: 0, meta: { reason: "no-image" } };
  }

  const images = await collections.promptImages();
  const image = await images.findOne({ _id: new ObjectId(id), teamId, challengeSlug });
  if (!image) return { correct: false, points: 0, meta: { reason: "no-image" } };

  return { correct: false, points: 0, pending: true, meta: { submitted: true, bytes: image.bytes } };
}

/**
 * Settle Image Replication from a similarity score per team. `similarity` is
 * 0–1; points are that fraction of the question's 10, so a near-perfect
 * recreation takes almost everything and a vague one still scores something.
 */
export async function resolvePromptImage(slug: string, similarityByTeam: Record<string, number>): Promise<ResolvedAward[]> {
  const [challenges, subs] = await Promise.all([collections.challenges(), collections.submissions()]);

  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge?._id) throw new Error(`No such quiz challenge: ${slug}`);

  // "running", not "queued" — see the note in lib/quiz/judge.ts.
  const attempts = await subs.find({ challengeId: challenge._id, status: "running" }).toArray();
  const awards: ResolvedAward[] = [];

  for (const sub of attempts) {
    const teamId = String(sub.teamId);
    const raw = similarityByTeam[teamId];
    if (raw === undefined) continue; // not judged yet — leave it queued

    const similarity = Math.min(1, Math.max(0, raw));
    const points = Math.round(challenge.points * similarity);

    await withThrottleRetry(() =>
      subs.updateOne(
        { _id: sub._id },
        { $set: { status: "done", verdict: { correct: similarity > 0, points, meta: { similarity } } } }
      )
    );

    if (points > 0) {
      await appendScore({
        teamId: sub.teamId,
        event: "quiz",
        points,
        reason: `quiz:${slug}`,
        submissionId: sub._id,
        at: sub.receivedAt,
      });
    }

    awards.push({ teamId, points, detail: { similarity } });
  }

  return awards;
}
