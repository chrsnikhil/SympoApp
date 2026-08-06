"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDitherLoop } from "./useDitherLoop";
import { useDitherSetting } from "./useDitherSetting";

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
  dither = false,
}: {
  src: string;
  alt: string;
  teamName: string;
  sessionId?: string | null;
  className?: string;
  protectFocusLoss?: boolean;
  /**
   * Opt IN to the temporal dither. Off by default, and deliberately a per-call
   * decision rather than something every ProtectedImage inherits from the
   * feature flag.
   *
   * Only one surface in the app earns it: the Round 1 Image Replication
   * reference, which teams are scored on recreating and therefore have a direct
   * incentive to capture. A team's own uploaded recreation is theirs already,
   * and the memory and Connections tiles are puzzle content teams are meant to
   * study — flickering those spends the accessibility cost with nothing bought.
   */
  dither?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  /**
   * Hide the artwork RIGHT NOW, without waiting for React.
   *
   * `setObscured(true)` is a state update: React schedules a re-render, the
   * browser paints on the next frame, and — with the opacity transition this
   * component used to carry — the image then faded out over a further 75ms.
   * Against a capture that completes in microseconds, roughly 90ms of continued
   * visibility is the same as no protection at all.
   *
   * Writing `visibility` straight onto the node inside the event handler is the
   * earliest a page can act: the style is in place before the handler returns,
   * so the very next paint is already blank. React state is still set
   * afterwards to keep the component's own model honest.
   *
   * Being exact about what this buys, because it is easy to over-claim:
   * captures that steal focus first (Win+Shift+S, the Snipping Tool, Cmd+Shift+4)
   * are reliably beaten — the page is blank before the region selector even
   * appears. A bare PrintScreen is grabbed by the OS in the same instant the key
   * goes down, and on Windows browsers frequently deliver only `keyup` for it,
   * after the pixels are already taken. This narrows that race as far as a web
   * page can; it does not win it. The watermark and the strike exist for the
   * cases it loses.
   */
  const hideNow = useCallback(() => {
    const el = frameRef.current;
    if (el) el.style.visibility = "hidden";
    setObscured(true);
  }, []);

  const showAgain = useCallback(() => {
    const el = frameRef.current;
    if (el) el.style.visibility = "";
    setObscured(false);
  }, []);

  const [stamp, setStamp] = useState(() => new Date().toLocaleTimeString());
  const [layoutSeed, setLayoutSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [obscured, setObscured] = useState(false);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  // Both must agree: the coordinator's flag (and the viewer's opt-out, which
  // `useDitherSetting` already folds in) AND this call site asking for it.
  const { ditherEnabled } = useDitherSetting();
  const ditherThisImage = dither && ditherEnabled;
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
    // Bumping the epoch restarts the dither loop below: its snapshot of the
    // composited base is taken once, so a resize that redraws at a new size
    // would otherwise leave it alternating stale pixels at the old dimensions.
    const onResize = () => {
      draw();
      setLayoutEpoch((n) => n + 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready, draw]);

  /**
   * Temporal dithering, when the coordinator has switched it on.
   *
   * Wrapping `draw` means the watermark is dithered along WITH the artwork
   * rather than being composited over a dithered image — if the watermark were
   * a stable layer on top, a single captured frame would still carry a clean,
   * readable watermark over noise, which is the one part of the frame we do not
   * need to protect and the part most useful for locating the image beneath.
   */
  useDitherLoop({
    canvasRef,
    enabled: ditherThisImage,
    paintBase: () => draw(),
    deps: [ready, draw, layoutEpoch],
  });

  useEffect(() => {
    if (!protectFocusLoss) return;

    const handleBlur = () => hideNow();
    const handleFocus = () => showAgain();
    // A tab going hidden fires this and not always `blur`.
    const handleVisibility = () => (document.hidden ? hideNow() : showAgain());

    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const blockedCombo =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && k === "s"; // Save page
      const blockedInspect =
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "c", "j"].includes(k)) || e.key === "F12";

      if (blockedCombo || blockedInspect) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Hide FIRST, ask questions later.
      //
      // Every branch below hides synchronously via `hideNow`, so the style is
      // committed before this handler returns and the next paint is blank. The
      // ordering matters more than the precision of the match: it is far better
      // to blank on a keystroke that turns out to be harmless — the image
      // returns in a moment — than to still be painting artwork while a capture
      // completes.
      //
      // `Meta` alone is deliberately included. Win+Shift+S starts with the
      // Windows key going down, and that keydown DOES reach the page, which
      // makes it the earliest warning available for the region-capture path.
      const capturePrelude =
        e.key === "PrintScreen" ||
        e.key === "Meta" ||
        (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(k)) ||
        (e.ctrlKey && e.key === "PrintScreen") ||
        (e.altKey && e.key === "PrintScreen");

      if (capturePrelude) {
        hideNow();
        // Long enough to cover a region-selector interaction, which is the case
        // this actually beats. Cleared early by `focus` when the user returns.
        window.setTimeout(() => showAgain(), 4000);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [protectFocusLoss, hideNow, showAgain]);

  return (
    <div
      ref={wrapRef}
      className={`relative select-none overflow-hidden ${className ?? ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/*
        No opacity transition, and `visibility` rather than opacity.

        This carried `transition-opacity duration-75`, which meant the artwork
        faded out over 75ms on top of React's own render delay — so a capture
        fired within roughly 90ms of the keystroke still got a clearly readable
        image. An animation on the hide path is the one place a transition is
        actively harmful: it is a guaranteed window of visibility, precisely
        when visibility is what we are trying to remove.

        `hideNow` sets `visibility: hidden` on this node directly; the class
        below is the declarative fallback for any path that only moves React
        state. Both are instantaneous.
      */}
      <div
        ref={frameRef}
        className={`flex justify-center ${obscured ? "invisible" : "visible"}`}
      >
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
