/**
 * Temporal dithering — split an image into two frames that only resolve into
 * the picture when the eye averages them.
 *
 * WHAT THIS IS FOR. A screenshot captures one composited frame. If no single
 * frame contains a readable image, a screenshot returns noise. This is the only
 * technique available to a web page that beats a bare PrintScreen, because it
 * does not race the operating system — there is simply nothing intact to grab
 * at any instant. See `ProtectedImage` for the blanking that handles the
 * focus-stealing capture paths (Win+Shift+S, Snipping Tool).
 *
 * WHAT IT IS NOT. Two screenshots taken at different phases, averaged, recover
 * the image; so does any screen recording. Offsets are re-randomised on a timer
 * (see `DITHER_RESEED_MS`) so a casually-taken pair is unlikely to be
 * complementary, but a determined attacker with two well-timed captures wins.
 * This raises the cost from "press a key" to "press a key twice and know to
 * average them". It is a deterrent, not a guarantee, and nothing that runs
 * inside a browser tab can do better.
 *
 * ACCESSIBILITY. This flickers, by construction, at the display's refresh rate.
 * That is far beyond WCAG 2.3.1's three-flashes-per-second limit, so it must
 * never be forced on anyone: callers are required to honour
 * `prefers-reduced-motion` and to offer an explicit opt-out that falls back to
 * a static render. `shouldDither()` below encodes the first half of that rule.
 */

/** Per-channel offset ceiling, 0-127. Higher hides a single frame better and flickers harder. */
export const DEFAULT_DITHER_AMPLITUDE = 48;

/**
 * How often to draw fresh random offsets, in milliseconds.
 *
 * Fixed offsets are what make the two-screenshot attack reliable: any two
 * captures at opposite phases cancel exactly. Re-seeding means a pair has to
 * land inside the same window AND on opposite phases to be useful. Short enough
 * to matter, long enough that regenerating the buffers is not the frame budget.
 */
export const DITHER_RESEED_MS = 400;

/**
 * Build the positive/negative pair for one RGBA buffer.
 *
 * The offset is capped per pixel by its own headroom — `min(amplitude, c, 255 - c)`
 * — rather than generated freely and clamped afterwards. That distinction is
 * the whole correctness of the effect: with naive clamping, a pixel near black
 * loses the negative half of its excursion and a pixel near white loses the
 * positive half, so the two frames no longer average back to the original. The
 * picture the eye reconstructs comes out with lifted shadows and dulled
 * highlights, worst exactly where an image has its deepest blacks. Capping
 * keeps `(pos + neg) / 2 === original` for every pixel, everywhere.
 *
 * Alpha is copied untouched — perturbing it would make the flicker visible as
 * shape rather than noise, and transparent regions have no colour to hide.
 *
 * @param base   RGBA pixel data, as returned by `getImageData`.
 * @param amplitude Maximum per-channel excursion.
 * @returns Two new buffers. The caller owns them; this does not mutate `base`.
 */
export function ditherPair(
  base: Uint8ClampedArray,
  amplitude: number = DEFAULT_DITHER_AMPLITUDE
): { pos: Uint8ClampedArray; neg: Uint8ClampedArray } {
  const pos = new Uint8ClampedArray(base.length);
  const neg = new Uint8ClampedArray(base.length);
  const amp = Math.max(0, Math.min(127, Math.round(amplitude)));

  for (let i = 0; i < base.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = base[i + c];
      // Headroom on both sides, so neither frame needs clamping.
      const room = Math.min(amp, v, 255 - v);
      const offset = room === 0 ? 0 : Math.round((Math.random() * 2 - 1) * room);
      pos[i + c] = v + offset;
      neg[i + c] = v - offset;
    }
    pos[i + 3] = base[i + 3];
    neg[i + 3] = base[i + 3];
  }

  return { pos, neg };
}

/**
 * Whether this viewer should get the dithered render at all.
 *
 * Two gates, both required. `enabled` is the coordinator's switch — off by
 * default, because this is a deliberate accessibility trade and not something
 * to inherit silently. `prefers-reduced-motion` is the viewer's, and it is
 * honoured unconditionally: someone who has told their OS they are sensitive to
 * motion must never have to find a per-site opt-out first.
 */
export function shouldDither(enabled: boolean): boolean {
  if (!enabled) return false;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
