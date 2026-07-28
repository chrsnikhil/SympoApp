"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReticleShape } from "@/lib/quiz/avatars";

/**
 * A static hand image, fixed in the bottom-right corner, firing a physically
 * simulated web strand at whatever `[data-web-target]` element was actually
 * clicked. Decoration over a working control: this never calls
 * preventDefault or stopPropagation, so keyboard, screen reader and touch
 * interaction with the real button are completely unaffected.
 *
 * The image lives at `/quiz/webshooter-hand.png` — an original piece
 * generated from a prompt written specifically to avoid any licensed
 * character's suit pattern, insignia or specific gauntlet design. It's
 * rendered with `mix-blend-mode: screen`, which is what makes its own dark
 * background melt into this app's already-dark page background even if the
 * source file isn't a clean alpha-transparent PNG — black pixels vanish,
 * only the bright glove/glow survives.
 *
 * The web itself is a real verlet-integrated rope simulation (gravity +
 * iterative distance constraints across ~14 points), not a pre-drawn curve —
 * that's what gives it natural sag in flight and a genuine spring-back on
 * impact. It renders on its own full-viewport 2D canvas, launching from
 * wherever the hand image's marked muzzle point actually sits on screen.
 */

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
 *  highlight — is what reads as sticky/wet rather than a flat cartoon line. */
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

const HAND_IMAGE = "/quiz/webshooter-hand.png";

export default function WebShooter({
  webColour = "#ffffff",
}: {
  colour?: string;
  webColour?: string;
  gloveColour?: string;
  shape?: ReticleShape;
}) {
  const [enabled, setEnabled] = useState(false);
  const [imageOk, setImageOk] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const muzzleRef = useRef<HTMLDivElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  const rafRef = useRef<number | null>(null);
  const webColourRef = useRef(webColour);

  useEffect(() => {
    webColourRef.current = webColour;
  }, [webColour]);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(fine.matches && !motion.matches);
    sync();
    fine.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
    };
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

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest<HTMLElement>("[data-web-target]");
      if (!btn || btn.hasAttribute("disabled")) return;

      const rect = btn.getBoundingClientRect();
      const muzzle = muzzleRef.current?.getBoundingClientRect();
      const nozzle = muzzle
        ? { x: muzzle.left + muzzle.width / 2, y: muzzle.top + muzzle.height / 2 }
        : { x: window.innerWidth - 60, y: window.innerHeight - 30 };

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

      if (handRef.current) {
        handRef.current.classList.remove("web-shooter-recoil");
        void handRef.current.offsetWidth; // restart the CSS animation
        handRef.current.classList.add("web-shooter-recoil");
      }
      playThwip();
    };

    window.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, startLoop]);

  if (!enabled || !imageOk) return null;

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[9998]" aria-hidden="true" />
      <div className="pointer-events-none fixed bottom-0 right-0 z-[9998]" aria-hidden="true">
        <div ref={handRef} className="web-shooter-idle relative" style={{ width: 190, height: 260 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HAND_IMAGE}
            alt=""
            onError={() => setImageOk(false)}
            className="h-full w-full object-contain object-bottom"
            style={{ mixBlendMode: "screen" }}
          />
          {/* Muzzle marker — where the fingertips/glow converge near the top
              of the frame. Percentage-based since the exact source image's
              proportions can change without touching this code. */}
          <div ref={muzzleRef} className="absolute" style={{ left: "45%", top: "10%", width: 8, height: 8 }} />
        </div>
      </div>
      <style jsx global>{`
        .web-shooter-idle {
          animation: web-shooter-sway 2.8s ease-in-out infinite;
        }
        @keyframes web-shooter-sway {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-6px) rotate(-0.6deg);
          }
        }
        .web-shooter-recoil {
          animation:
            web-shooter-sway 2.8s ease-in-out infinite,
            web-shooter-fire 270ms ease-out;
        }
        @keyframes web-shooter-fire {
          0% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
          35% {
            transform: translateY(-14px) rotate(-4deg) scale(1.03);
          }
          100% {
            transform: translateY(0) rotate(0deg) scale(1);
          }
        }
        .web-caught {
          animation: web-caught-shake 90ms ease-in-out 2;
          filter: saturate(0.75);
        }
        @keyframes web-caught-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(2px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .web-shooter-idle,
          .web-shooter-recoil,
          .web-caught {
            animation: none !important;
          }
        }
      `}</style>
    </>
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
 * Static decorative "web sticker" — used for corner flourishes and the
 * selected-option / round-transition backdrop. Unrelated to the physics
 * shooter above; kept as its own tiny component since callers use it purely
 * as a stamped mask image, not an animated simulation.
 */
const WEB_SIZE = 280;

export function WebNet({ colour, originX = 50, originY = 50, animate = true }: { colour: string; originX?: number; originY?: number; animate?: boolean }) {
  return (
    <span
      className="pointer-events-none absolute"
      style={{ left: `${originX}%`, top: `${originY}%`, width: WEB_SIZE, height: WEB_SIZE, transform: "translate(-50%, -50%)" }}
      aria-hidden="true"
    >
      <span
        className={`absolute inset-0 ${animate ? "web-land" : ""}`}
        style={{
          WebkitMaskImage: "radial-gradient(circle, #000 48%, transparent 74%)",
          maskImage: "radial-gradient(circle, #000 48%, transparent 74%)",
        }}
      >
        <span
          className="absolute inset-0"
          style={{
            backgroundColor: colour,
            opacity: 0.75,
            WebkitMaskImage: "url(/quiz/web.svg)",
            maskImage: "url(/quiz/web.svg)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            filter: `drop-shadow(0 0 6px ${colour}88)`,
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            left: "50%",
            top: "50%",
            width: 14,
            height: 14,
            transform: "translate(-50%, -50%)",
            background: colour,
            opacity: 0.85,
            boxShadow: `0 0 10px ${colour}`,
          }}
        />
      </span>
    </span>
  );
}
