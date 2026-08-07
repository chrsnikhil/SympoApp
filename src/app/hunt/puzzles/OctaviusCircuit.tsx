"use client";

import { useEffect, useRef, useState } from "react";
// The game's own stylesheets. Imported statically rather than inside the effect
// so Next bundles them with this chunk — a dynamic import() of CSS resolves
// after first paint and the board renders unstyled for a frame.
import "../../../../game_src/style.css";
import "../../../../game_src/landing.css";
import type { PuzzleProps } from "../registry";

/**
 * The Octavius Circuit game, mounted inside the hunt shell.
 *
 * The game itself is vanilla JS under `game_src/` — a canvas, a board model and
 * a solver, written against the DOM rather than React. It is imported rather
 * than rewritten: it works, and porting nine files to React would change
 * nothing a player can see.
 *
 * WHY ALL THIS MARKUP IS HERE. The game does not build its own UI. It looks up
 * twenty elements by id — the voltage HUD, both inventory panels, the four
 * action buttons, the win overlay — and wires listeners to them at init. It
 * came from a standalone page whose index.html supplied that scaffold, and the
 * first version of this component rendered only `#board-container`, so
 * `initMain()` threw on the first missing element and every team saw "the
 * circuit board could not be loaded".
 *
 * This is that scaffold, as JSX. The ids are load-bearing: renaming one breaks
 * the game silently, because the lookups are strings.
 *
 * WHAT IS DELIBERATELY NOT HERE. The original's landing page — a full-screen
 * video with a PLAY button — and the decorative background/logo videos. The
 * hunt shell is already the way in, so a second entry screen inside a puzzle
 * card is one click to nowhere, and the media files it referenced
 * (`animation.mp4`, `logo.mp4`, `background.mp4`) were never part of this repo.
 * `main.js` has no dependency on `landing.js`, so dropping it costs nothing.
 *
 * IT DOES NOT REPORT THE ANSWER. `onAnswer` is unused on purpose. The game posts
 * the board it built to /api/submit itself and the server rebuilds the circuit
 * to decide — there is no string a player could type that this puzzle could
 * hand up, and no verdict this component is entitled to form.
 */
export default function OctaviusCircuit(_props: PuzzleProps) {
  const startedRef = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    // StrictMode mounts effects twice in development. Without this the game
    // initialises twice and every pointerdown is handled twice.
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const main = await import("../../../../game_src/main.js");
        if (cancelled) return;
        (main as { initMain?: () => void }).initMain?.();
      } catch (err) {
        console.error("[octavius] failed to start", err);
        if (!cancelled) setFailed(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {failed && (
        <div className="panel mb-4 p-4">
          <p className="font-mono text-xs text-paper-white/70">
            The circuit board could not be loaded. Refresh the page — if it keeps
            happening, tell a coordinator rather than burning time on it.
          </p>
          <p className="mt-2 font-mono text-[0.65rem] text-paper-white/40">{failed}</p>
        </div>
      )}

      {/*
        Sized to the column, not the viewport. A puzzle renders inside
        HuntShell's `mx-auto max-w-6xl` container, so a 100vw child starts at
        the container's inset and runs off the right-hand edge — the bug the
        Mystery Room had.
      */}
      <div id="app-container" className="relative min-h-[70vh] w-full overflow-hidden">
        <canvas id="bg-canvas" />
        <div id="scanline-overlay" />
        <div id="vignette-overlay" />

        <div id="game-wrapper">
          <header id="hud-bar">
            <div id="hud-puzzle-name">
              <span className="hud-label-small">PUZZLE</span>
              <div id="level-display-text" className="level-title-text">
                Level 1
              </div>
            </div>

            <div id="hud-voltage-section">
              <div id="hud-actual">
                <span className="hud-label">ACTUAL VOLTAGE</span>
                <span id="actual-voltage-value" className="voltage-number">
                  0
                </span>
              </div>

              <div id="hud-bar-center">
                <div id="voltage-bar-track">
                  <div id="voltage-bar-seg-1" className="voltage-seg" />
                  <div id="voltage-bar-seg-2" className="voltage-seg" />
                  <div id="voltage-bar-seg-3" className="voltage-seg" />
                </div>
                <div id="voltage-status" className="status-hidden">
                  <span id="voltage-status-text" />
                </div>
                <div id="modifier-tracker" />
              </div>

              <div id="hud-target">
                <span id="target-voltage-value" className="voltage-number">
                  0
                </span>
                <span className="hud-label">TARGET VOLTAGE</span>
              </div>
            </div>
          </header>

          <main id="game-area">
            <aside id="inventory-left" className="inventory-panel">
              <div className="inventory-title">INVENTORY</div>
              <div id="inv-left-items" className="inventory-items" />
            </aside>

            <div id="board-container">
              <canvas id="board-canvas" />
              <div id="board-hit-layer" />
            </div>

            <aside id="inventory-right" className="inventory-panel">
              <div className="inventory-title">MODIFIERS</div>
              <div id="inv-right-items" className="inventory-items" />
            </aside>
          </main>

          <footer id="action-bar">
            <button className="action-btn" id="btn-rotate" data-action="rotate">
              <span className="btn-icon">↻</span>
              <span className="btn-label">ROTATE</span>
            </button>
            <button className="action-btn" id="btn-reset" data-action="reset">
              <span className="btn-icon">⟳</span>
              <span className="btn-label">RESET CIRCUIT</span>
            </button>
            <button className="action-btn action-btn--select" id="btn-select" data-action="select">
              <span className="btn-icon">●</span>
              <span className="btn-label">SELECT</span>
            </button>
            <button className="action-btn action-btn--remove" id="btn-remove" data-action="remove">
              <span className="btn-icon">✕</span>
              <span className="btn-label">REMOVE</span>
            </button>
          </footer>
        </div>

        <div id="win-overlay" className="hidden">
          <div id="win-card">
            <div id="win-particles" />
            <div className="win-spider-icon">🕷️</div>
            <h1 className="win-title">CIRCUIT COMPLETE!</h1>
            <p className="win-subtitle">
              Voltage Matched — <span id="win-voltage" />
            </p>
            <button id="btn-play-again" className="win-btn">
              PLAY AGAIN
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
