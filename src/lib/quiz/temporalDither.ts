/**
 * Temporal dithering — split an image into frames that only resolve into the
 * picture when the eye averages them.
 *
 * WHAT THIS IS FOR. A screenshot captures one composited frame. If no single
 * frame contains a readable image, a screenshot returns noise. This is the only
 * technique available to a web page that beats a bare PrintScreen, because it
 * does not race the operating system — there is simply nothing intact to grab
 * at any instant. See `ProtectedImage` for the blanking that handles the
 * focus-stealing capture paths (Win+Shift+S, Snipping Tool).
 *
 * WHAT IT IS NOT. Screenshots taken at every phase of the cycle, averaged,
 * recover the image; so does any screen recording. Offsets are re-randomised on
 * a timer (see `DITHER_RESEED_MS`) so a casually-taken set is unlikely to be
 * complementary, but a determined attacker with well-timed captures wins. This
 * raises the cost from "press a key" to "press a key three times and know to
 * average them". It is a deterrent, not a guarantee, and nothing that runs
 * inside a browser tab can do better.
 *
 * WHY MOSAICS AND NOT PER-PIXEL NOISE. Two earlier versions perturbed each
 * pixel independently and both failed the only test that matters — a captured
 * frame stayed readable:
 *
 *   1. `v ± min(amplitude, v, 255-v)` — legible picture under visible noise.
 *   2. `(x, 2v - x)` with `x` at the ends of the valid range — scrambled
 *      texture, but panel borders, gutters and shapes survived.
 *
 * Both fail for the same structural reason: with per-pixel independent noise
 * whose mean is `v`, every frame is "the image plus zero-mean noise". Spatial
 * structure survives statistically — edges sit exactly where they always were,
 * dark regions stay dark in every frame (the valid range collapses toward the
 * extremes), and a 4px blur of the capture averages the noise away and hands
 * the image back. Concealment therefore requires frames whose LOCAL CONTENT is
 * decorrelated from the image, not just noisy around it. That is what the
 * mosaic fields in `ditherFrames` do; see its doc comment.
 *
 * ACCESSIBILITY. This flickers, by construction, at a fraction of the
 * display's refresh rate. That is far beyond WCAG 2.3.1's
 * three-flashes-per-second limit, so it must never be forced on anyone:
 * callers are required to honour `prefers-reduced-motion` and to offer an
 * explicit opt-out that falls back to a static render. `shouldDither()` below
 * encodes the first half of that rule.
 */

/**
 * Strength, 0-127. 127 pushes every pixel as far as it can go while still
 * averaging back to the original.
 *
 * Defaults to maximum because anything less is measurably useless: at 48 a
 * captured frame of a comic panel was still fully readable. Partial strengths
 * exist for the preview page's slider, not for production.
 */
export const DEFAULT_DITHER_AMPLITUDE = 127;

/**
 * How often to draw fresh random offsets, in milliseconds.
 *
 * Fixed offsets are what make the multi-screenshot attack reliable: the frames
 * of one cycle sum to `frameCount * v` by construction, so ANY set of captures
 * covering the phases of one seed averages back to the image exactly. That is
 * inherent in exact reconstruction and cannot be defeated, only made expensive:
 * re-seeding means the set has to land inside the same window AND cover the
 * phases to be useful.
 *
 * 150 (was 400). At 60 Hz a 400 ms window meant ~24 consecutive refreshes
 * shared one offset set — any three captures inside two fifths of a second
 * cancelled perfectly. The floor for the window is regeneration cost, and
 * since generation became sliced across displayed frames (see
 * `beginDitherPass` / `DITHER_GEN_BUDGET_MS`) that floor is the slice budget
 * times the slices needed: measured 25-50 ms of total work at quiz sizes,
 * ~6-9 ticks at 6 ms each, so a set is ready every ~100-150 ms with zero
 * dropped frames. 150 leaves headroom for slower machines — on a machine 2x
 * slower the window stretches toward ~200 ms rather than the frame rate
 * dropping. Below ~100 ms the swap cadence would outrun generation for the
 * larger images, so the number stops being real.
 */
export const DITHER_RESEED_MS = 150;

