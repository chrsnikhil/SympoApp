/**
 * Morse code, as a timeline of light-on and light-off spans.
 *
 * The desk lamp in the Mystery Room blinks a message on a loop. That could
 * have been a hand-written array of magic numbers in the scene component, and
 * it would have been wrong the first time and undebuggable the second: a
 * blinking light is the hardest possible thing to eyeball for correctness,
 * because "is that a dash or two dots" is exactly the question the player is
 * also trying to answer. So the encoding lives here, framework-free and
 * unit-tested, and the scene only asks it "is the lamp lit at time t".
 *
 * Timing is in Morse *units*, not seconds — the caller picks the wall-clock
 * length of a unit, which is the one thing that genuinely is a taste decision.
 * The standard proportions are:
 *
 *   dot = 1 on      dash = 3 on
 *   gap between symbols in a letter = 1 off
 *   gap between letters             = 3 off
 *   gap between words               = 7 off
 *
 * Getting those ratios right is the difference between a message a person can
 * actually read off a wall and a light that just flickers.
 */

/** Letters and digits. Everything the room needs, and nothing it does not. */
const MORSE_TABLE: Record<string, string> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
};

export const UNITS = {
  dot: 1,
  dash: 3,
  symbolGap: 1,
  letterGap: 3,
  wordGap: 7,
} as const;

/** One span of the loop: the lamp is either lit or dark for `units` Morse units. */
export interface Span {
  on: boolean;
  units: number;
}

/**
 * Drop anything with no Morse representation, and collapse whitespace.
 *
 * Unsupported characters are removed rather than silently encoded as a gap,
 * because a stray gap reads as a letter break and would corrupt the message
 * around it — a wrong message is worse than a shorter one.
 */
function normalise(text: string): string[] {
  return text
    .toUpperCase()
    .split(/\s+/)
    .map((word) => [...word].filter((ch) => ch in MORSE_TABLE).join(""))
    .filter((word) => word.length > 0);
}

/**
 * The readable form: letters separated by spaces, words by " / ".
 *
 * Used by the tests, and by anyone who needs to check what the lamp is
 * actually saying without watching it for thirty seconds.
 */
export function toMorse(text: string): string {
  return normalise(text)
    .map((word) => [...word].map((ch) => MORSE_TABLE[ch]).join(" "))
    .join(" / ");
}

/**
 * The message as an alternating run of lit and dark spans, ending with a word
 * gap so the loop restarts with an unambiguous pause. Without that trailing
 * gap the last letter of the message would run straight into the first letter
 * of the next repeat, and a looping message with no start is unreadable.
 */
export function toSpans(text: string): Span[] {
  const words = normalise(text);
  const spans: Span[] = [];

  words.forEach((word) => {
    [...word].forEach((ch, ci) => {
      const code = MORSE_TABLE[ch];
      [...code].forEach((symbol, si) => {
        spans.push({ on: true, units: symbol === "-" ? UNITS.dash : UNITS.dot });
        if (si < code.length - 1) spans.push({ on: false, units: UNITS.symbolGap });
      });
      if (ci < word.length - 1) spans.push({ on: false, units: UNITS.letterGap });
    });
    spans.push({ on: false, units: UNITS.wordGap });
  });

  return spans;
}

/** Total length of one full repeat, in units. */
export function totalUnits(spans: Span[]): number {
  return spans.reduce((sum, s) => sum + s.units, 0);
}

/**
 * Is the lamp lit `units` into the loop?
 *
 * Wraps, so the caller can pass a monotonically increasing clock and never
 * think about the repeat. A linear scan over ~90 spans per frame is nothing
 * next to a single draw call, and it stays correct if the message changes;
 * the alternative — caching an index and advancing it — breaks the moment
 * anything rewinds the clock.
 */
export function isOnAt(spans: Span[], units: number): boolean {
  const total = totalUnits(spans);
  if (total <= 0) return false;

  let t = units % total;
  if (t < 0) t += total;

  for (const span of spans) {
    if (t < span.units) return span.on;
    t -= span.units;
  }
  // Only reachable through floating-point drift at the very end of the loop.
  return false;
}
