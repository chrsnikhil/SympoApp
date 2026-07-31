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
  isFirstBlood: boolean;
  attachments: string[];
  status: string;
}

interface LeaderboardRow {
  teamId: string;
  teamName: string;
  points: number;
  solvedCount?: number;
  firstBloodCount?: number;
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
      }
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

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
        const bonusMsg = result.meta?.firstBlood ? " 🩸 FIRST BLOOD BONUS AWARDED!" : "";
        setFeedback((prev) => ({
          ...prev,
          [slug]: { ok: true, msg: `🎉 CORRECT! +${result.points} pts.${bonusMsg}` },
        }));
        setFlagInputs((prev) => ({ ...prev, [slug]: "" }));
        setActiveSubmit(null);
        fetchDashboard();
      } else {
        const reason = result.meta?.reason === "already-solved" ? "Already Solved!" : "Incorrect flag!";
        setFeedback((prev) => ({ ...prev, [slug]: { ok: false, msg: `❌ ${reason}` } }));
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

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#070308] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
          <p className="text-red-400 text-sm font-bold tracking-widest uppercase">Connecting to Spider-Verse...</p>
        </div>
      </main>
    );
  }

  // Categorize challenges strictly by difficulty, fallback to points if difficulty is unspecified
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
    } else if (diff === "easy") {
      easyChallenges.push(ch);
    } else {
      // Fallback by points if difficulty string is missing or custom
      const pts = ch.points || ch.initialPoints || 100;
      if (pts >= 225) {
        hardChallenges.push(ch);
      } else if (pts >= 150) {
        mediumChallenges.push(ch);
      } else {
        easyChallenges.push(ch);
      }
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
          background: rgba(220, 38, 38, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(220, 38, 38, 0.5);
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Background aesthetics */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#1a0610_0%,_#0a0510_80%)]" />
        <div className="absolute bottom-0 w-full h-[50vh] bg-gradient-to-t from-red-950/40 to-transparent" />
        <div className="absolute left-0 top-1/4 w-[600px] h-[600px] bg-red-600/5 rounded-full blur-[150px]" />
        <div className="absolute right-0 bottom-1/4 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-0 w-full h-32 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwYTA1MTAiLz48cGF0aCBkPSJNMCAxMDBWMzBoMjB2MTBoMTVWMjBoMTB2MTBoMThWNTBoMTB2MTBoMTVWNDBoMjB2MjBoMTBWMTBoMTV2MTBoMjBWNTBIMTAwVjEwMGgtMTAwWiIgZmlsbD0iI2RjMjYyNiIgb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] bg-repeat-x bg-bottom" style={{ backgroundSize: '150px 100%' }}></div>
      </div>

      {/* Header */}
      <header className="flex-none flex items-center justify-between px-6 md:px-10 py-5 border-b border-red-500/20 bg-[#0a0510]/80 backdrop-blur-md z-10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-12">
          <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter flex items-center gap-2">
            <span className="text-gray-200 drop-shadow-md">X-PLORE 26</span>
            <span className="text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]">MULTIVERSE BREACH</span>
          </h1>
        </div>
        <div className="flex items-center gap-5">
          <button
            onClick={() => {
              document.cookie = "session=; path=/; max-age=0;";
              window.location.href = "/enter";
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-red-500/30 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(220,38,38,0.2)]"
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
        
        {/* Left Side - llenges Grid (Scrollable) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 pb-10 custom-scrollbar h-full">
          
          {/* EASY COLUMN */}
          <div className="flex flex-col gap-4 border border-cyan-500/30 bg-[#0f111a]/80 rounded-2xl p-4 shadow-[0_0_20px_rgba(6,182,212,0.1)] backdrop-blur-sm h-max">
            <div className="text-center pb-3 pt-1 border-b border-cyan-500/20 mb-2">
              <h2 className="text-cyan-400 font-black uppercase tracking-widest text-lg drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
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
          <div className="flex flex-col gap-4 border border-amber-500/40 bg-[#161010]/80 rounded-2xl p-4 shadow-[0_0_20px_rgba(245,158,11,0.1)] backdrop-blur-sm h-max">
            <div className="text-center pb-3 pt-1 border-b border-amber-500/20 mb-2">
              <h2 className="text-amber-400 font-black uppercase tracking-widest text-lg drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
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
          <div className="flex flex-col gap-4 border border-red-500/40 bg-[#160a0f]/80 rounded-2xl p-4 shadow-[0_0_20px_rgba(220,38,38,0.15)] backdrop-blur-sm h-max">
            <div className="text-center pb-3 pt-1 border-b border-red-500/20 mb-2">
              <h2 className="text-pink-500 font-black uppercase tracking-widest text-lg drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]">
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
          <div className="border border-red-500/30 bg-[#12050a]/90 backdrop-blur-md rounded-2xl p-5 shadow-[0_0_25px_rgba(220,38,38,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,_rgba(220,38,38,0.15),_transparent_70%)] pointer-events-none" />
            <div className="flex items-center gap-5 relative z-10">
              <div className="w-14 h-14 rounded-full border border-red-500/50 bg-red-950 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                🕷️
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Active Team</div>
                <div className="text-white font-bold text-lg tracking-tight mb-1">{data?.team.name ?? "Web-Slingers"}</div>
                <div className="text-[11px] text-gray-400 uppercase tracking-widest">
                  Total Secured Points: <span className="text-red-500 font-black text-sm ml-1">{data?.score ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Leaderboard Card */}
          <div className="border border-red-500/20 bg-[#12050a]/90 backdrop-blur-md rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[400px] shadow-[0_0_25px_rgba(220,38,38,0.1)]">
            <div className="p-5 pb-3 border-b border-red-900/30">
              <h2 className="text-red-500 font-black uppercase tracking-widest text-lg drop-shadow-[0_0_8px_rgba(220,38,38,0.5)]">
                LEADERBOARD
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
              {data?.leaderboard.map((row, idx) => (
                <div key={row.teamId} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${idx === 0 ? 'bg-amber-500/10 border border-amber-500/20' : idx < 3 ? 'bg-white/5 border border-white/10' : 'hover:bg-white/5 border border-transparent'}`}>
                  <div className="w-8 flex justify-center font-black">
                    {idx === 0 ? <span className="text-2xl drop-shadow-[0_0_10px_rgba(250,204,21,0.6)]">🥇</span> : 
                     idx === 1 ? <span className="text-2xl drop-shadow-[0_0_10px_rgba(203,213,225,0.6)]">🥈</span> :
                     idx === 2 ? <span className="text-2xl drop-shadow-[0_0_10px_rgba(217,119,6,0.6)]">🥉</span> :
                     <span className="text-gray-500 text-sm">{idx + 1}</span>}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-bold text-sm tracking-wide">{row.teamName}</div>
                    <div className="text-gray-400 text-[11px] uppercase tracking-wider mt-0.5">{row.points} Points</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#1a0a14] border border-red-500/30 flex items-center justify-center text-sm shadow-[0_0_10px_rgba(220,38,38,0.2)]">
                    {['🕷️', '🕸️', '🦸‍♂️', '🦹'][idx % 4]}
                  </div>
                </div>
              ))}
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
  activeSubmit,
  setActiveSubmit,
  flagInput,
  setFlagInput,
  onSubmit,
  submitting,
  feedback,
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
  const isExpanded = activeSubmit === ch.slug;
  const isSolved = ch.isSolved;

  return (
    <div
      className={`relative bg-[#160d1a]/80 backdrop-blur-md rounded-xl p-5 flex flex-col gap-4 border overflow-hidden transition-all duration-300 ${
        isSolved
          ? "border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          : "border-white/10 hover:border-white/20 hover:bg-[#1a0f1f]/90"
      }`}
    >
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,_rgba(220,38,38,0.08),_transparent_70%)] pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-start z-10">
        <h3 className="text-white font-bold text-base leading-snug w-[85%]">{ch.title}</h3>
        {isSolved && (
          <span className="text-[9px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold rounded border border-emerald-500/30">
            SOLVED
          </span>
        )}
      </div>

      {/* Meta info & Icon */}
      <div className="flex justify-between items-center z-10">
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Category</div>
            <div className="text-gray-300 text-xs font-medium">{ch.category || "General"}</div>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Points</div>
              <div className="flex items-center gap-1.5 text-pink-500 text-sm font-black">
                <svg className="w-3.5 h-3.5 text-pink-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {ch.points}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Difficulty</div>
              <div
                className={`flex items-center gap-1.5 text-sm font-black ${
                  ch.difficulty.toLowerCase() === "easy"
                    ? "text-emerald-500"
                    : ch.difficulty.toLowerCase() === "medium"
                    ? "text-amber-500"
                    : "text-red-500"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                {ch.difficulty}
              </div>
            </div>
          </div>
        </div>

        {/* Avatar/Character Placeholder */}
        <div className="w-16 h-16 rounded-full border border-red-500/20 bg-[#1a0a14] flex items-center justify-center text-3xl shadow-[0_0_15px_rgba(220,38,38,0.15)] overflow-hidden">
           {ch.difficulty.toLowerCase() === 'easy' ? '🕷️' : ch.difficulty.toLowerCase() === 'medium' ? '🕸️' : '🦹'}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-end items-end mt-1 z-10">

        <a
          href={`/ctf/${ch.slug}`}
          className="flex items-center gap-1.5 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-[0_0_10px_rgba(220,38,38,0.2)]"
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
