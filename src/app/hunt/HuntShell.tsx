"use client";

import { useEffect, useRef, useState } from "react";
import { REGISTRY } from "./registry";
import { PUZZLE_HREFS } from "@/lib/hunt/content";

interface PuzzleState {
  slug: string;
  title: string;
  points: number;
  solved: boolean;
  hintsUsed: number;
  hintCount: number;
  config: Record<string, unknown>;
}

/**
 * The only thing in the hunt that submits an answer.
 *
 * Puzzles call onAnswer(text) with whatever the player has proposed and know
 * nothing about the network, their own answerHash, or how points work — and,
 * crucially, nothing about whether the proposal is right. That is deliberate:
 * the anti-cheat decision is implemented once, on the server, rather than four
 * times in four client bundles with three different bugs. /api/submit hashes
 * the payload and compares it to challenge.config.answerHash; that comparison
 * is the only thing in the system that recognises a correct answer.
 *
 * Spider-Punk themed shell with chromatic glitch titles, halftone panels,
 * and punk rock action buttons.
 */
export default function HuntShell() {
  const [puzzles, setPuzzles] = useState<PuzzleState[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRef = useRef(async () => {
    const res = await fetch("/api/hunt/progress");
    if (!res.ok) return;
    const body = await res.json();
    setPuzzles(body.puzzles ?? []);
  });

  useEffect(() => {
    void loadRef.current();
  }, []);

  const current = puzzles.find((p) => p.slug === active) ?? null;

  async function submit(code: string) {
    if (!current || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "hunt", challengeSlug: current.slug, payload: code }),
      });
      const body = await res.json();

      // A non-2xx (expired session, bad payload, server error) is not a
      // wrong answer — surface the server's own message instead.
      if (!res.ok) {
        setMessage(body.error ?? "Something went wrong — try again");
        return;
      }

      setMessage(body.correct ? `Solved — ${body.points} points` : "Not that one.");
      setAnswer("");
      await loadRef.current();
    } catch {
      // fetch itself rejected — dropped wifi, not a server response at all.
      setMessage("Couldn't reach the server — check your connection and try again");
    } finally {
      setBusy(false);
    }
  }

  async function buyHint() {
    if (!current) return;
    const res = await fetch("/api/hunt/hint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: current.slug }),
    });
    const body = await res.json();
    if (res.ok) {
      setHint(body.text);
      await loadRef.current();
    } else {
      setMessage(body.error ?? "No hint available");
    }
  }

  /* ────────────────────────────────────────────────────────────────────────
   * PUZZLE SELECTOR VIEW
   * ──────────────────────────────────────────────────────────────────────── */
  if (!active) {
    return (
      <main className="relative min-h-dvh overflow-hidden px-5 py-10">
        {/* Web background */}
        <div className="web-bg" />

        <div className="relative mx-auto max-w-3xl">
          {/* Header */}
          <p className="font-body text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">
            XPLORE&apos;26
          </p>
          <h1 className="display-title chromatic mt-1 text-5xl sm:text-6xl text-paper-white">
            Treasure Hunt
          </h1>
          <p className="mt-3 text-sm text-paper-white/60">
            Four puzzles, any order. Solve one to reveal its code.
          </p>

          <div className="punk-divider mt-6" />

          {/* Puzzle Cards */}
          <ul className="mt-8 grid gap-3">
            {puzzles.map((p, i) => {
              const entry = REGISTRY[p.slug];
              return (
                <li key={p.slug}>
                  <button
                    onClick={() => {
                      // Some rounds are a multi-page flow at their own route
                      // rather than a component that fits in this shell — the
                      // universe walks a team through four pages before it has
                      // an answer to give. Those navigate; the rest open here.
                      const href = PUZZLE_HREFS[p.slug as keyof typeof PUZZLE_HREFS];
                      if (href) {
                        window.location.href = href;
                        return;
                      }
                      setActive(p.slug);
                      setHint(null);
                      setMessage(null);
                      setAnswer("");
                    }}
                    className="halftone panel relative flex w-full items-center justify-between p-5 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(0,245,212,0.15)] group"
                    style={{
                      animationDelay: `${i * 0.08}s`,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className="display-title flex h-10 w-10 items-center justify-center text-lg"
                        style={{
                          background: p.solved ? "var(--glitch-cyan)" : "var(--spider-red)",
                          color: p.solved ? "var(--ink-black)" : "var(--paper-white)",
                          border: "2px solid var(--paper-white)",
                          transform: `rotate(${i % 2 === 0 ? -2 : 3}deg)`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <span className="display-title text-lg text-paper-white group-hover:text-glitch-cyan transition-colors">
                          {entry?.title ?? p.title}
                        </span>
                        <span className="block text-xs text-paper-white/40 font-mono mt-0.5">
                          {p.slug}
                        </span>
                      </div>
                    </div>
                    <span
                      className="display-title text-sm"
                      style={{
                        color: p.solved ? "var(--glitch-cyan)" : "var(--paper-white)",
                      }}
                    >
                      {p.solved ? "✓ SOLVED" : `${p.points} PTS`}
                    </span>
                  </button>
                </li>
              );
            })}
            {puzzles.length === 0 && (
              <li className="text-sm text-paper-white/40 font-mono p-4 text-center">
                {"// Loading puzzles..."}
              </li>
            )}
          </ul>
        </div>
      </main>
    );
  }

  /* ────────────────────────────────────────────────────────────────────────
   * ACTIVE PUZZLE VIEW
   * ──────────────────────────────────────────────────────────────────────── */
  /**
   * A route-based round has no component to render here.
   *
   * Its tile navigates away rather than opening this view, so arriving here
   * means `active` was set some other way. Bounce instead of reading
   * `.Component` off an entry that does not exist — the alternative is a blank
   * page from a TypeError, on the one screen a team is trying to play.
   */
  const activeHref = PUZZLE_HREFS[current!.slug as keyof typeof PUZZLE_HREFS];
  if (activeHref) {
    if (typeof window !== "undefined") window.location.href = activeHref;
    return null;
  }

  const entry = REGISTRY[current!.slug];
  const Puzzle = entry.Component;

  return (
    <main className="relative min-h-dvh overflow-hidden px-5 py-10">
      {/* Web background */}
      <div className="web-bg" />

      <div className="relative mx-auto max-w-6xl">
        {/* Back button */}
        <button
          onClick={() => setActive(null)}
          className="mb-4 flex items-center gap-2 text-sm text-paper-white/60 hover:text-glitch-cyan transition-colors group"
        >
          <span className="inline-block transition-transform group-hover:-translate-x-1">←</span>
          <span>All puzzles</span>
        </button>

        {/* Title */}
        <div className="flex items-center gap-4 mb-2">
          <h2 className="display-title chromatic text-3xl sm:text-4xl text-paper-white">
            {current!.title}
          </h2>
          {current!.solved && (
            <span className="punk-sticker" style={{ background: "var(--glitch-cyan)", color: "var(--ink-black)" }}>
              SOLVED
            </span>
          )}
        </div>
        <p className="text-xs text-paper-white/40 font-mono mb-1">{current!.slug}</p>

        <div className="punk-divider" />

        {/* Puzzle Component */}
        <div className="my-6">
          <Puzzle config={current!.config} onAnswer={(text) => setAnswer(text)} />
        </div>

        <div className="punk-divider" />

        {/* Answer + Submit + Hint Bar */}
        <div className="panel halftone relative p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="hunt-answer-input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter the code"
              autoComplete="off"
              spellCheck={false}
              className="border-2 border-paper-white/20 bg-ink-black/60 px-4 py-2.5 font-mono text-lg uppercase text-paper-white outline-none transition-all duration-200 focus:border-glitch-cyan focus:shadow-[0_0_15px_rgba(0,245,212,0.2)] flex-1 min-w-[200px]"
            />
            <button
              id="hunt-submit-btn"
              onClick={() => void submit(answer)}
              disabled={busy || !answer.trim() || current!.solved}
              className="comic-btn"
            >
              {busy ? "..." : "Submit"}
            </button>
            <button
              id="hunt-hint-btn"
              onClick={() => void buyHint()}
              disabled={current!.hintsUsed >= current!.hintCount || current!.solved}
              className="comic-btn comic-btn-cyan"
            >
              Hint ({current!.hintsUsed}/{current!.hintCount})
            </button>
          </div>

          {/* Hint display */}
          {hint && (
            <div className="anim-pop mt-4 flex gap-3 border-l-2 p-3" style={{ borderColor: "var(--glitch-cyan)", background: "rgba(0, 245, 212, 0.05)" }}>
              <span className="text-glitch-cyan display-title text-sm shrink-0">HINT</span>
              <p className="text-sm text-paper-white/90">{hint}</p>
            </div>
          )}

          {/* Status message */}
          {message && (
            <p
              className="anim-pop mt-3 display-title text-sm"
              style={{
                color: current!.solved ? "var(--glitch-cyan)" : "var(--signal-wrong)",
              }}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
