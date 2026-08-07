'use client';
import React, { useState, useEffect } from 'react';
import { getVariantForTeam } from '@/lib/constants';
import TvStaticBackground from '@/components/TvStaticBackground';

/**
 * Screen 04: Mission Briefing (04-mission-briefing)
 * Refined Graphic Novel / Comic Grid Layout for Blueprint Recovery.
 * 
 * Features:
 * 1. Perfectly aligned 3-panel grid with uniform gutters & responsive laptop scaling (1280px–1920px range).
 * 2. Story text reflecting actual 9-screen game flow in terse noir phrasing.
 * 3. Live analog TV static background layer (subtle, non-distracting grain).
 * 4. Interactive animations: cyan hover glow on panels, staggered load entrance, polished button states.
 */
export default function MissionBriefing({ teamData, onContinue }) {
  const teamNumber = teamData?.team_number || 1;
  const variant = getVariantForTeam(teamNumber);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-[#141313] text-[#e5e2e1] min-h-screen relative overflow-x-hidden font-['Courier_Prime']">
      {/* Live Analog TV Static Background */}
      <TvStaticBackground />

      {/* Global Scanline & Noise Overlay */}
      <div className="fixed inset-0 scanlines pointer-events-none z-40 opacity-70"></div>
      <div className="fixed inset-0 noise pointer-events-none z-41 opacity-5"></div>

      {/* Top Header Bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-3 bg-[#141313]/90 backdrop-blur-sm border-b border-[#ffffff]/10 shadow-lg">
        <div className="font-['Anton'] text-xl md:text-2xl text-[#ffffff] uppercase tracking-tighter italic">
          BLUEPRINT RECOVERY
        </div>
        <div className="flex items-center gap-4 font-['Space_Mono'] text-xs text-[#8e9192]">
          <span>
            SECTOR:{' '}
            <strong
              style={{
                color:
                  variant.color.toLowerCase() === 'grey'
                    ? '#a0a0a0'
                    : variant.color.toLowerCase(),
              }}
            >
              {variant.sectorName}
            </strong>
          </span>
        </div>
      </header>

      {/* Main Content Canvas — Perfect Fit for 1280px-1920px Laptop Viewports */}
      <main className="pt-16 pb-12 px-4 sm:px-6 md:px-8 min-h-[calc(100vh-36px)] flex flex-col items-center justify-center relative z-10">
        <div
          className={`max-w-5xl lg:max-w-6xl w-full bg-[#C2B280] p-4 sm:p-5 border-8 border-[#141313] relative shadow-[0_20px_50px_rgba(0,0,0,0.8)] transition-all duration-700 transform ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          {/* Manila Folder Tab */}
          <div className="absolute -top-10 left-0 bg-[#C2B280] h-10 px-5 border-t-8 border-l-8 border-r-8 border-[#141313] flex items-center shadow-md">
            <span className="font-['Space_Mono'] text-xs md:text-sm font-bold text-[#141313] tracking-tight">
              MISSION BRIEFING // SECTOR {variant.variantNumber} ({variant.color.toUpperCase()})
            </span>
          </div>

          {/* Sector Signature Banner */}
          <div
            className={`mb-3 p-3 sm:p-4 border-4 border-[#141313] bg-[#0e0e0e] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all duration-500 delay-150 transform ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div>
              <span className="font-['Space_Mono'] text-xs text-[#8e9192]">
                TEAM #{teamNumber} ASSIGNED SECTOR
              </span>
              <h2 className="font-['Anton'] text-xl sm:text-2xl md:text-3xl text-[#ffffff] tracking-wider uppercase">
                {variant.sectorName}
              </h2>
            </div>
            <div
              className="px-4 py-1.5 border-2 border-[#ffffff] font-['Space_Mono'] text-xs md:text-sm font-bold uppercase tracking-widest text-[#141313] shadow-[3px_3px_0_0_#141313]"
              style={{
                backgroundColor:
                  variant.color.toLowerCase() === 'grey'
                    ? '#a0a0a0'
                    : variant.color.toLowerCase(),
              }}
            >
              SECTOR COLOR: {variant.color.toUpperCase()}
            </div>
          </div>

          {/* 3-Panel Comic Grid — Pixel-Clean Alignment & Uniform Gutters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 md:gap-4 bg-[#141313] p-3.5 md:p-4 border-4 border-[#141313] relative overflow-hidden">
            {/* Panel 1 (Hero Panel) — High Stakes & Physical Puzzle Objective */}
            <div
              className={`md:col-span-2 relative border-4 border-[#141313] bg-[#201f1f] overflow-hidden group h-[180px] md:h-[210px] lg:h-[230px] hover:border-[#00fbfb] hover:shadow-[0_0_25px_rgba(0,251,251,0.4)] transition-all duration-500 delay-300 transform ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <img
                className="w-full h-full object-cover filter grayscale contrast-200 group-hover:scale-105 transition-transform duration-700 opacity-80"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDsZHr3_ATx1OSqF_xg377MNSE0RBxI6imFJMefj6c-E_zgS4D0situNF2otBH19fKGnhEZzRdVXT4ryYj6oU-l0vEDXhW15xilSJpr631h0JXZXU-evmkf7mReyPNJmlNmygpNdxsnbMoJM6TgGZliDkIRD7kxeZsMn2i4ScxcFsUwvLci1yACAbnF49Iw-dntnbkPZN3zNKDv6-AsQEM1tx8B6a-pEbctjKPznTskm469OjHpx6O3"
                alt="Corrupted Agent Alleyway"
              />
              <div className="absolute inset-0 bg-[#00fbfb]/0 group-hover:bg-[#00fbfb]/10 transition-colors pointer-events-none"></div>

              {/* Speech Bubble / Noir Caption Box 1 */}
              <div className="absolute top-2.5 right-2.5 md:top-3 md:right-3 max-w-[88%] md:max-w-md bg-[#ffffff] text-[#000000] border-3 border-[#000000] p-2.5 md:p-3 font-['Anton'] uppercase leading-tight shadow-[4px_4px_0_0_#00fbfb] z-20">
                <div className="text-xs text-[#007070] font-['Space_Mono'] font-bold tracking-wider mb-0.5">
                  // THE SIGNAL IS LEAKING
                </div>
                <div className="text-xs sm:text-sm md:text-base text-[#000000]">
                  SECTOR HAS GONE DARK. SOLVE THE PHYSICAL EVIDENCE PUZZLE TO LOCATE YOUR TARGET.
                </div>
              </div>
            </div>

            {/* Panel 2 (Left Bottom Panel) — Physical Blueprint Assembly Step */}
            <div
              className={`relative border-4 border-[#141313] bg-[#201f1f] overflow-hidden group h-[155px] md:h-[180px] lg:h-[195px] hover:border-[#00fbfb] hover:shadow-[0_0_25px_rgba(0,251,251,0.4)] transition-all duration-500 delay-450 transform ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <img
                className="w-full h-full object-cover filter grayscale contrast-200 group-hover:scale-105 transition-transform duration-700 opacity-80"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCWZ71e4j57Y3b1cPQkN1Wo39x9WRnlhNDEDAhZ0pwVLuW8zWNV7LuBNI2m4O4qfE-8n-LR8Jb5dmnVWBVm19vp7g3rvJNtjjmlTOduF8_RPM2pg7kQox7f7lSdS6x6zbpK8ehImFftC2tpT_xo8SKfQNlNHM2fx9gSVZAXMNshhYP7rF9YghZkpqa5NOYmfwjsRGxWHU8_agufV5XeLKuMWqKfV9JNXAHM1Qpu-U-FP551U0zhwWrV"
                alt="Fragmented Circuit Board"
              />
              <div className="absolute inset-0 bg-[#00fbfb]/0 group-hover:bg-[#00fbfb]/10 transition-colors pointer-events-none"></div>

              {/* Speech Bubble / Noir Caption Box 2 */}
              <div className="absolute bottom-2.5 left-2.5 md:bottom-3 md:left-3 max-w-[88%] md:max-w-sm bg-[#ffffff] text-[#000000] border-3 border-[#000000] p-2 md:p-2.5 font-['Anton'] uppercase leading-tight shadow-[3px_3px_0_0_#00fbfb] z-20">
                <div className="text-[11px] text-[#007070] font-['Space_Mono'] font-bold tracking-wider mb-0.5">
                  // FIND THE LEAK
                </div>
                <div className="text-xs sm:text-xs md:text-sm text-[#000000]">
                  ASSEMBLE BLUEPRINT PIECES GIVEN TO YOUR TEAM. CORRELATE EVERY SHADOW FRAGMENT.
                </div>
              </div>
            </div>

            {/* Panel 3 (Right Bottom Panel) — Coordinator Notification & Physical Search */}
            <div
              className={`relative border-4 border-[#141313] bg-[#201f1f] overflow-hidden group h-[155px] md:h-[180px] lg:h-[195px] hover:border-[#00fbfb] hover:shadow-[0_0_25px_rgba(0,251,251,0.4)] transition-all duration-500 delay-600 transform ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <img
                className="w-full h-full object-cover filter grayscale contrast-200 group-hover:scale-105 transition-transform duration-700 opacity-80"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCw3yRAowPM89aPkkwsT_mwu3Yo9pJiwzinDHgKjduNTSoiBEm944YPffP4Ud2GKueUAWcNDY1rjYIhkMyRPVwjPGvwkmrL55RKjG_zTqh1mHiyyjm_CBdWUMEzsXBCHqzxL1s_9HGvFWO_4ORxPAyPXD2cCTFHV2-U2d8Ydp8k6B6XLw-MoT_NQfZEBDSCKXoZx_-pPBvFEOqYuFoxwhGRA0TqUckye6ESGTe4srJ40sbYC9lt8DaJ"
                alt="Agent Rooftop"
              />
              <div className="absolute inset-0 bg-[#00fbfb]/0 group-hover:bg-[#00fbfb]/10 transition-colors pointer-events-none"></div>

              {/* Speech Bubble / Noir Caption Box 3 */}
              <div className="absolute top-2.5 left-2.5 md:top-3 md:left-3 max-w-[88%] md:max-w-sm bg-[#ffffff] text-[#000000] border-3 border-[#000000] p-2 md:p-2.5 font-['Anton'] uppercase leading-tight shadow-[3px_3px_0_0_#00fbfb] z-20">
                <div className="text-[11px] text-[#007070] font-['Space_Mono'] font-bold tracking-wider mb-0.5">
                  // SEAL THE SECTOR
                </div>
                <div className="text-xs sm:text-xs md:text-sm text-[#000000]">
                  NOTIFY COORDINATOR ONCE SOLVED. PROCEED TO PHYSICAL SEARCH & ENTER ACCESS CODE.
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar (Handoff & Initiate Button) — Stagger Step Final */}
          <div
            className={`mt-4 flex flex-col sm:flex-row justify-between items-center gap-3 bg-[#0e0e0e] p-3.5 border-4 border-[#141313] transition-all duration-500 delay-750 transform ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div className="font-['Space_Mono'] text-xs md:text-sm text-[#8e9192] flex items-center gap-2">
              <span className="text-[#00fbfb] font-bold">&gt;</span> HANDOFF ENVELOPE MATCHING SECTOR COLOR (
              <span className="text-[#ffffff] font-bold">{variant.color.toUpperCase()}</span>) NOW.
            </div>
            <button
              onClick={() => onContinue?.()}
              className="w-full sm:w-auto px-7 py-3 bg-[#00fbfb] text-[#000000] border-4 border-[#ffffff] font-['Anton'] text-lg md:text-xl uppercase tracking-wider shadow-[4px_4px_0_0_#ff00ff] hover:bg-[#ffffff] hover:text-[#141313] hover:shadow-[4px_4px_0_0_#00fbfb] hover:-translate-y-0.5 active:translate-y-0.5 transition-all transform cursor-pointer select-none"
            >
              INITIATE MISSION
            </button>
          </div>
        </div>
      </main>

      {/* Fixed Footer Bar */}
      <footer className="fixed bottom-0 w-full z-50 px-6 py-2 flex justify-between items-center bg-[#141313] border-t-2 border-[#ffffff]/30 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // SYSTEM_STATUS: DEGRADED</div>
        <div className="flex gap-4">
          <span className="text-[#00fbfb] font-bold">SECTOR: {variant.sectorName}</span>
        </div>
      </footer>
    </div>
  );
}
