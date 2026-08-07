import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections, getDb } from "@/lib/db/client";
import { readSnapshot } from "@/lib/leaderboard/materialize";

const SETTING_KEY = "ctf_event_state";
const DURATION_MINUTES = 105;

const difficultyWeight: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export async function GET() {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;

    const db = await getDb();
    const setting = await db.collection("system_settings").findOne({ key: SETTING_KEY });
    const eventState = setting?.state ?? "waiting";
    const startedAt = setting?.startedAt ? new Date(setting.startedAt).toISOString() : null;

    let remainingSeconds = DURATION_MINUTES * 60;
    if (eventState === "started" && setting?.startedAt) {
      const startTime = new Date(setting.startedAt).getTime();
      const endTime = startTime + DURATION_MINUTES * 60 * 1000;
      remainingSeconds = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
    }

    const teams = await collections.teamsCtf();
    const subsCollection = await collections.submissionsCtf();
    const challengesCollection = await collections.challengesCtf();

    const team = await teams.findOne({ _id: new (require("mongodb").ObjectId)(teamIdStr) });
    if (session.role !== "admin" && !team) {
      return NextResponse.json({ error: "Session expired or team no longer exists" }, { status: 401 });
    }
    const teamName = team?.name ?? "Team";

    // Materialize and get current leaderboard
    const snapshot = await readSnapshot("ctf");
    const teamRow = snapshot.rows.find((r) => r.teamId === teamIdStr);
    const rank = teamRow ? snapshot.rows.indexOf(teamRow) + 1 : snapshot.rows.length + 1;
    const score = teamRow?.points ?? 0;

    // Get all CTF challenges
    const allCtfChallenges = await challengesCollection
      .find({})
      .toArray();

    // Get all correct solves across all teams
    const allCorrectSubs = await subsCollection
      .find({ "verdict.correct": true })
      .toArray();

    const solveCountMap = new Map<string, number>();
    for (const sub of allCorrectSubs) {
      const cId = sub.challengeId.toString();
      solveCountMap.set(cId, (solveCountMap.get(cId) ?? 0) + 1);
    }

    // Get team's own submissions
    const teamSubs = await subsCollection
      .find({ teamId: new (require("mongodb").ObjectId)(teamIdStr) })
      .sort({ receivedAt: -1 })
      .toArray();

    const teamSolvedSet = new Set<string>();

    for (const sub of teamSubs) {
      if (sub.verdict?.correct) {
        const cId = sub.challengeId.toString();
        teamSolvedSet.add(cId);
      }
    }

    // Build challenge DTOs
    const challengesList = allCtfChallenges
      .filter((ch) => !ch.config.disabled && ch.config.status !== "hidden")
      .map((ch) => {
        const cId = ch._id!.toString();
        const solveCount = solveCountMap.get(cId) ?? 0;
        const initialPts = ch.config.initialPoints ?? ch.points;
        const isSolved = teamSolvedSet.has(cId);

        return {
          id: cId,
          slug: ch.slug,
          title: ch.title,
          difficulty: ch.config.difficulty ?? "Easy",
          category: ch.config.category ?? "General",
          description: ch.config.description ?? "",
          initialPoints: initialPts,
          points: initialPts,
          solveCount,
          isSolved,
          attachments: ch.config.attachments ?? [],
          status: ch.config.status ?? "open",
        };
      });

    // Sort challenges: Easy -> Medium -> Hard, then by slug
    challengesList.sort((a, b) => {
      const diffA = a.difficulty.toLowerCase();
      const diffB = b.difficulty.toLowerCase();
      const wA = difficultyWeight[diffA] ?? 99;
      const wB = difficultyWeight[diffB] ?? 99;
      if (wA !== wB) return wA - wB;
      return a.slug.localeCompare(b.slug, undefined, { numeric: true, sensitivity: "base" });
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
      eventState,
      startedAt,
      durationMinutes: DURATION_MINUTES,
      remainingSeconds,
      team: {
        id: teamIdStr,
        name: teamName,
        role: session.role,
      },
      score,
      rank,
      leaderboard: snapshot.rows.filter((r) => r.teamName.toLowerCase() !== "admin team"),
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
