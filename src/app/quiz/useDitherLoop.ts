"use client";

import { useEffect } from "react";
import {
  DEFAULT_DECOY_BLOCK,
  DEFAULT_DITHER_AMPLITUDE,
  DEFAULT_FRAME_COUNT,
  DEFAULT_RANGE_FLOOR,
  DITHER_GEN_BUDGET_MS,
  DITHER_RESEED_MS,
  beginDitherPass,
  compressRange,
  shouldDither,
  type DitherPass,
} from "@/lib/quiz/temporalDither";

/**
 * Drive a canvas as either a static render or a temporally dithered one.
 *
 * The caller supplies `paintBase`, which draws whatever the viewer is meant to
 * see — for `ProtectedImage` that is the artwork with its watermark already
 * composited, so the watermark is dithered along with the image rather than
 * sitting on top as a stable, and therefore capturable, layer.
 *
 * With dithering off this paints once and stops. Nothing schedules a frame, so
 * the common case costs exactly what a plain `drawImage` costs.
 *
 * With it on, the base is rasterised once into an offscreen buffer and the
 * dithered frame cycle is driven by `requestAnimationFrame`. Re-rasterising the
 * base every frame would be pointless work; only the noise needs to change, and
 * only every `DITHER_RESEED_MS`.
 */
export function useDitherLoop({
  canvasRef,
  paintBase,
  enabled,
  amplitude = DEFAULT_DITHER_AMPLITUDE,
  rangeFloor = DEFAULT_RANGE_FLOOR,
  frameCount = DEFAULT_FRAME_COUNT,
  blockSize = DEFAULT_DECOY_BLOCK,
  deps = [],
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Draw the frame the viewer should perceive. Sized in CSS pixels. */
  paintBase: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  enabled: boolean;
  amplitude?: number;
  /** Lift blacks / drop whites by this much first, so the extremes can be hidden. */
  rangeFloor?: number;
  /** Frames per dither cycle, 2 or 3. */
  frameCount?: 2 | 3;
  /** Decoy mosaic cell edge, px. */
  blockSize?: number;
  deps?: unknown[];
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Paint BEFORE measuring. `paintBase` is allowed to size the canvas itself
    // — `ProtectedImage`'s does, because the fit depends on the container — and
    // reading width/height first would capture zeros on the first pass and
    // silently skip the loop.
    const paint = () => {
      ctx.save();
      paintBase(ctx, canvas.width || 1, canvas.height || 1);
      ctx.restore();
    };
    paint();

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    if (!shouldDither(enabled)) return;

    // Snapshot the composited base. Everything below perturbs this buffer; the
    // base is never re-drawn, so a slow `paintBase` costs one frame, not sixty
    // per second.
    let baseData: ImageData;
    try {
      baseData = ctx.getImageData(0, 0, w, h);
    } catch {
      // Tainted canvas (a cross-origin source without CORS). Reading pixels is
      // impossible, so dithering is impossible — leave the static render up
      // rather than failing the component.
      return;
    }

    // Copy out of the ImageData so the source is a plain Uint8ClampedArray —
    // `ImageData.data` is typed as ImageDataArray, which is not assignable in
    // both directions.
    const source = new Uint8ClampedArray(baseData.data);
    // Compress BEFORE generating the pair, and repaint so the viewer sees the
    // same compressed image the dither is built from — otherwise the eye
    // averages back to something the base no longer matches.
    compressRange(source, rangeFloor);
    {
      const flattened = new ImageData(w, h);
      flattened.data.set(source);
      ctx.putImageData(flattened, 0, 0);
    }
    const n = frameCount === 2 ? 2 : 3;
    const opts = {
      width: w,
      height: h,
      amplitude,
      frameCount: n as 2 | 3,
      blockSize,
      rangeFloor,
    };

    // Double buffer: one frame set on screen, the next one being generated
    // into the other set a few milliseconds per tick. Two sets of ImageData,
    // swapped by reference — the pass writes straight into the back set's
    // pixels, so a reseed never copies or allocates after this point.
    const makeSet = () => {
      const set: ImageData[] = [];
      for (let i = 0; i < n; i++) set.push(new ImageData(w, h));
      return set;
    };
    let display = makeSet();
    let back = makeSet();
    const buffersOf = (set: ImageData[]) =>
      set.map((im) => new Uint8ClampedArray(im.data.buffer, 0, im.data.length));

    // The first set is generated synchronously — there is nothing safe to show
    // until a complete cycle exists, and this is the one-time cost the old
    // code paid on every reseed.
    beginDitherPass(source, opts, buffersOf(display)).run(Infinity);

    let pass: DitherPass = beginDitherPass(source, opts, buffersOf(back));
    let passDone = false;

    // Reseeds (buffer swaps) only land on cycle boundaries, so every displayed
    // run of n consecutive frames comes from one seed and averages to the
    // image exactly — a mid-cycle swap would flash a partial sum that averages
    // to something else. The swap additionally waits for the back set to be
    // complete; on a slow machine the window stretches instead of the frame
    // rate dropping.
    let lastSwap = performance.now();
    let frameIdx = 0;
    let raf = 0;

    const tick = (now: number) => {
      if (frameIdx === 0 && passDone && now - lastSwap >= DITHER_RESEED_MS) {
        const freed = display;
        display = back;
        back = freed;
        lastSwap = now;
        pass = beginDitherPass(source, opts, buffersOf(back));
        passDone = false;
      }
      ctx.putImageData(display[frameIdx], 0, 0);
      frameIdx = (frameIdx + 1) % n;
      // Generation happens AFTER the paint, in the same tick's leftover
      // budget: ~1-3ms of putImageData plus DITHER_GEN_BUDGET_MS of row
      // filling stays inside 16.7ms.
      if (!passDone) passDone = pass.run(DITHER_GEN_BUDGET_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      // Leave the canvas showing the real image, not whichever noisy half the
      // loop happened to stop on.
      paint();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, enabled, amplitude, rangeFloor, frameCount, blockSize, ...deps]);
}
