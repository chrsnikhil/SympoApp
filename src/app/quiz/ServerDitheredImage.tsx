"use client";

import { useEffect, useRef, useState } from "react";
import { DITHER_RESEED_MS } from "@/lib/quiz/temporalDither";

/**
 * Cycle pre-dithered frames supplied by the server.
 *
 * The counterpart to `buildServerDitheredFrames`. `ProtectedImage` noises a
 * clean image locally, which means a clean image had to be sent — and the
 * Network tab kept it. Here the browser is handed only finished frames, so
 * there is nothing cleaner to find: the flicker is the only form the picture
 * ever takes on this machine.
 *
 * Drawn to a canvas rather than swapping an `<img>` src, for the same reason
 * the rest of the app does: an `<img>` is right-click-savable and draggable to
 * the desktop, and a saved frame should at least be a frame rather than the
 * picture. Swapping `src` would also flash on decode.
 */
export default function ServerDitheredImage({
  frames,
  width,
  height,
  alt,
  className,
  onFrameRef,
}: {
  /** PNG data URLs in cycle order. One frame renders static, which is fine. */
  frames: string[];
  width: number;
  height: number;
  alt: string;
  className?: string;
  /** So a parent can blank the whole frame on a capture attempt. */
  onFrameRef?: (el: HTMLDivElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [decoded, setDecoded] = useState<HTMLImageElement[] | null>(null);

  // Decode every frame BEFORE animating. Decoding inside the loop would stall
  // the first cycle and show one frame far longer than the others — and a frame
  // held on screen is exactly the thing this is meant to prevent.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      frames.map(
        (src) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          })
      )
    )
      .then((imgs) => {
        if (!cancelled) setDecoded(imgs);
      })
      .catch(() => {
        if (!cancelled) setDecoded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [frames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded || decoded.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    let i = 0;
    const paint = () => {
      ctx.drawImage(decoded[i % decoded.length], 0, 0, width, height);
      i++;
    };
    paint();

    // Same cadence the local dither used, so the perceived flicker is
    // unchanged — only where the frames came from has changed.
    const id = window.setInterval(paint, DITHER_RESEED_MS);
    return () => window.clearInterval(id);
  }, [decoded, width, height]);

  return (
    <div ref={onFrameRef} className={`relative select-none ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="pointer-events-none block h-auto w-full max-w-full select-none"
      />
      {!decoded && (
        <div className="absolute inset-0 grid place-items-center bg-ink-black/80">
          <span className="font-comic text-paper-white/40">Loading secure image…</span>
        </div>
      )}
    </div>
  );
}
