"use client";

import { useEffect, useRef, useState } from "react";
import type { PuzzleProps } from "../registry";

/**
 * The Octavius Circuit game, mounted inside the hunt shell.
 *
 * The game itself is vanilla JS under `game_src/` — a canvas, a board model and
 * a solver, written against the DOM rather than React. It is imported rather
 * than rewritten: it works, and a port to React would be a rewrite of nine
 * files to change nothing a player can see.
 *
 * WHAT THIS COMPONENT IS RESPONSIBLE FOR. Giving the game the DOM it expects
 * before it initialises, and only once. The original mounted it from an effect
 * that fired before the container existed and re-fired under StrictMode, so the
 * game either threw on a missing element or registered its listeners twice and
 * submitted every win twice.
 *
 * IT DOES NOT REPORT THE ANSWER. `onAnswer` is deliberately unused. The game
 * posts the board it built to /api/submit itself, and the server rebuilds the
 * circuit to decide — there is no string a player could type that this puzzle
 * could hand up, and no verdict this component is entitled to form.
 */
export default function OctaviusCircuit(_props: PuzzleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // StrictMode mounts effects twice in development. Without this the game
    // initialises twice and every pointerdown is handled twice.
    if (startedRef.current) return;
    if (!containerRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        await import("../../../../game_src/style.css");
        await import("../../../../game_src/landing.css");
        const main = await import("../../../../game_src/main.js");
        if (cancelled) return;
        (main as { initMain?: () => void }).initMain?.();
      } catch (err) {
        console.error("[octavius] failed to start", err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="panel p-6 text-center">
        <p className="font-mono text-sm text-paper-white/70">
          The circuit board could not be loaded. Refresh the page — if it keeps
          happening, tell a coordinator rather than burning time on it.
        </p>
      </div>
    );
  }

  return (
    /**
     * Sized to the column, not the viewport. A puzzle renders inside HuntShell's
     * `mx-auto max-w-6xl` container, so a 100vw child starts at the container's
     * inset and runs off the right-hand edge — the bug the Mystery Room had.
     */
    <div
      ref={containerRef}
      id="board-container"
      className="relative h-[78vh] min-h-[460px] w-full overflow-hidden"
    />
  );
}
