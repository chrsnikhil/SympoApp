"use client";

import { useEffect, useState } from "react";
import type { QuizRound } from "@/lib/db/types";
import TeamAvatar from "@/components/ui/TeamAvatar";

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
const ROW_HEIGHT = 42;

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
    <aside className="bg-surface comic-border p-5 comic-tilt-right h-fit">
      <div className="relative">
        <div className="mb-4 flex items-center justify-between border-b-2 border-on-surface/10 pb-3">
          <h3 className="font-display-xl text-headline-lg-mobile text-on-surface uppercase italic">Multiverse Standings</h3>
          {stale && <span className="font-label-sm text-xs text-primary uppercase animate-pulse">reconnecting...</span>}
        </div>

        {rows.length === 0 ? (
          <p className="font-label-sm text-xs text-on-surface-variant uppercase py-2">Nothing scored yet, True Believer!</p>
        ) : (
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {rows.map((row) => {
              const out = row.qualifying === false;
              const leader = row.rank === 1;
              return (
                <div
                  key={row.teamId}
                  className={`absolute inset-x-0 flex items-center justify-between p-2.5 comic-border-sm transition-all ${
                    out ? "bg-surface-container-low opacity-45" : leader ? "bg-tertiary-fixed/20 border-primary" : "bg-surface-container-lowest"
                  }`}
                  style={{
                    top: (row.rank - 1) * ROW_HEIGHT,
                    height: ROW_HEIGHT - 6,
                    transition: "top 550ms cubic-bezier(0.22, 1, 0.36, 1), background-color 300ms ease-out",
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-display-xl text-base text-on-surface w-4 shrink-0">{row.rank}</span>
                    <TeamAvatar
                      avatarColour={row.avatarColour}
                      avatarName={row.avatarName}
                      teamName={row.teamName}
                      size="sm"
                    />
                    <span className="font-headline-lg text-xs uppercase truncate text-on-surface">
                      {row.teamName}
                    </span>
                  </div>
                  <div className="font-display-xl text-sm text-primary shrink-0">
                    {row.points} <span className="font-label-sm text-[10px] text-on-surface-variant">PTS</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
