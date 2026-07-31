import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { flipCell } from "@/lib/quiz/memory";
import { isQualified } from "@/lib/quiz/rounds";

const REASONS: Record<string, { message: string; status: number }> = {
  "not-started": { message: "Start the game first", status: 404 },
  completed: { message: "This grid is already complete", status: 409 },
  "cap-reached": { message: "You're out of flips", status: 409 },
  "already-face-up": { message: "That card is already face-up", status: 400 },
  "bad-index": { message: "That's not a card on this grid", status: 400 },
};

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);
    if (!(await isQualified(teamId, 1))) {
      return NextResponse.json({ error: "Your team isn't in this round" }, { status: 403 });
    }

    let body: { slug?: unknown; cellIndex?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }
    if (typeof body.slug !== "string" || typeof body.cellIndex !== "number") {
      return NextResponse.json({ error: "Missing slug or cellIndex" }, { status: 400 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: body.slug, "config.format": "memory" });
    if (!challenge) return NextResponse.json({ error: "No such memory challenge" }, { status: 404 });

    const result = await flipCell(teamId, challenge, body.cellIndex);
    if (!result.ok) {
      const r = REASONS[result.reason] ?? { message: "Could not flip that card", status: 400 };
      return NextResponse.json({ error: r.message }, { status: r.status });
    }

    return NextResponse.json({ ok: true, state: result.state, matched: result.matched, mismatchInfo: result.mismatchInfo });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/memory/flip] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
