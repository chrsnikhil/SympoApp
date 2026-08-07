"use client";

import { useEffect, useRef, useState } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

interface Round {
  slug: string;
  title: string;
  solved: boolean;
  solvedAt: string | null;
  hintsUsed: number;
}

interface TeamRow {
  teamId: string;
  teamName: string;
  number: number | null;
  solvedCount: number;
  hintsUsed: number;
  roundPoints: number;
  lastSolvedAt: string | null;
  rounds: Round[];
}

interface RoundSummary {
  slug: string;
  title: string;
  points: number;
  seeded: boolean;
  solvedBy: number;
}

interface Overview {
  generatedAt: string;
  teamCount: number;
  teams: TeamRow[];
  rounds: RoundSummary[];
}

const POLL_MS = 10_000;

/**
 * Treasure hunt console — read-only.
 *
 * There is nothing to click that changes state, and that is the design rather
 * than an unfinished version of something else. The hunt has no timer to
 * restart and no questions to release; what a coordinator needs mid-event is to
 * tell "this team is stuck" from "this round is broken", and both are answered
 * by looking. The grader stays the only thing that can decide a round is solved.
 */
export default function HuntAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialised once and held in a ref — the shape HuntShell uses. It closes
  // over nothing but the stable setters, and it keeps the polling effect free
  // of a dependency that would rebuild the interval on every render.
  const loadRef = useRef(async () => {
    try {
      const res = await fetch("/api/admin/hunt/overview", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setError("Not signed in as an admin. Reload and sign in again.");
        return;
      }
      if (!res.ok) {
        setError("Could not load the hunt overview.");
        return;
      }
      setData((await res.json()) as Overview);
      setError(null);
    } catch {
      // Keep the last good screen up. A coordinator glancing at this during a
      // round is better served by slightly stale numbers than by an error that
      // replaces them.
      setData((prev) => {
        if (prev === null) setError("Network error — check your connection.");
        return prev;
      });
    }
  });

  useEffect(() => {
    void loadRef.current();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadRef.current();
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="relative min-h-screen bg-[#070308] p-4 font-sans text-gray-100 sm:p-8">
      <SpiderBackgroundFX />

      <div className="relative mx-auto max-w-6xl">
        <header className="mb-6">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-red-500">
            Spider HQ
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Treasure Hunt</h1>
          <p className="mt-2 text-sm text-gray-400">
            Read-only. Refreshes on its own every {POLL_MS / 1000}s.
          </p>
        </header>

        {error && (
          <div className="mb-6 border border-red-500/40 bg-red-950/30 p-4 font-mono text-sm text-red-300">
            {error}
          </div>
        )}

        {!data && !error && (
          <p className="font-mono text-sm text-gray-500">Loading…</p>
        )}

        {data && (
          <>
            {/* Per-round totals. One team stuck is a team; twenty teams stuck
                on the same round is a round. */}
            <section className="mb-8">
              <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gray-500">
                Rounds
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.rounds.map((r) => (
                  <div
                    key={r.slug}
                    className="border border-gray-800 bg-black/40 p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{r.title}</span>
                      <span className="shrink-0 font-mono text-xs text-gray-500">
                        {r.points} pts
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[0.7rem] text-gray-600">{r.slug}</p>
                    {!r.seeded ? (
                      // A round in the code but not in the database is the
                      // failure that looks like a broken puzzle to every team at
                      // once, so it gets said plainly rather than shown as zero.
                      <p className="mt-2 font-mono text-xs text-red-400">
                        NOT SEEDED — no challenge row
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-gray-300">
                        <span className="text-2xl font-bold text-white">{r.solvedBy}</span>
                        <span className="text-gray-500"> / {data.teamCount} solved</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-gray-500">
                Teams ({data.teamCount})
              </h2>

              {data.teams.length === 0 ? (
                <p className="border border-gray-800 bg-black/40 p-6 text-center font-mono text-sm text-gray-500">
                  No team has opened the hunt yet.
                </p>
              ) : (
                <div className="overflow-x-auto border border-gray-800">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-black/60 font-mono text-[0.7rem] uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="p-3">Team</th>
                        <th className="p-3">No.</th>
                        {data.rounds.map((r) => (
                          <th key={r.slug} className="p-3 text-center" title={r.title}>
                            {/* Slug, not title: five full titles will not fit a
                                phone and the slug is what the logs say. */}
                            {r.slug.replace(/^hunt-/, "")}
                          </th>
                        ))}
                        <th className="p-3 text-right">Solved</th>
                        <th className="p-3 text-right">Hints</th>
                        <th className="p-3 text-right">Round pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.teams.map((t) => (
                        <tr key={t.teamId} className="border-t border-gray-800/70">
                          <td className="p-3 font-medium">{t.teamName}</td>
                          <td className="p-3 font-mono text-gray-500">{t.number ?? "—"}</td>
                          {data.rounds.map((r) => {
                            const mine = t.rounds.find((x) => x.slug === r.slug);
                            return (
                              <td key={r.slug} className="p-3 text-center">
                                <span
                                  className={
                                    mine?.solved ? "text-emerald-400" : "text-gray-700"
                                  }
                                  title={
                                    mine?.solvedAt
                                      ? new Date(mine.solvedAt).toLocaleTimeString()
                                      : "not solved"
                                  }
                                >
                                  {mine?.solved ? "●" : "○"}
                                </span>
                              </td>
                            );
                          })}
                          <td className="p-3 text-right font-mono">{t.solvedCount}</td>
                          <td className="p-3 text-right font-mono text-gray-500">
                            {t.hintsUsed}
                          </td>
                          <td className="p-3 text-right font-mono">{t.roundPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-3 font-mono text-[0.7rem] text-gray-600">
                {/*
                  Said out loud because the two numbers WILL differ on screen and
                  a coordinator should not have to guess which is wrong. Neither
                  is: they measure different things.
                */}
                Round pts counts solved rounds only. The leaderboard applies hint
                deductions on top, so its totals are lower — that is expected, not
                a discrepancy.
              </p>
            </section>

            <p className="mt-8 font-mono text-[0.65rem] text-gray-700">
              snapshot {new Date(data.generatedAt).toLocaleTimeString()}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
