import { NextResponse } from "next/server";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { avatarById, avatarForCoin, formatCoin } from "@/lib/quiz/avatars";
import { judgeAvailable } from "@/lib/quiz/judge";
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

    const rows = table.map((row, i) => ({
      rank: i + 1,
      ...row,
      avatarName: avatarById(row.avatar as AvatarId | null)?.name ?? null,
      qualifying: spec.defaultAdvances === null ? null : i < spec.defaultAdvances,
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
      const memoryGame = games.find((g) => g.config.format === "memory");
      const guessGame = games.find((g) => g.config.format === "estimate");

      const allSubs = await subs.find({ type: "quiz", challengeId: { $in: games.map((g) => g._id!) } }).toArray();
      const subByTeamChallenge = new Map(allSubs.map((s) => [`${s.teamId}:${s.challengeId}`, s]));
      const allMemory = memoryGame ? await memoryStates.find({ challengeSlug: memoryGame.slug }).toArray() : [];
      const memoryByTeam = new Map(allMemory.map((m) => [String(m.teamId), m]));

      const judgeQueue: Array<{ teamId: string; teamName: string; submittedAt: string; imageId: string | null }> = [];
      if (imageGame) {
        for (const s of allSubs) {
          if (String(s.challengeId) !== String(imageGame._id) || s.status !== "queued") continue;
          judgeQueue.push({
            teamId: String(s.teamId),
            teamName: teamById.get(String(s.teamId))?.name ?? "Unknown",
            submittedAt: s.receivedAt.toISOString(),
            imageId: s.payload ?? null,
          });
        }
      }

      const perTeam = teamDocs
        .filter((t) => t.name !== "Quiz Control")
        .map((t) => {
          const key = String(t._id);
          const imageSub = imageGame ? subByTeamChallenge.get(`${key}:${imageGame._id}`) : undefined;
          const guessSub = guessGame ? subByTeamChallenge.get(`${key}:${guessGame._id}`) : undefined;
          const memory = memoryByTeam.get(key);
          return {
            teamId: key,
            teamName: t.name,
            image: imageGame
              ? { status: imageSub?.status ?? "not-started", points: imageSub?.verdict?.points ?? null }
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
            guess: guessGame
              ? { status: guessSub?.status ?? "not-started", points: guessSub?.verdict?.points ?? null }
              : null,
          };
        });

      payload.round1 = { games: games.map((g) => ({ slug: g.slug, title: g.title, format: g.config.format, points: g.points })), perTeam };
      payload.judgeQueue = judgeQueue;
    }

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
