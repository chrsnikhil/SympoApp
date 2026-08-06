/**
 * The 8x8 colour grid.
 *
 * Eight colours, eight cells each, each colour's letters anagramming to one
 * word. All eight groups spell real words so the grid gives no clue which one
 * the equations will select — if only the target group were a word, a team
 * could skip the equations entirely by looking for the group that reads.
 */
export const GRID_COLOURS = [
  "#e63946", "#f4a261", "#e9c46a", "#2a9d8f",
  "#4361ee", "#7209b7", "#f72585", "#d8e2dc",
] as const;

export interface GridCell {
  letter: string;
  colour: number;
}

/** Mulberry32 — small deterministic PRNG so a seed always rebuilds the same grid. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildGrid(words: string[], seed: number): GridCell[] {
  if (words.length !== GRID_COLOURS.length) {
    throw new Error(`buildGrid needs exactly ${GRID_COLOURS.length} words, got ${words.length}`);
  }
  for (const w of words) {
    if (w.length !== 8) throw new Error(`Every grid word must be 8 letters: "${w}" is ${w.length}`);
  }

  const cells: GridCell[] = [];
  words.forEach((word, colour) => {
    for (const letter of word) cells.push({ letter: letter.toUpperCase(), colour });
  });

  // Fisher-Yates against the seeded PRNG.
  const next = rng(seed);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

export function lettersFor(grid: GridCell[], colour: number): string[] {
  return grid.filter((c) => c.colour === colour).map((c) => c.letter);
}

export function isAnagram(a: string, b: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join("");
  return norm(a) === norm(b);
}
