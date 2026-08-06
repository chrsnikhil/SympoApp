import type { ComponentType } from "react";
import SixtyFourGrid from "./puzzles/SixtyFourGrid";
import PlaceholderPuzzle from "./puzzles/PlaceholderPuzzle";

export interface PuzzleProps {
  config: Record<string, unknown>;
  onSolve: (code: string) => void;
}

export interface HuntPuzzle {
  slug: string;
  title: string;
  Component: ComponentType<PuzzleProps>;
}

/**
 * Puzzle registry. Only the 64 Grid is implemented; the others use
 * PlaceholderPuzzle until their components are built.
 */
export const REGISTRY: Record<string, HuntPuzzle> = {
  "hunt-cipher":  { slug: "hunt-cipher",  title: "Caesar Cipher",    Component: PlaceholderPuzzle },
  "hunt-grid":    { slug: "hunt-grid",    title: "64 Grid",          Component: SixtyFourGrid },
  "hunt-circuit": { slug: "hunt-circuit", title: "Octavius Circuit", Component: PlaceholderPuzzle },
  "hunt-room":    { slug: "hunt-room",    title: "Mystery Room",     Component: PlaceholderPuzzle },
};
