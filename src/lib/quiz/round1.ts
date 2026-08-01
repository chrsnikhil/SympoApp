import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { Challenge } from "@/lib/db/types";
import { getCachedQuizState } from "./rounds";

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
 * Whether the team has cleared a given connections puzzle — either they
 * solved it, or the coordinator closed it out from under them. Either way
 * they move on; getting permanently stuck on one puzzle would take the rest
 * of Round 1 down with it.
 */
async function connectionsCleared(
  teamId: ObjectId,
  challenge: Challenge,
  now: Date,
  teamSubmissions?: any[]
): Promise<boolean> {
  if (challenge.closesAt && now > challenge.closesAt) return true;

  if (teamSubmissions) {
    const solved = teamSubmissions.some(
      (s) => String(s.challengeId) === String(challenge._id) && s.status === "done" && s.verdict?.correct
    );
    if (solved) return true;

    const timedOut = teamSubmissions.some(
      (s) => String(s.challengeId) === String(challenge._id) && s.payload === "__timeout__"
    );
    if (timedOut) return true;

    const totalImages = challenge.config.connectionsImages?.length ?? 4;
    const attemptsCount = teamSubmissions.filter(
      (s) => String(s.challengeId) === String(challenge._id)
    ).length;
    if (attemptsCount >= totalImages) return true;

    return false;
  }

  const subs = await collections.submissions();
  const solved = await subs.findOne({
    challengeId: challenge._id,
    teamId,
    status: "done",
    "verdict.correct": true,
  });
  if (solved) return true;

  const timedOut = await subs.findOne({
    challengeId: challenge._id,
    teamId,
    payload: "__timeout__",
  });
  if (timedOut) return true;

  const totalImages = challenge.config.connectionsImages?.length ?? 4;
  const attemptsCount = await subs.countDocuments({ challengeId: challenge._id, teamId });
  if (attemptsCount >= totalImages) return true;

  return false;
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

  // The latest puzzle opened by the coordinator on stage (e.g. Puzzle 1, Puzzle 2, etc.)
  const latestOpened = openedPuzzles[openedPuzzles.length - 1];

  // If Puzzle 5 (the last puzzle) has been closed globally, advance to Game 3 Memory!
  const isLastPuzzle = latestOpened.slug === puzzles[puzzles.length - 1].slug;
  if (isLastPuzzle && latestOpened.closesAt && now > latestOpened.closesAt) {
    return null;
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
    const DEFAULT_IMAGE_DURATION_MS = 270_000; // 4.5 minutes (270 seconds)
    const isTimedOut = startMs > 0 ? now.getTime() - startMs >= DEFAULT_IMAGE_DURATION_MS : false;

    // Stay in Game 1 until: closed globally, timed out (4.5 mins), OR coordinator opens Connections
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
