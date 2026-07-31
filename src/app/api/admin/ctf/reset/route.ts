import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { materialize } from "@/lib/leaderboard/materialize";

export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const subsCollection = await collections.submissions();
    const scoresCollection = await collections.scoreEvents();
    const challengesCollection = await collections.challenges();

    // Clear CTF submissions and score events
    await subsCollection.deleteMany({ type: "ctf" });
    await scoresCollection.deleteMany({ event: "ctf" });

    // Reset first blood tags on CTF challenges
    await challengesCollection.updateMany(
      { type: "ctf" },
      { $unset: { "config.firstBloodTeamId": "" } }
    );

    // Re-materialize CTF leaderboard
    await materialize("ctf");

    return NextResponse.json({ ok: true, message: "CTF Leaderboard and submissions reset successfully" });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to reset CTF leaderboard" }, { status: 500 });
  }
}
