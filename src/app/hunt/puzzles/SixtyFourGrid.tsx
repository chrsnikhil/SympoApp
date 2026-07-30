"use client";

import { useEffect, useState } from "react";
import { GRID_COLOURS, isAnagram, lettersFor, type GridCell } from "@/lib/hunt/grid";
import { CODES } from "@/lib/hunt/codes";
import type { PuzzleProps } from "../registry";

/**
 * Contrast helpers for the grid cells.
 *
 * A single fixed ink colour cannot read against all eight swatches — purple
 * (#7209b7) and blue (#4361ee) are dark enough that black text falls to
 * ~2.1:1 and ~3.4:1, well under WCAG AA's 4.5:1 for body text, and these are
 * letters a team has to read off a projector under a clock. Rather than
 * touch the palette (the eight colours are load-bearing for the puzzle),
 * each swatch picks whichever of the two design-system ink tones —
 * ink-black or paper-white — actually reads better against it.
 */
function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
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
  ratio: number;
}

function textToneFor(hex: string): TextTone {
  const lum = relativeLuminance(hex);
  const onBlack = contrastRatio(lum, INK_BLACK_LUM);
  const onWhite = contrastRatio(lum, PAPER_WHITE_LUM);
  return onBlack >= onWhite
    ? { colour: "var(--ink-black)", haloRgba: "rgba(242, 239, 233, 0.65)", ratio: onBlack }
    : { colour: "var(--paper-white)", haloRgba: "rgba(10, 10, 10, 0.65)", ratio: onWhite };
}

// Computed once against the fixed eight-colour palette, not per render.
const CELL_TEXT_TONE = GRID_COLOURS.map(textToneFor);

/**
 * COLOUR LABELS — punk-styled names for each grid colour index.
 */
const COLOUR_NAMES = [
  "Riot Red", "Punk Orange", "Slam Gold", "Venom Teal",
  "Electric Blue", "Anarchy Purple", "Smash Pink", "Ghost White",
];

/**
 * Three equations give a number; that number mod 8 selects one of the eight
 * swatches below. Picking a swatch isolates its eight scattered cells (the
 * other 56 dim out) and shows their letters so the team can unscramble them.
 *
 * The grid is built server-side at seed time (see scripts/seed-hunt.ts) —
 * config.gridCells arrives already shuffled. This component never sees the
 * eight source words, only the letter/colour pairs, so there is nothing here
 * for a curious team to read out of devtools.
 */
