/**
 * Is the CTF actually ready? Read-only.
 *
 * Checks the things that are invisible until they are urgent: a challenge with
 * no answer hash accepts nothing, an attachment that 404s reads as a broken
 * puzzle, and a stale event state means the timer starts wrong. Nothing here
 * writes.
 *
 *   MONGODB_URI="..." MONGODB_DB=xplore26 npx tsx scripts/ctf-health.ts
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { collections, getDb } from "../src/lib/db/client";

let bad = 0;
let warn = 0;

function ok(msg: string) {
  console.log(`  ok    ${msg}`);
}
function fail(msg: string) {
  bad++;
  console.log(`  FAIL  ${msg}`);
}
function soft(msg: string) {
  warn++;
  console.log(`  warn  ${msg}`);
}

async function main() {
  const db = await getDb();
  const [chCtf, chShared, teamsCtf, teams, subsCtf, scoresCtf, parts] = await Promise.all([
    collections.challengesCtf(),
    collections.challenges(),
    collections.teamsCtf(),
    collections.teams(),
    collections.submissionsCtf(),
    collections.scoreEventsCtf(),
    collections.eventParticipation(),
  ]);

  console.log("\n── CHALLENGES ──");
  const ctfChallenges = await chCtf.find({}).toArray();
  console.log(`  ${ctfChallenges.length} in challenges_ctf`);

  const byDiff = new Map<string, number>();
  for (const c of ctfChallenges) {
    const d = String(c.config?.difficulty ?? "?");
    byDiff.set(d, (byDiff.get(d) ?? 0) + 1);
  }
  console.log(`  by difficulty: ${[...byDiff].map(([d, n]) => `${d}=${n}`).join(" ")}`);

  for (const c of ctfChallenges) {
    if (!c.config?.answerHash) fail(`${c.slug} has NO answerHash — nothing can ever solve it`);
  }
  if (ctfChallenges.every((c) => c.config?.answerHash)) ok("every challenge has an answerHash");

  // A challenge whose attachment is missing looks like a broken puzzle to a
  // team and like nothing at all to a coordinator.
  for (const c of ctfChallenges) {
    for (const a of c.config?.attachments ?? []) {
      const p = join(process.cwd(), "public", "uploads", "ctf", a);
      if (!existsSync(p)) fail(`${c.slug}: attachment missing on disk — ${a}`);
    }
  }
  const allAttachments = ctfChallenges.flatMap((c) => c.config?.attachments ?? []);
  if (allAttachments.length) ok(`${allAttachments.length} attachment(s) referenced, all present`);

  // Rows left in the SHARED challenges collection with a ctf-shaped slug are
  // the residue of the _ctf migration. They are not served, but they confuse
  // anyone reading the database later.
  const strays = await chShared
    .find({ slug: { $regex: /^(easy|medium|hard)-\d+$/ } })
    .project<{ slug: string }>({ slug: 1 })
    .toArray();
  if (strays.length) soft(`${strays.length} orphaned ctf-shaped rows still in shared challenges: ${strays.map((s) => s.slug).join(", ")}`);
  else ok("no orphaned ctf rows in the shared challenges collection");

  console.log("\n── EVENT STATE ──");
  const setting = await db.collection("system_settings").findOne({ key: "ctf_event_state" });
  const state = setting?.state ?? "waiting";
  console.log(`  state: ${state}${setting?.startedAt ? `  startedAt=${new Date(setting.startedAt).toISOString()}` : ""}`);
  if (state === "started") soft("event is STARTED — the 105-minute timer is running right now");
  if (state === "ended") soft("event is ENDED — teams will see the closed screen");
  if (state === "waiting") ok("event is waiting, ready for an admin to start it");

  console.log("\n── TEAMS ──");
  const nCtf = await teamsCtf.countDocuments();
  console.log(`  teams_ctf: ${nCtf}`);

  const subIds = new Set((await subsCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId)));
  const scoreIds = new Set((await scoresCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId)));
  const ctfArrived = new Set(
    (await parts.find({ event: "ctf" }).project({ teamId: 1 }).toArray()).map((p) => String(p.teamId))
  );

  // The leak this run is really about: rows in the HUNT's collection that the
  // CTF console pulls in because they carry event:"ctf".
  const stamped = await teams.find({ event: "ctf", name: { $nin: ["Admin Team", "Quiz Control"] } }).toArray();
  const ghosts = stamped.filter((t) => {
    const id = String(t._id);
    return !subIds.has(id) && !scoreIds.has(id) && !ctfArrived.has(id);
  });
  if (ghosts.length) {
    fail(
      `${ghosts.length} hunt team(s) still showing in the CTF console: ${ghosts.map((g) => String(g.name)).join(", ")}`
    );
    console.log("        fix: npx tsx scripts/fix-mislabelled-team-events.ts --apply");
  } else {
    ok("no hunt teams leaking into the CTF console");
  }

  console.log("\n── ACTIVITY ──");
  console.log(`  submissions_ctf: ${await subsCtf.countDocuments()}`);
  console.log(`  correct:         ${await subsCtf.countDocuments({ "verdict.correct": true })}`);
  console.log(`  score events:    ${await scoresCtf.countDocuments()}`);

  const snap = await db.collection("leaderboard_snapshots").findOne({ event: "ctf" });
  if (snap) ok(`leaderboard materialized, ${snap.rows?.length ?? 0} rows, at ${new Date(snap.generatedAt).toISOString()}`);
  else soft("no CTF leaderboard snapshot yet (materializes on first score)");

  console.log(`\n${bad} failure(s), ${warn} warning(s).`);
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
