"use client";

import { useState } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";

export default function CanonProtocolPage() {
  const [username, setUsername] = useState("guest");
  const [password, setPassword] = useState("guest123");
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ username: string; tenant: string; scope: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiLog, setApiLog] = useState<string | null>(null);

  /* 
   * INTERNAL DEVELOPER NOTICE:
   * Deprecated v1 endpoints migrated to /api/canon/v2/internal
   * Internal proxy target: internal-vault.spider.local
   */

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setApiLog(null);
    try {
      const res = await fetch("/api/canon/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        setUserInfo(data.user);
        setApiLog(`[LOGIN SUCCESS] JWT Issued:\n${data.token}\n\nClaims: sub=guest, tenant=earth-1610, scope=read`);
      } else {
        setApiLog(`[LOGIN FAILED] ${data.error || "Authentication error"}`);
      }
    } catch {
      setApiLog("[ERROR] Failed to reach authentication service");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestV2Archive() {
    setLoading(true);
    try {
      const res = await fetch("/api/canon/v2/internal?tenant=earth-1610", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const text = await res.text();
      setApiLog(`[HTTP ${res.status}] GET /api/canon/v2/internal?tenant=earth-1610\n\nResponse:\n${text}`);
    } catch (e) {
      setApiLog(`[ERROR] Request failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0510] text-gray-100 font-mono relative overflow-hidden flex flex-col p-6 md:p-10">
      <SpiderBackgroundFX />
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[#0a0510]" />

      <header className="max-w-5xl mx-auto w-full flex flex-wrap items-center justify-between gap-4 border-b border-red-500/30 pb-4 mb-8 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950 border border-red-500/40 flex items-center justify-center font-bold text-red-500 font-avengeance">
            CP
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black italic tracking-tighter text-white font-avengeance">
              CANON PROTOCOL <span className="text-red-500">ARCHIVE</span>
            </h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">
              Spider Society Multiverse Vault v2.4
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/ctf/hard-01"
            className="px-4 py-2 bg-red-950/80 hover:bg-red-900 border border-red-500/40 rounded-xl text-red-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Challenge</span>
          </a>

          {userInfo && (
            <div className="px-3 py-1.5 rounded-xl border border-red-500/40 bg-red-950/60 text-red-300 text-xs font-bold uppercase">
              User: {userInfo.username} ({userInfo.tenant})
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 z-10">
        {/* Left Column: Login / Portal */}
        <div className="space-y-6">
          {!token ? (
            <div className="bg-[#0f0717] border border-red-500/30 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
              <div className="space-y-2 border-b border-red-500/20 pb-4">
                <h2 className="text-lg font-black uppercase text-white tracking-widest">
                  Agent Authentication Portal
                </h2>
                <p className="text-xs text-gray-400">
                  Restricted access. Use valid guest credentials to proceed.
                </p>
              </div>

              {/* Display Guest Credentials as per Challenge Specs */}
              <div className="p-4 rounded-2xl bg-[#170a24] border border-amber-500/30 space-y-1 text-xs">
                <span className="font-bold uppercase tracking-wider text-amber-400 block">
                  Public Guest Credentials:
                </span>
                <div className="font-mono text-gray-200">
                  Username: <code className="text-amber-300 font-bold">guest</code> | Password: <code className="text-amber-300 font-bold">guest123</code>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-widest text-red-400">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-[#07030b] border border-red-500/40 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-widest text-red-400">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#07030b] border border-red-500/40 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-red-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg"
                >
                  {loading ? "Authenticating..." : "Login to Protocol"}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-[#0f0717] border border-red-500/30 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl">
              <div className="space-y-2 border-b border-red-500/20 pb-4">
                <h2 className="text-lg font-black uppercase text-emerald-400 tracking-widest">
                  Authenticated Session
                </h2>
                <p className="text-xs text-gray-400">
                  Role: <span className="text-white font-bold">{userInfo?.username}</span> | Tenant: <span className="text-white font-bold">{userInfo?.tenant}</span>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 space-y-2 text-xs">
                <span className="font-bold text-red-400 uppercase tracking-widest block">
                  ACCESS LEVEL RESTRICTION:
                </span>
                <p className="text-gray-300 leading-relaxed">
                  Guests are restricted from viewing classified internal archives. Attempts to access internal API endpoints directly return 403 Forbidden.
                </p>
              </div>

              <button
                onClick={handleTestV2Archive}
                disabled={loading}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg"
              >
                {loading ? "Testing..." : "Test Request: /api/canon/v2/internal"}
              </button>

              <button
                onClick={() => {
                  setToken(null);
                  setUserInfo(null);
                  setApiLog(null);
                }}
                className="w-full py-2 border border-red-500/40 text-red-400 hover:text-white text-xs font-bold uppercase rounded-xl transition-all"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Console / API Output Log for Burp Analysis */}
        <div className="bg-[#07030b] border border-red-500/30 rounded-3xl p-6 md:p-8 space-y-4 shadow-2xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-red-400">
                HTTP Response Inspector
              </h3>
              <span className="text-[10px] text-gray-500 uppercase">Target: /api/canon/*</span>
            </div>

            {apiLog ? (
              <pre className="p-4 rounded-2xl bg-[#0d0515] border border-red-500/20 text-xs text-amber-300 whitespace-pre-wrap font-mono overflow-x-auto max-h-[360px]">
                {apiLog}
              </pre>
            ) : (
              <div className="text-center py-16 text-gray-600 text-xs italic font-medium">
                No active HTTP inspector logs. Login or inspect request traffic in Burp Suite.
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-[#12071d] border border-red-500/20 text-[11px] text-gray-400 space-y-1">
            <span className="font-bold text-white uppercase tracking-wider block">
              Burp Suite Interception Hint:
            </span>
            <p>
              Use Burp Suite Proxy & Repeater to capture and modify HTTP requests sent to <code className="text-red-300 font-bold">/api/canon/*</code>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
