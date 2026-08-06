import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import SixtyFourGrid from "./puzzles/SixtyFourGrid";
import PlaceholderPuzzle from "./puzzles/PlaceholderPuzzle";

export interface PuzzleProps {
  config: Record<string, unknown>;
  onAnswer?: (answer: string) => void;
  onSolve?: (code: string) => void;
}

export interface HuntPuzzle {
  slug: string;
  title: string;
  Component: ComponentType<PuzzleProps>;
}

const MysteryRoom = dynamic(() => import("./puzzles/MysteryRoom"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-paper-white/70">Entering the room…</p>,
});

/**
 * Puzzle registry.
 */
export const REGISTRY: Record<string, HuntPuzzle> = {
  "hunt-cipher":  { slug: "hunt-cipher",  title: "Caesar Cipher",    Component: PlaceholderPuzzle },
  "hunt-grid":    { slug: "hunt-grid",    title: "64 Grid",          Component: SixtyFourGrid },
  "hunt-circuit": { slug: "hunt-circuit", title: "Octavius Circuit", Component: PlaceholderPuzzle },
  "hunt-room":    { slug: "hunt-room",    title: "Mystery Room",     Component: MysteryRoom as unknown as ComponentType<PuzzleProps> },
};
