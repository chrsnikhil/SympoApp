import { ObjectId } from "mongodb";
import { collections, getDb } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import type { SessionClaims } from "@/lib/auth/session";

const COUNTER_KEY = "universe_team_counter";

/**
 * Hand out the next universe team number, atomically.
 *
 * `$inc` on a single counter document is the allocation — two concurrent
 * callers get two different values because Mongo applies the increments in
 * some order, which a "read the max and add one" scheme cannot promise.
 */
async function nextTeamNumber(): Promise<number> {
  const db = await getDb();
  const res = await withThrottleRetry(() =>
    db
      .collection<{ key: string; value: number }>("system_settings")
      .findOneAndUpdate(
        { key: COUNTER_KEY },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: "after" }
      )
  );
  return res?.value ?? 1;
}

/**
 * The team's number, read from the session rather than from the request.
 *
 * The universe hunt keys everything off "your team number": which of the eight
 * universes you land in, which RGB equation set you get, which word solves your
 * grid.
 *
 * Taking it from the request body instead — which is what the first cut of
 * /api/universe-color did — means any signed-in team can ask for, and verify
 * against, any other team's number. With only eight universes that is a short
 * loop. Deriving it here makes "whose answer is this" a property of the cookie,
 * which participants cannot forge.
 *
 * TWO SOURCES, IN ORDER:
 *
 * 1. `teams.coin` — the number stamped on the physical coin, set by /api/enter's
 *    coin path. It wins where present so a coin-holding team's universe matches
 *    the object in their hand.
 *
 * 2. `teams.teamNumber` — assigned by us. Only the coin login sets `coin`, so a
 *    team that registered with a name and password had no number at all and got
 *    a 403 from every universe route. That is most of the hunt's entrants, not
 *    an edge case, so the number is allocated here instead: on demand, once,
 *    and then persisted.
 *
 * Admins still get null. They are not playing, and the Admin Team is excluded
 * from the boards anyway — giving it a number would put a non-entrant into a
 * universe.
 *
 * Callers should treat null as 403, not 500.
 */
export async function teamNumberFromSession(session: SessionClaims): Promise<number | null> {
  const teams = await collections.teams();
  const teamId = new ObjectId(session.teamId);
  const team = await teams.findOne({ _id: teamId });
  if (!team) return null;

  if (typeof team.coin === "number" && Number.isInteger(team.coin)) return team.coin;
  if (typeof team.teamNumber === "number" && Number.isInteger(team.teamNumber)) return team.teamNumber;

  if (session.role === "admin") return null;

  // No number yet — allocate one and keep it.
  //
  // The filter carries the guard: `$exists: false` stops matching the moment a
  // number is written, so two concurrent first requests from the same team
  // produce one winner — the loser's update matches nothing and reads the
  // winner's value instead of overwriting it. A team must not change universe
  // between two page loads, which is what an unguarded $set here would allow.
  //
  // Absence rather than a null check because this field is only ever written by
  // the $set below, and only ever with a number.
  const assigned = await nextTeamNumber();
  const claim = await withThrottleRetry(() =>
    teams.updateOne(
      { _id: teamId, teamNumber: { $exists: false } },
      { $set: { teamNumber: assigned } }
    )
  );
  if (claim.modifiedCount === 1) return assigned;

  const settled = await teams.findOne({ _id: teamId });
  return typeof settled?.teamNumber === "number" ? settled.teamNumber : assigned;
}
