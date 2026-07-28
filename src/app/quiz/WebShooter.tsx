"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReticleShape } from "@/lib/quiz/avatars";

/**
 * First-person web-shooter cursor: a gloved forearm anchored at the bottom of
 * the screen aims wherever the pointer goes, a character-specific reticle
 * sits at the pointer, and firing lands a web on whatever was under it.
 *
 * THE IMPORTANT PART IS WHAT THIS DOESN'T DO. Aiming adds no step to
 * answering — a click is still a click. The options underneath stay ordinary
 * buttons, so keyboard, screen reader and touch all keep working; this layer
 * is decoration over a working control.
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

      const anchorX = window.innerWidth / 2;
      const anchorY = window.innerHeight;
      const dx = e.clientX - anchorX;
      const dy = e.clientY - anchorY;
      const len = Math.hypot(dx, dy) || 1;

      const id = nextId.current++;
      setStrands((s) => [
        ...s,
        { id, x: e.clientX, y: e.clientY, fromX: anchorX + (dx / len) * ARM_LENGTH, fromY: anchorY + (dy / len) * ARM_LENGTH },
      ]);
      setRecoil(true);
      window.setTimeout(() => setRecoil(false), 140);
      window.setTimeout(() => setStrands((s) => s.filter((strand) => strand.id !== id)), 420);
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

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("web-shooter-active");
    return () => document.documentElement.classList.remove("web-shooter-active");
  }, [enabled]);

  if (!enabled) return null;

  const anchorX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
  const anchorY = typeof window !== "undefined" ? window.innerHeight : 0;
  const aim = pos ? (Math.atan2(pos.x - anchorX, anchorY - pos.y) * 180) / Math.PI : 0;
  const armAngle = Math.max(-62, Math.min(62, aim));

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998]" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {strands.map((s) => (
          <g key={s.id} className={reducedMotion ? "" : "strand"}>
            <line x1={s.fromX} y1={s.fromY} x2={s.x} y2={s.y} stroke={webColour} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
            <line x1={s.fromX} y1={s.fromY} x2={s.x + 6} y2={s.y + 4} stroke={webColour} strokeWidth={1} opacity={0.4} />
            <line x1={s.fromX} y1={s.fromY} x2={s.x - 5} y2={s.y + 5} stroke={webColour} strokeWidth={1} opacity={0.4} />
          </g>
        ))}
      </svg>

      <div
        className="absolute bottom-0 left-1/2"
        style={{
          transform: `translateX(-50%) rotate(${armAngle}deg) translateY(${recoil ? 42 : 30}px)`,
          transformOrigin: "50% 100%",
          transition: reducedMotion ? "none" : "transform 120ms cubic-bezier(.2,.8,.3,1)",
        }}
      >
        <ShooterArm colour={colour} webColour={webColour} gloveColour={gloveColour} firing={recoil} />
      </div>

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

function darken(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function ShooterArm({ colour, webColour, gloveColour, firing }: { colour: string; webColour: string; gloveColour: string; firing: boolean }) {
  const INK = "#0A0A0A";
  const sleeve = darken(colour, 0.25);
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

      <path d="M48 230 L44 138 Q44 118 60 112 L90 112 Q106 118 106 138 L102 230 Z" fill="url(#sleeve-grad)" stroke={INK} strokeWidth="5" strokeLinejoin="round" />

      <path d="M104 128 Q118 118 120 100 Q122 84 112 78 Q103 74 99 84 Q96 96 97 112 Z" fill={darken(gloveColour, 0.14)} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M106 116 Q113 108 113 96" stroke={INK} strokeWidth="2" fill="none" opacity="0.55" />

      <path
        d="M42 132 Q38 96 46 80 Q52 68 72 66 Q94 66 102 80 Q110 96 106 132 Q94 140 74 140 Q54 140 42 132 Z"
        fill={gloveColour}
        stroke={INK}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <g stroke={INK} strokeWidth="2.4" fill="none" opacity="0.75" strokeLinecap="round">
        <path d="M46 96 Q74 88 104 96" />
        <path d="M58 92 L58 132 M74 88 L74 138 M90 92 L90 132" />
      </g>

      <path d="M46 84 Q40 52 44 30 Q46 18 56 18 Q66 18 65 32 Q63 56 62 78 Z" fill={gloveColour} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M102 86 Q108 60 106 44 Q104 32 95 33 Q86 34 87 46 Q88 64 88 80 Z" fill={gloveColour} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />

      <rect x="40" y="124" width="70" height="20" rx="4" fill="#141414" stroke={INK} strokeWidth="4" />
      <g stroke={webColour} strokeWidth="1.8" opacity="0.6" fill="none">
        <path d="M46 128 L46 140 M58 126 L58 142 M75 126 L75 142 M92 126 L92 142 M104 128 L104 140" />
      </g>

      <rect x="56" y="104" width="38" height="26" rx="5" fill={metal} stroke={INK} strokeWidth="4" />
      <rect x="61" y="122" width="28" height="5" rx="2" fill={webColour} opacity="0.75" />
      <circle cx="75" cy="114" r="6" fill={firing ? webColour : "#333"} stroke={INK} strokeWidth="2.5" />

      <path d="M67 104 L67 92 Q75 86 83 92 L83 104 Z" fill="#232323" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      {firing && (
        <>
          <circle cx="75" cy="92" r="11" fill={webColour} opacity="0.4" />
          <circle cx="75" cy="92" r="5" fill={webColour} opacity="0.85" />
        </>
      )}

      <g stroke={INK} strokeWidth="1.5" fill="none" opacity="0.4" strokeLinecap="round">
        <path d="M48 112 Q74 104 102 112" />
        <path d="M50 124 Q74 116 102 124" />
        <path d="M52 230 Q75 222 100 230 M50 200 Q75 192 102 200 M48 168 Q75 160 104 168" />
        <path d="M60 230 L62 116 M75 230 L75 112 M90 230 L88 116" />
      </g>

      <path
        d="M42 132 Q38 96 46 80 Q52 68 72 66 Q94 66 102 80 Q110 96 106 132 L102 230 L48 230 Z"
        fill="url(#shade)"
        stroke="none"
        pointerEvents="none"
      />
    </svg>
  );
}

/**
 * The web that sticks to an answer. Anchored at the point that was actually
 * hit. Drawn behind the label and kept translucent — this sits on text
 * somebody is reading against a clock, so it must never be why they misread
 * it.
 *
 * `public/quiz/web.svg` (CC0, Wikimedia Commons) is used as a CSS mask so its
 * colour comes from the background underneath, which is how one downloaded
 * file recolours per character.
 */
const WEB_SIZE = 260;

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
        <span
          className="absolute rounded-full"
          style={{ left: "50%", top: "50%", width: 13, height: 13, transform: "translate(-50%, -50%)", background: colour, opacity: 0.75 }}
        />
      </span>
    </span>
  );
}

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
