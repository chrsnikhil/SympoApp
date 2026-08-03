import { hashAnswer } from "@/lib/auth/session";
import { collections } from "@/lib/db/client";
import type { GradeInput, GradeResult } from "./types";

/**
 * CTF — hashed flag compare, plus a first-blood bonus for the first team.
 *
 * First blood is decided by the SERVER receipt timestamp, and awarded only if
 * no earlier correct submission exists for this challenge. Two teams landing
 * in the same millisecond is the interesting case: the ledger is append-only
 * and this check reads committed submissions, so at worst the bonus is
 * awarded once per distinct earlier-solve set. Tighten to a conditional
 * update on a `firstBloodTeamId` field if the event needs a hard guarantee.
 */
export async function gradeCtf(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload, receivedAt } = input;
  const subs = await collections.submissions();

  const alreadySolved = await subs.findOne({
    challengeId: challenge._id,
    teamId,
    "verdict.correct": true,
  });
  if (alreadySolved) return { correct: false, points: 0, meta: { reason: "already-solved" } };

  if (hashAnswer(payload) !== challenge.config.answerHash) {
    return { correct: false, points: 0 };
  }

  const earlier = await subs.findOne(
    { challengeId: challenge._id, "verdict.correct": true, receivedAt: { $lt: receivedAt } },
    { projection: { _id: 1 } }
  );
  const firstBlood = !earlier;
  const bonus = firstBlood ? challenge.config.firstBloodBonus ?? 0 : 0;

  return {
    correct: true,
    points: challenge.points + bonus,
    meta: { firstBlood, bonus },
  };
}
