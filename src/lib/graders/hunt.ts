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

  // Claim the solve, don't just record it.
  //
  // The `current.solvedAt` check above is a read, and this is the matching
  // write — two correct submissions from the same team that both read before
  // either wrote would both pass that check and both reach appendScore, paying
  // the team twice for one puzzle. That is not hypothetical at a live event: a
  // team plays from more than one phone, and a double-tap on a slow network is
  // two requests in flight at once.
  //
  // Filtering on `solvedAt: null` makes the update itself the arbiter — Mongo
  // applies the two writes in some order and only the first matches, so exactly
  // one caller sees modifiedCount === 1 and only that one scores. The earlier
  // read stays because it answers the common case without a write and supplies
  // hintsUsed for the award; correctness now rests on this filter.
  //
  // (`solvedAt: null` also matches a missing field, so a document seeded
  // without the key still claims correctly.)
  const claim = await progress.updateOne(
    { teamId, challengeSlug: challenge.slug, solvedAt: null },
    { $set: { solvedAt: input.receivedAt } }
  );
  if (claim.modifiedCount === 0) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

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
