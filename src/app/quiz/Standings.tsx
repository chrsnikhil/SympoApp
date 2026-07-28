"use client";

import { useEffect, useState } from "react";
import type { QuizRound } from "@/lib/db/types";

/**
 * Live standings for the current round. Polls rather than sockets — a poll
 * against a cached endpoint degrades far more gracefully under load than many
 * open connections, and this is exactly the "live leaderboard" Round 3 asks
 * for.
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

export default function Standings({ round }: { round: QuizRound }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [advances, setAdvances] = useState<number | null>(null);
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
        setAdvances(body.advances ?? null);
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
    <aside className="halftone panel h-fit p-4">
      <div className="relative">
        <div className="mb-3 flex items-baseline justify-between border-b-2 border-paper-white/10 pb-2">
          <h3 className="font-display text-base uppercase tracking-wide text-paper-white">Standings</h3>
          {stale && <span className="text-[0.6rem] uppercase tracking-widest text-glitch-cyan">reconnecting</span>}
        </div>

        {rows.length === 0 ? (
          <p className="py-2 text-xs text-paper-white/45">Nothing scored yet.</p>
        ) : (
          <ol className="space-y-0.5">
            {rows.map((row) => {
              const out = row.qualifying === false;
              return (
                <li
                  key={row.teamId}
                  className={`flex items-center gap-2 border-l-2 py-1.5 pl-2 pr-1 text-xs ${
                    out ? "border-transparent opacity-40" : "border-glitch-cyan/60 bg-paper-white/[0.03]"
                  }`}
                >
                  <span className="w-4 font-display tabular-nums text-paper-white/45">{row.rank}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0"
                    style={{ background: row.avatarColour ?? "rgba(242,239,233,0.3)" }}
                    title={row.avatarName ?? undefined}
                  />
                  <span className="flex-1 truncate text-paper-white/90">{row.teamName}</span>
                  <span className="font-mono tabular-nums font-semibold text-paper-white">{row.points}</span>
                </li>
              );
            })}
          </ol>
        )}

        {advances !== null && rows.length > 0 && (
          <p className="mt-3 border-t-2 border-paper-white/10 pt-3 text-[0.7rem] leading-relaxed text-paper-white/50">
            Top <span className="tabular-nums text-glitch-cyan">{advances}</span> carry into the next round. Ties break on the faster time.
          </p>
        )}
      </div>
    </aside>
  );
}
