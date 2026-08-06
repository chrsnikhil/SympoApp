"use client";

/* ══════════════════════════════════════════════════════════════════════════
 * SpiderWebCorners — Decorative SVG spider web patterns in screen corners
 *
 * Renders translucent web patterns in all four corners of the viewport.
 * Each web is a radial pattern of concentric arcs connected by radial
 * spokes, inspired by classic Spider-Man comic aesthetics.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Generates an SVG path string for a quarter-circle spider web
 * anchored at the origin (0,0) expanding into the given quadrant.
 */
function buildWebPath(
  size: number,
  rings: number,
  spokes: number,
): string {
  const parts: string[] = [];
  const angleStep = (Math.PI / 2) / (spokes - 1);

  // Radial spokes
  for (let s = 0; s < spokes; s++) {
    const angle = s * angleStep;
    const ex = Math.cos(angle) * size;
    const ey = Math.sin(angle) * size;
    parts.push(`M0,0 L${ex.toFixed(2)},${ey.toFixed(2)}`);
  }

  // Concentric arcs between spokes
  for (let r = 1; r <= rings; r++) {
    const radius = (size / rings) * r;
    for (let s = 0; s < spokes - 1; s++) {
      const a1 = s * angleStep;
      const a2 = (s + 1) * angleStep;
      const x1 = Math.cos(a1) * radius;
      const y1 = Math.sin(a1) * radius;
      const x2 = Math.cos(a2) * radius;
      const y2 = Math.sin(a2) * radius;
      parts.push(`M${x1.toFixed(2)},${y1.toFixed(2)} A${radius.toFixed(2)},${radius.toFixed(2)} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)}`);
    }
  }

  return parts.join(" ");
}

const WEB_SIZE = 180;
const RINGS = 5;
const SPOKES = 8;
const webPath = buildWebPath(WEB_SIZE, RINGS, SPOKES);

interface CornerWebProps {
  /** CSS transform to rotate/flip the web into a corner */
  transform: string;
  /** Positioning style */
  style: React.CSSProperties;
  delay?: number;
}

function CornerWeb({ transform, style, delay = 0 }: CornerWebProps) {
  return (
    <svg
      className="spider-web-corner"
      width={WEB_SIZE}
      height={WEB_SIZE}
      viewBox={`0 0 ${WEB_SIZE} ${WEB_SIZE}`}
      style={{ ...style, animationDelay: `${delay}s` }}
    >
      <g transform={transform}>
        <path
          d={webPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export default function SpiderWebCorners() {
  return (
    <>
      {/* Top-left */}
      <CornerWeb
        transform={`translate(0,0)`}
        style={{ position: "fixed", top: 0, left: 0, zIndex: 2 }}
        delay={0}
      />
      {/* Top-right (flip horizontally) */}
      <CornerWeb
        transform={`translate(${WEB_SIZE},0) scale(-1,1)`}
        style={{ position: "fixed", top: 0, right: 0, zIndex: 2 }}
        delay={0.3}
      />
      {/* Bottom-left (flip vertically) */}
      <CornerWeb
        transform={`translate(0,${WEB_SIZE}) scale(1,-1)`}
        style={{ position: "fixed", bottom: 0, left: 0, zIndex: 2 }}
        delay={0.6}
      />
      {/* Bottom-right (flip both) */}
      <CornerWeb
        transform={`translate(${WEB_SIZE},${WEB_SIZE}) scale(-1,-1)`}
        style={{ position: "fixed", bottom: 0, right: 0, zIndex: 2 }}
        delay={0.9}
      />
    </>
  );
}
