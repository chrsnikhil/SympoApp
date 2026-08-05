import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import type { QuizRound } from "@/lib/db/types";

/**
 * Lightweight poll target for `ProctorGate` (rounds 2/3) to find out whether
 * the coordinator has frozen this team — separate from `/api/quiz/serve`
 * because that only refetches around question boundaries, not on a steady
 * clock, so it can't be relied on to surface a freeze promptly.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    const url = new URL(request.url);
    const round = Number(url.searchParams.get("round")) as QuizRound;
    if (![1, 2, 3].includes(round)) {
      return NextResponse.json({ error: "round must be 1, 2 or 3" }, { status: 400 });
    }

    const freezes = await collections.proctorFreezes();
    const state = await freezes.findOne({ teamId, round });

    return NextResponse.json(
      {
        frozen: state?.frozen ?? false,
        strikes: state?.strikes ?? 0,
        reason: state?.frozenReason ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/proctor-status] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
