"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════════════
 * WebShooter — Spider-Man web shooter image + animated web strand
 *
 * Renders the web-shooter.png image at the bottom-right of the viewport.
 * When the target button (identified by CSS selector) is clicked, a web
 * strand shoots from the image to the button with a "shooting" effect.
 * The web only fires on button click — no auto-fire.
 *
 * Props:
 *   targetSelector — CSS selector for the button the web connects to
 * ══════════════════════════════════════════════════════════════════════════ */

interface WebShooterProps {
  targetSelector: string;
  shootDelay?: number;
}

export default function WebShooter({
  targetSelector,
}: WebShooterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [webPath, setWebPath] = useState<string>("");
  const [pathLength, setPathLength] = useState(0);
  const [fired, setFired] = useState(false);
  const [connected, setConnected] = useState(false);
  const pathRef = useRef<SVGPathElement>(null);
  const shooterRef = useRef<HTMLDivElement>(null);

  /* ── Calculate the path from shooter image to button ─────────────────── */
  const computePath = useCallback(() => {
    const target = document.querySelector(targetSelector);
    const shooter = shooterRef.current;
    if (!target || !shooter) return;

    const targetRect = target.getBoundingClientRect();
    const shooterRect = shooter.getBoundingClientRect();

    // Shooter position: tip of the fist (upper area of the centered image)
    const startX = shooterRect.left + shooterRect.width * 0.4;
    const startY = shooterRect.top + shooterRect.height * 0.08;

    // Target: center of the button
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    // Curved path from shooter to button
    const midY = (startY + endY) / 2;
    const cpOffset = (startX - endX) * 0.3;

    const path = `M${startX},${startY} C${startX + cpOffset},${midY} ${endX - cpOffset},${midY} ${endX},${endY}`;
    setWebPath(path);
  }, [targetSelector]);

  /* ── Measure path length after path is set ──────────────────────────── */
  useEffect(() => {
    if (pathRef.current && webPath) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [webPath]);

  /* ── Initial compute + resize handler ───────────────────────────────── */
  useEffect(() => {
    // Small delay so target button is rendered
    const timer = setTimeout(() => {
      computePath();
    }, 100);

    const handleResize = () => {
      computePath();
      // Reset web on resize
      setFired(false);
      setConnected(false);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [computePath]);

  /* ── Fire the web ONLY when target button is clicked ────────────────── */
  useEffect(() => {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    const handleClick = () => {
      // Recompute path in case layout shifted
      computePath();

      // Reset and re-fire for repeated clicks
      setFired(false);
      setConnected(false);

      // Small delay to allow path recalculation then fire
      requestAnimationFrame(() => {
        setFired(true);

        // After the strand finishes animating, mark as connected
        setTimeout(() => {
          setConnected(true);
          target.classList.add("web-connected-glow");
        }, 600);
      });
    };

    target.addEventListener("click", handleClick);
    return () => {
      target.removeEventListener("click", handleClick);
    };
  }, [targetSelector, computePath]);

  return (
    <>
      {/* Full-viewport SVG for the web strand */}
      <svg
        ref={svgRef}
        className="web-strand-svg"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 50,
        }}
      >
        {/* Glow filter */}
        <defs>
          <filter id="web-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="web-strand-grad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#F2EFE9" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#F2EFE9" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#F2EFE9" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {webPath && fired && (
          <>
            {/* Background glow strand */}
            <path
              d={webPath}
              fill="none"
              stroke="rgba(242, 239, 233, 0.15)"
              strokeWidth="4"
              filter="url(#web-glow)"
              className="web-strand-path web-strand-fired"
              style={{
                strokeDasharray: pathLength,
                strokeDashoffset: 0,
              }}
            />
            {/* Main strand */}
            <path
              ref={pathRef}
              d={webPath}
              fill="none"
              stroke="url(#web-strand-grad)"
              strokeWidth="1.5"
              strokeLinecap="round"
              filter="url(#web-glow)"
              className={`web-strand-path web-strand-fired ${connected ? "web-strand-connected" : ""}`}
              style={{
                strokeDasharray: pathLength,
                strokeDashoffset: 0,
              }}
            />
            {/* Thin highlight strand */}
            <path
              d={webPath}
              fill="none"
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth="0.5"
              className="web-strand-path web-strand-fired"
              style={{
                strokeDasharray: pathLength,
                strokeDashoffset: 0,
              }}
            />
          </>
        )}

        {/* Hidden path for measurement when not fired */}
        {webPath && !fired && (
          <path
            ref={pathRef}
            d={webPath}
            fill="none"
            stroke="transparent"
            strokeWidth="0"
          />
        )}

        {/* Impact splat at button connection point */}
        {connected && webPath && (() => {
          const target = document.querySelector(targetSelector);
          if (!target) return null;
          const rect = target.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          return (
            <g className="web-impact-splat">
              {/* Small radial web lines at impact */}
              {Array.from({ length: 8 }).map((_, i) => {
                const angle = (i * Math.PI * 2) / 8;
                const len = 12 + (i % 2) * 6;
                return (
                  <line
                    key={i}
                    x1={cx}
                    y1={cy}
                    x2={cx + Math.cos(angle) * len}
                    y2={cy + Math.sin(angle) * len}
                    stroke="rgba(242, 239, 233, 0.4)"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Small web circle at impact */}
              <circle
                cx={cx}
                cy={cy}
                r="3"
                fill="none"
                stroke="rgba(242, 239, 233, 0.3)"
                strokeWidth="0.8"
              />
            </g>
          );
        })()}
      </svg>

      {/* Web Shooter Image */}
      <div ref={shooterRef} className="web-shooter-device">
        <img
          src="/web-shooter.png"
          alt="Spider-Man Web Shooter"
          className={`web-shooter-image ${fired ? "web-shooter-image-fired" : ""}`}
          draggable={false}
        />
      </div>
    </>
  );
}
