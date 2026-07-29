"use client";

import { useEffect, useState } from "react";
import type { QuizRound } from "@/lib/db/types";
import { WebNet } from "./WebShooter";

/**
 * Live standings for the current round. Polls rather than sockets — a poll
 * against a cached endpoint degrades far more gracefully under load than many
 * open connections, and this is exactly the "live leaderboard" Round 3 asks
 * for.
 *
 * Rows are absolutely positioned by rank rather than relying on flex/DOM
 * order, and each row keeps the same key (`teamId`) across polls — that's
 * what makes a rank change animate as a smooth slide (like an F1 timing
 * tower) instead of the whole list just re-rendering in a new order. React
 * only ever changes one row's `top`; the CSS transition does the rest.
 */

interface Row {
  rank: number;
  teamId: string;
  teamName: string;
  points: number;
  tiebreakSeconds: number;
  answered: number;
  avatarName: string | null;
  avatarColour: string | null;
  qualifying: boolean | null;
}

const POLL_MS = 4_000;
const ROW_HEIGHT = 36;

export default function Standings({ round }: { round: QuizRound }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/quiz/standings?round=${round}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        setRows(body.rows ?? []);
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    }

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [round]);

  return (
    <aside className="halftone panel relative h-fit overflow-hidden p-4">
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 opacity-15">
        <WebNet colour="var(--glitch-cyan)" originX={50} originY={50} animate={false} />
      </span>

      <div className="relative">
        <div className="mb-3 flex items-baseline justify-between border-b-2 border-spider-red/40 pb-2">
          <h3 className="display-title chromatic text-base uppercase tracking-wide text-paper-white">Standings</h3>
          {stale && <span className="text-[0.6rem] uppercase tracking-widest text-glitch-cyan">reconnecting</span>}
        </div>

        {rows.length === 0 ? (
          <p className="py-2 text-xs text-paper-white/45">Nothing scored yet.</p>
        ) : (
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {rows.map((row) => {
              const out = row.qualifying === false;
              const leader = row.rank === 1;
              return (
                <div
                  key={row.teamId}
                  className={`absolute inset-x-0 flex items-center gap-2 border-l-2 py-1.5 pl-2 pr-1 text-xs ${
                    out
                      ? "border-transparent opacity-40"
                      : leader
                        ? "border-spider-red bg-spider-red/10"
                        : "border-glitch-cyan/60 bg-paper-white/[0.03]"
                  }`}
                  style={{
                    top: (row.rank - 1) * ROW_HEIGHT,
                    height: ROW_HEIGHT - 4,
                    transition: "top 550ms cubic-bezier(0.22, 1, 0.36, 1), background-color 300ms ease-out",
                  }}
                >
                  <span className={`w-4 font-display tabular-nums ${leader ? "text-spider-red" : "text-paper-white/45"}`}>{row.rank}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ background: row.avatarColour ?? "rgba(242,239,233,0.3)" }}
                    title={row.avatarName ?? undefined}
                  />
                  <span className="flex-1 truncate text-paper-white/90">{row.teamName}</span>
                  <span className="font-mono tabular-nums font-semibold text-paper-white">{row.points}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
