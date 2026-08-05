"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════════════
 * StrangePortal — Canvas 2D Particle Physics Dr. Strange Sling Ring Portal
 *
 * Replaces the old GreenScreenTransition with a fully procedural portal
 * rendered via Canvas 2D. Hundreds of orange/gold sparks orbit an
 * elliptical ring, creating the iconic sling ring portal effect.
 *
 * Phases:
 *   1. Opening  (0 → 1.5s)  – ring expands, particles coalesce
 *   2. Stable   (1.5 → 3.5s) – ring crackles, midpoint fires here
 *   3. Closing  (3.5 → 4.5s) – ring implodes and fades
 *
 * Props:
 *   active           – starts the transition when flipped to true
 *   onComplete       – fires after the portal closes
 *   onMidpoint       – fires once during the stable phase
 *   midpointFraction – timing ratio (default 0.35)
 * ══════════════════════════════════════════════════════════════════════════ */

/* ── Color palette ─────────────────────────────────────────────────────── */
const COLORS = [
  { r: 255, g: 106, b: 0 },   // Deep orange
  { r: 255, g: 140, b: 0 },   // Dark orange
  { r: 255, g: 179, b: 71 },  // Gold
  { r: 255, g: 200, b: 100 }, // Light gold
  { r: 255, g: 220, b: 150 }, // Pale gold
  { r: 255, g: 245, b: 220 }, // White-hot
  { r: 255, g: 80, b: 0 },    // Red-orange ember
];

/* ── Particle ──────────────────────────────────────────────────────────── */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;        // position on the ring (radians)
  angularVel: number;   // radians per frame
  life: number;
  maxLife: number;
  size: number;
  colorIdx: number;
  trail: { x: number; y: number; alpha: number }[];
  drift: number;        // radial drift from the ring path
  sparkle: number;      // random brightness multiplier
}

/* ── Spark burst (for extra detail) ────────────────────────────────────── */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  colorIdx: number;
}

/* ── Component ─────────────────────────────────────────────────────────── */
interface StrangePortalProps {
  active: boolean;
  onComplete: () => void;
  onMidpoint?: () => void;
  midpointFraction?: number;
}

const TOTAL_DURATION = 4500;        // ms
const OPEN_END = 1500;              // ms
const STABLE_END = 3500;            // ms
const PARTICLE_COUNT = 500;
const TRAIL_LENGTH = 8;
const SPARK_INTERVAL = 80;         // ms between spark bursts

