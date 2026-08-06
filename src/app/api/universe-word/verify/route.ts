import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { hitRateLimit } from "@/lib/rateLimit";
import { isUniverseWord } from "@/lib/universe/words";

/**
 * POST /api/universe-word/verify
 *
 * Accepts: { index: number, guess: string }
 * Returns: { correct: boolean }
 *
 * The grid answer used to be checked in the browser, against an `answerWord`
 * prop passed down from the prerendered page — which meant every team's answer
 * was in the static HTML. The comparison now happens here, against
 * `@/lib/universe/words` (a `server-only` module), and the response is a single
 * boolean. Nothing else about the word crosses the wire: not its length, not a
 * near-miss count, not which letters were right.
 *
 * `index` comes from the body because it is not a secret — it is the URL the
 * player is already on, and 0–7 is the whole range. What is protected is the
 * word, and a boolean does not carry it.
 *
 * Rate-limited on LIMITS.rateLimit, per team, same as every other grading
 * surface (see lib/rateLimit.ts).
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();

    const limit = hitRateLimit(`universe-word-verify:${session.teamId}`);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Slow down — too many attempts" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const { index, guess } = body as { index?: unknown; guess?: unknown };

    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 7) {
      return NextResponse.json({ error: "index must be an integer 0–7" }, { status: 400 });
    }

    // Cap the length before touching it — an unbounded string here is free work
    // for an attacker. The words are eight letters; 64 is generous.
    if (typeof guess !== "string" || guess.length > 64) {
      return NextResponse.json({ error: "guess must be a short string" }, { status: 400 });
    }

    return NextResponse.json({ correct: isUniverseWord(index, guess) });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
