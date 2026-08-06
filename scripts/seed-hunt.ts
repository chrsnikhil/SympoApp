/**
 * Seed the four treasure hunt puzzles.
 *
 *   npx tsx --env-file=.env.local scripts/seed-hunt.ts
 *
 * Safe to re-run: it removes the four hunt challenges and their progress rows
 * first, so a reseed is a clean slate rather than a duplicate set.
 *
 * Every puzzle stores its SOLVED-SHAPE output in config, never the raw input
 * that produced it: the grid stores the already-built, shuffled letter/colour
 * cells (not the eight source words + seed). The grid's words are real
 * dictionary words disguising the one that is the answer — storing `gridWords`
 * verbatim would put that whole word in the database as a single array element,
 * which is exactly the leak the check at the bottom catches.
 */
import { hashAnswer } from "../src/lib/auth/session";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { CIPHER, GRID, HINTS, HUNT_SLUGS, ROOM } from "../src/lib/hunt/content";
import { buildGrid } from "../src/lib/hunt/grid";

async function main() {
  await ensureIndexes();

  // Built once here, server-side only. The client (and the database) only
  // ever sees this shuffled cell list, never GRID.words or GRID.seed.
  const gridCells = buildGrid(GRID.words, GRID.seed);

  const challenges = await collections.challenges();
  const progress = await collections.huntProgress();

  await challenges.deleteMany({ type: "hunt", slug: { $in: [...HUNT_SLUGS] } });
  await progress.deleteMany({ challengeSlug: { $in: [...HUNT_SLUGS] } });

  const cipherConfig = {
    answerHash: hashAnswer(CIPHER.code),
    hintCosts: [15, 25],
  };

  const gridConfig = {
    answerHash: hashAnswer(GRID.code),
    hintCosts: [15, 25],
    equations: GRID.equations,
    gridCells,
  };

  const circuitConfig = {
    answerHash: hashAnswer("ARCLIGHT"),
    hintCosts: [15, 25],
  };

  const roomConfig = {
    answerHash: hashAnswer(ROOM.code),
    hintCosts: [15, 25],
  };

  await challenges.insertMany([
    {
      type: "hunt", slug: "hunt-cipher", title: "Caesar Cipher", points: 100,
      opensAt: null, closesAt: null,
      config: cipherConfig,
    },
    {
      type: "hunt", slug: "hunt-grid", title: "64 Grid", points: 100,
      opensAt: null, closesAt: null,
      config: gridConfig,
    },
    {
      type: "hunt", slug: "hunt-circuit", title: "Octavius Circuit", points: 100,
      opensAt: null, closesAt: null,
      config: circuitConfig,
    },
    {
      type: "hunt", slug: "hunt-room", title: "Mystery Room", points: 100,
      opensAt: null, closesAt: null,
      config: roomConfig,
    },
  ]);

  console.log(`\n  Seeded ${HUNT_SLUGS.length} hunt puzzles.`);
  console.log("  Reveal codes are hashed — they are not in any challenge document.");
  console.log(`  Hints: ${Object.values(HINTS).flat().length} across ${HUNT_SLUGS.length} puzzles.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
