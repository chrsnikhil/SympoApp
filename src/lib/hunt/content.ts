import { CODES } from "./codes";

/**
 * All four puzzles' content in one file so coordinators can reword without
 * reading any other code. Nothing here is imported by a client component
 * except through the seed and the shell — the reveal CODES must not reach the
 * browser inside a challenge document.
 */
export const HUNT_SLUGS = [
  "hunt-cipher",
  "hunt-grid",
  "hunt-circuit",
  "hunt-room",
  "hunt-universe",
  // The Octavius Circuit ships as five levels, each its own challenge so a team
  // is paid per level and hunt_progress can gate them in order. "hunt-circuit"
  // above is the old single-slug placeholder and stays seeded but unplayable.
  "circuit-1",
  "circuit-2",
  "circuit-3",
  "circuit-4",
  "circuit-5",
] as const;
export type HuntSlug = (typeof HUNT_SLUGS)[number];

/**
 * The puzzles a team can actually play today.
 *
 * `HUNT_SLUGS` is the full set the seed writes and the graders answer for.
 * Only some of them have a component built: the rest render PlaceholderPuzzle,
 * a "Coming Soon" card with nothing to interact with. They were still unlocked
 * and still worth 100 points each, so a team saw four tiles and could solve
 * one — which reads as three broken puzzles, not three unfinished ones.
 *
 * Listing them here rather than deleting them from the seed keeps the content
 * and the answer hashes in place, so shipping one is adding its slug back to
 * this line once its component exists. Keep it in sync with REGISTRY in
 * `src/app/hunt/registry.tsx`, which is the client-side half of the same fact —
 * it cannot be imported here because it pulls in React components, and this
 * module is used by route handlers.
 */
export const PLAYABLE_HUNT_SLUGS = ["hunt-universe", "hunt-room", "circuit-1"] as const satisfies readonly HuntSlug[];

/**
 * Puzzles that live at their own route instead of rendering inside HuntShell.
 *
 * The universe is a multi-step flow across four pages — pick your number, work
 * the colour equations, reveal your universe, unscramble its word — not a
 * component that fits in a card next to an answer box. The hunt lists it and
 * links to it; the flow submits through /api/submit like every other puzzle, so
 * scoring, hint costs and the leaderboard are unchanged.
 */
export const PUZZLE_HREFS: Partial<Record<HuntSlug, string>> = {
  "hunt-universe": "/universe",
};

export const CIPHER = {
  plaintext: "the spider waits where the last light falls code websling",
  shiftBy: 7,
  code: CODES.cipher,
};

export const GRID = {
  // Eight real words so no group visibly stands out as "the answer group".
  words: [
    "spiderly", "webbings", "villains", "symbiote",
    "multiver", "gwenpool", "octopusx", "daybugle",
  ],
  seed: 20260728,
  // All three are one-step arithmetic on universally-known facts —
  // answerable from general knowledge alone.
  // content.test.ts asserts these numbers actually sum to targetColour mod 8.
  equations: [
    "Legs on a spider, minus 2",
    "Wheels on a bicycle, plus 3",
    "Eyes on a typical spider, divided by 2",
  ],
  answers: [6, 5, 4],
  // (6 + 5 + 4) mod 8 = 7 -> colour index 7 -> "daybugle"
  targetColour: 7,
  code: CODES.grid,
};

export const CIRCUIT = {
  board: {
    w: 4,
    h: 3,
    tiles: [],
  },
  seed: 4821,
  code: CODES.circuit,
};

export const ROOM = {
  clues: ["AR", "CH", "IV", "ES", "88"],
  code: CODES.room,
};

export const HINTS: Record<HuntSlug, [string, string]> = {
  "hunt-universe": [
    "Substitute your own universe index for n — the number the reveal page shows you — and take each channel mod 256.",
    "The highlighted cells are the right letters in the wrong order. It is an anagram, not a straight read.",
  ],
  "hunt-cipher": [
    "Every letter moved the same distance down the alphabet.",
    "The shift is a single digit, and it is odd.",
  ],
  "hunt-grid": [
    "Solve all three equations, then add the results together.",
    "Take that total modulo 8 — the remainder is the colour's position.",
  ],
  "hunt-circuit": [
    "Work backwards from the sink, not forwards from the source.",
    "One tile in the middle column only ever needs a half turn.",
  ],
  "circuit-1": [
    "Work backwards from the end node, not forwards from the source — only one route into it fits.",
    "The inventory contains decoys. Count what the modifiers do to the source voltage before placing any of them.",
  ],
  "circuit-2": [
    "The relay splits: a T-junction is doing work a corner cannot.",
    "Add up every modifier on your route before you commit — overshooting the target is the usual mistake.",
  ],
  "circuit-3": [
    "The x-blocks force one corridor. Find it first, then worry about voltage.",
    "A decoy modifier that gets you to the target by the wrong route still fails — the end node has to be lit.",
  ],
  "circuit-4": [
    "Containment means the circuit has to arrive at exactly the target, not below it.",
    "If you are one off, you have used a decoy: check the sign on every modifier you placed.",
  ],
  "circuit-5": [
    "Two modifiers cancel. Finding which pair saves you most of the board.",
    "The core needs the full path lit — a circuit that hits the number but stops short of the end node scores nothing.",
  ],
  "hunt-room": [
    "All five objects are somewhere in front of you — drag to look left and right, and check up on the walls as well as down near the floor.",
    "You don't have to remember the order you found them in — once all five are picked up, the code fills in the answer box for you.",
  ],
};
