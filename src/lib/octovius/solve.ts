import { getConnections, modifierValueOf } from "./pieces";

/**
 * The circuit solver, server-side.
 *
 * A TypeScript port of `game_src/voltage.js`, kept behaviourally identical so
 * the browser and the grader always agree about whether a board is solved. It
 * exists separately because the original imports the drawing module and cannot
 * run outside a browser, and because a grader that asks the client whether it
 * won is not a grader.
 *
 * WHAT THE CLIENT IS ALLOWED TO DECIDE. Only where it put its own tiles. The
 * level — grid size, source voltage, fixed modifiers, x-blocks, end nodes, the
 * target — comes from the server's own level table, and each tile's connections
 * and modifier value are derived from its type here rather than read off the
 * submission. A player can send any arrangement of pieces; they cannot send a
 * piece that behaves differently from the one in the box.
 */

/** Row/col deltas, clockwise from the top: 0 up, 1 right, 2 down, 3 left. */
const DIR_DELTA: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

export interface FixedTile {
  row: number;
  col: number;
  kind: "source" | "endnode" | "modifier" | "xblock";
  /** modifier only: how much it shifts the voltage. */
  value?: number;
  /** source only: the voltage it emits. */
  voltage?: number;
  /** modifier only: which edges it accepts. Absent means all four. */
  connections?: number[];
}

export interface Level {
  id: number;
  name: string;
  rows: number;
  cols: number;
  targetVoltage: number;
  fixedTiles: FixedTile[];
}

/** One tile the player placed. Everything else about it is looked up, not sent. */
export interface PlacedPiece {
  row: number;
  col: number;
  type: string;
  rotation: number;
}

interface Cell {
  kind: "source" | "endnode" | "modifier" | "xblock" | "piece";
  value: number;
  voltage: number;
  connections?: number[];
  type: string;
  rotation: number;
}

export interface SolveResult {
  voltage: number;
  connected: boolean;
  endNodeReached: boolean;
  litCells: Set<string>;
}

function cellAt(
  placed: Map<string, PlacedPiece>,
  level: Level,
  row: number,
  col: number
): Cell | null {
  const fixed = level.fixedTiles.find((t) => t.row === row && t.col === col);
  if (fixed) {
    return {
      kind: fixed.kind,
      value: fixed.value ?? 0,
      voltage: fixed.voltage ?? 0,
      connections: fixed.connections,
      type: `_${fixed.kind.toUpperCase()}`,
      rotation: 0,
    };
  }

  // A player tile may not sit on top of a fixed one — the lookup above wins, so
  // submitting a piece at the source's coordinates changes nothing.
  const p = placed.get(`${row},${col}`);
  if (!p) return null;
  return { kind: "piece", value: 0, voltage: 0, type: p.type, rotation: p.rotation };
}

function opensToward(cell: Cell | null, dir: number): boolean {
  if (!cell) return false;
  if (cell.kind === "xblock") return false;
  // Source and end nodes accept a connection from any side.
  if (cell.kind === "source" || cell.kind === "endnode") return true;
  if (cell.kind === "modifier") return (cell.connections ?? [0, 1, 2, 3]).includes(dir);
  return getConnections(cell.type, cell.rotation).includes(dir);
}

function canConnect(a: Cell | null, b: Cell | null, dirAtoB: number): boolean {
  if (a?.kind === "xblock" || b?.kind === "xblock") return false;
  const dirBtoA = (dirAtoB + 2) % 4;
  return opensToward(a, dirAtoB) && opensToward(b, dirBtoA);
}

/**
 * Trace the circuit from the source, breadth-first, applying modifiers.
 *
 * X-blocks are walls: marked visited on sight so the search does not keep
 * re-testing them, but never entered.
 */
export function solveCircuit(pieces: PlacedPiece[], level: Level): SolveResult {
  const { rows, cols } = level;
  const placed = new Map(pieces.map((p) => [`${p.row},${p.col}`, p]));

  const source = level.fixedTiles.find((t) => t.kind === "source");
  if (!source) {
    return { voltage: 0, connected: false, endNodeReached: false, litCells: new Set() };
  }

  const endNodes = level.fixedTiles.filter((t) => t.kind === "endnode");
  const startKey = `${source.row},${source.col}`;

  const visited = new Set<string>([startKey]);
  const litCells = new Set<string>([startKey]);
  const queue: Array<{ row: number; col: number }> = [{ row: source.row, col: source.col }];
  let voltage = source.voltage ?? 0;

  while (queue.length > 0) {
    const { row, col } = queue.shift()!;
    const cell = cellAt(placed, level, row, col);
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      const [dr, dc] = DIR_DELTA[dir];
      const nr = row + dr;
      const nc = col + dc;
      const key = `${nr},${nc}`;

      if (visited.has(key)) continue;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

      const neighbour = cellAt(placed, level, nr, nc);
      if (!neighbour) continue;

      if (neighbour.kind === "xblock") {
        visited.add(key);
        continue;
      }

      if (!canConnect(cell, neighbour, dir)) continue;

      visited.add(key);
      litCells.add(key);
      queue.push({ row: nr, col: nc });

      if (neighbour.kind === "modifier") {
        voltage += neighbour.value;
      } else if (neighbour.kind === "piece") {
        // Derived from the type, never taken from the submission.
        voltage += modifierValueOf(neighbour.type);
      }
    }
  }

  return {
    voltage,
    connected: litCells.size > 1,
    endNodeReached: endNodes.length > 0 && endNodes.every((n) => litCells.has(`${n.row},${n.col}`)),
    litCells,
  };
}

/** The win condition, in one place so the grader and a test cannot disagree. */
export function isSolved(pieces: PlacedPiece[], level: Level): boolean {
  const r = solveCircuit(pieces, level);
  return r.connected && r.endNodeReached && r.voltage === level.targetVoltage;
}
