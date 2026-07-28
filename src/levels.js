// ═══════════════════════════════════════════
// levels.js — Puzzle Level Definitions
// Level: "Overload Prevention" (Hard)
// ═══════════════════════════════════════════

export const LEVELS = [
  {
    id: 1,
    name: 'Overload Prevention',
    targetVoltage: 2,

    /*
      Board map (5×5, 0-indexed):

        Col:  0      1      2      3      4
      Row 0: [ ]    [ ]   [END]   [ ]    [ ]   ← reach this!
      Row 1: [-1]   [X]    [ ]    [X]   [-1]
      Row 2: [ ]    [ ]   [-2]    [ ]    [ ]
      Row 3: [ ]    [X]    [-1]   [X]    [ ]
      Row 4: [ ]    [ ]   [⚡7]   [ ]    [ ]

      Source emits 7. Target is 2. Must reach END node at (0,2).
      Need -5 total: -1@(3,2) -2@(2,2) -1@(1,0) -1@(1,4) = -5
      7 - 5 = 2  ✓

      One valid solution:
        (4,2)→(3,2)[-1=6]→(2,2)[-2=4]
        left:  (2,1)→(2,0)→(1,0)[-1=3]→(0,0)→(0,1)→(0,2)[END]
        right: (2,3)→(2,4)→(1,4)[-1=2]→(0,4)→(0,3)→(0,2)[END]  ✓
    */

    // End node — circuit must reach this tile AND voltage must match
    endNode: { row: 0, col: 2 },

    fixedTiles: [
      // Power source
      { row: 4, col: 2, kind: 'source',   voltage: 7 },

      // End node (destination)
      { row: 0, col: 2, kind: 'endnode' },

      // Voltage modifiers
      { row: 3, col: 2, kind: 'modifier', value: -1 },
      { row: 2, col: 2, kind: 'modifier', value: -2 },
      { row: 1, col: 0, kind: 'modifier', value: -1 },
      { row: 1, col: 4, kind: 'modifier', value: -1 },

      // X-Blockers
      { row: 1, col: 1, kind: 'xblock' },
      { row: 1, col: 3, kind: 'xblock' },
      { row: 3, col: 1, kind: 'xblock' },
      { row: 3, col: 3, kind: 'xblock' },
    ],

    // Player inventory — limited, requires planning
    inventory: [
      // LEFT PANEL
      { type: 'STRAIGHT_V',  count: 3, panel: 'left'  },
      { type: 'CORNER_LT',   count: 2, panel: 'left'  },
      { type: 'T_LRB',       count: 1, panel: 'left'  },
      { type: 'CROSS',       count: 1, panel: 'left'  },

      // RIGHT PANEL
      { type: 'STRAIGHT_H',  count: 4, panel: 'right' },
      { type: 'CORNER_TR',   count: 2, panel: 'right' },
      { type: 'CORNER_RB',   count: 1, panel: 'right' },
      { type: 'LOOP',        count: 1, panel: 'right' },
    ],
  },
];
