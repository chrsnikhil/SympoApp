'use client';
import { useEffect, useRef } from 'react';

/**
 * TvStaticBackground
 * High-performance 2D Canvas monochrome analog TV snow / static animation.
 * Runs at ~30 FPS with minimal CPU overhead.
 */
export default function TvStaticBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let timeoutId;
    let animId;

    function resize() {
      if (!canvas) return;
      canvas.width = Math.floor(window.innerWidth / 2);
      canvas.height = Math.floor(window.innerHeight / 2);
    }

    resize();
    window.addEventListener('resize', resize);

    function render() {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      const imgData = ctx.createImageData(w, h);
      const buffer = new Uint32Array(imgData.data.buffer);
      const len = buffer.length;

      for (let i = 0; i < len; i++) {
        const val = Math.random() < 0.45 ? Math.floor(Math.random() * 30) : Math.floor(Math.random() * 215 + 40);
        buffer[i] = (255 << 24) | (val << 16) | (val << 8) | val;
      }

      ctx.putImageData(imgData, 0, 0);

      timeoutId = setTimeout(() => {
        animId = requestAnimationFrame(render);
      }, 33); // ~30 FPS
    }

    render();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none opacity-12 mix-blend-screen z-0 [image-rendering:pixelated]"
    />
  );
}
