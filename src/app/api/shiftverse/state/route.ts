import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import { claimSlot } from "@/lib/shiftverse/slot";

/**
 * The caller's own puzzle. There is no team parameter by design — the team is
 * whoever the session cookie says it is, so there is nothing to tamper with.
 *
 * Note what is NOT in the response: `plaintextWord` and `shiftKey`. `teamNumber`
 * IS returned — the UI shows it as a cosmetic "DIMENSION #N" label — but it no
 * longer doubles as a working decryption key. Seeding used to set
 * `shiftKey = teamNumber`, which meant `applyShiftToLetter(encryptedWord,
 * teamNumber)` decrypted this response's own `encryptedWord` in one line,
 * without ever calling the guess endpoint. `shiftKey` is now drawn
 * independently at seed time (see `scripts/seed-shiftverse.ts`), so returning
 * `teamNumber` here no longer hands out the key alongside the ciphertext.
 */
export async function GET() {
  try {
    const session = await requireSession();

    let teamId: ObjectId;
    try {
      teamId = new ObjectId(session.teamId);
    } catch {
      // A session whose claimed teamId isn't a valid ObjectId isn't a usable
      // session — 401, not a 500 that leaks a BSON parsing error.
      throw new UnauthorizedError();
    }

    const slot = await claimSlot(teamId);
    if (!slot) {
      return NextResponse.json(
        { error: "All puzzle slots are in use — tell a coordinator." },
        { status: 409 }
      );
    }

    // Start the clock on first sight of the puzzle, never on later reads.
    // The condition lives in the filter, not in a read-then-write: two
    // requests racing this same moment can't have the second stomp the
    // first's already-stamped time, because only the request that still sees
    // startTime <= 0 in the DATABASE (not in the `slot` object read earlier)
    // can match and write.
    let startTime = slot.startTime;
    if (!startTime || startTime <= 0) {
      startTime = Date.now();
      const coll = await collections.shiftverseTeams();
      await withThrottleRetry(() =>
        coll.updateOne({ _id: slot._id, startTime: { $lte: 0 } }, { $set: { startTime } })
      );
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
