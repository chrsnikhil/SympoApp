import { NextResponse } from "next/server";
import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { arrivedTeamIds } from "@/lib/event/participation";
import { PLAYABLE_HUNT_SLUGS } from "@/lib/hunt/content";

/**
 * Everything the hunt console shows, in one read-only call.
 *
 * READ-ONLY BY DESIGN, not by omission. The hunt has no timer to restart, no
 * questions to release and no bans to apply — a coordinator's job here is to
 * answer "is that team stuck, or is the round broken?", which is a question
 * about what has already happened. There is deliberately no counterpart that
 * writes: the grader is the only thing that may decide a round is solved, and a
 * console that could mark one by hand would be a second, quieter grader with
 * different rules.
 *
 * Scoped to teams that have ARRIVED at the hunt, not to every team on the
 * platform. The consoles used to list all thirty and put the quiz's teams in
 * front of the hunt's coordinator.
 */
export async function GET() {
  try {
    await requireAdmin();

    const [progressCol, challengesCol, teamsCol] = await Promise.all([
      collections.huntProgress(),
      collections.challenges(),
      collections.teams(),
    ]);

    const arrived = await arrivedTeamIds("hunt");
    const teams = await teamsCol
      .find({ _id: { $in: arrived }, name: { $nin: ["Admin Team", "Quiz Control"] } })
      .toArray();

    const challenges = await challengesCol
      .find({ type: "hunt", slug: { $in: [...PLAYABLE_HUNT_SLUGS] } })
      .toArray();
    const pointsBySlug = new Map(challenges.map((c) => [c.slug, c.points]));
    const titleBySlug = new Map(challenges.map((c) => [c.slug, c.title]));

    // One query for every arrived team rather than one per team: sixty teams
    // times five rounds is a single 300-document read, and the alternative is
    // sixty round trips on a Cosmos free tier that throttles at 400 RU.
    const teamIds = teams.map((t) => t._id!);
    const rows = await progressCol.find({ teamId: { $in: teamIds } }).toArray();

    const byTeam = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = String(r.teamId);
      const list = byTeam.get(k);
      if (list) list.push(r);
      else byTeam.set(k, [r]);
    }

    const teamRows = teams
      .map((t) => {
        const mine = byTeam.get(String(t._id)) ?? [];
        const bySlug = new Map(mine.map((r) => [r.challengeSlug, r]));

        const rounds = PLAYABLE_HUNT_SLUGS.map((slug) => {
          const row = bySlug.get(slug);
          return {
            slug,
            title: titleBySlug.get(slug) ?? slug,
            solved: Boolean(row?.solvedAt),
            solvedAt: row?.solvedAt ?? null,
            hintsUsed: row?.hintsUsed ?? 0,
          };
        });

        const solvedCount = rounds.filter((r) => r.solved).length;
        return {
          teamId: String(t._id),
          teamName: t.name,
          // `coin` is the quiz's identity and wins where both exist; teamNumber
          // is what a name-registered team gets. The console shows whichever
          // the team actually plays the hunt under, because that is the number
          // /blueprint used to pick their sector.
          number: typeof t.coin === "number" ? t.coin : (t.teamNumber ?? null),
          solvedCount,
          hintsUsed: rounds.reduce((n, r) => n + r.hintsUsed, 0),
          // Points earned from ROUNDS, so it stays comparable across teams.
          // This is not the leaderboard figure and is not meant to be — the
          // leaderboard applies hint deductions and its own ordering, and
          // reproducing that here would create a second source of truth that
          // disagrees with the board on screen behind the coordinator.
          roundPoints: rounds
            .filter((r) => r.solved)
            .reduce((n, r) => n + (pointsBySlug.get(r.slug) ?? 0), 0),
          lastSolvedAt: rounds
            .map((r) => r.solvedAt)
            .filter((d): d is Date => d instanceof Date)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
          rounds,
        };
      })
      .sort((a, b) => b.solvedCount - a.solvedCount || a.teamName.localeCompare(b.teamName));

    // Per-round totals answer the question a coordinator actually asks mid-event:
    // one team stuck is a team, twenty teams stuck on the same round is a round.
    const roundSummary = PLAYABLE_HUNT_SLUGS.map((slug) => ({
      slug,
      title: titleBySlug.get(slug) ?? slug,
      points: pointsBySlug.get(slug) ?? 0,
      seeded: pointsBySlug.has(slug),
      solvedBy: teamRows.filter((t) => t.rounds.find((r) => r.slug === slug)?.solved).length,
    }));

    return NextResponse.json({
      generatedAt: new Date(),
      teamCount: teamRows.length,
      teams: teamRows,
      rounds: roundSummary,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("[api/admin/hunt/overview] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
