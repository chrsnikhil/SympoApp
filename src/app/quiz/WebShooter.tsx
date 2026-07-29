"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReticleShape } from "@/lib/quiz/avatars";

/**
 * First-person web-shooter.
 *
 * Three pieces: a gloved forearm anchored at the bottom of the screen that
 * aims wherever the pointer goes, a character-specific reticle at the
 * pointer, and a strand that fires from the shooter's nozzle to the point of
 * impact. `WebNet` (exported below) is the web itself, which sticks to the
 * option you hit and stays there while it's your answer.
 *
 * The strand is a real verlet-integrated rope simulation (gravity +
 * iterative distance constraints across ~14 points), not a straight line —
 * a single opaque line at any width reads as a laser, not webbing. The rope
 * gives it natural sag in flight, three layered strokes (soft glow / body /
 * specular highlight) make it read as sticky rather than flat, and on
 * impact it sprays 6-10 short strands at irregular angles from the landing
 * point instead of just stopping. Runs on its own canvas, separate from the
 * SVG arm, driven by one shared requestAnimationFrame loop that starts on
 * the first shot and stops itself once nothing is left animating.
 *
 * Drawn entirely in SVG/canvas — no external image, and nothing traced from
 * or resembling a licensed character's design. That's what lets it recolour
 * per character for free, stay sharp at any density, and hold the assets
 * repo's own rule that the theme is carried by the interface, not by
 * borrowed frames.
 *
 * THE IMPORTANT PART IS WHAT THIS DOESN'T DO. Aiming adds no step to
 * answering — a click is still a click. The options underneath stay
 * ordinary buttons, so keyboard, screen reader and touch all keep working;
 * this layer is decoration over a working control.
 *
 * Inert unless the device has a fine pointer. Under prefers-reduced-motion
 * the arm still aims but nothing animates.
 */

const RETICLE_SIZE = 34;
/** Distance from the wrist anchor to the nozzle, in px. */
const ARM_LENGTH = 110;

const ROPE_POINTS = 14;
const FLIGHT_MS = 190;
const IMPACT_SETTLE_MS = 120;
const IMPACT_HOLD_MS = 650;
const IMPACT_FADE_MS = 380;
const STRAND_COUNT_MIN = 6;
const STRAND_COUNT_MAX = 10;

interface RopePoint {
  x: number;
  y: number;
  px: number;
  py: number;
  pinned: boolean;
}

interface Rope {
  points: RopePoint[];
  segLen: number;
  /** Timestamp to hard-lock the last point once its overshoot settles, or null once locked/never overshot. */
  lockAt: number | null;
  lockX: number;
  lockY: number;
}

interface Shot {
  phase: "flight" | "impact" | "done";
  startedAt: number;
  impactStartedAt: number;
  nozzle: { x: number; y: number };
  target: { x: number; y: number; w: number; h: number; el: HTMLElement };
  main: Rope;
  strands: Rope[];
  released: number;
  dir: { x: number; y: number };
}

function makeRope(x: number, y: number, count: number, segLen: number): Rope {
  return {
    points: Array.from({ length: count }, () => ({ x, y, px: x, py: y, pinned: false })),
    segLen,
    lockAt: null,
    lockX: 0,
    lockY: 0,
  };
}

function verletStep(points: RopePoint[], gravity: number, damping: number) {
  for (const p of points) {
    if (p.pinned) {
      p.px = p.x;
      p.py = p.y;
      continue;
    }
    const vx = (p.x - p.px) * damping;
    const vy = (p.y - p.py) * damping + gravity;
    const nx = p.x + vx;
    const ny = p.y + vy;
    p.px = p.x;
    p.py = p.y;
    p.x = nx;
    p.y = ny;
  }
}

function solveConstraints(points: RopePoint[], segLen: number, iterations: number) {
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const diff = (dist - segLen) / dist;
      const offX = dx * 0.5 * diff;
      const offY = dy * 0.5 * diff;
      if (!a.pinned) {
        a.x += offX;
        a.y += offY;
      }
      if (!b.pinned) {
        b.x -= offX;
        b.y -= offY;
      }
    }
  }
}

/** Frees the end point with a small burst of outward "velocity" (via its
 *  previous-position offset) so it overshoots the landing spot and springs
 *  back under its own constraint tension, then hard-locks after `lockAt`. */
