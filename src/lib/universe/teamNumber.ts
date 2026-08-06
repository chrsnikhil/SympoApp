import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { SessionClaims } from "@/lib/auth/session";

/**
 * The team's number, read from the session rather than from the request.
 *
 * The universe hunt keys everything off "your team number": which of the eight
 * universes you land in, which RGB equation set you get, which word solves your
 * grid. It is the number stamped on the physical coin, and `teams.coin` is the
 * server's record of which coin a team claimed (see `/api/enter`'s coin path).
 *
 * Taking it from the request body instead — which is what the first cut of
 * /api/universe-color did — means any signed-in team can ask for, and verify
 * against, any other team's number. With only eight universes that is a short
 * loop. Deriving it here makes "whose answer is this" a property of the cookie,
 * which participants cannot forge.
 *
 * Returns null when the team has no coin: admin/access-code logins have none
 * (`/api/enter` sets `coin: null` on that path) and they are not playing the
 * universe hunt. Callers should treat null as 403, not 500.
 */
export async function teamNumberFromSession(session: SessionClaims): Promise<number | null> {
  const teams = await collections.teams();
  const team = await teams.findOne({ _id: new ObjectId(session.teamId) });
  if (!team || typeof team.coin !== "number" || !Number.isInteger(team.coin)) return null;
  return team.coin;
}
