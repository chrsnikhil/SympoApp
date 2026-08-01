import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { Challenge } from "@/lib/db/types";

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
async function connectionsCleared(teamId: ObjectId, challenge: Challenge, now: Date): Promise<boolean> {
  if (challenge.closesAt && now > challenge.closesAt) return true;

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

/** The specific puzzle a team is currently on, or null once every puzzle in the sequence has been cleared. */
export async function currentConnectionsPuzzle(
  teamId: ObjectId,
  games: Challenge[],
  now: Date = new Date()
): Promise<Challenge | null> {
  const puzzles = connectionsPuzzles(games);
  for (const puzzle of puzzles) {
    if (!(await connectionsCleared(teamId, puzzle, now))) return puzzle;
  }
  return null;
}

export async function round1Phase(teamId: ObjectId, games: Challenge[], now: Date = new Date()): Promise<Round1Phase> {
  const imageGame = games.find((g) => g.config.format === "prompt-image");
  const memoryGame = games.find((g) => g.config.format === "memory");
  const puzzles = connectionsPuzzles(games);

  const stateCol = await collections.quizState();
  const quizState = await stateCol.findOne({ _id: "quiz" });
  const round1Start = quizState?.round1StartedAt ?? quizState?.startedAt;

  if (imageGame) {
    const isClosedGlobal = imageGame.closesAt ? now > imageGame.closesAt : false;
    const startMs = imageGame.opensAt
      ? new Date(imageGame.opensAt).getTime()
      : round1Start
        ? new Date(round1Start).getTime()
        : 0;
    const DEFAULT_IMAGE_DURATION_MS = 270_000; // 4.5 minutes
    const isTimedOut = startMs > 0 ? now.getTime() - startMs >= DEFAULT_IMAGE_DURATION_MS : false;

    if (!isClosedGlobal && !isTimedOut) {
      return "image";
    }
  }

  if (puzzles.length > 0) {
    const current = await currentConnectionsPuzzle(teamId, games, now);
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
