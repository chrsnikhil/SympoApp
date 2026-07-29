import { hashAnswer } from "@/lib/auth/session";
import type { Challenge } from "@/lib/db/types";
import type { GradeResult } from "@/lib/graders/types";

/**
 * Round 1, Game 2 — "Connections". Five puzzles played in sequence, each a
 * handful of tile images sharing one hidden technical term plus a one-line
 * clue. Unlike the MCQ clock or the earlier timed-reveal version of this
 * game, the tile reveal is COORDINATOR-PACED, not timed: the coordinator
 * clicks "reveal next image" live, on stage, and every team sees the new
 * tile land at once. `connectionsRevealedCount` on the challenge doc is the
 * single source of truth a client is ever told — never the full tile list,
 * never a countdown it could race.
 */

/** Floor a late solve can't fall below — same shape as the Memory Game's
 *  par/cap falloff, so the two Round 1 games that reward speed agree on how
 *  hard the penalty bites. */
const FLOOR_FRACTION = 0.3;

/** Tile paths currently revealed — just a slice of the admin-controlled count. */
export function revealedImages(challenge: Challenge): string[] {
  const images = challenge.config.connectionsImages ?? [];
  const count = Math.min(images.length, Math.max(0, challenge.config.connectionsRevealedCount ?? 0));
  return images.slice(0, count);
}

/**
 * Points fall off with how many tiles were already up when a team solved it —
 * guessing off the first reveal is worth more than needing the whole set, the
 * same "reward finishing early" idea the Memory Game's flip-count falloff
 * uses. `revealedCount` is 1-indexed (at least one tile is always up by the
 * time a guess can even be submitted); solving on the first tile scores full
 * marks, solving on the last tile scores the 30% floor.
 */
export function pointsForReveal(fullPoints: number, revealedCount: number, totalImages: number): number {
  if (totalImages <= 1) return fullPoints;
  const floor = Math.round(fullPoints * FLOOR_FRACTION);
  const position = Math.min(Math.max(revealedCount, 1), totalImages) - 1; // 0 at tile 1, totalImages-1 at the last tile
  const frac = position / (totalImages - 1);
  return Math.round(fullPoints - (fullPoints - floor) * frac);
}

/**
 * A plain hashed-answer check, scored the instant it arrives — so a team can
 * retry after a wrong guess instead of getting one shot at a puzzle they're
 * still working out (the grader is what stops retries after a correct
 * answer — see `graders/quiz.ts`). A correct guess is worth less the more
 * tiles the coordinator had already revealed when it landed.
 */
export function scoreConnections(challenge: Challenge, payload: string): GradeResult {
  const guess = payload.trim();
  if (!guess) return { correct: false, points: 0, meta: { reason: "empty" } };

  const correct = hashAnswer(guess) === challenge.config.answerHash;
  if (!correct) return { correct: false, points: 0 };

  const totalImages = (challenge.config.connectionsImages ?? []).length;
  const revealedCount = revealedImages(challenge).length;
  const points = pointsForReveal(challenge.points, revealedCount, totalImages);
  return { correct: true, points, meta: { revealedCount, totalImages } };
}
