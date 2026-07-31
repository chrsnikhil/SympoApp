"use client";

import { useCallback, useEffect, useState } from "react";

/** Cosmetic-only lookup — the arrangement of which token sits where is never
 *  known client-side until a cell is actually flipped by the server. */
const VARIANT_LOOK: Record<string, { label: string; colour: string; image?: string }> = {
  "spider-man": { label: "PETER", colour: "#3a86ff", image: "/quiz/card-1.jpeg" },
  miles: { label: "MILES", colour: "#e5223b", image: "/quiz/card-2.jpeg" },
  gwen: { label: "GWEN", colour: "#ff6ec7", image: "/quiz/card-3.jpeg" },
  miguel: { label: "MIGUEL", colour: "#00e5ff", image: "/quiz/card-4.jpeg" },
  hobie: { label: "HOBIE", colour: "#facc15", image: "/quiz/card-5.jpeg" },
  noir: { label: "NOIR", colour: "#9ca3af", image: "/quiz/card-6.jpeg" },
  pavitr: { label: "PAVITR", colour: "#fb923c", image: "/quiz/card-7.jpeg" },
  peni: { label: "PENI", colour: "#a78bfa", image: "/quiz/card-8.jpeg" },
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

export default function MemoryGrid({ slug, onDone }: { slug: string; onDone: (points: number) => void }) {
  const [state, setState] = useState<MemoryPublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    };
  }, [load]);

  useEffect(() => {
    if (state?.completedAt && state.scoredPoints !== null) onDone(state.scoredPoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.completedAt, state?.scoredPoints]);

  async function flip(cellIndex: number) {
    if (busy || !state || state.completedAt) return;
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
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <p className="font-comic text-xl text-paper-white/40">Loading the grid…</p>;

  const revealedIndexes = new Set(state.revealed.map((r) => r.index));
  const matchedIndexes = new Map(state.matched.map((m) => [m.index, m.token]));
  const revealedTokens = new Map(state.revealed.map((r) => [r.index, r.token]));
  const cap = state.completedAt !== null;
  const out = state.flipsUsed >= state.flipCap;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.2em] text-paper-white/45">
        <span>
          Flips <span className="tabular-nums text-paper-white/70">{state.flipsUsed}</span> / <span className="tabular-nums text-paper-white/70">{state.flipCap}</span>
        </span>
        <span>
          Matched <span className="tabular-nums text-glitch-cyan">{state.matched.length / 2}</span> / {state.totalCells / 2}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: state.totalCells }, (_, i) => {
          const matchedToken = matchedIndexes.get(i);
          const revealedToken = revealedTokens.get(i);
          const faceUp = matchedIndexes.has(i) || revealedIndexes.has(i);
          const token = matchedToken ?? revealedToken;
          const look = token ? VARIANT_LOOK[token] : null;
          const disabled = busy || cap || out || faceUp;

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => flip(i)}
              className="card-flip-scene aspect-square"
              aria-label={faceUp ? look?.label ?? "card" : "face-down card"}
            >
              <div className={`card-flip-inner relative h-full w-full ${faceUp ? "is-flipped" : ""}`}>
                <div
                  className={`card-face grid place-items-center border-2 ${matchedToken ? "border-glitch-cyan/70" : "border-paper-white/20"} bg-ink-black/70`}
                >
                  <span className="font-display text-lg text-paper-white/25">?</span>
                </div>
                <div
                  className="card-face card-face-back grid place-items-center overflow-hidden border-2 text-center relative"
                  style={{ borderColor: look?.colour ?? "#666", background: `${look?.colour ?? "#666"}22` }}
                >
                  {look?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={look.image} alt={look.label} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-comic text-xs leading-tight sm:text-sm" style={{ color: look?.colour ?? "#fff" }}>
                      {look?.label ?? ""}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="anim-shake mt-3 text-xs text-signal-wrong">{error}</p>}

      {state.completedAt && (
        <p className="mt-4 border-l-4 border-glitch-cyan bg-glitch-cyan/10 px-3 py-2 font-comic text-lg text-glitch-cyan">
          {state.scoredPoints && state.scoredPoints > 0 ? `MATCHED! +${state.scoredPoints}` : "OUT OF FLIPS."}
        </p>
      )}
    </div>
  );
}
