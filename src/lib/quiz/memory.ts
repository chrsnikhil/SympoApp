import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { appendScore } from "@/lib/score/ledger";
import type { Challenge, MemoryGameState } from "@/lib/db/types";

/**
 * Round 1, Game 2 — Memory Game.
 *
 * A flip-and-match grid themed on Spider Multiverse variants. The grid is
 * generated ONCE per team, server-side, at first request, and the client
 * never receives its contents up front — it asks to flip a cell by index and
 * the server answers with what was under it. This is the same "never let
 * something reach the browser that names its own answer" discipline the
 * platform's Connections game (dropped from this event, but the lesson stays)
 * was built around: an unflipped cell must carry nothing that gives away its
 * pair.
 *
 * SCORING FALLOFF — a documented default, not dictated by the rules doc (it
 * only gives the 16pt cap and "limited by a maximum flip count"), so it should
 * be confirmed with the event coordinator before the day:
 *   - `par`  = 2× the pair count — the fewest flips a team could need if every
 *     flip after the first of a pair immediately found its match.
 *   - `cap`  = 3× the pair count — the hard limit; hit it with pairs still
 *     unmatched and the grid locks, scoring zero.
 *   - Finishing at or under `par`: full marks.
 *   - Finishing between `par` and `cap`: linear falloff to a 30% floor.
 *   - Not finishing by `cap`: zero.
 */

const DEFAULT_PAIRS = 8;
const FLOOR_FRACTION = 0.3;

/** Eight Spider-Verse variants — text tokens only; the client maps these to
 *  colour/label, no external art required. */
export const VARIANT_TOKENS = [
  "spider-man",
  "miles",
  "gwen",
  "miguel",
  "hobie",
  "noir",
  "pavitr",
  "peni",
] as const;

function parCapFor(pairs: number): { par: number; cap: number } {
  return { par: pairs * 2, cap: pairs * 3 };
}

