"use client";

import { useEffect, useRef, useState } from "react";
import { useDitherLoop } from "./useDitherLoop";

/**
 * An `<img>` replacement that can render through the temporal dither.
 *
 * Used for the raster surfaces worth screenshotting — Connections tiles, the
 * memory cards, MCQ question images. The Round 1 reference has its own
 * component (`ProtectedImage`) because it also carries a per-team watermark and
 * blanking; this is the plain case.
 *
 * With `dither` off it draws once to a canvas and stops, which is
 * indistinguishable from an `<img>` in cost and appearance. A canvas rather than
 * an `<img>` either way, so "save image as" and drag-to-desktop have nothing to
 * grab.
 */
export default function DitheredImage({
  src,
  alt,
  dither = false,
  amplitude,
  className,
  maxHeight = 320,
  fit = "intrinsic",
}: {
  src: string;
  alt: string;
  dither?: boolean;
  amplitude?: number;
  className?: string;
  maxHeight?: number;
  /**
   * `intrinsic` sizes the canvas to the image, scaled down to fit the container
   * and `maxHeight` — the drop-in for a plain `<img>` in normal flow.
   *
   * `cover` and `contain` size the canvas to the CONTAINER and fit the image
   * inside it, which is what the fixed-aspect boxes need (a memory card, a
   * Connections tile). Without these the canvas would collapse to the image's
   * own dimensions and the card layout would break.
   */
  fit?: "intrinsic" | "cover" | "contain";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    const img = new Image();
    // Same-origin in this app, but declared so the canvas is never tainted —
    // a tainted canvas cannot be read back, which silently disables dithering.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.onerror = () => setFailed(true);
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  // Size the canvas to the loaded image before the loop paints into it.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!canvas || !wrap || !img || !ready) return;

    let w: number;
    let h: number;
    if (fit === "intrinsic") {
      const availW = wrap.clientWidth || img.width;
      const scale = Math.min(availW / img.width, maxHeight / img.height, 1);
      w = Math.max(1, Math.round(img.width * scale));
      h = Math.max(1, Math.round(img.height * scale));
    } else {
      // Fill the container's box; the image is fitted inside it when painting.
      w = Math.max(1, Math.round(wrap.clientWidth || img.width));
      h = Math.max(1, Math.round(wrap.clientHeight || img.height));
    }

    // Deliberately NOT devicePixelRatio-scaled. The dither reads and rewrites
    // every pixel each reseed; on a 2x display that is four times the work for
    // detail the noise is hiding anyway.
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = fit === "intrinsic" ? `${w}px` : "100%";
    canvas.style.height = fit === "intrinsic" ? `${h}px` : "100%";
  }, [ready, maxHeight, fit]);

  useDitherLoop({
    canvasRef,
    enabled: dither,
    amplitude,
    deps: [ready, src, fit],
    paintBase: (ctx, w, h) => {
      const img = imgRef.current;
      if (!img) return;
      ctx.clearRect(0, 0, w, h);

      if (fit === "intrinsic") {
        ctx.drawImage(img, 0, 0, w, h);
        return;
      }

      // `cover` crops to fill; `contain` letterboxes. Same arithmetic, opposite
      // choice of scale — this is the canvas equivalent of object-fit, which a
      // canvas does not get for free.
      const scale =
        fit === "cover"
          ? Math.max(w / img.width, h / img.height)
          : Math.min(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    },
  });

  if (failed) {
    return (
      <div ref={wrapRef} className={className}>
        <span className="text-xs text-paper-white/40">Image unavailable</span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative select-none ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="pointer-events-none block max-w-full select-none"
      />
    </div>
  );
}
