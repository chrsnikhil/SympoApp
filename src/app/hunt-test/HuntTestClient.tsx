"use client";

import { useState } from "react";
import SixtyFourGrid from "../hunt/puzzles/SixtyFourGrid";
import type { GridCell } from "@/lib/hunt/grid";

interface Props {
  equations: string[];
  gridCells: GridCell[];
}

export default function HuntTestClient({ equations, gridCells }: Props) {
  const [solved, setSolved] = useState(false);
  const [solvedCode, setSolvedCode] = useState<string | null>(null);

  return (
    <main className="relative min-h-dvh overflow-hidden px-5 py-10">
      {/* Web background */}
      <div className="web-bg" />

      <div className="relative mx-auto max-w-6xl">
        {/* Title */}
        <p className="font-body text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">
          XPLORE&apos;26 — DEV TEST
        </p>
        <h1 className="display-title chromatic mt-1 text-5xl sm:text-6xl text-paper-white">
          64 Grid Puzzle
        </h1>
        <p className="mt-3 text-sm text-paper-white/60">
          Spider-Punk themed puzzle preview (no auth required)
        </p>

        <div className="punk-divider" />

        {/* Puzzle Component */}
        <div className="my-6">
          <SixtyFourGrid
            config={{
              equations,
              gridCells,
            }}
            onSolve={(code) => {
              setSolved(true);
              setSolvedCode(code);
            }}
          />
        </div>

        <div className="punk-divider" />

        {/* Status Panel */}
        <div className="panel halftone relative p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={solvedCode ?? ""}
              readOnly
              placeholder="Code appears here when solved"
              className="border-2 border-paper-white/20 bg-ink-black/60 px-4 py-2.5 font-mono text-lg uppercase text-paper-white outline-none flex-1 min-w-[200px]"
            />
            <span
              className="display-title text-sm"
              style={{
                color: solved ? "var(--glitch-cyan)" : "rgba(242, 239, 233, 0.4)",
              }}
            >
              {solved ? "✓ SOLVED" : "UNSOLVED"}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
