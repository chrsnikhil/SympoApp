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

// The circuit game is a canvas app that reaches for the DOM on init, so it
// must not be server-rendered.
const OctaviusCircuit = dynamic(() => import("./puzzles/OctaviusCircuit"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-paper-white/70">Powering up the board…</p>,
});

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
  // Five levels, one component. Which level it loads is the game's own state;
  // which challenge a win is credited to comes from the slug the game posts.
  "circuit-1":    { slug: "circuit-1",    title: "Octavius Circuit", Component: OctaviusCircuit as unknown as ComponentType<PuzzleProps> },
  "circuit-2":    { slug: "circuit-2",    title: "Octavius Circuit II", Component: OctaviusCircuit as unknown as ComponentType<PuzzleProps> },
  "circuit-3":    { slug: "circuit-3",    title: "Octavius Circuit III", Component: OctaviusCircuit as unknown as ComponentType<PuzzleProps> },
  "circuit-4":    { slug: "circuit-4",    title: "Octavius Circuit IV", Component: OctaviusCircuit as unknown as ComponentType<PuzzleProps> },
  "circuit-5":    { slug: "circuit-5",    title: "Octavius Circuit V", Component: OctaviusCircuit as unknown as ComponentType<PuzzleProps> },
};
