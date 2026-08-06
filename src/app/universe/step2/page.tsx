"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
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
 * PAGE 2 — Fill in the Value of n (Step 02)
 * ══════════════════════════════════════════════════════════════════════════ */
export default function Step2ValueNPage() {
  const [nInput, setNInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const { teamNumber, setUniverseIndex } = useUniverse();
  const router = useRouter();

  // Guard: if user lands here without teamNumber, send back to Page 1
  useEffect(() => {
    if (teamNumber === null) {
      router.replace("/universe");
    }
  }, [teamNumber, router]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setErrorMsg("");
      
      const parsedN = parseInt(nInput, 10);
      if (isNaN(parsedN) || parsedN < 0 || parsedN > 7) {
        setErrorMsg("The value of n must be an integer between 0 and 7.");
        return;
      }

      if (teamNumber !== null) {
        const expectedN = ((teamNumber % 8) + 8) % 8;
        if (parsedN !== expectedN) {
          setErrorMsg(`Incorrect value of n for Team #${teamNumber}. Please verify your calculation.`);
          return;
        }
      }

      setUniverseIndex(parsedN);
      setIsTransitioning(true);

      // Transition animation before entering universe reveal
      setTimeout(() => {
        router.push("/universe/reveal");
      }, 300);
    },
    [nInput, teamNumber, setUniverseIndex, router]
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
      <WebShooter targetSelector="#verify-n-btn" />


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
          {/* Header Row: Step Badge + Team Number Badge */}
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="universe-step-badge">Step 02</span>
              {teamNumber !== null && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30 text-cyan-300">
                  Team #{teamNumber}
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h1 className="display-title chromatic text-3xl md:text-4xl text-center">
            Fill in the Value of n
          </h1>

          {/* Decorative divider */}
          <div className="punk-divider w-full" />

          {/* Input dialogue box */}
          <div className="w-full">
            <label
              htmlFor="n-value-input"
              className="block text-xs text-cyan-300/80 font-mono tracking-wider uppercase mb-2 text-center"
            >
              Universe Parameter (n)
            </label>
            <input
              id="n-value-input"
              type="number"
              min={0}
              max={7}
              value={nInput}
              onChange={(e) => {
                setNInput(e.target.value);
                setErrorMsg("");
              }}
              placeholder=""
              className="universe-input"
              autoFocus
              autoComplete="off"
            />
          </div>

          {/* Error Message Display */}
          {errorMsg && (
            <div className="w-full p-3 rounded bg-red-950/80 border border-red-500 text-red-300 text-xs font-mono text-center animate-shake">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Submit button */}
          <button
            id="verify-n-btn"
            type="submit"
            disabled={nInput === ""}
            className="comic-btn w-full text-lg tracking-wider"
          >
            Crack Your Code →
          </button>

          {/* Subtle footer text */}
          <p className="text-xs text-center text-cyan-300/70 font-mono tracking-wide font-medium">
            SPIDER-VERSE PARAMETER VERIFIER
          </p>
        </form>
      </div>
    </div>
  );
}
