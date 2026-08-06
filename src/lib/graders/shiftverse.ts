import { claimSlot } from "@/lib/shiftverse/slot";
import type { GradeInput, GradeResult } from "./types";

/**
 * Shiftverse grader — a case-insensitive word match against the team's own
 * slot.
 *
 * Case-insensitive because the board is uppercase and a team typing lowercase
 * has still solved it; nothing else is normalised, so a wrong word stays wrong.
 * The slot is fetched by teamId rather than taken from the payload, so a team
 * cannot submit against another team's word.
 */
export async function gradeShiftverse(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;

  const slot = await claimSlot(teamId);
  if (!slot) return { correct: false, points: 0, meta: { reason: "no-slot" } };

  const correct = payload.trim().toUpperCase() === slot.plaintextWord.toUpperCase();
  return {
    correct,
    points: correct ? challenge.points : 0,
    meta: { teamNumber: slot.teamNumber },
  };
}
