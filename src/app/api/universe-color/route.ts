import { NextResponse } from "next/server";
import { getUniverseColor } from "@/app/universe/universeColor";

/**
 * POST /api/universe-color
 *
 * Accepts: { teamNumber: number }
 * Returns: { universeName, universeIndex, equations, rgb, hex }
 *
 * The computation happens server-side so participants can't inspect
 * client JS to reverse-engineer other teams' colours early.
 * Only the requesting team's equation set is returned.
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

  const { teamNumber } = body as { teamNumber?: unknown };

  // ── Validation ──────────────────────────────────────────────────────
  if (teamNumber === undefined || teamNumber === null) {
    return NextResponse.json(
      { error: "teamNumber is required" },
      { status: 400 },
    );
  }

  if (typeof teamNumber !== "number" || !Number.isInteger(teamNumber)) {
    return NextResponse.json(
      { error: "teamNumber must be an integer" },
      { status: 400 },
    );
  }

  if (teamNumber < 0) {
    return NextResponse.json(
      { error: "teamNumber must be non-negative" },
      { status: 400 },
    );
  }

  if (teamNumber > 9999) {
    return NextResponse.json(
      { error: "teamNumber must be ≤ 9999" },
      { status: 400 },
    );
  }

  // ── Compute ─────────────────────────────────────────────────────────
  const result = getUniverseColor(teamNumber);

  return NextResponse.json({
    universeName: result.universeName,
    universeIndex: result.universeIndex,
    equations: result.equations,
    worked: result.worked,
    rgb: result.rgb,
    hex: result.hex,
  });
}
