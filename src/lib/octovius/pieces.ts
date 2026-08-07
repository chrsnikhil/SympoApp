/**
 * Which edges each circuit tile connects, at each rotation.
 *
 * A server-side copy of the piece table from `game_src/pieces.js`, holding the
 * connection data and nothing else — that file is 974 lines of which ~900 are
 * canvas drawing, and none of it can be imported here.
 *
 * The duplication is deliberate and is the point. The grader has to know what a
 * tile connects to in order to recompute a circuit itself; if it asked the
 * browser, the answer would be whatever the browser felt like saying, which is
 * how the original scored full points for a hand-written curl. These fifteen
 * rows are the authority, and `game_src/pieces.js` is the copy that draws them.
 *
 * KEEP THE TWO IN STEP. Adding a tile type means adding it in both places;
 * `solveCircuit` treats an unknown type as connecting to nothing, so a tile
 * present in the game and missing here is unsolvable rather than exploitable —
 * the safe direction to fail, but still a bug.
 *
 * Directions are indices, clockwise from the top: 0 = up, 1 = right, 2 = down,
 * 3 = left. `rotations[r]` is the edge list after r quarter-turns.
 */
export const PIECE_TYPES: Record<string, { id: string; label: string; rotations: number[][] }> = {
  STRAIGHT_H:  { id: "STRAIGHT_H",  label: "Straight H", rotations: [[1, 3], [0, 2], [1, 3], [0, 2]] },
  STRAIGHT_V:  { id: "STRAIGHT_V",  label: "Straight V", rotations: [[0, 2], [1, 3], [0, 2], [1, 3]] },
  CORNER_TR:   { id: "CORNER_TR",   label: "Corner TR",  rotations: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  CORNER_RB:   { id: "CORNER_RB",   label: "Corner RB",  rotations: [[1, 2], [2, 3], [3, 0], [0, 1]] },
  CORNER_BL:   { id: "CORNER_BL",   label: "Corner BL",  rotations: [[2, 3], [3, 0], [0, 1], [1, 2]] },
  CORNER_LT:   { id: "CORNER_LT",   label: "Corner LT",  rotations: [[3, 0], [0, 1], [1, 2], [2, 3]] },
  T_LRB:       { id: "T_LRB",       label: "T-Junction", rotations: [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]] },
  LOOP:        { id: "LOOP",        label: "Loop",       rotations: [[1, 3], [0, 2], [1, 3], [0, 2]] },
  CROSS:       { id: "CROSS",       label: "Cross",      rotations: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]] },
  MOD_ADD_1:   { id: "MOD_ADD_1",   label: "+1 Mod",     rotations: [[1, 3], [0, 2], [1, 3], [0, 2]] },
  MOD_SUB_2:   { id: "MOD_SUB_2",   label: "-2 Mod",     rotations: [[1, 3], [0, 2], [1, 3], [0, 2]] },
  MOD_SUB_3:   { id: "MOD_SUB_3",   label: "-3 Mod",     rotations: [[1, 3], [0, 2], [1, 3], [0, 2]] },
  MOD_ADD_1_C: { id: "MOD_ADD_1_C", label: "+1 Corner",  rotations: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  MOD_SUB_1_C: { id: "MOD_SUB_1_C", label: "-1 Corner",  rotations: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  MOD_SUB_2_C: { id: "MOD_SUB_2_C", label: "-2 Corner",  rotations: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  MOD_SUB_3_C: { id: "MOD_SUB_3_C", label: "-3 Corner",  rotations: [[0, 1], [1, 2], [2, 3], [3, 0]] },
};

/** Edges this tile connects, after `rotation` quarter-turns. */
export function getConnections(pieceType: string, rotation: number): number[] {
  const type = PIECE_TYPES[pieceType];
  if (!type) return [];
  const idx = ((Math.round(rotation) % 4) + 4) % 4;
  return type.rotations[idx] ?? [];
}

/**
 * How much a placed tile changes the voltage passing through it.
 *
 * Derived from the type id rather than stored per tile, so a client cannot
 * submit a MOD_SUB_3 that claims to add 9. Plain wires are 0.
 */
export function modifierValueOf(pieceType: string): number {
  const m = /^MOD_(ADD|SUB)_(\d)(_C)?$/.exec(pieceType);
  if (!m) return 0;
  const magnitude = Number(m[2]);
  return m[1] === "ADD" ? magnitude : -magnitude;
}
