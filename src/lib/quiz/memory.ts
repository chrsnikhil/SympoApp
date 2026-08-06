import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { appendScore } from "@/lib/score/ledger";
import type { Challenge, MemoryGameState } from "@/lib/db/types";

const DEFAULT_PAIRS = 8;
const DEFAULT_FLIP_CAP = 14; // Maximum allowed flips: 14

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

function shuffledGrid(pairCount: number): string[] {
  const tokens = VARIANT_TOKENS.slice(0, pairCount);
  const deck = [...tokens, ...tokens];
  // Fisher-Yates with CSPRNG — randomizes card positions every game
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

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

export async function getOrCreateMemoryState(teamId: ObjectId, challenge: Challenge): Promise<MemoryPublicState> {
  const states = await collections.memoryStates();
  const existing = await states.findOne({ teamId, challengeSlug: challenge.slug });
  if (existing) return toPublic(existing);

  const pairs = challenge.config.memoryPairs ?? DEFAULT_PAIRS;
  const flipCap = challenge.config.memoryFlipCap ?? DEFAULT_FLIP_CAP;

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
  | { ok: true; state: MemoryPublicState; matched: boolean | null; mismatchInfo?: Array<{ index: number; token: string }> }
  | { ok: false; reason: "not-started" | "completed" | "cap-reached" | "already-face-up" | "bad-index" };

export function completionBonusForRank(rank: number): number {
  if (rank === 1) return 6;
  if (rank === 2) return 5;
  if (rank === 3) return 4;
  if (rank === 4) return 3;
  if (rank === 5) return 2;
  return 1;
}

export async function flipCell(teamId: ObjectId, challenge: Challenge, cellIndex: number): Promise<FlipResult> {
  const states = await collections.memoryStates();
  const state = await states.findOne({ teamId, challengeSlug: challenge.slug });
  if (!state) return { ok: false, reason: "not-started" };
  if (state.completedAt) return { ok: false, reason: "completed" };
  if (cellIndex < 0 || cellIndex >= state.grid.length) return { ok: false, reason: "bad-index" };
  if (state.matched.includes(cellIndex)) return { ok: false, reason: "already-face-up" };

  let revealed = state.revealed.length === 2 ? [] : state.revealed;
  if (revealed.includes(cellIndex)) return { ok: false, reason: "already-face-up" };

  const flipCap = challenge.config.memoryFlipCap ?? DEFAULT_FLIP_CAP;
  if (state.flipsUsed >= flipCap) return { ok: false, reason: "cap-reached" };

  revealed = [...revealed, cellIndex];

  // Selecting two cards counts as 1 flip (flipsUsed increments on 2nd card selection)
  const flipsUsed = revealed.length === 2 ? state.flipsUsed + 1 : state.flipsUsed;
  let matched = state.matched;
  let matchedThisTurn: boolean | null = null;
  let mismatchInfo: Array<{ index: number; token: string }> | undefined;

  if (revealed.length === 2) {
    const [a, b] = revealed;
    if (state.grid[a] === state.grid[b]) {
      matched = [...matched, a, b];
      matchedThisTurn = true;
      revealed = []; // matched pair locks face-up
    } else {
      matchedThisTurn = false;
      mismatchInfo = [
        { index: a, token: state.grid[a] },
        { index: b, token: state.grid[b] },
      ];
      revealed = []; // clear DB revealed so client 3D flips back down after 1s
    }
  }

  const totalPairs = state.grid.length / 2;
  const matchedPairs = matched.length / 2;
  const completed = matchedPairs === totalPairs;
  const capExhausted = flipsUsed >= flipCap && revealed.length === 0 && !completed;
  const now = new Date();

  let scoredPoints = state.scoredPoints;

  if ((completed || capExhausted) && scoredPoints === null) {
    if (completed) {
      // Atomic "next rank please" among teams that complete all pairs — see
      // `RankCounter` in db/types.ts. A countDocuments-then-award here would
      // let two teams finishing in the same instant both read the same
      // count and both get the same completion-order bonus.
      const counters = await collections.rankCounters();
      const counter = await counters.findOneAndUpdate(
        { _id: `memory:${challenge.slug}` },
        { $inc: { count: 1 } },
        { upsert: true, returnDocument: "after" }
      );
      const rank = counter!.count;
      const bonus = completionBonusForRank(rank);
      scoredPoints = totalPairs * 2 + bonus; // (8 * 2) + bonus
    } else {
      // Unfinished when cap reached: base score only (2 pts per matched pair)
      scoredPoints = matchedPairs * 2;
    }

    if (scoredPoints > 0) {
      await appendScore({
        teamId,
        event: "quiz",
        points: scoredPoints,
        reason: `quiz:${challenge.slug}`,
        at: now,
      });
    }
  }

  await states.updateOne(
    { _id: state._id },
    {
      $set: {
        revealed,
        matched,
        flipsUsed,
        completedAt: completed ? now : capExhausted ? now : null,
        scoredPoints,
      },
    }
  );

  const updated = await states.findOne({ _id: state._id });
  return { ok: true, state: toPublic(updated!), matched: matchedThisTurn, mismatchInfo };
}
