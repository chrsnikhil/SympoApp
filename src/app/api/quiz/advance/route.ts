import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { judgeAll, judgeAvailable } from "@/lib/quiz/judge";
import { ROUNDS, advanceFrom, eliminateTeam, restoreTeam } from "@/lib/quiz/rounds";
import { resolveEstimate, resolvePromptImage } from "@/lib/quiz/scoring";
import { avatarForCoin, formatCoin, parseCoin } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";

/**
 * Coordinator controls. Admin session required — these decide the event.
 * This is tier 2 of the three-tier control surface (dashboard → this API →
 * `scripts/quiz-admin.ts`); the dashboard calls exactly this route.
 *
 *   POST { action: "advance", round: 1, count?: 8 }
 *     Cut to the next round. Writes the qualification set.
 *   POST { action: "resolve-estimate", slug: "<estimate-format-slug>" }
 *     Settle a shared-window "closest guess wins" game once every team has
 *     answered. Not used by the current Round 1 lineup (Connections replaced
 *     the earlier Guess the Number slot) — kept as general-purpose infra for
 *     an `estimate`-format challenge if one gets added again.
 *   POST { action: "judge-image", slug: "image-1" }
 *     Vision-judge Image Replication. Failed submissions are released to retry.
 *   POST { action: "resolve-image", slug: "image-1", scores: { "<teamId>": 0.82 } }
 *     The same settlement from hand-entered similarities, for overruling the judge.
 *
 * All are idempotent: advancing twice rewrites the same cut, resolving twice
 * finds nothing left queued.
 */
import { invalidateCache } from "@/lib/cache";

