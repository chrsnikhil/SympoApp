"use client";

import { useState } from "react";
import SixtyFourGrid from "../hunt/puzzles/SixtyFourGrid";
import type { GridCell } from "@/lib/hunt/grid";

interface Props {
  equations: string[];
  gridCells: GridCell[];
}

export default function HuntTestClient({ equations, gridCells }: Props) {
  // A preview harness cannot say "solved" any more, and shouldn't pretend to:
  // only /api/submit knows, and this page deliberately does not call it. All
  // it can show is what the puzzle would hand to the shell.
  const [proposed, setProposed] = useState("");

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
            onAnswer={setProposed}
          />
        </div>

        <div className="punk-divider" />

        {/* Status Panel */}
        <div className="panel halftone relative p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={proposed}
              readOnly
              placeholder="What the puzzle would send to the shell"
              className="border-2 border-paper-white/20 bg-ink-black/60 px-4 py-2.5 font-mono text-lg uppercase text-paper-white outline-none flex-1 min-w-[200px]"
            />
            <span className="display-title text-sm" style={{ color: "rgba(242, 239, 233, 0.4)" }}>
              NOT GRADED HERE
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