/**
 * Per-displayed-frame time budget for sliced regeneration, in milliseconds.
 *
 * Spent from `requestAnimationFrame` after the current frame is painted. The
 * painted frame costs ~1-3 ms (`putImageData`); 6 ms of generation on top
 * keeps the whole tick comfortably inside 16.7 ms at 60 Hz. The synchronous
 * alternative — regenerating whole sets on the timer — was measured at
 * 25-50 ms per reseed, i.e. 2-3 dropped frames every window.
 */
export const DITHER_GEN_BUDGET_MS = 6;

/**
 * How far to pull pure blacks and whites toward mid-grey before dithering.
 *
 * The dither cannot move a pixel sitting at 0 or 255 — the only N-tuple of
 * 8-bit values averaging to 0 is all zeros. In a comic panel or any line art
 * that is most of the image, so without this the borders, gutters and outlines
 * survive at full strength in every frame. Compressing the range into
 * `[k, 255 - k]` first gives every pixel room to be perturbed. It costs
 * contrast — blacks lift to dark grey, whites drop to light grey — which is a
 * real and visible reduction in image quality, traded for the extremes
 * becoming hideable at all. 0 disables it.
 *
 * 38 by the coordinator's call, after viewing the real Round 1 reference on a
 * real display at 100, then 67, then 38. Read the trade before changing it.
 *
 * The floor is worth triple with three frames: a pixel's single-frame range is
 * `[max(0, 3v-510), min(255, 3v)]`, so a black at `k` and a white at `255-k`
 * can land on the SAME captured value only once `k >= 43`, and the shared band
 * widens by 6 per unit of floor (`[255-3k, 3k]` — 130 values wide at 64). Below
 * that threshold dark and bright pixels are separable in every frame no matter
 * what the noise does, which is how panel structure survived an earlier version.
 * The asymptote is k=85, where every pixel can reach the full [0,255] in one
 * frame — and the image is down to a third of its contrast.
 *
 * So 38 is deliberately BELOW the k>=43 separability threshold, and that is a
 * real weakening, measured rather than assumed. Rendering the reference at 38
 * and at 67 and comparing single frames: at 67 a capture gives up a vague
 * bright region and little else; at 38 the subject's silhouette, the light
 * source, the large foreground object and the floor pattern are all
 * discernible. That is enough to identify the scene — roughly the `subject` and
 * `composition` criteria, 9 of the rubric's 23 weight — from one screenshot,
 * though not the detail the other seven criteria score.
 *
 * It was chosen anyway because at 100 the image was compressed into [100, 155],
 * about 55 of 255 tonal levels, and teams could not see well enough to recreate
 * what they were being scored on. An unreadable reference fails the game more
 * completely than a partially leaky one. If that balance needs revisiting, 67
 * is the middle setting that was also tried, and 43 is the hard floor below
 * which separability is guaranteed rather than merely likely.
 */
export const DEFAULT_RANGE_FLOOR = 38;

/**
 * Frames per cycle. The eye integrates over roughly 1/25s — about 2.5 frames
 * at 60Hz — so 3 is the ceiling before the average itself stops looking
 * steady. 3 rather than 2 because it buys two things two frames cannot:
 * headroom (a pixel at value v can reach 3v in a single frame instead of 2v)
 * and a frame slot whose content can be almost pure decoy while the other two
 * carry the compensation between them.
 */
export const DEFAULT_FRAME_COUNT = 2;

/**
 * Edge length of the decoy mosaic cells, in px.
 *
 * Larger cells destroy coarse structure better (and survive the blur attack
 * at larger radii) but flicker as visibly coherent patches; smaller cells
 * approach per-pixel noise, which is exactly what failed. 16 is the measured
 * compromise — see the concealment numbers in the dither report.
 */
export const DEFAULT_DECOY_BLOCK = 4;

/**
 * Band the decoy cells are drawn from, given the range floor the base was
 * compressed with.
 *
 * A decoy value outside a pixel's feasible range is clamped per pixel, and the
 * clamp is image-shaped: a bright decoy cell over dark line art renders the
 * art at triple contrast inside the cell. With the base compressed into
 * `[f, 255-f]`, the widest band contained in EVERY pixel's feasible range is
 * `[255 - Nf, Nf]` — a decoy drawn there never clamps and so never leaks.
 * When the floor is too shallow for that band to exist, fall back to a centred
 * band and accept clamp leakage at the extremes; below that width the mosaic
 * has too little contrast to mask anything.
 */