export default function SixtyFourGrid({ config, onSolve }: PuzzleProps) {
  const equations = Array.isArray(config.equations) ? (config.equations as string[]) : [];
  const cells = Array.isArray(config.gridCells) ? (config.gridCells as GridCell[]) : [];

  const [picked, setPicked] = useState<number | null>(null);
  const [guess, setGuess] = useState("");

  const letters = picked === null ? [] : lettersFor(cells, picked);

  // The only thing that may reach onSolve is the real reveal code — never
  // whatever the player happened to type. isAnagram(guess, letters) only
  // proves the guess uses the picked colour's eight letters; it says nothing
  // about their order, so it must never gate onSolve on its own.
  const normalizedGuess = guess.toUpperCase().replace(/[^A-Z]/g, "");
  const solved = normalizedGuess.length > 0 && normalizedGuess === CODES.grid;

  // Kept as feedback only: "you have the right cells, wrong order" is useful
  // mid-solve signal that doesn't leak the code.
  const rightLettersWrongOrder =
    picked !== null && !solved && letters.length > 0 && isAnagram(guess, letters.join(""));

  // In an effect, not during render: calling the parent's setState from a
  // render body is a React error, and it would fire on every keystroke.
  useEffect(() => {
    if (solved) onSolve(CODES.grid);
  }, [solved, onSolve]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* ── LEFT: Equations + Colour Picker + Anagram Input ── */}
      <div className="space-y-5">
        {/* Equations Panel */}
        <div className="panel halftone relative p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="punk-sticker">Step 1</span>
            <h3 className="display-title text-lg text-paper-white">Crack the Equations</h3>
          </div>
          <ol className="space-y-3 pl-1">
            {equations.map((eq, i) => (
              <li key={eq} className="flex items-start gap-3">
                <span
                  className="display-title flex h-7 w-7 shrink-0 items-center justify-center text-sm"
                  style={{
                    background: "var(--punk-magenta)",
                    color: "var(--paper-white)",
                    transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`,
                    border: "1px solid var(--paper-white)",
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-paper-white/90 leading-relaxed pt-0.5">
                  {eq}
                </span>
              </li>
            ))}
          </ol>

          <div className="punk-divider" />

          <p className="text-xs text-paper-white/50 font-mono">
            {"// Add your three answers → total mod 8 = colour index"}
          </p>
        </div>

        {/* Colour Picker */}
        <div className="panel halftone relative p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="punk-sticker" style={{ background: "var(--glitch-cyan)", color: "var(--ink-black)" }}>
              Step 2
            </span>
            <h3 className="display-title text-lg text-paper-white">Pick Your Colour</h3>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {GRID_COLOURS.map((c, i) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setPicked(i);
                  setGuess("");
                }}
                aria-label={`Colour ${i}: ${COLOUR_NAMES[i]}`}
                aria-pressed={picked === i}
                className="group relative flex flex-col items-center gap-1 p-2 transition-all duration-200"
                style={{
                  background: picked === i ? "rgba(0, 245, 212, 0.08)" : "transparent",
                  border: picked === i ? "2px solid var(--glitch-cyan)" : "2px solid transparent",
                }}
              >
                <div
                  className="h-10 w-10 transition-transform group-hover:scale-110"
                  style={{
                    background: c,
                    border: "2px solid var(--paper-white)",
                    boxShadow: picked === i ? "0 0 12px rgba(0, 245, 212, 0.4)" : "none",
                  }}
                />
                <span
                  className="text-[0.6rem] font-mono uppercase tracking-wider"
                  style={{
                    color: picked === i ? "var(--glitch-cyan)" : "rgba(242, 239, 233, 0.5)",
                  }}
                >
                  {i}・{COLOUR_NAMES[i].split(" ")[0]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Anagram Input (shown when colour picked) */}
        {picked !== null && (
          <div className="panel halftone relative p-5 anim-pop">
            <div className="flex items-center gap-3 mb-4">
              <span className="punk-sticker" style={{ background: "var(--spider-red)" }}>
                Step 3
              </span>
              <h3 className="display-title text-lg text-paper-white">Unscramble</h3>
            </div>

            <div className="mb-4">
              <p className="text-xs text-paper-white/50 mb-2 font-mono">
                {"// Letters from colour " + picked + ":"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {letters.map((l, i) => (
                  <span
                    key={i}
                    className="display-title flex h-10 w-10 items-center justify-center text-lg anim-pop"
                    style={{
                      background: GRID_COLOURS[picked],
                      color: CELL_TEXT_TONE[picked].colour,
                      textShadow: `0 0 3px ${CELL_TEXT_TONE[picked].haloRgba}`,
                      border: "2px solid var(--paper-white)",
                      animationDelay: `${i * 0.04}s`,
                    }}
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>

            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              placeholder="Type the word..."
              autoComplete="off"
              spellCheck={false}
              className="w-full border-2 border-paper-white/20 bg-ink-black/60 px-4 py-3 font-mono text-lg uppercase text-paper-white outline-none transition-all duration-200 focus:border-glitch-cyan focus:shadow-[0_0_15px_rgba(0,245,212,0.2)]"
            />

            {rightLettersWrongOrder && (
              <p className="anim-pop mt-3 flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-2 w-2"
                  style={{ background: "var(--punk-yellow)" }}
                />
                <span style={{ color: "var(--punk-yellow)" }}>
                  Right letters — try a different order.
                </span>
              </p>
            )}

            {solved && (
              <p className="anim-pop mt-3 flex items-center gap-2 text-sm font-bold">
                <span
                  className="inline-block h-2 w-2"
                  style={{ background: "var(--glitch-cyan)" }}
                />
                <span style={{ color: "var(--glitch-cyan)" }}>
                  SOLVED! The code has been filled in above.
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT: The 8×8 Grid ── */}
      <div className="panel halftone relative p-3 self-start punk-glow">
        {/* Grid header */}
        <div className="flex items-center justify-between px-2 py-2 mb-2">
          <span className="display-title text-sm text-paper-white/70">8 × 8 GRID</span>
          <span className="text-xs font-mono text-paper-white/40">64 cells</span>
        </div>

        {/* The Grid */}
        <div className="grid grid-cols-8 gap-[3px]">
          {cells.map((cell, i) => {
            const tone = CELL_TEXT_TONE[cell.colour];
            const isDimmed = picked !== null && cell.colour !== picked;
            const isHighlighted = picked !== null && cell.colour === picked;

            return (
              <div
                key={i}
                className="grid-cell relative flex aspect-square items-center justify-center text-xs font-bold sm:text-sm"
                style={{
                  background: GRID_COLOURS[cell.colour],
                  color: tone.colour,
                  textShadow: `0 0 3px ${tone.haloRgba}`,
                  opacity: isDimmed ? 0.18 : 1,
                  border: isHighlighted
                    ? "2px solid var(--glitch-cyan)"
                    : "1px solid rgba(10, 10, 10, 0.3)",
                  boxShadow: isHighlighted ? "0 0 8px rgba(0, 245, 212, 0.3)" : "none",
                  transform: isHighlighted ? "scale(1.05)" : "scale(1)",
                  zIndex: isHighlighted ? 2 : 1,
                  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              >
                {cell.letter}
              </div>
            );
          })}
        </div>

        {/* Grid legend */}
        <div className="mt-3 px-2">
          <div className="punk-divider" />
          <div className="flex flex-wrap gap-2">
            {GRID_COLOURS.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-[0.6rem] font-mono"
                style={{
                  opacity: picked !== null && picked !== i ? 0.3 : 1,
                  transition: "opacity 0.3s",
                }}
              >
                <span
                  className="inline-block h-3 w-3"
                  style={{
                    background: c,
                    border: picked === i ? "1px solid var(--glitch-cyan)" : "1px solid var(--paper-white)",
                  }}
                />
                <span className="text-paper-white/50">{i}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
