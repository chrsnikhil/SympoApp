"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useUniverse } from "../UniverseContext";
import { UNIVERSES, type UniverseTheme } from "../universeData";
import {
  lettersForUniverse,
  isUniverseAnagram,
  type UniverseGridCell,
} from "../universeGrid";

/* ── WCAG AA Contrast helpers ──────────────────────────────────────────── */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const INK_BLACK_LUM = relativeLuminance("#0A0A0A");
const PAPER_WHITE_LUM = relativeLuminance("#F2EFE9");

interface TextTone {
  colour: string;
  haloRgba: string;
}

function textToneFor(hex: string): TextTone {
  const lum = relativeLuminance(hex);
  const onBlack = contrastRatio(lum, INK_BLACK_LUM);
  const onWhite = contrastRatio(lum, PAPER_WHITE_LUM);
  return onBlack >= onWhite
    ? {
        colour: "var(--ink-black)",
        haloRgba: "rgba(242, 239, 233, 0.65)",
      }
    : {
        colour: "var(--paper-white)",
        haloRgba: "rgba(10, 10, 10, 0.65)",
      };
}

/* ── Themed Particles (client-only to avoid hydration mismatch) ─────────── */
interface ParticleData {
  id: number;
  left: string;
  size: number;
  duration: number;
  delay: number;
}

function makeThemedParticles(count: number): ParticleData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 6,
    duration: 5 + Math.random() * 12,
    delay: Math.random() * 10,
  }));
}

