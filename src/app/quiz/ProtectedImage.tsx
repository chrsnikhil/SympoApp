"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Renders the Image Replication reference/upload previews with the easy copy
 * paths closed off: no context menu, no drag-out, no text/image selection,
 * no iOS long-press "Save Image" callout.
 *
 * None of that stops an OS-level screenshot or a phone camera pointed at the
 * screen — a browser has no way to prevent that, and this doesn't pretend
 * otherwise. What it CAN do is make anything captured that way traceable: a
 * live watermark of the team name and timestamp is baked into the rendered
 * pixels, so a leaked screenshot or photo still identifies who took it and
 * when.
 *
 * The watermark is deliberately NOT one uniform repeating tile. A single
 * fixed pattern (same rotation, size, spacing, opacity, tiled identically
 * every time) is exactly what watermark-removal tools are built to spot —
 * uniformity is what lets them isolate and subtract "the pattern" cleanly.
 * Instead: two independent layers (a fine tiled grid plus one large diagonal
 * band), each tile with its own randomized rotation/size/opacity/position,
 * and the whole layout reshuffles every few seconds — so there's no single
 * static template for a removal pass to key on, and a screenshot taken at
 * one moment looks structurally different from one taken a few seconds
 * later.
 *
 * `protectFocusLoss` additionally blacks the image out while the window is
 * blurred or a screenshot-shaped shortcut fires — default off, because the
 * one other place this component renders (the team's own uploaded
 * recreation) stays mounted through the rest of Image Replication, where
 * tabbing out to an AI generator is expected and shouldn't black out their
 * own preview. Only the reference image — mounted just for its two brief
 * viewing windows — turns this on.
 */

const TILE_COUNT = 16;
const LAYOUT_RESHUFFLE_MS = 3500;

interface TileLayout {
  top: number;
  left: number;
  rotation: number;
  size: number;
  opacity: number;
}

/** Cheap seeded PRNG (mulberry32) — deterministic per tick so re-renders
 *  within the same tick don't jitter, but a new tick reshuffles everything. */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTileLayout(seed: number): TileLayout[] {
  const rand = seededRandom(seed);
  return Array.from({ length: TILE_COUNT }, () => ({
    top: rand() * 92,
    left: rand() * 90,
    rotation: -55 + rand() * 110, // -55..55deg — no fixed angle to key on
    size: 8 + rand() * 9, // 8..17px
    opacity: 0.22 + rand() * 0.4, // 0.22..0.62
  }));
}

export default function ProtectedImage({
  src,
  alt,
  teamName,
  className,
  protectFocusLoss = false,
}: {
  src: string;
  alt: string;
  teamName: string;
  className?: string;
  protectFocusLoss?: boolean;
}) {
  const [stamp, setStamp] = useState(() => new Date().toLocaleTimeString());
  const [layoutSeed, setLayoutSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setStamp(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reshuffles tile positions/rotations/sizes on their own clock, independent
  // of the per-second timestamp text — the geometry drifts even when the
  // displayed second hasn't ticked, and vice versa.
  useEffect(() => {
    const id = setInterval(() => setLayoutSeed((s) => s + 1), LAYOUT_RESHUFFLE_MS);
    return () => clearInterval(id);
  }, []);

  const tileLayout = useMemo(() => buildTileLayout(layoutSeed), [layoutSeed]);
  const bandRotation = useMemo(() => -30 + seededRandom(layoutSeed + 777)() * 60, [layoutSeed]);

  useEffect(() => {
    if (!protectFocusLoss) return;

    const handleBlur = () => setObscured(true);
    const handleFocus = () => setObscured(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen and Cmd+Shift+3 both capture instantly at the OS level —
      // by the time this handler runs, the pixels are already grabbed, so
      // blacking out here is a courtesy, not a defense (see the file doc).
      if (e.key === "PrintScreen") {
        setObscured(true);
        setTimeout(() => setObscured(false), 2000);
      }
      // Win+Shift+S and Cmd+Shift+4/5 open a region-select UI before
      // capturing anything, which gives this a real chance of landing in
      // time — worth keeping separate from the PrintScreen case above.
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "s", "S"].includes(e.key)) {
        setObscured(true);
        setTimeout(() => setObscured(false), 5000);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [protectFocusLoss]);

  const watermarkText = `${teamName.toUpperCase()} • ${stamp}`;

  return (
    <div
      className={`relative select-none overflow-hidden ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`relative transition-opacity duration-75 ${obscured ? "opacity-0" : "opacity-100"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="pointer-events-none block w-full max-h-72 object-contain select-none"
        />

        {/* Layer 1: fine tiled grid, each tile independently rotated/sized/
            positioned/opacity'd and reshuffled every few seconds — no single
            fixed template for a removal pass to subtract. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden mix-blend-difference">
          {tileLayout.map((tile, i) => (
            <span
              key={i}
              className="absolute whitespace-nowrap font-mono font-bold text-white"
              style={{
                top: `${tile.top}%`,
                left: `${tile.left}%`,
                transform: `rotate(${tile.rotation}deg)`,
                fontSize: `${tile.size}px`,
                opacity: tile.opacity,
              }}
            >
              {watermarkText}
            </span>
          ))}
        </div>

        {/* Layer 2: one large diagonal band across the whole frame — a
            structurally different pattern from the tiled grid above, so a
            removal attempt tuned for one layer still leaves the other. */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden mix-blend-difference"
          style={{ opacity: 0.3 }}
        >
          <span
            className="whitespace-nowrap font-mono font-black text-white"
            style={{ fontSize: "clamp(1.1rem, 9vw, 2.6rem)", transform: `rotate(${bandRotation}deg)` }}
          >
            {watermarkText}
          </span>
        </div>
      </div>

      {obscured && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90">
          <p className="text-spider-red font-display uppercase tracking-widest text-center animate-pulse">
            Screenshot Blocked
          </p>
        </div>
      )}
    </div>
  );
}
