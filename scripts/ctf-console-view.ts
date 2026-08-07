/**
 * Exactly what a CTF coordinator sees in their team list, and where each row
 * came from. Read-only.
 *
 * Reproduces /api/admin/ctf/teams' own query rather than approximating it:
 *
 *   (everything in teams_ctf, minus "Admin Team")
 *   + (teams WHERE event:"ctf", minus "Admin Team"/"Quiz Control")
 *
 * The second half is the one that leaks. A row is flagged when it has no CTF
 * submission, no CTF score and no recorded CTF arrival — it did not come to
 * this event, so a coordinator looking at it is looking at somebody else's
 * participant.
 *
 *   MONGODB_URI="..." MONGODB_DB=xplore26 npx tsx scripts/ctf-console-view.ts
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

  const fromCtfCollection = await teamsCtf.find({ name: { $ne: "Admin Team" } }).toArray();
  const fromSharedByStamp = await teams
    .find({ event: "ctf", name: { $nin: ["Admin Team", "Quiz Control"] } })
    .toArray();

  const subIds = new Set(
    (await subsCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId))
  );
  const scoreIds = new Set(
    (await scoresCtf.find({}).project({ teamId: 1 }).toArray()).map((s) => String(s.teamId))
  );
  const ctfArrived = new Set(
    (await parts.find({ event: "ctf" }).project({ teamId: 1 }).toArray()).map((p) => String(p.teamId))
  );
  const huntArrived = new Set(
    (await parts.find({ event: "hunt" }).project({ teamId: 1 }).toArray()).map((p) => String(p.teamId))
  );
  const huntPlayers = new Set(
    (await huntProgress.find({}).project({ teamId: 1 }).toArray()).map((r) => String(r.teamId))
  );

  const seen = new Set<string>();
  const rows: Array<{ name: string; src: string; ctf: string; hunt: string; leak: boolean }> = [];

  for (const [list, src] of [
    [fromCtfCollection, "teams_ctf"],
    [fromSharedByStamp, 'teams event:"ctf"'],
  ] as const) {
    for (const t of list) {
      const id = String(t._id);
      if (seen.has(id)) continue; // the console de-dupes by id too
      seen.add(id);

      const ctfBits = [
        subIds.has(id) ? "submitted" : null,
        scoreIds.has(id) ? "scored" : null,
        ctfArrived.has(id) ? "arrived" : null,
      ].filter(Boolean);
      const huntBits = [
        huntArrived.has(id) ? "arrived" : null,
        huntPlayers.has(id) ? "progress" : null,
      ].filter(Boolean);

      rows.push({
        name: String(t.name),
        src,
        ctf: ctfBits.join("+") || "—",
        hunt: huntBits.join("+") || "—",
        leak: ctfBits.length === 0,
      });
    }
  }

  console.log(`\nThe CTF console shows ${rows.length} team(s):\n`);
  console.log(`  ${"TEAM".padEnd(22)} ${"FROM".padEnd(18)} ${"CTF".padEnd(24)} ${"HUNT".padEnd(18)}`);
  console.log(`  ${"-".repeat(22)} ${"-".repeat(18)} ${"-".repeat(24)} ${"-".repeat(18)}`);
  for (const r of rows.sort((a, b) => Number(a.leak) - Number(b.leak))) {
    console.log(
      `  ${r.name.padEnd(22)} ${r.src.padEnd(18)} ${r.ctf.padEnd(24)} ${r.hunt.padEnd(18)} ${r.leak ? "<-- LEAK" : ""}`
    );
  }

  const leaks = rows.filter((r) => r.leak);
  console.log(
    `\n  ${leaks.length} of ${rows.length} have no CTF activity at all.` +
      (leaks.length ? "  These are the leak." : "  Nothing is leaking.")
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
