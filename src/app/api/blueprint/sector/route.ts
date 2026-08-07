import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { sectorNumberFor } from "@/lib/blueprint/variants";
import { sectorInfo } from "@/lib/blueprint/sectors";
import { ensureHuntProgress } from "@/lib/hunt/unlock";

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

    const teams = await collections.teams();
    const team = await teams.findOne({ _id: new ObjectId(session.teamId) });
    const number = typeof team?.coin === "number" ? team.coin : team?.teamNumber;

    if (typeof number !== "number") {
      // Admin and access-code logins have no number. They are not entrants.
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
