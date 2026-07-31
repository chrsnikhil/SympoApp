"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

interface ChallengeDetail {
  id: string;
  slug: string;
  title: string;
  difficulty: string;
  category: string;
  description: string;
  details?: string;
  initialPoints: number;
  points: number;
  solveCount: number;
  isSolved: boolean;
  attachments: string[];
  hints: Array<{ id: number; text: string; unlockSeconds: number }>;
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamScore, setTeamScore] = useState<number>(0);
  const [teamName, setTeamName] = useState<string>("");
  const [prevSlug, setPrevSlug] = useState<string | null>(null);
  const [nextSlug, setNextSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flagInput, setFlagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [revealedHints, setRevealedHints] = useState<Record<number, boolean>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Load and tick question timer from team-scoped localStorage key
  useEffect(() => {
    if (!slug || !teamId) return;
    const storageKey = `ctf_timer_${teamId}_${slug}`;
    const saved = localStorage.getItem(storageKey);
    const initialElapsed = saved !== null ? parseInt(saved, 10) || 0 : 0;
    setElapsedSeconds(initialElapsed);

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        localStorage.setItem(storageKey, next.toString());
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [slug, teamId]);

  const fetchChallenge = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/ctf/challenge/${encodeURIComponent(slug)}`);
      if (res.status === 401) {
        router.push("/enter?rt=/ctf");
        return;
      }
      const data = await res.json();
      if (res.ok && data.challenge) {
        setChallenge(data.challenge);
        if (data.teamId) setTeamId(data.teamId);
        if (data.teamScore !== undefined) setTeamScore(data.teamScore);
        if (data.teamName) setTeamName(data.teamName);
        setPrevSlug(data.prevSlug ?? null);
        setNextSlug(data.nextSlug ?? null);

        // Check if admin reset board and reset local hint timer if resetAt has changed
        if (data.resetAt) {
          const lastReset = localStorage.getItem("ctf_last_reset");
          if (lastReset !== data.resetAt) {
            localStorage.setItem("ctf_last_reset", data.resetAt);
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith("ctf_timer_")) {
                localStorage.removeItem(key);
              }
            });
            setElapsedSeconds(0);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching challenge:", e);
    } finally {
      setLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  async function handleFlagSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flagInput.trim() || !slug) return;

    setSubmitting(true);
    setFeedback({ ok: true, msg: "Evaluating flag submission..." });

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "ctf", challengeSlug: slug, payload: flagInput.trim() }),
      });
      const result = await res.json();

      if (!res.ok || !result.ok) {
        setFeedback({ ok: false, msg: result.error ?? "Flag submission failed" });
      } else if (result.correct) {
        setFeedback({ ok: true, msg: `🎉 CORRECT FLAG! +${result.points} PTS AWARDED.` });
        setFlagInput("");
        fetchChallenge();
      } else {
        const reason = result.meta?.reason === "already-solved" ? "Already Solved!" : "Incorrect flag!";
        setFeedback({ ok: false, msg: `❌ ${reason}` });
      }
    } catch {
      setFeedback({ ok: false, msg: "Network error submitting flag" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownloadAttachment(fileName?: string) {
    if (!slug) return;
    const name = fileName || `${slug}.zip`;
    window.open(`/api/ctf/attachments?slug=${encodeURIComponent(slug)}&file=${encodeURIComponent(name)}`, "_blank");
  }

  function toggleHint(hintId: number) {
    setRevealedHints((prev) => ({ ...prev, [hintId]: !prev[hintId] }));
  }

  function getHintTimerStatus(unlockSeconds: number) {
    const remaining = Math.max(0, unlockSeconds - elapsedSeconds);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    return {
      isUnlocked: remaining === 0,
      formattedTime: formatted,
    };
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#070308] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_20px_rgba(220,38,38,0.5)]" />
          <p className="text-red-400 text-sm font-bold tracking-widest uppercase">Decrypting Multiverse Anomaly...</p>
        </div>
      </main>
    );
  }

  if (!challenge) {
    return (
      <main className="min-h-screen bg-[#070308] text-white flex flex-col items-center justify-center font-sans p-6">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Challenge Not Found</h1>
        <button
          onClick={() => router.push("/ctf")}
          className="px-6 py-2 bg-red-600/30 border border-red-500/50 text-white font-bold rounded-xl hover:bg-red-600/50 transition-all"
        >
          ← Back to Dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070308] text-gray-100 font-sans relative overflow-x-hidden pb-20 selection:bg-red-500 selection:text-white">
      <SpiderBackgroundFX />
      {/* Dynamic Background Glows */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#1f0612_0%,_#070308_80%)]" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[150px]" />
      </div>

      {/* Top Banner & Header with Prev / Next Question & Current Team Score */}
      <header className="relative max-w-6xl mx-auto pt-8 px-6 flex flex-col md:flex-row items-center justify-between gap-6 z-10">
        <button
          onClick={() => router.push("/ctf")}
          className="flex items-center gap-2 border border-pink-500/40 bg-pink-950/30 hover:bg-pink-950/60 text-pink-300 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(236,72,153,0.2)]"
        >
          ← Back to Dashboard
        </button>

        <div className="text-center">
          <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter drop-shadow-[0_0_20px_rgba(220,38,38,0.6)]">
            <span className="text-white">X-PLORE 26</span>
          </h1>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500 mt-1">MULTIVERSE BREACH</p>
        </div>

        {/* Question Navigation & Score Badge (Top Right) */}
        <div className="flex flex-wrap items-center gap-3">
          {prevSlug && (
            <button
              onClick={() => router.push(`/ctf/${prevSlug}`)}
              className="flex items-center gap-1.5 border border-red-500/40 bg-red-950/40 hover:bg-red-900/60 text-red-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"
            >
              ← Prev Question
            </button>
          )}
          {nextSlug && (
            <button
              onClick={() => router.push(`/ctf/${nextSlug}`)}
              className="flex items-center gap-1.5 border border-red-500/40 bg-red-950/40 hover:bg-red-900/60 text-red-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"
            >
              Next Question →
            </button>
          )}
          <div className="border border-red-500/50 bg-red-950/70 rounded-xl px-4 py-1.5 text-center shadow-[0_0_20px_rgba(220,38,38,0.4)]">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 block">{teamName || "TEAM"} SCORE</span>
            <span className="text-sm font-black text-red-400 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">{teamScore} PTS</span>
          </div>
        </div>
      </header>

      {/* Main Challenge Detail Card */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 mt-8 z-10">
        <div className="border border-red-500/30 bg-[#0d0716]/90 backdrop-blur-2xl rounded-3xl p-6 md:p-10 shadow-[0_0_50px_rgba(220,38,38,0.15)] relative overflow-hidden space-y-8">
          
          {/* Subtle Background Web */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[radial-gradient(circle_at_top_right,_rgba(220,38,38,0.12),_transparent_70%)] pointer-events-none" />

          {/* 1. Header: Title, Badges, Points */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-red-950/60">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl border border-red-500/50 bg-red-950/60 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(220,38,38,0.4)] flex-none">
                🕷️
              </div>
              <div>
                <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white drop-shadow-md">
                  {challenge.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-950/60 border border-purple-500/40 rounded-lg text-xs font-bold text-purple-300">
                    🔒 <span className="text-gray-400 font-normal">CATEGORY:</span> {challenge.category}
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/60 border border-amber-500/40 rounded-lg text-xs font-bold text-amber-400">
                    📊 <span className="text-gray-400 font-normal">DIFFICULTY:</span> {challenge.difficulty}
                  </div>
                  {challenge.isSolved && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs font-bold text-emerald-400">
                      ✓ SOLVED
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Points Badge (Top Right) */}
            <div className="flex-none self-start md:self-auto border-2 border-red-500/40 bg-red-950/40 rounded-2xl px-6 py-3 text-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
              <span className="block text-2xl md:text-3xl font-black text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]">
                {challenge.points}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-red-300">POINTS</span>
            </div>
          </div>

          {/* 2. Download Attachment Box (Only rendered if files exist) */}
          {challenge.attachments && challenge.attachments.length > 0 && (
            <div className="bg-[#150a1d]/80 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-xs shadow-inner">
                  ZIP
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{challenge.attachments[0]}</div>
                  <div className="text-xs text-gray-400 font-medium">ZIP Archive • 2.4 KB</div>
                </div>
              </div>
              <button
                onClick={() => handleDownloadAttachment(challenge.attachments[0])}
                className="flex items-center gap-2 border border-red-500/40 bg-red-950/50 hover:bg-red-900/60 text-red-300 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          )}

          {/* 3. PROBLEM STATEMENT */}
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
              PROBLEM STATEMENT <span className="text-base">🕸️</span>
            </h3>
            <div className="bg-[#120819]/80 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="text-xs md:text-sm text-gray-300 leading-relaxed space-y-2 max-w-2xl">
                <p>{challenge.description}</p>
                <p className="text-gray-400 font-medium italic">Can you break the code and reveal the hidden truth? The key to saving the Spider-Verse is inside.</p>
              </div>
              <div className="w-24 h-24 rounded-full border border-red-500/30 bg-red-950/30 flex items-center justify-center text-4xl shadow-[0_0_20px_rgba(220,38,38,0.2)] flex-none">
                🦸‍♀️
              </div>
            </div>
          </div>

          {/* 4. DETAILS */}
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
              DETAILS <span className="text-base">🕸️</span>
            </h3>
            <div className="bg-[#120819]/80 border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="text-xs md:text-sm text-gray-300 leading-relaxed space-y-2 max-w-2xl">
                <p>{challenge.details || "We found a suspicious encoded file in the server logs. It seems to be processed by a custom routine."}</p>
                <p className="text-gray-400 font-medium">Analyze the file, look closely at patterns, key usage, and encoding layers. Remember: with great power comes great debugging. Trust your spider-sense.</p>
              </div>
              <div className="w-24 h-24 rounded-full border border-red-500/30 bg-red-950/30 flex items-center justify-center text-4xl shadow-[0_0_20px_rgba(220,38,38,0.2)] flex-none">
                🕷️
              </div>
            </div>
          </div>

          {/* 5. HINTS */}
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
              HINTS <span className="text-base">🕸️</span>
            </h3>
            <div className="space-y-3">
              {challenge.hints.map((h) => {
                const { isUnlocked, formattedTime } = getHintTimerStatus(h.unlockSeconds);
                const isRevealed = revealedHints[h.id];

                return (
                  <div
                    key={h.id}
                    className="bg-[#120819]/80 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="w-8 h-8 rounded-lg border border-red-500/40 bg-red-950 flex items-center justify-center font-black text-red-400 text-xs flex-none">
                        {h.id}
                      </div>
                      <div className="text-xs md:text-sm text-gray-300 font-medium">
                        {isUnlocked && isRevealed ? (
                          <span className="text-emerald-400 font-bold">{h.text}</span>
                        ) : isUnlocked ? (
                          <span className="text-gray-300 font-medium">Hint Unlocked! Click to reveal.</span>
                        ) : (
                          <span className="text-gray-400 font-medium">Locked Hint</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                      {isUnlocked ? (
                        <button
                          onClick={() => toggleHint(h.id)}
                          className="flex items-center gap-2 border border-purple-500/40 bg-purple-950/50 hover:bg-purple-900/60 text-purple-300 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                        >
                          🔓 {isRevealed ? "Hide Hint" : "Reveal Hint"}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex items-center gap-2 border border-white/10 bg-white/5 text-gray-500 px-4 py-2 rounded-xl text-xs font-bold cursor-not-allowed"
                        >
                          🔒 Reveal Hint
                        </button>
                      )}
                      <span className={`text-xs font-mono font-bold ${isUnlocked ? 'text-emerald-400' : 'text-amber-400'}`}>
                        ⏱ {isUnlocked ? "Unlocked!" : `Unlocks in ${formattedTime}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 6. SUBMISSION FORM */}
          <div className="space-y-3 pt-4 border-t border-red-950/60">
            <h3 className="text-sm font-black uppercase tracking-widest text-red-400 flex items-center gap-2">
              SUBMISSION <span className="text-base">🕸️</span>
            </h3>
            <form onSubmit={handleFlagSubmit} className="flex flex-col md:flex-row items-center gap-4">
              <input
                type="text"
                disabled={challenge.isSolved || submitting}
                value={flagInput}
                onChange={(e) => setFlagInput(e.target.value)}
                placeholder={challenge.isSolved ? "Already Solved!" : "SPIDER{...}"}
                className="flex-1 w-full bg-[#07030a] border border-red-500/30 rounded-2xl px-5 py-4 text-xs md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:opacity-50 transition-all font-mono"
              />
              <button
                type="submit"
                disabled={challenge.isSolved || submitting}
                className="w-full md:w-auto px-10 py-4 bg-gradient-to-r from-red-600 via-pink-600 to-red-600 hover:from-red-500 hover:to-pink-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-[0_0_25px_rgba(220,38,38,0.5)] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                <span>🕷️</span> {challenge.isSolved ? "SOLVED ✓" : submitting ? "SUBMITTING..." : "SUBMIT"}
              </button>
            </form>

            {feedback && (
              <div
                className={`p-4 rounded-2xl text-xs font-bold text-center animate-fadeIn ${
                  feedback.ok
                    ? "bg-emerald-950/80 border border-emerald-500/50 text-emerald-300"
                    : "bg-red-950/80 border border-red-500/50 text-red-300"
                }`}
              >
                {feedback.msg}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Bottom Spider-Verse Skyline Graphic */}
      <div className="mt-12 text-center">
        <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter text-red-900/40 select-none">
          SPIDER-VERSE
        </h2>
      </div>
    </main>
  );
}
