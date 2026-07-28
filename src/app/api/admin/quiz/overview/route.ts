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
      const connectionsGame = games.find((g) => g.config.format === "connections");
      const memoryGame = games.find((g) => g.config.format === "memory");

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

      const connectionsSubs = connectionsGame
        ? allSubs.filter((s) => String(s.challengeId) === String(connectionsGame._id))
        : [];
      const connectionsByTeam = new Map<string, { attempts: number; solved: boolean }>();
      for (const s of connectionsSubs) {
        const key = String(s.teamId);
        const entry = connectionsByTeam.get(key) ?? { attempts: 0, solved: false };
        entry.attempts += 1;
        if (s.verdict?.correct) entry.solved = true;
        connectionsByTeam.set(key, entry);
      }

      const perTeam = teamDocs
        .filter((t) => t.name !== "Quiz Control")
        .map((t) => {
          const key = String(t._id);
          const imageSub = imageGame ? subByTeamChallenge.get(`${key}:${imageGame._id}`) : undefined;
          const memory = memoryByTeam.get(key);
          const connections = connectionsByTeam.get(key);
          return {
            teamId: key,
            teamName: t.name,
            image: imageGame
              ? { status: imageSub?.status ?? "not-started", points: imageSub?.verdict?.points ?? null }
              : null,
            connections: connectionsGame
              ? { attempts: connections?.attempts ?? 0, solved: connections?.solved ?? false }
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
    }

    if (round === 2 || round === 3) {
      const flags = await collections.proctorFlags();
      const rows = await flags.find({ round }).toArray();
      const byTeam = new Map<string, { tabSwitch: number; windowBlur: number; fullscreenExit: number; lastAt: string }>();
      for (const f of rows) {
        const key = String(f.teamId);
        const entry = byTeam.get(key) ?? { tabSwitch: 0, windowBlur: 0, fullscreenExit: 0, lastAt: f.at.toISOString() };
        if (f.kind === "tab-switch") entry.tabSwitch += 1;
        if (f.kind === "window-blur") entry.windowBlur += 1;
        if (f.kind === "fullscreen-exit") entry.fullscreenExit += 1;
        if (f.at.toISOString() > entry.lastAt) entry.lastAt = f.at.toISOString();
        byTeam.set(key, entry);
      }
      payload.flags = [...byTeam.entries()]
        .map(([teamId, counts]) => ({ teamId, teamName: teamById.get(teamId)?.name ?? "Unknown", ...counts }))
        .sort((a, b) => b.tabSwitch + b.windowBlur + b.fullscreenExit - (a.tabSwitch + a.windowBlur + a.fullscreenExit));
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
