import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { ROUNDS, isQualified, getActiveQuizRound, isTeamEliminated, isQuizEnded, isQuizStarted } from "@/lib/quiz/rounds";
import type { QuizRound } from "@/lib/db/types";

/**
 * Lightweight poll target so a team's screen notices the moment the
 * coordinator cuts to the next round, instead of requiring a manual reload.
 * Mirrors the exact same qualification check `quiz/page.tsx` uses server-side
 * for the initial render, so the two can never disagree.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    const activeRound = await getActiveQuizRound();
    const eliminated = await isTeamEliminated(teamId);
    const ended = await isQuizEnded();
    const started = await isQuizStarted();

    let round: QuizRound = 1;
    if (await isQualified(teamId, 2)) round = 2;
    if (await isQualified(teamId, 3)) round = 3;

    return NextResponse.json(
      { round, activeRound, eliminated, ended, started, title: ROUNDS[round].title },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/status] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
