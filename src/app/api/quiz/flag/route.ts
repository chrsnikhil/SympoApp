import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import type { ProctorFlagKind, QuizRound } from "@/lib/db/types";

const VALID_KINDS: ProctorFlagKind[] = ["tab-switch", "window-blur", "fullscreen-exit"];

/**
 * Records a client-observed moment of leaving the full-screen quiz surface
 * during rounds 2/3 — see `ProctorGate.tsx` for what triggers this and
 * `db/types.ts`'s `ProctorFlag` for why this is a log, not an enforcement
 * mechanism. Append-only, same as the score ledger: never corrected in place.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();

    let body: { round?: number; kind?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    const round = Number(body.round) as QuizRound;
    if (![2, 3].includes(round)) {
      return NextResponse.json({ error: "round must be 2 or 3" }, { status: 400 });
    }
    if (!VALID_KINDS.includes(body.kind as ProctorFlagKind)) {
      return NextResponse.json({ error: "Unknown flag kind" }, { status: 400 });
    }

    const flags = await collections.proctorFlags();
    await flags.insertOne({
      teamId: new ObjectId(session.teamId),
      round,
      kind: body.kind as ProctorFlagKind,
      at: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/flag] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
