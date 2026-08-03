"use client";

import { useEffect, useState, useCallback } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

interface ChallengeItem {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  category: string;
  description: string;
  initialPoints: number;
  points: number;
  solveCount: number;
  isSolved: boolean;
  attachments: string[];
  status: string;
}

interface LeaderboardRow {
  teamId: string;
  teamName: string;
  points: number;
  solvedCount?: number;
  lastScoreAt: string | null;
}

interface SubmissionItem {
  id: string;
  challengeSlug: string;
  challengeTitle: string;
  receivedAt: string;
  correct: boolean;
  points: number;
  meta?: Record<string, unknown>;
}

interface DashboardData {
  eventState?: "waiting" | "started" | "ended";
  startedAt?: string | null;
  durationMinutes?: number;
  remainingSeconds?: number;
  team: {
    id: string;
    name: string;
    role: string;
  };
  score: number;
  rank: number;
  leaderboard: LeaderboardRow[];
  challenges: ChallengeItem[];
  submissions: SubmissionItem[];
}

export default function CtfDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [flagInputs, setFlagInputs] = useState<Record<string, string>>({});
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [activeSubmit, setActiveSubmit] = useState<string | null>(null);
  const [remainingSecs, setRemainingSecs] = useState<number | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/ctf/dashboard");
      if (res.status === 401) {
        window.location.href = "/enter?rt=/ctf";
        return;
      }
      const json = await res.json();
      if (res.ok) {
        setData(json);
        if (json.remainingSeconds !== undefined) {
          setRemainingSecs(json.remainingSeconds);
        }
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 3000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Tick remaining event time every second
  useEffect(() => {
    if (remainingSecs === null || remainingSecs <= 0) return;
    const timer = setInterval(() => {
      setRemainingSecs((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSecs]);

  async function handleFlagSubmit(slug: string) {
    const flag = flagInputs[slug]?.trim();
    if (!flag) {
      setFeedback((prev) => ({ ...prev, [slug]: { ok: false, msg: "Enter a flag first!" } }));
      return;
    }

    setSubmittingSlug(slug);
    setFeedback((prev) => ({ ...prev, [slug]: { ok: true, msg: "Evaluating flag..." } }));

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "ctf", challengeSlug: slug, payload: flag }),
      });
      const result = await res.json();

      if (!res.ok || !result.ok) {
        setFeedback((prev) => ({
          ...prev,
          [slug]: { ok: false, msg: result.error ?? "Flag submission failed" },
        }));
      } else if (result.correct) {
        setFeedback((prev) => ({
          ...prev,
          [slug]: { ok: true, msg: `CORRECT! +${result.points} pts.` },
        }));
        setFlagInputs((prev) => ({ ...prev, [slug]: "" }));
        setActiveSubmit(null);
        fetchDashboard();
      } else {
        const reason = result.meta?.reason === "already-solved" ? "Already Solved!" : "Incorrect flag!";
        setFeedback((prev) => ({ ...prev, [slug]: { ok: false, msg: reason } }));
      }
    } catch {
      setFeedback((prev) => ({ ...prev, [slug]: { ok: false, msg: "Network error submitting flag" } }));
    } finally {
      setSubmittingSlug(null);
    }
  }

  function handleDownloadAttachment(slug: string, fileName?: string) {
    const name = fileName || `${slug}.zip`;
    window.open(`/api/ctf/attachments?slug=${encodeURIComponent(slug)}&file=${encodeURIComponent(name)}`, "_blank");
  }

  const setFlagInput = (slug: string, val: string) => {
    setFlagInputs((prev) => ({ ...prev, [slug]: val }));
  };

  function formatTimer(secs: number | null) {
    if (secs === null) return "105 mins";
    if (secs <= 0) return "0 mins (EVENT ENDED)";
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (remainingSecs === 0) return `${mins} mins`;
    return `${mins}m ${remainingSecs}s`;
  }

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#070308] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto shadow-md" />
          <p className="text-red-400 text-sm font-bold tracking-widest uppercase">Connecting to XPLORE Network...</p>
        </div>
      </main>
    );
  }

  // WAITING ROOM SCREEN
  if (data?.eventState && data.eventState !== "started") {
    return (
      <main className="min-h-screen bg-[#0a0510] text-gray-100 font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <SpiderBackgroundFX />
        <div className="fixed inset-0 pointer-events-none -z-10 bg-[#0a0510]" />
        
        <div className="max-w-md w-full bg-[#0d0716] border border-red-500/40 rounded-3xl p-8 text-center space-y-6 shadow-2xl z-10">
          <h1 className="text-3xl font-black italic tracking-tighter text-white">
            XPLORE 26 <span className="text-red-600 block text-2xl font-black not-italic mt-1">MULTIVERSE BREACH</span>
          </h1>
          
          <div className="py-6 px-4 bg-red-950 border border-red-500/30 rounded-2xl space-y-3">
            <div className="text-amber-400 font-black uppercase text-xs tracking-widest">STATUS: WAITING ROOM</div>
            <p className="text-base text-white font-bold">The CTF event has not started yet.</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              Please wait in this room while the event administrator starts the event.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 animate-pulse font-mono">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            Waiting for admin start signal...
          </div>

          <button
            onClick={async () => {
              try { await fetch("/api/logout", { method: "POST" }); } catch {}
              window.location.href = "/enter";
            }}
            className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white uppercase tracking-wider underline"
          >
            Logout
          </button>
        </div>
      </main>
    );
  }

  // Categorize challenges strictly by difficulty
  const allChs = data?.challenges ?? [];
  const easyChallenges: ChallengeItem[] = [];
  const mediumChallenges: ChallengeItem[] = [];
  const hardChallenges: ChallengeItem[] = [];

  allChs.forEach((ch) => {
    const diff = (ch.difficulty || "").toLowerCase().trim();
    if (diff === "hard") {
      hardChallenges.push(ch);
    } else if (diff === "medium") {
      mediumChallenges.push(ch);
    } else {
      easyChallenges.push(ch);
    }
  });

  return (
    <main className="min-h-screen bg-[#0a0510] text-gray-100 font-sans relative overflow-hidden flex flex-col selection:bg-red-500 selection:text-white z-0">
      <SpiderBackgroundFX />
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(220, 38, 38, 0.4);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(220, 38, 38, 0.6);
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Solid Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[#0a0510]" />

      {/* Header */}
      <header className="flex-none flex flex-col md:flex-row items-center justify-between px-6 md:px-10 py-5 border-b border-red-500/20 bg-[#0a0510] z-10 shadow-md gap-4">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter flex items-center gap-2">
            <span className="text-gray-200">XPLORE 26</span>
            <span className="text-red-600">MULTIVERSE BREACH</span>
          </h1>
        </div>

        {/* 105 Mins Countdown Timer Banner */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950 border border-red-500/50 text-red-300 font-mono text-xs font-bold shadow-md">
            <span className="uppercase tracking-wider text-gray-400">Time Left:</span>
            <span className="text-white text-sm font-black">{formatTimer(remainingSecs)}</span>
          </div>

          <button
            onClick={async () => {
              try {
                await fetch("/api/logout", { method: "POST" });
              } catch (e) {
                console.error("Logout error", e);
              }
              window.location.href = "/enter";
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-950 text-red-400 hover:text-red-300 text-xs font-bold uppercase tracking-wider transition-all"
          >
            Logout
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-hidden p-6 md:p-8 flex flex-col xl:flex-row gap-6 max-w-[1800px] mx-auto w-full z-10 h-full">
        
        {/* Left Side - Challenges Grid (Scrollable) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 pb-10 custom-scrollbar h-full">
          
          {/* EASY COLUMN */}
          <div className="flex flex-col gap-4 border border-cyan-500/30 bg-[#0f111a] rounded-2xl p-4 h-max">
            <div className="text-center pb-3 pt-1 border-b border-cyan-500/20 mb-2">
              <h2 className="text-cyan-400 font-black uppercase tracking-widest text-lg">
                EASY ({easyChallenges.length})
              </h2>
            </div>
            {easyChallenges.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs italic font-medium">No easy challenges available</div>
            ) : (
              easyChallenges.map((ch) => (
                <ChallengeCard
                  key={ch.id}
                  ch={ch}
                  activeSubmit={activeSubmit}
                  setActiveSubmit={setActiveSubmit}
                  flagInput={flagInputs[ch.slug] || ""}
                  setFlagInput={setFlagInput}
                  onSubmit={handleFlagSubmit}
                  submitting={submittingSlug === ch.slug}
                  feedback={feedback[ch.slug]}
                  onDownload={handleDownloadAttachment}
                />
              ))
            )}
          </div>

          {/* MEDIUM COLUMN */}
          <div className="flex flex-col gap-4 border border-amber-500/40 bg-[#161010] rounded-2xl p-4 h-max">
            <div className="text-center pb-3 pt-1 border-b border-amber-500/20 mb-2">
              <h2 className="text-amber-400 font-black uppercase tracking-widest text-lg">
                MEDIUM ({mediumChallenges.length})
              </h2>
            </div>
            {mediumChallenges.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs italic font-medium">No medium challenges available</div>
            ) : (
              mediumChallenges.map((ch) => (
                <ChallengeCard
                  key={ch.id}
                  ch={ch}
                  activeSubmit={activeSubmit}
                  setActiveSubmit={setActiveSubmit}
                  flagInput={flagInputs[ch.slug] || ""}
                  setFlagInput={setFlagInput}
                  onSubmit={handleFlagSubmit}
                  submitting={submittingSlug === ch.slug}
                  feedback={feedback[ch.slug]}
                  onDownload={handleDownloadAttachment}
                />
              ))
            )}
          </div>

          {/* HARD COLUMN */}
          <div className="flex flex-col gap-4 border border-red-500/40 bg-[#160a0f] rounded-2xl p-4 h-max">
            <div className="text-center pb-3 pt-1 border-b border-red-500/20 mb-2">
              <h2 className="text-pink-500 font-black uppercase tracking-widest text-lg">
                HARD ({hardChallenges.length})
              </h2>
            </div>
            {hardChallenges.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs italic font-medium">No hard challenges available</div>
            ) : (
              hardChallenges.map((ch) => (
                <ChallengeCard
                  key={ch.id}
                  ch={ch}
                  activeSubmit={activeSubmit}
                  setActiveSubmit={setActiveSubmit}
                  flagInput={flagInputs[ch.slug] || ""}
                  setFlagInput={setFlagInput}
                  onSubmit={handleFlagSubmit}
                  submitting={submittingSlug === ch.slug}
                  feedback={feedback[ch.slug]}
                  onDownload={handleDownloadAttachment}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Side - Sidebar */}
        <div className="w-full xl:w-[380px] flex-none flex flex-col gap-6 overflow-y-auto pb-10 custom-scrollbar h-full">
          
          {/* Active Team Card */}
          <div className="border border-red-500/30 bg-[#12050a] rounded-2xl p-5 relative overflow-hidden shadow-md">
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-12 h-12 rounded-full border border-red-500/50 bg-red-950 flex items-center justify-center font-black text-white text-lg">
                #
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Active Team</div>
                <div className="text-white font-bold text-lg tracking-tight mb-1">{data?.team?.name ?? "Team"}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-widest">
                  Total Points: <span className="text-red-500 font-black text-sm ml-1">{data?.score ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Leaderboard Card */}
          <div className="border border-red-500/20 bg-[#12050a] rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[400px] shadow-md">
            <div className="p-5 pb-3 border-b border-red-900/30">
              <h2 className="text-red-500 font-black uppercase tracking-widest text-lg">
                LEADERBOARD
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
              {(data?.leaderboard ?? []).filter((row) => row.teamName.toLowerCase() !== "admin team").map((row, idx) => {
                const isMyTeam = data?.team?.id === row.teamId;
                return (
                  <div
                    key={row.teamId}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                      isMyTeam
                        ? "bg-red-950 border-2 border-red-500"
                        : idx === 0
                        ? "bg-amber-950/40 border border-amber-500/30"
                        : "hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="w-8 flex justify-center font-black">
                      <span className="text-gray-400 text-sm">#{idx + 1}</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-bold text-sm tracking-wide flex items-center gap-2">
                        <span>{row.teamName}</span>
                        {isMyTeam && (
                          <span className="px-1.5 py-0.5 bg-red-600 text-[9px] font-black uppercase text-white rounded tracking-wider">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-[11px] uppercase tracking-wider mt-0.5">{row.points} Points</div>
                    </div>
                  </div>
                );
              })}
              {(!data?.leaderboard || data.leaderboard.length === 0) && (
                 <div className="text-center text-gray-500 text-sm py-10">No scores yet.</div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </main>
  );
}

// Subcomponent for Challenge Cards
function ChallengeCard({
  ch,
  onDownload,
}: {
  ch: ChallengeItem;
  activeSubmit: string | null;
  setActiveSubmit: (val: string | null) => void;
  flagInput: string;
  setFlagInput: (slug: string, val: string) => void;
  onSubmit: (slug: string) => void;
  submitting: boolean;
  feedback?: { ok: boolean; msg: string };
  onDownload: (slug: string, name?: string) => void;
}) {
  const isSolved = ch.isSolved;

  return (
    <div
      className={`relative bg-[#160d1a] rounded-xl p-5 flex flex-col gap-4 border overflow-hidden transition-all duration-300 ${
        isSolved
          ? "border-emerald-500/40"
          : "border-white/10 hover:border-white/20 hover:bg-[#1a0f1f]"
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-start z-10">
        <h3 className="text-white font-bold text-base leading-snug w-[85%]">{ch.title}</h3>
        {isSolved && (
          <span className="text-[9px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold rounded border border-emerald-500/30">
            SOLVED
          </span>
        )}
      </div>

      {/* Meta info */}
      <div className="flex justify-between items-center z-10">
        <div className="flex flex-col gap-3">
          <div className="flex gap-6">
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Points</div>
              <div className="text-pink-500 text-sm font-black">
                {ch.points} pts
              </div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Difficulty</div>
              <div
                className={`text-sm font-black ${
                  ch.difficulty.toLowerCase() === "easy"
                    ? "text-emerald-500"
                    : ch.difficulty.toLowerCase() === "medium"
                    ? "text-amber-500"
                    : "text-red-500"
                }`}
              >
                {ch.difficulty}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-end items-end mt-1 z-10">
        <a
          href={`/ctf/${ch.slug}`}
          className="flex items-center gap-1.5 border border-red-500/40 bg-red-950 hover:bg-red-900 text-red-400 px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open
        </a>
      </div>
    </div>
  );
}
