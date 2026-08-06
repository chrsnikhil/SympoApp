import "server-only";

/**
 * The eight answer words for the universe grid — one per universe, index 0–7,
 * matching the order of UNIVERSES in app/universe/universeData.ts.
 *
 * WHY THESE LIVE HERE AND NOT IN universeData.ts. They used to be a `word`
 * field on each UniverseTheme, and universeData.ts is imported by
 * UniverseLanding, which is "use client". That put all eight plaintext answers
 * into the client bundle. Worse, app/universe/[index]/page.tsx also passed
 * `answerWord={universe.word}` as a prop to that client component, so the
 * team's answer was serialised into the RSC flight payload too — and
 * generateStaticParams() prerenders 0–7 at build time, which baked it into the
 * static HTML on disk. Viewing source was enough. No devtools required.
 *
 * The `server-only` import above is the enforcement, not the comment: importing
 * this module from anything in the client graph is a build error, not a review
 * miss. Grid construction and guess checking both happen server-side; the
 * browser sees shuffled letter/colour pairs and a boolean.
 *
 * REGENERATING THE WORDS IS A SEPARATE JOB and deliberately not done here —
 * these values are in git history and must be assumed public to anyone with
 * repo access. This module only stops them reaching participants at runtime.
 */
export const UNIVERSE_WORDS: readonly string[] = [
  "COMPILER", // 0 RIOT
  "DATABASE", // 1 PUNK
  "FUNCTION", // 2 SLAM
  "VARIABLE", // 3 VENOM
  "TERMINAL", // 4 ELECTRIC
  "OVERFLOW", // 5 ANARCHY
  "DECODING", // 6 SMASH
  "PROTOCOL", // 7 GHOST
] as const;

/** Normalise the way the grid does: uppercase, letters only. */
function normalise(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * Is `guess` the answer for universe `index`?
 *
 * The only place a universe word is ever compared to player input. Returns
 * false for an out-of-range index rather than throwing, so a bad request is a
 * wrong answer and not a 500 that distinguishes valid indices from invalid.
 */
export function isUniverseWord(index: number, guess: string): boolean {
  const word = UNIVERSE_WORDS[index];
  if (typeof word !== "string") return false;
  return normalise(guess) === normalise(word);
}
