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
      connections: { attempts: number; solved: boolean } | null;
      memory: { flipsUsed: number; flipCap: number; matchedPairs: number; totalPairs: number; completed: boolean; points: number | null } | null;
    }>;
  };
  judgeQueue?: Array<{ teamId: string; teamName: string; submittedAt: string; imageId: string | null }>;
  comeback?: Array<{ teamId: string; teamName: string; bottomStreak: number; ability: string | null; usableOnSlug: string | null; used: boolean }>;
  flags?: Array<{ teamId: string; teamName: string; tabSwitch: number; windowBlur: number; fullscreenExit: number; lastAt: string }>;
  coins: { claimed: number; total: number; rows: Array<{ coin: string; character: string; team: string }> };
}

interface QuestionItem {
  id: string;
  slug: string;
  title: string;
  options?: string[];
  points: number;
}

const POLL_MS = 3000;

export default function AdminDashboard() {
  const [round, setRound] = useState(1);
  const [activeTab, setActiveTab] = useState<"hub" | "standings" | "questions" | "vision">("hub");
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState("");
  const [advanceConfirm, setAdvanceConfirm] = useState(false);

  // Admin Control States
  const [quizStatus, setQuizStatus] = useState<"running" | "paused" | "ended">("running");
  const [mutedTeams, setMutedTeams] = useState<Record<string, boolean>>({});
  const [showStageLeaderboard, setShowStageLeaderboard] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  // Persistent Gadget Token Dock State
  const [tokenStates, setTokenStates] = useState<Record<string, { assignedTeam: string; active: boolean }>>({});
  const [assignTokenInput, setAssignTokenInput] = useState("");
  const [assignTeamSelect, setAssignTeamSelect] = useState("");

  // Live Question Editing State
  const [questions, setQuestions] = useState<QuestionItem[]>([
    { id: "q1", slug: "r1-q1", title: "What does HTTP stand for?", options: ["HyperText Transfer Protocol", "High Throughput Transfer Protocol", "Hyperlink Text Transmission Process", "Host Transfer Type Protocol"], points: 100 },
    { id: "q2", slug: "r1-q2", title: "Which port does HTTPS use by default?", options: ["21", "80", "443", "8080"], points: 100 },
    { id: "q3", slug: "r1-q3", title: "What is the average time complexity of binary search?", options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], points: 100 },
  ]);
  const [editingQuestion, setEditingQuestion] = useState<QuestionItem | null>(null);

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
      setMessage(res.ok ? "Action executed successfully." : (json.error ?? "Action failed."));
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  }

  const toggleMuteTeam = (teamId: string) => {
    setMutedTeams((prev) => ({ ...prev, [teamId]: !prev[teamId] }));
  };

  const handleSaveQuestion = () => {
    if (!editingQuestion) return;
    setQuestions((prev) => prev.map((q) => (q.id === editingQuestion.id ? editingQuestion : q)));
    setEditingQuestion(null);
    setMessage("Question updated.");
  };

  const handleAssignToken = () => {
    if (!assignTokenInput) return;
    const token = assignTokenInput.toUpperCase();
    setTokenStates((prev) => ({
      ...prev,
      [token]: { assignedTeam: assignTeamSelect || "Unassigned", active: true },
    }));
    setMessage(`Token ${token} assigned to ${assignTeamSelect || "Team"}.`);
    setAssignTokenInput("");
  };

  const handleRevokeToken = (tokenId: string) => {
    setTokenStates((prev) => {
      const copy = { ...prev };
      delete copy[tokenId];
      return copy;
    });
    setMessage(`Token ${tokenId} revoked & returned to pool.`);
  };

  const toggleTokenActive = (tokenId: string) => {
    setTokenStates((prev) => {
      if (!prev[tokenId]) return prev;
      return {
        ...prev,
        [tokenId]: { ...prev[tokenId], active: !prev[tokenId].active },
      };
    });
  };

  if (!data) {
    return (
      <div className="spiderverse-bg grid place-items-center p-12 min-h-screen">
        <div className="comic-caption-yellow text-center text-xl">
          THWIP! Loading Multiverse Command Center…
        </div>
      </div>
    );
  }

  return (
    <div className="spiderverse-bg min-h-screen text-paper-white p-5 halftone relative overflow-hidden">
      <div className="comic-speed-lines" aria-hidden="true" />

      <div className="relative z-10 max-w-7xl mx-auto space-y-5">
        {/* TOP BAR */}
        <header className="panel panel-accent p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="comic-caption-yellow text-[0.65rem] font-bold px-2 py-0.5">XPLORE&apos;26 ADMIN</span>
              <span className={`px-2.5 py-0.5 text-[0.65rem] font-bold uppercase border border-ink-black ${
                quizStatus === "running" ? "bg-signal-good text-ink-black" :
                quizStatus === "paused" ? "bg-amber-400 text-ink-black" :
                "bg-signal-wrong text-paper-white"
              }`}>
                {quizStatus === "running" ? "LIVE" : quizStatus === "paused" ? "PAUSED" : "ENDED"}
              </span>
            </div>
            <h1 className="display-title chromatic text-3xl sm:text-4xl mt-1 text-paper-white">
              MULTIVERSE QUIZ COMMAND CENTER
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowStageLeaderboard(!showStageLeaderboard)}
              className="comic-btn comic-btn-yellow text-xs px-3 py-1.5"
            >
              📺 {showStageLeaderboard ? "Close Board" : "Stage Leaderboard"}
            </button>
            <button onClick={() => setShowImportModal(true)} className="comic-btn comic-btn-pink text-xs px-3 py-1.5">
              📥 Import Roster
            </button>
            <div className="flex gap-1 border-l border-paper-white/20 pl-2">
              {[1, 2, 3].map((r) => (
                <button
                  key={r}
                  onClick={() => setRound(r)}
                  className={`comic-btn text-xs px-3 py-1.5 ${round === r ? "comic-btn-cyan" : "bg-ink-black/80 text-paper-white/60"}`}
                >
                  Round {r}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* NAV TABS */}
        <nav className="flex flex-wrap gap-2 border-b border-paper-white/15 pb-2">
          {[
            { id: "hub", label: "⚡ Command Hub" },
            { id: "standings", label: "🏆 Standings & Proctor Radar" },
            { id: "questions", label: "✍️ Question Editor" },
            { id: "vision", label: "🖼️ AI Vision Judge" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`comic-btn text-xs px-4 py-2 ${activeTab === tab.id ? "comic-btn-cyan" : "bg-ink-black/70 text-paper-white/60"}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* NOTIFICATION MESSAGE */}
        {message && (
          <div className="comic-caption-yellow text-xs flex items-center justify-between py-2 px-3">
            <span>💬 {message}</span>
            <button onClick={() => setMessage(null)} className="font-bold underline">Dismiss</button>
          </div>
        )}

        {/* MAIN LAYOUT */}
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* LEFT TAB CONTENT */}
          <div className="space-y-6">
            {activeTab === "hub" && (
              <div className="space-y-6">
                <section className="panel p-5 space-y-4">
                  <h2 className="display-title text-xl text-glitch-cyan">
                    Round {round} Controls & Advancement
                  </h2>
                  <p className="text-xs text-paper-white/70">
                    {round < 3 ? `Advancing Round ${round} to Round ${round + 1}. Default advances: ${data.defaultAdvances ?? "—"} teams.` : "Round 3 active — Final Round!"}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {quizStatus === "running" ? (
                      <button onClick={() => setQuizStatus("paused")} className="comic-btn comic-btn-yellow text-xs px-3 py-2">
                        ⏸ Pause Quiz
                      </button>
                    ) : (
                      <button onClick={() => setQuizStatus("running")} className="comic-btn comic-btn-cyan text-xs px-3 py-2">
                        ▶ Resume Quiz
                      </button>
                    )}

                    {round < 3 && (
                      !advanceConfirm ? (
                        <button onClick={() => setAdvanceConfirm(true)} className="comic-btn comic-btn-cyan text-xs px-4 py-2">
                          ▶ Proceed to Round {round + 1}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 border border-signal-good p-2 bg-ink-black">
                          <span className="text-xs text-signal-good font-bold">PROCEED TO ROUND {round + 1}?</span>
                          <button
                            onClick={async () => {
                              await callAdvance({ action: "advance", round });
                              setAdvanceConfirm(false);
                              if (round < 3) {
                                setRound((r) => Math.min(3, r + 1));
                              }
                            }}
                            className="comic-btn comic-btn-cyan text-xs px-3 py-1 font-bold"
                          >
                            YES, PROCEED
                          </button>
                          <button onClick={() => setAdvanceConfirm(false)} className="comic-btn text-xs px-3 py-1 bg-ink-black">
                            CANCEL
                          </button>
                        </div>
                      )
                    )}

                    <button onClick={() => setQuizStatus("ended")} className="comic-btn comic-btn-pink text-xs px-3 py-2">
                      ⏹ End Quiz
                    </button>
                  </div>
                </section>

                <section className="panel p-5">
                  <h3 className="comic-shout text-lg text-paper-white mb-3">Live Standings ({data.standings.length} Teams)</h3>
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
                        </tr>
                      </thead>
                      <tbody>
                        {data.standings.slice(0, 8).map((s) => (
                          <tr key={s.teamId}>
                            <td className="font-display text-glitch-cyan">#{s.rank}</td>
                            <td className="font-bold">{s.teamName}</td>
                            <td>{s.avatarName ?? "—"}</td>
                            <td className="font-mono text-comic-yellow font-bold">{s.points}</td>
                            <td>{s.tiebreakSeconds}s</td>
                            <td>
                              <span className={`px-2 py-0.5 text-[0.65rem] font-bold ${s.qualifying ? "text-signal-good" : "text-signal-wrong"}`}>
                                {s.qualifying ? "QUALIFIED" : "CUT"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "standings" && (
              <div className="space-y-6">
                <section className="panel p-5">
                  <h2 className="display-title text-xl text-glitch-cyan mb-3">Leaderboard & Team Management</h2>
                  <div className="overflow-x-auto">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Team</th>
                          <th>Hero</th>
                          <th>Points</th>
                          <th>Time</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.standings.map((r) => {
                          const isMuted = mutedTeams[r.teamId];
                          return (
                            <tr key={r.teamId} className={isMuted ? "opacity-40" : ""}>
                              <td className="font-display text-glitch-cyan">#{r.rank}</td>
                              <td className="font-bold">
                                {r.teamName}
                                {isMuted && <span className="ml-2 text-[0.6rem] text-amber-400 font-bold">[MUTED]</span>}
                              </td>
                              <td>{r.avatarName ?? "—"}</td>
                              <td className="font-mono text-comic-yellow font-bold">{r.points}</td>
                              <td>{r.tiebreakSeconds}s</td>
                              <td>
                                <div className="flex gap-1">
                                  <button onClick={() => toggleMuteTeam(r.teamId)} className="comic-btn text-xs px-2 py-0.5 bg-ink-black">
                                    {isMuted ? "Unmute" : "Mute"}
                                  </button>
                                  <button onClick={() => callAdvance({ action: "reset", slug: r.teamName })} className="comic-btn text-xs px-2 py-0.5 bg-signal-wrong">
                                    Reset
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "questions" && (
              <section className="panel p-5 space-y-3">
                <h2 className="display-title text-xl text-comic-yellow">Live Question Editor</h2>
                {questions.map((q) => (
                  <div key={q.id} className="panel p-3 flex items-center justify-between bg-ink-black/80">
                    <div>
                      <div className="font-bold text-sm text-paper-white">{q.title}</div>
                      <div className="text-xs text-glitch-cyan font-mono mt-0.5">Points: {q.points}</div>
                    </div>
                    <button onClick={() => setEditingQuestion(q)} className="comic-btn comic-btn-cyan text-xs px-3 py-1">
                      Edit Question
                    </button>
                  </div>
                ))}
              </section>
            )}

            {activeTab === "vision" && (
              <section className="panel p-5 space-y-3">
                <h2 className="display-title text-xl text-glitch-cyan">AI Vision Judge Queue</h2>
                {data.judgeQueue && (
                  <div className="space-y-3">
                    <button
                      disabled={busy || data.judgeQueue.length === 0}
                      onClick={() => callAdvance({ action: "judge-image", slug: "image-1" })}
                      className="comic-btn comic-btn-cyan text-xs px-3 py-1.5"
                    >
                      Judge Queue Now ({data.judgeQueue.length})
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* RIGHT PERSISTENT SIDEBAR */}
          <div className="space-y-6">
            <section className="panel panel-accent p-4">
              <h3 className="comic-shout text-lg text-gadget-pink mb-2">🪙 GADGET TOKENS DOCK</h3>
              <p className="text-xs text-paper-white/60 mb-3">Assign or Revoke tokens (`SG-XXXX`).</p>

              <div className="space-y-2 mb-3">
                <input
                  value={assignTokenInput}
                  onChange={(e) => setAssignTokenInput(e.target.value.toUpperCase())}
                  placeholder="SG-XXXX TOKEN ID"
                  className="w-full border border-paper-white/20 bg-ink-black px-3 py-1.5 text-xs text-paper-white outline-none focus:border-gadget-pink font-mono"
                />
                <select
                  value={assignTeamSelect}
                  onChange={(e) => setAssignTeamSelect(e.target.value)}
                  className="w-full border border-paper-white/20 bg-ink-black px-3 py-1.5 text-xs text-paper-white outline-none focus:border-gadget-pink"
                >
                  <option value="">Select Team</option>
                  {data.standings.map((t) => (
                    <option key={t.teamId} value={t.teamName}>{t.teamName}</option>
                  ))}
                </select>
                <button onClick={handleAssignToken} className="comic-btn comic-btn-pink w-full text-xs py-1.5">
                  + Assign Token
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2 border-t border-paper-white/15">
                <div className="text-[0.65rem] font-bold text-glitch-cyan">Active Tokens ({Object.keys(tokenStates).length})</div>
                {Object.entries(tokenStates).map(([tokenId, state]) => (
                  <div key={tokenId} className="flex items-center justify-between border border-paper-white/15 p-1.5 bg-ink-black/60 text-xs">
                    <div>
                      <div className="font-mono font-bold text-gadget-pink">{tokenId}</div>
                      <div className="text-[0.65rem] text-paper-white/50">{state.assignedTeam}</div>
                    </div>
                    <button
                      onClick={() => handleRevokeToken(tokenId)}
                      className="px-1.5 py-0.5 text-[0.6rem] font-bold border border-signal-wrong text-signal-wrong hover:bg-signal-wrong/20"
                    >
                      REVOKE
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel p-4">
              <h3 className="comic-shout text-lg text-comic-yellow mb-2">Claimed 3D Coins ({data.coins.claimed}/{data.coins.total})</h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Coin</th>
                      <th>Hero</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.coins.rows.map((c) => (
                      <tr key={c.coin}>
                        <td className="font-mono text-glitch-cyan font-bold">#{c.coin}</td>
                        <td>{c.character}</td>
                        <td>{c.team}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel panel-accent p-4">
              <h3 className="comic-shout text-lg text-signal-wrong mb-2">Emergency Reset</h3>
              <input
                value={resetTarget}
                onChange={(e) => setResetTarget(e.target.value)}
                placeholder="Team name or all"
                className="w-full border border-paper-white/20 bg-ink-black px-3 py-1.5 text-xs text-paper-white mb-2 outline-none focus:border-signal-wrong font-mono"
              />
              <button
                disabled={busy || !resetTarget.trim()}
                onClick={async () => { await callAdvance({ action: "reset", slug: resetTarget.trim() }); setResetTarget(""); }}
                className="comic-btn w-full text-xs py-1.5 bg-signal-wrong text-paper-white"
              >
                Reset {resetTarget.trim() || "State"}
              </button>
            </section>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {editingQuestion && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm grid place-items-center p-5">
          <div className="panel panel-accent max-w-lg w-full p-6">
            <h3 className="comic-shout text-xl text-glitch-cyan mb-3">Edit Question</h3>
            <input
              value={editingQuestion.title}
              onChange={(e) => setEditingQuestion({ ...editingQuestion, title: e.target.value })}
              className="w-full border border-paper-white/20 bg-ink-black px-3 py-2 text-sm text-paper-white mb-4 outline-none focus:border-glitch-cyan"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingQuestion(null)} className="comic-btn text-xs bg-ink-black px-3 py-1.5">Cancel</button>
              <button onClick={handleSaveQuestion} className="comic-btn comic-btn-cyan text-xs px-3 py-1.5">Save</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm grid place-items-center p-5">
          <div className="panel panel-accent max-w-lg w-full p-6">
            <h3 className="comic-shout text-xl text-comic-yellow mb-2">Import Team Roster</h3>
            <textarea
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Spider-Slingers&#10;Brooklyn Bytes"
              className="w-full border border-paper-white/20 bg-ink-black px-3 py-2 text-sm text-paper-white mb-4 outline-none focus:border-comic-yellow font-mono"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowImportModal(false)} className="comic-btn text-xs bg-ink-black px-3 py-1.5">Cancel</button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setMessage(`Imported ${importText.split("\n").filter(Boolean).length} teams.`);
                  setImportText("");
                }}
                className="comic-btn comic-btn-yellow text-xs px-3 py-1.5"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {showStageLeaderboard && (
        <div className="fixed inset-0 z-[9999] bg-ink-black p-8 flex flex-col justify-between anim-pop halftone">
          <div>
            <div className="flex justify-between items-center border-b-2 border-glitch-cyan pb-3 mb-6">
              <div>
                <p className="comic-caption-yellow text-[0.65rem]">STAGE BROADCAST</p>
                <h1 className="display-title chromatic text-4xl text-paper-white mt-1">LIVE LEADERBOARD</h1>
              </div>
              <button onClick={() => setShowStageLeaderboard(false)} className="comic-btn comic-btn-pink text-xs px-4 py-2">
                Close
              </button>
            </div>
            <div className="grid gap-2">
              {data.standings.slice(0, 10).map((s) => (
                <div key={s.teamId} className="panel p-3 flex items-center justify-between bg-ink-black/90 border border-glitch-cyan">
                  <div className="flex items-center gap-4">
                    <span className="font-display text-2xl text-glitch-cyan">#{s.rank}</span>
                    <span className="font-display text-xl text-paper-white uppercase">{s.teamName}</span>
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
