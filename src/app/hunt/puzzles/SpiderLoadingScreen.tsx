"use client";

import { useEffect, useState } from "react";

interface SpiderLoadingScreenProps {
  onComplete: () => void;
  durationSeconds?: number;
}

export function SpiderLoadingScreen({
  onComplete,
  durationSeconds = 8,
}: SpiderLoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("INITIALIZING MYSTERY ROOM...");

  useEffect(() => {
    const totalMs = durationSeconds * 1000;
    const intervalMs = 100;
    const increment = (intervalMs / totalMs) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [durationSeconds]);

  useEffect(() => {
    if (progress < 25) {
      setStatusText("INITIALIZING MYSTERY ROOM...");
    } else if (progress < 55) {
      setStatusText("LOADING 3D SCENERY & CLUES...");
    } else if (progress < 85) {
      setStatusText("PREPARING SPIDER-VERSE ENVIRONMENT...");
    } else if (progress < 100) {
      setStatusText("FINALIZING DETAILED ASSETS...");
    } else {
      setStatusText("ROOM READY");
    }
  }, [progress]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#06040d] p-6">
      {/* Spider-Verse Halftone Screen & Radial Overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1.15px)",
          backgroundSize: "6px 6px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(34,224,255,0.2) 0%, transparent 60%)," +
            "radial-gradient(circle at 50% 50%, rgba(255,45,149,0.15) 0%, transparent 70%)",
        }}
      />

      {/* CENTERED CONTENT BLOCK */}
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center justify-center space-y-6 text-center">
        {/* Title Header */}
        <div className="space-y-1">
          <p className="font-mono text-xs tracking-[0.45em] text-[#22e0ff] uppercase">XPLORE&apos;26</p>
          <h1 className="display-title font-mono text-3xl md:text-4xl font-extrabold tracking-wider text-paper-white drop-shadow-[0_0_15px_rgba(255,255,255,0.25)]">
            MYSTERY ROOM
          </h1>
        </div>

        {/* Loading Track Container */}
        <div className="w-full space-y-3 pt-2">
          <div className="flex items-center justify-between font-mono text-[#22e0ff] tracking-widest text-xs font-semibold">
            <span>{statusText}</span>
            <span className="font-bold text-[#bfefff]">{Math.round(progress)}%</span>
          </div>

          {/* Loading Track */}
          <div className="relative h-4 w-full rounded-full border border-white/20 bg-black/90 p-0.5 shadow-[0_0_15px_rgba(0,0,0,0.8)]">
            {/* Filled Progress Bar */}
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#22e0ff] via-[#ff2d95] to-[#c8f238] transition-all duration-150 ease-linear shadow-[0_0_14px_rgba(34,224,255,0.8)]"
              style={{ width: `${progress}%` }}
            />

            {/* BLACK SPIDER CRAWLING ALONG THE LOADING BAR */}
            <div
              className="absolute top-1/2 -translate-y-1/2 transition-all duration-150 ease-linear pointer-events-none"
              style={{
                left: `calc(${Math.min(Math.max(progress, 2), 97)}% - 16px)`,
              }}
            >
              {/* Black Spider SVG */}
              <div className="relative flex items-center justify-center">
                <svg
                  className="h-9 w-9 text-black drop-shadow-[0_0_6px_rgba(34,224,255,0.9)] animate-pulse"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{
                    transform: `rotate(${Math.sin(progress * 2) * 6}deg)`,
                  }}
                >
                  <path d="M12 2C11.45 2 11 2.45 11 3V5.15C9.42 5.56 8.08 6.54 7.26 7.9L4.41 5.05C4.02 4.66 3.39 4.66 3 5.05C2.61 5.44 2.61 6.07 3 6.46L6.15 9.61C5.42 10.87 5 12.38 5 14C5 14.55 5.45 15 6 15C6.55 15 7 14.55 7 14C7 12.82 7.33 11.72 7.91 10.77L5.05 13.63C4.66 14.02 4.66 14.65 5.05 15.04C5.44 15.43 6.07 15.43 6.46 15.04L9.42 12.08C10.15 12.67 11.03 13 12 13C12.97 13 13.85 12.67 14.58 12.08L17.54 15.04C17.93 15.43 18.56 15.43 18.95 15.04C19.34 14.65 19.34 14.02 18.95 13.63L16.09 10.77C16.67 11.72 17 12.82 17 14C17 14.55 17.45 15 18 15C18.55 15 19 14.55 19 14C19 12.38 18.58 10.87 17.85 9.61L21 6.46C21.39 6.07 21.39 5.44 21 5.05C20.61 4.66 19.98 4.66 19.59 5.05L16.74 7.9C15.92 6.54 14.58 5.56 13 5.15V3C13 2.45 12.55 2 12 2ZM12 7C13.66 7 15 8.34 15 10C15 11.66 13.66 13 12 13C10.34 13 9 11.66 9 10C9 8.34 10.34 7 12 7ZM12 14C14.76 14 17 16.24 17 19C17 20.66 15.66 22 14 22C12.9 22 12 21.1 12 20C12 21.1 11.1 22 10 22C8.34 22 7 20.66 7 19C7 16.24 9.24 14 12 14Z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Small Caption below loading bar */}
          <p className="font-mono text-xs md:text-sm font-semibold tracking-wider text-[#bfefff] drop-shadow-[0_0_8px_rgba(34,224,255,0.6)] pt-1">
            &ldquo;Everything you sense and touch matters here&rdquo;
          </p>
        </div>

        {/* Action Button shown when loading completes */}
        {progress >= 100 && (
          <div className="w-full pt-2 text-center">
            <button
              type="button"
              onClick={onComplete}
              className="w-full rounded-lg border border-[#ff2d95] bg-[#ff2d95]/25 px-6 py-3 font-mono text-sm font-bold tracking-widest text-[#ff9dcb] hover:bg-[#ff2d95] hover:text-white transition-all shadow-[0_0_20px_rgba(255,45,149,0.5)] cursor-pointer"
            >
              ENTER MYSTERY ROOM ➔
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
