import type { ComponentType } from "react";
import SixtyFourGrid from "./puzzles/SixtyFourGrid";
import PlaceholderPuzzle from "./puzzles/PlaceholderPuzzle";

export interface PuzzleProps {
  config: Record<string, unknown>;
  /**
   * Report the player's current proposed answer to the shell, which drops it
   * into the answer box.
   *
   * This is NOT "the puzzle is solved". A puzzle component cannot know that,
   * and must not try: the previous prop was `onSolve(code)`, called with a
   * constant the component compared the player's typing against locally, which
   * is only possible if the reveal code is in the client bundle. It was — all
   * four of them, in the chunk for this route.
   *
   * The server's hash check against `challenge.config.answerHash` is the only
   * judge. See HuntShell.submit.
   */
  onAnswer: (answer: string) => void;
}

export interface HuntPuzzle {
  slug: string;
  title: string;
  Component: ComponentType<PuzzleProps>;
}

/**
 * Puzzle registry. Only the 64 Grid is implemented; the others use
 * PlaceholderPuzzle until their components are built.
 *
 * This is the client-side half of a fact whose server-side half is
 * PLAYABLE_HUNT_SLUGS in `src/lib/hunt/content.ts`. Neither can be derived from
 * the other — this file imports React components, so it cannot be pulled into a
 * route handler — which means shipping a puzzle is a two-line change: give it a
 * real Component here, and add its slug there.
 *
 * `/api/hunt/progress` returns only the slugs on that list, so anything still
 * mapped to PlaceholderPuzzle below is never rendered rather than shown as a
 * "Coming Soon" tile a team cannot solve.
 */
export const REGISTRY: Record<string, HuntPuzzle> = {
  "hunt-cipher":  { slug: "hunt-cipher",  title: "Caesar Cipher",    Component: PlaceholderPuzzle },
  "hunt-grid":    { slug: "hunt-grid",    title: "64 Grid",          Component: SixtyFourGrid },
  "hunt-circuit": { slug: "hunt-circuit", title: "Octavius Circuit", Component: PlaceholderPuzzle },
  "hunt-room":    { slug: "hunt-room",    title: "Mystery Room",     Component: PlaceholderPuzzle },
};
