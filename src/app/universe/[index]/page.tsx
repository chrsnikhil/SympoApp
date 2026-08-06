import UniverseLanding from "./UniverseLanding";
import { UNIVERSES } from "../universeData";
import { buildUniverseGrid } from "../universeGrid";
import { UNIVERSE_WORDS } from "@/lib/universe/words";

/** Fixed seed — deterministic grid layout across all sessions. */
const GRID_SEED = 0xdead_beef;

export function generateStaticParams() {
  return UNIVERSES.map((u) => ({ index: String(u.index) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;
  const idx = parseInt(index, 10);
  const universe = UNIVERSES[idx];

  if (!universe) {
    return { title: "Unknown Universe" };
  }

  return {
    title: `${universe.codename} — ${universe.designation} | Find Your Universe`,
    description: universe.tagline,
  };
}

/**
 * NOTHING SECRET MAY BE PASSED TO <UniverseLanding />. It is "use client", so
 * every prop is serialised into the RSC flight payload, and generateStaticParams
 * above prerenders indices 0–7 at build time — so a prop here is not merely
 * visible in devtools, it is written into static HTML on disk and served to
 * everyone.
 *
 * This page used to pass `answerWord={universe.word}`, which put all eight
 * answers on the wire. The words now live in `@/lib/universe/words`, which is
 * `server-only`; the client gets the shuffled letter/colour pairs, which is
 * exactly what the puzzle is meant to show, and guesses are checked at
 * /api/universe-word/verify.
 */
export default async function UniversePage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;

  // Dynamically compute the grid cells per request from the latest word list.
  // Never compute at top-level module scope to avoid Next.js module caching issues.
  const gridCells = buildUniverseGrid([...UNIVERSE_WORDS], GRID_SEED);

  return <UniverseLanding index={index} gridCells={gridCells} />;
}
