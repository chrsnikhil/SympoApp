import React, { useState, useEffect } from 'react';
import { getRevealedLocation } from '../services/teamService';
import TvStaticBackground from '../components/TvStaticBackground';

/**
 * Screen 06: Venue Reveal (06-venue-reveal)
 * Enhanced Graphic Novel / Sci-Fi Tactical Intel Screen.
 * Enhanced with 5-Second RGB Color Glitch Effect.
 */
export default function VenueReveal({ teamData, onProceed }) {
  const teamNumber = teamData?.team_number;
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [stampVisible, setStampVisible] = useState(false);
  const [rgbGlitch, setRgbGlitch] = useState(false);

  // 5-Second RGB Color Glitch Loop
  useEffect(() => {
    const rgbInterval = setInterval(() => {
      setRgbGlitch(true);
      setTimeout(() => setRgbGlitch(false), 350);
    }, 5000);

    return () => clearInterval(rgbInterval);
  }, []);

  useEffect(() => {
    async function fetchLocation() {
      if (!teamNumber) return;
      setLoading(true);
      const { location } = await getRevealedLocation(teamNumber);
      setLocationName(location || 'INSPECTION POINT');
      setLoading(false);
    }

    fetchLocation();

    const stampTimer = setTimeout(() => {
      setStampVisible(true);
    }, 500);

    return () => clearTimeout(stampTimer);
  }, [teamNumber]);

  return (
    <div className={`bg-[#0a0a0a] text-[#e5e2e1] min-h-screen flex flex-col justify-between font-['Courier_Prime'] relative overflow-x-hidden transition-all ${rgbGlitch ? 'hue-rotate-90 saturate-200' : ''}`}>
      {/* Custom CSS Glitch & Slam Keyframes */}
      <style>{`
        @keyframes glitchFlicker {
          0% { text-shadow: 2px 0 #00fbfb, -2px 0 #ff00ff; }
          25% { text-shadow: -2px 0 #00fbfb, 2px 0 #ff00ff; }
          50% { text-shadow: 1px 0 #ff00ff, -1px 0 #00fbfb; }
          75% { text-shadow: -2px 0 #ff00ff, 2px 0 #00fbfb; }
          100% { text-shadow: 2px 0 #00fbfb, -2px 0 #ff00ff; }
        }
        @keyframes stampImpact {
          0% { transform: scale(3) rotate(28deg); opacity: 0; }
          70% { transform: scale(0.9) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(12deg); opacity: 1; }
        }
        .animate-glitch-text {
          animation: glitchFlicker 3s infinite alternate;
        }
        .animate-stamp-impact {
          animation: stampImpact 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
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

      {/* Background Layer 2: Tactical Cyber Grid */}
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
          <span className="material-symbols-outlined text-[#00fbfb] animate-pulse">terminal</span>
          <span className={`font-['Anton'] text-xl md:text-2xl uppercase tracking-wider text-[#ffffff] transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
            BLUEPRINT RECOVERY
          </span>
        </div>
        <div className="flex items-center gap-4 font-['Space_Mono'] text-xs text-[#8e9192]">
          <span className="hidden sm:inline-block px-2.5 py-1 bg-[#00fbfb]/10 border border-[#00fbfb]/30 text-[#00fbfb] uppercase tracking-widest font-bold">
            SIGNAL: DECRYPTED
          </span>
          <div className="flex items-center gap-2 text-[#00fbfb]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00fbfb] animate-ping"></span>
            <span>SECURE LINK ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 md:p-8 relative z-20 w-full max-w-4xl mx-auto my-auto">
        {/* Outer Intel Dossier Envelope */}
        <div className={`relative w-full bg-[#141313] border-4 border-[#e5e2e1] p-6 sm:p-8 md:p-10 transform rotate-1 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden transition-all ${rgbGlitch ? 'border-[#00fbfb] shadow-[0_0_35px_rgba(255,0,85,0.8)] translate-x-[2px] -translate-y-[2px]' : ''}`}>
          
          {/* Manila Envelope Header Tab */}
          <div className="absolute -top-10 left-0 bg-[#C2B280] h-10 px-5 border-t-4 border-l-4 border-r-4 border-[#e5e2e1] flex items-center shadow-md">
            <span className="font-['Space_Mono'] text-xs md:text-sm font-bold text-[#141313] tracking-tight uppercase">
              DOSSIER // DECRYPTED REVEAL
            </span>
          </div>

          <div className="flex flex-col items-center justify-center space-y-7 relative z-10">
            
            {/* Header: TARGET LOCATED with Glitch Effect */}
            <div className="text-center relative">
              <span className="font-['Space_Mono'] text-xs text-[#00fbfb] tracking-widest uppercase block mb-1 font-bold">
                [ INTEL MATCH CONFIRMED ]
              </span>
              <h1 className={`font-['Anton'] text-4xl sm:text-5xl md:text-7xl text-[#ffffff] tracking-widest uppercase leading-none animate-glitch-text drop-shadow-[0_0_15px_rgba(0,251,251,0.5)] transition-all ${rgbGlitch ? '[text-shadow:-6px_0_#ff0055,6px_0_#00fbfb]' : ''}`}>
                TARGET LOCATED
              </h1>
              <div className="h-1.5 w-44 bg-[#00fbfb] mx-auto mt-3 relative overflow-hidden shadow-[0_0_10px_rgba(0,251,251,0.8)]">
                <div className="absolute inset-0 bg-white opacity-80 animate-pulse"></div>
              </div>
            </div>

            {/* Evidence Tag Card (Manila Folder Aesthetic) */}
            <div className="relative w-full max-w-lg mx-auto mt-2">
              <div className={`bg-[#C2B280] text-[#141313] border-4 border-[#141313] p-5 sm:p-6 transform -rotate-1 relative shadow-2xl transition-all ${rgbGlitch ? 'border-[#ff0055] shadow-[0_0_25px_rgba(255,0,85,0.7)]' : ''}`}>
                
                {/* Paper Tape Detail (Top Left Corner) */}
                <div className="absolute -top-3 left-4 bg-[#e5e2e1]/80 text-[#141313] px-3 py-0.5 font-['Space_Mono'] text-[10px] uppercase font-bold border border-[#141313] shadow-sm transform -rotate-6">
                  CLASSIFIED // VERIFIED
                </div>

                {/* Evidence ID Header */}
                <div className="flex justify-between items-start border-b-2 border-[#141313] pb-3 mb-4 mt-1">
                  <div>
                    <span className="font-['Space_Mono'] text-xs text-[#141313] opacity-80 block font-bold">
                      EVIDENCE ID:
                    </span>
                    <span className="font-['Space_Mono'] text-sm md:text-base font-bold text-[#141313]">
                      #404-X-RAY
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#141313]">
                    <span className="material-symbols-outlined text-4xl">fingerprint</span>
                  </div>
                </div>

                {/* Location Box — Cyberpunk Neon Focus */}
                <div className="my-4">
                  <span className="font-['Space_Mono'] text-xs font-bold text-[#141313] opacity-90 block mb-2 tracking-widest uppercase flex items-center gap-1">
                    <span className="text-[#000000] font-bold">&gt;</span> REVEALED LOCATION COORDINATES:
                  </span>
                  
                  <div className={`bg-[#0e0e0e] text-[#00fbfb] border-3 border-[#00fbfb] p-4 sm:p-5 shadow-[0_0_25px_rgba(0,251,251,0.5)] relative overflow-hidden group transition-all ${rgbGlitch ? 'border-[#ff0055] shadow-[0_0_30px_rgba(255,0,85,0.9)]' : ''}`}>
                    {/* Inner corner brackets */}
                    <div className="absolute top-1 left-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">[</div>
                    <div className="absolute top-1 right-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">]</div>
                    <div className="absolute bottom-1 left-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">[</div>
                    <div className="absolute bottom-1 right-1 text-[#00fbfb] font-['Space_Mono'] text-xs opacity-50">]</div>

                    <div className={`font-['Anton'] text-3xl sm:text-4xl md:text-5xl leading-tight tracking-wider text-[#00fbfb] uppercase drop-shadow-[0_0_12px_rgba(0,251,251,0.8)] text-center py-1 transition-all ${rgbGlitch ? '[text-shadow:-5px_0_#ff0055,5px_0_#00fbfb]' : ''}`}>
                      {loading ? (
                        <span className="animate-pulse text-xl md:text-2xl text-[#00fbfb]/80 font-['Space_Mono']">
                          DECRYPTING LOCATION...
                        </span>
                      ) : (
                        <span>{locationName}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Redacted File Lines */}
                <div className="mt-4 space-y-2 border-t-2 border-[#141313] pt-4 border-dashed">
                  <div className="h-3 bg-[#141313] w-3/4 opacity-90"></div>
                  <div className="h-3 bg-[#141313] w-1/2 opacity-90"></div>
                </div>

                {/* Cyan CONFIRMED Stamp — Slam Animation */}
                {stampVisible && (
                  <div className="absolute -top-6 -right-6 pointer-events-none z-30 animate-stamp-impact">
                    <div className="border-4 border-[#00fbfb] text-[#00fbfb] font-['Anton'] text-2xl md:text-3xl px-5 py-1.5 uppercase tracking-widest bg-[#0e0e0e] shadow-[0_0_25px_rgba(0,251,251,0.8)] border-dashed transform rotate-12">
                      CONFIRMED
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-6 pt-2">
              <button
                onClick={() => onProceed?.()}
                className={`group relative px-8 py-4 bg-[#00fbfb] text-[#000000] border-4 border-[#ffffff] font-['Anton'] text-xl md:text-2xl uppercase tracking-wider shadow-[4px_4px_0_0_#ff00ff] hover:bg-[#ffffff] hover:text-[#141313] hover:shadow-[4px_4px_0_0_#00fbfb] hover:-translate-y-0.5 active:translate-y-0.5 transition-all transform cursor-pointer select-none ${rgbGlitch ? 'border-[#00fbfb] text-[#00fbfb] bg-[#141313]' : ''}`}
              >
                <span className="relative z-10 flex items-center gap-3">
                  Proceed to Physical Search &rarr;
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-50 w-full px-6 py-2 flex justify-between items-center bg-[#141313] border-t border-[#ffffff]/10 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // INTEL_REVEAL: VERIFIED</div>
        <div>TEAM #{teamNumber || '?'}</div>
      </footer>
    </div>
  );
}
