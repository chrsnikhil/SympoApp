'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Logo from '@/components/shiftverse/Logo';

const PortalBackground = dynamic(() => import('@/components/shiftverse/PortalBackground'), {
  ssr: false,
});

/**
 * Results screen content — reads search params for team number and success/failure
 */
function ResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const teamNumber = searchParams.get('team') || '??';
  const success = searchParams.get('success') === 'true';
  const decryptedWord = searchParams.get('word') || '';

  return (
    <>
      {/* Animated background */}
      <Suspense fallback={null}>
        <PortalBackground />
      </Suspense>

      <div
        className={`result-screen ${success ? 'result-screen--success' : 'result-screen--failure'}`}
      >
        {/* Logo at top */}
        <div style={{ position: 'absolute', top: '2rem' }}>
          <Logo />
        </div>

        {/* Main result message */}
        {success ? (
          <>
            <h1 className="result-screen__title">
              DIMENSIONAL LOCK<br />ACQUIRED
            </h1>
            <p className="result-screen__subtitle">
              Signal decoded // Your dimension is stable
            </p>

            {/* Decrypted word reveal */}
            {decryptedWord && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem 2rem',
                background: 'rgba(0, 240, 255, 0.08)',
                border: '2px solid var(--dimensional-cyan)',
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.15), inset 0 0 20px rgba(0, 240, 255, 0.05)',
                textAlign: 'center',
              }}>
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'clamp(0.6rem, 1.2vw, 0.75rem)',
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: 'var(--dimensional-cyan)',
                  opacity: 0.7,
                  marginBottom: '0.5rem',
                }}>
                  ◈ DECRYPTED SIGNAL ◈
                </p>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.8rem, 5vw, 3rem)',
                  letterSpacing: '0.15em',
                  color: 'var(--ink-white)',
                  textShadow: '3px 3px 0px var(--electric-magenta), -2px -2px 0px var(--dimensional-cyan)',
                }}>
                  {decryptedWord}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="result-screen__title">
              SIGNAL LOST //<br />RECALIBRATE
            </h1>
            <p className="result-screen__subtitle">
              Dimensional frequency mismatch detected
            </p>
          </>
        )}


        <p className="result-screen__team">
          DIMENSION #{teamNumber}
        </p>

        {/* Action buttons */}
        <div className="result-screen__actions">
          {success ? (
            <button
              id="result-home-btn"
              className="btn-comic btn-comic--cyan"
              onClick={() => router.push('/')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <img
                src="/return-to-nexus.png"
                alt="Return to Nexus"
                style={{
                  maxWidth: 'min(300px, 70vw)',
                  height: 'auto',
                  display: 'block',
                  filter: 'drop-shadow(0 4px 12px rgba(255, 225, 77, 0.3))',
                }}
              />
            </button>
          ) : (
            <>
              <button
                id="result-retry-btn"
                className="btn-comic"
                onClick={() => router.push('/')}
              >
                RECALIBRATE SIGNAL
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Result page — full-screen success/failure state
 * Wraps ResultContent in Suspense for useSearchParams
 */
export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <div className="result-screen result-screen--failure">
          <p className="dimensional-rift">STABILIZING DIMENSION...</p>
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
