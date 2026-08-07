'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Logo from './Logo';
import PuzzleBoard from './PuzzleBoard';

// Dynamically import PortalBackground with no SSR (Three.js requires browser)
const PortalBackground = dynamic(() => import('./PortalBackground'), {
  ssr: false,
});

/**
 * Main orchestrator component for SHIFT://VERSE.
 *
 * There used to be a team-number entry step here (ENTRY -> PUZZLE), but that
 * let anyone type any of 1-40 and load someone else's board. Identity now
 * comes from the signed session cookie via `/api/shiftverse/state`, so a
 * signed-in team goes straight to its own puzzle — there's nothing left to
 * pick.
 */
export default function ShiftVerse() {
  return (
    <>
      {/* Animated 3D background */}
      <Suspense fallback={null}>
        <PortalBackground />
      </Suspense>

      {/* Content layer above background + overlays */}
      <div className="content-layer">
        {/* Logo — always visible */}
        <div style={{ marginBottom: '1rem', marginTop: '2rem' }}>
          <Logo />
        </div>

        <PuzzleBoard />
      </div>
    </>
  );
}
