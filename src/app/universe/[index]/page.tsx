import UniverseLanding from "./UniverseLanding";
import { UNIVERSES } from "../universeData";
import { buildUniverseGrid } from "../universeGrid";

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

export default async function UniversePage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;
  const idx = parseInt(index, 10);
  const universe = UNIVERSES[idx];

  // Dynamically compute the grid cells per request from the latest UNIVERSES array.
  // Never compute at top-level module scope to avoid Next.js module caching issues.
  const gridCells = buildUniverseGrid(
    UNIVERSES.map((u) => u.word),
    GRID_SEED
  );

  return (
    <UniverseLanding
      index={index}
      gridCells={gridCells}
      answerWord={universe?.word ?? ""}
    />
  );
}
