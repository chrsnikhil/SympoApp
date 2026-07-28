import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { spendComeback } from "@/lib/quiz/comeback";

/** Spend a Round 3 comeback ability on the question it's attached to. */

const REASONS: Record<string, { message: string; status: number }> = {
  "no-ability": { message: "You don't have a comeback ability right now", status: 404 },
  "wrong-question": { message: "That ability isn't for this question", status: 409 },
  "already-used": { message: "You've already used it", status: 409 },
  "not-served": { message: "That question isn't open for your team", status: 404 },
  expired: { message: "That question is already closed", status: 409 },
  unusable: { message: "That ability doesn't apply to this question", status: 400 },
};

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    let body: { challengeSlug?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }
    if (typeof body.challengeSlug !== "string" || !body.challengeSlug.trim()) {
      return NextResponse.json({ error: "Missing challengeSlug" }, { status: 400 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: body.challengeSlug, "config.round": 3 });
    if (!challenge) return NextResponse.json({ error: "That question isn't open for your team" }, { status: 404 });

    const result = await spendComeback(teamId, 3, body.challengeSlug, challenge);
    if (!result.ok) {
      const r = REASONS[result.reason];
      return NextResponse.json({ error: r.message }, { status: r.status });
    }

    return NextResponse.json({ ok: true, effect: result.effect });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/power] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
