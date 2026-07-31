"use client";

import { useEffect, useState, useCallback } from "react";

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
  const [activeTab, setActiveTab] = useState<"challenges" | "leaderboard" | "history">("challenges");
  const [flagInputs, setFlagInputs] = useState<Record<string, string>>({});
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [timerSeconds, setTimerSeconds] = useState(7200); // 2-hour event timer

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
    // Poll every 5s for live leaderboard and scores
    const interval = setInterval(fetchDashboard, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Countdown timer effect
  useEffect(() => {
    const t = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  function formatTime(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

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
          [slug]: { ok: true, msg: `🎉 CORRECT FLAG! +${result.points} points.${bonusMsg}` },
        }));
        setFlagInputs((prev) => ({ ...prev, [slug]: "" }));
        fetchDashboard();
      } else {
        const reason = result.meta?.reason === "already-solved" ? "Already Solved!" : "Incorrect flag format or answer!";
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

  if (loading && !data) {
    return (
      <main className="min-h-screen bg-[#070510] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm font-semibold tracking-widest uppercase">Connecting to Spider-Verse Arena...</p>
        </div>
      </main>
    );
  }

  const easyChallenges = data?.challenges.filter((c) => c.difficulty.toLowerCase() === "easy") ?? [];
  const mediumChallenges = data?.challenges.filter((c) => c.difficulty.toLowerCase() === "medium") ?? [];
  const hardChallenges = data?.challenges.filter((c) => c.difficulty.toLowerCase() === "hard") ?? [];

  return (
    <main className="min-h-screen bg-[#070510] text-gray-100 font-sans pb-16 relative overflow-x-hidden selection:bg-pink-500 selection:text-white">
      {/* Background Spider-Verse Glow Orbs */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Navbar Header */}
      <header className="sticky top-0 z-50 bg-[#0c081d]/90 backdrop-blur-md border-b border-purple-500/20 px-4 md:px-8 py-4 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-purple-600 to-pink-500 p-0.5 shadow-[0_0_15px_rgba(0,229,255,0.4)]">
              <div className="w-full h-full bg-[#0d0920] rounded-[10px] flex items-center justify-center font-black text-cyan-400 text-lg">
                🕷️
              </div>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-purple-300 to-pink-500 bg-clip-text text-transparent">
                MULTIVERSE BREACH
              </h1>
              <p className="text-xs text-gray-400 font-medium">Spider-Verse CTF Management Platform</p>
            </div>
          </div>

          {/* Header Stats */}
          <div className="flex items-center gap-4 md:gap-6 bg-[#150f2e] border border-white/10 rounded-2xl px-5 py-2.5">
            <div className="text-center">
              <span className="block text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Team</span>
              <span className="text-sm font-bold text-cyan-300">{data?.team.name ?? "Arachnid"}</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <span className="block text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Score</span>
              <span className="text-base font-black text-purple-300">{data?.score ?? 0} <span className="text-xs font-normal text-purple-400">pts</span></span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <span className="block text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Rank</span>
              <span className="text-base font-black text-pink-400">#{data?.rank ?? "—"}</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <span className="block text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Time Remaining</span>
              <span className="text-sm font-mono font-bold text-amber-400">{formatTime(timerSeconds)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {data?.team.role === "admin" && (
              <a
                href="/admin/ctf"
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-purple-600/30 border border-purple-500/50 hover:bg-purple-600/50 text-purple-200 rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)]"
              >
                Admin Panel ⚙️
              </a>
            )}
            <button
              onClick={() => {
                document.cookie = "session=; path=/; max-age=0;";
                window.location.href = "/enter";
              }}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 text-red-300 rounded-xl transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-8">
          <div className="flex bg-[#140e2b] p-1.5 rounded-2xl border border-white/5 space-x-2">
            <button
              onClick={() => setActiveTab("challenges")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all uppercase tracking-wider ${
                activeTab === "challenges"
                  ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Challenges 🎯
            </button>
            <button
              onClick={() => setActiveTab("leaderboard")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all uppercase tracking-wider ${
                activeTab === "leaderboard"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_20px_rgba(236,72,153,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Leaderboard 🏆
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all uppercase tracking-wider ${
                activeTab === "history"
                  ? "bg-gradient-to-r from-pink-500 to-cyan-500 text-white shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Submissions 📜
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> Live Telemetry Connected
          </div>
        </div>

        {/* TAB 1: CHALLENGES */}
        {activeTab === "challenges" && (
          <div className="space-y-12">
            {/* EASY CATEGORY */}
            <ChallengeSection
              title="Easy Category"
              subtitle="Initialize your spider-sense. 100 base points each."
              badgeColor="from-emerald-500 to-cyan-500"
              challenges={easyChallenges}
              flagInputs={flagInputs}
              setFlagInputs={setFlagInputs}
              submittingSlug={submittingSlug}
              feedback={feedback}
              onSubmit={handleFlagSubmit}
              onDownload={handleDownloadAttachment}
            />

            {/* MEDIUM CATEGORY */}
            <ChallengeSection
              title="Medium Category"
              subtitle="Alchemax dimension breaches. 150 base points each."
              badgeColor="from-amber-500 to-purple-600"
              challenges={mediumChallenges}
              flagInputs={flagInputs}
              setFlagInputs={setFlagInputs}
              submittingSlug={submittingSlug}
              feedback={feedback}
              onSubmit={handleFlagSubmit}
              onDownload={handleDownloadAttachment}
            />

            {/* HARD CATEGORY */}
            <ChallengeSection
              title="Hard Category"
              subtitle="Anomaly Containment Protocol. 225 base points each."
              badgeColor="from-purple-600 to-pink-600"
              challenges={hardChallenges}
              flagInputs={flagInputs}
              setFlagInputs={setFlagInputs}
              submittingSlug={submittingSlug}
              feedback={feedback}
              onSubmit={handleFlagSubmit}
              onDownload={handleDownloadAttachment}
            />
          </div>
        )}

        {/* TAB 2: LIVE LEADERBOARD */}
        {activeTab === "leaderboard" && (
          <div className="bg-[#110b27]/80 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-extrabold text-white">Live Leaderboard</h2>
                <p className="text-xs text-gray-400">Real-time materialized scoring snapshot</p>
              </div>
              <button
                onClick={fetchDashboard}
                className="px-4 py-2 bg-purple-600/20 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-xl hover:bg-purple-600/40 transition-all"
              >
                Refresh Board 🔄
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Rank</th>
                    <th className="py-3.5 px-4 font-semibold">Team Name</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Solved</th>
                    <th className="py-3.5 px-4 font-semibold text-center">First Bloods 🩸</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {data?.leaderboard.map((row, idx) => {
                    const isMyTeam = row.teamId === data.team.id;
                    return (
                      <tr
                        key={row.teamId}
                        className={`transition-all ${
                          isMyTeam
                            ? "bg-purple-900/30 border-l-4 border-l-cyan-400 text-white font-bold"
                            : "hover:bg-white/5 text-gray-300"
                        }`}
                      >
                        <td className="py-4 px-4 font-mono font-bold">
                          {idx === 0 ? "🥇 #1" : idx === 1 ? "🥈 #2" : idx === 2 ? "🥉 #3" : `#${idx + 1}`}
                        </td>
                        <td className="py-4 px-4 flex items-center gap-2">
                          <span>{row.teamName}</span>
                          {isMyTeam && (
                            <span className="px-2 py-0.5 text-[10px] uppercase font-extrabold bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 rounded-md">
                              YOU
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center font-mono">{row.solvedCount ?? 0}</td>
                        <td className="py-4 px-4 text-center font-mono font-bold text-red-400">
                          {row.firstBloodCount ?? 0}
                        </td>
                        <td className="py-4 px-4 text-right font-mono font-black text-cyan-300 text-base">
                          {row.points} pts
                        </td>
                      </tr>
                    );
                  })}
                  {(!data?.leaderboard || data.leaderboard.length === 0) && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 text-sm">
                        No team submissions logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SUBMISSION HISTORY */}
        {activeTab === "history" && (
          <div className="bg-[#110b27]/80 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-6 md:p-8 shadow-2xl">
            <h2 className="text-2xl font-extrabold text-white mb-2">Submission Audit Trail</h2>
            <p className="text-xs text-gray-400 mb-6">Complete log of all flag attempts by your team</p>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                    <th className="py-3.5 px-4 font-semibold">Challenge</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Points Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {data?.submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-white/5">
                      <td className="py-3.5 px-4 font-mono text-xs text-gray-400">
                        {new Date(sub.receivedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white">{sub.challengeTitle}</td>
                      <td className="py-3.5 px-4">
                        {sub.correct ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✓ Correct Flag {sub.meta?.firstBlood ? "🩸 First Blood" : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                            ✕ Incorrect
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-purple-300">
                        +{sub.points} pts
                      </td>
                    </tr>
                  ))}
                  {(!data?.submissions || data.submissions.length === 0) && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">
                        No submissions recorded for your team.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── SUBCOMPONENT: CHALLENGE SECTION ─────────────────────────────────────

interface SectionProps {
  title: string;
  subtitle: string;
  badgeColor: string;
  challenges: ChallengeItem[];
  flagInputs: Record<string, string>;
  setFlagInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  submittingSlug: string | null;
  feedback: Record<string, { ok: boolean; msg: string }>;
  onSubmit: (slug: string) => void;
  onDownload: (slug: string, name?: string) => void;
}

function ChallengeSection({
  title,
  subtitle,
  badgeColor,
  challenges,
  flagInputs,
  setFlagInputs,
  submittingSlug,
  feedback,
  onSubmit,
  onDownload,
}: SectionProps) {
  if (challenges.length === 0) return null;

  return (
    <section>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-8 rounded-full bg-gradient-to-b ${badgeColor}`} />
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">{title}</h2>
            <p className="text-xs text-gray-400 font-medium">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {challenges.map((ch) => {
          const isBusy = submittingSlug === ch.slug;
          const fb = feedback[ch.slug];

          return (
            <div
              key={ch.id}
              className={`bg-[#0f0a24]/90 backdrop-blur-xl border rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 hover:translate-y-[-2px] relative overflow-hidden ${
                ch.isSolved
                  ? "border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                  : "border-purple-500/20 hover:border-cyan-400/40 shadow-xl"
              }`}
            >
              {/* Solved Overlay Ribbon */}
              {ch.isSolved && (
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-bold rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  ✓ SOLVED
                </div>
              )}

              {/* First Blood Badge */}
              {ch.isFirstBlood && (
                <div className="absolute top-4 right-28 flex items-center gap-1.5 px-3 py-1 bg-red-600/30 border border-red-500/60 text-red-300 text-xs font-extrabold rounded-full animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                  🩸 FIRST BLOOD
                </div>
              )}

              <div>
                {/* Header Pills */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-purple-500/20 border border-purple-400/30 text-purple-300">
                    {ch.category}
                  </span>
                  <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-cyan-500/20 border border-cyan-400/30 text-cyan-300">
                    {ch.difficulty}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">{ch.title}</h3>
                <p className="text-xs text-gray-300 leading-relaxed mb-4">{ch.description}</p>
              </div>

              <div>
                {/* Score & Solves count */}
                <div className="flex items-center justify-between bg-[#160f38] px-4 py-3 rounded-2xl border border-white/5 mb-4">
                  <div>
                    <span className="block text-[10px] text-gray-400 uppercase font-semibold">Value</span>
                    <span className="text-base font-black text-cyan-300">
                      {ch.points} <span className="text-xs text-gray-400 font-normal">/ {ch.initialPoints} pts</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-gray-400 uppercase font-semibold">Total Solves</span>
                    <span className="text-xs font-mono font-bold text-purple-300">{ch.solveCount} solves</span>
                  </div>
                </div>

                {/* Download Attachment Button */}
                {ch.attachments && ch.attachments.length > 0 ? (
                  <button
                    onClick={() => onDownload(ch.slug, ch.attachments[0])}
                    className="w-full mb-3 py-2 px-3 text-xs font-semibold bg-purple-600/20 border border-purple-500/40 text-purple-200 rounded-xl hover:bg-purple-600/40 transition-all flex items-center justify-center gap-2"
                  >
                    📁 Download Attachment ({ch.attachments[0]})
                  </button>
                ) : (
                  <button
                    onClick={() => onDownload(ch.slug, `${ch.slug}.zip`)}
                    className="w-full mb-3 py-2 px-3 text-xs font-semibold bg-white/5 border border-white/10 text-gray-400 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    📁 Download Attachment ({ch.slug}.zip)
                  </button>
                )}

                {/* Flag Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit(ch.slug);
                  }}
                  className="space-y-2"
                >
                  <div className="relative">
                    <input
                      type="text"
                      disabled={ch.isSolved || isBusy}
                      value={flagInputs[ch.slug] ?? ""}
                      onChange={(e) =>
                        setFlagInputs((prev) => ({ ...prev, [ch.slug]: e.target.value }))
                      }
                      placeholder={ch.isSolved ? "Already Solved!" : "SPIDER{flag_here}"}
                      className="w-full bg-[#18113b] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:opacity-50 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={ch.isSolved || isBusy}
                    className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 ${
                      ch.isSolved
                        ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-not-allowed"
                        : "bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white hover:opacity-95 shadow-[0_0_15px_rgba(0,229,255,0.25)]"
                    }`}
                  >
                    {ch.isSolved ? "Solved ✓" : isBusy ? "Submitting..." : "Submit Flag"}
                  </button>
                </form>

                {/* Feedback Toast */}
                {fb && (
                  <div
                    className={`mt-3 p-2.5 rounded-xl text-xs font-medium text-center animate-fadeIn ${
                      fb.ok
                        ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                        : "bg-red-950/60 border border-red-500/40 text-red-300"
                    }`}
                  >
                    {fb.msg}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
