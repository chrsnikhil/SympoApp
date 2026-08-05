'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LetterStepper, { decryptLetter } from './LetterStepper';

interface PuzzleBoardProps {
  teamNumber: number;
  onBack: () => void;
}

interface TeamData {
  teamNumber: number;
  encryptedWord: string;
  perLetterGuesses: number[];
}

/**
 * Main cipher workspace — fetches team data, renders per-letter steppers,
 * shows live guess preview, auto-saves progress, submits guess.
 */
export default function PuzzleBoard({ teamNumber, onBack }: PuzzleBoardProps) {
  const router = useRouter();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [shifts, setShifts] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wrongGuess, setWrongGuess] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wrongGuessTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch team data on mount
  useEffect(() => {
    async function fetchTeam() {
      try {
        setLoading(true);
        const res = await fetch(`/api/team/${teamNumber}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load team data');
        }
        const data: TeamData = await res.json();
        setTeamData(data);
        setShifts(data.perLetterGuesses);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchTeam();
  }, [teamNumber]);


  // Auto-save debounced
  const saveProgress = useCallback(
    (newShifts: number[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/team/${teamNumber}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ perLetterGuesses: newShifts }),
          });
        } catch {
          // Silent fail on auto-save — not critical
        }
      }, 800);
    },
    [teamNumber]
  );

  // Handle individual letter shift change
  const handleShiftChange = useCallback(
    (index: number, newShift: number) => {
      setShifts((prev) => {
        const updated = [...prev];
        updated[index] = newShift;
        saveProgress(updated);
        return updated;
      });
    },
    [saveProgress]
  );

  // Assemble current guess from all shifts
  const currentGuess = teamData
    ? teamData.encryptedWord
        .split('')
        .map((char, i) => decryptLetter(char, shifts[i] || 1))
        .join('')
    : '';

  // Submit guess
  const handleSubmit = useCallback(async () => {
    if (!teamData || submitting) return;

    setSubmitting(true);
    setWrongGuess(false);
    setError('');

    // Clear any existing wrong-guess dismiss timer
    if (wrongGuessTimerRef.current) {
      clearTimeout(wrongGuessTimerRef.current);
    }

    try {
      const res = await fetch(`/api/team/${teamNumber}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guessedWord: currentGuess }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit guess');
      }

      const { correct, decryptedWord } = await res.json();

      if (correct) {
        // Success — navigate to result page with decrypted word
        router.push(`/result?team=${teamNumber}&success=true&word=${encodeURIComponent(decryptedWord || currentGuess)}`);
      } else {
        // Wrong guess — stay on puzzle board, show inline error
        setWrongGuess(true);
        setSubmitting(false);
        wrongGuessTimerRef.current = setTimeout(() => setWrongGuess(false), 4000);
      }
    } catch {
      setError('TRANSMISSION FAILED — TRY AGAIN');
      setSubmitting(false);
    }
  }, [teamData, teamNumber, currentGuess, submitting, router]);

  // Loading state
  if (loading) {
    return (
      <div className="puzzle-board fade-in" style={{ justifyContent: 'center', minHeight: '60vh' }}>
        <p className="dimensional-rift">OPENING DIMENSIONAL RIFT...</p>
      </div>
    );
  }

  // Error state
  if (error && !teamData) {
    return (
      <div className="puzzle-board fade-in" style={{ justifyContent: 'center', minHeight: '60vh' }}>
        <p className="team-entry__error">{error}</p>
        <button className="btn-comic--outline btn-comic" onClick={onBack} style={{ marginTop: '1rem' }}>
          GO BACK
        </button>
      </div>
    );
  }

  if (!teamData) return null;

  return (
    <div className="puzzle-board slide-up">
      {/* Header */}
      <div className="puzzle-board__header">
        <button className="btn-back" onClick={onBack} type="button">
          ← CHANGE DIMENSION
        </button>
      </div>

      {/* Encrypted word label */}
      <p className="puzzle-board__encrypted-label">
        ◈ INTERCEPTED SIGNAL ◈
      </p>

      {/* Letter steppers grid */}
      <div className="puzzle-board__letters">
        {teamData.encryptedWord.split('').map((letter, i) => (
          <LetterStepper
            key={i}
            encryptedLetter={letter}
            shiftValue={shifts[i] || 1}
            onChange={(newShift) => handleShiftChange(i, newShift)}
            index={i}
          />
        ))}
      </div>

      <div className="torn-divider" />

      {/* Current guess preview */}
      <div className="guess-preview">
        <span className="guess-preview__label">◈ YOUR DECODED SIGNAL ◈</span>
        <span className="guess-preview__word">{currentGuess}</span>
      </div>

      {/* Wrong guess feedback — inline banner */}
      {wrongGuess && (
        <div className="wrong-guess-banner glitch-shake">
          <p className="wrong-guess-banner__title">SIGNAL LOST // RECALIBRATE</p>
          <p className="wrong-guess-banner__subtitle">Dimensional frequency mismatch — adjust your shifts and try again</p>
        </div>
      )}

      {/* Error message */}
      {error && <p className="team-entry__error">{error}</p>}

      {/* Submit button */}
      <button
        id="engage-portal-btn"
        className="btn-portal"
        onClick={handleSubmit}
        disabled={submitting}
        type="button"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.5 : 1,
          transition: 'opacity 0.2s, transform 0.1s',
        }}
      >
        {submitting ? (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--glitch-yellow)', letterSpacing: '0.1em' }}>
            TRANSMITTING...
          </span>
        ) : (
          <img
            src="/engage-portal.png"
            alt="Engage Portal"
            style={{
              maxWidth: 'min(320px, 70vw)',
              height: 'auto',
              display: 'block',
              margin: '0 auto',
              filter: 'drop-shadow(0 4px 12px rgba(255, 225, 77, 0.3))',
            }}
          />
        )}
      </button>
    </div>
  );
}
