"use client";

import { useState } from "react";

interface DataFragment {
  encoded: string;
  isReal: boolean;
}

// Pool of data fragments: Real meaningful parts + Decoy non-meaningful junk
const FRAGMENT_POOL: DataFragment[] = [
  // Real meaningful fragments of SPIDER{frontend_will_not_have_secrets}
  { encoded: "U1BJREVSe2Zyb250ZW5kXw==", isReal: true },
  { encoded: "d2lsbF9ub3Rf", isReal: true },
  { encoded: "aGF2ZV8=", isReal: true },
  { encoded: "c2VjcmV0c30=", isReal: true },

  // Decoy non-meaningful / junk fragments
  { encoded: "YWxzZGtqZl9jb3JydXB0", isReal: false },
  { encoded: "eDg5X2p1bmtfOTI=", isReal: false },
];

export default function SpiderOtpRace() {
  const [currentOtp, setCurrentOtp] = useState<string | null>(null);
  const [inputOtp, setInputOtp] = useState("");
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Store ONLY the single most recently revealed code fragment
  const [activeRevealedCode, setActiveRevealedCode] = useState<string | null>(null);

  async function handleGenerateOtp() {
    setGenerating(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/ctf/otp?t=${Date.now()}`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.generated_otp) {
        setCurrentOtp(json.generated_otp);
        setStatus({
          ok: true,
          msg: "[!] OTP code generated successfully.\nLocate your OTP token to verify your identity.",
        });
      } else {
        setStatus({ ok: false, msg: "Failed to generate OTP. Please try again." });
      }
    } catch {
      setStatus({ ok: false, msg: "Error requesting OTP." });
    } finally {
      setGenerating(false);
    }
  }

  function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const entered = inputOtp.trim();
    if (!entered) return;

    if (!currentOtp) {
      setStatus({ ok: false, msg: "Please click 'Generate OTP' first to request an OTP token." });
      return;
    }

    setVerifying(true);

    if (entered === currentOtp) {
      // Pick a random fragment from the pool (real or decoy)
      const randomIndex = Math.floor(Math.random() * FRAGMENT_POOL.length);
      const selectedFragment = FRAGMENT_POOL[randomIndex];

      // Overwrite/replace the displayed revealed code with the new one
      setActiveRevealedCode(selectedFragment.encoded);
      setCurrentOtp(null);
      setInputOtp("");

      setStatus({
        ok: true,
        msg: "[✓] OTP VERIFIED! Decrypted Data Fragment Retrieved.\nCheck the output display below for your new revealed code.",
      });
    } else {
      setStatus({
        ok: false,
        msg: "[×] INVALID OTP! Please verify using the correct 6-digit OTP token.",
      });
      setInputOtp("");
    }
    setVerifying(false);
  }

  return (
    <div className="border border-red-500/40 bg-[#0c0617] rounded-3xl overflow-hidden shadow-2xl font-mono text-gray-100 space-y-0">
      {/* Top Console Header */}
      <div className="bg-[#140821] border-b border-red-500/30 px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-600/80 border border-red-500 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400 inline-block" />
          </div>
          <span className="font-black tracking-wider text-white text-xs uppercase italic flex items-center gap-2 font-avengeance">
            <span className="text-red-500">SPIDER</span> OTP RECOVERER
          </span>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6 bg-[#090312]">
        {/* Step 1: Generate OTP Section */}
        <div className="p-5 rounded-2xl bg-[#12071d] border border-red-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                Step 1: Generate OTP Code
              </h4>
              <p className="text-xs text-gray-400 mt-1">
                Click below to generate a new 6-digit verification OTP.
              </p>
            </div>
            <button
              onClick={handleGenerateOtp}
              disabled={generating}
              className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-red-600/30 disabled:opacity-50 whitespace-nowrap"
            >
              {generating ? "Generating..." : "Generate OTP"}
            </button>
          </div>
        </div>

        {/* Step 2: Input & Verify OTP Section */}
        <form onSubmit={handleVerifyOtp} className="p-5 rounded-2xl bg-[#12071d] border border-red-500/30 space-y-4">
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-white">
              Step 2: Enter OTP Token
            </h4>
            <p className="text-xs text-gray-400 mt-1">
              Enter the 6-digit OTP token to retrieve an encoded data fragment.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={inputOtp}
              onChange={(e) => setInputOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              maxLength={6}
              className="flex-1 bg-[#06020a] border border-red-500/40 rounded-xl px-4 py-3 text-center text-xl font-bold tracking-[0.3em] text-white placeholder-gray-600 focus:outline-none focus:border-red-500 transition-all font-mono"
            />
            <button
              type="submit"
              disabled={verifying || inputOtp.length !== 6}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all disabled:opacity-40 whitespace-nowrap"
            >
              {verifying ? "Verifying..." : "Verify OTP"}
            </button>
          </div>
        </form>

        {/* Feedback / Notification Banner */}
        {status && (
          <div
            className={`p-4 rounded-xl border text-xs font-bold whitespace-pre-line leading-relaxed ${status.ok
              ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-200"
              : "bg-red-950/80 border-red-500/60 text-red-200"
              }`}
          >
            {status.msg}
          </div>
        )}

        {/* Output Display - Shows ONLY the single active revealed code */}
        <div className="p-5 rounded-2xl bg-[#07030b] border border-red-500/20 space-y-4">
          <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-red-400">
              Decrypted Data Output
            </h4>
          </div>

          {!activeRevealedCode ? (
            <div className="text-center py-6 text-gray-600 text-xs italic font-medium">
              No data fragment unlocked yet. Generate an OTP and verify to retrieve data.
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#12071d] border border-red-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">
                  Revealed Code Fragment:
                </span>
                <span className="text-base font-mono font-bold text-amber-300 select-all tracking-wider block">
                  {activeRevealedCode}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
