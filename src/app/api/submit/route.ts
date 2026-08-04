import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { eventFromHost, EVENTS, type EventKey } from "@/lib/config";
import { settleAfterQuizSubmit } from "@/lib/quiz/comeback";
import { submit } from "@/lib/submission/pipeline";
import { invalidateCache } from "@/lib/cache";

/**
 * The single submission endpoint for all four events.
 *
 * The event is taken from the Host header, not the request body — a client
 * can't submit a CTF flag against a quiz challenge by editing JSON.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();

    const hostEvent = eventFromHost(request.headers.get("host"));
    const body = (await request.json()) as {
      event?: string;
      challengeSlug?: string;
      payload?: string;
    };

    // Host wins; body.event is only a fallback for local dev on one origin.
    const event: EventKey | null =
      hostEvent ?? ((EVENTS as readonly string[]).includes(body.event ?? "") ? (body.event as EventKey) : null);

    if (!event) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    if (!body.challengeSlug || typeof body.payload !== "string") {
      return NextResponse.json({ error: "Missing challengeSlug or payload" }, { status: 400 });
    }

    const outcome = await submit({
      event,
      challengeSlug: body.challengeSlug,
      payload: body.payload,
      session,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    
    // Invalidate local in-memory cache to propagate submission changes instantly
    invalidateCache();

    // Round 3's Comeback Meter, settled HERE and not inside the grader — this
    // is the first point at which the ledger already holds the points for this
    // answer, and the meter must never be decided against a leaderboard older
    // than the score that just changed it. `settleAfterQuizSubmit` is a no-op
    // for anything that isn't a Round 3 MCQ.
    if (event === "quiz" && outcome.status === 200) {
      await settleAfterQuizSubmit(new ObjectId(session.teamId), body.challengeSlug, outcome.correct, outcome.meta);
    }

    return NextResponse.json(outcome, { status: outcome.status });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[submit] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
