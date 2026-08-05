import { NextResponse } from "next/server";
import { getUniverseColor } from "@/app/universe/universeColor";

/**
 * POST /api/universe-color/verify
 *
 * Accepts: { teamNumber: number, r: number, g: number, b: number }
 * Returns: { correct: boolean }
 *
 * Validates that the participant's submitted RGB values match the
 * server-computed values for their team number. Never reveals the
 * correct answer — only says correct or not.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body" },
      { status: 400 },
    );
  }

  const { teamNumber, r, g, b } = body as {
    teamNumber?: unknown;
    r?: unknown;
    g?: unknown;
    b?: unknown;
  };

  // ── Validate teamNumber ─────────────────────────────────────────────
  if (
    typeof teamNumber !== "number" ||
    !Number.isInteger(teamNumber) ||
    teamNumber < 0 ||
    teamNumber > 9999
  ) {
    return NextResponse.json(
      { error: "Invalid teamNumber" },
      { status: 400 },
    );
  }

  // ── Validate R, G, B are integers 0–255 ─────────────────────────────
  for (const [label, val] of [["r", r], ["g", g], ["b", b]] as const) {
    if (
      typeof val !== "number" ||
      !Number.isInteger(val) ||
      val < 0 ||
      val > 255
    ) {
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
}
