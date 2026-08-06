"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUniverse } from "../UniverseContext";
import SpiderWebCorners from "../SpiderWebCorners";
import WebShooter from "../WebShooter";
import CenterSpiderWeb from "../CenterSpiderWeb";

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

function Particles({ color = "var(--punk-magenta)" }: { color?: string }) {
  const [particles, setParticles] = useState<ParticleData[]>([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional:
  // random particle data must differ from the SSR pass to avoid hydration
  // mismatches; useEffect is the canonical pattern for client-only init.
  useEffect(() => {
    setParticles(makeParticles(14));
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
 * SCREEN 2 — Crack the Code (v2)
 *
 * The n%8 formula is NO LONGER shown on screen. Participants must work
 * it out themselves. After 2+ wrong attempts a subtle hint appears.
 *
 * On correct answer the portal video transition plays (via layout-level
 * PortalOverlay).  At video midpoint the registered callback navigates
 * to the universe landing page, which then plays a portal-emerge animation.
 * ══════════════════════════════════════════════════════════════════════════ */
export default function CrackPage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const {
    teamNumber,
    setUniverseIndex,
  } = useUniverse();
  const router = useRouter();

  // Guard: redirect back if no team number
  useEffect(() => {
    if (teamNumber === null) {
      router.replace("/universe");
    }
  }, [teamNumber, router]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (teamNumber === null) return;

      const userAnswer = parseInt(input, 10);
      const correctIndex = teamNumber % 8;

      if (userAnswer === correctIndex) {
        // ── Success: navigate to colour reveal step ─────────────────
        setError("");
        setUniverseIndex(correctIndex);

        // Warp-out the card then navigate to reveal
        setIsTransitioning(true);
        setTimeout(() => {
          router.push("/universe/reveal");
        }, 400);
      } else {
        // Wrong answer → shake + error
        setError("Wrong dimension. Recalculate and try again.");
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      }
    },
    [
      input,
      teamNumber,
      setUniverseIndex,
      router,
    ],
  );

  if (teamNumber === null) return null;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background layers */}
      <div className="web-bg" />
      <Particles />
      <div className="universe-scanlines" />

      {/* Spider-Man themed decorations */}
      <SpiderWebCorners />
      <CenterSpiderWeb />
      <WebShooter targetSelector="#warp-in-btn" />

      {/* Main card */}
      <div
        className={`universe-fade-in relative z-10 w-full max-w-lg mx-4 ${
          isTransitioning ? "universe-warp-out" : ""
        } ${shaking ? "universe-shake" : ""}`}
      >
        {/* Step badge */}
        <div className="mb-6 text-center">
          <span className="universe-step-badge">Step 02</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="panel halftone p-8 md:p-10 flex flex-col items-center gap-6"
        >
          {/* Title */}
          <h1 className="display-title chromatic text-3xl md:text-4xl text-center">
            Find Your Universe
          </h1>

          {/* Team number display */}
          <div className="flex items-center gap-2 font-mono text-sm tracking-widest opacity-60">
            <span className="text-glitch-cyan">▸</span>
            <span>Team #{teamNumber}</span>
          </div>

          {/* Decorative divider */}
          <div className="punk-divider w-full" />

          {/* Input */}
          <div className="w-full">
            <label
              htmlFor="universe-input"
              className="block text-xs font-mono text-cyan-300 font-semibold mb-2 tracking-wide uppercase"
            >
              Enter your universe number (0–7)
            </label>
            <input
              id="universe-input"
              type="number"
              min={0}
              max={7}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              placeholder="0–7"
              className="universe-input"
              autoFocus
              autoComplete="off"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="universe-error w-full text-center">
              {error}
            </div>
          )}



          {/* Submit button */}
          <button
            id="warp-in-btn"
            type="submit"
            disabled={input === ""}
            className="comic-btn w-full text-lg tracking-wider"
          >
            Warp In →
          </button>
        </form>
      </div>
    </div>
  );
}
