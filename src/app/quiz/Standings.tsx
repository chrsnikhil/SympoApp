"use client";

import { useEffect, useState } from "react";
import type { QuizRound } from "@/lib/db/types";

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
    <aside className="bg-surface comic-border p-5 comic-tilt-right">
      <div className="relative">
        <div className="mb-4 flex items-center justify-between border-b-2 border-on-surface/10 pb-3">
          <h3 className="font-display-xl text-headline-lg-mobile text-on-surface uppercase italic">Multiverse Standings</h3>
          {stale && <span className="font-label-sm text-xs text-primary uppercase animate-pulse">reconnecting...</span>}
        </div>

        {rows.length === 0 ? (
          <p className="font-label-sm text-xs text-on-surface-variant uppercase py-2">Nothing scored yet, True Believer!</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const out = row.qualifying === false;
              return (
                <div
                  key={row.teamId}
                  className={`flex items-center justify-between p-3 comic-border-sm transition-all ${
                    out ? "bg-surface-container-low opacity-45" : "bg-surface-container-lowest"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display-xl text-lg text-on-surface w-6">{row.rank}</span>
                    <div
                      className="w-4 h-4 rounded-full comic-border-sm"
                      style={{ backgroundColor: row.avatarColour ?? "#a41616" }}
                      title={row.avatarName ?? undefined}
                    />
                    <span className="font-headline-lg text-caption-bold uppercase truncate max-w-[160px] sm:max-w-xs text-on-surface">
                      {row.teamName}
                    </span>
                  </div>
                  <div className="font-display-xl text-headline-lg-mobile text-primary">
                    {row.points} <span className="font-label-sm text-xs text-on-surface-variant">PTS</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {advances !== null && rows.length > 0 && (
          <p className="mt-4 border-t-2 border-dashed border-on-surface/20 pt-3 font-label-sm text-[11px] text-on-surface-variant uppercase">
            Top <span className="text-primary font-bold">{advances}</span> carry into next round. Ties break on faster time.
          </p>
        )}
      </div>
    </aside>
  );
}
