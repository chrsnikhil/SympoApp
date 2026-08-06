import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { buildGrid } from "@/lib/hunt/grid";
import { GRID } from "@/lib/hunt/content";
import HuntTestClient from "./HuntTestClient";

/**
 * Preview harness for the 64 Grid UI. Admins only.
 *
 * This page builds the grid from the REAL seeded content — the same words and
 * seed a team plays — so it is a practice copy of the live puzzle. The proxy
 * gates it behind a session, which keeps it away from the public, but every
 * entrant has a session too: gating alone let any team open the puzzle here,
 * work the answer out at leisure, and carry it to /hunt.
 *
 * The role check is the actual boundary. `notFound()` rather than a 403 so the
 * route does not advertise that it exists.
 */
export default async function HuntTestPage() {
  const session = await getSession();
  if (session?.role !== "admin") notFound();

  const gridCells = buildGrid(GRID.words, GRID.seed);

  return (
    <HuntTestClient
      equations={GRID.equations}
      gridCells={gridCells}
    />
  );
}
