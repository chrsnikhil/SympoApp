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
 */

export type Round1Phase = "image" | "connections" | "memory" | "done";

const PHASE_ORDER: Record<Exclude<Round1Phase, "done">, number> = {
  image: 0,
  connections: 1,
  memory: 2,
};

export function gameForPhase(games: Challenge[], phase: Round1Phase): Challenge | null {
  if (phase === "done") return null;
  const format = phase === "image" ? "prompt-image" : phase;
  return games.find((g) => g.config.format === format) ?? null;
}

/**
 * Whether the team has cleared the Connections phase — either they solved it,
 * or the coordinator closed the window on them. Either way they move on;
 * getting permanently stuck on one puzzle would take the rest of Round 1 down
 * with it.
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
  return !!solved;
}

export async function round1Phase(teamId: ObjectId, games: Challenge[], now: Date = new Date()): Promise<Round1Phase> {
  const imageGame = games.find((g) => g.config.format === "prompt-image");
  const connectionsGame = games.find((g) => g.config.format === "connections");
  const memoryGame = games.find((g) => g.config.format === "memory");

  if (imageGame) {
    const subs = await collections.submissions();
    const imageSubmitted = await subs.findOne({ challengeId: imageGame._id, teamId });
    if (!imageSubmitted) return "image";
  }

  if (connectionsGame) {
    const cleared = await connectionsCleared(teamId, connectionsGame, now);
    if (!cleared) return "connections";
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