function primeOvershoot(rope: Rope, targetX: number, targetY: number, dirX: number, dirY: number, now: number) {
  const end = rope.points[rope.points.length - 1];
  end.pinned = false;
  end.x = targetX;
  end.y = targetY;
  end.px = targetX - dirX * 9;
  end.py = targetY - dirY * 9;
  rope.lockAt = now + IMPACT_SETTLE_MS;
  rope.lockX = targetX;
  rope.lockY = targetY;
}

function stepRope(rope: Rope, gravity: number, damping: number, now: number) {
  verletStep(rope.points, gravity, damping);
  solveConstraints(rope.points, rope.segLen, 3);
  if (rope.lockAt !== null && now >= rope.lockAt) {
    const end = rope.points[rope.points.length - 1];
    end.x = rope.lockX;
    end.y = rope.lockY;
    end.pinned = true;
    rope.lockAt = null;
  }
}

function buildImpactStrands(target: Shot["target"], now: number): Rope[] {
  const n = STRAND_COUNT_MIN + Math.floor(Math.random() * (STRAND_COUNT_MAX - STRAND_COUNT_MIN + 1));
  const strands: Rope[] = [];
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = 0.45 + Math.random() * 0.6;
    const ex = target.x + Math.cos(angle) * (target.w / 2) * reach;
    const ey = target.y + Math.sin(angle) * (target.h / 2) * reach;
    const count = 6;
    const segLen = Math.hypot(ex - target.x, ey - target.y) / (count - 1) || 1;
    const rope = makeRope(target.x, target.y, count, segLen);
    for (let j = 1; j < count; j++) {
      const t = j / (count - 1);
      rope.points[j].x = target.x + (ex - target.x) * t;
      rope.points[j].y = target.y + (ey - target.y) * t;
      rope.points[j].px = rope.points[j].x;
      rope.points[j].py = rope.points[j].y;
    }
    rope.points[0].pinned = true;
    const dirX = (ex - target.x) / (segLen * (count - 1) || 1);
    const dirY = (ey - target.y) / (segLen * (count - 1) || 1);
    primeOvershoot(rope, ex, ey, dirX, dirY, now);
    strands.push(rope);
  }
  return strands;
}

