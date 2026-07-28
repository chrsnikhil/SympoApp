// ═══════════════════════════════════════════
// voltage.js — Circuit Solver (BFS)
// Traces electricity from source through
// connected pieces, applying modifiers.
// X-blocks are IMPASSABLE — electricity
// cannot flow through them.
// ═══════════════════════════════════════════

import { getConnections } from './pieces.js';

const GRID_SIZE = 5;

// Direction vectors: [row delta, col delta]
const DIR_DELTA = [
  [-1, 0],  // 0: top
  [0,  1],  // 1: right
  [1,  0],  // 2: bottom
  [0, -1],  // 3: left
];

/**
 * Solve the circuit using BFS from the source tile.
 * Returns: { voltage, litCells, connected, modifiersHit }
 */
export function solveCircuit(grid, level) {
  const sourceFixed = level.fixedTiles.find(t => t.kind === 'source');
  if (!sourceFixed) return { voltage: 0, litCells: new Set(), connected: false, modifiersHit: [], endNodeReached: false };

  const { row: sr, col: sc, voltage: sourceVoltage } = sourceFixed;

  // Find end node position
  const endFixed = level.fixedTiles.find(t => t.kind === 'endnode');
  const endKey   = endFixed ? `${endFixed.row},${endFixed.col}` : null;

  const visited      = new Set();
  const queue        = [{ row: sr, col: sc }];
  const litCells     = new Set([`${sr},${sc}`]);
  const modifiersHit = [];
  let voltage = sourceVoltage;

  visited.add(`${sr},${sc}`);

  while (queue.length > 0) {
    const { row, col } = queue.shift();
    const cell = getCellAt(grid, level, row, col);
    if (!cell) continue;

    for (let dir = 0; dir < 4; dir++) {
      const [dr, dc] = DIR_DELTA[dir];
      const nr  = row + dr;
      const nc  = col + dc;
      const key = `${nr},${nc}`;

      if (visited.has(key)) continue;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;

      const neighbor = getCellAt(grid, level, nr, nc);
      if (!neighbor) continue;

      // ⛔ X-blocks are hard walls — NEVER passable
      if (neighbor.kind === 'xblock') {
        visited.add(key); // mark visited so we don't re-check
        continue;
      }

      if (canConnect(cell, neighbor, dir)) {
        visited.add(key);
        litCells.add(key);
        queue.push({ row: nr, col: nc });

        if (neighbor.kind === 'modifier') {
          voltage += neighbor.value;
          modifiersHit.push({ row: nr, col: nc, value: neighbor.value });
        }
      }
    }
  }

  return {
    voltage,
    litCells,
    connected:       litCells.size > 1,
    modifiersHit,
    endNodeReached:  endKey ? litCells.has(endKey) : false,
  };
}

/**
 * Build a cell descriptor from fixed tiles or the player grid
 */
function getCellAt(grid, level, row, col) {
  const fixed = level.fixedTiles.find(t => t.row === row && t.col === col);
  if (fixed) {
    return {
      kind:    fixed.kind,
      value:   fixed.value   || 0,
      voltage: fixed.voltage || 0,
      type:    fixed.kind === 'source'   ? '_SOURCE'
             : fixed.kind === 'modifier' ? '_MODIFIER'
             : fixed.kind === 'endnode'  ? '_ENDNODE'
             : '_XBLOCK',
      rotation: 0,
      isFixed:  true,
    };
  }

  const cell = grid[row]?.[col];
  if (cell && cell.type) return { ...cell, kind: 'piece' };

  return null;
}

/**
 * Can cell A connect to cell B in direction dirAtoB?
 * Both cells must have matching open connections.
 */
function canConnect(cellA, cellB, dirAtoB) {
  // X-blocks never connect
  if (cellA?.kind === 'xblock' || cellB?.kind === 'xblock') return false;

  const dirBtoA = (dirAtoB + 2) % 4;
  return getEffectiveConnections(cellA, dirAtoB)
      && getEffectiveConnections(cellB, dirBtoA);
}

function getEffectiveConnections(cell, dir) {
  if (!cell) return false;
  if (cell.kind === 'xblock') return false;
  // Source, modifier, and endnode fixed tiles accept connections from ALL 4 directions
  if (cell.isFixed) return true;
  // Player-placed pieces: check rotation-aware connection map
  return getConnections(cell.type, cell.rotation).includes(dir);
}
