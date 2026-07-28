"use client";

import { useCallback, useEffect, useState } from "react";

interface StandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  points: number;
  tiebreakSeconds: number;
  answered: number;
  avatarName: string | null;
  qualifying: boolean | null;
}

interface Overview {
  round: number;
  title: string;
  defaultAdvances: number | null;
  groqConfigured: boolean;
  standings: StandingRow[];
  round1?: {
    games: Array<{ slug: string; title: string; format: string; points: number }>;
    perTeam: Array<{
      teamId: string;
      teamName: string;
      image: { status: string; points: number | null } | null;
      memory: { flipsUsed: number; flipCap: number; matchedPairs: number; totalPairs: number; completed: boolean; points: number | null } | null;
      guess: { status: string; points: number | null } | null;
    }>;
  };
  judgeQueue?: Array<{ teamId: string; teamName: string; submittedAt: string; imageId: string | null }>;
  comeback?: Array<{ teamId: string; teamName: string; bottomStreak: number; ability: string | null; usableOnSlug: string | null; used: boolean }>;
  coins: { claimed: number; total: number; rows: Array<{ coin: string; character: string; team: string }> };
}

const POLL_MS = 4000;

export default function AdminDashboard() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState("");
  const [advanceConfirm, setAdvanceConfirm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/quiz/overview?round=${round}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, [round]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cancelled) await load();
    }
    void run();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  async function callAdvance(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/quiz/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setMessage(res.ok ? "Done." : (json.error ?? "Failed."));
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="admin-shell grid place-items-center p-10">
        <p className="text-sm text-paper-white/50">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="admin-shell p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-paper-white/15 pb-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-glitch-cyan">XPLORE&apos;26 · Coordinator</p>
          <h1 className="font-display text-2xl uppercase text-paper-white">Spider Multiverse Tech Quiz</h1>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((r) => (
            <button
              key={r}
              onClick={() => setRound(r)}
              className={`border px-4 py-2 text-sm font-semibold uppercase tracking-wide ${
                round === r ? "border-glitch-cyan text-glitch-cyan" : "border-paper-white/20 text-paper-white/60 hover:border-paper-white/50"
              }`}
            >
              Round {r}
            </button>
          ))}
        </div>
      </header>

      {round === 1 && !data.groqConfigured && (
        <div className="admin-card mb-4 border-l-4 border-signal-wrong px-4 py-3 text-sm text-signal-wrong">
          GROQ_API_KEY is not set. Image Replication can&apos;t be auto-judged — use manual scores via
          &quot;resolve-image&quot; or set the key before the round runs.
        </div>
      )}

      {message && <div className="admin-card mb-4 px-4 py-2 text-sm text-glitch-cyan">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="admin-card p-4">
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-paper-white/70">
              {data.title} — standings ({data.standings.length} teams)
            </h2>
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Team</th>
                    <th>Character</th>
                    <th>Points</th>
                    <th>Tiebreak (s)</th>
                    <th>Answered</th>
                    <th>Cut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((r) => (
                    <tr key={r.teamId}>
                      <td>{r.rank}</td>
                      <td>{r.teamName}</td>
                      <td>{r.avatarName ?? "—"}</td>
                      <td>{r.points}</td>
                      <td>{r.tiebreakSeconds}</td>
                      <td>{r.answered}</td>
                      <td>
                        {r.qualifying === null ? "—" : (
                          <span
                            className="admin-dot"
                            style={{ background: r.qualifying ? "var(--signal-good)" : "var(--signal-wrong)" }}
                            title={r.qualifying ? "would advance" : "would be cut"}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {round === 1 && data.round1 && (
            <section className="admin-card p-4">
              <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-paper-white/70">Round 1 — three-game monitor</h2>
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Image Replication</th>
                      <th>Memory</th>
                      <th>Guess the Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.round1.perTeam.map((t) => (
                      <tr key={t.teamId}>
                        <td>{t.teamName}</td>
                        <td>{t.image ? `${t.image.status}${t.image.points !== null ? ` · ${t.image.points}pt` : ""}` : "—"}</td>
                        <td>
                          {t.memory
                            ? `${t.memory.matchedPairs}/${t.memory.totalPairs} pairs · ${t.memory.flipsUsed}/${t.memory.flipCap} flips${
                                t.memory.completed ? ` · ${t.memory.points}pt` : ""
                              }`
                            : "not started"}
                        </td>
                        <td>{t.guess ? `${t.guess.status}${t.guess.points !== null ? ` · ${t.guess.points}pt` : ""}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {round === 1 && data.judgeQueue && (
            <section className="admin-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm uppercase tracking-wide text-paper-white/70">
                  Image Replication judge queue ({data.judgeQueue.length})
                </h2>
                <button
                  disabled={busy || data.judgeQueue.length === 0}
                  onClick={() => callAdvance({ action: "judge-image", slug: "image-1" })}
                  className="comic-btn comic-btn-cyan px-4 py-2 text-xs"
                >
                  Judge all
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.judgeQueue.map((q) => (
                      <tr key={q.teamId}>
                        <td>{q.teamName}</td>
                        <td>{new Date(q.submittedAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => callAdvance({ action: "open", slug: "image-1", minutes: 5 })}
                  className="border border-paper-white/20 px-4 py-2 text-xs text-paper-white/70 hover:border-paper-white/50"
                >
                  Open Image Replication (5 min)
                </button>
                <button
                  disabled={busy}
                  onClick={() => callAdvance({ action: "open", slug: "guess-1", minutes: 3 })}
                  className="border border-paper-white/20 px-4 py-2 text-xs text-paper-white/70 hover:border-paper-white/50"
                >
                  Open Guess the Number (3 min)
                </button>
                <button
                  disabled={busy}
                  onClick={() => callAdvance({ action: "resolve-estimate", slug: "guess-1" })}
                  className="comic-btn px-4 py-2 text-xs"
                >
                  Settle Guess the Number
                </button>
              </div>
            </section>
          )}

          {round === 3 && data.comeback && (
            <section className="admin-card p-4">
              <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-paper-white/70">Comeback Meter</h2>
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Bottom streak</th>
                      <th>Ability</th>
                      <th>Attached to</th>
                      <th>Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.comeback.map((c) => (
                      <tr key={c.teamId}>
                        <td>{c.teamName}</td>
                        <td>{c.bottomStreak}</td>
                        <td>{c.ability ?? "—"}</td>
                        <td>{c.usableOnSlug ?? "—"}</td>
                        <td>{c.used ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="admin-card p-4">
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-paper-white/70">Round control</h2>
            {round < 3 ? (
              <>
                <p className="mb-3 text-xs text-paper-white/50">
                  Cuts to round {round + 1}. Default advances: {data.defaultAdvances ?? "—"}. This is treated as
                  irreversible — a cut announced on stage can&apos;t really be walked back.
                </p>
                {!advanceConfirm ? (
                  <button onClick={() => setAdvanceConfirm(true)} className="comic-btn comic-btn-cyan w-full">
                    Cut to round {round + 1}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-signal-wrong">Confirm the cut — this decides who plays on.</p>
                    <button
                      disabled={busy}
                      onClick={async () => {
                        await callAdvance({ action: "advance", round });
                        setAdvanceConfirm(false);
                      }}
                      className="comic-btn w-full"
                    >
                      Yes, cut to round {round + 1}
                    </button>
                    <button onClick={() => setAdvanceConfirm(false)} className="w-full border border-paper-white/20 px-4 py-2 text-xs text-paper-white/60">
                      Cancel
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-paper-white/50">Round 3 is the final round — the standings above are the result.</p>
            )}
          </section>

          <section className="admin-card p-4">
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-paper-white/70">Coins</h2>
            <p className="mb-2 text-xs text-paper-white/50">
              {data.coins.claimed} / {data.coins.total} claimed
            </p>
            <div className="max-h-64 overflow-y-auto overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Character</th>
                    <th>Team</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coins.rows.map((c) => (
                    <tr key={c.coin}>
                      <td>{c.coin}</td>
                      <td>{c.character}</td>
                      <td>{c.team}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-card border-l-4 border-signal-wrong p-4">
            <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-signal-wrong">Reset</h2>
            <p className="mb-2 text-xs text-paper-white/50">
              Clears serves, submissions, ledger rows, qualifications and comeback state, and releases the coin.
              Type a team name, or &quot;all&quot;, to confirm.
            </p>
            <input
              value={resetTarget}
              onChange={(e) => setResetTarget(e.target.value)}
              placeholder="Team name or all"
              className="mb-2 w-full border-2 border-paper-white/20 bg-ink-black/60 px-3 py-2 text-sm text-paper-white outline-none focus:border-signal-wrong"
            />
            <button
              disabled={busy || !resetTarget.trim()}
              onClick={async () => {
                await callAdvance({ action: "reset", slug: resetTarget.trim() });
                setResetTarget("");
              }}
              className="w-full border-2 border-signal-wrong px-4 py-2 text-xs font-semibold uppercase tracking-wide text-signal-wrong hover:bg-signal-wrong/10"
            >
              Reset {resetTarget.trim() || "…"}
            </button>
          </section>

          <section className="admin-card p-4 text-xs text-paper-white/45">
            <h2 className="mb-2 font-display text-sm uppercase tracking-wide text-paper-white/70">Fallback tiers</h2>
            <p>
              This dashboard calls <code className="font-mono text-paper-white/70">POST /api/quiz/advance</code> directly —
              usable with curl/Postman if this page breaks. If the app server itself is down,{" "}
              <code className="font-mono text-paper-white/70">npx tsx scripts/quiz-admin.ts</code> talks to Mongo
              directly, no HTTP required.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
