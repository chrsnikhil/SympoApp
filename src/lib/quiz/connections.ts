import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { hashAnswer } from "@/lib/auth/session";
import type { Challenge } from "@/lib/db/types";
import type { GradeResult } from "@/lib/graders/types";

export interface ConnectionsStageRules {
  correctRanks: number[]; // Points awarded by rank [1st, 2nd, 3rd, 4th+]
  wrongPenalty: number;   // Points deducted for wrong answer
  noAnswerPenalty: number; // Points deducted for no answer (timeout)
}

/**
 * Game 2 Scoring Table Rules:
 * Image 1: 1st:12, 2nd:11, 3rd:10, 4th+:9 | Wrong: -3 | No Answer: -1
 * Image 2: 1st:8, 2nd:7, 3rd:6, 4th+:5   | Wrong: -2 | No Answer: -1
 * Image 3+: 1st:4, 2nd:3, 3rd:2, 4th+:1  | Wrong: -1 | No Answer: -1
 */
export function stageRulesFor(imageIndex: number): ConnectionsStageRules {
  if (imageIndex === 1) {
    return { correctRanks: [12, 11, 10, 9], wrongPenalty: -3, noAnswerPenalty: -1 };
  } else if (imageIndex === 2) {
    return { correctRanks: [8, 7, 6, 5], wrongPenalty: -2, noAnswerPenalty: -1 };
  } else {
    return { correctRanks: [4, 3, 2, 1], wrongPenalty: -1, noAnswerPenalty: -1 };
  }
}

/** Tile paths currently revealed. */
export function revealedImages(challenge: Challenge): string[] {
  const images = challenge.config.connectionsImages ?? [];
  const count = Math.min(images.length, Math.max(0, challenge.config.connectionsRevealedCount ?? 0));
  return images.slice(0, count);
}

/**
 * Score Connections puzzle guess based on image stage, rank by timestamp, and penalties.
 */
export async function scoreConnections(
  challenge: Challenge,
  teamId: ObjectId,
  payload: string
): Promise<GradeResult> {
  const subs = await collections.submissions();

  // If team already completed/solved this puzzle correctly, block further submissions
  const solved = await subs.findOne({
    challengeId: challenge._id,
    teamId,
    status: "done",
    "verdict.correct": true,
  });
  if (solved) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  const images = challenge.config.connectionsImages ?? [];
  const priorAttempts = await subs.countDocuments({ challengeId: challenge._id, teamId });
  const imageIndex = Math.max(1, Math.min(images.length || 4, priorAttempts + 1));
  const stageRules = stageRulesFor(imageIndex);

  const guess = payload.trim();

  // Handle No Answer / Timer Expiry
  if (guess === "__timeout__" || !guess) {
    return {
      correct: false,
      points: stageRules.noAnswerPenalty,
      meta: {
        reason: "no-answer",
        imageIndex,
        penalty: stageRules.noAnswerPenalty,
      },
    };
  }

  // Check if answer is correct (supports singular, plural, and alias variations)
  const normGuess = guess.trim().toLowerCase();
  const normSingular = normGuess.endsWith("s") && normGuess.length > 3 ? normGuess.slice(0, -1) : normGuess;
  
  const targetHashes = (challenge.config.acceptedHashes ?? [challenge.config.answerHash]).filter((h): h is string => Boolean(h));

  const isCorrect = targetHashes.some(
    (h) =>
      h === hashAnswer(guess) ||
      h === hashAnswer(normGuess) ||
      h === hashAnswer(normSingular)
  );

  if (isCorrect) {
    // Count prior correct answers during THIS image stage for timestamp ranking
    const priorCorrectThisStage = await subs.countDocuments({
      challengeId: challenge._id,
      "verdict.meta.imageIndex": imageIndex,
      "verdict.correct": true,
    });

    const rank = priorCorrectThisStage + 1;
    const points = stageRules.correctRanks[Math.min(rank - 1, stageRules.correctRanks.length - 1)];

    return {
      correct: true,
      points,
      meta: {
        rank,
        imageIndex,
        pointsAwarded: points,
      },
    };
  } else {
    // Wrong Answer penalty
    return {
      correct: false,
      points: stageRules.wrongPenalty,
      meta: {
        reason: "wrong",
        imageIndex,
        penalty: stageRules.wrongPenalty,
      },
    };
  }
}
