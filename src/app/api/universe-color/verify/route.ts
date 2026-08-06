import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { hitRateLimit } from "@/lib/rateLimit";
import { teamNumberFromSession } from "@/lib/universe/teamNumber";
import { getUniverseColor } from "@/app/universe/universeColor";

/**
 * POST /api/universe-color/verify
 *
 * Accepts: { r: number, g: number, b: number }
 * Returns: { correct: boolean }
 *
 * The team number is derived from the session, NOT taken from the body. It
 * used to be a body field, which meant a signed-in team could verify against
 * any number it liked — and since only eight universes exist, walking 0–7
 * recovered every other team's colour in eight requests. See
 * `lib/universe/teamNumber.ts`.
 *
 * Rate-limited on the same window and cap as the submission pipeline
 * (`LIMITS.rateLimit`), keyed by team, so this grading surface has the same
 * ceiling as every other one.
 *
 * Never reveals the correct answer — only correct or not.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();

    const limit = hitRateLimit(`universe-color-verify:${session.teamId}`);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Slow down — too many attempts" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const teamNumber = await teamNumberFromSession(session);
    if (teamNumber === null) {
      return NextResponse.json(
        { error: "Your login has no coin number — see a coordinator" },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }

    const { r, g, b } = body as { r?: unknown; g?: unknown; b?: unknown };

    // ── Validate R, G, B are integers 0–255 ─────────────────────────────
    for (const [label, val] of [["r", r], ["g", g], ["b", b]] as const) {
      if (typeof val !== "number" || !Number.isInteger(val) || val < 0 || val > 255) {
        return NextResponse.json(
          { error: `Invalid ${label}: must be an integer 0–255` },
          { status: 400 },
        );
      }
    }

    // ── Compute correct values and compare ──────────────────────────────
    const result = getUniverseColor(teamNumber);

    const correct =
      result.rgb.r === (r as number) &&
      result.rgb.g === (g as number) &&
      result.rgb.b === (b as number);

    return NextResponse.json({ correct });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
