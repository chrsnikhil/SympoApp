import { hashAnswer } from "@/lib/auth/session";
import { collections } from "@/lib/db/client";
import type { GradeInput, GradeResult } from "./types";

/**
 * HUNT — hashed answer compare, then unlock the next clue in the chain.
 *
 * The chain is enforced SERVER-side via hunt_progress: a team can only submit
 * against a clue they've actually unlocked. Without that, anyone could read
 * the clue slugs out of the client bundle and jump to the last one.
 */
export async function gradeHunt(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;
  const progress = await collections.huntProgress();

  const current = await progress.findOne({ teamId, challengeSlug: challenge.slug });
  if (!current) {
    return { correct: false, points: 0, meta: { reason: "clue-not-unlocked" } };
  }
  if (current.solvedAt) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  if (hashAnswer(payload) !== challenge.config.answerHash) {
    return { correct: false, points: 0 };
  }

  // Hints are a point cost, not a lockout — never let the award go negative.
  const hintCosts = challenge.config.hintCosts ?? [];
  const spent = hintCosts.slice(0, current.hintsUsed).reduce((a, b) => a + b, 0);
  const points = Math.max(0, challenge.points - spent);

  await progress.updateOne(
    { teamId, challengeSlug: challenge.slug },
    { $set: { solvedAt: input.receivedAt } }
  );

  // Unlock the next clue. upsert so a replayed request can't create duplicates.
  const next = challenge.config.nextSlug;
  if (next) {
    await progress.updateOne(
      { teamId, challengeSlug: next },
      { $setOnInsert: { teamId, challengeSlug: next, unlockedAt: input.receivedAt, solvedAt: null, hintsUsed: 0 } },
      { upsert: true }
    );
  }

  return { correct: true, points, meta: { hintsUsed: current.hintsUsed, nextSlug: next ?? null } };
}
