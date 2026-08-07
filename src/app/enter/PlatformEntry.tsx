"use client";

import { useState } from "react";
import SpiderBackgroundFX from "@/components/SpiderBackgroundFX";
import { eventFromHost, type EventKey } from "@/lib/config";
import { safeRedirectTarget } from "@/lib/auth/safeRedirect";

/**
 * Where to send a participant who logged in with no usable `?rt=`.
 *
 * This form is served on every non-quiz host — ctf, hunt, code, and the
 * path-based deployments — so the destination cannot be a fixed path. It used
 * to be the literal "/ctf", which meant a hunt participant who logged in was
 * sent to the CTF: on hunt.<domain> the proxy rewrote /ctf into /hunt/ctf,
 * which does not exist, so a correct login ended on a 404.
 *
 * When the host names an event, "/" is the answer — the proxy rewrites it into
 * that event's route group. Only the neutral app/www/localhost hosts, where "/"
 * is the platform landing page rather than an event, keep /ctf.
 */
function postLoginPath(): string {
  return eventFromHost(window.location.hostname) ? "/" : "/ctf";
}

/**
 * What this form calls itself, per event.
 *
 * One form serves the CTF, the hunt and the code event — they post the same
 * body, so splitting the component would duplicate the logic to change two
 * strings. But it was hardcoded to the CTF's, so a treasure hunt entrant who
 * typed hunt.<domain> was told they had reached the "Cyber Security & CTF
 * Arena" and asked for credentials "to access the CTF arena". Nothing was
 * broken — the login worked and led to the hunt — but every participant's first
 * impression was that they were in the wrong place, and reporting that as "the
 * hunt shows the CTF page" is the correct read of what it says.
 *
 * The event comes from the server component, which already resolves it from the
 * Host header. Deriving it here from window.location would render the wrong
 * copy on the server and swap it after hydration.
 */
const EVENT_COPY: Record<string, { tagline: string; prompt: string }> = {
  hunt: {
    tagline: "Treasure Hunt Arena",
    prompt: "Enter your team credentials to start the hunt",
  },
  ctf: {
    tagline: "Cyber Security & CTF Arena",
    prompt: "Enter your team credentials to access the CTF arena",
  },
  code: {
    tagline: "Code Arena",
    prompt: "Enter your team credentials to enter the code arena",
  },
  // Path-based deployments (localhost, ngrok) have no subdomain to read, so the
  // form cannot know which event the participant is here for.
  default: {
    tagline: "Symposium Arena",
    prompt: "Enter your team credentials to continue",
  },
};

export default function PlatformEntry({ event }: { event: EventKey | null }) {
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

      // `rt` arrives as an ABSOLUTE url. proxy.ts builds it as
      // `${origin}${pathname}${search}` so the bounce survives the subdomain
      // the request came in on, e.g.
      //   /enter?rt=https://hunt.example.com/universe
      //
      // The check here used to be `rawRt.startsWith("/")`, which an absolute
      // url never satisfies — so every rt was silently discarded and every
      // login went to the fallback, whichever page the participant had actually
      // asked for. Combined with that fallback being "/ctf", a hunt
      // participant who clicked a link to /universe was bounced to login and
      // then landed on a 404 with no way back.
      //
      // safeRedirectTarget parses it properly and enforces what the hand-rolled
      // check was reaching for: same-origin only, no /admin, and it returns
      // pathname + search so the host cannot be swapped underneath us.
      const rawRt = new URLSearchParams(window.location.search).get("rt");
      window.location.href = safeRedirectTarget(rawRt, window.location.origin, postLoginPath());
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
          {EVENT_COPY[event ?? "default"].tagline}
        </p>
      </div>

      {/* Card Container */}
      <div className="w-full max-w-md bg-[#0d0716] border border-red-500/30 rounded-3xl p-6 md:p-8 shadow-xl relative z-10 overflow-hidden">
        <div className="mb-6 pb-4 border-b border-red-500/20 text-center">
          <h2 className="text-lg font-black uppercase tracking-wider text-white">
            Participant Portal
          </h2>
          <p className="text-xs text-gray-400 mt-1 font-medium">
            {EVENT_COPY[event ?? "default"].prompt}
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

