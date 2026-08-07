"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * How many rows are visible before the list scrolls.
 *
 * The list is absolutely positioned so ranks can slide when they change, which
 * means its height is `rows.length * ROW_HEIGHT` with nothing bounding it. At
 * the event's full field of 60 teams that is 2520px — the sidebar becomes three
 * screen-heights tall and drags the whole page layout with it. Capping the
 * viewport and scrolling inside keeps the panel a fixed size at any field size
 * while leaving the slide animation untouched, since the inner container keeps
 * its full height and only the wrapper scrolls.
 */
const VISIBLE_ROWS = 10;

export default function Standings({
  round,
  teamName,
}: {
  round: QuizRound;
  /**
   * The viewer's own team, so their row can be marked and scrolled to. With 60
   * teams a mid-table team is off-screen in a 10-row window, and a leaderboard
   * you cannot find yourself on is not much of a leaderboard.
   */
  teamName?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stale, setStale] = useState(false);
  const ownRowRef = useRef<HTMLDivElement | null>(null);
  const lastOwnRank = useRef<number | null>(null);

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

    // Jittered, for the same reason as Round1Games' poll: 100 clients on a
    // fixed interval all fire in the same millisecond and leave the rest of the
    // window idle, and it is the per-second peak that throttles, not the
    // average. Standings is an aggregation over the score ledger, so its peak
    // is the expensive one to bunch up.
    let timer = 0;
    const tick = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        await load();
        if (!cancelled) tick();
      }, POLL_MS + Math.random() * POLL_MS * 0.3);
    };
    tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [round]);

  /**
   * Keep the viewer's own row in view — but only when their rank actually
   * moves.
   *
   * Scrolling on every poll would yank the list back every four seconds while
   * someone is reading the rest of the table. Gating on a rank change means it
   * fires when there is something to see, and `block: "nearest"` scrolls the
   * minimum distance rather than centring, so a row already visible does not
   * move at all.
   */
  useEffect(() => {
    if (!teamName) return;
    const own = rows.find((r) => r.teamName.toLowerCase() === teamName.toLowerCase());
    if (!own) return;
    if (lastOwnRank.current === own.rank) return;
    lastOwnRank.current = own.rank;
    // After the 550ms rank-slide, or it scrolls to where the row used to be.
    const t = window.setTimeout(
      () => ownRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      600
    );
    return () => window.clearTimeout(t);
  }, [rows, teamName]);

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
          <div
            className="overflow-y-auto overscroll-contain pr-1"
            // Only constrain once there are more rows than fit; a short field
            // should not sit in a half-empty scroll box.
            style={{ maxHeight: Math.min(rows.length, VISIBLE_ROWS) * ROW_HEIGHT }}
          >
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {rows.map((row) => {
              const out = row.qualifying === false;
              const leader = row.rank === 1;
              const isOwn = !!teamName && row.teamName.toLowerCase() === teamName.toLowerCase();
              return (
                <div
                  key={row.teamId}
                  ref={isOwn ? ownRowRef : undefined}
                  className={`absolute inset-x-0 flex items-center justify-between p-2.5 comic-border-sm transition-all ${
                    out ? "bg-surface-container-low opacity-45" : leader ? "bg-tertiary-fixed/20 border-primary" : "bg-surface-container-lowest"
                  } ${isOwn ? "ring-2 ring-primary" : ""}`}
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
                    {Number(row.points).toFixed(2)} <span className="font-label-sm text-[10px] text-on-surface-variant">PTS</span>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </aside>
  );
}
