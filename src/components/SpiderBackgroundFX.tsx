"use client";

import { useEffect, useRef } from "react";

interface Spider {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  size: number;
  angle: number;
  pauseTimer: number;
  legPhase: number;
}

export default function SpiderBackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Force-hide default system cursor over all elements including buttons and links
    const styleEl = document.createElement("style");
    styleEl.id = "spider-hide-default-cursor";
    styleEl.innerHTML = `
      *, *::before, *::after, button, a, input, select, textarea, [role="button"] {
        cursor: none !important;
      }
    `;
    document.head.appendChild(styleEl);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Mouse positions
    let mouseX = -100;
    let mouseY = -100;
    let cursorX = -100;
    let cursorY = -100;
    let hasMouseMoved = false;
    let isHovering = false;
    let rotationAngle = 0;

    // 1. Mouse Trail & Hover Detection
    const trailPoints: Array<{ x: number; y: number; life: number; maxLife: number }> = [];

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      hasMouseMoved = true;

      trailPoints.push({
        x: e.clientX,
        y: e.clientY,
        life: 1.0,
        maxLife: 30, // frames to live
      });
      if (trailPoints.length > 25) {
        trailPoints.shift();
      }

      // Check if mouse is over interactive element
      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = Boolean(
          target.closest("button") ||
            target.closest("a") ||
            target.closest("input") ||
            target.tagName === "BUTTON" ||
            target.tagName === "A" ||
            target.tagName === "INPUT"
        );
        isHovering = isInteractive;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    // 2. Initialize 3 Random Crawling Spiders
    const spiders: Spider[] = Array.from({ length: 3 }).map(() => {
      const rx = Math.random() * width;
      const ry = Math.random() * height;
      return {
        x: rx,
        y: ry,
        targetX: Math.random() * width,
        targetY: Math.random() * height,
        speed: 1.5 + Math.random() * 1.5,
        size: 16 + Math.random() * 8,
        angle: 0,
        pauseTimer: Math.random() * 100,
        legPhase: Math.random() * Math.PI * 2,
      };
    });

    // Helper: Draw a realistic 8-legged spider
    const drawSpider = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      size: number,
      angle: number,
      legPhase: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2); // align forward movement

      // Glow behind spider
      ctx.shadowColor = "rgba(220, 38, 38, 0.8)";
      ctx.shadowBlur = 12;

      // Abdomen (rear)
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.ellipse(0, size * 0.4, size * 0.35, size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cephalothorax (head/front)
      ctx.fillStyle = "#991b1b";
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.1, size * 0.25, size * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Spider Legs (4 on left, 4 on right)
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(1.5, size * 0.08);
      ctx.lineCap = "round";

      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * (size * 0.2);
        const legWiggle = Math.sin(legPhase + i * 1.2) * (size * 0.15);

        // Left Leg
        ctx.beginPath();
        ctx.moveTo(-size * 0.1, offset);
        ctx.lineTo(-size * 0.7 - legWiggle, offset - size * 0.3);
        ctx.lineTo(-size * 0.9, offset + size * 0.2);
        ctx.stroke();

        // Right Leg
        ctx.beginPath();
        ctx.moveTo(size * 0.1, offset);
        ctx.lineTo(size * 0.7 + legWiggle, offset - size * 0.3);
        ctx.lineTo(size * 0.9, offset + size * 0.2);
        ctx.stroke();
      }

      ctx.restore();
    };

    // Helper: Draw Aero-Style Spider-Verse Arrow Cursor
    const drawCustomCursor = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);

      const scale = isHovering ? 1.2 : 1.0;
      ctx.scale(scale, scale);

      // Neon Glow behind Aero Cursor
      ctx.shadowColor = isHovering ? "rgba(6, 182, 212, 0.9)" : "rgba(220, 38, 38, 0.85)";
      ctx.shadowBlur = isHovering ? 14 : 10;

      // Aero Arrow Cursor Path (Tip anchored at 0,0)
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 19);
      ctx.lineTo(4.8, 14.5);
      ctx.lineTo(8.5, 21);
      ctx.lineTo(11.5, 19.5);
      ctx.lineTo(7.8, 13);
      ctx.lineTo(13.5, 13);
      ctx.closePath();

      // Spider-Verse Dark Red/Crimson Body Gradient
      const grad = ctx.createLinearGradient(0, 0, 12, 20);
      if (isHovering) {
        grad.addColorStop(0, "#0891b2"); // Cyan highlight on hover
        grad.addColorStop(1, "#0e7490");
      } else {
        grad.addColorStop(0, "#e11d48"); // Spider-Verse Neon Crimson
        grad.addColorStop(1, "#9f1239");
      }
      ctx.fillStyle = grad;
      ctx.fill();

      // Crisp Neon Outline
      ctx.strokeStyle = isHovering ? "#22d3ee" : "#fda4af";
      ctx.lineWidth = 1.4;
      ctx.lineJoin = "miter";
      ctx.stroke();

      ctx.restore();
    };

    // Main render loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1:1 Instant Tip tracking for precise clicking
      cursorX = mouseX;
      cursorY = mouseY;

      // ── 1. DRAW SPIDER WEB TRAIL ──────────────────────────────────────────
      for (let i = 0; i < trailPoints.length; i++) {
        const pt = trailPoints[i];
        pt.life -= 1 / pt.maxLife;
        if (pt.life <= 0) {
          trailPoints.splice(i, 1);
          i--;
          continue;
        }

        // Draw connections to nearby historic points (web effect)
        for (let j = i + 1; j < trailPoints.length; j++) {
          const pt2 = trailPoints[j];
          const dist = Math.hypot(pt2.x - pt.x, pt2.y - pt.y);

          if (dist < 120) {
            const alpha = (1 - dist / 120) * pt.life * 0.6;
            ctx.strokeStyle = `rgba(236, 72, 153, ${alpha})`;
            ctx.lineWidth = 1.2;
            ctx.shadowColor = "rgba(220, 38, 38, 0.5)";
            ctx.shadowBlur = 6;

            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();

            ctx.fillStyle = `rgba(244, 114, 182, ${alpha * 0.8})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ── 2. UPDATE & DRAW RANDOMLY MOVING SPIDERS ─────────────────────────
      for (const spider of spiders) {
        if (spider.pauseTimer > 0) {
          spider.pauseTimer -= 1;
        } else {
          const dx = spider.targetX - spider.x;
          const dy = spider.targetY - spider.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 20) {
            spider.targetX = Math.random() * width;
            spider.targetY = Math.random() * height;
            spider.pauseTimer = 30 + Math.random() * 90;
          } else {
            spider.angle = Math.atan2(dy, dx);
            spider.x += Math.cos(spider.angle) * spider.speed;
            spider.y += Math.sin(spider.angle) * spider.speed;
            spider.legPhase += 0.2;
          }
        }

        drawSpider(ctx, spider.x, spider.y, spider.size, spider.angle, spider.legPhase);
      }

      // ── 3. DRAW SPIDER-VERSE RETICLE CURSOR ────────────────────────────────
      if (hasMouseMoved) {
        drawCustomCursor(ctx, cursorX, cursorY);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      document.getElementById("spider-hide-default-cursor")?.remove();
      document.body.style.cursor = "default";
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
    />
  );
}
