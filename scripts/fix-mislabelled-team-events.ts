/**
 * Clear the event:"ctf" stamp from teams in `teams` that never played the CTF.
 *
 * /api/enter used to write event:"ctf" onto every team it created or logged in,
 * whatever host they came from. The CTF console selects `teams` on that field,
 * so hunt teams appeared in a CTF coordinator's list. The route no longer does
 * it; this clears what it already wrote.
 *
 * A row is only touched when it has NO CTF activity at all — no submission, no
 * score event, no recorded arrival at the CTF. A team that genuinely played
 * both keeps its stamp, because for that team the stamp is true.
 *
 *   npx tsx scripts/fix-mislabelled-team-events.ts          # report only
 *   npx tsx scripts/fix-mislabelled-team-events.ts --apply  # write
 *
 * `teams_ctf` is not touched. Membership there is decided by the collection a
 * row lives in, not by this field.
 */
import { collections } from "../src/lib/db/client";

const APPLY = process.argv.includes("--apply");

async function main() {
  const [teams, subsCtf, scoresCtf, parts] = await Promise.all([
    collections.teams(),
    collections.submissionsCtf(),
    collections.scoreEventsCtf(),
    collections.eventParticipation(),
  ]);

  const stamped = await teams.find({ event: "ctf" }).toArray();
  if (stamped.length === 0) {
    console.log("Nothing stamped event:\"ctf\" in `teams`. Nothing to do.");
    process.exit(0);
  }

  const subIds = new Set(
    (await subsCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId))
  );
  const scoreIds = new Set(
    (await scoresCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId))
  );
  const ctfArrived = new Set(
    (await parts.find({ event: "ctf" }).project({ teamId: 1 }).toArray()).map((p) => String(p.teamId))
  );

  type Row = (typeof stamped)[number];
  const toClear: Row[] = [];
  const keeping: Row[] = [];
  for (const t of stamped) {
    const id = String(t._id);
    const playedCtf = subIds.has(id) || scoreIds.has(id) || ctfArrived.has(id);
    (playedCtf ? keeping : toClear).push(t);
  }

  for (const t of keeping) {
    console.log(`  keep   ${String(t.name).padEnd(28)} — has real CTF activity`);
  }
  for (const t of toClear) {
    console.log(`  clear  ${String(t.name).padEnd(28)} ${String(t._id)}`);
  }
  console.log(`\n${toClear.length} to clear, ${keeping.length} kept, of ${stamped.length} stamped.`);

  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply to write.");
    process.exit(0);
  }

  // $unset, not $set:"hunt" — the field records which event created the row,
  // and for these it recorded a falsehood. Removing it says "unknown", which
  // is what is actually known. Asserting "hunt" would be a second guess
  // dressed as a fact, and the hunt does not read this field anyway.
  const res = await teams.updateMany(
    { _id: { $in: toClear.map((t) => t._id!) } },
    { $unset: { event: "" } }
  );
  console.log(`\nCleared ${res.modifiedCount}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
