import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { getComebackView } from "@/lib/quiz/comeback";

/**
 * This team's Round 3 meter and power. The quiz screen normally reads the same
 * view embedded in `/api/quiz/serve`, so the question and the meter arrive
 * together and can't drift apart; this endpoint is the standalone read for
 * anything without a question in hand (and for debugging a live round).
 */
export async function GET() {
  try {
    const session = await requireSession();
    const status = await getComebackView(new ObjectId(session.teamId), 3);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/comeback] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
