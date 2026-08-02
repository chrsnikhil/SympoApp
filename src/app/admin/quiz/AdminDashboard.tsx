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
  eliminated?: boolean;
}

interface ConnectionsPuzzleInfo {
  slug: string;
  title: string;
  clue: string | null;
  revealedCount: number;
  totalImages: number;
  puzzleIndex: number;
  opensAt: string | null;
  closesAt: string | null;
  solvedCount: number;
}

interface Overview {
  round: number;
  title: string;
  defaultAdvances: number | null;
  groqConfigured: boolean;
  ended: boolean;
  started?: boolean;
  standings: StandingRow[];
  round1?: {
    games: Array<{ slug: string; title: string; format: string; points: number }>;
    perTeam: Array<{
      teamId: string;
      teamName: string;
      image: { status: string; points: number | null } | null;
      connections: { puzzleIndex: number; totalPuzzles: number; solvedPuzzles: number; doneWithAll: boolean } | null;
      memory: { flipsUsed: number; flipCap: number; matchedPairs: number; totalPairs: number; completed: boolean; points: number | null } | null;
    }>;
  };
  judgeQueue?: Array<{ teamId: string; teamName: string; submittedAt: string; imageId: string | null }>;
  connectionsPuzzles?: ConnectionsPuzzleInfo[];
  comeback?: Array<{ teamId: string; teamName: string; bottomStreak: number; ability: string | null; usableOnSlug: string | null; used: boolean }>;
  flags?: Array<{ teamId: string; teamName: string; tabSwitch: number; windowBlur: number; fullscreenExit: number; lastAt: string }>;
  coins: { claimed: number; total: number; rows: Array<{ coin: string; character: string; team: string; isLocked?: boolean }> };
}

const POLL_MS = 3000;

