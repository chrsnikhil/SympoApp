import React, { useState, useEffect } from 'react';
import { markReadyForReveal, getTeamByNumber } from '../services/teamService';
import { supabase } from '../lib/supabaseClient';

/**
 * Screen 05: Evidence Secured (05-evidence-secured)
 * Team has physically assembled their puzzle.
 * Action: "I'VE SOLVED IT — NOTIFY COORDINATOR"
 * Enhanced with 5-Second RGB Color Glitch Effect.
 */
export default function EvidenceSecured({ teamData, onRevealUnlocked }) {
  const teamNumber = teamData?.team_number;
  const isAlreadyAwaiting = teamData?.status === 'awaiting_reveal';

  const [awaiting, setAwaiting] = useState(isAlreadyAwaiting);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [rgbGlitch, setRgbGlitch] = useState(false);

  const effectiveTeamNum = teamNumber || (typeof window !== 'undefined' ? parseInt(localStorage.getItem('blueprint_team_number') || '1', 10) : 1);

  // 5-Second RGB Color Glitch Loop
  useEffect(() => {
    const rgbInterval = setInterval(() => {
      setRgbGlitch(true);
      setTimeout(() => setRgbGlitch(false), 350);
    }, 5000);

    return () => clearInterval(rgbInterval);
  }, []);

  // Handle "I'VE SOLVED IT — NOTIFY COORDINATOR" click
  async function handleNotify() {
    setLoading(true);
    setErrorMsg('');
    setAwaiting(true);

    try {
      const { data, error } = await markReadyForReveal(effectiveTeamNum);
      if (error) {
        console.warn('[handleNotify] DB notice:', error);
      }
    } catch (err) {
      console.warn('[handleNotify] Error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Poll & subscribe to Supabase team status changes — ONLY auto-advances when awaiting is true
  useEffect(() => {
    if (!effectiveTeamNum || !awaiting) return;

    // Check status in DB when team is in transmitting/awaiting state
    async function checkStatus() {
      const { data } = await getTeamByNumber(effectiveTeamNum);
      if (data && (data.status === 'checkpoint_a_done' || data.status === 'complete')) {
        onRevealUnlocked?.(data);
      }
    }

    checkStatus();

    // Setup polling every 2s as reliable fallback
    const interval = setInterval(checkStatus, 2000);

    // Setup Realtime subscription
    const channel = supabase
      .channel(`team-${effectiveTeamNum}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `team_number=eq.${effectiveTeamNum}` },
        (payload) => {
          const updated = payload.new;
          if (updated && (updated.status === 'checkpoint_a_done' || updated.status === 'complete')) {
            onRevealUnlocked?.(updated);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [effectiveTeamNum, awaiting, onRevealUnlocked]);

  return (
    <div className={`bg-[#050505] text-[#e5e2e1] min-h-screen flex flex-col justify-between font-['Courier_Prime'] relative overflow-x-hidden transition-all ${rgbGlitch ? 'hue-rotate-90 saturate-200' : ''}`}>
      {/* Scanline Overlay */}
      <div className="fixed inset-0 scanlines pointer-events-none z-10"></div>

      {/* 5-Second RGB Color Glitch Burst Overlay */}
      {rgbGlitch && (
        <>
          <div className="fixed inset-0 z-50 pointer-events-none mix-blend-screen opacity-90 transition-all duration-75 animate-pulse bg-[linear-gradient(90deg,rgba(255,0,85,0.3)_0%,rgba(0,251,251,0.3)_100%)] shadow-[inset_0_0_100px_rgba(255,0,85,0.5)]"></div>
          <div className="fixed inset-0 z-51 pointer-events-none mix-blend-color-dodge opacity-80 backdrop-invert-[0.15] translate-x-[4px] -translate-y-[2px]"></div>
        </>
      )}

      {/* Header — Transparent & Seamlessly Blended */}
      <header className="relative z-20 w-full px-6 py-4 flex justify-between items-center bg-transparent backdrop-blur-sm bg-gradient-to-b from-[#141313]/70 via-[#141313]/30 to-transparent border-b border-[#ffffff]/10">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00fbfb]">terminal</span>
          <span className={`font-[#Anton'] text-xl uppercase text-[#00fbfb] tracking-tight transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
            FIELD COMMS
          </span>
        </div>
        <div className="font-['Space_Mono'] text-xs text-[#8e9192] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00fbfb] inline-block animate-pulse"></span>
          SECURE LINK ACTIVE
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow relative z-20 flex flex-col items-center justify-center p-6 w-full max-w-4xl mx-auto">
        <div className="w-full flex flex-col items-center gap-8">
          {/* Status Panel */}
          <div className={`w-full p-6 md:p-8 bg-[#131313] border-4 border-[#e5e2e1] transform rotate-1 flex flex-col items-start gap-4 shadow-xl transition-all ${rgbGlitch ? 'border-[#00fbfb] shadow-[0_0_30px_rgba(255,0,85,0.7)] translate-x-[2px] -translate-y-[2px]' : ''}`}>
            <div className="flex items-center gap-3 w-full border-b-2 border-[#353434] pb-3">
              <span className="material-symbols-outlined text-[#8e9192] text-3xl">folder_special</span>
              <h2 className={`font-['Anton'] text-2xl md:text-3xl uppercase tracking-wider text-[#e5e2e1] transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
                CASE FILE: OPEN
              </h2>
            </div>
            <div className="font-['Courier_Prime'] text-base md:text-lg text-[#c4c7c8] leading-relaxed">
              SOLVE YOUR SECTOR'S PHYSICAL PUZZLE USING THE EVIDENCE ENVELOPE PROVIDED.
              <br /><br />
              <span className="text-[#00fbfb] font-bold">&gt; ONCE FULLY ASSEMBLED, CLICK THE BUTTON BELOW TO NOTIFY THE COORDINATOR.</span>
            </div>
          </div>

          {/* Action Button or Waiting State */}
          {!awaiting ? (
            <div className="w-full flex flex-col items-center py-6">
              {errorMsg && (
                <div className="mb-4 p-3 border-2 border-[#ffb4ab] bg-[#93000a]/20 text-[#ffb4ab] font-['Space_Mono'] text-xs uppercase">
                  {errorMsg}
                </div>
              )}
              <button
                onClick={handleNotify}
                disabled={loading}
                className={`w-full max-w-2xl px-8 py-6 border-4 border-[#e5e2e1] bg-transparent text-[#e5e2e1] font-['Anton'] text-2xl md:text-4xl uppercase tracking-wider flex items-center justify-center gap-4 hover:bg-[#e5e2e1] hover:text-[#131313] hover:shadow-[4px_4px_0_0_#00fbfb] transition-all transform hover:-rotate-1 disabled:opacity-50 ${rgbGlitch ? 'border-[#00fbfb] text-[#00fbfb] bg-[#141313] shadow-[0_0_20px_rgba(255,0,85,0.8)]' : ''}`}
              >
                <span className="material-symbols-outlined text-4xl">check_circle</span>
                {loading ? 'TRANSMITTING...' : '"I\'VE SOLVED IT — NOTIFY COORDINATOR"'}
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center gap-6 py-6 text-center">
              <style>{`
                @keyframes radarSweep {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(200%); }
                }
                @keyframes spinSlow {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                @keyframes spinReverse {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(0deg); }
                }
                .animate-radar-sweep {
                  animation: radarSweep 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                .animate-spin-slow {
                  animation: spinSlow 8s linear infinite;
                }
                .animate-spin-reverse {
                  animation: spinReverse 5s linear infinite;
                }
              `}</style>

              {/* Multi-Ring Tactical Radar & Pulse Waves */}
              <div className="relative w-36 h-36 flex items-center justify-center my-2">
                {/* Sonar Signal Pulse Waves */}
                <div className="absolute inset-0 rounded-full border-2 border-[#00fbfb]/60 animate-ping" style={{ animationDuration: '2s' }}></div>
                <div className="absolute -inset-3 rounded-full border border-[#00fbfb]/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.6s' }}></div>

                {/* Outer Rotating Tactical Rings */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#00fbfb]/80 animate-spin-slow"></div>
                <div className="absolute inset-2 rounded-full border border-dashed border-[#ff00ff]/60 animate-spin-reverse"></div>
                <div className="absolute inset-4 rounded-full border border-[#00fbfb]/30"></div>

                {/* Radar Grid Crosshairs */}
                <div className="absolute w-full h-[1px] bg-[#00fbfb]/30"></div>
                <div className="absolute h-full w-[1px] bg-[#00fbfb]/30"></div>

                {/* Glowing Center Transmitter Core */}
                <div className={`relative z-10 w-20 h-20 rounded-full bg-[#00fbfb]/15 border-2 border-[#00fbfb] shadow-[0_0_30px_rgba(0,251,251,0.6)] flex items-center justify-center backdrop-blur-sm transition-all ${rgbGlitch ? 'border-[#ff0055] shadow-[0_0_40px_rgba(255,0,85,0.9)] scale-110' : ''}`}>
                  <span className="material-symbols-outlined text-4xl text-[#00fbfb] animate-pulse">
                    radar
                  </span>
                </div>
              </div>

              {/* Transmission Telemetry */}
              <div className="flex flex-col items-center gap-2.5 max-w-lg">
                <div className="flex items-center gap-2 font-['Space_Mono'] text-xs text-[#00fbfb] tracking-widest uppercase bg-[#00fbfb]/10 px-3.5 py-1 border border-[#00fbfb]/40 shadow-[0_0_10px_rgba(0,251,251,0.2)]">
                  <span className="w-2 h-2 rounded-full bg-[#00fbfb] animate-ping"></span>
                  ENCRYPTED SIGNAL HANDSHAKE ACTIVE
                </div>

                <h3 className={`font-['Anton'] text-2xl md:text-4xl uppercase text-[#ffffff] tracking-wider drop-shadow-[0_0_12px_rgba(0,251,251,0.5)] transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
                  TRANSMITTING TO COORDINATOR...
                </h3>

                <p className="font-['Space_Mono'] text-xs text-[#8e9192]">
                  AWAITING IN-PERSON REVEAL CONFIRMATION <span className="animate-pulse text-[#00fbfb] font-bold">_</span>
                </p>
              </div>

              {/* Sweeping Scanner Progress Bar & Simulation Option */}
              <div className="w-full max-w-md bg-[#0e0e0e] border-2 border-[#00fbfb]/50 p-1 relative overflow-hidden shadow-[0_0_15px_rgba(0,251,251,0.25)]">
                <div className="h-2.5 bg-[#141313] w-full relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00fbfb] to-transparent w-2/3 animate-radar-sweep"></div>
                </div>
              </div>

              {/* Demo / Manual Reveal Bypass Button */}
              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => onRevealUnlocked?.({ team_number: effectiveTeamNum, status: 'checkpoint_a_done' })}
                  className="px-4 py-2 bg-[#00fbfb]/10 border border-[#00fbfb]/40 text-[#00fbfb] font-['Space_Mono'] text-xs font-bold uppercase tracking-wider hover:bg-[#00fbfb] hover:text-[#0e0e0e] transition-all cursor-pointer"
                >
                  &gt; REVEAL LOCATION (SIMULATE COORDINATOR APPROVAL) &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 w-full px-6 py-2 flex justify-between items-center border-t border-[#ffffff]/10 bg-[#141313] font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // STATUS: {awaiting ? 'AWAITING_REVEAL' : 'PUZZLE_SOLVED'}</div>
        <div className="flex gap-4">
          <span className="text-[#00fbfb] font-bold">TEAM #{effectiveTeamNum}</span>
        </div>
      </footer>
    </div>
  );
}