function shuffledGrid(pairCount: number): string[] {
  const tokens = VARIANT_TOKENS.slice(0, pairCount);
  const deck = [...tokens, ...tokens];
  // Fisher-Yates with a CSPRNG — same fairness bar as the rest of the platform's rolls.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Team-visible projection: counts and revealed/matched cell CONTENTS only —
 *  never the grid, so an unflipped cell tells the client nothing. */
export interface MemoryPublicState {
  slug: string;
  totalCells: number;
  flipsUsed: number;
  flipCap: number;
  matched: Array<{ index: number; token: string }>;
  revealed: Array<{ index: number; token: string }>;
  completedAt: string | null;
  scoredPoints: number | null;
}

function toPublic(state: MemoryGameState): MemoryPublicState {
  return {
    slug: state.challengeSlug,
    totalCells: state.grid.length,
    flipsUsed: state.flipsUsed,
    flipCap: state.flipCap,
    matched: state.matched.map((i) => ({ index: i, token: state.grid[i] })),
    revealed: state.revealed.map((i) => ({ index: i, token: state.grid[i] })),
    completedAt: state.completedAt ? state.completedAt.toISOString() : null,
    scoredPoints: state.scoredPoints,
  };
}

/** Get-or-create a team's memory game state. Reload-safe: never regenerates
 *  an existing grid. */
export async function getOrCreateMemoryState(teamId: ObjectId, challenge: Challenge): Promise<MemoryPublicState> {
  const states = await collections.memoryStates();
  const existing = await states.findOne({ teamId, challengeSlug: challenge.slug });
  if (existing) return toPublic(existing);

  const pairs = challenge.config.memoryPairs ?? DEFAULT_PAIRS;
  const { cap } = parCapFor(pairs);
  const flipCap = challenge.config.memoryFlipCap ?? cap;

  const fresh: MemoryGameState = {
    teamId,
    challengeSlug: challenge.slug,
    servedAt: new Date(),
    grid: shuffledGrid(pairs),
    revealed: [],
    matched: [],
    flipsUsed: 0,
    flipCap,
    completedAt: null,
    scoredPoints: null,
  };

  try {
    await states.insertOne(fresh);
    return toPublic(fresh);
  } catch {
    const won = await states.findOne({ teamId, challengeSlug: challenge.slug });
    if (won) return toPublic(won);
    throw new Error(`Could not create memory state for ${challenge.slug}`);
  }
}

export type FlipResult =
  | { ok: true; state: MemoryPublicState; matched: boolean | null }
  | { ok: false; reason: "not-started" | "completed" | "cap-reached" | "already-face-up" | "bad-index" };

/**
 * Flip one cell. Turn logic: the first flip of a turn just reveals; the
 * second flip resolves the pair (match → locked face-up, no match → both
 * flip back down on the NEXT flip request, mirroring how a physical memory
 * game works — the mismatch is shown once, then cleared).
 */
export async function flipCell(teamId: ObjectId, challenge: Challenge, cellIndex: number): Promise<FlipResult> {
  const states = await collections.memoryStates();
  const state = await states.findOne({ teamId, challengeSlug: challenge.slug });
  if (!state) return { ok: false, reason: "not-started" };
  if (state.completedAt) return { ok: false, reason: "completed" };
  if (cellIndex < 0 || cellIndex >= state.grid.length) return { ok: false, reason: "bad-index" };
  if (state.matched.includes(cellIndex)) return { ok: false, reason: "already-face-up" };

  // A pending mismatch from the previous turn clears on this flip, before
  // anything else is evaluated.
  let revealed = state.revealed.length === 2 ? [] : state.revealed;
  if (revealed.includes(cellIndex)) return { ok: false, reason: "already-face-up" };

  if (state.flipsUsed >= state.flipCap) return { ok: false, reason: "cap-reached" };

  revealed = [...revealed, cellIndex];
  const flipsUsed = state.flipsUsed + 1;
  let matched = state.matched;
  let matchedThisTurn: boolean | null = null;

  if (revealed.length === 2) {
    const [a, b] = revealed;
    if (state.grid[a] === state.grid[b]) {
      matched = [...matched, a, b];
      matchedThisTurn = true;
      revealed = []; // a matched pair locks immediately, nothing left pending
    } else {
      matchedThisTurn = false; // stays revealed until the NEXT flip clears it
    }
  }

  const completed = matched.length === state.grid.length;
  const now = new Date();

  let scoredPoints = state.scoredPoints;
  if (completed && scoredPoints === null) {
    scoredPoints = scoreMemory(challenge.points, state.grid.length / 2, flipsUsed);
    if (scoredPoints > 0) {
      await appendScore({
        teamId,
        event: "quiz",
        points: scoredPoints,
        reason: `quiz:${challenge.slug}`,
        at: now,
      });
    }
  } else if (!completed && flipsUsed >= state.flipCap) {
    // Cap exhausted with pairs still unmatched: locked at zero, permanently.
    scoredPoints = 0;
  }

  await states.updateOne(
    { _id: state._id },
    {
      $set: {
        revealed,
        matched,
        flipsUsed,
        completedAt: completed ? now : flipsUsed >= state.flipCap ? now : null,
        scoredPoints,
      },
    }
  );

  const updated = await states.findOne({ _id: state._id });
  return { ok: true, state: toPublic(updated!), matched: matchedThisTurn };
}

/** See the module doc comment for the falloff rationale. */
export function scoreMemory(fullPoints: number, pairs: number, flipsUsedAtCompletion: number): number {
  const { par, cap } = parCapFor(pairs);
  const floor = Math.round(fullPoints * FLOOR_FRACTION);

  if (flipsUsedAtCompletion <= par) return fullPoints;
  if (flipsUsedAtCompletion > cap) return 0;

  const span = cap - par;
  const over = flipsUsedAtCompletion - par;
  return Math.round(fullPoints - (fullPoints - floor) * (over / span));
}
