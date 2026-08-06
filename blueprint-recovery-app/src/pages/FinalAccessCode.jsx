import React, { useState, useEffect } from 'react';
import { validateCheckpoint } from '../services/teamService';
import TvStaticBackground from '../components/TvStaticBackground';

/**
 * Screen 07: Final Access Code (07-final-access-code)
 * Enhanced Graphic Novel / Sci-Fi Tactical Authentication Interface.
 * Enhanced with 5-Second RGB Color Glitch Effect.
 */
export default function FinalAccessCode({ teamData, onSuccess }) {
  const teamNumber = teamData?.team_number;
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState('');
  const [isRejected, setIsRejected] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [rgbGlitch, setRgbGlitch] = useState(false);

  const rejectionLines = [
    'ACCESS DENIED — ENCRYPTION KEY MISMATCH',
    'UNAUTHORIZED OVERRIDE ATTEMPT LOGGED TO MONITOR',
    'INVALID KEYFRAME — RECONNECTING DECRYPTION STREAM...',
  ];

  // 5-Second RGB Color Glitch Loop
  useEffect(() => {
    const rgbInterval = setInterval(() => {
      setRgbGlitch(true);
      setTimeout(() => setRgbGlitch(false), 350);
    }, 5000);

    return () => clearInterval(rgbInterval);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!accessCode.trim() || !teamNumber) return;

    setLoading(true);
    setIsRejected(false);
    setRejectionMessage('');

    const { correct, updatedTeam, error } = await validateCheckpoint(teamNumber, 'B', accessCode);
    setLoading(false);

    if (error) {
      const randomLine = rejectionLines[Math.floor(Math.random() * rejectionLines.length)];
      setRejectionMessage(error || randomLine);
      setIsRejected(true);
      return;
    }

    if (!correct) {
      const randomLine = rejectionLines[Math.floor(Math.random() * rejectionLines.length)];
      setRejectionMessage(randomLine);
      setIsRejected(true);
      return;
    }

    // Success!
    setIsConfirmed(true);
    setTimeout(() => {
      onSuccess?.(updatedTeam);
    }, 400);
  }

  return (
    <div className={`bg-[#0a0a0a] text-[#e5e2e1] min-h-screen flex flex-col justify-between font-['Courier_Prime'] relative overflow-x-hidden transition-all ${rgbGlitch ? 'hue-rotate-90 saturate-200' : ''}`}>
      {/* Glitch & Stamp Keyframes */}
      <style>{`
        @keyframes glitchFlicker {
          0% { text-shadow: 2px 0 #00fbfb, -2px 0 #ff00ff; }
          25% { text-shadow: -2px 0 #00fbfb, 2px 0 #ff00ff; }
          50% { text-shadow: 1px 0 #ff00ff, -1px 0 #00fbfb; }
          75% { text-shadow: -2px 0 #ff00ff, 2px 0 #00fbfb; }
          100% { text-shadow: 2px 0 #00fbfb, -2px 0 #ff00ff; }
        }
        @keyframes stampImpact {
          0% { transform: translate(-50%, -50%) scale(3) rotate(-20deg); opacity: 0; }
          70% { transform: translate(-50%, -50%) scale(0.9) rotate(-8deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1) rotate(-12deg); opacity: 1; }
        }
        @keyframes stampImpactConfirmed {
          0% { transform: translate(-50%, -50%) scale(3) rotate(20deg); opacity: 0; }
          70% { transform: translate(-50%, -50%) scale(0.9) rotate(-4deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1) rotate(-6deg); opacity: 1; }
        }
        .animate-glitch-text {
          animation: glitchFlicker 3s infinite alternate;
        }
        .animate-stamp-rejected {
          animation: stampImpact 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .animate-stamp-confirmed {
          animation: stampImpactConfirmed 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .cyber-grid {
          background-image: radial-gradient(circle at 50% 50%, rgba(0, 251, 251, 0.08) 0%, transparent 60%),
                            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 100% 100%, 32px 32px, 32px 32px;
        }
      `}</style>

      {/* Background Layer 1: Live Analog TV Static */}
      <TvStaticBackground />

      {/* Background Layer 2: Cyber Grid */}
      <div className="fixed inset-0 cyber-grid pointer-events-none z-0"></div>

      {/* Background Layer 3: Scanlines & CRT Noise Overlay */}
      <div className="fixed inset-0 scanlines pointer-events-none z-40 opacity-75"></div>
      <div className="fixed inset-0 noise pointer-events-none z-41 opacity-10"></div>

      {/* 5-Second RGB Color Glitch Burst Overlay */}
      {rgbGlitch && (
        <>
          <div className="fixed inset-0 z-50 pointer-events-none mix-blend-screen opacity-90 transition-all duration-75 animate-pulse bg-[linear-gradient(90deg,rgba(255,0,85,0.3)_0%,rgba(0,251,251,0.3)_100%)] shadow-[inset_0_0_100px_rgba(255,0,85,0.5)]"></div>
          <div className="fixed inset-0 z-51 pointer-events-none mix-blend-color-dodge opacity-80 backdrop-invert-[0.15] translate-x-[4px] -translate-y-[2px]"></div>
        </>
      )}

      {/* Top Header — Transparent & Seamlessly Blended */}
      <header className="relative z-50 w-full px-6 py-3.5 flex justify-between items-center bg-transparent backdrop-blur-sm bg-gradient-to-b from-[#141313]/70 via-[#141313]/30 to-transparent border-b border-[#ffffff]/10 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#00fbfb] animate-pulse">lock</span>
          <span className={`font-['Anton'] text-xl md:text-2xl text-[#ffffff] uppercase tracking-wider transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
            BLUEPRINT RECOVERY
          </span>
        </div>
        <div className="flex items-center gap-4 text-[#ffffff] font-['Space_Mono'] text-xs">
          <span className="hidden sm:inline-block px-2.5 py-1 bg-[#00fbfb]/10 border border-[#00fbfb]/30 text-[#00fbfb] font-bold uppercase tracking-widest">
            AUTHENTICATION // PROTOCOL_B
          </span>
          <span className="material-symbols-outlined text-[#00fbfb]">terminal</span>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-grow pt-20 pb-16 px-4 sm:px-6 relative z-20 flex items-center justify-center my-auto">
        {/* Manila Intel File Dossier */}
        <div className={`relative w-full max-w-2xl bg-[#C2B280] text-[#141313] p-6 sm:p-8 md:p-10 border-4 border-[#141313] shadow-[0_20px_60px_rgba(0,0,0,0.9)] transform rotate-1 transition-all ${rgbGlitch ? 'border-[#00fbfb] shadow-[0_0_35px_rgba(255,0,85,0.8)] translate-x-[2px] -translate-y-[2px]' : ''}`}>
          
          {/* Manila Envelope Header Tab */}
          <div className="absolute -top-10 left-0 bg-[#C2B280] h-10 px-5 border-t-4 border-l-4 border-r-4 border-[#141313] flex items-center shadow-md">
            <span className="font-['Space_Mono'] text-xs md:text-sm font-bold text-[#141313] tracking-tight uppercase">
              DOC_ID: 884-A // SECURITY OVERRIDE
            </span>
          </div>

          {/* Top Redaction Bar */}
          <div className="w-full h-5 bg-[#141313] mb-6 shadow-sm"></div>

          {/* Headline */}
          <h1 className={`font-['Anton'] text-4xl sm:text-5xl md:text-6xl text-[#141313] uppercase mb-2 tracking-widest animate-glitch-text transition-all ${rgbGlitch ? '[text-shadow:-6px_0_#ff0055,6px_0_#00fbfb]' : ''}`}>
            FINAL_ACCESS
          </h1>
          <p className="font-['Courier_Prime'] text-xs sm:text-sm md:text-base text-[#141313]/90 mb-6 max-w-lg leading-relaxed font-bold">
            INPUT REQUIRED. ALL PREVIOUS ATTEMPTS LOGGED. UNAUTHORIZED ACCESS WILL RESULT IN IMMEDIATE PROTOCOL RESET.
          </p>

          {/* Rejection Alert Banner */}
          {isRejected && (
            <div className="mb-6 p-3.5 border-3 border-[#ff00ff] bg-[#141313] text-[#ff00ff] font-['Space_Mono'] text-xs font-bold uppercase tracking-wider shadow-[4px_4px_0_0_#ff00ff] animate-pulse">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">gpp_bad</span>
                <span>{rejectionMessage}</span>
              </div>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            {/* Terminal Input Box */}
            <div className={`relative w-full max-w-md h-16 border-4 border-[#141313] bg-[#0e0e0e] flex items-center px-4 shadow-inner group focus-within:border-[#00fbfb] focus-within:shadow-[0_0_25px_rgba(0,251,251,0.5)] transition-all ${rgbGlitch ? 'border-[#ff0055]' : ''}`}>
              {/* Corner Brackets */}
              <div className="absolute top-1 left-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">[</div>
              <div className="absolute top-1 right-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">]</div>
              <div className="absolute bottom-1 left-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">[</div>
              <div className="absolute bottom-1 right-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">]</div>

              <span className="text-[#00fbfb] font-mono text-xl mr-3 font-bold animate-pulse">&gt;</span>
              <input
                type="text"
                autoComplete="off"
                spellCheck="false"
                maxLength={16}
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="ENTER ACCESS CODE"
                className="w-full bg-transparent text-[#00fbfb] font-['Space_Mono'] text-lg sm:text-xl font-bold tracking-widest outline-none uppercase placeholder-[#00fbfb]/40"
                disabled={loading}
              />
            </div>

            {/* Execute Button */}
            <button
              type="submit"
              disabled={loading}
              className={`px-8 py-3.5 bg-[#00fbfb] text-[#000000] border-4 border-[#ffffff] font-['Anton'] text-xl md:text-2xl uppercase tracking-wider shadow-[4px_4px_0_0_#ff00ff] hover:bg-[#ffffff] hover:text-[#141313] hover:shadow-[4px_4px_0_0_#00fbfb] hover:-translate-y-0.5 active:translate-y-0.5 transition-all transform cursor-pointer select-none disabled:opacity-50 ${rgbGlitch ? 'border-[#00fbfb] text-[#00fbfb] bg-[#141313]' : ''}`}
            >
              {loading ? 'EXECUTING...' : 'EXECUTE'}
            </button>
          </form>

          {/* Animated REJECTED Stamp Slam */}
          {isRejected && (
            <div className="absolute top-1/2 left-1/2 pointer-events-none z-30 animate-stamp-rejected">
              <div className="border-4 border-[#ff00ff] text-[#ff00ff] font-['Anton'] text-4xl sm:text-5xl md:text-6xl px-6 py-2 uppercase tracking-widest bg-[#0e0e0e] shadow-[0_0_30px_rgba(255,0,255,0.8)] border-dashed transform -rotate-12">
                REJECTED
              </div>
            </div>
          )}

          {/* Animated CONFIRMED Stamp Slam */}
          {isConfirmed && (
            <div className="absolute top-1/2 left-1/2 pointer-events-none z-30 animate-stamp-confirmed">
              <div className="border-4 border-[#00fbfb] text-[#00fbfb] font-['Anton'] text-4xl sm:text-5xl md:text-6xl px-6 py-2 uppercase tracking-widest bg-[#0e0e0e] shadow-[0_0_30px_rgba(0,251,251,0.9)] border-dashed transform -rotate-6">
                CONFIRMED
              </div>
            </div>
          )}

          {/* Case File Stamp */}
          <div className="absolute bottom-4 right-4 text-xs font-['Space_Mono'] text-[#141313]/60 uppercase font-bold">
            CONFIDENTIAL // SECTOR_DECRYPTION
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-50 w-full px-6 py-2 flex justify-between items-center bg-[#141313] border-t border-[#ffffff]/10 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // PROTOCOL: FINAL_ACCESS</div>
        <div>TEAM #{teamNumber || '?'}</div>
      </footer>
    </div>
  );
}
