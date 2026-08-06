import { NextResponse } from "next/server";
import { appendScore } from "@/lib/score/ledger";
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

/**
 * Points charged when a team is frozen. Deliberately meaningful against a
 * Connections tile (12 for a first-place first-tile solve, 1-4 for a late one)
 * without being a round-ender — the point is to make tab-switching a bad trade,
 * not to eliminate a team for it.
 */
const FREEZE_PENALTY_POINTS = 10;

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

      /**
       * A freeze has to cost something, or it is a free pause.
       *
       * Neither Round 1 game runs on a per-team clock — the memory game is
       * capped by flips, Connections is paced by the coordinator's reveals — so
       * being frozen consumed no resource the team had. They returned with every
       * flip and every attempt intact, which made three tab switches a way to
       * buy thinking time rather than a penalty for taking it.
       *
       * A points deduction rather than flips or time: it applies whichever game
       * the team is in, needs no per-phase special casing, and a team can read
       * it on the leaderboard and see exactly what it cost.
       *
       * Charged at the freeze, once, not at unfreeze. Unfreeze is a coordinator
       * action — a penalty that landed only when someone got round to clearing
       * it would be arbitrary in size and dodgeable by simply not asking.
       */
      await appendScore({
        teamId,
        event: "quiz",
        points: -FREEZE_PENALTY_POINTS,
        reason: `proctor-freeze-round-${round}`,
        at: now,
      });
    }

    return NextResponse.json({ ok: true, strikes, frozen, reason: frozenReason, penalty: frozen ? FREEZE_PENALTY_POINTS : 0 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/flag] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