export default function StrangePortal({
  active,
  onComplete,
  onMidpoint,
  midpointFraction = 0.35,
}: StrangePortalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const midpointFiredRef = useRef(false);

  const onCompleteRef = useRef(onComplete);
  const onMidpointRef = useRef(onMidpoint);
  onCompleteRef.current = onComplete;
  onMidpointRef.current = onMidpoint;

  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  /* ── Create a particle at a given ring angle ─────────────────────── */
  const createParticle = useCallback(
    (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      phase: number,
    ): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const angularVel =
        (0.01 + Math.random() * 0.025) * (Math.random() > 0.5 ? 1 : -1);
      const drift = (Math.random() - 0.5) * 30;

      // During opening, particles start scattered; otherwise near ring
      const scatter = phase < 0.3 ? 200 * (1 - phase / 0.3) : 0;
      const px =
        cx +
        Math.cos(angle) * (rx + drift + (Math.random() - 0.5) * scatter);
      const py =
        cy +
        Math.sin(angle) * (ry + drift + (Math.random() - 0.5) * scatter);

      return {
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        angle,
        angularVel,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.6 + Math.random() * 0.4,
        size: 1 + Math.random() * 3,
        colorIdx: Math.floor(Math.random() * COLORS.length),
        trail: [],
        drift,
        sparkle: 0.6 + Math.random() * 0.4,
      };
    },
    [],
  );

  /* ── Main effect — runs the portal animation ─────────────────────── */
  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    setVisible(true);
    setFadeOut(false);
    midpointFiredRef.current = false;

    const ctx = canvas.getContext("2d")!;
    let particles: Particle[] = [];
    let sparks: Spark[] = [];
    let startTime = performance.now();
    let lastSparkTime = 0;

    /* — Resize canvas to fill viewport —————————————————————————————— */
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    /* — Ring geometry ———————————————————————————————————————————————— */
    function getRing(progress: number) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h * 0.45;
      const maxR = Math.min(w, h) * 0.28;

      let scale: number;
      if (progress < OPEN_END / TOTAL_DURATION) {
        // Opening: 0 → 1
        const t = progress / (OPEN_END / TOTAL_DURATION);
        scale = easeOutCubic(t);
      } else if (progress < STABLE_END / TOTAL_DURATION) {
        // Stable: 1
        scale = 1;
      } else {
        // Closing: 1 → 0
        const t =
          (progress - STABLE_END / TOTAL_DURATION) /
          (1 - STABLE_END / TOTAL_DURATION);
        scale = 1 - easeInCubic(t);
      }

      return {
        cx,
        cy,
        rx: maxR * scale * 1.15,  // slightly wider than tall for ellipse
        ry: maxR * scale,
        scale,
      };
    }

    /* — Spawn initial particles ————————————————————————————————————— */
    const ring = getRing(0);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(ring.cx, ring.cy, ring.rx, ring.ry, 0));
    }

    /* — Animation loop —————————————————————————————————————————————— */
    function frame(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TOTAL_DURATION, 1);

      if (progress >= 1) {
        // Animation complete
        cancelAnimationFrame(rafRef.current);
        setFadeOut(true);
        setTimeout(() => {
          setVisible(false);
          setFadeOut(false);
          onCompleteRef.current();
        }, 400);
        return;
      }

      // Fire midpoint
      if (!midpointFiredRef.current && progress >= midpointFraction) {
        midpointFiredRef.current = true;
        onMidpointRef.current?.();
      }

      const { cx, cy, rx, ry, scale } = getRing(progress);
      const w = window.innerWidth;
      const h = window.innerHeight;

      /* — Clear with motion trail ————————————————————————————————— */
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0, 0, 0, ${scale > 0.1 ? 0.25 : 0.5})`;
      ctx.fillRect(0, 0, w, h);

      if (scale < 0.02) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      /* — Inner portal glow ——————————————————————————————————————— */
      const glowAlpha = scale * 0.35;
      const innerGrad = ctx.createRadialGradient(
        cx, cy, 0,
        cx, cy, Math.max(rx, ry) * 0.9,
      );
      innerGrad.addColorStop(0, `rgba(255, 140, 40, ${glowAlpha * 0.6})`);
      innerGrad.addColorStop(0.3, `rgba(255, 100, 0, ${glowAlpha * 0.3})`);
      innerGrad.addColorStop(0.6, `rgba(180, 60, 0, ${glowAlpha * 0.15})`);
      innerGrad.addColorStop(1, `rgba(0, 0, 0, 0)`);

      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = innerGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      /* — Draw portal ring outline (subtle base glow) ————————————— */
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255, 120, 0, ${scale * 0.15})`;
      ctx.lineWidth = 6 + Math.sin(elapsed * 0.003) * 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Second thinner bright ring
      ctx.strokeStyle = `rgba(255, 200, 80, ${scale * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2);
      ctx.stroke();

      /* — Update and draw particles ——————————————————————————————— */
      ctx.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Target position on ring
        const tx = cx + Math.cos(p.angle) * (rx + p.drift);
        const ty = cy + Math.sin(p.angle) * (ry + p.drift);

        // Spring force toward ring
        const springStrength = 0.04 + scale * 0.04;
        p.vx += (tx - p.x) * springStrength;
        p.vy += (ty - p.y) * springStrength;

        // Angular velocity (orbit)
        p.angle += p.angularVel;

        // Drag
        p.vx *= 0.88;
        p.vy *= 0.88;

        // Apply velocity
        p.x += p.vx;
        p.y += p.vy;

        // Decay life
        p.life -= 0.008 + (progress > STABLE_END / TOTAL_DURATION ? 0.015 : 0);

        // Store trail
        p.trail.unshift({ x: p.x, y: p.y, alpha: p.life });
        if (p.trail.length > TRAIL_LENGTH) p.trail.pop();

        // Draw trail
        for (let t = 0; t < p.trail.length; t++) {
          const tr = p.trail[t];
          const trAlpha = tr.alpha * (1 - t / p.trail.length) * 0.5 * p.sparkle;
          const c = COLORS[p.colorIdx];
          ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${trAlpha.toFixed(3)})`;
          const trSize = p.size * (1 - t / p.trail.length) * 0.7;
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, trSize, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw particle
        const c = COLORS[p.colorIdx];
        const alpha = p.life * p.sparkle;
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        if (p.size > 2 && p.sparkle > 0.8) {
          ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.5).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Respawn dead particles (during opening/stable)
        if (p.life <= 0) {
          if (progress < STABLE_END / TOTAL_DURATION) {
            particles[i] = createParticle(cx, cy, rx, ry, progress);
          } else {
            particles.splice(i, 1);
          }
        }
      }

      /* — Spark bursts along the ring ————————————————————————————— */
      if (
        elapsed - lastSparkTime > SPARK_INTERVAL &&
        scale > 0.2 &&
        progress < STABLE_END / TOTAL_DURATION + 0.1
      ) {
        lastSparkTime = elapsed;
        const sparkAngle = Math.random() * Math.PI * 2;
        const sx = cx + Math.cos(sparkAngle) * rx;
        const sy = cy + Math.sin(sparkAngle) * ry;
        const sparkCount = 3 + Math.floor(Math.random() * 5);

        for (let s = 0; s < sparkCount; s++) {
          const speed = 1 + Math.random() * 3;
          const dir = sparkAngle + (Math.random() - 0.5) * 1.5;
          sparks.push({
            x: sx,
            y: sy,
            vx: Math.cos(dir) * speed,
            vy: Math.sin(dir) * speed,
            life: 0.6 + Math.random() * 0.4,
            size: 0.5 + Math.random() * 1.5,
            colorIdx: Math.floor(Math.random() * COLORS.length),
          });
        }
      }

      /* — Update and draw sparks —————————————————————————————————— */
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.02; // slight gravity
        s.life -= 0.02;

        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        const c = COLORS[s.colorIdx];
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${s.life.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      /* — Outer rim hot glow (pulsing) ———————————————————————————— */
      const rimPulse = 0.5 + Math.sin(elapsed * 0.005) * 0.3;
      const rimGrad = ctx.createRadialGradient(
        cx, cy, Math.max(rx, ry) * 0.85,
        cx, cy, Math.max(rx, ry) * 1.2,
      );
      rimGrad.addColorStop(0, `rgba(255, 120, 0, ${scale * rimPulse * 0.12})`);
      rimGrad.addColorStop(0.5, `rgba(255, 80, 0, ${scale * rimPulse * 0.06})`);
      rimGrad.addColorStop(1, `rgba(0, 0, 0, 0)`);
      ctx.fillStyle = rimGrad;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(frame);
    }

    /* — Start ——————————————————————————————————————————————————————— */
    startTime = performance.now();
    rafRef.current = requestAnimationFrame(frame);

    /* — Cleanup ————————————————————————————————————————————————————— */
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      particles = [];
      sparks = [];
    };
  }, [active, midpointFraction, createParticle]);

  if (!visible && !active) return null;

  return (
    <div
      className={`strange-portal-overlay ${visible ? "sp-visible" : ""} ${
        fadeOut ? "sp-fade-out" : ""
      }`}
    >
      <canvas ref={canvasRef} className="sp-canvas" />
    </div>
  );
}

/* ── Easing functions ──────────────────────────────────────────────────── */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}
