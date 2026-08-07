"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUniverse } from "../UniverseContext";
import { UNIVERSES } from "../universeData";
import SpiderWebCorners from "../SpiderWebCorners";
import CenterSpiderWeb from "../CenterSpiderWeb";

/* ── Particle generator (client-only) ──────────────────────────────────── */
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
    size: 2 + Math.random() * 5,
    duration: 5 + Math.random() * 10,
    delay: Math.random() * 8,
  }));
}

function Particles({ color = "var(--glitch-cyan)" }: { color?: string }) {
  const [particles, setParticles] = useState<ParticleData[]>([]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
  useEffect(() => {
    setParticles(makeParticles(20));
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

/* ── API Response type ─────────────────────────────────────────────────── */
interface EquationData {
  universeName: string;
  universeIndex: number;
  equations: { R: string; G: string; B: string };
}

/* ══════════════════════════════════════════════════════════════════════════
 * RGB COLOUR REVEAL — Crack the Cipher
 *
 * Stage A: Show unsolved algebraic RGB equations
 * Stage B: 3 input fields for R, G, B — participant must solve the
 *          equations manually and enter correct values
 * On correct → portal transition to universe grid page
 * On wrong   → shake + error, try again
 * ══════════════════════════════════════════════════════════════════════════ */
export default function RevealPage() {
  const {
    teamNumber,
    universeIndex,
    setUniverseIndex,
    setRevealedColor,
    setArrivingViaPortal,
    setPortalActive,
    registerPortalMidpoint,
  } = useUniverse();
  const router = useRouter();

  // ── Page state ────────────────────────────────────────────────────────
  const [stage, setStage] = useState<"loading" | "equations" | "input">(
    "loading",
  );
  const [eqData, setEqData] = useState<EquationData | null>(null);
  const [loadError, setLoadError] = useState("");

  // RGB input values
  const [rInput, setRInput] = useState("");
  const [gInput, setGInput] = useState("");
  const [bInput, setBInput] = useState("");

  // Submission state
  const [submitError, setSubmitError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  /**
   * The universe on screen is the one the SERVER says this team is in.
   *
   * There are two indexes in play and they can disagree. The context one comes
   * from the team number a player types on step 1, and step 2 only checks that
   * typed `n` matches that typed team number — so the client flow is
   * self-consistent no matter what is entered. The equations come from
   * /api/universe-color, which reads the team off the session and ignores the
   * request entirely.
   *
   * Taking the heading from one and the formula from the other rendered a page
   * that contradicted itself: type 6 and you were shown SMASH / Earth-1610 with
   * ELECTRIC's equations underneath, and no way to tell which half was wrong.
   * Reported, correctly, as "the formula for universe 4 is appearing on 6".
   *
   * The server's index wins because it is the one that grades: gradeHunt
   * resolves the team's universe from the team record, so a page built on
   * anything else is describing a puzzle the team cannot submit against.
   */
  const resolvedIndex = eqData?.universeIndex ?? universeIndex;
  const universe = resolvedIndex !== null ? UNIVERSES[resolvedIndex] : undefined;

  // ── Guard: redirect if no team number ─────────────────────────────────
  useEffect(() => {
    if (teamNumber === null) {
      router.replace("/universe");
      return;
    }
    if (universeIndex === null) {
      setUniverseIndex(((teamNumber % 8) + 8) % 8);
    }
  }, [teamNumber, universeIndex, setUniverseIndex, router]);

  // ── Fetch equations from server ───────────────────────────────────────
  useEffect(() => {
    if (teamNumber === null || universeIndex === null) return;

    let cancelled = false;

    async function fetchEquations() {
      try {
        // No teamNumber in the body — the server reads it off the session.
        // Sending it would just be a hint that it is worth tampering with.
        const res = await fetch("/api/universe-color", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody as { error?: string }).error || "Server error",
          );
        }

        const result = await res.json();
        if (!cancelled) {
          setEqData({
            universeName: result.universeName,
            universeIndex: result.universeIndex,
            equations: result.equations,
          });
          setStage("equations");
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load cipher",
          );
        }
      }
    }

    fetchEquations();
    return () => {
      cancelled = true;
    };
  }, [teamNumber, universeIndex]);

  // ── Advance to input stage ────────────────────────────────────────────
  const handleShowInputs = useCallback(() => {
    setStage("input");
  }, []);

  // ── Submit RGB values for server-side verification ────────────────────
  const handleSubmitRGB = useCallback(async () => {
    if (teamNumber === null || universeIndex === null) return;

    const r = parseInt(rInput, 10);
    const g = parseInt(gInput, 10);
    const b = parseInt(bInput, 10);

    // Client-side quick check
    if ([rInput, gInput, bInput].some((v) => v.trim() === "")) {
      setSubmitError("Enter values for all three channels.");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }

    if ([r, g, b].some((v) => isNaN(v) || v < 0 || v > 255)) {
      setSubmitError("Each value must be an integer between 0 and 255.");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch("/api/universe-color/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ r, g, b }),
      });

      const result = await res.json();

      if (result.correct) {
        // ── Correct! Store colour and portal to grid ─────────────
        setRevealedColor({ r, g, b, hex: `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase() });
        setArrivingViaPortal(true);

        registerPortalMidpoint(() => {
          router.push(`/universe/${universeIndex}`);
        });

        setIsTransitioning(true);

        setTimeout(() => {
          setPortalActive(true);
        }, 400);
      } else {
        // ── Wrong answer ─────────────────────────────────────────
        setSubmitError("Incorrect colour code. Check your math and try again.");
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      }
    } catch {
      setSubmitError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    teamNumber,
    universeIndex,
    rInput,
    gInput,
    bInput,
    setRevealedColor,
    setArrivingViaPortal,
    registerPortalMidpoint,
    setPortalActive,
    router,
  ]);

  if (teamNumber === null || universeIndex === null) return null;

  // ── Loading / error state ─────────────────────────────────────────────
  if (stage === "loading") {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="web-bg" />
        <div className="universe-scanlines" />
        <div className="text-center">
          {loadError ? (
            <div className="universe-error p-6">
              <p className="font-mono text-sm">{loadError}</p>
              <button
                onClick={() => router.replace("/universe")}
                className="comic-btn mt-4"
              >
                ← Back
              </button>
            </div>
          ) : (
            <div className="font-mono text-sm text-cyan-300/60 animate-pulse tracking-widest">
              LOADING CIPHER...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!eqData || !universe) return null;

  // ── Colour preview from current inputs ────────────────────────────────
  const previewR = parseInt(rInput, 10);
  const previewG = parseInt(gInput, 10);
  const previewB = parseInt(bInput, 10);
  const hasValidPreview =
    [previewR, previewG, previewB].every(
      (v) => !isNaN(v) && v >= 0 && v <= 255,
    );
  const previewHex = hasValidPreview
    ? `#${previewR.toString(16).padStart(2, "0")}${previewG.toString(16).padStart(2, "0")}${previewB.toString(16).padStart(2, "0")}`.toUpperCase()
    : null;

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background: universe.bgGradient,
        ["--universe-primary" as string]: universe.primary,
        ["--universe-border-gradient" as string]: universe.borderGradient,
      }}
    >
      {/* Background layers */}
      <div className="universe-grid-bg" />
      <Particles color={universe.particleColor} />
      <div className="universe-scanlines" />

      {/* Decorations */}
      <SpiderWebCorners />
      <CenterSpiderWeb />

      {/* Glowing orbs */}
      <div
        className="universe-orb"
        style={{ top: "15%", right: "10%", backgroundColor: universe.primary }}
      />
      <div
        className="universe-orb"
        style={{
          bottom: "15%",
          left: "10%",
          backgroundColor: universe.secondary,
          animationDelay: "2s",
        }}
      />

      {/* Main card */}
      <div
        className={`universe-fade-in relative z-10 w-full max-w-xl mx-4 ${
          isTransitioning ? "universe-warp-out" : ""
        } ${shaking ? "universe-shake" : ""}`}
      >
        {/* Step badge */}
        <div className="mb-6 text-center">
          <span
            className="universe-step-badge"
            style={{
              background: universe.primary,
              borderColor: universe.secondary,
              color: (universeIndex === 7 || universe.primary === "#E0E0E0") ? "#000000" : undefined,
            }}
          >
            Step 02
          </span>
        </div>

        <div className="universe-card p-8 md:p-10 flex flex-col items-center gap-6">
          {/* Universe title */}
          <h1
            className="display-title text-4xl md:text-5xl text-center"
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

          <p
            className="font-mono text-xs tracking-[0.3em] uppercase opacity-60"
            style={{ color: universe.primary }}
          >
            {universe.designation}
          </p>

          <div
            className="w-full h-[2px]"
            style={{
              background: `linear-gradient(90deg, transparent, ${universe.primary}40, ${universe.secondary}40, transparent)`,
            }}
          />

          {/* Cipher header */}
          <p className="text-sm font-mono text-center opacity-50 tracking-wide">
            {"// CRACK YOUR COLOUR CODE"}
          </p>

          {/* Equation cipher block — always visible */}
          <div
            className="reveal-equation-block w-full"
            style={{ borderColor: `${universe.primary}40` }}
          >
            <div
              className="reveal-equation-label"
              style={{ color: universe.primary }}
            >
              COLOUR CIPHER
            </div>
            {(["R", "G", "B"] as const).map((ch) => (
              <div key={ch} className="reveal-equation-line">
                <span
                  className="reveal-channel-name"
                  style={{
                    color:
                      ch === "R"
                        ? "#FF4444"
                        : ch === "G"
                          ? "#44FF44"
                          : "#4488FF",
                  }}
                >
                  {ch}
                </span>
                <span className="reveal-equation-text">
                  = {eqData.equations[ch]}
                </span>
              </div>
            ))}
          </div>

          {/* ═══════ STAGE A: Show "Decode" button ═══════ */}
          {stage === "equations" && (
            <button
              onClick={handleShowInputs}
              className="comic-btn w-full text-lg tracking-wider reveal-stage-enter"
              style={{
                background: universe.primary,
                color: (universeIndex === 7 || universe.primary === "#E0E0E0") ? "#000000" : undefined,
              }}
            >
              Decode Colour →
            </button>
          )}

          {/* ═══════ STAGE B: RGB Input Fields ═══════ */}
          {stage === "input" && (
            <div className="reveal-stage-enter w-full flex flex-col items-center gap-5">
              <p className="text-xs font-mono opacity-40 tracking-wide uppercase text-center">
                Solve the equations and enter your RGB values
              </p>

              {/* R, G, B input row */}
              <div className="reveal-rgb-inputs">
                {(["R", "G", "B"] as const).map((ch) => {
                  const value =
                    ch === "R" ? rInput : ch === "G" ? gInput : bInput;
                  const setter =
                    ch === "R" ? setRInput : ch === "G" ? setGInput : setBInput;
                  const accentColor =
                    ch === "R"
                      ? "#FF4444"
                      : ch === "G"
                        ? "#44FF44"
                        : "#4488FF";

                  return (
                    <div key={ch} className="reveal-rgb-input-group">
                      <label
                        htmlFor={`rgb-input-${ch}`}
                        className="reveal-rgb-label"
                        style={{ color: accentColor }}
                      >
                        {ch}
                      </label>
                      <input
                        id={`rgb-input-${ch}`}
                        type="number"
                        min={0}
                        max={255}
                        value={value}
                        onChange={(e) => {
                          setter(e.target.value);
                          setSubmitError("");
                        }}
                        placeholder="0–255"
                        className="reveal-rgb-field"
                        style={{
                          borderColor: accentColor + "60",
                          boxShadow: `0 0 10px ${accentColor}15`,
                        }}
                        autoComplete="off"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Live colour preview */}
              {hasValidPreview && (
                <div className="reveal-preview-row">
                  <div
                    className="reveal-preview-swatch"
                    style={{ backgroundColor: previewHex! }}
                  />
                  <span className="reveal-preview-hex font-mono text-xs opacity-50">
                    {previewHex}
                  </span>
                </div>
              )}

              {/* Error message */}
              {submitError && (
                <div className="universe-error w-full text-center">
                  {submitError}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmitRGB}
                disabled={submitting || isTransitioning}
                className="comic-btn w-full text-lg tracking-wider"
                style={{
                  background: universe.primary,
                  color: (universeIndex === 7 || universe.primary === "#E0E0E0") ? "#000000" : undefined,
                }}
              >
                {submitting ? "Verifying..." : "Submit Colour Code →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
