import React, { useState, useEffect } from 'react';
import TvStaticBackground from '../components/TvStaticBackground';

/**
 * Screen 02: Hero Screen (02-hero)
 * Mild analog TV static background + 5-second RGB Color Glitch effect.
 * Manila folder theme with redacted text, Spider-Man Noir guide, and "BEGIN RECOVERY" CTA.
 */
export default function HeroPage({ onBeginRecovery }) {
  const [headlineGlitch, setHeadlineGlitch] = useState(false);
  const [fullFrameGlitch, setFullFrameGlitch] = useState(false);
  const [rgbGlitch, setRgbGlitch] = useState(false);
  const [eyeFlicker, setEyeFlicker] = useState(1);
  const [tagJitter, setTagJitter] = useState(false);
  const [stabilityText, setStabilityText] = useState('12%');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Strict 5-Second RGB Color Glitch Interval
    const rgbInterval = setInterval(() => {
      setRgbGlitch(true);
      setTimeout(() => setRgbGlitch(false), 350);
    }, 5000);

    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isReducedMotion) return () => clearInterval(rgbInterval);

    let headlineTimer, fullFrameTimer, eyeTimer, tagTimer, stabilityTimer;

    // 2. Headline Chromatic Glitch (4-8s interval)
    function scheduleHeadlineGlitch() {
      const delay = Math.floor(Math.random() * 4000) + 4000;
      headlineTimer = setTimeout(() => {
        setHeadlineGlitch(true);
        setTimeout(() => setHeadlineGlitch(false), 120);
        scheduleHeadlineGlitch();
      }, delay);
    }

    // 3. Full-frame glitch flash (15-20s interval)
    function scheduleFullFrameGlitch() {
      const delay = Math.floor(Math.random() * 5000) + 15000;
      fullFrameTimer = setTimeout(() => {
        setFullFrameGlitch(true);
        setTimeout(() => setFullFrameGlitch(false), 120);
        scheduleFullFrameGlitch();
      }, delay);
    }

    // 4. Guide character eye flicker (2-5s interval)
    function scheduleEyeFlicker() {
      const delay = Math.floor(Math.random() * 3000) + 2000;
      eyeTimer = setTimeout(() => {
        const factor = Math.random() > 0.5 ? 0.75 : 1.25;
        setEyeFlicker(factor);
        setTimeout(() => setEyeFlicker(1), 100);
        scheduleEyeFlicker();
      }, delay);
    }

    // 5. Priority tag jitter (5-9s interval)
    function scheduleTagJitter() {
      const delay = Math.floor(Math.random() * 4000) + 5000;
      tagTimer = setTimeout(() => {
        setTagJitter(true);
        setTimeout(() => setTagJitter(false), 100);
        scheduleTagJitter();
      }, delay);
    }

    // 6. Telemetry stability flicker (10-15s interval)
    function scheduleStabilityFlicker() {
      const delay = Math.floor(Math.random() * 5000) + 10000;
      stabilityTimer = setTimeout(() => {
        setStabilityText('09%');
        setTimeout(() => setStabilityText('12%'), 120);
        scheduleStabilityFlicker();
      }, delay);
    }

    scheduleHeadlineGlitch();
    scheduleFullFrameGlitch();
    scheduleEyeFlicker();
    scheduleTagJitter();
    scheduleStabilityFlicker();

    return () => {
      clearInterval(rgbInterval);
      clearTimeout(headlineTimer);
      clearTimeout(fullFrameTimer);
      clearTimeout(eyeTimer);
      clearTimeout(tagTimer);
      clearTimeout(stabilityTimer);
    };
  }, []);

  return (
    <div className={`bg-[#141313] text-[#e5e2e1] overflow-x-hidden min-h-screen relative font-['Courier_Prime'] transition-all ${fullFrameGlitch ? 'brightness-150 contrast-200 translate-x-[3px] skew-x-1' : ''} ${rgbGlitch ? 'hue-rotate-90 saturate-200 scale-[1.002]' : ''}`}>
      
      {/* Mild Analog TV Static Noise Canvas Background */}
      <TvStaticBackground />

      {/* Global CRT Scanlines & Ambient Noise */}
      <div className="fixed inset-0 scanlines pointer-events-none z-40"></div>
      <div className="fixed inset-0 noise noise-drift pointer-events-none z-41 opacity-10"></div>

      {/* 5-Second RGB Color Glitch Burst Overlay */}
      {rgbGlitch && (
        <>
          <div className="fixed inset-0 z-50 pointer-events-none mix-blend-screen opacity-90 transition-all duration-75 animate-pulse bg-[linear-gradient(90deg,rgba(255,0,85,0.3)_0%,rgba(0,251,251,0.3)_100%)] shadow-[inset_0_0_100px_rgba(255,0,85,0.5)]"></div>
          <div className="fixed inset-0 z-51 pointer-events-none mix-blend-color-dodge opacity-80 backdrop-invert-[0.15] translate-x-[4px] -translate-y-[2px]"></div>
        </>
      )}

      {/* Comic-Book Halftone Light Blend & Gutter Layer */}
      <div className="comic-halftone-bg"></div>
      <div className="comic-gutter-hint"></div>

      {/* Background Ambient Tear Lines & RGB Fringe */}
      <div className="bg-tear-lines pointer-events-none"></div>
      <div className="fixed inset-0 bg-rgb-fringe pointer-events-none z-20 opacity-70"></div>

      {/* Full-Frame Glitch Flash Overlay */}
      {fullFrameGlitch && (
        <div className="fixed inset-0 bg-[#00fbfb]/10 mix-blend-screen pointer-events-none z-50 animate-pulse"></div>
      )}

      {/* Top Navigation — Transparent & Seamlessly Blended */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-transparent backdrop-blur-sm bg-gradient-to-b from-[#141313]/70 via-[#141313]/30 to-transparent border-b border-[#ffffff]/10">
        <div className={`font-['Anton'] text-2xl text-[#ffffff] uppercase tracking-tighter italic transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
          BLUEPRINT RECOVERY
        </div>
        <div className="hidden md:flex gap-4 font-['Space_Mono'] text-xs text-[#8e9192]">
          <span className="text-[#00fbfb] status-critical-pulse">STATUS: CRITICAL</span>
          <span>SECTOR: UNKNOWN</span>
        </div>
        <div className="flex gap-2 text-[#ffffff]">
          <span className="material-symbols-outlined cursor-pointer hover:text-[#00fbfb]">settings_input_component</span>
          <span className="material-symbols-outlined cursor-pointer hover:text-[#00fbfb]">terminal</span>
        </div>
      </nav>

      {/* Main Content Canvas — Fitted for Viewports */}
      <main className="pt-16 pb-12 px-4 md:px-8 min-h-[calc(100vh-48px)] flex items-center justify-center overflow-hidden relative z-30">
        {/* Manila Frame Container */}
        <div className={`w-full max-w-6xl border-2 border-[#444748] bg-[#0e0e0e] p-6 md:p-8 lg:p-10 relative flex flex-col md:flex-row gap-6 md:gap-8 shadow-[8px_8px_0px_0px_rgba(42,42,42,1)] my-auto transition-all ${rgbGlitch ? 'border-[#00fbfb] shadow-[0_0_30px_rgba(255,0,85,0.6)] translate-x-[2px] -translate-y-[2px]' : ''}`}>
          {/* Folder Tab */}
          <div className="absolute -top-8 left-0 border-t-2 border-l-2 border-r-2 border-[#444748] bg-[#0e0e0e] px-4 py-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-[#8e9192]">folder_open</span>
            <span className="font-['Space_Mono'] text-xs text-[#8e9192]">FILE_ID: A-09</span>
          </div>

          {/* LEFT: Content Area */}
          <div className="w-full md:w-3/5 flex flex-col justify-center space-y-6 z-10 relative">
            {/* Evidence Tag Metadata */}
            <div className={`absolute -top-4 right-8 bg-[#C2B280] text-black px-3 py-1 font-['Space_Mono'] text-xs font-bold shadow-md transition-transform duration-100 ${tagJitter || rgbGlitch ? '-rotate-4 translate-x-1 translate-y-[-1px] bg-[#ff0055] text-white' : '-rotate-2'}`}>
              PRIORITY: <span className={rgbGlitch ? 'text-white' : 'text-[#ffb4ab]'}>CRITICAL</span>
            </div>

            <div className="space-y-3 relative">
              {/* Headline with 5-Second RGB Color Glitch Shift */}
              <div className="relative inline-block overflow-hidden">
                <h1 className={`font-['Anton'] text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-[#ffffff] uppercase leading-none tracking-tighter transition-all duration-75 ${headlineGlitch || rgbGlitch ? 'translate-x-[3px] [text-shadow:-6px_0_#ff0055,6px_0_#00fbfb,0_0_20px_rgba(0,251,251,0.9)] scale-[1.01]' : ''}`}>
                  THE LATTICE <br /> HAS BROKEN
                </h1>
                {/* Scanner Pass Overlay Line */}
                <div className="headline-scan-line"></div>
              </div>

              <p className="font-['Courier_Prime'] text-sm md:text-base text-[#c4c7c8] max-w-lg border-l-4 border-[#8e9192] pl-4">
                Subject's memory traces are <span className="bg-[#e5e2e1] text-transparent hover:bg-transparent hover:text-[#e5e2e1] transition-colors cursor-pointer px-1">severely corrupted</span>. The structural integrity of Sector 4 is degrading. Immediate intervention required to prevent full cognitive collapse.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Primary Action Button */}
              <button
                onClick={() => onBeginRecovery?.()}
                className={`btn-idle-pulse px-6 py-3.5 bg-transparent border-4 border-[#ffffff] font-['Anton'] text-xl md:text-2xl text-[#ffffff] uppercase tracking-wide hover:bg-[#ffffff] hover:text-[#141313] hover:border-[#00fbfb] hover:shadow-[0_0_20px_rgba(0,251,251,0.8)] transition-all transform hover:-translate-x-1 hover:-translate-y-1 ${rgbGlitch ? 'border-[#00fbfb] text-[#00fbfb] [text-shadow:-3px_0_#ff0055,3px_0_#00fbfb]' : ''}`}
              >
                BEGIN RECOVERY
              </button>
              <div className="flex items-center gap-2 text-[#8e9192]">
                <span className="material-symbols-outlined animate-pulse text-[#ffb4ab]">warning</span>
                <span className="font-['Space_Mono'] text-xs">
                  SYSTEM STABILITY: <span className="font-bold text-[#ffb4ab]">{stabilityText}</span>
                </span>
              </div>
            </div>

            {/* Terminal Prompt */}
            <div className={`mt-4 font-['Courier_Prime'] text-xs md:text-sm text-[#00fbfb] opacity-80 flex items-center transition-all ${rgbGlitch ? '[text-shadow:-3px_0_#ff0055,3px_0_#00fbfb]' : ''}`}>
              &gt; init sequence starting<span className="terminal-cursor-blink font-bold ml-0.5">_</span>
            </div>
          </div>

          {/* RIGHT: Guide Character Visual Frame */}
          <div className="w-full md:w-2/5 flex justify-center items-center">
            <div className={`relative w-full max-w-[300px] md:max-w-[320px] aspect-[9/16] border-4 border-[#3a3939] bg-[#07080a] overflow-hidden group shadow-[0_0_25px_rgba(0,0,0,0.8)] transition-all ${rgbGlitch ? 'border-[#ff0055] scale-105' : ''}`}>
              <img
                src="/spiderman-noir.jpg"
                alt="Spider-Man Noir Detective"
                style={{ filter: `brightness(${eyeFlicker})` }}
                className={`w-full h-full object-cover object-center transition-all duration-100 group-hover:scale-105 ${rgbGlitch ? 'contrast-200 saturate-200 invert-[0.1]' : ''}`}
              />
              <div className="absolute inset-0 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] pointer-events-none z-10"></div>
              <div className="absolute inset-0 chromatic-shimmer bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] pointer-events-none z-10"></div>

              {/* Diegetic Cyber Tactical HUD Overlay */}
              <div className="diegetic-badge absolute bottom-3 right-3 flex items-center gap-2.5 p-2 px-3 border border-[#00fbfb]/70 backdrop-blur-sm transition-all transform group-hover:scale-105 z-20">
                <div className="relative flex items-center justify-center w-4 h-4">
                  <span className="absolute inset-0 rounded-full bg-[#00fbfb]/30 animate-ping"></span>
                  <span className="material-symbols-outlined text-[#00fbfb] text-sm diegetic-icon-glow">
                    my_location
                  </span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00fbfb] animate-ping"></span>
                    <span className="font-['Space_Mono'] text-[11px] font-bold text-[#00fbfb] tracking-wider uppercase diegetic-text-aberration">
                      SUBJECT LOCATED
                    </span>
                  </div>
                  <span className="font-['Courier_Prime'] text-[9px] text-[#8e9192] tracking-widest uppercase diegetic-text-aberration">
                    SIG: 99.8% // ANOMALY DETECTED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full z-50 px-6 py-2 flex justify-between items-center bg-[#141313] border-t-2 border-[#ffffff]/30 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // SYSTEM_STATUS: DEGRADED</div>
        <div className="flex gap-4">
          <span className="opacity-70">DIAGNOSTICS</span>
          <span className="text-[#00fbfb] underline animate-pulse">REDACT_ALL</span>
        </div>
      </footer>
    </div>
  );
}
