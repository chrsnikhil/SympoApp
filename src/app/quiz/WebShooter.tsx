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
 * Drawn entirely in SVG — no external image. That's what makes it recolour
 * per character for free, stay sharp at any density, and have a real
 * transparent background instead of a raster photo that needs masking
 * tricks to not look like a floating rectangle. It's also what keeps this
 * original: shapes and colours, not a licensed character's likeness — the
 * assets repo this event draws from is explicit that the theme is carried
 * by the interface, not by borrowed frames.
 *
 * THE IMPORTANT PART IS WHAT THIS DOESN'T DO. Aiming adds no step to
 * answering — a click is still a click. The options underneath stay
 * ordinary buttons, so keyboard, screen reader and touch all keep working;
 * this layer is decoration over a working control.
 *
 * Inert unless the device has a fine pointer. Under prefers-reduced-motion
 * the arm still aims but nothing animates.
 */

interface Strand {
  id: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
}

const RETICLE_SIZE = 34;
/** Distance from the wrist anchor to the nozzle, in px. */
const ARM_LENGTH = 96;

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
  const [strands, setStrands] = useState<Strand[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [recoil, setRecoil] = useState(false);
  const nextId = useRef(0);

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

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: PointerEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setLocked(isTarget(e.clientX, e.clientY));
    };

    const onDown = (e: PointerEvent) => {
      if (!isTarget(e.clientX, e.clientY)) return;

      // Fire from the nozzle, which is ARM_LENGTH along the aim vector from
      // the wrist anchor — otherwise the strand visibly leaves from the elbow.
      const anchorX = window.innerWidth / 2;
      const anchorY = window.innerHeight;
      const dx = e.clientX - anchorX;
      const dy = e.clientY - anchorY;
      const len = Math.hypot(dx, dy) || 1;

      const id = nextId.current++;
      setStrands((s) => [
        ...s,
        {
          id,
          x: e.clientX,
          y: e.clientY,
          fromX: anchorX + (dx / len) * ARM_LENGTH,
          fromY: anchorY + (dy / len) * ARM_LENGTH,
        },
      ]);
      setRecoil(true);
      window.setTimeout(() => setRecoil(false), 140);
      window.setTimeout(() => {
        setStrands((s) => s.filter((strand) => strand.id !== id));
      }, 420);
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
    };
  }, [enabled, isTarget]);

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
      {/* Fired strands: nozzle → point of impact. */}
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {strands.map((s) => (
          <g key={s.id} className={reducedMotion ? "" : "strand"}>
            <line x1={s.fromX} y1={s.fromY} x2={s.x} y2={s.y} stroke={webColour} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
            {/* A couple of stray filaments so it reads as webbing, not a laser. */}
            <line x1={s.fromX} y1={s.fromY} x2={s.x + 6} y2={s.y + 4} stroke={webColour} strokeWidth={1} opacity={0.4} />
            <line x1={s.fromX} y1={s.fromY} x2={s.x - 5} y2={s.y + 5} stroke={webColour} strokeWidth={1} opacity={0.4} />
          </g>
        ))}
      </svg>

      {/* The shooter itself — a gloved forearm that pivots at the wrist. */}
      <div
        className="absolute bottom-0 left-1/2"
        style={{
          // Sits partly below the fold, like an FPV weapon — enough of it is
          // visible to read as a web-shooter without it covering an answer.
          // translateY runs along the rotated axis, so recoil kicks back down
          // the arm rather than straight down the screen.
          transform: `translateX(-50%) rotate(${armAngle}deg) translateY(${recoil ? 42 : 30}px)`,
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

      <style jsx>{`
        .strand {
          animation: strand-fire 420ms ease-out forwards;
        }
        @keyframes strand-fire {
          0% {
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          65% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
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
    <svg width={150} height={230} viewBox="0 0 150 230" style={{ display: "block" }}>
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

      {/* Forearm: darkest value */}
      <path d="M48 230 L44 138 Q44 118 60 112 L90 112 Q106 118 106 138 L102 230 Z" fill="url(#sleeve-grad)" stroke={INK} strokeWidth="5" strokeLinejoin="round" />

      {/* Thumb: wraps across the near side of the fist. Without it the hand
          reads as a mitten — the thumb is what makes it a hand. */}
      <path
        d="M104 128 Q118 118 120 100 Q122 84 112 78 Q103 74 99 84 Q96 96 97 112 Z"
        fill={darken(gloveColour, 0.14)}
        stroke={INK}
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      <path d="M106 116 Q113 108 113 96" stroke={INK} strokeWidth="2" fill="none" opacity="0.55" />

      {/* Fist, knuckles toward the target */}
      <path
        d="M42 132 Q38 96 46 80 Q52 68 72 66 Q94 66 102 80 Q110 96 106 132 Q94 140 74 140 Q54 140 42 132 Z"
        fill={glove}
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* Knuckle line + finger creases: what makes it read as a fist. */}
      <g stroke={INK} strokeWidth="2.4" fill="none" opacity="0.75" strokeLinecap="round">
        <path d="M46 96 Q74 88 104 96" />
        <path d="M58 92 L58 132 M74 88 L74 138 M90 92 L90 132" />
      </g>

      {/* Index and pinky extended; middle and ring folded to the trigger.
          The pose is the whole silhouette — without it this is just a fist. */}
      <path d="M46 84 Q40 52 44 30 Q46 18 56 18 Q66 18 65 32 Q63 56 62 78 Z" fill={glove} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M102 86 Q108 60 106 44 Q104 32 95 33 Q86 34 87 46 Q88 64 88 80 Z" fill={glove} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />

      {/* Web-shooter: neutral metal, so the device never competes with the
          glove for attention. Its only colour is the web accent. */}
      <rect x="40" y="124" width="70" height="20" rx="4" fill="#141414" stroke={INK} strokeWidth="4" />
      <g stroke={webColour} strokeWidth="1.8" opacity="0.6" fill="none">
        <path d="M46 128 L46 140 M58 126 L58 142 M75 126 L75 142 M92 126 L92 142 M104 128 L104 140" />
      </g>

      <rect x="56" y="104" width="38" height="26" rx="5" fill={metal} stroke={INK} strokeWidth="4" />
      {/* Cartridge window — shows the web fluid in the character's colour. */}
      <rect x="61" y="122" width="28" height="5" rx="2" fill={webColour} opacity="0.75" />
      {/* Trigger pad — lights up on fire. */}
      <circle cx="75" cy="114" r="6" fill={firing ? webColour : "#333"} stroke={INK} strokeWidth="2.5" />

      {/* Nozzle, pointing up the aim axis. */}
      <path d="M67 104 L67 92 Q75 86 83 92 L83 104 Z" fill="#232323" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      {firing && (
        <>
          <circle cx="75" cy="92" r="11" fill={webColour} opacity="0.4" />
          <circle cx="75" cy="92" r="5" fill={webColour} opacity="0.85" />
        </>
      )}

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
