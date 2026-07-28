import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { revealedImages, secondsToNextReveal } from "@/lib/quiz/connections";
import { gameForPhase, round1Phase } from "@/lib/quiz/round1";

/**
 * Round 1 status — ONE phase at a time. "Final Universe" is Image
 * Replication, then Connections, then the Memory Game, played in that fixed
 * order; this endpoint only ever hands back the phase a team is currently on,
 * never the other two, so the client has nothing to render early even if it
 * wanted to.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);
    const now = new Date();

    const challenges = await collections.challenges();
    const games = await challenges.find({ type: "quiz", "config.round": 1 }).toArray();
    games.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0));

    const phase = await round1Phase(teamId, games, now);
    const completedPhases: string[] = [];
    if (phase !== "image") completedPhases.push("image");
    if (phase === "memory" || phase === "done") completedPhases.push("connections");
    if (phase === "done") completedPhases.push("memory");

    const challenge = gameForPhase(games, phase);
    if (!challenge) {
      return NextResponse.json({ phase, completedPhases, game: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const base = {
      slug: challenge.slug,
      title: challenge.title,
      format: challenge.config.format,
      points: challenge.points,
      opensAt: challenge.opensAt ? challenge.opensAt.toISOString() : null,
      closesAt: challenge.closesAt ? challenge.closesAt.toISOString() : null,
    };

    if (phase === "image") {
      const subs = await collections.submissions();
      const sub = await subs.findOne({ challengeId: challenge._id, teamId });
      return NextResponse.json(
        {
          phase,
          completedPhases,
          game: {
            ...base,
            referenceImage: challenge.config.referenceImage ?? null,
            status: sub?.status ?? "not-started",
            verdict: sub?.verdict ? { correct: sub.verdict.correct, points: sub.verdict.points } : null,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (phase === "connections") {
      const subs = await collections.submissions();
      const solved = await subs.findOne({ challengeId: challenge._id, teamId, status: "done", "verdict.correct": true });
      const attempts = await subs.countDocuments({ challengeId: challenge._id, teamId });
      return NextResponse.json(
        {
          phase,
          completedPhases,
          game: {
            ...base,
            images: revealedImages(challenge, now),
            totalImages: (challenge.config.connectionsImages ?? []).length,
            secondsToNextReveal: secondsToNextReveal(challenge, now),
            solved: !!solved,
            attempts,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // phase === "memory" — MemoryGrid fetches its own state via /api/quiz/memory.
    return NextResponse.json({ phase, completedPhases, game: base }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/round1] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
