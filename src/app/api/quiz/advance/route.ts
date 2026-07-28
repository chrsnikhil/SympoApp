import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { judgeAll, judgeAvailable } from "@/lib/quiz/judge";
import { ROUNDS, advanceFrom } from "@/lib/quiz/rounds";
import { resolveEstimate, resolvePromptImage } from "@/lib/quiz/scoring";
import type { QuizRound } from "@/lib/db/types";

/**
 * Coordinator controls. Admin session required — these decide the event.
 * This is tier 2 of the three-tier control surface (dashboard → this API →
 * `scripts/quiz-admin.ts`); the dashboard calls exactly this route.
 *
 *   POST { action: "advance", round: 1, count?: 8 }
 *     Cut to the next round. Writes the qualification set.
 *   POST { action: "resolve-estimate", slug: "guess-1" }
 *     Settle Guess the Number once every team has answered.
 *   POST { action: "judge-image", slug: "image-1" }
 *     Vision-judge Image Replication. Failed submissions are released to retry.
 *   POST { action: "resolve-image", slug: "image-1", scores: { "<teamId>": 0.82 } }
 *     The same settlement from hand-entered similarities, for overruling the judge.
 *
 * All are idempotent: advancing twice rewrites the same cut, resolving twice
 * finds nothing left queued.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();

    let body: { action?: string; round?: number; count?: number; slug?: string; scores?: Record<string, number>; minutes?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    switch (body.action) {
      case "advance": {
        const round = Number(body.round) as QuizRound;
        if (![1, 2].includes(round)) {
          return NextResponse.json({ error: "Can only advance from round 1 or 2" }, { status: 400 });
        }
        const qualified = await advanceFrom(round, body.count);
        return NextResponse.json({
          ok: true,
          from: round,
          into: round + 1,
          intoTitle: ROUNDS[(round + 1) as QuizRound].title,
          qualified,
        });
      }

      case "resolve-estimate": {
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        const awards = await resolveEstimate(body.slug);
        return NextResponse.json({ ok: true, slug: body.slug, awards });
      }

      case "resolve-image": {
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        if (!body.scores || typeof body.scores !== "object") {
          return NextResponse.json({ error: "Missing scores: { teamId: 0..1 }" }, { status: 400 });
        }
        const awards = await resolvePromptImage(body.slug, body.scores);
        return NextResponse.json({ ok: true, slug: body.slug, awards });
      }

      case "judge-image": {
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        if (!judgeAvailable()) {
          return NextResponse.json({ error: "No GROQ_API_KEY configured" }, { status: 503 });
        }

        const [challenges, subs, images] = await Promise.all([
          collections.challenges(),
          collections.submissions(),
          collections.promptImages(),
        ]);
        const challenge = await challenges.findOne({ type: "quiz", slug: body.slug });
        if (!challenge?._id) return NextResponse.json({ error: "No such quiz challenge" }, { status: 404 });

        const reference = challenge.config.referenceDataUrl;
        if (!reference) {
          return NextResponse.json(
            { error: "This challenge has no referenceDataUrl — run scripts/set-reference.ts first." },
            { status: 409 }
          );
        }

        const pending = await subs.find({ challengeId: challenge._id, status: "queued" }).toArray();
        if (pending.length === 0) {
          return NextResponse.json({ ok: true, slug: body.slug, judged: [], failed: [], note: "Nothing outstanding." });
        }

        const firstByTeam = new Map<string, (typeof pending)[number]>();
        for (const s of [...pending].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())) {
          const key = String(s.teamId);
          if (!firstByTeam.has(key)) firstByTeam.set(key, s);
        }

        const entries: Array<{ teamId: string; image: string }> = [];
        const missing: Array<{ teamId: string; reason: string }> = [];
        for (const [teamId, sub] of firstByTeam) {
          const image = sub.payload ? await images.findOne({ _id: new ObjectId(sub.payload) }) : null;
          if (!image) missing.push({ teamId, reason: "No uploaded image found" });
          else entries.push({ teamId, image: image.dataUrl });
        }

        const { judged, failed } = await judgeAll(challenge, reference, entries);
        const allFailed = [...missing, ...failed];

        if (allFailed.length > 0) {
          await subs.deleteMany({ challengeId: challenge._id, teamId: { $in: allFailed.map((f) => new ObjectId(f.teamId)) } });
        }

        const scores = Object.fromEntries(judged.map((j) => [j.teamId, j.similarity]));
        const awards = judged.length > 0 ? await resolvePromptImage(body.slug, scores) : [];

        return NextResponse.json({ ok: true, slug: body.slug, judged, failed: allFailed, awards });
      }

      case "open": {
        // Opens a shared-window Round 1 game (Image Replication's 5-minute
        // limit, Guess the Number's answer window) for `minutes` starting now
        // — sets the SAME opensAt/closesAt the submission pipeline already
        // enforces, so this needs no new gate.
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        const minutes = body.minutes ?? 5;
        const challenges = await collections.challenges();
        const opensAt = new Date();
        const closesAt = new Date(opensAt.getTime() + minutes * 60_000);
        const result = await challenges.updateOne({ type: "quiz", slug: body.slug }, { $set: { opensAt, closesAt } });
        if (result.matchedCount === 0) return NextResponse.json({ error: "No such quiz challenge" }, { status: 404 });
        return NextResponse.json({ ok: true, slug: body.slug, opensAt, closesAt });
      }

      case "reset": {
        // The most destructive coordinator action that exists — clears a
        // team's serves, submissions, ledger rows, qualifications, memory
        // state and comeback state, and releases its coin. The team and its
        // access code survive; only play history resets. Rehearsals need
        // this, and so does "the projector died mid-round."
        // `slug` is reused as the team-name-or-"all" argument here, to keep
        // this one route's body shape flat rather than adding a bespoke field.
        const who = typeof body.slug === "string" ? body.slug : "";
        if (!who) return NextResponse.json({ error: 'Missing team name (or "all") in `slug`' }, { status: 400 });

        const teams = await collections.teams();
        const targets =
          who === "all"
            ? await teams.find({ name: { $ne: "Quiz Control" } }).toArray()
            : await teams.find({ name: new RegExp(`^${who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).toArray();
        if (targets.length === 0) return NextResponse.json({ error: `No team matching "${who}"` }, { status: 404 });

        const ids = targets.map((t) => t._id!);
        const quizChallenges = await (await collections.challenges()).find({ type: "quiz" }).toArray();
        const slugs = quizChallenges.map((c) => `quiz:${c.slug}`);
        const challengeIds = quizChallenges.map((c) => c._id!);

        const [serves, subs, scores, quals, memoryStates, comebacks, coins] = await Promise.all([
          collections.quizServes(),
          collections.submissions(),
          collections.scoreEvents(),
          collections.roundQualifications(),
          collections.memoryStates(),
          collections.comebackStates(),
          collections.coins(),
        ]);

        const result = {
          serves: (await serves.deleteMany({ teamId: { $in: ids } })).deletedCount,
          submissions: (await subs.deleteMany({ teamId: { $in: ids }, challengeId: { $in: challengeIds } })).deletedCount,
          ledgerRows: (await scores.deleteMany({ teamId: { $in: ids }, reason: { $in: slugs } })).deletedCount,
          qualifications: (await quals.deleteMany({ teamId: { $in: ids } })).deletedCount,
          memoryStates: (await memoryStates.deleteMany({ teamId: { $in: ids } })).deletedCount,
          comebackStates: (await comebacks.deleteMany({ teamId: { $in: ids } })).deletedCount,
        };
        await coins.updateMany({ teamId: { $in: ids } }, { $set: { teamId: null, claimedAt: null } });
        await teams.updateMany({ _id: { $in: ids } }, { $unset: { avatar: "", coin: "" } });

        return NextResponse.json({ ok: true, teams: targets.map((t) => t.name), cleared: result });
      }

      default:
        return NextResponse.json(
          { error: "action must be advance, resolve-estimate, resolve-image, judge-image, open or reset" },
          { status: 400 }
        );
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    console.error("[quiz/advance] unexpected", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 500 });
  }
}
