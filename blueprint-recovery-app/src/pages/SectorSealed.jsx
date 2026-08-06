import React, { useState, useEffect } from 'react';
import { getVariantForTeam } from '../lib/constants';
import TvStaticBackground from '../components/TvStaticBackground';

/**
 * Screen 08: Sector Sealed / Mission Complete (08-sector-sealed)
 * Enhanced with 5-Second RGB Color Glitch Effect.
 */
export default function SectorSealed({ teamData }) {
  const teamNumber = teamData?.team_number || 1;
  const variant = getVariantForTeam(teamNumber);
  const [rgbGlitch, setRgbGlitch] = useState(false);

  // 5-Second RGB Color Glitch Loop
  useEffect(() => {
    const rgbInterval = setInterval(() => {
      setRgbGlitch(true);
      setTimeout(() => setRgbGlitch(false), 350);
    }, 5000);

    return () => clearInterval(rgbInterval);
  }, []);

  // Compute total duration formatted as MM:SS or HH:MM:SS
  function formatDuration() {
    if (!teamData?.start_time || !teamData?.complete_time) return 'N/A';
    const start = new Date(teamData.start_time).getTime();
    const end = new Date(teamData.complete_time).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));

    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  return (
    <div className={`fixed inset-0 w-screen h-screen overflow-hidden bg-[#050505] text-[#e5e2e1] font-['Courier_Prime'] select-none flex flex-col justify-between items-center transition-all ${rgbGlitch ? 'hue-rotate-90 saturate-200' : ''}`}>
      {/* Glitch Overlay Keyframes */}
      <style>{`
        @keyframes subtleGlitch {
          0% { opacity: 0.12; transform: translate(0); }
          50% { opacity: 0.18; transform: translate(-1px, 1px); }
          100% { opacity: 0.12; transform: translate(0); }
        }
        .bg-glitch-overlay {
          animation: subtleGlitch 4s infinite alternate;
        }
      `}</style>

      {/* 5-Second RGB Color Glitch Burst Overlay */}
      {rgbGlitch && (
        <>
          <div className="fixed inset-0 z-50 pointer-events-none mix-blend-screen opacity-90 transition-all duration-75 animate-pulse bg-[linear-gradient(90deg,rgba(255,0,85,0.3)_0%,rgba(0,251,251,0.3)_100%)] shadow-[inset_0_0_100px_rgba(255,0,85,0.5)]"></div>
          <div className="fixed inset-0 z-51 pointer-events-none mix-blend-color-dodge opacity-80 backdrop-invert-[0.15] translate-x-[4px] -translate-y-[2px]"></div>
        </>
      )}

      {/* Layer 1: Background Spider Noir Poster Image with High-Res Sharpening Filter */}
      <img
        src="/sector-sealed-noir.jpg"
        alt="Spider Noir Sector Sealed"
        className={`absolute inset-0 w-full h-full object-cover object-center filter contrast-130 brightness-90 saturate-110 z-0 transition-all ${rgbGlitch ? 'contrast-200 saturate-200 scale-105' : ''}`}
      />

      {/* Layer 2: Live Subtle Analog TV Static Glitch Background */}
      <div className="absolute inset-0 z-1 pointer-events-none bg-glitch-overlay">
        <TvStaticBackground />
      </div>

      {/* Layer 3: CRT Scanlines & Dark Radial Vignette */}
      <div className="absolute inset-0 scanlines pointer-events-none z-10 opacity-60"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/80 via-transparent to-[#000000]/95 pointer-events-none z-10"></div>

      {/* Top Header — Transparent & Seamlessly Blended */}
      <header className="relative z-30 w-full px-6 py-3.5 flex justify-between items-center bg-transparent backdrop-blur-sm bg-gradient-to-b from-[#141313]/70 via-[#141313]/30 to-transparent border-b border-[#ffffff]/10 shadow-md">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#00fbfb]">verified</span>
          <span className={`font-['Anton'] text-xl md:text-2xl text-[#ffffff] uppercase tracking-wider transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
            BLUEPRINT RECOVERY
          </span>
        </div>

        {/* Top Right Corner Detail: Recovery Duration */}
        <div className="flex items-center gap-3 font-['Space_Mono'] text-xs">
          <div className={`px-3.5 py-1.5 bg-[#0e0e0e]/90 border border-[#00fbfb]/60 text-[#ffffff] font-bold uppercase tracking-wider shadow-[0_0_15px_rgba(0,251,251,0.25)] flex items-center gap-2 transition-all ${rgbGlitch ? 'border-[#ff0055] text-[#00fbfb]' : ''}`}>
            <span className="text-[#8e9192]">RECOVERY TIME:</span>
            <span className="text-[#00fbfb] text-sm font-extrabold">{formatDuration()}</span>
          </div>
        </div>
      </header>

      {/* Center: Dramatic Hero Title Overlay */}
      <main className="relative z-30 flex-grow w-full max-w-4xl mx-auto flex flex-col items-center justify-center p-4 sm:p-6 text-center my-auto pointer-events-none">
        <div className={`bg-[#050505]/85 backdrop-blur-md border-2 border-[#00fbfb] px-8 sm:px-14 py-4 sm:py-6 shadow-[0_0_50px_rgba(0,251,251,0.55)] transform -rotate-1 transition-all ${rgbGlitch ? 'border-[#ff0055] shadow-[0_0_60px_rgba(255,0,85,0.9)] translate-x-[3px] -translate-y-[2px]' : ''}`}>
          <h1 className={`font-['Anton'] text-5xl sm:text-7xl md:text-8xl tracking-widest text-[#ffffff] uppercase leading-none drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] transition-all ${rgbGlitch ? '[text-shadow:-6px_0_#ff0055,6px_0_#00fbfb]' : ''}`}>
            SECTOR <span className="text-[#00fbfb] drop-shadow-[0_0_25px_rgba(0,251,251,0.9)]">SEALED</span>
          </h1>
          <p className="font-['Space_Mono'] text-xs sm:text-sm text-[#00fbfb] uppercase font-bold tracking-widest mt-2">
            [ BREACH CONTAINMENT COMPLETE ]
          </p>
        </div>
      </main>

      {/* Bottom Telemetry Footer — Properly Aligned Corner Details */}
      <footer className="relative z-30 w-full px-6 py-3 flex justify-between items-center border-t border-[#ffffff]/10 bg-[#141313] font-['Space_Mono'] text-xs">
        
        {/* Bottom Left Corner Detail: Team Number & Status */}
        <div className="flex items-center gap-3 text-[#8e9192]">
          <span className="text-[#00fbfb] font-bold">TEAM #{teamNumber}</span>
          <span className="text-[#ffffff]/40">//</span>
          <span className="hidden sm:inline-block">STATUS: SEALED</span>
        </div>

        {/* Bottom Right Corner Detail: Sector Name & Color Badge */}
        <div className="flex items-center gap-3 text-[#8e9192]">
          <span className="hidden md:inline-block">SECTOR: <strong className="text-[#ffffff]">{variant.sectorName.toUpperCase()}</strong></span>
          <span className="hidden md:inline-block text-[#ffffff]/40">//</span>
          <div className="flex items-center gap-2">
            <span>COLOR:</span>
            <span
              className="font-bold uppercase px-2.5 py-0.5 text-[#141313] border border-[#ffffff]/40 shadow-sm"
              style={{
                backgroundColor:
                  variant.color.toLowerCase() === 'grey'
                    ? '#a0a0a0'
                    : variant.color.toLowerCase(),
              }}
            >
              {variant.color.toUpperCase()}
            </span>
          </div>
        </div>

      </footer>
    </div>
  );
}
