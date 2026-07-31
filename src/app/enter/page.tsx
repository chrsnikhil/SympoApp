"use client";

import { useState } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

export default function EnterPage() {
  const [activeTab, setActiveTab] = useState<"participant" | "admin">("participant");

  // Participant form
  const [teamName, setTeamName] = useState("");
  const [partPassword, setPartPassword] = useState("");

  // Admin form
  const [username, setUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

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

  return (
    <main className="min-h-screen bg-[#0a0510] text-gray-100 font-sans relative overflow-hidden flex flex-col items-center justify-center p-4 selection:bg-red-500 selection:text-white z-0">
      {/* Interactive FX: Cursor, Web Trail & Crawling Spiders */}
      <SpiderBackgroundFX />

      {/* Background aesthetics */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_#1f0612_0%,_#0a0510_80%)]" />
        <div className="absolute bottom-0 w-full h-[50vh] bg-gradient-to-t from-red-950/40 to-transparent" />
        <div className="absolute left-0 top-1/4 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[150px]" />
        <div className="absolute right-0 bottom-1/4 w-[600px] h-[600px] bg-pink-600/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-0 w-full h-32 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwYTA1MTAiLz48cGF0aCBkPSJNMCAxMDBWMzBoMjB2MTBoMTVWMjBoMTB2MTBoMThWNTBoMTB2MTBoMTVWNDBoMjB2MjBoMTBWMTBoMTV2MTBoMjBWNTBIMTAwVjEwMGgtMTAwWiIgZmlsbD0iI2RjMjYyNiIgb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] bg-repeat-x bg-bottom" style={{ backgroundSize: '150px 100%' }}></div>
      </div>

      {/* Spider-Verse Header Branding */}
      <div className="text-center mb-8 relative z-10">
        <div className="inline-block mb-3 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] bg-red-950/60 border border-red-500/40 text-red-400 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.3)]">
          Symposium 2026
        </div>
        <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter flex items-center justify-center gap-3">
          <span className="text-gray-200 drop-shadow-md">XPLORE 26</span>
          <span className="text-red-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.8)]">MULTIVERSE BREACH</span>
        </h1>
        <p className="text-gray-400 text-xs md:text-sm mt-2 font-medium tracking-wide">
          Spider-Verse Cyber Security & CTF Arena
        </p>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-[#0d0716]/90 backdrop-blur-2xl border border-red-500/30 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(220,38,38,0.15)] relative z-10 overflow-hidden">
        {/* Subtle Background Web Accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,_rgba(220,38,38,0.12),_transparent_70%)] pointer-events-none" />

        {/* Navigation Tabs (Participant vs Admin) */}
        <div className="flex bg-[#07030a] p-1 rounded-2xl mb-6 border border-white/10">
          <button
            type="button"
            onClick={() => { setActiveTab("participant"); setError(null); }}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === "participant"
                ? "bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Participant
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("admin"); setError(null); }}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === "admin"
                ? "bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Admin Panel
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs text-center font-bold animate-fadeIn">
            {error}
          </div>
        )}

        {/* Tab 1: Participant Team Login */}
        {activeTab === "participant" && (
          <form onSubmit={onParticipantSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">
                Team Name
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter your team name"
                required
                className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-xs transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-pink-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={partPassword}
                onChange={(e) => setPartPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-xs transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 py-3.5 bg-gradient-to-r from-red-600 via-pink-600 to-red-600 hover:from-red-500 hover:to-pink-500 text-white font-black rounded-xl shadow-[0_0_25px_rgba(220,38,38,0.5)] transition-all disabled:opacity-50 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <span>🕷️</span> {busy ? "Authenticating…" : "Enter Multiverse"}
            </button>
          </form>
        )}

        {/* Tab 2: Admin Login (Matching Participant Red/Pink Theme) */}
        {activeTab === "admin" && (
          <form onSubmit={onAdminSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">
                Admin Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter admin username"
                required
                className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-xs transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-pink-400 mb-1">
                Admin Password
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-xs transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full mt-2 py-3.5 bg-gradient-to-r from-red-600 via-pink-600 to-red-600 hover:from-red-500 hover:to-pink-500 text-white font-black rounded-xl shadow-[0_0_25px_rgba(220,38,38,0.5)] transition-all disabled:opacity-50 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <span>⚙️</span> {busy ? "Authenticating…" : "Admin Access"}
            </button>
          </form>
        )}
      </div>

      <div className="mt-8 text-center text-xs font-bold text-gray-500 relative z-10 tracking-wider">
        LICET Symposium Management Platform · Powered by Spider-Verse Architecture
      </div>
    </main>
  );
}
