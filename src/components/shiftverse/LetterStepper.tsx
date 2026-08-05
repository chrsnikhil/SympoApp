'use client';

import React, { useCallback } from 'react';
import { applyShiftToLetter } from '@/lib/cipher';

interface LetterStepperProps {
  /** The encrypted letter to display */
  encryptedLetter: string;
  /** Current shift value (1–100) */
  shiftValue: number;
  /** Callback when shift value changes */
  onChange: (newShift: number) => void;
  /** Index for unique key/ID */
  index: number;
}

/**
 * Individual per-letter shift control — a torn comic-panel card.
 * Shows encrypted letter, shift stepper (▲/▼), shift value, and resulting guess.
 * No correctness feedback whatsoever.
 */
export default function LetterStepper({
  encryptedLetter,
  shiftValue,
  onChange,
  index,
}: LetterStepperProps) {
  const increment = useCallback(() => {
    const next = shiftValue >= 100 ? 1 : shiftValue + 1;
    onChange(next);
  }, [shiftValue, onChange]);

  const decrement = useCallback(() => {
    const next = shiftValue <= 1 ? 100 : shiftValue - 1;
    onChange(next);
  }, [shiftValue, onChange]);

  const guessedLetter = applyShiftToLetter(encryptedLetter, shiftValue);

  return (
    <div className="letter-stepper" id={`letter-stepper-${index}`}>
      {/* Encrypted letter (cipher text) */}
      <span className="letter-stepper__encrypted" aria-label={`Encrypted letter ${index + 1}`}>
        {encryptedLetter}
      </span>

      <div className="letter-stepper__divider" />

      {/* Up button */}
      <button
        className="letter-stepper__btn"
        onClick={increment}
        aria-label={`Increase shift for letter ${index + 1}`}
        type="button"
      >
        ▲
      </button>

      {/* Down button */}
      <button
        className="letter-stepper__btn"
        onClick={decrement}
        aria-label={`Decrease shift for letter ${index + 1}`}
        type="button"
      >
        ▼
      </button>

      <div className="letter-stepper__divider" />

      {/* Resulting guessed letter */}
      <span className="letter-stepper__result" aria-label={`Guessed letter ${index + 1}: ${guessedLetter}`}>
        {guessedLetter}
      </span>
    </div>
  );
}
