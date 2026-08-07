/**
 * Clear the event:"ctf" stamp from named teams in `teams`.
 *
 * The companion script (fix-mislabelled-team-events) deliberately spares teams
 * with real CTF activity, because for them the stamp is true. This one is for
 * the case that judgement does not cover: accounts that genuinely did open the
 * CTF, but as testers rather than entrants, and so should not sit in a
 * coordinator's list of teams to help.
 *
 * Named explicitly rather than inferred — "is this a tester?" is not a question
 * the database can answer, so it is answered on the command line.
 *
 *   npx tsx scripts/clear-ctf-stamp-for.ts spider Aasim
 *   npx tsx scripts/clear-ctf-stamp-for.ts spider Aasim --apply
 *
 * Deletes nothing. The team, its login, its members and its hunt progress are
 * untouched; only the label that puts it in the CTF console is removed.
 */
import { collections } from "../src/lib/db/client";

const APPLY = process.argv.includes("--apply");
const NAMES = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function main() {
  if (NAMES.length === 0) {
    console.log("Give at least one team name.");
    process.exit(1);
  }

  const [teams, parts, huntProgress, participants] = await Promise.all([
    collections.teams(),
    collections.eventParticipation(),
    collections.huntProgress(),
    collections.participants(),
  ]);

  const found = [];
  for (const name of NAMES) {
    const t = await teams.findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    });
    if (!t) {
      console.log(`  ??     ${name.padEnd(16)} no such team in \`teams\``);
      continue;
    }
    if (t.event !== "ctf") {
      console.log(`  skip   ${String(t.name).padEnd(16)} not stamped ctf (event=${t.event ?? "none"})`);
      continue;
    }
    const prog = await huntProgress.countDocuments({ teamId: t._id! });
    const solved = await huntProgress.countDocuments({ teamId: t._id!, solvedAt: { $ne: null } });
    const members = await participants.countDocuments({ teamId: t._id! });
    const ctfArrival = await parts.countDocuments({ teamId: t._id!, event: "ctf" });
    console.log(
      `  clear  ${String(t.name).padEnd(16)} members=${members} progress=${prog} solved=${solved} ctfArrivalRows=${ctfArrival}`
    );
    found.push(t);
  }

  if (!APPLY) {
    console.log(`\n${found.length} would be cleared. Re-run with --apply to write.`);
    process.exit(0);
  }

  if (found.length) {
    const res = await teams.updateMany(
      { _id: { $in: found.map((t) => t._id!) } },
      { $unset: { event: "" } }
    );
    console.log(`\nCleared ${res.modifiedCount}.`);
  }

  // The arrival rows are left in place on purpose: they record something that
  // actually happened. The CTF console does not read them today, so they change
  // nothing on screen — but if the console is ever fixed to filter on arrival
  // (see the dead arrivedTeamIds import), these will need deciding on again.
  console.log("event_participation rows left intact — they record a real visit.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