function ThemedParticles({ color }: { color: string }) {
  const [particles, setParticles] = useState<ParticleData[]>([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional:
  // random particle data must differ from the SSR pass to avoid hydration
  // mismatches; useEffect is the canonical pattern for client-only init.
  useEffect(() => {
    setParticles(makeThemedParticles(24));
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
 * SCREEN 3 — Universe Landing + 64-Grid Puzzle (v2)
 *
 * Two stacked sections:
 *   3a. Universe header — title, designation, tagline, team arrival
 *   3b. 8×8 letter grid puzzle the team must solve to clear the universe
 *
 * Backend contract:
 *   - Never calls fetch — receives config as props
 *   - onSolve(code) always passes the known-correct constant
 *   - Grid is pre-shuffled server-side via seeded PRNG
 * ══════════════════════════════════════════════════════════════════════════ */

interface UniverseLandingProps {
  index: string;
  gridCells: UniverseGridCell[];
  /** The known-correct word for this universe — NEVER displayed to the user. */
  answerWord: string;
}

export default function UniverseLanding({
  index,
  gridCells,
  answerWord,
}: UniverseLandingProps) {
  const idx = parseInt(index, 10);
  const universe: UniverseTheme | undefined = UNIVERSES[idx];
  const {
    teamNumber,
    universeIndex,
    gridSolved,
    setGridSolved,
    arrivingViaPortal,
    setArrivingViaPortal,
    reset,
  } = useUniverse();
  const router = useRouter();

  // Client-side mounting check — avoids set-state-in-effect
  const subscribeNoop = useCallback((cb: () => void) => { cb(); return () => {}; }, []);
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const [guess, setGuess] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Portal emerge: capture the flag at mount time, clear after animation ends
  const [portalEmerging, setPortalEmerging] = useState(arrivingViaPortal);

  // Guard: redirect if puzzle wasn't solved on Screen 2
  useEffect(() => {
    if (teamNumber === null || universeIndex === null) {
      router.replace("/universe");
    }
  }, [teamNumber, universeIndex, router]);

  // Derive showSuccess from gridSolved (initial sync) — avoids effect setState
  const isSuccessVisible = showSuccess || gridSolved;

  // Per-universe tile colour tones (computed once)
  const tileColors = UNIVERSES.map((u) => u.tileColor);
  const tileTextTones = tileColors.map(textToneFor);

  // Letters for this universe
  const myLetters = lettersForUniverse(gridCells, idx);

  // Normalised guess
  const normalizedGuess = guess.toUpperCase().replace(/[^A-Z]/g, "");

  // Check solve status
  const isSolved =
    normalizedGuess.length > 0 &&
    normalizedGuess === answerWord.toUpperCase();

  // Check anagram (right letters, wrong order)
  const isRightLettersWrongOrder =
    !isSolved &&
    myLetters.length > 0 &&
    isUniverseAnagram(guess, myLetters.join(""));

  // onSolve handler — calls with known constant, never typed text
  const handleSolve = useCallback(() => {
    if (!showSuccess) {
      setShowSuccess(true);
      setGridSolved(true);
    }
  }, [showSuccess, setGridSolved]);

  // Fire solve on correct guess via onChange rather than effect
  const handleGuessChange = useCallback((value: string) => {
    setGuess(value);
    const normalized = value.toUpperCase().replace(/[^A-Z]/g, "");
    if (normalized.length > 0 && normalized === answerWord.toUpperCase()) {
      setShowSuccess(true);
      setGridSolved(true);
    }
  }, [answerWord, setGridSolved]);

  if (!universe || !mounted) return null;

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${
        portalEmerging ? "portal-emerge" : ""
      }`}
      onAnimationEnd={(e) => {
        if (e.animationName === "portal-emerge-kf") {
          setPortalEmerging(false);
          setArrivingViaPortal(false);
        }
      }}
      style={{
        background: universe.bgGradient,
        ["--universe-primary" as string]: universe.primary,
        ["--universe-border-gradient" as string]: universe.borderGradient,
      }}
    >
      {/* Grid background */}
      <div className="universe-grid-bg" />

      {/* Particles */}
      <ThemedParticles color={universe.particleColor} />

      {/* Glowing orbs */}
      <div
        className="universe-orb"
        style={{
          top: "10%",
          right: "15%",
          backgroundColor: universe.primary,
        }}
      />
      <div
        className="universe-orb"
        style={{
          bottom: "10%",
          left: "10%",
          backgroundColor: universe.secondary,
          animationDelay: "2s",
        }}
      />

      {/* Scanlines */}
      <div className="universe-scanlines" />

      {/* ════════════════════════════════════════════════════════════════════
       * SECTION 3a — Universe Header
       * ════════════════════════════════════════════════════════════════════ */}
      <div className="universe-warp-in relative z-10 w-full max-w-3xl mx-auto px-4 pt-12 pb-8">
        {/* Universe badge */}
        <div className="mb-6 text-center">
          <span
            className="universe-step-badge"
            style={{
              background: universe.primary,
              borderColor: universe.secondary,
              color: (idx === 7 || universe.primary === "#E0E0E0") ? "#000000" : undefined,
            }}
          >
            Universe {universe.index}
          </span>
        </div>

        <div className="universe-card p-8 md:p-12 flex flex-col items-center gap-4 text-center">
          {/* Codename — giant title */}
          <h1
            className="display-title text-5xl md:text-7xl lg:text-8xl"
            style={{
              color: universe.primary,
              textShadow: `
                -2px 0 ${universe.secondary},
                 2px 0 ${universe.primary},
                 0 0 40px ${universe.glow},
                 0 0 80px ${universe.glow}
              `,
            }}
          >
            {universe.codename}
          </h1>

          {/* Designation */}
          <p
            className="font-mono text-sm md:text-base tracking-[0.3em] uppercase opacity-70"
            style={{ color: universe.primary }}
          >
            {universe.designation}
          </p>

          {/* Tagline */}
          <p className="text-base md:text-lg opacity-80 italic max-w-sm leading-relaxed">
            &ldquo;{universe.tagline}&rdquo;
          </p>

          {/* Divider */}
          <div
            className="w-full h-[2px]"
            style={{
              background: `linear-gradient(90deg, transparent, ${universe.primary}40, ${universe.secondary}40, transparent)`,
            }}
          />

          {/* Team arrival confirmation */}
          <div
            className="px-6 py-3 font-mono text-sm tracking-wider"
            style={{
              border: `1px solid ${universe.primary}40`,
              background: `${universe.primary}08`,
              color: universe.primary,
            }}
          >
            <span className="opacity-50">▸</span> Team #{teamNumber} has
            arrived in {universe.codename} — {universe.designation}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
       * SECTION 3b — 64-Grid Puzzle
       * ════════════════════════════════════════════════════════════════════ */}
      <div className="universe-fade-in relative z-10 w-full max-w-3xl mx-auto px-4 pb-16">
        <div className="universe-card p-6 md:p-8">
          {/* Puzzle header */}
          <div className="flex items-center gap-3 mb-6">
            <span
              className="punk-sticker"
              style={{
                background: universe.primary,
                borderColor: universe.secondary,
                color: (idx === 7 || universe.primary === "#E0E0E0") ? "#000000" : undefined,
              }}
            >
              Puzzle
            </span>
            <h2 className="display-title text-xl md:text-2xl text-paper-white">
              Decode Your Universe
            </h2>
          </div>

          <p className="text-sm text-paper-white/50 mb-6 font-mono">
            {"// Find your colour's 8 letters in the grid → unscramble them"}
          </p>

          {/* The 8×8 Grid */}
          <div className="universe-grid-container">
            <div className="grid grid-cols-8 gap-[3px] md:gap-1">
              {gridCells.map((cell, i) => {
                const tone = tileTextTones[cell.colour];
                const bg = tileColors[cell.colour];

                return (
                  <div
                    key={i}
                    className="universe-tile relative flex aspect-square items-center justify-center font-bold"
                    style={{
                      background: bg,
                      color: tone.colour,
                      textShadow: `0 0 3px ${tone.haloRgba}`,
                      opacity: 1,
                      borderColor: "rgba(10, 10, 10, 0.3)",
                      boxShadow: "none",
                      fontSize: "clamp(0.65rem, 2.5vw, 0.95rem)",
                    }}
                  >
                    {cell.letter}
                  </div>
                );
              })}
            </div>
          </div>



          <div className="punk-divider" />

          {/* Anagram Input */}
          {!isSuccessVisible ? (
            <div className="space-y-4">
              <label
                htmlFor="unscramble-input"
                className="block text-xs font-mono opacity-40 tracking-wide uppercase"
              >
                Unscramble the letters
              </label>
              <input
                id="unscramble-input"
                value={guess}
                onChange={(e) => handleGuessChange(e.target.value)}
                placeholder="Type your answer..."
                autoComplete="off"
                spellCheck={false}
                className="universe-input"
              />

              {/* Right letters, wrong order feedback */}
              {isRightLettersWrongOrder && (
                <div className="anim-pop flex items-center gap-2 justify-center">
                  <span
                    className="inline-block h-2 w-2"
                    style={{ background: "var(--punk-yellow)" }}
                  />
                  <span
                    className="text-sm font-mono"
                    style={{ color: "var(--punk-yellow)" }}
                  >
                    Right letters — wrong order.
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isSolved) handleSolve();
                }}
                disabled={normalizedGuess.length === 0}
                className="comic-btn w-full text-lg tracking-wider"
                style={{
                  background: universe.primary,
                  color: (idx === 7 || universe.primary === "#E0E0E0") ? "#000000" : undefined,
                }}
              >
                Lock In Code →
              </button>
            </div>
          ) : (
            /* Success state */
            <div className="universe-success-block text-center space-y-4 anim-pop">
              <div
                className="universe-success-glow inline-flex items-center gap-3 px-6 py-3"
                style={{
                  border: `2px solid ${universe.primary}`,
                  background: `${universe.primary}15`,
                  boxShadow: `0 0 30px ${universe.glow}, 0 0 60px ${universe.glow}`,
                }}
              >
                <span
                  className="display-title text-2xl md:text-3xl"
                  style={{ color: universe.primary }}
                >
                  ✓
                </span>
                <div className="text-left">
                  <p
                    className="display-title text-lg md:text-xl"
                    style={{ color: universe.primary }}
                  >
                    Universe Cleared
                  </p>
                  <p className="text-xs font-mono opacity-60">
                    Code accepted.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Back to start link */}
        <div className="mt-8 text-center">
          <button
            onClick={() => {
              reset();
              router.push("/universe");
            }}
            className="font-mono text-xs opacity-30 hover:opacity-60 transition-opacity tracking-widest uppercase cursor-pointer"
          >
            ← restart
          </button>
        </div>
      </div>
    </div>
  );
}
