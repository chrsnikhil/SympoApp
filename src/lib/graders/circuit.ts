import { collections } from "@/lib/db/client";
import type { GradeInput, GradeResult } from "./types";

/**
 * CIRCUIT — Validates the puzzle completion payload and unlocks the next level.
 * 
 * NOTE: For maximum security, the backend should ideally receive the grid state
 * and run the voltage solver here. For now, it trusts the client's voltage payload.
 */
export async function gradeCircuit(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;
  const progress = await collections.huntProgress();

  const current = await progress.findOne({ teamId, challengeSlug: challenge.slug });
  if (!current) {
    return { correct: false, points: 0, meta: { reason: "level-not-unlocked" } };
  }
  if (current.solvedAt) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  let data;
  try {
    data = JSON.parse(payload);
  } catch (e) {
    return { correct: false, points: 0, meta: { reason: "invalid-payload" } };
  }

  // Validate the voltage matches the target
  if (data.voltage !== data.targetVoltage) {
    return { correct: false, points: 0 };
  }

  const hintCosts = challenge.config.hintCosts ?? [];
  const spent = hintCosts.slice(0, current.hintsUsed).reduce((a, b) => a + b, 0);
  const points = Math.max(0, challenge.points - spent);

  await progress.updateOne(
    { teamId, challengeSlug: challenge.slug },
    { $set: { solvedAt: input.receivedAt } }
  );

  // Unlock the next level
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
