import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

/**
 * Round 1 status: the three mini-games and this team's progress on each.
 * All three are attended in the SAME round — this is one screen's worth of
 * state, not a serve queue, because "Final Universe" is three unrelated games
 * played in sequence rather than N questions of one kind.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);

    const [challenges, subs, memoryStates] = await Promise.all([
      collections.challenges(),
      collections.submissions(),
      collections.memoryStates(),
    ]);
    const games = await challenges.find({ type: "quiz", "config.round": 1 }).toArray();
    games.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0));

    const teamSubs = await subs.find({ type: "quiz", teamId, challengeId: { $in: games.map((g) => g._id!) } }).toArray();
    const byChallenge = new Map(teamSubs.map((s) => [String(s.challengeId), s]));
    const teamMemory = await memoryStates.find({ teamId, challengeSlug: { $in: games.map((g) => g.slug) } }).toArray();
    const memoryBySlug = new Map(teamMemory.map((m) => [m.challengeSlug, m]));

    return NextResponse.json(
      {
        games: games.map((g) => {
          const sub = byChallenge.get(String(g._id));
          const memory = g.config.format === "memory" ? memoryBySlug.get(g.slug) : null;
          const status = memory
            ? memory.completedAt
              ? "done"
              : "running"
            : sub
              ? sub.status
              : "not-started";
          const verdict = memory
            ? memory.scoredPoints !== null
              ? { correct: memory.scoredPoints > 0, points: memory.scoredPoints }
              : null
            : sub?.verdict
              ? { correct: sub.verdict.correct, points: sub.verdict.points }
              : null;
          return {
            slug: g.slug,
            title: g.title,
            format: g.config.format,
            points: g.points,
            opensAt: g.opensAt ? g.opensAt.toISOString() : null,
            closesAt: g.closesAt ? g.closesAt.toISOString() : null,
            referenceImage: g.config.referenceImage ?? null,
            status,
            verdict,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/round1] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
