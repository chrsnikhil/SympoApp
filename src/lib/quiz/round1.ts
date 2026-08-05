import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { Challenge } from "@/lib/db/types";
import { getCachedQuizState } from "./rounds";
import { IMAGE_ROUND_DURATION_MS } from "./imageRound";

/**
 * Round 1 "Final Universe" is played in a fixed sequence per team — Image
 * Replication, then Connections, then the Memory Game — not as three cards
 * shown at once. Each phase unlocks the next; nothing here is stored, it's
 * derived fresh from the same submissions/memory-state collections the rest
 * of the quiz already writes to, so there's no separate "current phase" field
 * that could drift out of sync with what actually happened.
 *
 * Connections is itself a sequence of up to 5 puzzles (see
 * `currentConnectionsPuzzle`) — the same "derive the position, don't store
 * it" discipline applies one level down.
 */

export type Round1Phase = "image" | "connections" | "memory" | "done";

const PHASE_ORDER: Record<Exclude<Round1Phase, "done">, number> = {
  image: 0,
  connections: 1,
  memory: 2,
};

/** Every connections puzzle in the round, in play order. */
export function connectionsPuzzles(games: Challenge[]): Challenge[] {
  return games
    .filter((g) => g.config.format === "connections")
    .sort((a, b) => (a.config.connectionsPuzzleIndex ?? 0) - (b.config.connectionsPuzzleIndex ?? 0));
}

/** Image and memory are single challenges; connections is handled separately
 *  via `currentConnectionsPuzzle` since which one is "the" puzzle depends on
 *  the team's own progress through the sequence. */
export function gameForPhase(games: Challenge[], phase: "image" | "memory"): Challenge | null {
  const format = phase === "image" ? "prompt-image" : "memory";
  return games.find((g) => g.config.format === format) ?? null;
}

/**
 * Connections is coordinator-paced live on stage: all teams see whichever
 * puzzle the coordinator currently has open (`opensAt <= now` and not closed).
 * Correct guesses lock in points and show a success banner, but teams stay
 * locked on screen showing their completed score until all images are revealed
 * and the 10s stage timer finishes (and the coordinator opens the next puzzle).
 */
export async function currentConnectionsPuzzle(
  teamId: ObjectId,
  games: Challenge[],
  now: Date = new Date(),
  teamSubmissions?: any[]
): Promise<Challenge | null> {
  const puzzles = connectionsPuzzles(games);
  if (puzzles.length === 0) return null;

  // 1) Find all puzzles opened by the coordinator (opensAt <= now)
  const openedPuzzles = puzzles.filter((p) => p.opensAt && new Date(p.opensAt) <= now);

  // If no puzzle opened yet, stay on Puzzle 1
  if (openedPuzzles.length === 0) {
    return puzzles[0];
  }

  const latestOpened = openedPuzzles[openedPuzzles.length - 1];
  const lastPuzzle = puzzles[puzzles.length - 1];
  const isLastPuzzle = latestOpened._id?.toString() === lastPuzzle._id?.toString();

  // Puzzle 5 (the last one) has no "next puzzle" to hand a team off to, so
  // leaving Connections is its own decision rather than a side effect of the
  // coordinator opening what comes next.
  //
  // That exit is the coordinator's Close button and nothing else. A team that
  // clears puzzle 5 early keeps looking at its own solved puzzle until the
  // room is moved on together.
  //
  // This previously had a second exit: all tiles revealed on stage AND this
  // team individually cleared it, which let finishers walk into Game 3 on
  // their own. It reads like a courtesy, but it desynchronises the round —
  // Game 3 is introduced from the stage, and teams arriving at it one at a
  // time over several minutes miss that. The coordinator asked for one
  // transition the whole room takes at once, so the self-serve exit is gone.
  //
  // CONSEQUENCE: puzzle 5 must be closed explicitly. Without that click no
  // team ever reaches the Memory game — there is deliberately no timeout
  // fallback, because a silent auto-advance is the behaviour being removed.
  if (isLastPuzzle) {
    if (latestOpened.closesAt && now > latestOpened.closesAt) return null;
  }

  return latestOpened;
}

export async function round1Phase(
  teamId: ObjectId,
  games: Challenge[],
  now: Date = new Date(),
  teamSubmissions?: any[]
): Promise<Round1Phase> {
  const imageGame = games.find((g) => g.config.format === "prompt-image");
  const memoryGame = games.find((g) => g.config.format === "memory");
  const puzzles = connectionsPuzzles(games);

  const quizState = await getCachedQuizState();
  const round1Start = quizState?.round1StartedAt ?? quizState?.startedAt;
  // Check if coordinator has opened ANY Connections puzzle live on stage
  const anyConnectionsOpened = puzzles.some((p) => p.opensAt && new Date(p.opensAt) <= now);

  if (imageGame && !anyConnectionsOpened) {
    const isClosedGlobal = imageGame.closesAt ? now > imageGame.closesAt : false;
    const startMs = imageGame.opensAt ? new Date(imageGame.opensAt).getTime() : 0;
    const isTimedOut = startMs > 0 ? now.getTime() - startMs >= IMAGE_ROUND_DURATION_MS : false;

    // Stay in Game 1 until: closed globally, timed out (3m30s), OR coordinator opens Connections
    if (!isClosedGlobal && !isTimedOut) {
      return "image";
    }
  }

  if (puzzles.length > 0) {
    const current = await currentConnectionsPuzzle(teamId, games, now, teamSubmissions);
    if (current) return "connections";
  }

  if (memoryGame) {
    const memoryStates = await collections.memoryStates();
    const state = await memoryStates.findOne({ teamId, challengeSlug: memoryGame.slug });
    if (!state?.completedAt) return "memory";
  }

  return "done";
}

export function phaseIndex(phase: Round1Phase): number {
  return phase === "done" ? 3 : PHASE_ORDER[phase];
}
