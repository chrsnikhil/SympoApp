/**
 * Confirm the four cleared teams still exist and lost nothing but the label.
 * Read-only.
 */
import { ObjectId } from "mongodb";
import { collections } from "../src/lib/db/client";

const IDS = [
  ["Snowin", "6a745d8d409fc207035c9434"],
  ["Jefrin", "6a7546267dc60fa07a8e2e33"],
  ["VerifyRound", "6a758b5384b67ef79cc0e2d1"],
  ["null", "6a7598f6468c3173ce4675be"],
] as const;

async function main() {
  const [teams, huntProgress, participants, scoreEvents] = await Promise.all([
    collections.teams(),
    collections.huntProgress(),
    collections.participants(),
    collections.scoreEvents(),
  ]);

  for (const [label, raw] of IDS) {
    const id = new ObjectId(raw);
    const t = await teams.findOne({ _id: id });
    if (!t) {
      console.log(`  GONE   ${label} — row no longer exists`);
      continue;
    }
    const prog = await huntProgress.countDocuments({ teamId: id });
    const solved = await huntProgress.countDocuments({ teamId: id, solvedAt: { $ne: null } });
    const members = await participants.countDocuments({ teamId: id });
    const scores = await scoreEvents.find({ teamId: id }).toArray();
    const points = scores.reduce((n, s) => n + (s.points ?? 0), 0);

    console.log(
      `  ok     ${String(t.name).padEnd(14)} event=${t.event ?? "(cleared)"}  ` +
        `no=${t.coin ?? t.teamNumber ?? "—"}  members=${members}  progress=${prog}  solved=${solved}  points=${points}`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
