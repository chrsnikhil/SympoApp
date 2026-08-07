/**
 * Read-only: why does the CTF console show teams that are playing the hunt?
 *
 * The console's query is (teams_ctf, all of it) + (teams WHERE event:"ctf").
 * The second half is the suspect: `teams` is the hunt's collection, and any
 * row in it carrying event:"ctf" gets pulled into the CTF coordinator's list.
 *
 *   npx tsx scripts/diagnose-ctf-team-leak.ts
 *
 * Writes nothing.
 */
import { collections } from "../src/lib/db/client";

async function main() {
  const [teamsCtf, teams, subsCtf, scoresCtf, parts, huntProgress] = await Promise.all([
    collections.teamsCtf(),
    collections.teams(),
    collections.submissionsCtf(),
    collections.scoreEventsCtf(),
    collections.eventParticipation(),
    collections.huntProgress(),
  ]);

  console.log(`teams_ctf : ${await teamsCtf.countDocuments()}`);
  console.log(`teams     : ${await teams.countDocuments()}`);

  // What `event` values exist on rows in the hunt's `teams` collection?
  const byEvent = await teams
    .aggregate<{ _id: string | null; n: number }>([{ $group: { _id: "$event", n: { $sum: 1 } } }])
    .toArray();
  console.log("\n`teams` rows by their `event` field:");
  for (const g of byEvent.sort((a, b) => b.n - a.n)) {
    console.log(`  event=${String(g._id).padEnd(10)} ${g.n}`);
  }

  // This is exactly the console's second query.
  const leaked = await teams
    .find({ event: "ctf", name: { $nin: ["Admin Team", "Quiz Control"] } })
    .toArray();
  console.log(`\nPulled into the CTF console by the event:"ctf" clause: ${leaked.length}`);

  const subIds = new Set(
    (await subsCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId))
  );
  const scoreIds = new Set(
    (await scoresCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId))
  );
  const huntArrived = new Set(
    (await parts.find({ event: "hunt" }).project({ teamId: 1 }).toArray()).map((p) => String(p.teamId))
  );
  const withProgress = new Set(
    (await huntProgress.find({}).project({ teamId: 1 }).toArray()).map((r) => String(r.teamId))
  );

  let huntOnly = 0;
  for (const t of leaked) {
    const id = String(t._id);
    const ctfActive = subIds.has(id) || scoreIds.has(id);
    const huntish = huntArrived.has(id) || withProgress.has(id);
    if (!ctfActive && huntish) huntOnly++;
    console.log(
      `  ${t.name.padEnd(28)} ctf=${ctfActive ? "yes" : "no "}  hunt=${huntish ? "yes" : "no "}`
    );
  }
  console.log(
    `\n  ${huntOnly} of ${leaked.length} are hunt teams with no CTF submission or score at all.`
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
