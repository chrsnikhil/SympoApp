"use client";

import type { PuzzleProps } from "../registry";

/**
 * Placeholder for puzzles not yet implemented.
 * Shows a Spider-Punk styled "coming soon" message.
 */
export default function PlaceholderPuzzle({ config, onAnswer }: PuzzleProps) {
  // Silence unused-var warnings — these props are part of the PuzzleProps
  // contract and will be wired once each puzzle is implemented.
  void config;
  void onAnswer;

  return (
    <div className="panel halftone relative p-8 text-center">
      <div className="punk-sticker mb-4">Under Construction</div>
      <p className="display-title text-2xl text-paper-white chromatic">
        Coming Soon
      </p>
      <p className="mt-3 text-sm text-paper-white/50">
        This puzzle is being wired up. Check back soon.
      </p>
      <div className="punk-divider mt-6" />
      <p className="text-xs text-paper-white/30 font-mono">
        {"// TODO: implement puzzle logic"}
      </p>
    </div>
  );
}
