import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { calculateChallengeValue } from "@/lib/ctf/scoring";
import { readSnapshot } from "@/lib/leaderboard/materialize";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> | { slug: string } }
) {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;
    const resolvedParams = await Promise.resolve(params);
    const slug = resolvedParams?.slug;

    if (!slug) {
      return NextResponse.json({ error: "Missing challenge slug" }, { status: 400 });
    }

    const cleanSlug = slug.trim();
    const challengesCollection = await collections.challenges();
    const subsCollection = await collections.submissions();
    const teamsCollection = await collections.teams();

    const ch = await challengesCollection.findOne({
      type: "ctf",
      $or: [
        { slug: cleanSlug },
        { slug: cleanSlug.toLowerCase() },
        { slug: { $regex: new RegExp(`^${cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i") } }
      ]
    });

    if (!ch || ch.config.disabled) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const cId = ch._id!.toString();

    // Query all open CTF challenges for prev / next question navigation
    const allCtfChallenges = await challengesCollection
      .find({ type: "ctf", disabled: { $ne: true }, "config.status": { $ne: "hidden" } })
      .project<{ slug: string }>({ slug: 1 })
      .toArray();

    const currIndex = allCtfChallenges.findIndex((c) => c.slug.toLowerCase() === ch.slug.toLowerCase());
    const prevSlug = currIndex > 0 ? allCtfChallenges[currIndex - 1].slug : null;
    const nextSlug = currIndex >= 0 && currIndex < allCtfChallenges.length - 1 ? allCtfChallenges[currIndex + 1].slug : null;

    // Get current team name and current total score
    const teamDoc = await teamsCollection.findOne({ _id: new (require("mongodb").ObjectId)(teamIdStr) });
    const snapshot = await readSnapshot("ctf");
    const teamRow = snapshot.rows.find((r) => r.teamId === teamIdStr);
    const teamScore = teamRow?.points ?? 0;
    const teamName = teamDoc?.name ?? teamRow?.teamName ?? "Team";

    // Get solve count for decay calculation
    const solveCount = await subsCollection.countDocuments({
      type: "ctf",
      challengeId: ch._id,
      "verdict.correct": true,
    });

    const initialPts = ch.config.initialPoints ?? ch.points;
    const minPts = ch.config.minimumPoints ?? 50;
    const decayAfter = ch.config.decayAfter ?? 5;
    const currentPoints = calculateChallengeValue(initialPts, minPts, decayAfter, solveCount);

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
      { id: 1, text: "The key is hidden in plain sight.", unlockSeconds: 300 }, // 5 min
      { id: 2, text: "Check the frequency of bytes.", unlockSeconds: 600 },    // 10 min
      { id: 3, text: "It's encrypted... but not very well.", unlockSeconds: 900 }, // 15 min
    ];

    // Get last board reset timestamp
    const { getDb } = await import("@/lib/db/client");
    const db = await getDb();
    const lastResetDoc = await db.collection("system_settings").findOne({ key: "ctf_last_reset" });
    const resetAt = lastResetDoc?.resetAt ? new Date(lastResetDoc.resetAt).toISOString() : "1970-01-01T00:00:00.000Z";

    const rawHints = ch.config.hints && ch.config.hints.length > 0 ? ch.config.hints : defaultHints;
    const hintsList = rawHints.map((h, idx) => ({
      ...h,
      unlockSeconds: idx === 0 ? 300 : idx === 1 ? 600 : 900,
    }));

    return NextResponse.json({
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
        points: currentPoints,
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
