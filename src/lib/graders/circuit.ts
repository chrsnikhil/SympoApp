import { collections } from "@/lib/db/client";
import { LEVELS } from "@/lib/octovius/levels";
import { solveCircuit, type PlacedPiece } from "@/lib/octovius/solve";
import type { GradeInput, GradeResult } from "./types";

/**
 * OCTAVIUS CIRCUIT — the server rebuilds the circuit and decides.
 *
 * The version this replaces did:
 *
 *     data = JSON.parse(payload);
 *     if (data.voltage !== data.targetVoltage) return wrong;
 *
 * Both numbers came out of the same client payload, so the grader was asking
 * the browser whether the browser had won. A hand-written request carrying
 * `{"voltage":0,"targetVoltage":0}` scored full points without the game ever
 * being loaded, and the file's own header admitted it trusted the client.
 *
 * Now the payload carries only the tiles a player placed. The level — grid
 * size, source voltage, fixed modifiers, x-blocks, end nodes and the target —
 * comes from LEVELS on the server, and each tile's connections and modifier
 * value are derived from its type rather than read off the submission. The
 * strongest thing a forged request can now claim is an arrangement of real
 * tiles, which either completes the circuit or does not.
 */

const MAX_PIECES = 200;

interface Submitted {
  levelId?: unknown;
  pieces?: unknown;
}

/** Accept only what the solver needs, and only in the shape it expects. */
function parsePieces(raw: unknown): PlacedPiece[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PIECES) return null;
  const out: PlacedPiece[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) return null;
    const { row, col, type, rotation } = p as Record<string, unknown>;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    if (typeof type !== "string" || type.length > 32) return null;
    if (!Number.isInteger(rotation)) return null;
    out.push({ row: row as number, col: col as number, type, rotation: rotation as number });
  }
  return out;
}

/**
 * Did the player use only tiles they were actually given?
 *
 * The inventory is part of the puzzle — several levels hand out decoy modifiers
 * precisely so the wrong ones are tempting. Without this a submission could
 * place fifty of whichever tile makes the arithmetic work, which is a different
 * (and much easier) game than the one on screen.
 */
function withinInventory(
  pieces: PlacedPiece[],
  inventory: Array<{ type: string; count: number }>
): boolean {
  const allowed = new Map(inventory.map((i) => [i.type, i.count]));
  const used = new Map<string, number>();
  for (const p of pieces) used.set(p.type, (used.get(p.type) ?? 0) + 1);
  for (const [type, n] of used) {
    if (n > (allowed.get(type) ?? 0)) return false;
  }
  return true;
}

export async function gradeCircuit(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;
  const progress = await collections.huntProgress();

  const current = await progress.findOne({ teamId, challengeSlug: challenge.slug });
  if (!current) return { correct: false, points: 0, meta: { reason: "level-not-unlocked" } };
  if (current.solvedAt) return { correct: false, points: 0, meta: { reason: "already-solved" } };

  let body: Submitted;
  try {
    body = JSON.parse(payload) as Submitted;
  } catch {
    return { correct: false, points: 0, meta: { reason: "invalid-payload" } };
  }

  // The level is identified by the CHALLENGE, not by the payload. Taking it
  // from the submission would let a team send level 1's easy circuit against
  // level 5's points.
  const levelId = Number(challenge.config.levelId ?? NaN);
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) return { correct: false, points: 0, meta: { reason: "no-such-level" } };

  const pieces = parsePieces(body.pieces);
  if (!pieces) return { correct: false, points: 0, meta: { reason: "invalid-payload" } };
  if (!withinInventory(pieces, level.inventory)) {
    return { correct: false, points: 0, meta: { reason: "inventory-exceeded" } };
  }

  const result = solveCircuit(pieces, level);
  const won =
    result.connected && result.endNodeReached && result.voltage === level.targetVoltage;
  if (!won) {
    return { correct: false, points: 0, meta: { voltage: result.voltage } };
  }

  // Claim the solve, don't just record it — the same compare-and-swap the hunt
  // grader uses. Two correct submissions in flight at once (a double-tap on a
  // slow network, or a team on two phones) would otherwise both pass the read
  // above and both be paid.
  const claim = await progress.updateOne(
    { teamId, challengeSlug: challenge.slug, solvedAt: null },
    { $set: { solvedAt: input.receivedAt } }
  );
  if (claim.modifiedCount === 0) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  const hintCosts = challenge.config.hintCosts ?? [];
  const spent = hintCosts.slice(0, current.hintsUsed).reduce((a, b) => a + b, 0);

  const next = challenge.config.nextSlug;
  if (next) {
    await progress.updateOne(
      { teamId, challengeSlug: next },
      {
        $setOnInsert: {
          teamId,
          challengeSlug: next,
          unlockedAt: input.receivedAt,
          solvedAt: null,
          hintsUsed: 0,
        },
      },
      { upsert: true }
    );
  }

  return {
    correct: true,
    points: Math.max(0, challenge.points - spent),
    meta: { voltage: result.voltage, nextSlug: next ?? null },
  };
}