function decoyBand(frameCount: number, rangeFloor: number): [number, number] {
  const f = Math.max(0, Math.min(120, Math.round(rangeFloor)));
  const lo = Math.max(0, 255 - frameCount * f);
  const hi = Math.min(255, frameCount * f);
  if (hi - lo >= 64) return [lo, hi];
  return [96, 160];
}

const PERMS3: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const PERMS2: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
];

export interface DitherOptions {
  /** Canvas width in px — needed because the mosaics are spatial. */
  width: number;
  /** Canvas height in px. */
  height: number;
  /** 0-127; see DEFAULT_DITHER_AMPLITUDE. */
  amplitude?: number;
  /** 2 or 3; see DEFAULT_FRAME_COUNT. */
  frameCount?: 2 | 3;
  /** Decoy cell edge in px; see DEFAULT_DECOY_BLOCK. */
  blockSize?: number;
  /**
   * The floor `base` was range-compressed with, so the decoy band can be sized
   * to never clamp (see `decoyBand`). Not applied here — compression is the
   * caller's job, before the frames are generated.
   */
  rangeFloor?: number;
  /** Randomness source, injectable so offline measurement is reproducible. */
  random?: () => number;
}

/**
 * Squeeze `[0, 255]` into `[floor, 255 - floor]` in place.
 *
 * Applied to the base BEFORE the frames are generated, so the eye sees the
 * compressed image and the dither operates on pixels that all have headroom.
 * Alpha is skipped.
 */
export function compressRange(data: Uint8ClampedArray, floor: number): void {
  const f = Math.max(0, Math.min(120, Math.round(floor)));
  if (f === 0) return;
  const span = 255 - 2 * f;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = f + (data[i] * span) / 255;
    data[i + 1] = f + (data[i + 1] * span) / 255;
    data[i + 2] = f + (data[i + 2] * span) / 255;
  }
}

/** One randomly-offset grid of cells over the canvas, with per-coordinate
 *  lookup tables so the hot loop never divides. */
interface CellGrid {
  cols: number;
  colOf: Uint16Array;
  rowOf: Uint16Array;
}

function buildGrid(
  width: number,
  height: number,
  block: number,
  random: () => number
): CellGrid {
  const b = Math.max(2, Math.round(block));
  // A random phase per reseed, so cell boundaries never sit still — a fixed
  // grid would give an averaging attacker stable seams to register against.
  const ox = Math.floor(random() * b);
  const oy = Math.floor(random() * b);
  const colOf = new Uint16Array(width);
  for (let x = 0; x < width; x++) colOf[x] = ((x + ox) / b) | 0;
  const rowOf = new Uint16Array(height);
  for (let y = 0; y < height; y++) rowOf[y] = ((y + oy) / b) | 0;
  const cols = width > 0 ? colOf[width - 1] + 1 : 1;
  return { cols, colOf, rowOf };
}

/** A partially generated frame set; see `beginDitherPass`. */
export interface DitherPass {
  /**
   * The `frameCount` buffers being filled. `base` is not mutated. Complete —
   * and safe to display — only once `run` has returned true.
   */
  frames: Uint8ClampedArray[];
  /**
   * Generate for up to `budgetMs` more milliseconds. Returns true once the
   * frame set is complete. `Infinity` finishes the pass in one call.
   */
  run(budgetMs: number): boolean;
}

