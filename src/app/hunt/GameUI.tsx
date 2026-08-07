"use client";

import { useEffect, useState } from "react";
import "../../../game_src/style.css";
import "../../../game_src/landing.css";

export default function GameUI() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Dynamically import the Vanilla JS entry points once the DOM is ready
    Promise.all([
      import("../../../game_src/landing.js"),
      import("../../../game_src/main.js")
    ]).then(([landing, main]) => {
      landing.initLanding();
      main.initMain();
    });
  }, []);

  if (!mounted) return null; // Prevents hydration mismatch

  return (
    <>
      {/* ═══════════════════════════════════════════ */}
      {/* PRE-GAME: Landing Page                      */}
      {/* ═══════════════════════════════════════════ */}
      <div id="landing-page">
        <img
          className="landing-bg"
          src="/homepage.jpg"
          alt="Background"
        />
        <div id="landing-overlay"></div>
        <div className="landing-content">
          <img src="/event1.png" alt="Event" className="landing-event-img" />
          <button id="landing-play-btn" className="landing-play-btn">
            PLAY
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* HOW TO PLAY PAGE                            */}
      {/* ═══════════════════════════════════════════ */}
      <div
        id="how-to-play-page"
        style={{ display: "none", opacity: 0, transition: "opacity 0.5s ease" }}
      >
        <div className="htp-content">
          <h1 className="htp-title">HOW TO PLAY</h1>
          <ul className="htp-instructions">
            <li><strong>Objective:</strong> Route power from the glowing yellow source node to the cyan end node.</li>
            <li><strong>Target Voltage:</strong> The total voltage of your circuit must exactly match the Target Voltage shown on the HUD.</li>
            <li><strong>Modifiers:</strong> Routing through + or - nodes will change your current voltage.</li>
            <li><strong>Controls:</strong> Select a piece from the left inventory, then click an empty slot to place it. Click a placed piece to rotate it, or use the bottom action bar.</li>
            <li><strong>Completion:</strong> Connect the circuit to the end node with the exact voltage to win the level!</li>
          </ul>
          <button id="htp-skip-btn" className="landing-play-btn">
            SKIP
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* GAME APP WRAPPER                            */}
      {/* ═══════════════════════════════════════════ */}
      <div
        id="app-container"
        style={{ display: "none", opacity: 0, transition: "opacity 0.5s ease" }}
      >
        <canvas id="bg-canvas"></canvas>

        <video
          id="bg-video"
          src="/background.mp4"
          autoPlay
          loop
          muted
          playsInline
          crossOrigin="anonymous"
          style={{ display: "none" }}
        ></video>

        <div id="scanline-overlay"></div>
        <div id="vignette-overlay"></div>

        <div id="logo-container">
          <img
            id="logo-img"
            src="/logo.png"
            alt="Logo"
          />
        </div>

        <div id="game-wrapper">
          <header id="hud-bar">
            <div id="hud-left-section">
              <div id="hud-puzzle-name">
                <span className="hud-label-small">PUZZLE</span>
                <div id="level-display-text" className="level-title-text">
                  Level 1: Overload Prevention
                </div>
              </div>
              <button id="hud-htp-btn" className="hud-htp-btn">
                HOW TO PLAY
              </button>
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
                  <div id="voltage-bar-seg-1" className="voltage-seg"></div>
                  <div id="voltage-bar-seg-2" className="voltage-seg"></div>
                  <div id="voltage-bar-seg-3" className="voltage-seg"></div>
                </div>
                <div id="voltage-status" className="status-hidden">
                  <span id="voltage-status-text"></span>
                </div>
                <div id="modifier-tracker"></div>
              </div>

              <div id="hud-target">
                <span id="target-voltage-value" className="voltage-number target-highlight">
                  2
                </span>
                <span className="hud-label">TARGET VOLTAGE</span>
              </div>
            </div>
          </header>

          <main id="game-area">
            <aside id="inventory-left" className="inventory-panel">
              <div className="inventory-title">INVENTORY</div>
              <div id="inv-left-items" className="inventory-items"></div>
            </aside>

            <div id="board-container">
              <canvas id="board-canvas"></canvas>
              <div id="board-hit-layer"></div>
            </div>
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
            <button
              className="action-btn action-btn--select"
              id="btn-select"
              data-action="select"
            >
              <span className="btn-icon">●</span>
              <span className="btn-label">SELECT</span>
            </button>
            <button
              className="action-btn action-btn--remove"
              id="btn-remove"
              data-action="remove"
            >
              <span className="btn-icon">✕</span>
              <span className="btn-label">REMOVE</span>
            </button>
          </footer>
        </div>

        <div id="win-overlay" className="hidden">
          <div id="win-card">
            <div id="win-particles"></div>
            <div className="win-spider-icon">🕷️</div>
            <h1 className="win-title">CIRCUIT COMPLETE!</h1>
            <p className="win-subtitle">
              Voltage Matched — <span id="win-voltage"></span>
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
