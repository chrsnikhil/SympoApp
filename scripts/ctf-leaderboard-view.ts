/**
 * What the CTF leaderboard actually contains, and what it is built from.
 * Read-only.
 */
import { collections, getDb } from "../src/lib/db/client";

async function main() {
  const db = await getDb();
  const snap = await db.collection("leaderboard_snapshots").findOne({ event: "ctf" });

  console.log(`\nCTF LEADERBOARD — ${snap?.rows?.length ?? 0} row(s)`);
  if (snap?.generatedAt) console.log(`  generated ${new Date(snap.generatedAt).toISOString()}`);
  for (const r of snap?.rows ?? []) {
    console.log(`   ${String(r.teamName).padEnd(22)} ${r.points} pts   solved=${r.solvedCount ?? "?"}`);
  }

  const t = await collections.teamsCtf();
  const rows = await t.find({}).toArray();
  console.log(`\nteams_ctf — the only collection the CTF leaderboard is built from (${rows.length}):`);
  for (const x of rows) console.log(`   ${String(x.name)}`);

  console.log("\nThe four mislabelled rows live in `teams`, not `teams_ctf`,");
  console.log("so they cannot appear on this leaderboard — only in the admin team list.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
