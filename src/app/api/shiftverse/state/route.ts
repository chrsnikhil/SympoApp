import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { claimSlot } from "@/lib/shiftverse/slot";

/**
 * The caller's own puzzle. There is no team parameter by design — the team is
 * whoever the session cookie says it is, so there is nothing to tamper with.
 *
 * Note what is NOT in the response: `plaintextWord` and `shiftKey`. The client
 * gets the ciphertext and its own saved shifts, which is everything it needs
 * to render the board and nothing it needs to solve it.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    const slot = await claimSlot(teamId);
    if (!slot) {
      return NextResponse.json(
        { error: "All puzzle slots are in use — tell a coordinator." },
        { status: 409 }
      );
    }

    // Start the clock on first sight of the puzzle, never on later reads.
    let startTime = slot.startTime;
    if (!startTime || startTime <= 0) {
      startTime = Date.now();
      const coll = await collections.shiftverseTeams();
      await coll.updateOne({ _id: slot._id }, { $set: { startTime } });
    }

    return NextResponse.json({
      teamNumber: slot.teamNumber,
      encryptedWord: slot.encryptedWord,
      perLetterGuesses: slot.perLetterGuesses ?? [],
      startTime,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[shiftverse/state]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
