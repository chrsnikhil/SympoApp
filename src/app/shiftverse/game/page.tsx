'use client';

import ShiftVerse from '@/components/shiftverse/ShiftVerse';

/**
 * ShiftVerse renders its own PortalBackground — this page must not add a second.
 *
 * It used to render one here as well, so the game mounted TWO full-screen
 * `<Canvas>` elements: two WebGL contexts, two requestAnimationFrame loops, and
 * two copies of a 600-iteration per-frame loop mutating a Float32Array. On a
 * phone on venue wifi that is double the GPU work for an effect nobody can see
 * twice, and mobile Safari caps concurrent WebGL contexts — it drops one
 * silently, so which of the two survived was luck.
 *
 * The result page still renders its own, correctly: ShiftVerse is not mounted
 * there, so nothing else provides it.
 */
export default function GamePage() {
  return <ShiftVerse />;
}
