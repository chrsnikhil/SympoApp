import { hashAnswer } from "@/lib/auth/session";
import type { Challenge } from "@/lib/db/types";
import type { GradeResult } from "@/lib/graders/types";

/**
 * Round 1, Game 2 — "Connections". Four tile images share one hidden
 * technical term; they reveal one at a time on a fixed schedule from when the
 * coordinator opens the game, and a team types the term once they're
 * confident. Replaces the earlier "Guess the Number" slot.
 *
 * SERVER OWNS THE REVEAL, same principle as the MCQ clock: a client is only
 * ever told which images are ALREADY unlocked as of `now`, computed fresh
 * from `challenge.opensAt` on every request. It never receives the full tile
 * list up front and times its own reveal — that would just be an unenforced
 * client-side clock wearing a costume.
 */

export const DEFAULT_REVEAL_SECONDS = 20;

/** Floor a late solve can't fall below — same shape as the Memory Game's
 *  par/cap falloff, so the two Round 1 games that reward speed agree on how
 *  hard the penalty bites. */
const FLOOR_FRACTION = 0.3;

/** Tile paths unlocked as of `now`. Empty until the coordinator opens the game. */
export function revealedImages(challenge: Challenge, now: Date): string[] {
  const images = challenge.config.connectionsImages ?? [];
  if (!challenge.opensAt || images.length === 0) return [];

  const elapsedMs = now.getTime() - challenge.opensAt.getTime();
  if (elapsedMs < 0) return [];

  const intervalMs = (challenge.config.connectionsRevealSeconds ?? DEFAULT_REVEAL_SECONDS) * 1000;
  const unlocked = Math.min(images.length, Math.floor(elapsedMs / intervalMs) + 1);
  return images.slice(0, unlocked);
}

/** Seconds until the next tile unlocks, or null once every tile is already up. */
export function secondsToNextReveal(challenge: Challenge, now: Date): number | null {
  const images = challenge.config.connectionsImages ?? [];
  if (!challenge.opensAt || images.length === 0) return null;

  const intervalMs = (challenge.config.connectionsRevealSeconds ?? DEFAULT_REVEAL_SECONDS) * 1000;
  const revealedCount = revealedImages(challenge, now).length;
  if (revealedCount >= images.length) return null;

  const nextAt = challenge.opensAt.getTime() + revealedCount * intervalMs;
  return Math.max(0, Math.ceil((nextAt - now.getTime()) / 1000));
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
 * tiles were already revealed when it landed, per `pointsForReveal` above —
 * so this is scored against `now`, not a flat per-question value.
 */
export function scoreConnections(challenge: Challenge, payload: string, now: Date = new Date()): GradeResult {
  const guess = payload.trim();
  if (!guess) return { correct: false, points: 0, meta: { reason: "empty" } };

  const correct = hashAnswer(guess) === challenge.config.answerHash;
  if (!correct) return { correct: false, points: 0 };

  const totalImages = (challenge.config.connectionsImages ?? []).length;
  const revealedCount = revealedImages(challenge, now).length;
  const points = pointsForReveal(challenge.points, revealedCount, totalImages);
  return { correct: true, points, meta: { revealedCount, totalImages } };
}
