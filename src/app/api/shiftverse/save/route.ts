import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

/** Per-letter shifts, 0..25 — the cipher's whole range. */
const MAX_SHIFT = 25;

export async function POST(request: Request) {
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

    let body: { perLetterGuesses?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    const guesses = body.perLetterGuesses;
    if (!Array.isArray(guesses)) {
      return NextResponse.json({ error: "perLetterGuesses must be an array" }, { status: 400 });
    }

    const coll = await collections.shiftverseTeams();
    // Scoped to the caller's own slot: an update filtered by teamId cannot
    // touch another team's row no matter what the body contains.
    const slot = await coll.findOne({ teamId });
    if (!slot) {
      return NextResponse.json({ error: "No puzzle claimed yet" }, { status: 404 });
    }

    // Length is bounded by the puzzle itself, so an oversized array cannot be
    // used to grow the document.
    if (guesses.length !== slot.encryptedWord.length) {
      return NextResponse.json(
        { error: `Expected ${slot.encryptedWord.length} shift values` },
        { status: 400 }
      );
    }
    const valid = guesses.every((g) => typeof g === "number" && Number.isInteger(g) && g >= 0 && g <= MAX_SHIFT);
    if (!valid) {
      return NextResponse.json({ error: `Each shift must be an integer 0..${MAX_SHIFT}` }, { status: 400 });
    }

    await coll.updateOne({ teamId }, { $set: { perLetterGuesses: guesses } });
    return NextResponse.json({ saved: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[shiftverse/save]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
