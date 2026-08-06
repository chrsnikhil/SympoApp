import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import type { ProctorFlagKind, QuizRound } from "@/lib/db/types";

const VALID_KINDS: ProctorFlagKind[] = [
  "tab-switch",
  "window-blur",
  "fullscreen-exit",
  "screenshot-attempt",
];

/** Strikes 1-3 are warnings; the 4th one freezes. */
const STRIKE_LIMIT = 3;

/** Kinds that count toward the strike-and-freeze system.
 *
 *  `screenshot-attempt` is here by the coordinator's call. Freezing cannot
 *  un-press the key and the OS shortcut is not interceptable, so this does not
 *  PREVENT a screenshot — it makes taking one cost the team the round until a
 *  coordinator intervenes, which is a rule with teeth rather than a log nobody
 *  reads. Detection is best-effort and one-sided: a phone camera leaves no
 *  trace at all, so this must never be treated as proof, only as a signal
 *  worth acting on.
 *
 *  `fullscreen-exit` stays out — it already re-gates the UI on its own, and
 *  double-punishing it would freeze teams for an accidental Esc. */
const STRIKE_KINDS: ProctorFlagKind[] = ["tab-switch", "window-blur", "screenshot-attempt"];

/**
 * Records a client-observed moment of leaving the quiz surface, and — for
 * every round except Round 1's Image Replication game, which never calls
 * this with a strike-eligible kind — advances that team's `ProctorFreeze`
 * strike count, freezing them out once it runs past `STRIKE_LIMIT` or a
 * single switch away ran 10+ seconds (`longSwitch: true`). See
 * `ProctorGate.tsx` / `Round1Games.tsx` for what triggers this and
 * `db/types.ts`'s `ProctorFlag`/`ProctorFreeze` for the log-vs-enforcement
 * split.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    let body: { round?: number; kind?: string; longSwitch?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    const round = Number(body.round) as QuizRound;
    if (![1, 2, 3].includes(round)) {
      return NextResponse.json({ error: "round must be 1, 2 or 3" }, { status: 400 });
    }
    const kind = body.kind as ProctorFlagKind;
    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown flag kind" }, { status: 400 });
    }

    const now = new Date();
    const flags = await collections.proctorFlags();
    await flags.insertOne({ teamId, round, kind, at: now });

    if (!STRIKE_KINDS.includes(kind)) {
      return NextResponse.json({ ok: true });
    }

    const freezes = await collections.proctorFreezes();
    const existing = await freezes.findOne({ teamId, round });

    if (existing?.frozen) {
      // Already frozen — no further strikes accumulate until a coordinator clears it.
      return NextResponse.json({ ok: true, strikes: existing.strikes, frozen: true, reason: existing.frozenReason });
    }

    const strikes = (existing?.strikes ?? 0) + 1;
    const longSwitch = body.longSwitch === true;
    const frozen = longSwitch || strikes > STRIKE_LIMIT;
    const frozenReason: "strikes" | "long-switch" | null = frozen ? (longSwitch ? "long-switch" : "strikes") : null;

    await freezes.updateOne(
      { teamId, round },
      { $set: { teamId, round, strikes, frozen, frozenAt: frozen ? now : null, frozenReason, updatedAt: now } },
      { upsert: true }
    );

    if (frozen) {
      await flags.insertOne({ teamId, round, kind: "freeze", at: now });
    }

    return NextResponse.json({ ok: true, strikes, frozen, reason: frozenReason });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/flag] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