async function handlePOST(request: Request) {
  try {
    await requireAdmin();

    let body: {
      action?: string;
      round?: number;
      count?: number;
      slug?: string;
      teamId?: string;
      scores?: Record<string, number>;
      minutes?: number;
      coin?: string | number;
      teamName?: string;
    };
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
        const stateCol = await collections.quizState();
        const nextRound = (round + 1) as QuizRound;
        await stateCol.updateOne({ _id: "quiz" }, { $set: { [`round${nextRound}StartedAt`]: new Date() } }, { upsert: true });
        return NextResponse.json({
          ok: true,
          from: round,
          into: nextRound,
          intoTitle: ROUNDS[nextRound].title,
          qualified,
        });
      }

      case "unfreeze-team": {
        // Clears a team's proctoring freeze — the only way one lifts, per
        // `ProctorFreeze`'s design. Resets the strike count too: this is the
        // coordinator saying "start clean," not "forgive one violation."
        const teamIdStr = body.teamId as string;
        const round = Number(body.round) as QuizRound;
        if (!teamIdStr) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
        if (![1, 2, 3].includes(round)) return NextResponse.json({ error: "round must be 1, 2 or 3" }, { status: 400 });

        const teamId = new ObjectId(teamIdStr);
        const freezes = await collections.proctorFreezes();
        const now = new Date();
        await freezes.updateOne(
          { teamId, round },
          { $set: { teamId, round, strikes: 0, frozen: false, frozenAt: null, frozenReason: null, updatedAt: now } },
          { upsert: true }
        );
        const flags = await collections.proctorFlags();
        await flags.insertOne({ teamId, round, kind: "unfreeze", at: now });

        return NextResponse.json({ ok: true, note: "Team unfrozen — they can continue." });
      }

      case "eliminate-team": {
        const teamIdStr = (body.teamId || body.slug) as string;
        if (!teamIdStr) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
        await eliminateTeam(teamIdStr);
        return NextResponse.json({ ok: true, note: "Team eliminated" });
      }

      case "restore-team": {
        const teamIdStr = (body.teamId || body.slug) as string;
        if (!teamIdStr) return NextResponse.json({ error: "Missing teamId" }, { status: 400 });
        await restoreTeam(teamIdStr);
        return NextResponse.json({ ok: true, note: "Team restored" });
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
        // Triggering Turbopack reload openrouter
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

        // Find teams that have already been judged (status "done") so we skip them
        const doneSubs = await subs.find({ challengeId: challenge._id, status: "done" }).toArray();
        const judgedTeamIds = new Set(doneSubs.map((s) => String(s.teamId)));

        // Find all uploaded prompt images for this challenge
        const allPromptImages = await images.find({ challengeSlug: body.slug }).toArray();
        const latestPromptImageByTeam = new Map<string, (typeof allPromptImages)[number]>();
        for (const img of [...allPromptImages].sort((a, b) => b._id.getTimestamp().getTime() - a._id.getTimestamp().getTime())) {
          const key = String(img.teamId);
          if (!latestPromptImageByTeam.has(key)) latestPromptImageByTeam.set(key, img);
        }

        const entries: Array<{ teamId: string; image: string }> = [];
        for (const [teamId, img] of latestPromptImageByTeam) {
          if (!judgedTeamIds.has(teamId)) {
            entries.push({ teamId, image: img.dataUrl });
            if (entries.length === 1) break; // FREE TIER LIMIT: Only process 1 team per minute to avoid HTTP 429 TPM errors
          }
        }

        if (entries.length === 0) {
          return NextResponse.json({ ok: true, slug: body.slug, judged: [], failed: [], note: "No unjudged images found." });
        }

        // Run synchronously so the admin sees real results / errors
        try {
          const { judged, failed } = await judgeAll(challenge, reference, entries);
          const scores = Object.fromEntries(judged.map((j) => [j.teamId, j.similarity]));
          if (judged.length > 0) {
            await resolvePromptImage(body.slug!, scores);
          }
          if (failed.length > 0) {
            console.error(`[judge-image] ${failed.length} team(s) failed:`, failed.map((f) => `${f.teamId}: ${f.reason}`).join("; "));
          }
          return NextResponse.json({
            ok: true,
            slug: body.slug,
            judgedCount: judged.length,
            failedCount: failed.length,
            failures: failed.map((f) => ({ teamId: f.teamId, reason: f.reason })),
            note: judged.length > 0
              ? `Judged ${judged.length} team(s).${failed.length > 0 ? ` ${failed.length} failed — check server logs.` : ""}`
              : `All ${failed.length} team(s) failed vision judging — check server logs and GROQ_API_KEY.`,
          });
        } catch (err) {
          console.error("[judge-image] Unexpected error:", err);
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Vision judging failed unexpectedly" },
            { status: 500 }
          );
        }
      }

      case "open": {
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        const minutes = body.minutes ?? 30;
        const challenges = await collections.challenges();
        const opensAt = new Date();
        const closesAt = new Date(opensAt.getTime() + minutes * 60_000);
        const result = await challenges.updateOne(
          { type: "quiz", slug: body.slug },
          { $set: { opensAt, closesAt, "config.connectionsRevealedCount": 1 } }
        );
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

        const [serves, subs, scores, quals, memoryStates, comebacks, coins, proctorFreezes] = await Promise.all([
          collections.quizServes(),
          collections.submissions(),
          collections.scoreEvents(),
          collections.roundQualifications(),
          collections.memoryStates(),
          collections.comebackStates(),
          collections.coins(),
          collections.proctorFreezes(),
        ]);

        const result = {
          serves: (await serves.deleteMany({ teamId: { $in: ids } })).deletedCount,
          submissions: (await subs.deleteMany({ teamId: { $in: ids }, challengeId: { $in: challengeIds } })).deletedCount,
          ledgerRows: (await scores.deleteMany({ teamId: { $in: ids }, reason: { $in: slugs } })).deletedCount,
          qualifications: (await quals.deleteMany({ teamId: { $in: ids } })).deletedCount,
          memoryStates: (await memoryStates.deleteMany({ teamId: { $in: ids } })).deletedCount,
          comebackStates: (await comebacks.deleteMany({ teamId: { $in: ids } })).deletedCount,
          proctorFreezes: (await proctorFreezes.deleteMany({ teamId: { $in: ids } })).deletedCount,
        };
        await coins.updateMany({ teamId: { $in: ids } }, { $set: { teamId: null, claimedAt: null } });
        await teams.updateMany({ _id: { $in: ids } }, { $unset: { avatar: "", coin: "" } });

        return NextResponse.json({ ok: true, teams: targets.map((t) => t.name), cleared: result });
      }

      case "reveal-next-image": {
        // Connections is coordinator-paced, not timed: this is the click that
        // lands the next tile live for every team watching at once.
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        const challenges = await collections.challenges();
        const challenge = await challenges.findOne({ type: "quiz", slug: body.slug });
        if (!challenge || challenge.config.format !== "connections") {
          return NextResponse.json({ error: "No such connections puzzle" }, { status: 404 });
        }
        const total = (challenge.config.connectionsImages ?? []).length;
        // Atomic increment guarded by an $expr comparison against the total —
        // a plain read-then-write here would lose increments if two reveal
        // clicks ever landed close enough together to race (a double-click,
        // or two coordinators at once). $inc is applied server-side by
        // Mongo, which serializes concurrent writes to the same document, so
        // this can't overshoot or drop a click no matter how they overlap.
        const updated = await challenges.findOneAndUpdate(
          { _id: challenge._id, $expr: { $lt: [{ $ifNull: ["$config.connectionsRevealedCount", 0] }, total] } },
          { $inc: { "config.connectionsRevealedCount": 1 } },
          { returnDocument: "after" }
        );
        if (!updated) {
          const current = challenge.config.connectionsRevealedCount ?? 0;
          return NextResponse.json({ ok: true, slug: body.slug, revealedCount: Math.min(current, total), totalImages: total, note: "All tiles are already up." });
        }
        return NextResponse.json({ ok: true, slug: body.slug, revealedCount: updated.config.connectionsRevealedCount, totalImages: total });
      }

      case "close-puzzle": {
        // Moves every team off this connections puzzle regardless of whether
        // they solved it — the coordinator's "we're moving on" click, same
        // idea as letting Guess-the-Number's shared window run out.
        if (!body.slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
        const challenges = await collections.challenges();
        const result = await challenges.updateOne({ type: "quiz", slug: body.slug, "config.format": "connections" }, { $set: { closesAt: new Date() } });
        if (result.matchedCount === 0) return NextResponse.json({ error: "No such connections puzzle" }, { status: 404 });
        return NextResponse.json({ ok: true, slug: body.slug });
      }

      case "assign-coin": {
        // Coordinator-side coin assignment for the event floor — covers both
        // a walk-in team that's never touched the app (a fresh team+
        // participant get created) and a team that pre-registered online
        // (matched by name, given its coin). Same claim mechanics `/api/enter`
        // uses for self-service, just triggered by the coordinator instead.
        const parsed = parseCoin(String(body.coin));
        if (parsed === null) return NextResponse.json({ error: "Coins are numbered 01 to 60" }, { status: 400 });
        const forCoin = avatarForCoin(parsed);
        if (!forCoin) return NextResponse.json({ error: "That isn't a valid coin" }, { status: 400 });

        let teamName = typeof body.teamName === "string" ? body.teamName.trim() : "";
        if (!teamName) {
          teamName = `${forCoin.name} #${formatCoin(parsed)}`;
        }
        if (teamName.length > 40) return NextResponse.json({ error: "Team names cap at 40 characters" }, { status: 400 });

        const coins = await collections.coins();
        const teams = await collections.teams();
        const participants = await collections.participants();

        let disc = await coins.findOne({ _id: parsed });
        if (!disc) {
          await coins.insertOne({ _id: parsed, teamId: null, claimedAt: null });
          disc = await coins.findOne({ _id: parsed });
        }
        if (disc?.teamId) {
          await teams.updateOne({ _id: disc.teamId }, { $set: { name: teamName, avatar: forCoin.id } });
          await participants.updateOne({ teamId: disc.teamId }, { $set: { name: teamName } });
          return NextResponse.json({ ok: true, coin: formatCoin(parsed), teamId: disc.teamId.toString(), teamName, avatar: forCoin.name });
        }

        const existingTeam = await teams.findOne({ name: new RegExp(`^${teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
        if (existingTeam?.coin !== undefined) {
          return NextResponse.json({ error: `"${existingTeam!.name}" already holds coin ${formatCoin(existingTeam!.coin!)}` }, { status: 409 });
        }

        const teamId = existingTeam?._id ?? new ObjectId();
        const claimed = await coins.findOneAndUpdate(
          { _id: parsed, teamId: null },
          { $set: { teamId, claimedAt: new Date() } },
          { returnDocument: "after" }
        );
        if (!claimed) return NextResponse.json({ error: `Coin ${formatCoin(parsed)} was just taken` }, { status: 409 });

        if (existingTeam) {
          await teams.updateOne({ _id: teamId }, { $set: { avatar: forCoin.id, coin: parsed } });
        } else {
          await teams.insertOne({ _id: teamId, name: teamName, avatar: forCoin.id, coin: parsed, createdAt: new Date() });
        }
        const hasParticipant = await participants.findOne({ teamId });
        if (!hasParticipant) {
          await participants.insertOne({ _id: new ObjectId(), teamId, name: `${teamName} captain`, role: "participant", createdAt: new Date() });
        }

        return NextResponse.json({ ok: true, coin: formatCoin(parsed), teamId: teamId.toString(), teamName, avatar: forCoin.name });
      }

      case "revoke-coin": {
        if (body.coin === undefined || body.coin === null || body.coin === "") {
          return NextResponse.json({ error: "Missing coin" }, { status: 400 });
        }
        const parsed = parseCoin(String(body.coin));
        if (parsed === null) return NextResponse.json({ error: "Coins are numbered 01 to 60" }, { status: 400 });

        const coins = await collections.coins();
        const teams = await collections.teams();
        const disc = await coins.findOne({ _id: parsed });
        if (!disc?.teamId) return NextResponse.json({ ok: true, coin: formatCoin(parsed), note: "That coin wasn't assigned to anyone" });

        await coins.updateOne({ _id: parsed }, { $set: { teamId: null, claimedAt: null, redeemedAt: null } });
        await teams.updateOne({ _id: disc.teamId }, { $unset: { avatar: "", coin: "" } });
        return NextResponse.json({ ok: true, coin: formatCoin(parsed), note: "Token revoked and unlocked!" });
      }

      case "unlock-coin": {
        if (body.coin === undefined || body.coin === null || body.coin === "") {
          return NextResponse.json({ error: "Missing coin" }, { status: 400 });
        }
        const parsed = parseCoin(String(body.coin));
        if (parsed === null) return NextResponse.json({ error: "Coins are numbered 01 to 60" }, { status: 400 });

        const coins = await collections.coins();
        await coins.updateOne({ _id: parsed }, { $set: { redeemedAt: null } });
        return NextResponse.json({ ok: true, coin: formatCoin(parsed), note: "Token unlocked! Team can re-enter token now." });
      }

      case "start-quiz": {
        const state = await collections.quizState();
        const now = new Date();
        await state.updateOne({ _id: "quiz" }, { $set: { started: true, startedAt: now, round1StartedAt: now } }, { upsert: true });

        const challenges = await collections.challenges();
        const opensAt = new Date(now.getTime() + 20_000);
        await challenges.updateOne(
          { type: "quiz", slug: "image-1" },
          { $set: { opensAt, closesAt: null } }
        );
        return NextResponse.json({ ok: true, started: true, note: "Quiz started!" });
      }

      case "end-quiz": {
        const state = await collections.quizState();
        await state.updateOne({ _id: "quiz" }, { $set: { ended: true, endedAt: new Date() } }, { upsert: true });
        return NextResponse.json({ ok: true, ended: true });
      }

      case "restart-quiz": {
        const state = await collections.quizState();
        await state.updateOne({ _id: "quiz" }, { $set: { ended: false, endedAt: null, started: false, startedAt: null, round1StartedAt: null, round2StartedAt: null, round3StartedAt: null } }, { upsert: true });

        const quals = await collections.roundQualifications();
        await quals.deleteMany({});

        const elims = await collections.roundEliminations();
        await elims.deleteMany({});

        const serves = await collections.quizServes();
        await serves.deleteMany({});

        const memoryStates = await collections.memoryStates();
        await memoryStates.deleteMany({});

        const comebacks = await collections.comebackStates();
        await comebacks.deleteMany({});

        const subs = await collections.submissions();
        await subs.deleteMany({});

        const scores = await collections.scoreEvents();
        await scores.deleteMany({});

        const promptImages = await collections.promptImages();
        await promptImages.deleteMany({});

        const proctorFlags = await collections.proctorFlags();
        await proctorFlags.deleteMany({});

        const proctorFreezes = await collections.proctorFreezes();
        await proctorFreezes.deleteMany({});

        const rankCounters = await collections.rankCounters();
        await rankCounters.deleteMany({});

        const challenges = await collections.challenges();
        await challenges.updateMany(
          { type: "quiz" },
          { $set: { "config.connectionsRevealedCount": 0, opensAt: null, closesAt: null } }
        );

        return NextResponse.json({ ok: true, restarted: true, note: "Quiz gameplay reset! All teams and assigned tokens preserved." });
      }

      case "resume-quiz": {
        // Undo for a mis-click — End Quiz should be a real switch, not a
        // one-way door with no recovery.
        const state = await collections.quizState();
        await state.updateOne({ _id: "quiz" }, { $set: { ended: false, endedAt: null } }, { upsert: true });
        return NextResponse.json({ ok: true, ended: false });
      }

      default:
        return NextResponse.json(
          {
            error:
              "action must be advance, resolve-estimate, resolve-image, judge-image, open, reset, reveal-next-image, close-puzzle, assign-coin, revoke-coin, unfreeze-team, end-quiz or resume-quiz",
          },
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

export async function POST(request: Request) {
  const res = await handlePOST(request);
  if (res.status === 200) {
    invalidateCache();
  }
  return res;
}
