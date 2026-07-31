import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { readSnapshot } from "@/lib/leaderboard/materialize";
import { calculateChallengeValue } from "@/lib/ctf/scoring";

export async function GET() {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;

    const teams = await collections.teams();
    const subsCollection = await collections.submissions();
    const challengesCollection = await collections.challenges();

    const team = await teams.findOne({ _id: new (require("mongodb").ObjectId)(teamIdStr) });
    const teamName = team?.name ?? "Team";

    // Materialize and get current leaderboard
    const snapshot = await readSnapshot("ctf");
    const teamRow = snapshot.rows.find((r) => r.teamId === teamIdStr);
    const rank = teamRow ? snapshot.rows.indexOf(teamRow) + 1 : snapshot.rows.length + 1;
    const score = teamRow?.points ?? 0;

    // Get all CTF challenges
    const allCtfChallenges = await challengesCollection
      .find({ type: "ctf" })
      .toArray();

    // Get all correct solves across all teams to compute dynamic decay
    const allCorrectSubs = await subsCollection
      .find({ type: "ctf", "verdict.correct": true })
      .toArray();

    const solveCountMap = new Map<string, number>();
    for (const sub of allCorrectSubs) {
      const cId = sub.challengeId.toString();
      solveCountMap.set(cId, (solveCountMap.get(cId) ?? 0) + 1);
    }

    // Get team's own submissions
    const teamSubs = await subsCollection
      .find({ type: "ctf", teamId: new (require("mongodb").ObjectId)(teamIdStr) })
      .sort({ receivedAt: -1 })
      .toArray();

    const teamSolvedSet = new Set<string>();
    const teamFirstBloodSet = new Set<string>();

    for (const sub of teamSubs) {
      if (sub.verdict?.correct) {
        const cId = sub.challengeId.toString();
        teamSolvedSet.add(cId);
        if (sub.verdict.meta?.firstBlood) {
          teamFirstBloodSet.add(cId);
        }
      }
    }

    // Build challenge DTOs
    const challengesList = allCtfChallenges
      .filter((ch) => !ch.config.disabled && ch.config.status !== "hidden")
      .map((ch) => {
        const cId = ch._id!.toString();
        const solveCount = solveCountMap.get(cId) ?? 0;
        const initialPts = ch.config.initialPoints ?? ch.points;
        const minPts = ch.config.minimumPoints ?? 50;
        const decayAfter = ch.config.decayAfter ?? 5;
        const currentPoints = calculateChallengeValue(initialPts, minPts, decayAfter, solveCount);

        const isSolved = teamSolvedSet.has(cId);
        const isFirstBlood = teamFirstBloodSet.has(cId) || (ch.config.firstBloodTeamId && ch.config.firstBloodTeamId.toString() === teamIdStr);

        return {
          id: cId,
          slug: ch.slug,
          title: ch.title,
          difficulty: ch.config.difficulty ?? "Easy",
          category: ch.config.category ?? "General",
          description: ch.config.description ?? "",
          initialPoints: initialPts,
          points: currentPoints,
          solveCount,
          isSolved,
          isFirstBlood,
          attachments: ch.config.attachments ?? [],
          status: ch.config.status ?? "open",
        };
      });

    // Format submission history
    const historyList = teamSubs.map((s) => {
      const ch = allCtfChallenges.find((c) => c._id!.toString() === s.challengeId.toString());
      return {
        id: s._id!.toString(),
        challengeSlug: ch?.slug ?? "unknown",
        challengeTitle: ch?.title ?? "Unknown Challenge",
        receivedAt: s.receivedAt,
        correct: s.verdict?.correct ?? false,
        points: s.verdict?.points ?? 0,
        meta: s.verdict?.meta,
      };
    });

    return NextResponse.json({
      team: {
        id: teamIdStr,
        name: teamName,
        role: session.role,
      },
      score,
      rank,
      leaderboard: snapshot.rows,
      challenges: challengesList,
      submissions: historyList,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[ctf/dashboard] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