function ropePath(ctx: CanvasRenderingContext2D, points: RopePoint[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const midX = (points[i - 1].x + points[i].x) / 2;
    const midY = (points[i - 1].y + points[i].y) / 2;
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

/** Three layered strokes — soft outer glow, mid-body, thin specular
 *  highlight — is what reads as sticky/wet rather than a flat laser line. */
function strokeWeb(ctx: CanvasRenderingContext2D, points: RopePoint[], colour: string, alphaMul: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ropePath(ctx, points);
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.22 * alphaMul;
  ctx.lineWidth = 7;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ropePath(ctx, points);
  ctx.globalAlpha = 0.65 * alphaMul;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  ropePath(ctx, points);
  ctx.strokeStyle = "#ffffff";
  ctx.globalAlpha = 0.8 * alphaMul;
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawFilm(ctx: CanvasRenderingContext2D, target: Shot["target"], alpha: number, colour: string) {
  if (alpha <= 0) return;
  const left = target.x - target.w / 2 - 6;
  const top = target.y - target.h / 2 - 6;
  const w = target.w + 12;
  const h = target.h + 12;
  const grad = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, Math.max(w, h) * 0.7);
  grad.addColorStop(0, hexToRgba(colour, alpha));
  grad.addColorStop(1, hexToRgba(colour, 0));
  ctx.fillStyle = grad;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.arcTo(left + w, top, left + w, top + h, r);
  ctx.arcTo(left + w, top + h, left, top + h, r);
  ctx.arcTo(left, top + h, left, top, r);
  ctx.arcTo(left, top, left + w, top, r);
  ctx.closePath();
  ctx.fill();
}

export default function WebShooter({
  colour,
  webColour,
  gloveColour,
  shape,
}: {
  colour: string;
  webColour: string;
  gloveColour: string;
  shape: ReticleShape;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [locked, setLocked] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [recoil, setRecoil] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  const rafRef = useRef<number | null>(null);
  const webColourRef = useRef(webColour);

  useEffect(() => {
    webColourRef.current = webColour;
  }, [webColour]);

  useEffect(() => {
    // Coarse pointers (touch) have no cursor to replace, and hover-locking is
    // meaningless without one.
    const fine = window.matchMedia("(pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setEnabled(fine.matches);
      setReducedMotion(motion.matches);
    };
    sync();
    fine.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);

  const isTarget = useCallback((x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const target = el?.closest<HTMLElement>("[data-web-target]");
    // A struck-out or expired option is not a valid target — the reticle
    // shouldn't invite a shot the grader is going to refuse.
    return !!target && !target.hasAttribute("disabled");
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const draw = (now: number) => {
      const shots = shotsRef.current;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (const shot of shots) {
        const gravity = shot.phase === "flight" ? 0.35 : 0.55;
        const damping = shot.phase === "flight" ? 0.985 : 0.9;

        if (shot.phase === "flight") {
          const t = Math.min(1, (now - shot.startedAt) / FLIGHT_MS);
          const leadIdx = Math.max(1, Math.round(t * (ROPE_POINTS - 1)));
          const tipX = shot.nozzle.x + (shot.target.x - shot.nozzle.x) * t;
          const tipY = shot.nozzle.y + (shot.target.y - shot.nozzle.y) * t;
          for (let i = shot.released; i <= leadIdx; i++) {
            shot.main.points[i].x = tipX;
            shot.main.points[i].y = tipY;
            shot.main.points[i].px = tipX;
            shot.main.points[i].py = tipY;
          }
          shot.released = Math.max(shot.released, leadIdx + 1);

          stepRope(shot.main, gravity, damping, now);

          if (t >= 1) {
            shot.phase = "impact";
            shot.impactStartedAt = now;
            primeOvershoot(shot.main, shot.target.x, shot.target.y, shot.dir.x, shot.dir.y, now);
            shot.strands = buildImpactStrands(shot.target, now);
            shot.target.el.classList.add("web-caught");
          }

          // Motion blur: the same rope shape, nudged back along the flight
          // direction and drawn faint underneath — cheaper and cleaner than
          // keeping a real position history, and reads the same at 190ms.
          const trailOffset = 14 * (1 - t);
          if (trailOffset > 0.5) {
            const trailPts: RopePoint[] = shot.main.points.map((p) => ({
              x: p.x - shot.dir.x * trailOffset,
              y: p.y - shot.dir.y * trailOffset,
              px: p.x - shot.dir.x * trailOffset,
              py: p.y - shot.dir.y * trailOffset,
              pinned: p.pinned,
            }));
            strokeWeb(ctx, trailPts, webColourRef.current, 0.3);
          }
          strokeWeb(ctx, shot.main.points, webColourRef.current, 1);
        } else if (shot.phase === "impact") {
          stepRope(shot.main, gravity, damping, now);
          for (const s of shot.strands) stepRope(s, gravity, 0.88, now);

          const impactElapsed = now - shot.impactStartedAt;
          let filmAlpha = Math.min(0.5, (impactElapsed / 150) * 0.5);
          if (impactElapsed > IMPACT_HOLD_MS) {
            const fadeT = Math.min(1, (impactElapsed - IMPACT_HOLD_MS) / IMPACT_FADE_MS);
            filmAlpha = 0.5 * (1 - fadeT);
            if (fadeT >= 1) {
              shot.phase = "done";
              shot.target.el.classList.remove("web-caught");
            }
          }

          drawFilm(ctx, shot.target, filmAlpha, webColourRef.current);
          const strandAlpha = impactElapsed > IMPACT_HOLD_MS ? Math.max(0, 1 - (impactElapsed - IMPACT_HOLD_MS) / IMPACT_FADE_MS) : 1;
          strokeWeb(ctx, shot.main.points, webColourRef.current, strandAlpha);
          for (const s of shot.strands) strokeWeb(ctx, s.points, webColourRef.current, strandAlpha * 0.85);
        }
      }

      shotsRef.current = shots.filter((s) => s.phase !== "done");
      rafRef.current = shotsRef.current.length > 0 ? requestAnimationFrame(draw) : null;
    };

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setLocked(isTarget(e.clientX, e.clientY));
    };

    const onDown = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const btn = el?.closest<HTMLElement>("[data-web-target]");
      if (!btn || btn.hasAttribute("disabled")) return;

      // Fire from the nozzle, which is ARM_LENGTH along the aim vector from
      // the wrist anchor — otherwise the strand visibly leaves from the elbow.
      const anchorX = window.innerWidth / 2;
      const anchorY = window.innerHeight;
      const dx = e.clientX - anchorX;
      const dy = e.clientY - anchorY;
      const len = Math.hypot(dx, dy) || 1;
      const nozzle = { x: anchorX + (dx / len) * ARM_LENGTH, y: anchorY + (dy / len) * ARM_LENGTH };

      const rect = btn.getBoundingClientRect();
      const tx = rect.left + rect.width / 2;
      const ty = rect.top + rect.height / 2;
      const dist = Math.hypot(tx - nozzle.x, ty - nozzle.y) || 1;
      const segLen = dist / (ROPE_POINTS - 1) || 1;

      const shot: Shot = {
        phase: "flight",
        startedAt: performance.now(),
        impactStartedAt: 0,
        nozzle,
        target: { x: tx, y: ty, w: rect.width, h: rect.height, el: btn },
        main: makeRope(nozzle.x, nozzle.y, ROPE_POINTS, segLen),
        strands: [],
        released: 1,
        dir: { x: (tx - nozzle.x) / dist, y: (ty - nozzle.y) / dist },
      };
      shot.main.points[0].pinned = true;
      shotsRef.current.push(shot);
      startLoop();

      setRecoil(true);
      window.setTimeout(() => setRecoil(false), 140);
      playThwip();
    };

    const onLeave = () => setPos(null);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, isTarget, startLoop]);

  // Hide the native cursor only while this is mounted and active, and always
  // put it back on unmount — a page with no cursor and no reticle is unusable.
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("web-shooter-active");
    return () => document.documentElement.classList.remove("web-shooter-active");
  }, [enabled]);

  if (!enabled) return null;

  // Aim angle, measured from straight up so 0deg is the arm pointing at the
  // top of the screen.
  const anchorX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  const anchorY = typeof window !== "undefined" ? window.innerHeight : 0;
  const aim = pos ? (Math.atan2(pos.x - anchorX, anchorY - pos.y) * 180) / Math.PI : 0;
  // Clamped so the arm never folds behind the player.
  const armAngle = Math.max(-62, Math.min(62, aim));

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998]" aria-hidden="true">
      {/* Fired strands: nozzle → point of impact, verlet-simulated. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* The shooter itself — a gloved forearm that pivots at the wrist. */}
      <div
        className="absolute bottom-0 left-1/2"
        style={{
          // Sits partly below the fold, like an FPV weapon — enough of it is
          // visible to read as a web-shooter without it covering an answer.
          // translateY runs along the rotated axis, so recoil kicks back down
          // the arm rather than straight down the screen.
          transform: `translateX(-50%) rotate(${armAngle}deg) translateY(${recoil ? 32 : 22}px)`,
          transformOrigin: "50% 100%",
          transition: reducedMotion ? "none" : "transform 120ms cubic-bezier(.2,.8,.3,1)",
        }}
      >
        <ShooterArm colour={colour} webColour={webColour} gloveColour={gloveColour} firing={recoil} />
      </div>

      {/* Reticle */}
      {pos && (
        <div
          className="absolute"
          style={{
            left: pos.x,
            top: pos.y,
            transform: `translate(-50%, -50%) scale(${locked ? 1.25 : 1})`,
            transition: reducedMotion ? "none" : "transform 90ms ease-out",
          }}
        >
          <Reticle shape={shape} colour={locked ? webColour : colour} locked={locked} />
        </div>
      )}
    </div>
  );
}