/**
 * Build the frame set for one RGBA buffer.
 *
 * Every pixel's frames sum to exactly `frameCount * v`, so the temporal
 * average is the image, losslessly, at full amplitude. What each individual
 * frame CONTAINS is driven by four per-reseed random mosaic fields, all on
 * independently phased grids so their seams never align:
 *
 * DECOY. One frame slot per cell shows a flat random colour, clamped per pixel
 * to the range the sum constraint allows. A flat cell carries no image
 * information, and — the part per-pixel noise can never do — its local mean is
 * unrelated to the image, so blurring a captured frame reconstructs the decoy
 * mosaic, not the picture.
 *
 * BIASED SPLIT. The remaining budget `3v - d` is split across the other two
 * slots at the ENDS of the valid range (an earlier version proved uniform
 * draws leave the picture legible), with the high/low coin biased per cell by
 * a second mosaic. The bias is what decouples the split frames' local means
 * from the image; an unbiased coin would put every cell's blurred mean right
 * back on `1.5v - d/2`, which is the image again.
 *
 * ROLE PERMUTATION. Which of the three slots gets the decoy rotates per cell
 * on a third grid, so every frame is the same statistical mixture — there is
 * no "cleanest frame" for an attacker to wait for.
 *
 * LUMA MOSAIC. A fourth field of per-cell offsets applied to R, G and B
 * EQUALLY, plus per-pixel common-mode jitter and one shared split coin per
 * pixel. Everything above draws each channel independently, and that leaves a
 * measured, exploited asymmetry: luma (0.299R + 0.587G + 0.114B) averages
 * three independent perturbations and so keeps ~6x more image correlation
 * than chroma — and luma is what carries recognisable shape. Common-mode
 * terms move luma one-for-one and chroma not at all; see the field comments
 * in the body for how each is threaded through the sum constraint.
 *
 * With `frameCount: 2` the same construction runs with one split slot instead
 * of two: `(d, 2v - d)` with per-pixel jitter added to the decoy before
 * clamping, since with a single compensator there is no coin to carry the
 * noise. Two frames flicker at 30Hz instead of 20Hz and conceal measurably
 * less; the default is 3.
 *
 * Alpha is copied untouched: perturbing it would make the flicker read as
 * shape rather than noise, and transparent regions have no colour to hide.
 *
 * FIDELITY AT PARTIAL AMPLITUDE. Below 127 each frame is lerped toward `v`
 * and rounded; the last slot takes `sum - others`, which keeps the total exact
 * except where rounding lands 1 outside the gamut and the clamped store eats
 * it. Measured worst case: mean error < 0.01, max 1 code value. At full
 * amplitude the sum is exact by construction.
 *
 * GENERATION IS RESUMABLE. `beginDitherPass` sets up the mosaic fields and
 * returns a pass whose `run(budgetMs)` fills rows until the time budget is
 * spent. This exists for the reseed window (see `DITHER_RESEED_MS`): a full
 * regeneration is 25-50 ms for a quiz-sized image, which as a synchronous call
 * costs 2-3 dropped frames per reseed. Sliced at `DITHER_GEN_BUDGET_MS` per
 * displayed frame into a back buffer, it costs none, and the reseed window can
 * shrink to the time the slices take to cover the image. The output is
 * byte-identical however it is sliced — rows are filled in order and the RNG
 * call sequence does not depend on the slicing.
 *
 * @param base RGBA pixel data (already range-compressed by the caller).
 * @param into Optional buffers to fill (must match `base.length`), so a loop
 *   can alternate two sets instead of allocating ~7 MB per reseed.
 */
