"use client";

import { useEffect, useState } from "react";

interface SpiderTimerProps {
  secondsLeft: number;
  totalSeconds: number;
  phaseLabel?: string;
  urgent?: boolean;
  size?: number;
  format?: "mm:ss" | "seconds";
}

/**
 * Spider-Man Circular Crawler Timer.
 *
 * Features:
 * - Inner dark disc with digital ticking countdown (e.g. 00:05).
 * - Outer circular ring that depletes clockwise.
 * - Cute 8-legged Spider / Spider-Man icon that crawls along the circular border
 *   in a clockwise direction as time ticks, with leg-crawling animation!
 */
export default function SpiderTimer({
  secondsLeft,
  totalSeconds,
  phaseLabel,
  urgent = false,
  size = 140,
  format = "mm:ss",
}: SpiderTimerProps) {
  const [crawlTick, setCrawlTick] = useState(0);

  // Leg-crawling animation loop
  useEffect(() => {
    const id = setInterval(() => {
      setCrawlTick((t) => (t + 1) % 100);
    }, 120);
    return () => clearInterval(id);
  }, []);

  const safeTotal = Math.max(1, totalSeconds);
  const clampedLeft = Math.max(0, Math.min(safeTotal, secondsLeft));
  // Progress ratio: 1.0 (start, full) -> 0.0 (time up)
  const progress = clampedLeft / safeTotal;
  const elapsedRatio = 1 - progress;

  // Format time display
  const minutes = Math.floor(clampedLeft / 60);
  const secs = Math.floor(clampedLeft % 60);
  const timeString =
    format === "mm:ss"
      ? `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${secs}s`;

  // SVG Geometry
  const viewBoxSize = 140;
  const center = viewBoxSize / 2; // 70
  const radius = 54;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  // Progress ring stroke offset so arc grows clockwise from 12 o'clock to elapsedRatio
  const strokeDashoffset = circumference * (1 - elapsedRatio);

  // Angle for Spider Crawler (0° at 12 o'clock, moving clockwise)
  const angleDeg = elapsedRatio * 360;
  const angleRad = (angleDeg - 90) * (Math.PI / 180);
  const spiderX = center + radius * Math.cos(angleRad);
  const spiderY = center + radius * Math.sin(angleRad);
  // Tangent angle so Spider-Man faces forward along clockwise travel
  const spiderRotation = angleDeg + 90;

  // Crawl leg animation offset
  const legWobble = Math.sin(crawlTick * 0.8) * 3;

  const trackColor = urgent ? "rgba(229, 34, 59, 0.25)" : "rgba(58, 134, 255, 0.2)";
  const progressColor = urgent ? "#e5223b" : "#3a86ff";

  return (
    <div
      className="relative flex flex-col items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="overflow-visible"
      >
        <defs>
          {/* Inner dark gradient */}
          <radialGradient id="timer-bg-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1c23" />
            <stop offset="100%" stopColor="#0d0e12" />
          </radialGradient>
          {/* Glow filter */}
          <filter id="timer-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Inner dark background disc */}
        <circle
          cx={center}
          cy={center}
          r={radius - strokeWidth / 2}
          fill="url(#timer-bg-grad)"
          stroke="#252936"
          strokeWidth="3"
        />

        {/* Outer background ring track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />

        {/* Clockwise depleting/filling progress ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
          filter={urgent ? "url(#timer-glow)" : undefined}
          style={{ transition: "stroke-dashoffset 200ms linear" }}
        />

        {/* SPIDER-MAN CHARACTER CRAWLER ON BORDER */}
        <g
          transform={`translate(${spiderX}, ${spiderY}) rotate(${spiderRotation})`}
          style={{ transition: "transform 200ms linear" }}
        >
          {/* Outer glow ring around Spider-Man */}
          <circle cx="0" cy="0" r="14" fill={progressColor} opacity="0.25" />

          {/* Spider-Man Suit Crawling Legs (Red & Blue suit legs with animated crawl) */}
          <g stroke="#e5223b" strokeWidth="2.5" strokeLinecap="round" fill="none">
            {/* Front Left Legs */}
            <path d={`M-3 -3 Q-11 ${-12 + legWobble} -15 ${-7 - legWobble}`} />
            <path d={`M-3 -5 Q-13 ${-15 - legWobble} -17 ${-11 + legWobble}`} stroke="#3a86ff" />
            {/* Front Right Legs */}
            <path d={`M3 -3 Q11 ${-12 - legWobble} 15 ${-7 + legWobble}`} />
            <path d={`M3 -5 Q13 ${-15 + legWobble} 17 ${-11 - legWobble}`} stroke="#3a86ff" />
            {/* Rear Left Legs */}
            <path d={`M-3 3 Q-11 ${12 - legWobble} -15 ${7 + legWobble}`} />
            <path d={`M-3 5 Q-13 ${15 + legWobble} -17 ${11 - legWobble}`} stroke="#3a86ff" />
            {/* Rear Right Legs */}
            <path d={`M3 3 Q10 ${12 + legWobble} 15 ${7 - legWobble}`} />
            <path d={`M3 5 Q13 ${15 - legWobble} 17 ${11 + legWobble}`} stroke="#3a86ff" />
          </g>

          {/* Spider-Man Blue Suit Abdomen */}
          <ellipse cx="0" cy="5.5" rx="7" ry="8" fill="#3a86ff" stroke="#0a0a0a" strokeWidth="1.5" />
          {/* Red Spider Emblem on Back */}
          <path d="M0 2 L-2 5.5 L0 9 L2 5.5 Z" fill="#e5223b" />

          {/* Spider-Man Mask Head (Red mask) */}
          <circle cx="0" cy="-3.5" r="7.5" fill="#e5223b" stroke="#0a0a0a" strokeWidth="1.5" />

          {/* Web Lines on Mask */}
          <g stroke="#0a0a0a" strokeWidth="0.8" opacity="0.5" fill="none">
            <line x1="0" y1="-11" x2="0" y2="4" />
            <line x1="-7.5" y1="-3.5" x2="7.5" y2="-3.5" />
            <path d="M-5 -8 Q0 -5 5 -8" />
            <path d="M-5 1 Q0 -2 5 1" />
          </g>

          {/* Iconic Spider-Man White Eyes with Black Outline */}
          <path d="M-1.5 -6.5 Q-6.5 -7.5 -6.5 -4 Q-4.5 -2 -1.5 -5 Z" fill="#ffffff" stroke="#0a0a0a" strokeWidth="1.2" />
          <path d="M1.5 -6.5 Q6.5 -7.5 6.5 -4 Q4.5 -2 1.5 -5 Z" fill="#ffffff" stroke="#0a0a0a" strokeWidth="1.2" />
        </g>
      </svg>

      {/* CENTER TIMER TICKING DISPLAY (DIGITS ONLY) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={`font-mono font-bold tracking-wider tabular-nums ${
            size < 110 ? "text-xl" : "text-2xl sm:text-3xl"
          } ${
            urgent
              ? "text-spider-red animate-pulse drop-shadow-[0_0_8px_#e5223b]"
              : "text-paper-white"
          }`}
        >
          {timeString}
        </span>
      </div>
    </div>
  );
}
