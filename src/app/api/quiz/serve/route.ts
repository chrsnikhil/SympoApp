import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { attachPendingAbility, expireOldComebackAbilities, closeQuestionForComeback } from "@/lib/quiz/comeback";
import { collections } from "@/lib/db/client";
import { isQualified } from "@/lib/quiz/rounds";
import { serveNext } from "@/lib/quiz/serve";
import type { QuizRound } from "@/lib/db/types";

/**
 * Hand the team its current Round 2/3 question. This is the only way an MCQ
 * reaches a client, and calling it is what starts that question's two-phase
 * clock. Reloading returns the same question with the original deadlines
 * rather than fresh ones — see `lib/quiz/serve.ts`.
 *
 * No caching, ever: two teams hitting this get different questions.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const round = Number(url.searchParams.get("round") ?? "2") as QuizRound;

    if (![2, 3].includes(round)) {
      return NextResponse.json({ error: "Round must be 2 or 3" }, { status: 400 });
    }

    const teamId = new ObjectId(session.teamId);

    if (!(await isQualified(teamId, round))) {
      return NextResponse.json({ error: "Your team didn't qualify for this round" }, { status: 403 });
    }

    const result = await serveNext(teamId, round);

    if (!result.ok) {
      return NextResponse.json({ error: "No questions in this round yet" }, { status: 404 });
    }
    if ("done" in result) {
      return NextResponse.json({ done: true }, { headers: { "Cache-Control": "no-store" } });
    }

    // Round 3 only: if this team is holding a granted comeback ability with
    // nowhere to land yet, this freshly-served question is where it attaches.
    // We also process any past questions that were skipped (timer ran out without submit)
    // so the team still gets their comeback meter updated for finishing in the bottom tier.
    if (round === 3) {
      const servesCol = await collections.quizServes();
      const expiredServes = await servesCol.find({
        teamId,
        round,
        streakProcessed: { $ne: true },
        answerableUntil: { $lt: new Date() }
      }).toArray();

      for (const expired of expiredServes) {
        await closeQuestionForComeback(teamId, round, expired.challengeSlug);
      }

      await expireOldComebackAbilities(teamId, round, result.question.slug);
      await attachPendingAbility(teamId, round, result.question.slug);
    }

    return NextResponse.json(result.question, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/serve] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
