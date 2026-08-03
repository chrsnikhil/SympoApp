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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;
    const resolvedParams = await Promise.resolve(params);
    const rawSlug = resolvedParams?.slug;

    if (!rawSlug) {
      return NextResponse.json({ error: "Missing challenge slug" }, { status: 400 });
    }

    const cleanSlug = decodeURIComponent(rawSlug).trim();

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

    const challengesCollection = await collections.challenges();
    const subsCollection = await collections.submissions();
    const teamsCollection = await collections.teams();

    const ch = await challengesCollection.findOne({
      $or: [
        { slug: cleanSlug },
        { slug: cleanSlug.toLowerCase() },
        { slug: { $regex: new RegExp(`^${cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") } }
      ]
    });

    if (!ch || ch.config?.disabled) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const cId = ch._id!.toString();

    // Query all open CTF challenges for prev / next question navigation
    const rawCtfChallenges = await challengesCollection
      .find({ type: "ctf", disabled: { $ne: true }, "config.status": { $ne: "hidden" } })
      .project<{ slug: string; config?: { difficulty?: string } }>({ slug: 1, config: 1 })
      .toArray();

    // Sort challenges strictly by difficulty: Easy -> Medium -> Hard, then by slug
    const sortedCtfChallenges = [...rawCtfChallenges].sort((a, b) => {
      const diffA = (a.config?.difficulty ?? "Easy").toLowerCase();
      const diffB = (b.config?.difficulty ?? "Easy").toLowerCase();
      const wA = difficultyWeight[diffA] ?? 99;
      const wB = difficultyWeight[diffB] ?? 99;
      if (wA !== wB) return wA - wB;
      return a.slug.localeCompare(b.slug, undefined, { numeric: true, sensitivity: "base" });
    });

    const currIndex = sortedCtfChallenges.findIndex((c) => c.slug.toLowerCase() === ch.slug.toLowerCase());
    const prevSlug = currIndex > 0 ? sortedCtfChallenges[currIndex - 1].slug : null;
    const nextSlug = currIndex >= 0 && currIndex < sortedCtfChallenges.length - 1 ? sortedCtfChallenges[currIndex + 1].slug : null;

    // Get current team name and current total score
    const teamDoc = await teamsCollection.findOne({ _id: new (require("mongodb").ObjectId)(teamIdStr) });
    if (session.role !== "admin" && !teamDoc) {
      return NextResponse.json({ error: "Session expired or team no longer exists" }, { status: 401 });
    }
    const snapshot = await readSnapshot("ctf");
    const teamRow = snapshot.rows.find((r) => r.teamId === teamIdStr);
    const teamScore = teamRow?.points ?? 0;
    const teamName = teamDoc?.name ?? teamRow?.teamName ?? "Team";

    // Get solve count
    const solveCount = await subsCollection.countDocuments({
      type: "ctf",
      challengeId: ch._id,
      "verdict.correct": true,
    });

    const initialPts = ch.config.initialPoints ?? ch.points;

    // Check if current team solved it
    const teamSub = await subsCollection.findOne({
      type: "ctf",
      challengeId: ch._id,
      teamId: new (require("mongodb").ObjectId)(teamIdStr),
      "verdict.correct": true,
    });

    const isSolved = Boolean(teamSub);

    // Dynamic hints structure (defaults if not in config)
    const defaultHints = [
      { id: 1, text: "The key is hidden in plain sight.", unlockSeconds: 300 },
      { id: 2, text: "Check the frequency of bytes.", unlockSeconds: 600 },
    ];

    const lastResetDoc = await db.collection("system_settings").findOne({ key: "ctf_last_reset" });
    const resetAt = lastResetDoc?.resetAt ? new Date(lastResetDoc.resetAt).toISOString() : "1970-01-01T00:00:00.000Z";

    const rawHints = ch.config.hints && ch.config.hints.length > 0 ? ch.config.hints : defaultHints;
    const hintsList = rawHints.map((h, idx) => ({
      ...h,
      unlockSeconds: idx === 0 ? 300 : 600,
    }));

    return NextResponse.json({
      eventState,
      startedAt,
      durationMinutes: DURATION_MINUTES,
      remainingSeconds,
      teamId: teamIdStr,
      teamName,
      teamScore,
      prevSlug,
      nextSlug,
      resetAt,
      challenge: {
        id: cId,
        slug: ch.slug,
        title: ch.title,
        difficulty: ch.config.difficulty ?? "Medium",
        category: ch.config.category ?? "General",
        description: ch.config.description ?? "A message has been intercepted from across the multiverse. Analyze the file and reverse the logic.",
        details: ch.config.details ?? "We found a suspicious encoded file in the server logs. Inspect patterns, key usage, and encoding layers to extract the flag.",
        initialPoints: initialPts,
        points: initialPts,
        solveCount,
        isSolved,
        attachments: ch.config.attachments && ch.config.attachments.length > 0 ? ch.config.attachments : [],
        hints: hintsList,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[api/ctf/challenge/[slug]] error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
