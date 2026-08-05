"use client";

import { useState } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

export default function PlatformEntry() {
  const [teamName, setTeamName] = useState("");
  const [partPassword, setPartPassword] = useState("");
  const [showPartPassword, setShowPartPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) {
      setError("Please enter your Team Name");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: teamName.trim(), password: partPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Authentication failed");
        return;
      }

      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("ctf_timer_")) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.error("Failed to clear local storage", e);
      }

      const rawRt = new URLSearchParams(window.location.search).get("rt");
      let targetRedirect = "/ctf";
      if (rawRt) {
        if (rawRt.startsWith("http://") || rawRt.startsWith("https://")) {
          targetRedirect = rawRt;
        } else if (rawRt.startsWith("/") && !rawRt.startsWith("/admin")) {
          targetRedirect = rawRt;
        }
      }

      window.location.href = targetRedirect;
    } catch {
      setError("Network error — please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0510] text-gray-100 font-sans relative overflow-hidden flex flex-col items-center justify-center p-4 selection:bg-red-500 selection:text-white z-0">
      <SpiderBackgroundFX />

      {/* Solid Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[#0a0510]" />

      {/* Header Branding */}
      <div className="text-center mb-8 relative z-10">
        <div className="inline-block mb-3 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] bg-red-950 border border-red-500/40 text-red-400 rounded-full">
          Symposium 2026
        </div>
        <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter flex items-center justify-center gap-3">
          <span className="text-gray-200">XPLORE 26</span>
          <span className="text-red-600">MULTIVERSE BREACH</span>
        </h1>
        <p className="text-gray-400 text-xs md:text-sm mt-2 font-medium tracking-wide">
          Cyber Security & CTF Arena
        </p>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 md:p-8 shadow-xl relative z-10 overflow-hidden">
        <div className="mb-6 pb-4 border-b border-red-500/20 text-center">
          <h2 className="text-lg font-black uppercase tracking-wider text-white">
            Participant Portal
          </h2>
          <p className="text-xs text-gray-400 mt-1 font-medium">
            Enter your team credentials to access the CTF arena
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950 border border-red-500/50 text-red-300 text-xs text-center font-bold animate-fadeIn">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
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
              className="w-full bg-[#07030a] border border-red-500/30 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 text-xs transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-pink-400 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPartPassword ? "text" : "password"}
                value={partPassword}
                onChange={(e) => setPartPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#07030a] border border-red-500/30 rounded-xl pl-4 pr-10 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 text-xs transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPartPassword(!showPartPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-1"
                aria-label="Toggle password visibility"
              >
                {showPartPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.038 10.038 0 014.122-.963c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-2 py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all disabled:opacity-50 text-xs uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {busy ? "Authenticating…" : "Enter Multiverse"}
          </button>
        </form>
      </div>

      <div className="mt-8 text-center text-xs font-bold text-gray-500 relative z-10 tracking-wider">
        LICET Symposium Management Platform
      </div>
    </main>
  );
}