export default function AdminDashboard() {
  const [round, setRound] = useState(1);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState("");
  const [advanceConfirm, setAdvanceConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showStageLeaderboard, setShowStageLeaderboard] = useState(false);
  const [assignCoin, setAssignCoin] = useState("");
  const [assignTeamName, setAssignTeamName] = useState("");
  const [customCount, setCustomCount] = useState("");

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

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  async function callAdvance(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      if (body.action === "start-quiz") {
        setData((prev) => (prev ? { ...prev, started: true } : prev));
      }
      if (body.action === "restart-quiz") {
        setRound(1);
        setData((prev) => (prev ? { ...prev, started: false, ended: false } : prev));
      }
      const res = await fetch("/api/quiz/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setMessage(res.ok ? (json.note ?? "Done.") : (json.error ?? "Action failed."));
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="spiderverse-bg grid min-h-screen place-items-center p-12">
        <div className="comic-caption-yellow text-center text-xl">THWIP! Loading Multiverse Command Center…</div>
      </div>
    );
  }

  return (
    <div className="spiderverse-bg halftone relative min-h-screen overflow-hidden p-5 text-paper-white">
      <div className="comic-speed-lines" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-7xl space-y-5">
        <header className="panel panel-accent flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="comic-caption-yellow px-2 py-0.5 text-[0.65rem] font-bold">XPLORE&apos;26 ADMIN</span>
              <span
                className={`border border-ink-black px-2.5 py-0.5 text-[0.65rem] font-bold uppercase ${
                  data.ended ? "bg-signal-wrong text-paper-white" : "bg-signal-good text-ink-black"
                }`}
              >
                {data.ended ? "ENDED" : "LIVE"}
              </span>
            </div>
            <h1 className="display-title chromatic mt-1 text-3xl text-paper-white sm:text-4xl">Multiverse Quiz Command Center</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowStageLeaderboard(true)} className="comic-btn comic-btn-yellow px-4 py-2 text-xs font-bold">
              View Stage Leaderboard
            </button>
          </div>
        </header>

        {message && (
          <div className="fixed bottom-6 right-6 z-[99999] flex max-w-md items-center justify-between gap-4 border-2 border-glitch-cyan bg-[#0d0e12] p-4 text-paper-white shadow-[6px_6px_0px_0px_rgba(0,229,255,1)] anim-pop rounded-none">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-glitch-cyan bg-glitch-cyan/20 text-lg font-bold">
                !
              </span>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-glitch-cyan">SYSTEM NOTICE</p>
                <p className="font-mono text-xs font-bold text-paper-white leading-tight">{message}</p>
              </div>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="shrink-0 border border-spider-red bg-spider-red/20 px-3 py-1.5 text-xs font-bold text-spider-red hover:bg-spider-red hover:text-paper-white transition-colors"
            >
              DISMISS
            </button>
          </div>
        )}

        {round === 1 && !data.groqConfigured && (
          <div className="admin-card border-l-4 border-signal-wrong px-4 py-3 text-sm text-signal-wrong">
            GROQ_API_KEY is not set. Image Replication can&apos;t be auto-judged — use the manual score override below,
            or set the key before the round runs.
          </div>
        )}

        {/* ROUND CONTROLS */}
        <section className="panel space-y-4 p-5">
          <h2 className="display-title text-xl text-glitch-cyan">Round Controls</h2>
          <p className="text-sm font-semibold text-paper-white/95">
            {round < 3
              ? `Advancing Round ${round} to Round ${round + 1}. Default advances: ${data.defaultAdvances ?? "—"} teams.`
              : "Round 3 — final round."}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {round === 1 && !data.started ? (
              <button
                disabled={busy}
                onClick={() => callAdvance({ action: "start-quiz" })}
                className="comic-btn comic-btn-yellow px-5 py-2.5 text-sm font-bold shadow-lg animate-pulse"
              >
                START QUIZ
              </button>
            ) : (
              round < 3 &&
              (!advanceConfirm ? (
                <button onClick={() => setAdvanceConfirm(true)} className="comic-btn comic-btn-cyan px-4 py-2 text-xs">
                  Proceed to Round {round + 1}
                </button>
              ) : (
                <div className="flex items-center gap-2 border border-signal-good bg-ink-black p-2">
                  <span className="text-xs font-bold text-signal-good">
                    PROCEED TO ROUND {round + 1}? (Remaining qualified teams will advance)
                  </span>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await callAdvance({ action: "advance", round });
                      setAdvanceConfirm(false);
                      setRound((r) => Math.min(3, r + 1));
                    }}
                    className="comic-btn comic-btn-cyan px-3 py-1 text-xs font-bold"
                  >
                    YES, PROCEED
                  </button>
                  <button onClick={() => setAdvanceConfirm(false)} className="comic-btn bg-ink-black px-3 py-1 text-xs">
                    CANCEL
                  </button>
                </div>
              ))
            )}

            {(round === 3 || data.ended) &&
              (data.ended ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 border-2 border-signal-good bg-signal-good/10 px-4 py-2 text-signal-good text-xs font-bold uppercase tracking-widest rounded">
                    QUIZ CONCLUDED — CHAMPIONS VICTORY SCREEN IS LIVE
                  </div>
                </div>
              ) : !endConfirm ? (
                <button onClick={() => setEndConfirm(true)} className="comic-btn comic-btn-pink px-4 py-2 text-xs">
                  End Quiz
                </button>
              ) : (
                <div className="flex items-center gap-2 border border-signal-wrong bg-ink-black p-2">
                  <span className="text-xs font-bold text-signal-wrong">END THE QUIZ? All participants will see the Champions Victory page.</span>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await callAdvance({ action: "end-quiz" });
                      setEndConfirm(false);
                    }}
                    className="comic-btn comic-btn-pink px-3 py-1 text-xs font-bold"
                  >
                    YES, END IT
                  </button>
                  <button onClick={() => setEndConfirm(false)} className="comic-btn bg-ink-black px-3 py-1 text-xs">
                    CANCEL
                  </button>
                </div>
              ))}

            {/* RESET / RESTART QUIZ BUTTON (Always accessible) */}
            {!resetConfirm ? (
              <button
                onClick={() => setResetConfirm(true)}
                className="comic-btn comic-btn-yellow px-4 py-2 text-xs font-bold"
              >
                Reset Quiz (Scores to Zero)
              </button>
            ) : (
              <div className="flex items-center gap-2 border border-comic-yellow bg-ink-black p-2">
                <span className="text-xs font-bold text-comic-yellow">
                  RESET GAMEPLAY? (Sets all scores to 0 & returns to start. Teams & coins remain assigned).
                </span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    await callAdvance({ action: "restart-quiz" });
                    setResetConfirm(false);
                    setRound(1);
                  }}
                  className="comic-btn comic-btn-yellow px-3 py-1 text-xs font-bold"
                >
                  YES, RESET SCORES TO 0
                </button>
                <button onClick={() => setResetConfirm(false)} className="comic-btn bg-ink-black px-3 py-1 text-xs">
                  CANCEL
                </button>
              </div>
            )}
          </div>
        </section>

        {/* STANDINGS */}
        <section className="panel p-5">
          <h2 className="display-title mb-3 text-xl text-glitch-cyan">{data.title} — Standings ({data.standings.length})</h2>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>Hero</th>
                  <th>Points</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((s) => (
                  <tr key={s.teamId}>
                    <td className="font-display text-glitch-cyan">#{s.rank}</td>
                    <td className="font-bold">{s.teamName}</td>
                    <td>{s.avatarName ?? "—"}</td>
                    <td className="font-mono font-bold text-comic-yellow">{s.points}</td>
                    <td>{s.tiebreakSeconds}s</td>
                    <td>
                      <span className={`text-[0.65rem] font-bold ${s.eliminated ? "text-signal-wrong" : "text-signal-good"}`}>
                        {s.eliminated ? "CUT" : "QUALIFIED"}
                      </span>
                    </td>
                    <td>
                      {s.eliminated ? (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            await callAdvance({ action: "restore-team", teamId: s.teamId });
                          }}
                          className="px-2.5 py-1 text-[0.65rem] font-bold border border-signal-good bg-signal-good/20 text-signal-good hover:bg-signal-good hover:text-ink-black transition-colors rounded"
                          title="Restore team back into the round"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            await callAdvance({ action: "eliminate-team", teamId: s.teamId });
                          }}
                          className="px-2.5 py-1 text-[0.65rem] font-bold border border-spider-red bg-spider-red/20 text-spider-red hover:bg-spider-red hover:text-paper-white transition-colors rounded"
                          title="Eliminate team instantly"
                        >
                          Eliminate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ROUND 1 — judge queue, connections pacing */}
        {round === 1 && data.round1 && (
          <>
            {data.judgeQueue && (
              <section className="panel p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-sm uppercase tracking-wide text-paper-white font-bold">Image Replication judge queue ({data.judgeQueue.length})</h2>
                  <button
                    disabled={busy || data.judgeQueue.length === 0}
                    onClick={() => callAdvance({ action: "judge-image", slug: "image-1" })}
                    className="comic-btn comic-btn-cyan px-4 py-2 text-xs"
                  >
                    Judge remaining now
                  </button>
                </div>
                <p className="mb-3 text-xs font-semibold text-paper-white/85">
                  Submissions remain queued while the event is active so teams can freely re-upload and refine their creations.
                  Click &quot;Judge remaining now&quot; (or wait for the round to end) to send the latest submission from each team to the vision model.
                </p>
                {data.judgeQueue.length > 0 && (
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
                )}
              </section>
            )}

            {data.connectionsPuzzles && (
              <section className="panel p-5">
                <h2 className="display-title mb-1 text-xl text-glitch-cyan">Connections — reveal control</h2>
                <p className="mb-4 text-xs font-semibold text-paper-white/85">
                  Coordinator-paced: click a puzzle&apos;s image to reveal it live for every team at once. A puzzle
                  needs to be opened before its tiles can be revealed.
                </p>
                <div className="space-y-3">
                  {data.connectionsPuzzles.map((p) => {
                    const notOpen = !p.opensAt;
                    const closed = !!(p.closesAt && new Date(p.closesAt) <= new Date());
                    return (
                      <div key={p.slug} className="admin-card p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-display text-sm text-paper-white font-bold">Puzzle {p.puzzleIndex}</span>
                            <span className="ml-2 text-xs font-semibold text-paper-white/90">{p.clue ?? "No clue set"}</span>
                          </div>
                          <span className="text-xs uppercase tracking-widest text-paper-white/90 font-bold">
                            {closed ? "closed" : notOpen ? "not opened" : `${p.revealedCount}/${p.totalImages} revealed`} · {p.solvedCount} solved
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {notOpen ? (
                            <button
                              disabled={busy}
                              onClick={() => callAdvance({ action: "open", slug: p.slug, minutes: 30 })}
                              className="comic-btn comic-btn-cyan px-3 py-1.5 text-xs font-bold"
                            >
                              Start Puzzle & Reveal Tile 1
                            </button>
                          ) : p.revealedCount >= p.totalImages ? (
                            <div className="border border-signal-good/50 bg-signal-good/15 text-signal-good px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 shadow">
                              <span>All {p.totalImages} Tiles Revealed</span>
                              <span className="text-paper-white/60">• 10s Answer Timer Active ({p.solvedCount} Solved)</span>
                            </div>
                          ) : (
                            <button
                              disabled={busy || closed}
                              onClick={() => callAdvance({ action: "reveal-next-image", slug: p.slug })}
                              className="comic-btn comic-btn-cyan px-3 py-1.5 text-xs font-bold"
                            >
                              Reveal Next Tile (Tile {p.revealedCount + 1} of {p.totalImages})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* PROCTOR FLAGS — rounds 2/3 */}
        {(round === 2 || round === 3) && data.flags && (
          <section className="panel p-5">
            <h2 className="display-title mb-1 text-xl text-glitch-cyan">Proctor flags</h2>
            <p className="mb-3 text-xs font-semibold text-paper-white/85">
              Client-reported tab switches, window blurs (alt+tab / ctrl+tab) and fullscreen exits during this round.
              A signal to review, not an automatic disqualification — a browser can&apos;t police itself.
            </p>
            {data.flags.length === 0 ? (
              <p className="text-xs font-bold text-paper-white/70">Nothing flagged.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Tab switches</th>
                      <th>Window blur (alt/ctrl+tab)</th>
                      <th>Left fullscreen</th>
                      <th>Last flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.flags.map((f) => (
                      <tr key={f.teamId}>
                        <td className="font-bold">{f.teamName}</td>
                        <td className={f.tabSwitch > 0 ? "text-signal-wrong" : ""}>{f.tabSwitch}</td>
                        <td className={f.windowBlur > 0 ? "text-signal-wrong" : ""}>{f.windowBlur}</td>
                        <td className={f.fullscreenExit > 0 ? "text-signal-wrong" : ""}>{f.fullscreenExit}</td>
                        <td className="text-paper-white/50">{new Date(f.lastAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TOKEN MANAGEMENT */}
        <section className="panel panel-accent p-5">
          <h2 className="display-title mb-1 text-xl text-gadget-pink">Token Management</h2>
          <p className="mb-4 text-xs font-semibold text-paper-white/85">
            Assign a coin to any team — online-registered (matched by name) or a walk-in (creates the team on the
            spot). A coin is locked to whichever team holds it; revoke first to reassign it.
          </p>

          <div className="mb-5 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest font-bold text-paper-white/85">Coin #</label>
              <input
                value={assignCoin}
                onChange={(e) => setAssignCoin(e.target.value)}
                placeholder="01-60"
                className="w-24 border border-paper-white/20 bg-ink-black px-3 py-1.5 font-mono text-xs text-paper-white outline-none focus:border-gadget-pink"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs uppercase tracking-widest font-bold text-paper-white/85">Team name</label>
              <input
                value={assignTeamName}
                onChange={(e) => setAssignTeamName(e.target.value)}
                placeholder="Team name (existing or new)"
                className="w-full border border-paper-white/20 bg-ink-black px-3 py-1.5 text-xs text-paper-white outline-none focus:border-gadget-pink"
              />
            </div>
            <button
              disabled={busy || !assignCoin.trim()}
              onClick={async () => {
                await callAdvance({ action: "assign-coin", coin: assignCoin.trim(), teamName: assignTeamName.trim() });
                setAssignCoin("");
                setAssignTeamName("");
              }}
              className="comic-btn comic-btn-pink px-4 py-2 text-xs"
            >
              Assign
            </button>
          </div>

          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-glitch-cyan">
            Claimed coins ({data.coins.claimed}/{data.coins.total})
          </h3>
          <div className="max-h-64 overflow-y-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Hero</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.coins.rows.map((c) => (
                  <tr key={c.coin}>
                    <td className="font-mono font-bold text-glitch-cyan">#{c.coin}</td>
                    <td>{c.character}</td>
                    <td>{c.team}</td>
                    <td>
                      <span className={`text-[0.65rem] font-bold px-2 py-0.5 border ${c.isLocked ? "border-spider-red bg-spider-red/20 text-spider-red" : "border-signal-good bg-signal-good/20 text-signal-good"}`}>
                        {c.isLocked ? "IN USE" : "ACTIVE"}
                      </span>
                    </td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() => callAdvance({ action: "unlock-coin", coin: c.coin })}
                        className="px-2.5 py-1 text-[0.65rem] font-bold border-2 border-glitch-cyan text-glitch-cyan hover:bg-glitch-cyan/20 transition-colors rounded shadow-sm"
                        title="Unlock token login so team can re-enter token on any device without losing team data"
                      >
                        UNLOCK
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* EMERGENCY RESET */}
        <section className="panel panel-accent p-4">
          <h3 className="comic-shout mb-2 text-lg text-signal-wrong">Emergency Reset</h3>
          <p className="mb-2 text-xs text-paper-white/50">Clears a team&apos;s play history (not its coin or access). Use &quot;all&quot; for everyone.</p>
          <input
            value={resetTarget}
            onChange={(e) => setResetTarget(e.target.value)}
            placeholder="Team name or all"
            className="mb-2 w-full border border-paper-white/20 bg-ink-black px-3 py-1.5 font-mono text-xs text-paper-white outline-none focus:border-signal-wrong"
          />
          <button
            disabled={busy || !resetTarget.trim()}
            onClick={async () => {
              await callAdvance({ action: "reset", slug: resetTarget.trim() });
              setResetTarget("");
            }}
            className="comic-btn w-full bg-signal-wrong py-1.5 text-xs text-paper-white"
          >
            Reset {resetTarget.trim() || "state"}
          </button>
        </section>
      </div>

      {showStageLeaderboard && (
        <div className="halftone anim-pop fixed inset-0 z-[9999] flex flex-col justify-between bg-ink-black p-8">
          <div>
            <div className="mb-6 flex items-center justify-between border-b-2 border-glitch-cyan pb-3">
              <div>
                <p className="comic-caption-yellow text-[0.65rem]">STAGE BROADCAST</p>
                <h1 className="display-title chromatic mt-1 text-4xl text-paper-white">LIVE LEADERBOARD</h1>
              </div>
              <button onClick={() => setShowStageLeaderboard(false)} className="comic-btn comic-btn-pink px-4 py-2 text-xs">
                Close
              </button>
            </div>
            <div className="grid gap-2">
              {data.standings.slice(0, 10).map((s) => (
                <div key={s.teamId} className="panel flex items-center justify-between border border-glitch-cyan bg-ink-black/90 p-3">
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-glitch-cyan">#{s.rank}</span>
                    <span className="font-display text-xl uppercase text-paper-white">{s.teamName}</span>
                  </div>
                  <span className="font-mono text-2xl font-bold text-comic-yellow">{s.points} PTS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
