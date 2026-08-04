"use client";

import { useEffect, useState, useRef } from "react";

const FLAG = "SPIDEY{fr0nt3nd_s3cr3ts_4r3_n0t_s3cr3ts}";

async function otpForWindow(secretB64: string, windowIdx: number): Promise<string> {
  const decoded = atob(secretB64);
  const message = decoded + windowIdx;
  const buf = new TextEncoder().encode(message);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tail = hex.slice(-6);
  return (parseInt(tail, 16) % 1000000).toString().padStart(6, "0");
}

// Accept the OTP for the current window OR the previous window, so a
// solver isn't punished if they cross a 30-second boundary between
// reading their tool and hitting Verify.
async function validOtps(secretB64: string): Promise<string[]> {
  const w = Math.floor(Date.now() / 30000);
  const [now, prev] = await Promise.all([
    otpForWindow(secretB64, w),
    otpForWindow(secretB64, w - 1),
  ]);
  return [now, prev];
}

export default function SpiderOtpRace() {
  const [screen, setScreen] = useState<"login" | "otp" | "success">("login");
  const [agent, setAgent] = useState("");
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const secretRef = useRef<string>("U1BJREVSX1NPQ0lFVFlfMjAyNg==");

  // Load the "leaked" login.js — makes it visible in the Network tab
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "/challenges/medium-02/login.js";
    s.async = true;
    document.body.appendChild(s);
    return () => {
      try { document.body.removeChild(s); } catch {}
    };
  }, []);

  // Live 30-second window countdown
  useEffect(() => {
    if (screen !== "otp") return;
    const tick = () => {
      const now = Date.now();
      const remaining = 30 - Math.floor((now % 30000) / 1000);
      setCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [screen]);

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!agent.trim()) return;
    setScreen("otp");
    setFeedback(null);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const submitted = otp.trim();
    if (!/^\d{6}$/.test(submitted)) {
      setFeedback({ ok: false, msg: "OTP must be exactly 6 digits." });
      return;
    }
    setVerifying(true);
    try {
      const accepted = await validOtps(secretRef.current);
      if (accepted.includes(submitted)) {
        setScreen("success");
        setFeedback(null);
      } else {
        setFeedback({
          ok: false,
          msg: "ACCESS DENIED. Invalid OTP. Please try again before the next authentication window expires.",
        });
        setOtp("");
      }
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="border border-red-500/40 bg-[#0c0617] rounded-3xl overflow-hidden shadow-2xl font-mono">
      {/* Header */}
      <div className="bg-[#140821] border-b border-red-500/30 px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-600/80 border border-red-500 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400 inline-block" />
          </div>
          <span className="font-black tracking-wider text-white text-xs uppercase italic flex items-center gap-2">
            <span className="text-red-500">SPIDER</span> SOCIETY
          </span>
        </div>
        {screen === "otp" && (
          <div className="px-2.5 py-1 rounded-lg border border-amber-500/50 bg-amber-950 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
            OTP EXPIRES IN {countdown.toString().padStart(2, "0")}s
          </div>
        )}
      </div>

      <div className="p-6 md:p-10 bg-[#090312] min-h-[360px] flex items-center justify-center">
        {screen === "login" && (
          <form onSubmit={handleContinue} className="w-full max-w-md space-y-5">
            <div className="text-center space-y-2">
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-white">
                SPIDER SOCIETY LOGIN
              </h3>
              <p className="text-xs text-gray-400 uppercase tracking-widest">
                Authentication Portal v0.1
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-red-400">
                Agent Name
              </label>
              <input
                type="text"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="e.g. Miles Morales"
                className="w-full bg-[#06020a] border border-red-500/30 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-all font-mono"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!agent.trim()}
              className="w-full px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all disabled:opacity-40"
            >
              Continue
            </button>
          </form>
        )}

        {screen === "otp" && (
          <form onSubmit={handleVerify} className="w-full max-w-md space-y-5">
            <div className="text-center space-y-2">
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-white">
                OTP Verification
              </h3>
              <p className="text-xs text-gray-400">
                Agent: <span className="text-red-300 font-bold">{agent}</span>
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-red-400">
                Enter 6-digit OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className="w-full bg-[#06020a] border border-red-500/30 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] text-white placeholder-gray-600 focus:outline-none focus:border-red-500 transition-all font-mono"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={verifying || otp.length !== 6}
              className="w-full px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all disabled:opacity-40"
            >
              {verifying ? "Verifying..." : "Verify"}
            </button>
            {feedback && !feedback.ok && (
              <div className="p-3 rounded-xl bg-red-950 border border-red-500/50 text-red-300 text-xs font-bold text-center whitespace-pre-line">
                {feedback.msg}
              </div>
            )}
          </form>
        )}

        {screen === "success" && (
          <div className="w-full max-w-md space-y-5 text-center">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-950 border border-emerald-500/60 flex items-center justify-center text-emerald-400 text-3xl font-black">
              ✓
            </div>
            <h3 className="text-xl md:text-2xl font-black uppercase tracking-widest text-emerald-300">
              Authentication Successful
            </h3>
            <p className="text-sm text-gray-300">
              Welcome Agent <span className="text-emerald-300 font-bold">{agent}</span>
            </p>
            <div className="p-4 rounded-xl bg-[#06020a] border border-emerald-500/50 text-emerald-300 text-sm md:text-base font-mono font-bold break-all">
              {FLAG}
            </div>
            <p className="text-[11px] uppercase tracking-widest text-gray-500">
              Copy this flag and submit it in the submission box below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
