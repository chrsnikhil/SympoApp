import { ObjectId } from "mongodb";
import { hashAnswer } from "@/lib/auth/session";
import { collections } from "@/lib/db/client";
import { isUniverseWord, universeIndexFor } from "@/lib/universe/words";
import type { Challenge } from "@/lib/db/types";
import { gradeCircuit } from "./circuit";
import { gradeShiftverse } from "./shiftverse";
import { gradeBlueprint } from "./blueprint";
import type { GradeInput, GradeResult } from "./types";

/** The universe round grades against the team's own universe, not a fixed hash. */
const UNIVERSE_SLUG = "hunt-universe";

/**
 * Is this the right answer for THIS team?
 *
 * Every other hunt puzzle has one answer, stored as `config.answerHash`. The
 * universe round has eight — a team is routed to one of eight universes by its
 * team number, and each has its own word — so there is no single hash a
 * challenge document could hold.
 *
 * Rather than seed eight challenges (eight rows in hunt_progress per team,
 * eight tiles on the hunt, and a leaderboard that counts a team's solves
 * differently depending on which universe they drew), the round is one
 * challenge and the answer is resolved per team here.
 *
 * The team's universe is derived from the team record, never from the request:
 * that is the same rule the universe routes follow, and it is what stops a team
 * grading against another universe's word by asking for it.
 */
async function isCorrectAnswer(
  challenge: Challenge,
  teamId: ObjectId,
  payload: string
): Promise<boolean> {
  if (challenge.slug !== UNIVERSE_SLUG) {
    return hashAnswer(payload) === challenge.config.answerHash;
  }

  const teams = await collections.teams();
  const team = await teams.findOne({ _id: teamId });
  const number = typeof team?.coin === "number" ? team.coin : team?.teamNumber;
  if (typeof number !== "number") return false;

  return isUniverseWord(universeIndexFor(number), payload);
}

/**
 * HUNT — hashed answer compare, then unlock the next clue in the chain.
 *
 * The chain is enforced SERVER-side via hunt_progress: a team can only submit
 * against a clue they've actually unlocked. Without that, anyone could read
 * the clue slugs out of the client bundle and jump to the last one.
 */
export async function gradeHunt(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;

  // The circuit levels are hunt challenges but are not word answers: they are
  // graded by rebuilding the player's board, so they get their own grader.
  // Dispatched on the presence of a levelId rather than on a slug pattern, so
  // renaming a level's slug cannot silently route it back to the word check.
  if (typeof challenge.config.levelId === "number") {
    return gradeCircuit(input);
  }

  // Shiftverse grades a guess against the team's own puzzle slot rather than a
  // shared hash, and enforces its own fifteen-minute board deadline.
  if (challenge.config.flow === "shiftverse") {
    return gradeShiftverse(input);
  }

  // Blueprint Recovery checks a physical sector's access code against the
  // sector this team was sent to, which is derived from their team number.
  if (challenge.config.flow === "blueprint") {
    return gradeBlueprint(input);
  }
  const progress = await collections.huntProgress();

  const current = await progress.findOne({ teamId, challengeSlug: challenge.slug });
  if (!current) {
    return { correct: false, points: 0, meta: { reason: "clue-not-unlocked" } };
  }
  if (current.solvedAt) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  if (!(await isCorrectAnswer(challenge, teamId, payload))) {
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
