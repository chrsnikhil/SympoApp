import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections, getDb } from "@/lib/db/client";
import { materialize } from "@/lib/leaderboard/materialize";

const SETTING_KEY = "ctf_event_state";
const DURATION_MINUTES = 105;

export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const subsCollection = await collections.submissions();
    const scoresCollection = await collections.scoreEvents();
    const challengesCollection = await collections.challenges();
    const teamsCollection = await collections.teams();
    const participantsCollection = await collections.participants();
    const huntCollection = await collections.huntProgress();
    const codesCollection = await collections.accessCodes();
    const boardsCollection = await collections.leaderboards();

    // 1. Clear CTF submissions, score events, and hunt progress
    await subsCollection.deleteMany({ type: "ctf" });
    await scoresCollection.deleteMany({ event: "ctf" });
    await huntCollection.deleteMany({});

    // 2. Delete non-admin teams and participants so leaderboard is completely reset
    await teamsCollection.deleteMany({ name: { $ne: "Admin Team" } });
    await participantsCollection.deleteMany({ role: { $ne: "admin" } });

    // 3. Reset access codes redemption status
    await codesCollection.updateMany({}, { $set: { redeemedAt: null } });

    // 4. Reset challenge hints unlock times to 5 min (300s), 10 min (600s), 15 min (900s)
    const ctfChalls = await challengesCollection.find({ type: "ctf" }).toArray();
    for (const ch of ctfChalls) {
      if (ch.config?.hints && ch.config.hints.length > 0) {
        const updatedHints = ch.config.hints.map((h, idx) => ({
          ...h,
          unlockSeconds: idx === 0 ? 300 : idx === 1 ? 600 : 900,
        }));
        await challengesCollection.updateOne({ _id: ch._id }, { $set: { "config.hints": updatedHints } });
      }
    }

    // 5. Stamp global CTF reset timestamp AND reset event state back to Waiting Room
    const db = await getDb();
    await db.collection("system_settings").updateOne(
      { key: "ctf_last_reset" },
      { $set: { key: "ctf_last_reset", resetAt: new Date() } },
      { upsert: true }
    );
    await db.collection("system_settings").updateOne(
      { key: SETTING_KEY },
      {
        $set: {
          key: SETTING_KEY,
          state: "waiting",
          startedAt: null,
          durationMinutes: DURATION_MINUTES,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    // 6. Clear old leaderboard snapshots and re-materialize
    await boardsCollection.deleteMany({});
    await materialize("ctf");

    return NextResponse.json({ ok: true, message: "CTF Leaderboard, submissions, and team progress reset successfully. Event reset to Waiting Room." });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Reset endpoint error:", err);
    return NextResponse.json({ error: "Failed to reset CTF leaderboard" }, { status: 500 });
  }
}
