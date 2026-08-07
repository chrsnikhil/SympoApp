"use client";

import { useEffect, useRef, useState } from "react";
import { LEADERBOARD_REFRESH_MS } from "@/lib/config";

interface Row {
  teamId: string;
  teamName: string;
  points: number;
  lastScoreAt: string | null;
  solvedCount?: number;
}

/**
 * Live hunt standings.
 *
 * Reads the materialized snapshot rather than aggregating, so a room full of
 * teams refreshing this costs one indexed read each instead of one aggregation
 * each. `?event=hunt` is explicit even though the host would imply it: this
 * page is reachable from the apex during testing, and a leaderboard that
 * silently showed a different event's scores would be worse than an error.
 *
 * Polling stops while the tab is hidden. Sixty phones left open on this screen
 * for an afternoon is the difference between a background hum and a load
 * pattern, and a hidden tab has nobody looking at it.
 */
export default function HuntStandings({ ownTeamId }: { ownTeamId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  /**
   * Held in a ref, initialised once — the same shape HuntShell uses.
   *
   * It closes over nothing but the setters, which React guarantees are stable,
   * so there is no stale-closure hazard. The indirection is what keeps the
   * polling effect free of a dependency that would otherwise rebuild the
   * interval on every render.
   */
  const loadRef = useRef(async () => {
    try {
      const res = await fetch("/api/leaderboard?event=hunt", { cache: "no-store" });
      if (!res.ok) {
        setError("Could not load the standings.");
        return;
      }
      const body = (await res.json()) as { rows?: Row[]; generatedAt?: string };
      setRows(body.rows ?? []);
      setGeneratedAt(body.generatedAt ?? null);
      setError(null);
    } catch {
      // A dropped poll is not worth showing: the previous standings are still
      // on screen and still roughly true. Only a failed FIRST load is an error
      // the viewer can act on.
      setRows((prev) => {
        if (prev === null) setError("Network error — check your connection.");
        return prev;
      });
    }
  });

  useEffect(() => {
    void loadRef.current();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadRef.current();
    }, LEADERBOARD_REFRESH_MS);
    // Catch up immediately on return rather than making someone wait out the
    // remainder of an interval that ticked while they were away.
    const onShow = () => {
      if (document.visibilityState === "visible") void loadRef.current();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden px-5 py-10">
      <div className="web-bg" />

      <div className="relative mx-auto max-w-3xl">
        <p className="font-body text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">
          XPLORE&apos;26
        </p>
        <h1 className="display-title chromatic mt-1 text-5xl sm:text-6xl text-paper-white">
          Standings
        </h1>
        <p className="mt-3 text-sm text-paper-white/60">
          Updates on its own every few seconds. No need to refresh.
        </p>

        <div className="punk-divider mt-6" />

        {error && (
          <p className="mt-8 p-4 text-center font-mono text-sm text-signal-wrong">{error}</p>
        )}

        {!error && rows === null && (
          <p className="mt-8 p-4 text-center font-mono text-sm text-paper-white/40">
            {"// Loading standings..."}
          </p>
        )}

        {!error && rows?.length === 0 && (
          <p className="mt-8 p-4 text-center font-mono text-sm text-paper-white/40">
            Nobody has scored yet. Be first.
          </p>
        )}

        {rows && rows.length > 0 && (
          <ol className="mt-8 grid gap-3">
            {rows.map((r, i) => {
              const isOwn = r.teamId === ownTeamId;
              return (
                <li key={r.teamId}>
                  <div
                    className={`halftone panel relative flex items-center justify-between p-5 ${
                      isOwn ? "ring-2 ring-glitch-cyan" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span
                        className="display-title flex h-10 w-10 shrink-0 items-center justify-center text-lg"
                        style={{
                          // Top three carry the accent; the rest stay neutral so
                          // the podium is readable at a glance from across a hall.
                          background: i < 3 ? "var(--glitch-cyan)" : "var(--spider-red)",
                          color: i < 3 ? "var(--ink-black)" : "var(--paper-white)",
                          border: "2px solid var(--paper-white)",
                          transform: `rotate(${i % 2 === 0 ? -2 : 3}deg)`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="display-title block truncate text-lg text-paper-white">
                          {r.teamName}
                          {isOwn && (
                            <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-glitch-cyan">
                              you
                            </span>
                          )}
                        </span>
                        {typeof r.solvedCount === "number" && (
                          <span className="mt-0.5 block font-mono text-xs text-paper-white/40">
                            {r.solvedCount} solved
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="display-title shrink-0 pl-3 text-sm text-glitch-cyan">
                      {r.points} PTS
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {generatedAt && (
          <p className="mt-6 text-center font-mono text-[0.65rem] text-paper-white/30">
            {/*
              The snapshot's own timestamp, not the time of this render. If
              materialization ever stalls, a clock that keeps ticking would hide
              exactly the fault worth noticing.
            */}
            snapshot {new Date(generatedAt).toLocaleTimeString()}
          </p>
        )}

        <div className="mt-8 text-center">
          <a
            href="/hunt"
            className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-paper-white/40 transition-colors hover:text-glitch-cyan"
          >
            ← Back to the hunt
          </a>
        </div>
      </div>
    </main>
  );
}
