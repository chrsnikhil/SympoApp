"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUniverse } from "./UniverseContext";
import SpiderWebCorners from "./SpiderWebCorners";
import WebShooter from "./WebShooter";
import CenterSpiderWeb from "./CenterSpiderWeb";

/* ── Particle generator (client-only to avoid hydration mismatch) ──────── */
interface ParticleData {
  id: number;
  left: string;
  size: number;
  duration: number;
  delay: number;
}

function makeParticles(count: number): ParticleData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 4,
    duration: 6 + Math.random() * 10,
    delay: Math.random() * 8,
  }));
}

function Particles({ color = "var(--glitch-cyan)" }: { color?: string }) {
  const [particles, setParticles] = useState<ParticleData[]>([]);

  useEffect(() => {
    setParticles(makeParticles(18));
  }, []);

  return (
    <div className="universe-particles">
      {particles.map((p) => (
        <div
          key={p.id}
          className="universe-particle"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * PAGE 1 — Team Entry
 * ══════════════════════════════════════════════════════════════════════════ */
export default function TeamEntryPage() {
  const [input, setInput] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { setTeamNumber, setUniverseIndex, reset } = useUniverse();
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const num = parseInt(input, 10);
      if (isNaN(num) || num < 1) return;

      reset();
      setTeamNumber(num);
      setUniverseIndex(((num % 8) + 8) % 8);
      setIsTransitioning(true);

      // Slight delay for transition animation, then proceed to Page 2 (Step 02)
      setTimeout(() => {
        router.push("/universe/step2");
      }, 300);
    },
    [input, setTeamNumber, setUniverseIndex, router]
  );

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden py-10">
      {/* Background layers */}
      <div className="web-bg" />
      <Particles />
      <div className="universe-scanlines" />

      {/* Spider-Man themed decorations */}
      <SpiderWebCorners />
      <CenterSpiderWeb />
      <WebShooter targetSelector="#crack-code-btn" />

      {/* Top Disclaimer Line */}
      <div className="relative z-20 w-full max-w-md mx-auto mb-4 px-4">
        <div className="flex items-center justify-center gap-2 py-2 px-4 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs md:text-sm font-mono tracking-wide uppercase text-center backdrop-blur-md shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse">
          <span className="font-bold text-amber-400">⚠️ DISCLAIMER:</span>
          <span>please read the page carefully</span>
        </div>
      </div>

      {/* Main card */}
      <div
        className={`universe-fade-in relative z-10 w-full max-w-md mx-4 ${
          isTransitioning ? "opacity-0 scale-95 transition-all duration-300" : ""
        }`}
      >
        <form
          onSubmit={handleSubmit}
          className="panel halftone p-8 md:p-10 flex flex-col items-center gap-6 relative"
        >
          {/* Header Row: Step Badge + Top Right Question Mark */}
          <div className="w-full flex items-center justify-between">
            <span className="universe-step-badge">Step 01</span>
            
            {/* Question mark symbol button */}
            <button
              type="button"
              onClick={() => setShowHint(true)}
              title="Click for hint"
              className="w-9 h-9 rounded-full border-2 border-cyan-400 bg-cyan-950/80 text-cyan-300 font-bold font-mono text-xl flex items-center justify-center hover:bg-cyan-400 hover:text-black hover:scale-110 transition-all shadow-[0_0_12px_rgba(0,245,212,0.4)] cursor-pointer"
            >
              ?
            </button>
          </div>

          {/* Title */}
          <h1 className="display-title chromatic text-3xl md:text-4xl text-center">
            Enter Your Team Number
          </h1>

          {/* Decorative divider */}
          <div className="punk-divider w-full" />

          {/* Input dialogue box */}
          <div className="w-full">
            <label
              htmlFor="team-number-input"
              className="block text-xs text-cyan-300/80 font-mono tracking-wider uppercase mb-2 text-center"
            >
              Team Registration ID
            </label>
            <input
              id="team-number-input"
              type="number"
              min={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. 42"
              className="universe-input"
              autoFocus
              autoComplete="off"
            />
          </div>

          {/* Submit button */}
          <button
            id="crack-code-btn"
            type="submit"
            disabled={!input || parseInt(input, 10) < 1}
            className="comic-btn w-full text-lg tracking-wider"
          >
            Continue to Step 2 →
          </button>

          {/* Subtle footer text */}
          <p className="text-xs text-center text-cyan-300/70 font-mono tracking-wide font-medium">
            FIND YOUR UNIVERSE // SPIDER-VERSE TEAM ROUTER
          </p>
        </form>
      </div>

      {/* Secret Hint Modal (% 8) */}
      {showHint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={() => setShowHint(false)}
        >
          <div
            className="relative w-full max-w-xs p-6 bg-slate-900 border-2 border-cyan-400 rounded-lg shadow-[0_0_35px_rgba(0,245,212,0.6)] text-center halftone"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowHint(false)}
              className="absolute top-2 right-3 text-cyan-400 hover:text-white font-bold text-xl cursor-pointer"
            >
              ✕
            </button>
            <div className="text-xs text-cyan-400/80 uppercase tracking-widest mb-1 font-mono">
              SECRET HINT
            </div>
            <div className="text-4xl font-extrabold text-cyan-300 chromatic my-4 tracking-widest font-mono">
              % 8
            </div>
            <button
              type="button"
              onClick={() => setShowHint(false)}
              className="comic-btn w-full text-sm py-2"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
