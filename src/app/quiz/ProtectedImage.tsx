"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Renders the Image Replication reference/upload previews with the easy copy
 * paths closed off: no context menu, no drag-out, no text/image selection,
 * no iOS long-press "Save Image" callout, and no `<img>` element carrying the
 * picture — it is painted into a `<canvas>` instead, so "Save image as…" has
 * nothing to point at and the DOM holds no src to copy out.
 *
 * None of that stops an OS-level screenshot or a phone camera pointed at the
 * screen — a browser has no way to prevent that, and this doesn't pretend
 * otherwise. What it CAN do is make anything captured that way traceable: the
 * team name, a live timestamp and the server-issued session id are drawn
 * INTO the canvas pixels, not layered over them in the DOM. A DOM overlay can
 * be deleted from the inspector in two clicks; baked pixels cannot be, short
 * of editing the image afterwards.
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
 * blurred or a screenshot-shaped shortcut fires, and blocks the usual
 * save/inspect shortcuts — default off, because the one other place this
 * component renders (the team's own uploaded recreation) stays mounted
 * through the rest of Image Replication, where tabbing out to an AI generator
 * is expected and shouldn't black out their own preview. Only the reference
 * image — mounted just for its two brief viewing windows — turns this on.
 */

const TILE_COUNT = 16;
const LAYOUT_RESHUFFLE_MS = 3500;
/** Matches the previous `max-h-72` box so the layout is unchanged. */
const MAX_HEIGHT = 288;

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
  sessionId,
  className,
  protectFocusLoss = false,
}: {
  src: string;
  alt: string;
  teamName: string;
  sessionId?: string | null;
  className?: string;
  protectFocusLoss?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [stamp, setStamp] = useState(() => new Date().toLocaleTimeString());
  const [layoutSeed, setLayoutSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [obscured, setObscured] = useState(false);
  const [ready, setReady] = useState(false);

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

  const watermarkText = sessionId
    ? `${teamName.toUpperCase()} • ${stamp} • ${sessionId}`
    : `${teamName.toUpperCase()} • ${stamp}`;

  // Decode once, off-DOM. The decoded bitmap lives only in this ref — it is
  // never attached to the document, so there is no element to right-click,
  // drag, or read a src off.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      setReady(true);
    };
    img.src = src;
    return () => {
      cancelled = true;
      imgRef.current = null;
      setReady(false);
    };
  }, [src]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!canvas || !wrap || !img) return;

    // Fit inside the container preserving aspect ratio — the canvas
    // equivalent of the previous `w-full max-h-72 object-contain`.
    const availW = wrap.clientWidth || img.width;
    const scale = Math.min(availW / img.width, MAX_HEIGHT / img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // `difference` mirrors the old mix-blend-difference layers, so the
    // watermark stays legible over both light and dark regions of any image.
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";

    // Layer 1: fine tiled grid, each tile independently rotated/sized/
    // positioned/opacity'd and reshuffled every few seconds — no single
    // fixed template for a removal pass to subtract.
    for (const tile of tileLayout) {
      ctx.save();
      ctx.globalAlpha = tile.opacity;
      ctx.font = `bold ${tile.size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.translate((tile.left / 100) * w, (tile.top / 100) * h);
      ctx.rotate((tile.rotation * Math.PI) / 180);
      ctx.fillText(watermarkText, 0, 0);
      ctx.restore();
    }

    // Layer 2: one large diagonal band across the whole frame — a
    // structurally different pattern from the tiled grid above, so a
    // removal attempt tuned for one layer still leaves the other.
    ctx.save();
    ctx.globalAlpha = 0.3;
    const bandSize = Math.max(18, Math.min(w * 0.09, 42));
    ctx.font = `900 ${bandSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.translate(w / 2, h / 2);
    ctx.rotate((bandRotation * Math.PI) / 180);
    ctx.fillText(watermarkText, 0, 0);
    ctx.restore();

    ctx.globalCompositeOperation = "source-over";
  }, [tileLayout, bandRotation, watermarkText]);

  useEffect(() => {
    if (!ready) return;
    draw();
  }, [ready, draw]);

  useEffect(() => {
    if (!ready) return;
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready, draw]);

  useEffect(() => {
    if (!protectFocusLoss) return;

    const handleBlur = () => setObscured(true);
    const handleFocus = () => setObscured(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Deterrents only, and honestly so: devtools opens from the menu, and
      // the OS screenshot tools below have already captured by the time a
      // keydown reaches JS. These raise the effort, they don't close the door.
      const k = e.key.toLowerCase();
      const blockedCombo =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && k === "s"; // Save page
      const blockedInspect =
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "c", "j"].includes(k)) || e.key === "F12";

      if (blockedCombo || blockedInspect) {
        e.preventDefault();
        e.stopPropagation();
      }

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
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [protectFocusLoss]);

  return (
    <div
      ref={wrapRef}
      className={`relative select-none overflow-hidden ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className={`flex justify-center transition-opacity duration-75 ${obscured ? "opacity-0" : "opacity-100"}`}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={alt}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="pointer-events-none block select-none"
        />
        {!ready && (
          <div className="flex h-64 w-full items-center justify-center">
            <span className="font-comic text-paper-white/40">Loading Secure Image…</span>
          </div>
        )}
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
