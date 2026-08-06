import { buildGrid } from "@/lib/hunt/grid";
import { GRID } from "@/lib/hunt/content";
import HuntTestClient from "./HuntTestClient";

/**
 * Dev-only test page — renders the 64 Grid puzzle without auth.
 * Navigate to /hunt-test to preview the Spider-Punk UI.
 */
export default function HuntTestPage() {
  const gridCells = buildGrid(GRID.words, GRID.seed);

  return (
    <HuntTestClient
      equations={GRID.equations}
      gridCells={gridCells}
    />
  );
}
