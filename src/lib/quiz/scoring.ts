import { ObjectId } from "mongodb";
import { IMAGE_SCORE_BANDS, IMAGE_SCORE_MIN_SIMILARITY } from "@/lib/config";
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
    if (serve.abilitiesUsed?.includes("free-pass")) {
      return { correct: true, points: challenge.points, meta: { reason: "free-pass", abilitiesUsed: serve.abilitiesUsed } };
    }
    if (serve.abilitiesUsed?.includes("safety-net")) {
      return { correct: false, points: Math.floor(challenge.points / 2), meta: { reason: "safety-net", abilitiesUsed: serve.abilitiesUsed } };
    }
    return { correct: false, points: 0 };
  }

  let earnedPoints = challenge.points;
  if (serve.abilitiesUsed?.includes("double-points")) {
    earnedPoints *= 2;
  }

  return { correct: true, points: earnedPoints, meta: { abilitiesUsed: serve.abilitiesUsed } };
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
 * Similarity (0..1) → marks, via the configurable band ladder in lib/config.
 *
 * Deliberately generous: this is a symposium game, and a team that genuinely
 * attempted the recreation should score. Zero is reserved for the two cases
 * that earn it — a copy of the reference (caught upstream by watermark
 * detection or the byte-match check, which never reach here with a real
 * similarity) and an image unrelated to the reference, i.e. below
 * IMAGE_SCORE_MIN_SIMILARITY.
 *
 * `gamePoints` scales the ladder if a challenge is ever worth other than 10.
 */
export function similarityToMarks(similarity: number, gamePoints = 10): number {
  const s = Math.min(1, Math.max(0, similarity > 1 ? similarity / 100 : similarity));
  if (s < IMAGE_SCORE_MIN_SIMILARITY) return 0;

  const band = IMAGE_SCORE_BANDS.find((b) => s >= b.atLeast);
  if (!band) return 0;

  const scaled = gamePoints === 10 ? band.marks : Math.round((band.marks / 10) * gamePoints);
  return Math.min(gamePoints, Math.max(0, scaled));
}

/** Maps the vision judge's 0..1 similarity onto the game's marks. */
export function scaleSimilarity(similarity: number, gamePoints: number): number {
  return similarityToMarks(similarity, gamePoints);
}

export type ImageEvalOutcome =
  | { status: "scored"; similarity: number; points: number; modelUsed?: string | null; reason?: string | null }
  | {
      status: "rejected_watermark";
      similarity?: number | null;
      confidence?: number | null;
      points?: number;
      modelUsed?: string | null;
      reason?: string | null;
    }
  | { status: "failed"; message: string };

/**
 * THE single writer for an Image Replication result — every judging path
 * (the end-of-round finalizer and the coordinator's manual resolve) lands here.
 *
 * IDEMPOTENT BY CONSTRUCTION, because it is reached from a client poll loop
 * and from a background resolver that may both see the same terminal result.
 * The previous version appended a fresh ledger row every time it ran, so a
 * team polling every 1.5s was awarded its score again on each tick — a single
 * 9-point submission was observed booking 36 points across 4 polls.
 *
 * The ledger is append-only on purpose (see lib/score/ledger.ts), so a
 * correction is a COMPENSATING ROW rather than an edit: this computes what the
 * team should now total for this challenge, subtracts what the ledger already
 * says, and appends only the difference. Re-running with the same result
 * appends nothing; re-uploading a better attempt appends just the delta.
 */
export async function recordImageEvaluation(
  slug: string,
  teamId: ObjectId,
  outcome: ImageEvalOutcome
): Promise<{ points: number; delta: number }> {
  const [challenges, subs, scores] = await Promise.all([
    collections.challenges(),
    collections.submissions(),
    collections.scoreEvents(),
  ]);

  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge?._id) throw new Error(`No such challenge: ${slug}`);

  const points = outcome.status === "scored" ? outcome.points : 0;
  const meta: Record<string, unknown> = { evalStatus: outcome.status };
  if (outcome.status === "scored") {
    meta.similarity = outcome.similarity;
    meta.modelUsed = outcome.modelUsed ?? null;
    meta.reason = outcome.reason ?? null;
  } else if (outcome.status === "rejected_watermark") {
    meta.watermarkDetected = true;
    meta.watermarkConfidence = outcome.confidence ?? null;
    meta.similarity = outcome.similarity ?? 0;
    meta.modelUsed = outcome.modelUsed ?? null;
    meta.reason = outcome.reason ?? null;
  } else {
    meta.errorMessage = outcome.message;
  }

  // "failed" stays retryable; a watermark rejection is a real, final verdict.
  const status: "done" | "error" = outcome.status === "failed" ? "error" : "done";

  const existingSub = await subs.findOne({ type: "quiz", challengeId: challenge._id, teamId });
  const receivedAt = existingSub?.receivedAt ?? new Date();

  await withThrottleRetry(() =>
    subs.updateOne(
      { type: "quiz", challengeId: challenge._id, teamId },
      {
        $set: { status, verdict: { correct: points > 0, points, meta } },
        $setOnInsert: { type: "quiz", challengeId: challenge._id, teamId, participantId: teamId, receivedAt },
      },
      { upsert: true }
    )
  );

  const sub = existingSub ?? (await subs.findOne({ type: "quiz", challengeId: challenge._id, teamId }));

  // Append only the difference between what this team should have and what
  // the ledger already granted for this challenge.
  const priorRows = await scores.find({ teamId, event: "quiz", reason: `quiz:${slug}` }).toArray();
  const alreadyAwarded = priorRows.reduce((sum, row) => sum + row.points, 0);
  const delta = points - alreadyAwarded;

  if (delta !== 0) {
    await appendScore({
      teamId,
      event: "quiz",
      points: delta,
      reason: `quiz:${slug}`,
      submissionId: sub?._id,
      at: receivedAt,
    });
  }

  console.log(
    `[image-eval] team=${String(teamId)} q=${slug} status=${outcome.status} points=${points} ` +
      `(already=${alreadyAwarded}, delta=${delta})`
  );

  return { points, delta };
}

/**
 * Settle Image Replication from a similarity score per team. `similarity` is
 * 0–1; points are that fraction of the question's 10, so a near-perfect
 * recreation takes almost everything and a vague one still scores something.
 */
export async function resolvePromptImage(slug: string, similarityByTeam: Record<string, number>): Promise<ResolvedAward[]> {
  const challenges = await collections.challenges();
  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge?._id) throw new Error(`No such challenge: ${slug}`);

  const awards: ResolvedAward[] = [];
  const maxPoints = challenge.points ?? 10;

  for (const [teamIdStr, raw] of Object.entries(similarityByTeam)) {
    if (raw === undefined || raw === null) continue;
    const teamId = new ObjectId(teamIdStr);
    const similarity = Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw));

    const { points } = await recordImageEvaluation(slug, teamId, {
      status: "scored",
      similarity,
      points: scaleSimilarity(similarity, maxPoints),
    });

    awards.push({ teamId: teamIdStr, points, detail: { similarity } });
  }

  return awards;
}

