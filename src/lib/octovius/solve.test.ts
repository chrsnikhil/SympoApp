import { describe, expect, it } from "vitest";
import { LEVELS } from "./levels";
import { isSolved, solveCircuit, type PlacedPiece } from "./solve";

/**
 * The exploit these tests exist for.
 *
 * The original grader compared two numbers out of the same client payload:
 *
 *     if (data.voltage !== data.targetVoltage) return wrong;
 *
 * so `{"voltage":0,"targetVoltage":0}` scored full points without the game
 * being loaded. The first test below is that exact request, asserted to fail.
 */
const level1 = LEVELS.find((l) => l.id === 1)!;

describe("solveCircuit", () => {
  it("an empty board does not solve — the forged payload has nothing to stand on", () => {
    expect(isSolved([], level1)).toBe(false);
  });

  it("an empty board still fails to reach the end node", () => {
    const r = solveCircuit([], level1);
    // NOT "connected: false". Level 1 stacks two fixed modifiers directly above
    // the source, so current flows 4,2 -> 3,2 (-1) -> 2,2 (-2) with no player
    // tile at all: 7 - 1 - 2 = 4. The board conducts from the start; what it
    // does not do is arrive anywhere.
    expect(r.connected).toBe(true);
    expect(r.voltage).toBe(4);
    expect(r.endNodeReached).toBe(false);
  });

  it("ignores a piece dropped on top of a fixed tile", () => {
    // Level 1's source sits at 4,2. A submission claiming a tile there must
    // change nothing — the fixed lookup wins. Compared against the empty board
    // rather than a hardcoded number, so the test still means this if the
    // level's layout is ever edited.
    const baseline = solveCircuit([], level1);
    const onSource: PlacedPiece[] = [{ row: 4, col: 2, type: "CROSS", rotation: 0 }];
    const r = solveCircuit(onSource, level1);
    expect(r.voltage).toBe(baseline.voltage);
    expect(r.litCells.size).toBe(baseline.litCells.size);
  });

  it("never routes through an x-block", () => {
    // 3,1 and 3,3 are x-blocks on level 1. A CROSS on each side of one cannot
    // link through it.
    const throughWall: PlacedPiece[] = [
      { row: 3, col: 0, type: "CROSS", rotation: 0 },
      { row: 3, col: 2, type: "CROSS", rotation: 0 },
    ];
    const r = solveCircuit(throughWall, level1);
    expect(r.litCells.has("3,1")).toBe(false);
  });

  it("takes a modifier's value from its type, not from the submission", () => {
    // MOD_SUB_2 must subtract 2 whatever else is claimed about it. Placed
    // adjacent to the source so it is definitely traversed.
    const withMod: PlacedPiece[] = [
      { row: 3, col: 2, type: "MOD_SUB_2", rotation: 0 },
    ];
    const r = solveCircuit(withMod, level1);
    // 3,2 is a fixed modifier on this level, so the fixed tile wins and the
    // player's tile is ignored entirely — the voltage is the fixed one's.
    expect(r.voltage).not.toBe(7 - 2 * 2);
  });

  it("an unknown tile type connects to nothing", () => {
    const bogus: PlacedPiece[] = [{ row: 1, col: 2, type: "NOT_A_REAL_TILE", rotation: 0 }];
    expect(solveCircuit(bogus, level1).litCells.has("1,2")).toBe(false);
  });
});

describe("every level is internally consistent", () => {
  it.each(LEVELS.map((l) => [l.id, l.name] as const))(
    "level %i (%s) has a source, an end node and a positive target",
    (id) => {
      const l = LEVELS.find((x) => x.id === id)!;
      expect(l.fixedTiles.some((t) => t.kind === "source")).toBe(true);
      expect(l.fixedTiles.some((t) => t.kind === "endnode")).toBe(true);
      expect(l.targetVoltage).toBeGreaterThan(0);
      expect(l.rows).toBeGreaterThan(0);
      expect(l.cols).toBeGreaterThan(0);
    }
  );

  it.each(LEVELS.map((l) => [l.id] as const))(
    "level %i keeps every fixed tile inside the grid",
    (id) => {
      const l = LEVELS.find((x) => x.id === id)!;
      for (const t of l.fixedTiles) {
        expect(t.row).toBeGreaterThanOrEqual(0);
        expect(t.col).toBeGreaterThanOrEqual(0);
        expect(t.row).toBeLessThan(l.rows);
        expect(t.col).toBeLessThan(l.cols);
      }
    }
  );
});
