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
import { LEVELS } from "../src/lib/octovius/levels";
import { buildGrid } from "../src/lib/hunt/grid";

async function main() {
  await ensureIndexes();

  // Built once here, server-side only. The client (and the database) only
  // ever sees this shuffled cell list, never GRID.words or GRID.seed.
  const gridCells = buildGrid(GRID.words, GRID.seed);

  const challenges = await collections.challenges();
  const progress = await collections.huntProgress();

  /**
   * Delete only the rounds THIS script owns.
   *
   * HUNT_SLUGS is every hunt round, and hunt-shiftverse is seeded by
   * seed-shiftverse.ts — it needs the 40 team slots written alongside it, which
   * this script knows nothing about. Deleting the whole list here removed it and
   * never put it back, so running the two seeds in the wrong order silently
   * unshipped Shift-Verse, and re-running this one later would have done it
   * again long after anybody connected the two.
   *
   * A seed may only clear what it can restore.
   */
  const OWNED = HUNT_SLUGS.filter((s) => s !== "hunt-shiftverse");

  await challenges.deleteMany({ type: "hunt", slug: { $in: [...OWNED] } });
  await progress.deleteMany({ challengeSlug: { $in: [...OWNED] } });

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

  /**
   * The universe round carries NO answerHash, deliberately.
   *
   * It has eight answers — a team is routed to one of eight universes by its
   * team number, and each has its own word — so there is no single hash this
   * document could hold. `gradeHunt` resolves the team's universe from the team
   * record and compares against that word server-side.
   *
   * Seeding a hash here would be worse than useless: it would be one universe's
   * word sitting in the database for the other seven teams to fail against.
   */
  const universeConfig = {
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
    {
      type: "hunt", slug: "hunt-universe", title: "64 Grid", points: 100,
      opensAt: null, closesAt: null,
      config: universeConfig,
    },
    /**
     * The Octavius Circuit levels.
     *
     * No answerHash: a circuit is not a word. `levelId` points at the
     * server-side LEVELS table, and gradeHunt routes any challenge carrying one
     * to gradeCircuit, which rebuilds the board and decides. `nextSlug` chains
     * them so a team unlocks level 2 by solving level 1 rather than by knowing
     * the URL.
     */
    /**
     * Blueprint Recovery.
     *
     * No answerHash: there are ten codes, one per sector, and a team is sent to
     * the sector its number selects. gradeBlueprint resolves that from the team
     * record and compares against the server-only table — seeding one code here
     * would leave nine teams failing against another sector's answer.
     */
    {
      type: "hunt" as const,
      slug: "hunt-blueprint",
      title: "Blueprint Recovery",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { flow: "blueprint" as const, hintCosts: [15, 25] },
    },
    ...LEVELS.map((level, i) => ({
      type: "hunt" as const,
      slug: `circuit-${level.id}`,
      title: `Octavius Circuit${i === 0 ? "" : " " + "I".repeat(i + 1).replace("IIII", "IV").replace("IIIII", "V")}`,
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        levelId: level.id,
        hintCosts: [15, 25],
        nextSlug: LEVELS[i + 1] ? `circuit-${LEVELS[i + 1].id}` : undefined,
      },
    })),
  ]);

  console.log(`\n  Seeded ${HUNT_SLUGS.length} hunt puzzles.`);
  console.log("  Reveal codes are hashed — they are not in any challenge document.");
  console.log(`  Hints: ${Object.values(HINTS).flat().length} across ${HUNT_SLUGS.length} puzzles.\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
