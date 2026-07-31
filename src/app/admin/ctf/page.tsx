"use client";

import { useEffect, useState, useCallback } from "react";

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
    minimumPoints?: number;
    decayAfter?: number;
    firstBloodBonus?: number;
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

export default function AdminCtfPage() {
  const [challenges, setChallenges] = useState<AdminChallenge[]>([]);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"challenges" | "submissions" | "create">("challenges");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // New Challenge Form State
  const [newSlug, setNewSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDifficulty, setNewDifficulty] = useState("Easy");
  const [newCategory, setNewCategory] = useState("Web");
  const [newDescription, setNewDescription] = useState("");
  const [newFlag, setNewFlag] = useState("SPIDER{...}");
  const [newInitialPts, setNewInitialPts] = useState(100);
  const [newMinPts, setNewMinPts] = useState(50);
  const [newDecayAfter, setNewDecayAfter] = useState(3);
  const [newFbBonus, setNewFbBonus] = useState(30);

  // Attachment upload state
  const [uploadSlug, setUploadSlug] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        fetch("/api/admin/ctf/challenges"),
        fetch("/api/admin/ctf/submissions"),
      ]);

      if (cRes.status === 401 || sRes.status === 401) {
        window.location.href = "/enter?rt=/admin/ctf";
        return;
      }

      const cData = await cRes.json();
      const sData = await sRes.json();

      if (cRes.ok) setChallenges(cData.challenges ?? []);
      if (sRes.ok) setSubmissions(sData.submissions ?? []);
    } catch (e) {
      console.error("Admin fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    try {
      const res = await fetch("/api/admin/ctf/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug,
          title: newTitle,
          difficulty: newDifficulty,
          category: newCategory,
          description: newDescription,
          flag: newFlag,
          initialPoints: newInitialPts,
          minimumPoints: newMinPts,
          decayAfter: newDecayAfter,
          firstBloodBonus: newFbBonus,
          status: "open",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? "Failed to create challenge" });
      } else {
        setMsg({ ok: true, text: "🎉 Challenge created successfully!" });
        setNewSlug("");
        setNewTitle("");
        setNewDescription("");
        fetchData();
        setActiveTab("challenges");
      }
    } catch {
      setMsg({ ok: false, text: "Network error creating challenge" });
    }
  }

  async function handleUpdateStatus(slug: string, status: "open" | "closed" | "released" | "hidden") {
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/challenges", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, status }),
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: `Challenge status updated to "${status}"` });
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Update failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Network error updating status" });
    }
  }

  async function handleFileUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadSlug || !uploadFile) {
      setMsg({ ok: false, text: "Select a challenge and file first" });
      return;
    }

    const formData = new FormData();
    formData.append("slug", uploadSlug);
    formData.append("file", uploadFile);

    try {
      const res = await fetch("/api/admin/ctf/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: `📁 File "${uploadFile.name}" attached successfully!` });
        setUploadFile(null);
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Upload failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Upload failed due to network error" });
    }
  }

  async function handleResetLeaderboard() {
    if (!confirm("⚠️ Are you sure you want to reset all CTF submissions and leaderboard stats? This cannot be undone.")) {
      return;
    }
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ctf/reset", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setMsg({ ok: true, text: "Leaderboard and CTF submissions reset successfully!" });
        fetchData();
      } else {
        setMsg({ ok: false, text: json.error ?? "Reset failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Reset error" });
    }
  }

  function handleExport(format: "csv" | "json") {
    window.open(`/api/admin/ctf/export?format=${format}`, "_blank");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#070510] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm font-semibold tracking-widest uppercase">Loading Admin Dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#070510] text-gray-100 font-sans pb-16 relative selection:bg-purple-500 selection:text-white">
      {/* Top Navbar */}
      <header className="bg-[#0e0924] border-b border-purple-500/20 px-6 py-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                MULTIVERSE BREACH — ADMIN CONTROL
              </h1>
              <p className="text-xs text-gray-400 font-medium">CTF Event Management & Telemetry</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/ctf"
              className="px-4 py-2 text-xs font-bold bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 rounded-xl hover:bg-cyan-500/40 transition-all uppercase tracking-wider"
            >
              Participant View 👁️
            </a>
            <button
              onClick={handleResetLeaderboard}
              className="px-4 py-2 text-xs font-bold bg-red-600/30 border border-red-500/50 text-red-300 rounded-xl hover:bg-red-600/50 transition-all uppercase tracking-wider"
            >
              Reset CTF Board ⚠️
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 mt-8">
        {/* Top Controls & Navigation */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4 mb-8">
          <div className="flex bg-[#140e2b] p-1.5 rounded-2xl border border-white/5 space-x-2">
            <button
              onClick={() => setActiveTab("challenges")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all uppercase tracking-wider ${
                activeTab === "challenges"
                  ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_20px_rgba(236,72,153,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Manage Challenges ({challenges.length})
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all uppercase tracking-wider ${
                activeTab === "create"
                  ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Create Challenge ➕
            </button>
            <button
              onClick={() => setActiveTab("submissions")}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all uppercase tracking-wider ${
                activeTab === "submissions"
                  ? "bg-gradient-to-r from-pink-500 to-cyan-500 text-white shadow-[0_0_20px_rgba(0,229,255,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Submissions Log ({submissions.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleExport("csv")}
              className="px-4 py-2 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl hover:bg-emerald-600/40 transition-all"
            >
              Export CSV 📥
            </button>
            <button
              onClick={() => handleExport("json")}
              className="px-4 py-2 bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl hover:bg-cyan-600/40 transition-all"
            >
              Export JSON 📄
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {msg && (
          <div
            className={`mb-6 p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between ${
              msg.ok
                ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-200"
                : "bg-red-950/80 border-red-500/50 text-red-200"
            }`}
          >
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: CHALLENGES MANAGEMENT */}
        {activeTab === "challenges" && (
          <div className="space-y-8">
            {/* Attachment Upload Drawer */}
            <div className="bg-[#110b27] border border-purple-500/30 rounded-3xl p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-2">Upload Attachment to Challenge</h3>
              <p className="text-xs text-gray-400 mb-4">Supported formats: zip, pdf, png, jpg, pcap</p>

              <form onSubmit={handleFileUpload} className="flex flex-col md:flex-row items-center gap-4">
                <select
                  value={uploadSlug}
                  onChange={(e) => setUploadSlug(e.target.value)}
                  className="bg-[#181038] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 w-full md:w-64"
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
                  className="text-xs text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600/30 file:text-purple-200 hover:file:bg-purple-600/50"
                />

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs rounded-xl shadow-lg hover:opacity-90 transition-all uppercase tracking-wider w-full md:w-auto"
                >
                  Upload Attachment
                </button>
              </form>
            </div>

            {/* Challenges Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {challenges.map((ch) => {
                const status = ch.config.status ?? "open";
                return (
                  <div
                    key={ch._id}
                    className="bg-[#0e0924] border border-purple-500/20 rounded-3xl p-6 flex flex-col justify-between shadow-xl"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase bg-cyan-500/20 text-cyan-300 rounded-md border border-cyan-500/30">
                          {ch.config.difficulty ?? "Easy"}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-md border ${
                            status === "open"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                              : status === "closed"
                              ? "bg-red-500/20 text-red-300 border-red-500/40"
                              : status === "released"
                              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                              : "bg-gray-500/20 text-gray-400 border-gray-500/40"
                          }`}
                        >
                          STATUS: {status}
                        </span>
                      </div>

                      <h4 className="text-xl font-bold text-white mb-1">{ch.title}</h4>
                      <p className="text-xs font-mono text-cyan-400 mb-3">Slug: {ch.slug}</p>
                      <p className="text-xs text-gray-300 mb-4">{ch.config.description}</p>

                      <div className="bg-[#150e35] p-3 rounded-2xl text-xs space-y-1 font-mono mb-4 text-gray-300">
                        <div>Initial Pts: <span className="text-cyan-300 font-bold">{ch.config.initialPoints ?? ch.points}</span></div>
                        <div>Minimum Pts: <span className="text-purple-300 font-bold">{ch.config.minimumPoints ?? 50}</span></div>
                        <div>Decay After: <span className="text-pink-300 font-bold">{ch.config.decayAfter ?? 3} solves</span></div>
                        <div>First Blood Bonus: <span className="text-red-400 font-bold">+{ch.config.firstBloodBonus ?? 30} pts</span></div>
                        <div>Attachments: <span className="text-gray-400">{ch.config.attachments?.join(", ") || "None"}</span></div>
                      </div>
                    </div>

                    {/* Controls: Open, Close, Release, Hide */}
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <span className="block text-[10px] uppercase font-bold text-gray-400 mb-1">State Controls</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUpdateStatus(ch.slug, "open")}
                          className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                            status === "open"
                              ? "bg-emerald-600 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                              : "bg-emerald-950/40 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/50"
                          }`}
                        >
                          Open 🟢
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(ch.slug, "closed")}
                          className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                            status === "closed"
                              ? "bg-red-600 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                              : "bg-red-950/40 text-red-300 border-red-500/30 hover:bg-red-900/50"
                          }`}
                        >
                          Close 🔴
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(ch.slug, "released")}
                          className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                            status === "released"
                              ? "bg-cyan-600 text-white border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                              : "bg-cyan-950/40 text-cyan-300 border-cyan-500/30 hover:bg-cyan-900/50"
                          }`}
                        >
                          Release 🚀
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(ch.slug, "hidden")}
                          className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all ${
                            status === "hidden"
                              ? "bg-gray-700 text-white border-gray-500"
                              : "bg-gray-900/40 text-gray-400 border-gray-700 hover:bg-gray-800/50"
                          }`}
                        >
                          Hide 👻
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CREATE CHALLENGE FORM */}
        {activeTab === "create" && (
          <div className="bg-[#110b27] border border-purple-500/30 rounded-3xl p-6 md:p-8 max-w-3xl mx-auto shadow-2xl">
            <h2 className="text-2xl font-extrabold text-white mb-2">Create New CTF Challenge</h2>
            <p className="text-xs text-gray-400 mb-6">Flags are automatically hashed into SHA-256 (stored secure, never plaintext)</p>

            <form onSubmit={handleCreateChallenge} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-cyan-300 mb-1">Challenge Slug</label>
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    placeholder="e.g. easy-04"
                    required
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-cyan-300 mb-1">Title</label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Challenge Title"
                    required
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-purple-300 mb-1">Difficulty</label>
                  <select
                    value={newDifficulty}
                    onChange={(e) => setNewDifficulty(e.target.value)}
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-purple-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="e.g. Web, Crypto, Forensics"
                    required
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-pink-300 mb-1">Flag String</label>
                <input
                  type="text"
                  value={newFlag}
                  onChange={(e) => setNewFlag(e.target.value)}
                  placeholder="SPIDER{exact_flag_here}"
                  required
                  className="w-full bg-[#181038] border border-pink-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-pink-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-300 mb-1">Description / Prompt</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  placeholder="Detailed challenge instructions..."
                  className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Initial Points</label>
                  <input
                    type="number"
                    value={newInitialPts}
                    onChange={(e) => setNewInitialPts(Number(e.target.value))}
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Min Points</label>
                  <input
                    type="number"
                    value={newMinPts}
                    onChange={(e) => setNewMinPts(Number(e.target.value))}
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">Decay After</label>
                  <input
                    type="number"
                    value={newDecayAfter}
                    onChange={(e) => setNewDecayAfter(Number(e.target.value))}
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-gray-400 mb-1">First Blood Bonus</label>
                  <input
                    type="number"
                    value={newFbBonus}
                    onChange={(e) => setNewFbBonus(Number(e.target.value))}
                    className="w-full bg-[#181038] border border-purple-500/30 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 mt-4 bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold rounded-xl shadow-lg hover:opacity-95 text-xs uppercase tracking-wider"
              >
                Create Challenge
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: SUBMISSIONS LOG */}
        {activeTab === "submissions" && (
          <div className="bg-[#110b27] border border-purple-500/30 rounded-3xl p-6 md:p-8 shadow-2xl">
            <h2 className="text-2xl font-extrabold text-white mb-2">All CTF Submissions Log</h2>
            <p className="text-xs text-gray-400 mb-6">Real-time audit log of participant attempts</p>

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
                      <td className="py-3.5 px-4 font-bold text-cyan-300">{sub.teamName}</td>
                      <td className="py-3.5 px-4 text-white">{sub.challengeTitle}</td>
                      <td className="py-3.5 px-4">
                        {sub.correct ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✓ Correct {sub.meta?.firstBlood ? "🩸 First Blood" : ""}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                            ✕ Wrong
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-purple-300">
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
      </div>
    </main>
  );
}
