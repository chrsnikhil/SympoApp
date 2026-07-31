import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { calculateChallengeValue } from "@/lib/ctf/scoring";

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
    const isFirstBlood = Boolean(teamSub?.verdict?.meta?.firstBlood);

    // Dynamic hints structure (defaults if not in config)
    const defaultHints = [
      { id: 1, text: "The key is hidden in plain sight.", unlockSeconds: 300 }, // 5 min
      { id: 2, text: "Check the frequency of bytes.", unlockSeconds: 600 },    // 10 min
      { id: 3, text: "It's encrypted... but not very well.", unlockSeconds: 900 }, // 15 min
    ];

    return NextResponse.json({
      teamId: teamIdStr,
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
        isFirstBlood,
        attachments: ch.config.attachments && ch.config.attachments.length > 0 ? ch.config.attachments : [],
        hints: ch.config.hints && ch.config.hints.length > 0 ? ch.config.hints : defaultHints,
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
