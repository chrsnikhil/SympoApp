"use client";

import { useCallback, useEffect, useState } from "react";

/** Cosmetic-only lookup — the arrangement of which token sits where is never
 *  known client-side until a cell is actually flipped by the server. */
const VARIANT_LOOK: Record<string, { label: string; colour: string }> = {
  "spider-man": { label: "PETER", colour: "#3a86ff" },
  miles: { label: "MILES", colour: "#e5223b" },
  gwen: { label: "GWEN", colour: "#ff6ec7" },
  miguel: { label: "MIGUEL", colour: "#00e5ff" },
  hobie: { label: "HOBIE", colour: "#facc15" },
  noir: { label: "NOIR", colour: "#9ca3af" },
  pavitr: { label: "PAVITR", colour: "#fb923c" },
  peni: { label: "PENI", colour: "#a78bfa" },
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

  if (!state) return <p className="font-label-sm text-sm uppercase text-on-surface-variant">Loading the grid…</p>;

  const revealedIndexes = new Set(state.revealed.map((r) => r.index));
  const matchedIndexes = new Map(state.matched.map((m) => [m.index, m.token]));
  const revealedTokens = new Map(state.revealed.map((r) => [r.index, r.token]));
  const cap = state.completedAt !== null;
  const out = state.flipsUsed >= state.flipCap;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between font-label-sm text-xs uppercase text-on-surface-variant">
        <span>
          Flips: <span className="tabular-nums text-primary font-bold">{state.flipsUsed}</span> / <span className="tabular-nums text-on-surface">{state.flipCap}</span>
        </span>
        <span>
          Matched: <span className="tabular-nums text-primary font-bold">{state.matched.length / 2}</span> / {state.totalCells / 2}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 sm:gap-4">
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
              className={`aspect-square relative comic-border-sm transition-all duration-150 ${faceUp
                  ? "bg-surface-container-lowest comic-tilt-right"
                  : "bg-surface hover:bg-surface-container-high comic-tilt-left hover:scale-105"
                } ${disabled ? "cursor-default" : "cursor-pointer"}`}
              aria-label={faceUp ? look?.label ?? "card" : "face-down card"}
            >
              {faceUp ? (
                <div className="h-full w-full flex flex-col items-center justify-center p-1 text-center">
                  <div
                    className="w-4 h-4 rounded-full comic-border-sm mb-1"
                    style={{ backgroundColor: look?.colour ?? "#a41616" }}
                  />
                  <span className="font-display-xl text-xs uppercase leading-tight" style={{ color: look?.colour ?? "#1b1b1c" }}>
                    {look?.label ?? ""}
                  </span>
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-surface">
                  <span className="font-display-xl text-xl text-on-surface-variant/40">?</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="anim-shake mt-3 font-label-sm text-xs text-primary uppercase">{error}</p>}

      {state.completedAt && (
        <p className="mt-4 comic-border bg-tertiary-fixed text-on-tertiary-fixed px-4 py-3 font-headline-lg text-headline-lg-mobile uppercase text-center comic-tilt-right">
          {state.scoredPoints && state.scoredPoints > 0 ? `MATCHED! +${state.scoredPoints} PTS` : "OUT OF FLIPS."}
        </p>
      )}
    </div>
  );
}
