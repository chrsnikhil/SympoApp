'use client';

import React, { useState, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Logo from './Logo';
import TeamEntry from './TeamEntry';
import PuzzleBoard from './PuzzleBoard';

// Dynamically import PortalBackground with no SSR (Three.js requires browser)
const PortalBackground = dynamic(() => import('./PortalBackground'), {
  ssr: false,
});

type AppState = 'ENTRY' | 'PUZZLE';

/**
 * Main orchestrator component for SHIFT://VERSE
 * State machine: ENTRY → PUZZLE (→ navigates to /result on submit)
 */
export default function ShiftVerse() {
  const [appState, setAppState] = useState<AppState>('ENTRY');
  const [teamNumber, setTeamNumber] = useState<number | null>(null);

  const handleTeamSelect = useCallback((num: number) => {
    setTeamNumber(num);
    setAppState('PUZZLE');
  }, []);

  const handleBack = useCallback(() => {
    setTeamNumber(null);
    setAppState('ENTRY');
  }, []);

  return (
    <>
      {/* Animated 3D background */}
      <Suspense fallback={null}>
        <PortalBackground />
      </Suspense>

      {/* Content layer above background + overlays */}
      <div className="content-layer">
        {/* Logo — always visible */}
        <div style={{ marginBottom: appState === 'ENTRY' ? '2rem' : '1rem', marginTop: '2rem' }}>
          <Logo />
        </div>

        {/* State-dependent content */}
        {appState === 'ENTRY' && (
          <TeamEntry onTeamSelect={handleTeamSelect} />
        )}

        {appState === 'PUZZLE' && teamNumber !== null && (
          <PuzzleBoard teamNumber={teamNumber} onBack={handleBack} />
        )}
      </div>
    </>
  );
}
