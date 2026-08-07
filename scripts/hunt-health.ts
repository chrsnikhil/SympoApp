/**
 * Is the treasure hunt actually ready? Read-only.
 *
 * The failures that matter here are quiet ones: a round in the code with no
 * challenge row grades nothing, a missing answerHash accepts nothing, and a
 * round nobody has solved might be hard or might be broken — the numbers next
 * to each other are what tell them apart. Nothing here writes.
 *
 *   MONGODB_URI="..." MONGODB_DB=xplore26 npx tsx scripts/hunt-health.ts
 */
import { collections } from "../src/lib/db/client";
import { PLAYABLE_HUNT_SLUGS, PUZZLE_HREFS } from "../src/lib/hunt/content";

let bad = 0;
let warn = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const fail = (m: string) => {
  bad++;
  console.log(`  FAIL  ${m}`);
};
const soft = (m: string) => {
  warn++;
  console.log(`  warn  ${m}`);
};

async function main() {
  const [challenges, progress, teams, parts, scores] = await Promise.all([
    collections.challenges(),
    collections.huntProgress(),
    collections.teams(),
    collections.eventParticipation(),
    collections.scoreEvents(),
  ]);

  console.log("\n── ROUNDS ──");
  const docs = await challenges.find({ type: "hunt" }).toArray();
  const bySlug = new Map(docs.map((d) => [d.slug, d]));
  console.log(`  ${docs.length} hunt challenge row(s); ${PLAYABLE_HUNT_SLUGS.length} playable in code`);

  /**
   * Which grader will actually run, mirroring gradeHunt's dispatch order.
   *
   * Only hunt-room compares a hashed answer. Demanding an answerHash of the
   * others reports four healthy rounds as broken: the circuit rebuilds the
   * player's board, shiftverse and blueprint grade against per-team state, and
   * the universe resolves a different word for every team from its number. The
   * check has to ask whether a round has A working grader, not whether it has
   * the one that happens to be most common.
   */
  const graderFor = (d: (typeof docs)[number]) => {
    if (typeof d.config?.levelId === "number") return "circuit (levelId)";
    if (d.config?.flow === "shiftverse") return "shiftverse (flow)";
    if (d.config?.flow === "blueprint") return "blueprint (flow)";
    if (d.slug === "hunt-universe") return "per-team word";
    return d.config?.answerHash ? "answerHash" : null;
  };

  for (const slug of PLAYABLE_HUNT_SLUGS) {
    const d = bySlug.get(slug);
    if (!d) {
      fail(`${slug} is playable in code but has NO challenge row — it can never be solved`);
      continue;
    }
    const grader = graderFor(d);
    if (!grader) fail(`${slug} has no grader path at all — no levelId, no flow, no answerHash`);
    const href = PUZZLE_HREFS[slug as keyof typeof PUZZLE_HREFS];
    console.log(
      `  ${slug.padEnd(18)} ${String(d.points).padEnd(5)} ${(grader ?? "NONE").padEnd(20)} ${href ? `route ${href}` : "in-shell"}`
    );
  }

  /**
   * The universe and blueprint rounds both resolve what a team is asked from
   * that team's NUMBER. A team without one is refused before its answer is even
   * looked at — which reads to the team as a broken round, and is invisible
   * from the challenge row.
   */
  const arrivedForNumbers = await parts
    .find({ event: "hunt" })
    .project<{ teamId: unknown }>({ teamId: 1 })
    .toArray();
  const numberless = await teams.countDocuments({
    _id: { $in: arrivedForNumbers.map((a) => a.teamId) as never[] },
    coin: { $exists: false },
    teamNumber: { $exists: false },
  });
  if (numberless > 0)
    fail(
      `${numberless} team(s) at the hunt have no coin and no teamNumber — /universe and /blueprint will refuse them`
    );
  else ok("every arrived team has a number for /universe and /blueprint");

  // A row in the database that the code no longer offers is dead weight, and it
  // will confuse the next person who reads the collection.
  const orphans = docs.filter((d) => !(PLAYABLE_HUNT_SLUGS as readonly string[]).includes(d.slug));
  if (orphans.length) soft(`${orphans.length} hunt row(s) not in PLAYABLE_HUNT_SLUGS: ${orphans.map((o) => o.slug).join(", ")}`);

  console.log("\n── TEAMS ──");
  const arrived = await parts.find({ event: "hunt" }).project<{ teamId: unknown }>({ teamId: 1 }).toArray();
  const arrivedIds = new Set(arrived.map((a) => String(a.teamId)));
  console.log(`  arrived at the hunt : ${arrivedIds.size}`);
  console.log(`  rows in \`teams\`     : ${await teams.countDocuments()}`);
  const stillStamped = await teams.countDocuments({ event: "ctf" });
  if (stillStamped) soft(`${stillStamped} team(s) still stamped event:"ctf"`);
  else ok('no teams mislabelled event:"ctf"');

  console.log("\n── PROGRESS PER ROUND ──");
  for (const slug of PLAYABLE_HUNT_SLUGS) {
    const unlocked = await progress.countDocuments({ challengeSlug: slug });
    const solved = await progress.countDocuments({ challengeSlug: slug, solvedAt: { $ne: null } });
    const flag = unlocked > 0 && solved === 0 ? "   <- nobody has solved this" : "";
    console.log(`  ${slug.padEnd(18)} unlocked=${String(unlocked).padEnd(4)} solved=${solved}${flag}`);
  }

  console.log("\n── SCORING ──");
  const huntScores = await scores.countDocuments({ event: "hunt" });
  console.log(`  score events (hunt): ${huntScores}`);
  const totalSolved = await progress.countDocuments({ solvedAt: { $ne: null } });
  console.log(`  solved rows total  : ${totalSolved}`);
  if (totalSolved > 0 && huntScores === 0)
    fail("rounds are being solved but no score events exist — the leaderboard will stay empty");
  if (totalSolved !== huntScores && totalSolved > 0)
    soft(`solved rows (${totalSolved}) and score events (${huntScores}) differ — expected if hints were charged`);

  console.log(`\n${bad} failure(s), ${warn} warning(s).`);
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
