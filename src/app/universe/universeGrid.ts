/**
 * Universe 64-Grid builder.
 *
 * Builds an 8×8 letter grid from 8 universe words (one per universe).
 * Each word contributes 8 letter cells tagged with that universe's colour
 * index. The grid is shuffled with a deterministic seeded PRNG (Mulberry32)
 * so the same seed always produces the same layout.
 *
 * The client receives only the shuffled GridCell[] — never the source words.
 */

export interface UniverseGridCell {
  letter: string;
  /** Universe index (0–7) this cell belongs to */
  colour: number;
}

/* ── Mulberry32 — small deterministic PRNG ─────────────────────────────── */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a 64-cell grid from exactly 8 eight-letter words.
 * Each word is tagged with its universe colour index.
 * The resulting array is Fisher-Yates shuffled against the seeded PRNG.
 */
export function buildUniverseGrid(
  words: string[],
  seed: number
): UniverseGridCell[] {
  if (words.length !== 8) {
    throw new Error(
      `buildUniverseGrid needs exactly 8 words, got ${words.length}`
    );
  }
  for (const w of words) {
    if (w.length !== 8) {
      throw new Error(
        `Every grid word must be 8 letters: "${w}" is ${w.length}`
      );
    }
  }

  const cells: UniverseGridCell[] = [];
  words.forEach((word, colour) => {
    for (const letter of word) {
      cells.push({ letter: letter.toUpperCase(), colour });
    }
  });

  // Fisher-Yates shuffle with seeded PRNG
  const next = rng(seed);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

/** Extract all letters belonging to a specific colour index from the grid. */
export function lettersForUniverse(
  grid: UniverseGridCell[],
  colour: number
): string[] {
  return grid.filter((c) => c.colour === colour).map((c) => c.letter);
}

/** Check whether two strings are anagrams of each other (case-insensitive, letters only). */
export function isUniverseAnagram(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .split("")
      .sort()
      .join("");
  return norm(a) === norm(b);
}
