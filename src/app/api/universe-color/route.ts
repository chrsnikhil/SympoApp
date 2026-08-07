import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { ObjectId } from "mongodb";
import { ensureHuntProgress } from "@/lib/hunt/unlock";
import { teamNumberFromSession } from "@/lib/universe/teamNumber";
import { getUniverseColor } from "@/app/universe/universeColor";

/**
 * POST /api/universe-color
 *
 * Returns: { universeName, universeIndex, equations }
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN. `getUniverseColor` also computes
 * `worked` (the substituted arithmetic, e.g. "R = (12 + 7×5) mod 256 = 193")
 * and `rgb`/`hex` (the answer itself). Solving those three equations by hand IS
 * the puzzle, and any of those three fields hands it over — a participant only
 * has to open the network tab. The whole point of computing server-side is that
 * the answer stays server-side, so only the unsolved equations cross the wire.
 * The single caller (app/universe/reveal/page.tsx) reads `.equations` and
 * nothing else; grading happens at /api/universe-color/verify.
 *
 * The team number comes from the session, never the body — see
 * `lib/universe/teamNumber.ts`.
 */
export async function POST() {
  try {
    const session = await requireSession();

    // Same reason as /api/blueprint/sector: /universe is reachable without
    // /hunt ever loading, and a missing progress row makes a correct answer
    // indistinguishable from a wrong one.
    await ensureHuntProgress(new ObjectId(session.teamId));

    const teamNumber = await teamNumberFromSession(session);
    if (teamNumber === null) {
      return NextResponse.json(
        { error: "Your login has no coin number — see a coordinator" },
        { status: 403 },
      );
    }

    const result = getUniverseColor(teamNumber);

    return NextResponse.json({
      universeName: result.universeName,
      universeIndex: result.universeIndex,
      equations: result.equations,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
