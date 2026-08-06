import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections, getDb } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import { materialize } from "@/lib/leaderboard/materialize";

const SETTING_KEY = "ctf_event_state";
const DURATION_MINUTES = 105;

/**
 * Reset the CTF back to the waiting room.
 *
 * SCOPE: this endpoint touches CTF data and nothing else. That is not a
 * nicety — `teams`, `participants`, `access_codes` and `leaderboards` are
 * shared by every event on the deployment. `Team` carries no event field at
 * all; a team is a coin, and the same document backs that coin in the quiz,
 * the hunt and the code event. So an unfiltered delete here does not "reset
 * the CTF", it deregisters the entire symposium.
 *
 * This route used to do exactly that: `huntProgress.deleteMany({})` wiped the
 * Treasure Hunt outright, `teams.deleteMany({name: {$ne: "Admin Team"}})` took
 * every team on the platform with it, and `leaderboards.deleteMany({})` cleared
 * all four snapshots. One click during the symposium would have taken down the
 * other three events. Keep every filter below event-scoped.
 *
 * Deleting the CTF score events is what actually empties the leaderboard —
 * `materialize("ctf")` recomputes from the ledger, so no team row survives a
 * reset even though the team documents do. Penalties are ledger entries too
 * (`{event: "ctf"}`), so they clear the same way; `penaltyPoints` and `banned`
 * are display state written only by the CTF console, so they are cleared
 * explicitly rather than by deleting the team.
 *
 * Every write is wrapped in `withThrottleRetry`: Cosmos answers a burst with
 * 16500 rather than failing, and a reset that gives up halfway leaves the event
 * in a state no one can reason about. Same guard `quiz/advance` uses.
 */
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
    const boardsCollection = await collections.leaderboards();

    // 1. Clear CTF submissions and CTF score events. Hunt progress is the
    //    hunt's data and is deliberately untouched.
    await withThrottleRetry(() => subsCollection.deleteMany({ type: "ctf" }));
    await withThrottleRetry(() => scoresCollection.deleteMany({ event: "ctf" }));

    // 2. Teams and participants survive — they are shared across events, and
    //    the leaderboard is rebuilt from the ledger regardless. Clear only the
    //    CTF-issued moderation state stamped on the team document.
    await withThrottleRetry(() =>
      teamsCollection.updateMany(
        {},
        {
          $set: { penaltyPoints: 0 },
          $unset: { banned: "", bannedReason: "", bannedAt: "" },
        }
      )
    );

    // 3. Access codes keep their redemption. Teams are no longer deleted, so
    //    un-redeeming every code platform-wide would only let a claimed coin be
    //    taken a second time.

    // 4. Reset challenge hints unlock times to 5 min (300s) and 10 min (600s),
    //    matching what the participant challenge route serves.
    const ctfChalls = await challengesCollection.find({ type: "ctf" }).toArray();
    for (const ch of ctfChalls) {
      if (ch.config?.hints && ch.config.hints.length > 0) {
        const updatedHints = ch.config.hints.map((h, idx) => ({
          ...h,
          unlockSeconds: idx === 0 ? 300 : 600,
        }));
        await withThrottleRetry(() =>
          challengesCollection.updateOne({ _id: ch._id }, { $set: { "config.hints": updatedHints } })
        );
      }
    }

    // 5. Stamp global CTF reset timestamp AND reset event state back to Waiting Room
    const db = await getDb();
    await withThrottleRetry(() =>
      db.collection("system_settings").updateOne(
        { key: "ctf_last_reset" },
        { $set: { key: "ctf_last_reset", resetAt: new Date() } },
        { upsert: true }
      )
    );
    await withThrottleRetry(() =>
      db.collection("system_settings").updateOne(
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
      )
    );

    // 6. Drop the CTF leaderboard snapshot only — the collection is one row per
    //    event (unique index on `event`), so an unfiltered delete would clear
    //    the quiz, hunt and code boards too.
    await withThrottleRetry(() => boardsCollection.deleteMany({ event: "ctf" }));
    await materialize("ctf");

    return NextResponse.json({
      ok: true,
      message:
        "CTF submissions, scores and moderation cleared. Event reset to Waiting Room. Teams, access codes and other events were left untouched.",
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Reset endpoint error:", err);
    return NextResponse.json({ error: "Failed to reset CTF leaderboard" }, { status: 500 });
  }
}