export function beginDitherPass(
  base: Uint8ClampedArray,
  opts: DitherOptions,
  into?: Uint8ClampedArray[]
): DitherPass {
  const { width, height } = opts;
  const frameCount = opts.frameCount ?? DEFAULT_FRAME_COUNT;
  const random = opts.random ?? Math.random;
  const block = opts.blockSize ?? DEFAULT_DECOY_BLOCK;
  const strength = Math.max(
    0,
    Math.min(1, (opts.amplitude ?? DEFAULT_DITHER_AMPLITUDE) / 127)
  );

  const frames: Uint8ClampedArray[] = [];
  for (let f = 0; f < frameCount; f++) {
    const given = into?.[f];
    frames.push(
      given && given.length === base.length
        ? given
        : new Uint8ClampedArray(base.length)
    );
  }
  if (width <= 0 || height <= 0) return { frames, run: () => true };

  // Four independent grids. Deliberately different cell sizes as well as
  // phases: co-sited seams would make the composite field read as one grid,
  // and one grid is a template an averaging attack can register against.
  const decoyGrid = buildGrid(width, height, block, random);
  const biasGrid = buildGrid(width, height, Math.round(block * 1.5), random);
  const roleGrid = buildGrid(width, height, Math.round(block * 0.75), random);
  const lumaGrid = buildGrid(width, height, Math.round(block * 0.65), random);

  const [decoyMin, decoyMax] = decoyBand(
    frameCount,
    opts.rangeFloor ?? DEFAULT_RANGE_FLOOR
  );
  const decoySpan = decoyMax - decoyMin + 1;
  // Per-pixel jitter inside the band. A perfectly flat decoy cell carries no
  // gradients, which concentrates an edge detector's attention on the cells
  // that do carry image structure — measured as HIGHER edge overlap than the
  // per-pixel baseline. Jitter feeds the detector decoy gradients everywhere
  // while the cell's local mean (what a blur attack recovers) stays put.
  const jitter = decoySpan >> 1;
  // Per-channel jitter, kept smaller than the shared term: it is what carries
  // the CHROMA scramble at pixel scale, so it cannot go to zero, but every
  // unit of it is variance the luma average cancels (see the luma mosaic
  // comment below).
  const jitterChan = decoySpan >> 2;
  const decoyCells = decoyGrid.cols * (decoyGrid.rowOf[height - 1] + 1) * 3;
  const decoy = new Uint8Array(decoyCells);
  for (let i = 0; i < decoyCells; i++) {
    decoy[i] = decoyMin + ((random() * decoySpan) | 0);
  }

  // LUMA MOSAIC — the common-mode field. Everything above draws each channel
  // independently, and that has a structural bias an attacker measured and
  // exploited: luma is 0.299R + 0.587G + 0.114B, so it AVERAGES three
  // independent perturbations and its noise variance shrinks, while chroma
  // (channel differences) keeps its own. A captured frame's luma — the
  // component that carries recognisable shape — survived ~6x better than its
  // chroma. The fix is a perturbation added to R, G and B EQUALLY: it moves
  // luma one-for-one and chroma not at all. No separate sum constraint is
  // needed — the shift lands on the decoy before the feasibility clamp, and
  // the remainder slot absorbs it exactly, so reconstruction stays lossless.
  const lumaCellCount = lumaGrid.cols * (lumaGrid.rowOf[height - 1] + 1);
  const lumaShift = new Int16Array(lumaCellCount);
  for (let i = 0; i < lumaCellCount; i++) {
    lumaShift[i] = ((random() * 2 - 1) * jitter) | 0;
  }

  // Bias cells get a shared common-mode term for the same reason: the bias
  // sets each cell's LOCAL MEAN in the split slots (what a blur attack
  // recovers), and with three independent per-channel biases those local means
  // average toward mid in luma. A common component makes the blurred luma of
  // split cells as random as their chroma. The per-channel deviation on top
  // keeps the hue scramble.
  const biasCellCount = biasGrid.cols * (biasGrid.rowOf[height - 1] + 1);
  const bias = new Uint8Array(biasCellCount * 3);
  for (let i = 0; i < biasCellCount; i++) {
    const common = random() * 256;
    for (let c = 0; c < 3; c++) {
      let b = common + (random() - 0.5) * 128;
      if (b < 0) b = 0;
      else if (b > 255) b = 255;
      bias[i * 3 + c] = b;
    }
  }

  const roleCells = roleGrid.cols * (roleGrid.rowOf[height - 1] + 1);
  const roles = new Uint8Array(roleCells);
  const permCount = frameCount === 3 ? PERMS3.length : PERMS2.length;
  for (let i = 0; i < roleCells; i++) roles[i] = (random() * permCount) | 0;

  const full = strength >= 1;

  let fillRow: (y: number) => void;
  if (frameCount === 3) {
    const [f0buf, f1buf, f2buf] = frames;
    fillRow = (y: number) => {
      const dRow = decoyGrid.rowOf[y] * decoyGrid.cols;
      const bRow = biasGrid.rowOf[y] * biasGrid.cols;
      const rRow = roleGrid.rowOf[y] * roleGrid.cols;
      const lRow = lumaGrid.rowOf[y] * lumaGrid.cols;
      let i = y * width * 4;
      for (let x = 0; x < width; x++, i += 4) {
        const dCell = (dRow + decoyGrid.colOf[x]) * 3;
        const bCell = (bRow + biasGrid.colOf[x]) * 3;
        const perm = PERMS3[roles[rRow + roleGrid.colOf[x]]];
        // Common-mode draws, once per PIXEL and applied to all three channels
        // below: the per-cell luma shift, a shared jitter term, and one coin
        // for the split. Sharing the coin is a comonotone coupling — each
        // channel's marginal distribution (and so every per-channel statistic
        // measured before) is unchanged, but the channels now move together,
        // which is exactly the luma direction.
        const lumaAdd =
          lumaShift[lRow + lumaGrid.colOf[x]] + (((random() * 2 - 1) * jitter) | 0);
        const coin = random() * 256;
        for (let c = 0; c < 3; c++) {
          const v = base[i + c];
          const target = 3 * v;

          // Feasible range for any single frame: all three in [0,255] with the
          // right sum. Wider than the two-frame range — a pixel can reach 3v.
          const lo = target > 510 ? target - 510 : 0;
          const hi = target < 255 ? target : 255;

          let d =
            decoy[dCell + c] + lumaAdd + (((random() * 2 - 1) * jitterChan) | 0);
          if (d < decoyMin) d = decoyMin;
          else if (d > decoyMax) d = decoyMax;
          if (d < lo) d = lo;
          else if (d > hi) d = hi;

          // Split the remainder across the other two slots, at the ends of
          // ITS feasible range, coin biased by the second mosaic. The coin is
          // the shared per-pixel draw; the bias stays per channel.
          const rem = target - d;
          const sLo = rem > 255 ? rem - 255 : 0;
          const sHi = rem < 255 ? rem : 255;
          const s = coin < bias[bCell + c] ? sHi : sLo;

          let a: number, b: number;
          if (full) {
            a = d;
            b = s;
          } else {
            a = Math.round(v + (d - v) * strength);
            b = Math.round(v + (s - v) * strength);
          }
          frames[perm[0]][i + c] = a;
          frames[perm[1]][i + c] = b;
          // Exact remainder keeps the sum right; the clamped store bounds the
          // rare partial-amplitude rounding spill at 1 code value.
          frames[perm[2]][i + c] = target - a - b;
        }
        const alpha = base[i + 3];
        f0buf[i + 3] = alpha;
        f1buf[i + 3] = alpha;
        f2buf[i + 3] = alpha;
      }
    };
  } else {
    // frameCount === 2 — decoy plus single compensator. Per-pixel jitter on
    // the decoy stands in for the missing split coin. The same luma-coherence
    // rule applies: most of the jitter is one shared draw per pixel, plus the
    // per-cell luma shift, with a smaller per-channel term for chroma.
    const [f0buf, f1buf] = frames;
    fillRow = (y: number) => {
      const dRow = decoyGrid.rowOf[y] * decoyGrid.cols;
      const rRow = roleGrid.rowOf[y] * roleGrid.cols;
      const lRow = lumaGrid.rowOf[y] * lumaGrid.cols;
      let i = y * width * 4;
      for (let x = 0; x < width; x++, i += 4) {
        const dCell = (dRow + decoyGrid.colOf[x]) * 3;
        const perm = PERMS2[roles[rRow + roleGrid.colOf[x]]];
        const lumaAdd =
          lumaShift[lRow + lumaGrid.colOf[x]] + ((random() * 256) | 0) - 128;
        for (let c = 0; c < 3; c++) {
          const v = base[i + c];
          const target = 2 * v;
          const lo = target > 255 ? target - 255 : 0;
          const hi = target < 255 ? target : 255;

          // Clamped only to the feasible range, not the band: with a single
          // compensator the decoy is the ONLY carrier of per-pixel noise, and
          // band-clamping it measurably raised the frame's correlation with
          // the image.
          let d = decoy[dCell + c] + lumaAdd + ((random() * 128) | 0) - 64;
          if (d < lo) d = lo;
          else if (d > hi) d = hi;

          const a = full ? d : Math.round(v + (d - v) * strength);
          frames[perm[0]][i + c] = a;
          frames[perm[1]][i + c] = target - a;
        }
        const alpha = base[i + 3];
        f0buf[i + 3] = alpha;
        f1buf[i + 3] = alpha;
      }
    };
  }

  let nextY = 0;
  return {
    frames,
    run(budgetMs: number): boolean {
      if (budgetMs === Infinity) {
        while (nextY < height) fillRow(nextY++);
        return true;
      }
      const deadline = performance.now() + budgetMs;
      while (nextY < height) {
        // 8 rows between clock checks: a row costs 40-120 µs at quiz sizes,
        // so the overshoot past the deadline stays under ~1 ms.
        const stop = Math.min(height, nextY + 8);
        while (nextY < stop) fillRow(nextY++);
        if (performance.now() >= deadline) break;
      }
      return nextY >= height;
    },
  };
}

/**
 * Build a complete frame set in one synchronous call — `beginDitherPass` with
 * an unlimited budget. The first paint and offline measurement use this; the
 * animation loop slices the pass instead.
 *
 * @returns `frameCount` new buffers. The caller owns them; `base` is not
 *   mutated.
 */
export function ditherFrames(
  base: Uint8ClampedArray,
  opts: DitherOptions
): Uint8ClampedArray[] {
  const pass = beginDitherPass(base, opts);
  pass.run(Infinity);
  return pass.frames;
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
