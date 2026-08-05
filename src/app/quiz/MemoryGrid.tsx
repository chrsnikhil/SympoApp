"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Character card visual metadata */
const VARIANT_LOOK: Record<string, { label: string; colour: string; image?: string }> = {
  "spider-man": { label: "PETER PARKER", colour: "#e5223b", image: "/quiz/card-1.jpeg" },
  miles: { label: "MILES MORALES", colour: "#000000", image: "/quiz/card-2.jpeg" },
  gwen: { label: "GWEN STACY", colour: "#ff6ec7", image: "/quiz/card-3.jpeg" },
  miguel: { label: "MIGUEL O'HARA", colour: "#00e5ff", image: "/quiz/card-4.jpeg" },
  hobie: { label: "HOBIE BROWN", colour: "#facc15", image: "/quiz/card-5.jpeg" },
  noir: { label: "SPIDER-NOIR", colour: "#9ca3af", image: "/quiz/card-6.jpeg" },
  pavitr: { label: "PAVITR PRABHAKAR", colour: "#fb923c", image: "/quiz/card-7.jpeg" },
  peni: { label: "PENI PARKER", colour: "#a78bfa", image: "/quiz/card-8.jpeg" },
};

interface MemoryPublicState {
  slug: string;
  totalCells: number;
  flipsUsed: number;
  flipCap: number;
  matched: Array<{ index: number; token: string }>;
  revealed: Array<{ index: number; token: string }>;
  completedAt: string | null;
  scoredPoints: number | null;
}

interface MismatchItem {
  index: number;
  token: string;
}

