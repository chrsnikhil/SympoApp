"use client";

import { useState } from "react";

export default function EnterPage() {
  const [activeTab, setActiveTab] = useState<"participant" | "admin" | "code">("participant");

  // Participant form
  const [teamName, setTeamName] = useState("");
  const [partPassword, setPartPassword] = useState("");

  // Admin form
  const [username, setUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Code form
  const [code, setCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(payload: Record<string, string>, defaultRedirect: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Authentication failed");
        return;
      }
      const rt = new URLSearchParams(window.location.search).get("rt");
      window.location.href = rt ?? defaultRedirect;
    } catch {
      setError("Network error — please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  function onParticipantSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) {
      setError("Please enter your Team Name");
      return;
    }
    handleLogin({ teamName: teamName.trim(), password: partPassword }, "/ctf");
  }

  function onAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLogin({ username: username.trim(), password: adminPassword }, "/admin/ctf");
  }

  function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleLogin({ code }, "/ctf");
  }

  return (
    <main className="min-h-screen bg-[#070510] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Spider-Verse Glow Elements */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Spider-Verse Header Branding */}
      <div className="text-center mb-8 relative z-10">
        <div className="inline-block mb-2 px-3 py-1 text-xs font-semibold uppercase tracking-widest bg-gradient-to-r from-cyan-500 to-purple-600 text-black rounded-full shadow-[0_0_15px_rgba(0,229,255,0.4)]">
          Symposium 2026
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-purple-300 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_4px_20px_rgba(168,85,247,0.4)]">
          MULTIVERSE BREACH
        </h1>
        <p className="text-gray-400 text-sm mt-2 font-medium">
          Spider-Verse Cyber Security & CTF Arena
        </p>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-[#0f0b21]/80 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-6 md:p-8 shadow-[0_0_50px_rgba(112,0,255,0.15)] relative z-10">
        {/* Navigation Tabs */}
        <div className="flex bg-[#181135] p-1 rounded-xl mb-6 border border-white/5">
          <button
            type="button"
            onClick={() => { setActiveTab("participant"); setError(null); }}
            className={`flex-1 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${
              activeTab === "participant"
                ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Participant
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("admin"); setError(null); }}
            className={`flex-1 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${
              activeTab === "admin"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("code"); setError(null); }}
            className={`flex-1 py-2 text-xs md:text-sm font-semibold rounded-lg transition-all ${
              activeTab === "code"
                ? "bg-gradient-to-r from-pink-500 to-cyan-500 text-white shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Access Code
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs md:text-sm text-center font-medium animate-fadeIn">
            {error}
          </div>
        )}

        {/* Tab 1: Participant Team Login */}
        {activeTab === "participant" && (
          <form onSubmit={onParticipantSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-300 mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter your team name"
                required
                className="w-full bg-[#160e33] border border-cyan-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-sm transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-purple-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={partPassword}
                onChange={(e) => setPartPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#160e33] border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 text-sm transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 py-3.5 bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:opacity-95 transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
            >
              {busy ? "Authenticating…" : "Enter Multiverse"}
            </button>
          </form>
        )}

        {/* Tab 2: Admin Login */}
        {activeTab === "admin" && (
          <form onSubmit={onAdminSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-purple-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin username"
                required
                className="w-full bg-[#160e33] border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 text-sm transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-pink-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#160e33] border border-pink-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-pink-400 focus:ring-1 focus:ring-pink-400 text-sm transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.3)] hover:opacity-95 transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
            >
              {busy ? "Authenticating…" : "Admin Access"}
            </button>
          </form>
        )}

        {/* Tab 3: Access Code Redemption */}
        {activeTab === "code" && (
          <form onSubmit={onCodeSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-300 mb-1">
                Event Access Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="X26-XXXXX-XXXXX"
                required
                className="w-full bg-[#160e33] border border-cyan-500/30 rounded-xl px-4 py-3 text-white tracking-widest placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-sm transition-all font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 py-3.5 bg-gradient-to-r from-pink-500 to-cyan-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:opacity-95 transition-all disabled:opacity-50 text-sm uppercase tracking-wider"
            >
              {busy ? "Validating Code…" : "Redeem Code"}
            </button>
          </form>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-gray-500 relative z-10">
        LICET Symposium Management Platform · Powered by Spider-Verse Architecture
      </div>
    </main>
  );
}