/** Procedural "thwip" — a filtered noise burst plus a falling sine pop.
 *  Synthesised, not sampled: original, not licensed audio. */
function playThwip() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const bufLen = Math.floor(ctx.sampleRate * 0.13);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3400, now);
    filter.frequency.exponentialRampToValueAtTime(700, now + 0.11);
    filter.Q.value = 3.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
    noise.connect(filter).connect(noiseGain).connect(ctx.destination);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);
    oscGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
    osc.connect(oscGain).connect(ctx.destination);

    noise.start(now);
    osc.start(now);
    noise.stop(now + 0.14);
    osc.stop(now + 0.08);
    window.setTimeout(() => void ctx.close(), 300);
  } catch {
    // Silent fallback — a missing/blocked AudioContext shouldn't break firing.
  }
}

/**
 * The gloved forearm and web-shooter, drawn rather than shipped as an image —
 * it recolours per character for free and stays sharp at any density.
 */
/** Darken a hex colour by `amount` (0–1). Used to give the sleeve its own
 *  value so the glove reads as a separate piece from the forearm. */
function darken(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function ShooterArm({
  colour,
  webColour,
  gloveColour,
  firing,
}: {
  colour: string;
  webColour: string;
  gloveColour: string;
  firing: boolean;
}) {
  const INK = "#0A0A0A";
  // TWO HUES, not one hue in three shades. Deriving sleeve, glove and thumb
  // all from `colour` made the whole shooter read as a single flat blob —
  // there was nothing for the eye to separate. The sleeve keeps the
  // character's colour and the glove gets its own: this is what lets Peter,
  // Miles, Gwen and Miguel's shooters look distinct at a glance. The device
  // stays neutral metal so the hardware never competes with the glove.
  const sleeve = darken(colour, 0.25);
  const glove = gloveColour;
  const metal = "#1b1b1b";

  return (
    <svg width={124} height={178} viewBox="0 0 160 230" style={{ display: "block" }}>
      <defs>
        <linearGradient id="sleeve-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={sleeve} stopOpacity="0.4" />
          <stop offset="45%" stopColor={sleeve} stopOpacity="0.95" />
          <stop offset="100%" stopColor={sleeve} />
        </linearGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
      </defs>

      {/* Sleeve / Forearm (Remains anchored) */}
      <path d="M48 230 L44 138 Q44 118 60 112 L90 112 Q106 118 106 138 L102 230 Z" fill="url(#sleeve-grad)" stroke={INK} strokeWidth="5" strokeLinejoin="round" />

      {/* Hand & Web-Shooter Assembly — Bends & cocks at the wrist joint (75px, 145px) when shooting webs */}
      <g
        style={{
          transform: firing ? "rotate(-14deg) translateY(-6px) scale(1.03)" : "none",
          transformOrigin: "75px 145px",
          transition: "transform 100ms cubic-bezier(0.2, 0.9, 0.3, 1.3)",
        }}
      >
        {/* 1. THUMB (Extended wide out to the side) */}
        <g>
          <path
            d={firing ? "M98 124 Q128 118 146 98 Q152 86 138 78 Q118 86 100 94 Z" : "M98 124 Q125 116 142 96 Q148 84 135 78 Q118 84 100 94 Z"}
            fill={darken(gloveColour, 0.14)}
            stroke={INK}
            strokeWidth="4.5"
            strokeLinejoin="round"
            style={{ transition: "d 100ms ease-out" }}
          />
          <path d="M104 114 Q122 104 132 90" stroke={INK} strokeWidth="2" fill="none" opacity="0.55" />
        </g>

        {/* Palm Base (dips down in the center to reveal folded middle fingers) */}
        <path
          d="M44 134 Q38 108 46 94 Q60 100 75 100 Q90 100 102 94 Q110 108 104 134 Q94 142 74 142 Q54 142 44 134 Z"
          fill={glove}
          stroke={INK}
          strokeWidth="5"
          strokeLinejoin="round"
        />

        {/* 2. MIDDLE FINGER (Curled down deeper into palm - snaps down on trigger during firing) */}
        <g style={{ transform: firing ? "translateY(3px)" : "none", transition: "transform 60ms ease-out" }}>
          <path
            d="M58 78 Q58 118 71 118 Q79 118 79 78 Q68 72 58 78 Z"
            fill={darken(gloveColour, 0.08)}
            stroke={INK}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M62 98 Q69 106 76 98" stroke={INK} strokeWidth="2" fill="none" opacity="0.6" />
        </g>

        {/* 3. RING FINGER (Curled down deeper into palm - snaps down on trigger during firing) */}
        <g style={{ transform: firing ? "translateY(3px)" : "none", transition: "transform 60ms ease-out" }}>
          <path
            d="M77 78 Q77 117 88 117 Q96 117 96 78 Q87 72 77 78 Z"
            fill={darken(gloveColour, 0.08)}
            stroke={INK}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M80 98 Q87 106 93 98" stroke={INK} strokeWidth="2" fill="none" opacity="0.6" />
        </g>

        {/* 4. PINKY FINGER (Left side - Small, short pinky finger) */}
        <g>
          <path
            d={
              firing
                ? "M44 94 Q34 76 40 58 Q44 50 54 52 Q60 56 57 66 Q55 78 57 92 Z"
                : "M44 94 Q36 76 42 56 Q46 48 54 50 Q60 54 57 66 Q55 78 57 92 Z"
            }
            fill={glove}
            stroke={INK}
            strokeWidth="4.5"
            strokeLinejoin="round"
            style={{ transition: "d 100ms ease-out" }}
          />
          <path d="M47 74 Q52 70 56 74" stroke={INK} strokeWidth="2" fill="none" opacity="0.5" />
        </g>

        {/* 5. PINKY FINGER (Right side - Extended UP & somewhat bent) */}
        <g>
          <path
            d={
              firing
                ? "M98 94 Q114 64 110 40 Q106 26 95 28 Q87 34 88 54 Q88 68 96 92 Z"
                : "M98 94 Q112 62 108 40 Q104 26 95 28 Q87 34 88 54 Q88 68 96 92 Z"
            }
            fill={glove}
            stroke={INK}
            strokeWidth="4.5"
            strokeLinejoin="round"
            style={{ transition: "d 100ms ease-out" }}
          />
          <path d="M92 60 Q96 56 102 60" stroke={INK} strokeWidth="2" fill="none" opacity="0.5" />
        </g>

        {/* Web-shooter: Neutral metal hardware positioned down on the WRIST */}
        {/* Wrist Strap */}
        <rect x="36" y="152" width="78" height="22" rx="4" fill="#141414" stroke={INK} strokeWidth="4" />
        <g stroke={webColour} strokeWidth="1.8" opacity="0.6" fill="none">
          <path d="M42 156 L42 168 M54 154 L54 170 M75 154 L75 170 M96 154 L96 170 M108 156 L108 168" />
        </g>

        {/* Shooter Housing on Wrist */}
        <rect x="56" y="136" width="38" height="24" rx="5" fill={metal} stroke={INK} strokeWidth="4" />
        {/* Cartridge window — lights up on fire */}
        <rect x="61" y="150" width="28" height="5" rx="2" fill={firing ? "#ffffff" : webColour} opacity={firing ? 1 : 0.75} />
        {/* Trigger pad */}
        <circle cx="75" cy="144" r="5.5" fill={firing ? webColour : "#333"} stroke={INK} strokeWidth="2.5" />

        {/* Nozzle pointing up from wrist towards aim axis */}
        <path d="M67 136 L67 126 Q75 120 83 126 L83 136 Z" fill="#232323" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />

        {/* Web Shooting Blast Animation */}
        {firing && (
          <g opacity="0.95" strokeLinecap="round">
            {/* Energy core & glow ring */}
            <circle cx="75" cy="123" r="16" fill={webColour} opacity="0.3" />
            <circle cx="75" cy="123" r="9" fill={webColour} opacity="0.7" />
            <circle cx="75" cy="123" r="4.5" fill="#ffffff" />

            {/* Radial web blast strands launching out from nozzle */}
            <path d="M75 120 L42 72 M75 120 L58 60 M75 120 L75 52 M75 120 L92 60 M75 120 L108 72" stroke={webColour} strokeWidth="2.4" fill="none" />
            <path d="M75 120 L50 82 M75 120 L66 68 M75 120 L84 68 M75 120 L100 82" stroke="#ffffff" strokeWidth="1.3" fill="none" />
          </g>
        )}
      </g>

      {/* Web pattern on the glove, drawn last so it sits over the fill */}
      <g stroke={INK} strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round">
        <path d="M48 112 Q74 104 102 112" />
        <path d="M50 124 Q74 116 102 124" />
        <path d="M52 230 Q75 222 100 230 M50 200 Q75 192 102 200 M48 168 Q75 160 104 168" />
        <path d="M60 230 L62 116 M75 230 L75 112 M90 230 L88 116" />
      </g>

      {/* Form shading across the whole limb. */}
      <path d="M42 132 Q38 96 46 80 Q52 68 72 66 Q94 66 102 80 Q110 96 106 132 L102 230 L48 230 Z" fill="url(#shade)" stroke="none" pointerEvents="none" />
    </svg>
  );
}

/**
 * The web that sticks to an answer.
 *
 * Anchored at the point that was actually hit, so shooting the left edge of
 * an option puts the web on the left edge. Drawn behind the label and kept
 * translucent — this sits on text somebody is reading against a clock, so it
 * must never be the reason they misread it.
 */
const WEB_SIZE = 300;

export function WebNet({
  colour,
  originX = 50,
  originY = 50,
  animate = true,
}: {
  colour: string;
  /** Impact point as a percentage of the option box. */
  originX?: number;
  originY?: number;
  animate?: boolean;
}) {
  // A real cobweb — public/quiz/web.svg — used as a CSS MASK rather than an
  // <img>. A mask takes only the alpha of the artwork, so the colour comes
  // from the background underneath it, which is how the same file recolours
  // per character.
  //
  // THREE nested elements, each doing exactly one job:
  //   1. positioner — centres the box on the impact point (transform: translate)
  //   2. animator   — the landing scale (transform: scale) + rim fade
  //   3. web        — the cobweb mask, coloured by the background beneath it
  // Collapsing these loses the centring: the landing animation's
  // `transform: scale(...)` would replace the inline `translate(-50%,-50%)`
  // that centres the web on the impact point (fill-mode `both` makes it
  // stick), putting the web well off from where it was actually shot.
  return (
    <span
      className="pointer-events-none absolute"
      style={{ left: `${originX}%`, top: `${originY}%`, width: WEB_SIZE, height: WEB_SIZE, transform: "translate(-50%, -50%)" }}
      aria-hidden="true"
    >
      <span
        className={`absolute inset-0 ${animate ? "web-land" : ""}`}
        style={{
          // Rim fade, so the webbing tears off rather than ending on a circle.
          WebkitMaskImage: "radial-gradient(circle, #000 45%, transparent 72%)",
          maskImage: "radial-gradient(circle, #000 45%, transparent 72%)",
        }}
      >
        <span
          className="absolute inset-0"
          style={{
            backgroundColor: colour,
            opacity: 0.7,
            WebkitMaskImage: "url(/quiz/web.svg)",
            maskImage: "url(/quiz/web.svg)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
        {/* Impact splat, dead centre — which is where the strand landed. */}
        <span
          className="absolute rounded-full"
          style={{ left: "50%", top: "50%", width: 13, height: 13, transform: "translate(-50%, -50%)", background: colour, opacity: 0.75 }}
        />
      </span>
    </span>
  );
}

/**
 * Each character's crosshair. This is the most-seen piece of their identity —
 * it's on screen for the entire round — so it does the heavy lifting a full
 * reskin would otherwise have to, at none of the legibility cost.
 */
function Reticle({ shape, colour, locked }: { shape: ReticleShape; colour: string; locked: boolean }) {
  const s = RETICLE_SIZE;
  const c = s / 2;
  const stroke = locked ? 2.5 : 1.75;
  const common = { stroke: colour, strokeWidth: stroke, fill: "none" as const };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ filter: `drop-shadow(0 0 4px ${colour}66)` }}>
      {shape === "spray" && (
        <>
          <circle cx={c} cy={c} r={c - 5} {...common} strokeDasharray="3 4" opacity={0.95} />
          <circle cx={c} cy={c} r={2} fill={colour} />
        </>
      )}
      {shape === "ribbon" && (
        <>
          <path d={`M4 ${c} A ${c - 4} ${c - 4} 0 0 1 ${s - 4} ${c}`} {...common} strokeLinecap="round" />
          <path d={`M6 ${c + 4} A ${c - 6} ${c - 6} 0 0 0 ${s - 6} ${c + 4}`} {...common} strokeLinecap="round" opacity={0.55} />
          <circle cx={c} cy={c} r={1.8} fill={colour} />
        </>
      )}
      {shape === "hex" && (
        <>
          <polygon points={`${c},3 ${s - 4},${c / 2 + 3} ${s - 4},${s - c / 2 - 3} ${c},${s - 3} 4,${s - c / 2 - 3} 4,${c / 2 + 3}`} {...common} />
          <line x1={c} y1={c - 6} x2={c} y2={c + 6} {...common} />
          <line x1={c - 6} y1={c} x2={c + 6} y2={c} {...common} />
        </>
      )}
      {shape === "classic" && (
        <>
          <circle cx={c} cy={c} r={c - 7} {...common} opacity={0.7} />
          <line x1={c} y1={1} x2={c} y2={s - 1} {...common} />
          <line x1={1} y1={c} x2={s - 1} y2={c} {...common} />
        </>
      )}
    </svg>
  );
}
