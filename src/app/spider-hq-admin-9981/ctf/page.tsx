"use client";

import { useEffect, useState, useCallback } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

interface AdminChallenge {
  _id: string;
  slug: string;
  title: string;
  points: number;
  config: {
    difficulty?: string;
    category?: string;
    description?: string;
    answerHash?: string;
    initialPoints?: number;
    status?: "open" | "closed" | "released" | "hidden";
    disabled?: boolean;
    attachments?: string[];
  };
}

interface AdminSubmission {
  id: string;
  teamName: string;
  challengeTitle: string;
  receivedAt: string;
  correct: boolean;
  points: number;
  meta?: Record<string, unknown>;
}

interface LeaderboardRow {
  teamId: string;
  teamName: string;
  points: number;
  solvedCount?: number;
  lastScoreAt: string | null;
}

interface AdminTeam {
  id: string;
  name: string;
  createdAt: string;
  banned: boolean;
  bannedReason: string | null;
  bannedAt: string | null;
  penaltyPoints: number;
  score: number;
  solvedCount: number;
  members: string[];
}

export default function SecretAdminCtfPage() {
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"challenges" | "leaderboard" | "submissions" | "create" | "teams">("challenges");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Event State Controls
  const [eventState, setEventState] = useState<"waiting" | "started" | "ended">("waiting");
  const [remainingSecs, setRemainingSecs] = useState<number | null>(null);
  const [isTogglingEvent, setIsTogglingEvent] = useState(false);

  // Reset Modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Penalty Modal state
  const [penaltyModalTeam, setPenaltyModalTeam] = useState<AdminTeam | null>(null);
  const [penaltyPointsInput, setPenaltyPointsInput] = useState(50);
  const [penaltyReasonInput, setPenaltyReasonInput] = useState("");
  const [isSubmittingPenalty, setIsSubmittingPenalty] = useState(false);

  // Ban Modal state
  const [banModalTeam, setBanModalTeam] = useState<AdminTeam | null>(null);
  const [banConfirmInput, setBanConfirmInput] = useState("");
  const [banReasonInput, setBanReasonInput] = useState("");
  const [isSubmittingBan, setIsSubmittingBan] = useState(false);

  // New Challenge Form State
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("Easy");
  const [newCategory, setNewCategory] = useState("Web");
  const [newDescription, setNewDescription] = useState("");
  const [newFlag, setNewFlag] = useState("SPIDER{...}");

  // Attachment upload state
  const [uploadSlug, setUploadSlug] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [cRes, sRes, dashRes, tRes, evRes] = await Promise.all([
        fetch("/api/admin/ctf/challenges"),
        fetch("/api/admin/ctf/submissions"),
        fetch("/api/ctf/dashboard"),
        fetch("/api/admin/ctf/teams"),
        fetch("/api/admin/ctf/event-status"),
      ]);

      if (cRes.status === 401 || sRes.status === 401) {
        window.location.href = "/spider-hq-admin-9981";
        return;
      }

      const cData = await cRes.json();
      const sData = await sRes.json();
      const dashData = await dashRes.json();
      const tData = await tRes.json();
      const evData = await evRes.json();

      if (cRes.ok) setChallenges(cData.challenges ?? []);
      if (sRes.ok) setSubmissions(sData.submissions ?? []);
      if (dashRes.ok && dashData.leaderboard) setLeaderboard(dashData.leaderboard ?? []);
      if (tRes.ok) setTeams(tData.teams ?? []);
      if (evRes.ok && evData.state) {
        setEventState(evData.state);
        if (evData.remainingSeconds !== undefined) {
          setRemainingSecs(evData.remainingSeconds);
        }
      }
    } catch (e) {
      console.error("Admin fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Tick remaining event time every second
  useEffect(() => {
    if (remainingSecs === null || remainingSecs <= 0 || eventState !== "started") return;
    const timer = setInterval(() => {
      setRemainingSecs((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSecs, eventState]);

  function formatTimer(secs: number | null) {
    if (secs === null) return "105 mins";
    if (secs <= 0) return "0 mins (EVENT ENDED)";
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    if (rem === 0) return `${mins} mins`;
    return `${mins}m ${rem}s`;
  }

  async function handleToggleEvent(action: "start" | "reset") {
    setIsTogglingEvent(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/event-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        setEventState(json.state);
        setMsg({
          ok: true,
          text: action === "start" ? "Event started! Participants can now view their dashboard." : "Event status reset to Waiting Room.",
        });
      } else {
        setMsg({ ok: false, text: json.error ?? "Failed to update event status" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error updating event status" });
    } finally {
      setIsTogglingEvent(false);
    }
  }

  function openResetModal() {
    setResetConfirmInput("");
    setShowResetModal(true);
  }

  async function handleConfirmReset() {
    if (resetConfirmInput.trim().toLowerCase() !== "reset") return;
    setIsResetting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/reset", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: "Leaderboard, CTF submissions, and participant teams reset successfully!" });
        setShowResetModal(false);
        setResetConfirmInput("");
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Reset failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Reset error" });
    } finally {
      setIsResetting(false);
    }
  }

  function openPenaltyModal(t: AdminTeam) {
    setPenaltyModalTeam(t);
    setPenaltyPointsInput(50);
    setPenaltyReasonInput("");
  }

  async function handleConfirmPenalty() {
    if (!penaltyModalTeam || penaltyPointsInput <= 0) return;
    setIsSubmittingPenalty(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "penalty",
          teamId: penaltyModalTeam.id,
          penaltyPoints: penaltyPointsInput,
          reason: penaltyReasonInput,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: json.message ?? "Penalty applied successfully!" });
        setPenaltyModalTeam(null);
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Failed to apply penalty" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error applying penalty" });
    } finally {
      setIsSubmittingPenalty(false);
    }
  }

  function openBanModal(t: AdminTeam) {
    setBanModalTeam(t);
    setBanConfirmInput("");
    setBanReasonInput("");
  }

  async function handleConfirmBan() {
    if (!banModalTeam || banConfirmInput.trim().toUpperCase() !== "BAN") return;
    setIsSubmittingBan(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban",
          teamId: banModalTeam.id,
          reason: banReasonInput,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: json.message ?? "Team banned successfully!" });
        setBanModalTeam(null);
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Failed to ban team" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error banning team" });
    } finally {
      setIsSubmittingBan(false);
    }
  }

  async function handleUnbanTeam(t: AdminTeam) {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unban",
          teamId: t.id,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: json.message ?? "Team unbanned successfully!" });
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Failed to unban team" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error unbanning team" });
    }
  }

  async function handleUpdateStatus(slug: string, status: "open" | "closed" | "released" | "hidden") {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateStatus", slug, status }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: `Challenge ${slug} status updated to ${status}` });
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Failed to update status" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error updating challenge status" });
    }
  }

  async function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlug.trim() || !newTitle.trim() || !newFlag.trim()) return;

    const initialPts = newDifficulty === "Hard" ? 200 : newDifficulty === "Medium" ? 150 : 100;

    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          slug: newSlug.trim(),
          title: newTitle.trim(),
          difficulty: newDifficulty,
          category: newCategory.trim(),
          description: newDescription.trim(),
          flag: newFlag.trim(),
          initialPoints: initialPts,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: `Challenge '${newTitle}' created successfully!` });
        setNewSlug("");
        setNewTitle("");
        setNewDescription("");
        setNewFlag("SPIDER{...}");
        setActiveTab("challenges");
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Failed to create challenge" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error creating challenge" });
    }
  }

  async function handleFileUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadSlug || !uploadFile) {
      setMsg({ ok: false, text: "Please select a challenge and a file to upload" });
      return;
    }

    setMsg(null);
    try {
      const formData = new FormData();
      formData.append("slug", uploadSlug);
      formData.append("file", uploadFile);

      const res = await fetch("/api/admin/ctf/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: `Attachment '${uploadFile.name}' uploaded to challenge ${uploadSlug}!` });
        setUploadFile(null);
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Upload failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error uploading file" });
    }
  }

  function handleExport(format: "json" | "csv") {
    window.open(`/api/admin/ctf/export?format=${format}`, "_blank");
  }

  const easyChallenges = challenges.filter(c => (c.config?.difficulty ?? "Easy").toLowerCase() === "easy");
  const mediumChallenges = challenges.filter(c => (c.config?.difficulty ?? "").toLowerCase() === "medium");
  const hardChallenges = challenges.filter(c => (c.config?.difficulty ?? "").toLowerCase() === "hard");

  if (loading) {
    return (
      <main className="min-h-screen bg-[#070308] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto shadow-md" />
          <p className="text-red-400 text-sm font-bold tracking-widest uppercase">Connecting to Admin Network...</p>
        </div>
      </main>
    );
  }

  const renderAdminCard = (ch: AdminChallenge) => {
    const status = ch.config.status ?? "open";
    return (
      <div
        key={ch._id}
        className="bg-[#160d1a] border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-xl hover:border-white/20 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase bg-pink-950 text-pink-300 rounded-md border border-pink-500/30">
              {ch.config.category ?? "Misc"}
            </span>
            <span
              className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-md border ${
                status === "open"
                  ? "bg-emerald-950 text-emerald-300 border-emerald-500/40"
                  : status === "closed"
                    ? "bg-red-950 text-red-300 border-red-500/40"
                    : status === "released"
                      ? "bg-cyan-950 text-cyan-300 border-cyan-500/40"
                      : "bg-gray-950 text-gray-400 border-gray-500/40"
              }`}
            >
              STATUS: {status}
            </span>
          </div>

          <h4 className="text-lg font-bold text-white mb-1">{ch.title}</h4>
          <p className="text-xs font-mono text-pink-400 mb-2">Slug: {ch.slug}</p>
          <p className="text-xs text-gray-300 mb-4 leading-relaxed line-clamp-2">{ch.config.description}</p>

          <div className="bg-[#07030a] p-3 rounded-xl text-xs space-y-1 font-mono mb-4 text-gray-300 border border-white/5">
            <div>Initial Pts: <span className="text-red-400 font-bold">{ch.config.initialPoints ?? ch.points}</span></div>
            <div>Attachments: <span className="text-gray-400">{ch.config.attachments?.join(", ") || "None"}</span></div>
          </div>
        </div>

        {/* Controls: Open, Close, Release, Hide */}
        <div className="space-y-2 pt-3 border-t border-white/10">
          <span className="block text-[10px] uppercase font-black text-gray-400 mb-1">State Controls</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleUpdateStatus(ch.slug, "open")}
              className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                status === "open"
                  ? "bg-emerald-600 text-white border-emerald-400"
                  : "bg-emerald-950 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900"
              }`}
            >
              Open
            </button>
            <button
              onClick={() => handleUpdateStatus(ch.slug, "closed")}
              className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                status === "closed"
                  ? "bg-red-600 text-white border-red-400"
                  : "bg-red-950 text-red-300 border-red-500/30 hover:bg-red-900"
              }`}
            >
              Close
            </button>
            <button
              onClick={() => handleUpdateStatus(ch.slug, "released")}
              className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                status === "released"
                  ? "bg-cyan-600 text-white border-cyan-400"
                  : "bg-cyan-950 text-cyan-300 border-cyan-500/30 hover:bg-cyan-900"
              }`}
            >
              Release
            </button>
            <button
              onClick={() => handleUpdateStatus(ch.slug, "hidden")}
              className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                status === "hidden"
                  ? "bg-gray-700 text-white border-gray-500"
                  : "bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-800"
              }`}
            >
              Hide
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#0a0510] text-gray-100 font-sans pb-16 relative overflow-x-hidden selection:bg-red-500 selection:text-white z-0">
      {/* Interactive FX */}
      <SpiderBackgroundFX />

      {/* Solid Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[#0a0510]" />

      {/* Top Navbar */}
      <header className="bg-[#0a0510] border-b border-red-500/20 px-6 py-5 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter flex items-center gap-2">
              <span className="text-gray-200">XPLORE 26</span>
              <span className="text-red-600">ADMIN CONTROL PANEL</span>
            </h1>
            <p className="text-xs text-gray-400 font-medium">CTF Event Telemetry & Management</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-950 border border-red-500/50 text-red-300 font-mono text-xs font-bold shadow-md">
              <span className="uppercase text-gray-400">Time Left:</span>
              <span className="text-white text-xs font-black">{eventState === "started" ? formatTimer(remainingSecs) : "105 mins"}</span>
            </div>
            <a
              href="/ctf"
              className="px-4 py-2 text-xs font-bold bg-red-950 border border-red-500/40 text-red-300 rounded-xl hover:bg-red-900 transition-all uppercase tracking-wider"
            >
              Participant View
            </a>
            <button
              onClick={openResetModal}
              className="px-4 py-2 text-xs font-bold bg-red-600/30 border border-red-500/60 text-red-200 rounded-xl hover:bg-red-600/60 transition-all uppercase tracking-wider"
            >
              Reset CTF Board
            </button>
            <button
              onClick={async () => {
                try {
                  await fetch("/api/logout", { method: "POST" });
                } catch (e) {
                  console.error("Logout error", e);
                }
                window.location.href = "/spider-hq-admin-9981";
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-red-950 border border-red-500/40 text-red-300 rounded-xl hover:bg-red-900 transition-all uppercase tracking-wider"
            >
              Logout
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-8 z-10 relative">
        {/* Admin Event Control Banner */}
        <div className="mb-6 p-6 bg-[#0d0716] border border-red-500/30 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div>
            <h2 className="text-xl font-black uppercase text-white flex items-center gap-3">
              EVENT STATUS:{" "}
              <span className={eventState === "started" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {eventState === "started" ? "EVENT LIVE" : "WAITING ROOM ACTIVE"}
              </span>
            </h2>
            <p className="text-xs text-gray-400 font-medium mt-1">
              {eventState === "started"
                ? "Participants can access the dashboard and question pages."
                : "Participants are kept in the waiting room until you click 'Start Event'."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {eventState !== "started" ? (
              <button
                onClick={() => handleToggleEvent("start")}
                disabled={isTogglingEvent}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50"
              >
                {isTogglingEvent ? "Starting..." : "START EVENT"}
              </button>
            ) : (
              <button
                onClick={() => handleToggleEvent("reset")}
                disabled={isTogglingEvent}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50"
              >
                {isTogglingEvent ? "Resetting..." : "RESET TO WAITING ROOM"}
              </button>
            )}
          </div>
        </div>

        {/* Global Feedback Banner */}
        {msg && (
          <div
            className={`mb-6 p-4 rounded-2xl border text-sm font-bold flex items-center justify-between animate-fadeIn ${
              msg.ok
                ? "bg-emerald-950 border-emerald-500/50 text-emerald-200"
                : "bg-red-950 border-red-500/50 text-red-200"
            }`}
          >
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* Top Controls & Navigation */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4 mb-8">
          <div className="flex bg-[#07030a] p-1.5 rounded-2xl border border-white/10 space-x-2">
            <button
              onClick={() => setActiveTab("challenges")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all uppercase tracking-wider ${
                activeTab === "challenges" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Manage Challenges ({challenges.length})
            </button>
            <button
              onClick={() => setActiveTab("leaderboard")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all uppercase tracking-wider ${
                activeTab === "leaderboard" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Live Leaderboard ({leaderboard.length})
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all uppercase tracking-wider ${
                activeTab === "create" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Create Challenge
            </button>
            <button
              onClick={() => setActiveTab("submissions")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all uppercase tracking-wider ${
                activeTab === "submissions" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Submissions Log ({submissions.length})
            </button>
            <button
              onClick={() => setActiveTab("teams")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-black transition-all uppercase tracking-wider ${
                activeTab === "teams" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              Teams & Moderation ({teams.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleExport("csv")}
              className="px-4 py-2 bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl hover:bg-emerald-900 transition-all"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport("json")}
              className="px-4 py-2 bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl hover:bg-cyan-900 transition-all"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* TAB 1: CHALLENGES MANAGEMENT */}
        {activeTab === "challenges" && (
          <div className="space-y-8">
            {/* Attachment Upload Drawer */}
            <div className="bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 shadow-md">
              <h3 className="text-lg font-black uppercase tracking-wide text-white mb-1">Upload Attachment to Challenge</h3>
              <p className="text-xs text-gray-400 mb-4 font-medium">Supported formats: zip, pdf, png, jpg, pcap</p>

              <form onSubmit={handleFileUpload} className="flex flex-col md:flex-row items-center gap-4">
                <select
                  value={uploadSlug}
                  onChange={(e) => setUploadSlug(e.target.value)}
                  className="bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 w-full md:w-64"
                >
                  <option value="">Select Challenge...</option>
                  {challenges.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.title} ({c.slug})
                    </option>
                  ))}
                </select>

                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="text-xs text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-red-950 file:text-red-300 hover:file:bg-red-900 border border-red-500/20 rounded-xl bg-[#07030a]"
                />

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl transition-all uppercase tracking-wider w-full md:w-auto"
                >
                  Upload Attachment
                </button>
              </form>
            </div>

            {/* 3 Difficulty Columns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* EASY COLUMN */}
              <div className="flex flex-col gap-4 border border-emerald-500/30 bg-[#0a1612] rounded-3xl p-5">
                <div className="text-center pb-3 border-b border-emerald-500/20 mb-1">
                  <h2 className="text-emerald-400 font-black uppercase tracking-widest text-lg">
                    EASY ({easyChallenges.length})
                  </h2>
                </div>
                {easyChallenges.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs italic font-medium">No easy challenges created</div>
                ) : (
                  easyChallenges.map(renderAdminCard)
                )}
              </div>

              {/* MEDIUM COLUMN */}
              <div className="flex flex-col gap-4 border border-amber-500/30 bg-[#16120a] rounded-3xl p-5">
                <div className="text-center pb-3 border-b border-amber-500/20 mb-1">
                  <h2 className="text-amber-400 font-black uppercase tracking-widest text-lg">
                    MEDIUM ({mediumChallenges.length})
                  </h2>
                </div>
                {mediumChallenges.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs italic font-medium">No medium challenges created</div>
                ) : (
                  mediumChallenges.map(renderAdminCard)
                )}
              </div>

              {/* HARD COLUMN */}
              <div className="flex flex-col gap-4 border border-red-500/30 bg-[#160a0f] rounded-3xl p-5">
                <div className="text-center pb-3 border-b border-red-500/20 mb-1">
                  <h2 className="text-pink-500 font-black uppercase tracking-widest text-lg">
                    HARD ({hardChallenges.length})
                  </h2>
                </div>
                {hardChallenges.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs italic font-medium">No hard challenges created</div>
                ) : (
                  hardChallenges.map(renderAdminCard)
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE LEADERBOARD */}
        {activeTab === "leaderboard" && (
          <div className="bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-white">Live Team Standings</h2>
                <p className="text-xs text-gray-400 font-medium">Real-time CTF leaderboard</p>
              </div>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-red-950 border border-red-500/40 text-red-300 text-xs font-bold rounded-xl hover:bg-red-900 transition-all"
              >
                Refresh Standings
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Rank</th>
                    <th className="py-3.5 px-4 font-semibold">Team Name</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Solves Count</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Total Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {leaderboard.filter((row) => row.teamName.toLowerCase() !== "admin team").map((row, idx) => (
                    <tr key={row.teamId} className={`transition-colors ${idx < 3 ? 'bg-red-950/30' : 'hover:bg-white/5'}`}>
                      <td className="py-4 px-4 font-black text-gray-200">
                        #{idx + 1}
                      </td>
                      <td className="py-4 px-4 font-bold text-white">
                        <span>{row.teamName}</span>
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-cyan-300">
                        {row.solvedCount ?? 0}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-black text-pink-400 text-base">
                        {row.points} pts
                      </td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">
                        No team scores calculated yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: CREATE CHALLENGE FORM */}
        {activeTab === "create" && (
          <div className="bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 md:p-8 max-w-3xl mx-auto shadow-xl">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-1">Create New CTF Challenge</h2>
            <p className="text-xs text-gray-400 mb-6 font-medium">Flags are automatically hashed into SHA-256</p>

            <form onSubmit={handleCreateChallenge} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Challenge Slug</label>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="e.g. easy-04"
                    required
                    className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Challenge Title"
                    required
                    className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-pink-400 mb-1">Difficulty</label>
                  <select
                    value={newDifficulty}
                    onChange={(e) => setNewDifficulty(e.target.value)}
                    className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-pink-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. Web, Crypto, Forensics"
                    required
                    className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-pink-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Flag String</label>
                <input
                  type="text"
                  value={newFlag}
                  onChange={(e) => setNewFlag(e.target.value)}
                  placeholder="SPIDER{exact_flag_here}"
                  required
                  className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Description / Prompt</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  placeholder="Detailed challenge instructions..."
                  className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="bg-[#07030a] p-3 rounded-xl border border-red-500/20 text-xs flex items-center justify-between text-gray-300 font-mono">
                <span>Awarded Points for <strong className="text-pink-400">{newDifficulty}</strong>:</span>
                <span className="text-emerald-400 font-black text-sm">
                  {newDifficulty === "Hard" ? "200 pts" : newDifficulty === "Medium" ? "150 pts" : "100 pts"}
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 mt-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                Create Challenge
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: SUBMISSIONS LOG */}
        {activeTab === "submissions" && (
          <div className="bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 md:p-8 shadow-xl">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-1">All CTF Submissions Log</h2>
            <p className="text-xs text-gray-400 mb-6 font-medium">Real-time audit log of participant attempts</p>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Timestamp</th>
                    <th className="py-3.5 px-4 font-semibold">Team Name</th>
                    <th className="py-3.5 px-4 font-semibold">Challenge</th>
                    <th className="py-3.5 px-4 font-semibold">Result</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-white/5">
                      <td className="py-3.5 px-4 font-mono text-xs text-gray-400">
                        {new Date(sub.receivedAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-pink-400">{sub.teamName}</td>
                      <td className="py-3.5 px-4 text-white">{sub.challengeTitle}</td>
                      <td className="py-3.5 px-4">
                        {sub.correct ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                            Correct
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-950 text-red-300 border border-red-500/40">
                            Wrong
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-red-400">
                        +{sub.points} pts
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 text-sm">
                        No submissions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: TEAMS & MODERATION */}
        {activeTab === "teams" && (
          <div className="bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight text-white">Teams Moderation & Penalties</h2>
                <p className="text-xs text-gray-400 font-medium">Issue point deductions, inspect participant teams, and ban rule violators</p>
              </div>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-red-950 border border-red-500/40 text-red-300 text-xs font-bold rounded-xl hover:bg-red-900 transition-all"
              >
                Refresh Teams
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Team Name</th>
                    <th className="py-3.5 px-4 font-semibold">Members</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Solves</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Total Score</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Penalties</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {teams.map((t) => (
                    <tr key={t.id} className={`transition-colors ${t.banned ? 'bg-red-950/40 border-l-4 border-red-600' : 'hover:bg-white/5'}`}>
                      <td className="py-4 px-4 font-bold text-white">
                        {t.name}
                      </td>
                      <td className="py-4 px-4 text-xs text-gray-300">
                        {t.members?.length > 0 ? t.members.join(", ") : "No captain registered"}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-cyan-300">
                        {t.solvedCount}
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-pink-400">
                        {t.score} pts
                      </td>
                      <td className="py-4 px-4 text-center font-mono font-bold text-red-400">
                        {t.penaltyPoints > 0 ? `-${t.penaltyPoints} pts` : "None"}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {t.banned ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-red-950 text-red-400 border border-red-500/50">
                            BANNED
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right space-x-2">
                        <button
                          onClick={() => openPenaltyModal(t)}
                          className="px-3 py-1.5 bg-amber-950 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl hover:bg-amber-900 transition-all"
                        >
                          Penalty
                        </button>
                        {t.banned ? (
                          <button
                            onClick={() => handleUnbanTeam(t)}
                            className="px-3 py-1.5 bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl hover:bg-emerald-900 transition-all"
                          >
                            Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => openBanModal(t)}
                            className="px-3 py-1.5 bg-red-950 border border-red-500/60 text-red-300 text-xs font-bold rounded-xl hover:bg-red-900 transition-all"
                          >
                            Ban
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500 text-sm">
                        No participant teams registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CONFIRMATION DIALOG MODAL: PENALTY */}
      {penaltyModalTeam && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#12071a] border border-amber-500/40 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl space-y-6 relative">
            <button
              onClick={() => setPenaltyModalTeam(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-wider">Confirm Point Penalty</h3>
              <p className="text-xs text-gray-400 font-medium">Issue point deduction to participant team</p>
            </div>

            <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 text-xs space-y-2 text-amber-200">
              <p className="font-bold text-sm text-white">Target Team: {penaltyModalTeam.name}</p>
              <p className="text-gray-300">Current Score: <span className="text-pink-400 font-bold">{penaltyModalTeam.score} pts</span></p>
              {penaltyModalTeam.members.length > 0 && (
                <p className="text-gray-400">Members: {penaltyModalTeam.members.join(", ")}</p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                  Penalty Points (Deduction Amount)
                </label>
                <input
                  type="number"
                  min="1"
                  value={penaltyPointsInput}
                  onChange={(e) => setPenaltyPointsInput(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  placeholder="e.g. 50"
                  className="w-full bg-[#07030a] border border-amber-500/40 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Reason / Infraction Note
                </label>
                <input
                  type="text"
                  value={penaltyReasonInput}
                  onChange={(e) => setPenaltyReasonInput(e.target.value)}
                  placeholder="e.g. Code sharing / Unfair hint usage"
                  className="w-full bg-[#07030a] border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPenaltyModalTeam(null)}
                className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-bold rounded-xl transition-all uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPenalty}
                disabled={isSubmittingPenalty || penaltyPointsInput <= 0}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider disabled:opacity-50"
              >
                {isSubmittingPenalty ? "Applying…" : "Confirm Penalty"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG MODAL: BAN TEAM */}
      {banModalTeam && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#12071a] border border-red-500/40 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl space-y-6 relative">
            <button
              onClick={() => setBanModalTeam(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-wider">Ban Team Confirmation</h3>
              <p className="text-xs text-gray-400 font-medium">Block team access and remove from leaderboard</p>
            </div>

            <div className="bg-red-950/50 border border-red-500/40 rounded-2xl p-4 text-xs space-y-2 text-red-200">
              <p className="font-bold text-sm text-white">Target Team: {banModalTeam.name}</p>
              <p className="text-gray-300">This action will immediately block all members of this team from logging in or submitting answers. They will be removed from live standings.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-red-400 mb-1">
                  Ban Reason
                </label>
                <input
                  type="text"
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  placeholder="e.g. Plagiarism / Flag sharing"
                  className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                  Type <span className="text-red-400 font-black">BAN</span> to confirm
                </label>
                <input
                  type="text"
                  value={banConfirmInput}
                  onChange={(e) => setBanConfirmInput(e.target.value)}
                  placeholder="Type BAN here"
                  className="w-full bg-[#07030a] border border-red-500/40 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-red-500 uppercase"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setBanModalTeam(null)}
                className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-bold rounded-xl transition-all uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBan}
                disabled={isSubmittingBan || banConfirmInput.trim().toUpperCase() !== "BAN"}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-xl transition-all uppercase tracking-wider disabled:opacity-50"
              >
                {isSubmittingBan ? "Banning…" : "Confirm Ban"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG MODAL: REQUIRE TYPING 'reset' */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fadeIn">
          <div className="bg-[#0d0716] border-2 border-red-500/80 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-xl relative">
            <button
              onClick={() => setShowResetModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div className="mb-4">
              <h3 className="text-xl font-black uppercase text-red-500 tracking-wider">Confirm Reset</h3>
              <p className="text-xs text-gray-400 font-medium">Irreversible Action</p>
            </div>

            <p className="text-xs text-gray-300 mb-4 leading-relaxed">
              This will permanently delete all <strong className="text-red-400">submissions</strong>, <strong className="text-red-400">score logs</strong>, and <strong className="text-red-400">logged-in participant teams</strong>, completely clearing the leaderboard.
            </p>

            <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-4 mb-5 space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-widest text-red-300">
                To confirm, type <span className="bg-red-900 px-2 py-0.5 rounded text-white font-mono font-bold">reset</span> below:
              </label>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resetConfirmInput.trim().toLowerCase() === "reset") {
                    handleConfirmReset();
                  }
                }}
                placeholder="type reset to confirm..."
                autoFocus
                className="w-full bg-[#07030a] border border-red-500/60 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-red-400"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="w-1/2 py-3 bg-gray-900 border border-gray-700 hover:bg-gray-800 text-gray-300 text-xs font-bold rounded-xl transition-all uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={resetConfirmInput.trim().toLowerCase() !== "reset" || isResetting}
                className={`w-1/2 py-3 text-xs font-black rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-2 ${
                  resetConfirmInput.trim().toLowerCase() === "reset" && !isResetting
                    ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
                    : "bg-red-950 border border-red-900 text-red-400/50 cursor-not-allowed"
                }`}
              >
                {isResetting ? "Resetting..." : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
