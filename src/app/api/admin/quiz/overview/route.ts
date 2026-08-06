import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { avatarById, avatarForCoin, formatCoin } from "@/lib/quiz/avatars";
import { judgeAvailable } from "@/lib/quiz/judge";
import { connectionsPuzzles, currentConnectionsPuzzle } from "@/lib/quiz/round1";
import { ROUNDS, standings } from "@/lib/quiz/rounds";
import type { AvatarId, QuizRound } from "@/lib/db/types";

/**
 * One consolidated read-only endpoint backing the admin dashboard (tier 1 of
 * the three-tier control surface: dashboard → this API → `quiz-admin.ts` CLI).
 *
 * Deliberately ONE endpoint rather than the six separate ones a maximally
 * granular design would use — the dashboard needs one screen's worth of state
 * per round, and every number here is a read-only projection of data the
 * grader and ledger already own. Nothing is computed here that isn't also
 * derivable from `lib/quiz/rounds.ts`'s `standings()`, so the dashboard can
 * never drift from what `quiz-admin.ts standings` prints for the same round.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const round = Number(url.searchParams.get("round") ?? "1") as QuizRound;
    if (![1, 2, 3].includes(round)) {
      return NextResponse.json({ error: "Round must be 1, 2 or 3" }, { status: 400 });
    }

    const table = await standings(round);
    const spec = ROUNDS[round];

    const teamsCol = await collections.teams();
    const teamDocs = await teamsCol.find({}).toArray();
    const teamById = new Map(teamDocs.map((t) => [String(t._id), t]));

    const elimsCol = await collections.roundEliminations();
    const elimDocs = await elimsCol.find({}).toArray();
    const elimIds = new Set(elimDocs.map((e) => String(e.teamId)));

    const rows = table.map((row, i) => ({
      rank: i + 1,
      ...row,
      avatarName: avatarById(row.avatar as AvatarId | null)?.name ?? null,
      eliminated: elimIds.has(row.teamId),
      qualifying: elimIds.has(row.teamId) ? false : (spec.defaultAdvances === null ? null : i < spec.defaultAdvances),
    }));

    const payload: Record<string, unknown> = {
      round,
      title: spec.title,
      defaultAdvances: spec.defaultAdvances,
      groqConfigured: judgeAvailable(),
      standings: rows,
    };

    if (round === 1) {
      const [challenges, subs, memoryStates] = await Promise.all([
        collections.challenges(),
        collections.submissions(),
        collections.memoryStates(),
      ]);
      const games = await challenges.find({ type: "quiz", "config.round": 1 }).toArray();
      games.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0));

      const imageGame = games.find((g) => g.config.format === "prompt-image");
      const puzzles = connectionsPuzzles(games);
      const memoryGame = games.find((g) => g.config.format === "memory");

      const allSubs = await subs.find({ type: "quiz", challengeId: { $in: games.map((g) => g._id!) } }).toArray();
      const subByTeamChallenge = new Map(allSubs.map((s) => [`${s.teamId}:${s.challengeId}`, s]));
      const allMemory = memoryGame ? await memoryStates.find({ challengeSlug: memoryGame.slug }).toArray() : [];
      const memoryByTeam = new Map(allMemory.map((m) => [String(m.teamId), m]));

      const judgeQueue: Array<{ teamId: string; teamName: string; submittedAt: string; imageId: string | null; dataUrl: string | null }> = [];
      const judgedImages: Array<{
        teamId: string;
        teamName: string;
        points: number;
        similarity: number | null;
        summary: string | null;
        /** True when the integrity check zeroed this, not the rubric. */
        rejected: boolean;
        rejectedConfidence: string | null;
        dataUrl: string | null;
        judgedAt: string;
        /** Which judge produced this. Carries the mock warning when applicable. */
        judgedBy: string | null;
      }> = [];
      if (imageGame) {
        const promptImagesCol = await collections.promptImages();
        const allPromptImages = await promptImagesCol.find({ challengeSlug: imageGame.slug }).toArray();
        const promptImgByTeam = new Map(allPromptImages.map((img) => [String(img.teamId), img]));

        const latestByTeam = new Map<string, (typeof allSubs)[number]>();
        for (const s of allSubs) {
          if (String(s.challengeId) !== String(imageGame._id) || s.status !== "running") continue;
          const key = String(s.teamId);
          const existing = latestByTeam.get(key);
          if (!existing || s.receivedAt.getTime() > existing.receivedAt.getTime()) {
            latestByTeam.set(key, s);
          }
        }
        const doneSubs = allSubs.filter((s) => String(s.challengeId) === String(imageGame._id) && s.status === "done");

        const queuedTeamIds = new Set<string>();
        for (const [teamId, s] of latestByTeam) {
          queuedTeamIds.add(teamId);
          const dataUrl = s.payload ? `/api/admin/quiz/image?id=${s.payload}&t=${s.receivedAt.getTime()}` : null;
          judgeQueue.push({
            teamId,
            teamName: teamById.get(teamId)?.name ?? "Unknown",
            submittedAt: s.receivedAt.toISOString(),
            imageId: s.payload ?? null,
            dataUrl,
          });
        }

        const judgedTeamIds = new Set(doneSubs.map((s) => String(s.teamId)));
        for (const [teamId, img] of promptImgByTeam) {
          if (!queuedTeamIds.has(teamId) && !judgedTeamIds.has(teamId)) {
            const imgId = img._id.toString();
            judgeQueue.push({
              teamId,
              teamName: teamById.get(teamId)?.name ?? "Unknown",
              submittedAt: (img.uploadedAt ?? new Date()).toISOString(),
              imageId: imgId,
              dataUrl: `/api/admin/quiz/image?id=${imgId}&t=${(img.uploadedAt ?? new Date()).getTime()}`,
            });
          }
        }
        judgeQueue.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

        for (const s of doneSubs) {
          const teamId = String(s.teamId);
          const img = promptImgByTeam.get(teamId);
          const imgId = s.payload || img?._id?.toString() || null;
          const dataUrl = imgId ? `/api/admin/quiz/image?id=${imgId}&t=${s.receivedAt.getTime()}` : null;
          const meta = s.verdict?.meta as Record<string, unknown> | undefined;
          const simNum = typeof meta?.similarity === "number" ? meta.similarity : undefined;
          /**
           * `reason`, not `summary`.
           *
           * `recordImageEvaluation` writes the judge's sentence to `meta.reason`
           * (scoring.ts) and this read asked for `meta.summary`, so it was always
           * undefined and every row fell back to the literal "Graded
           * automatically". The one column meant to explain a score explained
           * nothing — including for a team scored 0, where the explanation is the
           * whole point. `summary` is still accepted so rows written by any older
           * shape keep rendering.
           */
          const sumStr =
            typeof meta?.reason === "string"
              ? meta.reason
              : typeof meta?.summary === "string"
                ? meta.summary
                : undefined;
          // A 0 from the integrity check and a 0 from a genuinely poor
          // recreation are different events and the coordinator has to be able
          // to tell them apart — a rejected team will ask why.
          const rejected = meta?.evalStatus === "rejected_watermark" || meta?.watermarkDetected === true;
          const rejectedConfidence =
            typeof meta?.watermarkConfidence === "string" ? meta.watermarkConfidence : null;

          judgedImages.push({
            teamId,
            teamName: teamById.get(teamId)?.name ?? "Unknown",
            points: s.verdict?.points ?? 0,
            similarity: simNum !== undefined ? Math.round(simNum * 100) : null,
            summary: sumStr ?? null,
            rejected,
            rejectedConfidence,
            dataUrl,
            judgedAt: s.receivedAt.toISOString(),
            judgedBy: typeof meta?.modelUsed === "string" ? meta.modelUsed : null,
          });
        }
        judgedImages.sort((a, b) => b.points - a.points);
      }

      // Solved-count per puzzle, for the coordinator's reveal panel — how many
      // teams have already cleared the puzzle currently being paced.
      const solvedByPuzzle = new Map<string, number>();
      for (const puzzle of puzzles) {
        const solvedCount = allSubs.filter(
          (s) => String(s.challengeId) === String(puzzle._id) && s.status === "done" && s.verdict?.correct
        ).length;
        solvedByPuzzle.set(puzzle.slug, solvedCount);
      }

      const now = new Date();
      const nonControlTeams = teamDocs.filter((t) => t.name !== "Quiz Control");

      const openedPuzzles = puzzles.filter((p) => p.opensAt && new Date(p.opensAt) <= now);
      const latestOpened = openedPuzzles.length > 0 ? openedPuzzles[openedPuzzles.length - 1] : puzzles[0] ?? null;
      const isLastPuzzle = latestOpened && puzzles.length > 0 && latestOpened.slug === puzzles[puzzles.length - 1].slug;
      const lastTotalImages = latestOpened?.config.connectionsImages?.length ?? 4;

      const perTeam = nonControlTeams.map((t) => {
        const key = String(t._id);
        const imageSub = imageGame ? subByTeamChallenge.get(`${key}:${imageGame._id}`) : undefined;
        const memory = memoryByTeam.get(key);

        let currentPuzzle: typeof latestOpened | null = latestOpened;
        if (isLastPuzzle && latestOpened) {
          const isClosedGlobal = latestOpened.closesAt ? now > latestOpened.closesAt : false;
          const teamSubsForLast = allSubs.filter(
            (s) => String(s.challengeId) === String(latestOpened._id) && String(s.teamId) === key
          );
          const solved = teamSubsForLast.some((s) => s.status === "done" && s.verdict?.correct);
          const timedOut = teamSubsForLast.some((s) => s.payload === "__timeout__");
          const exhausted = teamSubsForLast.length >= lastTotalImages;
          if (isClosedGlobal || solved || timedOut || exhausted) {
            currentPuzzle = null;
          }
        }

        const solvedPuzzles = puzzles.filter((p) =>
          allSubs.some((s) => String(s.challengeId) === String(p._id) && String(s.teamId) === key && s.status === "done" && s.verdict?.correct)
        ).length;

        return {
          teamId: key,
          teamName: t.name,
          image: imageGame
            ? { status: imageSub?.status ?? "not-started", points: imageSub?.verdict?.points ?? null }
            : null,
          connections:
            puzzles.length > 0
              ? {
                  puzzleIndex: currentPuzzle?.config.connectionsPuzzleIndex ?? puzzles.length,
                  totalPuzzles: puzzles.length,
                  solvedPuzzles,
                  doneWithAll: currentPuzzle === null,
                }
              : null,
          memory: memory
            ? {
                flipsUsed: memory.flipsUsed,
                flipCap: memory.flipCap,
                matchedPairs: memory.matched.length / 2,
                totalPairs: memory.grid.length / 2,
                completed: memory.completedAt !== null,
                points: memory.scoredPoints,
              }
            : null,
        };
      });

      payload.round1 = { games: games.map((g) => ({ slug: g.slug, title: g.title, format: g.config.format, points: g.points })), perTeam };
      payload.judgeQueue = judgeQueue;
      payload.judgedImages = judgedImages;
      payload.connectionsPuzzles = puzzles.map((p) => ({
        slug: p.slug,
        title: p.title,
        clue: p.config.connectionsClue ?? null,
        revealedCount: p.config.connectionsRevealedCount ?? 0,
        totalImages: (p.config.connectionsImages ?? []).length,
        puzzleIndex: p.config.connectionsPuzzleIndex ?? 0,
        opensAt: p.opensAt ? p.opensAt.toISOString() : null,
        closesAt: p.closesAt ? p.closesAt.toISOString() : null,
        solvedCount: solvedByPuzzle.get(p.slug) ?? 0,
      }));
    }

    // Proctoring & Integrity Violation Flags — aggregated across rounds 2 & 3
    const flags = await collections.proctorFlags();
    const flagRows = await flags.find({}).toArray();
    const byTeam = new Map<string, { tabSwitch: number; windowBlur: number; fullscreenExit: number; lastAt: string; round: number }>();
    for (const f of flagRows) {
      const key = String(f.teamId);
      const entry = byTeam.get(key) ?? { tabSwitch: 0, windowBlur: 0, fullscreenExit: 0, lastAt: f.at.toISOString(), round: f.round };
      if (f.kind === "tab-switch") entry.tabSwitch += 1;
      if (f.kind === "window-blur") entry.windowBlur += 1;
      if (f.kind === "fullscreen-exit") entry.fullscreenExit += 1;
      if (f.at.toISOString() > entry.lastAt) entry.lastAt = f.at.toISOString();
      byTeam.set(key, entry);
    }
    payload.flags = [...byTeam.entries()]
      .map(([teamId, counts]) => ({ teamId, teamName: teamById.get(teamId)?.name ?? "Unknown", ...counts }))
      .sort((a, b) => b.tabSwitch + b.windowBlur + b.fullscreenExit - (a.tabSwitch + a.windowBlur + a.fullscreenExit));

    // Teams currently frozen out by the tab-switch strike system — across all
    // rounds, since the coordinator needs to see and clear these regardless of
    // which round tab they happen to have the dashboard open on.
    const freezes = await collections.proctorFreezes();
    const frozenDocs = await freezes.find({ frozen: true }).toArray();
    payload.freezes = frozenDocs
      .map((f) => ({
        teamId: String(f.teamId),
        teamName: teamById.get(String(f.teamId))?.name ?? "Unknown",
        round: f.round,
        strikes: f.strikes,
        reason: f.frozenReason,
        frozenAt: f.frozenAt ? f.frozenAt.toISOString() : null,
      }))
      .sort((a, b) => new Date(b.frozenAt ?? 0).getTime() - new Date(a.frozenAt ?? 0).getTime());

    if (round === 3) {
      const comebacks = await collections.comebackStates();
      const rows2 = await comebacks.find({ round: 3 }).toArray();
      payload.comeback = rows2.map((c) => ({
        teamId: String(c.teamId),
        teamName: teamById.get(String(c.teamId))?.name ?? "Unknown",
        bottomStreak: c.bottomStreak,
        ability: c.ability,
        usableOnSlug: c.usableOnSlug,
        used: c.usedAt !== null,
      }));
    }

    const quizState = await (await collections.quizState()).findOne({ _id: "quiz" });
    payload.ended = quizState?.ended ?? false;
    payload.started = quizState?.started ?? false;

    // Coin claim state — small enough to always include; the coordinator's
    // desk view of "which discs are out and with whom."
    const coins = await collections.coins();
    const allCoins = await coins.find({}).sort({ _id: 1 }).toArray();
    payload.coins = {
      claimed: allCoins.filter((c) => c.teamId).length,
      total: allCoins.length,
      rows: allCoins
        .filter((c) => c.teamId)
        .map((c) => ({
          coin: formatCoin(c._id),
          character: avatarForCoin(c._id)?.name ?? "?",
          team: teamById.get(String(c.teamId))?.name ?? "?",
          isLocked: !!c.redeemedAt,
        })),
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    console.error("[admin/quiz/overview] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
