import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import {
  activateForServe,
  awardFreePass,
  getComebackView,
  sweepClosedQuestions,
  type ActivationResult,
} from "@/lib/quiz/comeback";
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
 * Round 3 additionally carries the Comeback Meter. The order below is fixed
 * and matters:
 *
 *   1. sweep — settle every question whose deadline has passed, so a timeout
 *      or an abandoned tab fills its bar (and may earn a power) BEFORE the
 *      next question is decided
 *   2. activate — fire a stored power onto THIS question, while the payload
 *      can still be amended
 *   3. serialise — the response carries the elimination the power just made,
 *      the active-power banner, and the meter, in ONE object, so the question
 *      and the meter can never disagree on screen
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
      // The round is out of questions. Sweep once more here or the LAST
      // question of Round 3 would never settle — the old code returned from
      // this branch before any comeback work ran at all.
      if (round === 3) {
        await sweepClosedQuestions(teamId, 3);
        return NextResponse.json(
          { done: true, comeback: await getComebackView(teamId, 3) },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      return NextResponse.json({ done: true }, { headers: { "Cache-Control": "no-store" } });
    }

    if (round !== 3) {
      return NextResponse.json(result.question, { headers: { "Cache-Control": "no-store" } });
    }

    await sweepClosedQuestions(teamId, 3);

    let activation: ActivationResult = { power: null, justActivated: false };
    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: result.question.slug });

    if (challenge) {
      activation = await activateForServe(teamId, 3, result.question.slug, challenge);

      if (activation.power) {
        // Same response, same object — this is the fix for Spider-Sense never
        // visibly removing anything.
        result.question.eliminated = activation.power.eliminated;

        if (activation.justActivated && activation.power.id === "free-pass") {
          await awardFreePass(teamId, new ObjectId(session.sub), challenge);
        }
      }
    }

    return NextResponse.json(
      {
        ...result.question,
        activePower: activation.power,
        comeback: await getComebackView(teamId, 3),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/serve] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
