'use client';
import React, { useEffect } from 'react';

/**
 * Screen 01: Initializing Screen (01-initializing)
 * Atmosphere only, terminal boot sequence with scanlines and glitch typography.
 * Plays for a few seconds then auto-advances to Hero.
 */
export default function InitializingScreen({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, 3500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050505] text-[#e5e2e1] antialiased crt-flicker flex items-center justify-center">
      {/* Scanline Overlay */}
      <div className="scanlines"></div>

      {/* Static Noise Overlay */}
      <div className="noise"></div>

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full w-full pointer-events-auto">
        <div className="border-4 border-[#e5e2e1] p-8 md:p-12 bg-[#0e0e0e] bg-opacity-90 backdrop-blur-sm transform rotate-1 shadow-[4px_4px_0_0_#00fbfb,-4px_-4px_0_0_#ff00ff] max-w-2xl mx-4">
          <div className="flex items-center gap-4 mb-4 opacity-80">
            <span className="material-symbols-outlined text-[#00fbfb] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>
              warning
            </span>
            <span className="font-['Courier_Prime'] text-xs font-bold text-[#c4c7c8] uppercase tracking-[0.3em]">
              System Critical
            </span>
          </div>

          <h1
            className="font-['Anton'] text-6xl md:text-8xl glitch-text font-bold mb-6 tracking-wide"
            data-text="SIGNAL LOST"
          >
            SIGNAL LOST
          </h1>

          <div className="h-1 w-full bg-[#c4c7c8] mb-6 opacity-30"></div>

          <div className="font-['Courier_Prime'] text-base md:text-lg text-[#e5e2e1] flex flex-col gap-2 opacity-90">
            <p>&gt; INITIALIZING BLUEPRINT RECOVERY CORE...</p>
            <p>&gt; ATTEMPTING RECONNECTION TO RECOVERY NETWORK...</p>
            <p className="text-[#00fbfb]">&gt; LOCALIZING SHADOW ENTITY... <span className="animate-pulse">_</span></p>
          </div>

          <button
            onClick={() => onComplete?.()}
            className="mt-8 px-4 py-2 border border-[#00fbfb] text-[#00fbfb] font-['Space_Mono'] text-xs tracking-widest hover:bg-[#00fbfb] hover:text-[#000] transition-colors"
          >
            [ SKIP SEQUENCE ]
          </button>
        </div>
      </div>
    </div>
  );
}
