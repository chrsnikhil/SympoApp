"use client";

/* ══════════════════════════════════════════════════════════════════════════
 * CenterSpiderWeb — Decorative radial web centered directly behind the input card
 * ══════════════════════════════════════════════════════════════════════════ */

function buildFullWebPath(
  size: number,
  rings: number,
  spokes: number
): string {
  const parts: string[] = [];
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.48;
  const angleStep = (Math.PI * 2) / spokes;

  // Spokes
  for (let s = 0; s < spokes; s++) {
    const angle = s * angleStep;
    const ex = cx + Math.cos(angle) * maxRadius;
    const ey = cy + Math.sin(angle) * maxRadius;
    parts.push(`M${cx.toFixed(1)},${cy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
  }

  // Concentric arc rings with subtle web sag
  for (let r = 1; r <= rings; r++) {
    const radius = (maxRadius / rings) * r;
    for (let s = 0; s < spokes; s++) {
      const a1 = s * angleStep;
      const a2 = (s + 1) * angleStep;
      const x1 = cx + Math.cos(a1) * radius;
      const y1 = cy + Math.sin(a1) * radius;
      const x2 = cx + Math.cos(a2) * radius;
      const y2 = cy + Math.sin(a2) * radius;
      
      const midAngle = (a1 + a2) / 2;
      const sagRadius = radius * 0.93;
      const qx = cx + Math.cos(midAngle) * sagRadius;
      const qy = cy + Math.sin(midAngle) * sagRadius;

      parts.push(
        `M${x1.toFixed(1)},${y1.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
      );
    }
  }

  return parts.join(" ");
}

const SIZE = 700;
const RINGS = 7;
const SPOKES = 16;
const WEB_PATH = buildFullWebPath(SIZE, RINGS, SPOKES);

export default function CenterSpiderWeb() {
  return (
    <div className="center-web-container pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 flex items-center justify-center w-[600px] h-[600px] md:w-[750px] md:h-[750px] overflow-visible opacity-45">
      <svg
        className="center-spider-web w-full h-full"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer ambient glow */}
        <filter id="web-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <path
          d={WEB_PATH}
          stroke="url(#web-gradient)"
          strokeWidth="1.2"
          strokeLinecap="round"
          filter="url(#web-glow)"
        />

        <defs>
          <linearGradient id="web-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--glitch-cyan, #00f5d4)" stopOpacity="0.8" />
            <stop offset="50%" stopColor="rgba(242, 239, 233, 0.6)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--punk-magenta, #f72585)" stopOpacity="0.8" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
