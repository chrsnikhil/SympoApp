/**
 * What exactly would be lost if the four rows in the CTF console were deleted?
 * Read-only.
 *
 * "Orphaned record" is doing a lot of work in that sentence. Three of the four
 * are live hunt teams that merely carry a wrong label; deleting the row deletes
 * the team, its login and its solved rounds. This prints what is attached to
 * each one so the difference is visible before anything is removed.
 *
 *   MONGODB_URI="..." MONGODB_DB=xplore26 npx tsx scripts/inspect-orphan-candidates.ts
 */
import { collections } from "../src/lib/db/client";

async function main() {
  const [teams, parts, huntProgress, participants, subsCtf, scoresCtf, scoreEvents] =
    await Promise.all([
      collections.teams(),
      collections.eventParticipation(),
      collections.huntProgress(),
      collections.participants(),
      collections.submissionsCtf(),
      collections.scoreEventsCtf(),
      collections.scoreEvents(),
    ]);

  const stamped = await teams
    .find({ event: "ctf", name: { $nin: ["Admin Team", "Quiz Control"] } })
    .toArray();

  for (const t of stamped) {
    const id = t._id!;
    const sid = String(id);

    const ctfSubs = await subsCtf.countDocuments({ teamId: id });
    const ctfScores = await scoresCtf.countDocuments({ teamId: id });
    const ctfArrived = await parts.countDocuments({ teamId: id, event: "ctf" });
    if (ctfSubs || ctfScores || ctfArrived) continue; // genuinely played the CTF

    const progress = await huntProgress.find({ teamId: id }).toArray();
    const solved = progress.filter((p) => p.solvedAt);
    const members = await participants.find({ teamId: id }).toArray();
    const huntScores = await scoreEvents.find({ teamId: id }).toArray();
    const points = huntScores.reduce((n, s) => n + (s.points ?? 0), 0);

    console.log(`\n── ${String(t.name)}  (${sid})`);
    console.log(`   number         : ${t.coin ?? t.teamNumber ?? "—"}`);
    console.log(`   created        : ${t.createdAt ? new Date(t.createdAt).toISOString() : "—"}`);
    console.log(`   members        : ${members.length ? members.map((m) => m.name).join(", ") : "none"}`);
    console.log(`   hunt progress  : ${progress.length} row(s), ${solved.length} SOLVED`);
    if (solved.length) {
      for (const s of solved) {
        console.log(`                    - ${s.challengeSlug} at ${new Date(s.solvedAt!).toISOString()}`);
      }
    }
    console.log(`   hunt points    : ${points} across ${huntScores.length} score event(s)`);
    console.log(
      `   verdict        : ${
        progress.length === 0 && members.length === 0 && huntScores.length === 0
          ? "no activity anywhere — a genuine orphan, safe to delete"
          : "LIVE HUNT TEAM — deleting this destroys real progress"
      }`
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
