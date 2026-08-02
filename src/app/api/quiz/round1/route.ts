import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { revealedImages } from "@/lib/quiz/connections";
import { connectionsPuzzles, currentConnectionsPuzzle, gameForPhase, round1Phase } from "@/lib/quiz/round1";
import { getCachedQuizState } from "@/lib/quiz/rounds";

/**
 * Round 1 status — ONE phase at a time. "Final Universe" is Image
 * Replication, then Connections, then the Memory Game, played in that fixed
 * order; this endpoint only ever hands back the phase a team is currently on,
 * never the other two, so the client has nothing to render early even if it
 * wanted to.
 */
import { getCached } from "@/lib/cache";

export async function GET() {
  try {
    const session = await requireSession();
    const teamId = new ObjectId(session.teamId);
    const now = new Date();

    const games = await getCached("round1-challenges", 30000, async () => {
      const challenges = await collections.challenges();
      const list = await challenges.find({ type: "quiz", "config.round": 1 }).toArray();
      list.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0));
      return list;
    });

    const subs = await collections.submissions();
    const teamSubmissions = await subs.find({ teamId, challengeId: { $in: games.map((g) => g._id!) } }).toArray();

    const phase = await round1Phase(teamId, games, now, teamSubmissions);
    const completedPhases: string[] = [];
    if (phase !== "image") completedPhases.push("image");
    if (phase === "memory" || phase === "done") completedPhases.push("connections");
    if (phase === "done") completedPhases.push("memory");

    const serverTime = now.toISOString();

    // Tab-switch strike/freeze state — never armed during "image" (teams are
    // expected to tab out to an AI generator there), but always reported so
    // the client can drop the freeze screen the instant a coordinator clears
    // it without waiting on a separate poll.
    const freezes = await collections.proctorFreezes();
    const freezeState = await freezes.findOne({ teamId, round: 1 });
    const frozen = freezeState?.frozen ?? false;
    const frozenReason = freezeState?.frozenReason ?? null;

    if (phase === "connections") {
      const puzzles = connectionsPuzzles(games);
      const challenge = await currentConnectionsPuzzle(teamId, games, now, teamSubmissions);
      if (!challenge) {
        // Cleared between the phase check and here (a concurrent guess) — the
        // next poll will pick up "memory". Nothing to render this instant.
        return NextResponse.json({ serverTime, phase, completedPhases, frozen, frozenReason, game: null }, { headers: { "Cache-Control": "no-store" } });
      }

      const allSubs = teamSubmissions
        .filter((s) => String(s.challengeId) === String(challenge._id))
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
      const solved = allSubs.find((s) => s.status === "done" && s.verdict?.correct);

      const attemptsHistory = allSubs.map((s, idx) => ({
        imageIndex: (s.verdict?.meta as Record<string, unknown> | undefined)?.imageIndex ?? (idx + 1),
        payload: s.payload ?? "",
        correct: s.verdict?.correct ?? false,
        points: s.verdict?.points ?? 0,
        rank: (s.verdict?.meta as Record<string, unknown> | undefined)?.rank ?? null,
        reason: (s.verdict?.meta as Record<string, unknown> | undefined)?.reason ?? null,
        penalty: (s.verdict?.meta as Record<string, unknown> | undefined)?.penalty ?? null,
      }));

      return NextResponse.json(
        {
          serverTime,
          phase,
          completedPhases,
          frozen,
          frozenReason,
          game: {
            slug: challenge.slug,
            title: challenge.title,
            format: challenge.config.format,
            points: challenge.points,
            opensAt: challenge.opensAt ? challenge.opensAt.toISOString() : null,
            closesAt: challenge.closesAt ? challenge.closesAt.toISOString() : null,
            clue: challenge.config.connectionsClue ?? null,
            puzzleIndex: challenge.config.connectionsPuzzleIndex ?? 1,
            totalPuzzles: puzzles.length,
            images: revealedImages(challenge),
            totalImages: (challenge.config.connectionsImages ?? []).length,
            solved: !!solved,
            solvedVerdict: solved?.verdict ? { correct: true, points: solved.verdict.points, rank: (solved.verdict.meta as any)?.rank } : null,
            attempts: allSubs.length,
            attemptsHistory,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (phase === "done") {
      return NextResponse.json({ serverTime, phase, completedPhases, frozen, frozenReason, game: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const challenge = gameForPhase(games, phase);
    if (!challenge) {
      return NextResponse.json({ serverTime, phase, completedPhases, frozen, frozenReason, game: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const quizState = await getCachedQuizState();
    const round1Start = quizState?.round1StartedAt
      ? new Date(quizState.round1StartedAt)
      : quizState?.startedAt
        ? new Date(quizState.startedAt)
        : now;

    const baseOpensAt = challenge.opensAt ?? round1Start;
    const baseClosesAt = challenge.closesAt ?? new Date(baseOpensAt.getTime() + 270_000);

    const base = {
      slug: challenge.slug,
      title: challenge.title,
      format: challenge.config.format,
      points: challenge.points,
      opensAt: baseOpensAt.toISOString(),
      closesAt: baseClosesAt.toISOString(),
    };

    if (phase === "image") {
      const promptImages = await collections.promptImages();
      const sub = teamSubmissions.find((s) => String(s.challengeId) === String(challenge._id));
      const userImg = await promptImages.findOne({ teamId, challengeSlug: challenge.slug });
      return NextResponse.json(
        {
          serverTime,
          phase,
          completedPhases,
          frozen,
          frozenReason,
          game: {
            ...base,
            referenceImage: challenge.config.referenceImage ?? null,
            uploadedImage: userImg?.dataUrl ?? null,
            status: sub?.status ?? "not-started",
            verdict: sub?.verdict ? { correct: sub.verdict.correct, points: sub.verdict.points } : null,
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // phase === "memory" — MemoryGrid fetches its own state via /api/quiz/memory.
    return NextResponse.json({ serverTime, phase, completedPhases, frozen, frozenReason, game: base }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/round1] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
