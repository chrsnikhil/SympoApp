import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { sectorNumberFor } from "@/lib/blueprint/variants";
import { sectorInfo } from "@/lib/blueprint/sectors";
import { ensureHuntProgress } from "@/lib/hunt/unlock";
import { teamNumberFromSession } from "@/lib/universe/teamNumber";

/**
 * Which sector is this team searching?
 *
 * Returns the sector's number, colour and dimension — everything the reveal
 * screen needs to send a team to the right physical place — and deliberately
 * NOT its access code. The code is on a card at that location; a route that
 * returned it would replace the entire round with a fetch.
 *
 * The team number comes from the session, not the request. The original asked
 * the player to type their team number and trusted the answer, so a team could
 * identify as any of the sixty and be sent to whichever sector they fancied.
 * Here it is a property of the cookie.
 *
 * GET rather than POST: it reads, it takes no input, and it is polled by the
 * reveal screen.
 */
export async function GET() {
  try {
    const session = await requireSession();

    /**
     * The same allocator the universe round uses, not a bare read of the field.
     *
     * Only the coin login writes `coin`, and `teamNumber` is assigned on demand
     * — so a team that registered with a name and password has neither until
     * something asks for one. Reading the field directly meant this round
     * refused exactly those teams, told them to find a coordinator, and left
     * the coordinator nothing to find: the login was valid and the team was
     * real. It only appeared to work because testers reached /universe first,
     * which allocated a number as a side effect.
     *
     * In production when this was found, 8 of the 15 teams that had arrived at
     * the hunt had no number, and Blueprint had zero solves.
     *
     * teamNumberFromSession allocates atomically and persists, so a team's
     * sector is stable across reloads, and it still returns null for admins —
     * who are not entrants and must not be given a sector.
     */
    const number = await teamNumberFromSession(session);

    if (typeof number !== "number") {
      return NextResponse.json(
        { error: "Your login has no team number — see a coordinator" },
        { status: 403 }
      );
    }

    // Arriving here IS entering the round — a team linked straight to
    // /blueprint never loads /hunt, so without this their progress row never
    // exists and gradeBlueprint refuses a correct code as "not-unlocked".
    await ensureHuntProgress(new ObjectId(session.teamId));

    const sectorNumber = sectorNumberFor(number);
    const sector = sectorInfo(sectorNumber);
    if (!sector) {
      return NextResponse.json({ error: "No such sector" }, { status: 500 });
    }

    return NextResponse.json({
      sectorNumber: sector.number,
      colour: sector.colour,
      dimension: sector.dimension,
      accent: sector.accent,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[api/blueprint/sector] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
