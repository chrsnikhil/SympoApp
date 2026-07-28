import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { getComebackStatus } from "@/lib/quiz/comeback";

/** What comeback ability (if any) this team is holding in Round 3. */
export async function GET() {
  try {
    const session = await requireSession();
    const status = await getComebackStatus(new ObjectId(session.teamId), 3);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/comeback] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
