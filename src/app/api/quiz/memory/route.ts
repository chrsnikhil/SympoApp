import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { getOrCreateMemoryState } from "@/lib/quiz/memory";
import { isQualified } from "@/lib/quiz/rounds";

/** Get-or-create a team's Memory Game state. Never returns the grid — only
 *  counts plus whatever is currently revealed/matched. */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const teamId = new ObjectId(session.teamId);
    if (!(await isQualified(teamId, 1))) {
      return NextResponse.json({ error: "Your team isn't in this round" }, { status: 403 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug, "config.format": "memory" });
    if (!challenge) return NextResponse.json({ error: "No such memory challenge" }, { status: 404 });

    const state = await getOrCreateMemoryState(teamId, challenge);
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/memory] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