export default function MemoryGrid({ slug, onDone }: { slug: string; onDone: (points: number) => void }) {
  const [state, setState] = useState<MemoryPublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMismatch, setPendingMismatch] = useState<MismatchItem[]>([]);
  const mismatchTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quiz/memory?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cancelled) await load();
    }
    void run();
    return () => {
      cancelled = true;
      if (mismatchTimer.current) window.clearTimeout(mismatchTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (state?.completedAt && state.scoredPoints !== null) onDone(state.scoredPoints);
  }, [state?.completedAt, state?.scoredPoints, onDone]);

  async function flip(cellIndex: number) {
    if (busy || !state || state.completedAt || pendingMismatch.length > 0) return;

    if (mismatchTimer.current) {
      window.clearTimeout(mismatchTimer.current);
      mismatchTimer.current = null;
      setPendingMismatch([]);
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz/memory/flip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, cellIndex }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not flip that card");
        return;
      }
      setState(body.state);

      // If this flip resolved a mismatch, hold both cards face-up for 700ms then auto-flip back
      if (body.matched === false && Array.isArray(body.mismatchInfo)) {
        setPendingMismatch(body.mismatchInfo);
        mismatchTimer.current = window.setTimeout(() => {
          setPendingMismatch([]);
          mismatchTimer.current = null;
        }, 700);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p className="font-comic text-xl text-paper-white/40">Loading card deck…</p>;

  const revealedIndexes = new Set(state.revealed.map((r) => r.index));
  const matchedIndexes = new Map(state.matched.map((m) => [m.index, m.token]));
  const revealedTokens = new Map(state.revealed.map((r) => [r.index, r.token]));
  const mismatchIndexes = new Map(pendingMismatch.map((m) => [m.index, m.token]));

  const cap = state.completedAt !== null;
  const out = state.flipsUsed >= state.flipCap;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono tracking-wider uppercase text-paper-white bg-ink-black/80 border border-paper-white/20 px-4 py-2.5 rounded shadow">
        <div>
          <span>FLIPS: </span>
          <span className="text-comic-yellow font-bold">{state.flipsUsed} / {state.flipCap}</span>
          <span className="text-paper-white/50 text-[10px] ml-1">({Math.max(0, state.flipCap - state.flipsUsed)} left)</span>
        </div>

        <div>
          <span>PAIRS: </span>
          <span className="text-glitch-cyan font-bold">{state.matched.length / 2} / {state.totalCells / 2}</span>
        </div>

        <div>
          <span>SCORE: </span>
          <span className="text-signal-good font-bold">{(state.matched.length / 2) * 2} PTS</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 sm:gap-4 max-w-2xl mx-auto">
        {Array.from({ length: state.totalCells }, (_, i) => {
          const isMatched = matchedIndexes.has(i);
          const isRevealed = revealedIndexes.has(i);
          const isPendingMismatch = mismatchIndexes.has(i);

          const faceUp = isMatched || isRevealed || isPendingMismatch;
          const token = matchedIndexes.get(i) ?? revealedTokens.get(i) ?? mismatchIndexes.get(i);
          const look = token ? VARIANT_LOOK[token] : null;
          const disabled = busy || cap || out || faceUp || pendingMismatch.length > 0;

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => flip(i)}
              className="card-3d-scene aspect-[3/4] w-full focus:outline-none disabled:cursor-not-allowed group"
              aria-label={faceUp ? look?.label ?? "card" : "face-down card"}
            >
              <div className={`card-3d-inner ${faceUp ? "is-flipped" : ""} ${isPendingMismatch ? "anim-shake" : ""}`}>
                
                {/* ── CARD BACK (UNREVEALED PLAYING CARD) ── */}
                <div className="card-3d-face border-3 border-ink-black bg-gradient-to-br from-[#1b1c22] to-[#0d0e12] p-2 flex flex-col justify-between items-center shadow-[4px_4px_0px_rgba(0,0,0,0.8)] group-hover:border-comic-yellow transition-colors relative overflow-hidden">
                  {/* Comic spider web watermark overlay */}
                  <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--spider-red)_0%,_transparent_70%)]" />
                  
                  <div className="w-full flex justify-between text-[10px] text-spider-red/70 font-mono">
                    <span>+</span>
                    <span>+</span>
                  </div>

                  <div className="w-10 h-10 rounded-full border-2 border-comic-yellow/80 bg-ink-black flex items-center justify-center shadow-lg relative z-10">
                    <span className="font-display text-xl text-comic-yellow">?</span>
                  </div>

                  <div className="w-full flex justify-between text-[10px] text-spider-red/70 font-mono rotate-180">
                    <span>+</span>
                    <span>+</span>
                  </div>
                </div>

                {/* ── CARD FRONT (REVEALED CHARACTER CARD) ── */}
                <div
                  className={`card-3d-face card-3d-back border-3 flex flex-col justify-between relative overflow-hidden shadow-xl ${
                    isMatched
                      ? "border-signal-good shadow-[0_0_15px_rgba(34,197,94,0.6)]"
                      : isPendingMismatch
                        ? "border-spider-red shadow-[0_0_15px_rgba(229,34,59,0.6)]"
                        : "border-glitch-cyan shadow-[0_0_15px_rgba(0,225,255,0.4)]"
                  }`}
                  style={{ backgroundColor: `${look?.colour ?? "#111"}22` }}
                >
                  {look?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={look.image} alt={look.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center bg-ink-black text-center p-2">
                      <span className="font-display text-xs" style={{ color: look?.colour ?? "#fff" }}>
                        {look?.label ?? ""}
                      </span>
                    </div>
                  )}

                  {/* Status Indicator Badges */}
                  {isMatched && (
                    <div className="absolute top-1 right-1 bg-signal-good text-ink-black w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shadow">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                  {isPendingMismatch && (
                    <div className="absolute top-1 right-1 bg-spider-red text-paper-white w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shadow">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="anim-shake mt-3 text-xs text-signal-wrong text-center">{error}</p>}

      {state.completedAt && (
        <div className="mt-4 border-2 border-glitch-cyan bg-glitch-cyan/15 p-4 text-center rounded space-y-1">
          <p className="font-display text-2xl text-glitch-cyan">
            {state.matched.length === state.totalCells
              ? `MATCHED ALL PAIRS! +${state.scoredPoints ?? 0} PTS`
              : `OUT OF FLIPS${state.scoredPoints ? ` — +${state.scoredPoints} PTS FOR ${state.matched.length / 2} PAIR${state.matched.length === 2 ? "" : "S"}` : ""}`}
          </p>
          <p className="text-xs text-paper-white/70">
            Completed in {state.flipsUsed} flips!
          </p>
        </div>
      )}
    </div>
  );
}
