import { createHash } from "node:crypto";
import { collections } from "@/lib/db/client";
import { calculateChallengeValue } from "@/lib/ctf/scoring";
import type { GradeInput, GradeResult } from "./types";

/**
 * CTF Grader — Hashed flag compare + dynamic decay scoring.
 *
 * Requirements:
 *  1. Flags: Case-sensitive, exact match, no trimming, SPIDER{...} format.
 *  2. SHA256 comparison against challenge.config.answerHash.
 *  3. Duplicate solve check per team.
 */
export async function gradeCtf(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;
  const subs = await collections.submissions();

  // 1 ── Check duplicate solve for this team
  const alreadySolved = await subs.findOne({
    challengeId: challenge._id,
    teamId,
    "verdict.correct": true,
  });
  if (alreadySolved) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  // 2 ── Validate SHA256 hash (Exact string, case-sensitive, no trimming)
  const submittedHash = createHash("sha256").update(payload).digest("hex");
  if (submittedHash !== challenge.config.answerHash) {
    return { correct: false, points: 0, meta: { reason: "wrong-flag" } };
  }

  // 3 ── Calculate Dynamic Points
  const previousSolves = await subs.countDocuments({
    challengeId: challenge._id,
    "verdict.correct": true,
  });
  const currentSolves = previousSolves + 1;

  const initialPts = challenge.config.initialPoints ?? challenge.points;
  const minPts = challenge.config.minimumPoints ?? 50;
  const decayAfter = challenge.config.decayAfter ?? 5;

  const totalPoints = calculateChallengeValue(initialPts, minPts, decayAfter, currentSolves);

  return {
    correct: true,
    points: totalPoints,
    meta: {
      solves: currentSolves,
    },
  };
}
