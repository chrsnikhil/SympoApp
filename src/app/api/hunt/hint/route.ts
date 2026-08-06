import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { HINTS, HUNT_SLUGS, type HuntSlug } from "@/lib/hunt/content";

function isHuntSlug(slug: string): slug is HuntSlug {
  return (HUNT_SLUGS as readonly string[]).includes(slug);
}

/**
 * Buy the next hint.
 *
 * The increment is a CONDITIONAL update on the current hintsUsed, so two taps
 * on a slow connection cost one hint rather than two. gradeHunt reads this
 * field to reduce the award, and a double-charge is money the team never spent.
 */
export async function POST(req: Request) {
  try {
    const session = await requireSession();

    const { slug } = (await req.json().catch(() => ({}))) as { slug?: string };
    if (!slug || !isHuntSlug(slug)) {
      return NextResponse.json({ error: "Unknown puzzle" }, { status: 404 });
    }

    const teamId = new ObjectId(session.teamId);
    const [challenges, progress] = await Promise.all([
      collections.challenges(),
      collections.huntProgress(),
    ]);

    const row = await progress.findOne({ teamId, challengeSlug: slug });
    if (!row) return NextResponse.json({ error: "Not unlocked" }, { status: 403 });
    if (row.solvedAt) return NextResponse.json({ error: "Already solved" }, { status: 409 });

    const doc = await challenges.findOne({ type: "hunt", slug });
    const costs: number[] = doc?.config.hintCosts ?? [];
    const texts = HINTS[slug];

    if (row.hintsUsed >= costs.length) {
      return NextResponse.json({ error: "No hints left" }, { status: 409 });
    }

    const result = await progress.updateOne(
      { teamId, challengeSlug: slug, hintsUsed: row.hintsUsed },
      { $set: { hintsUsed: row.hintsUsed + 1 } }
    );
    if (result.modifiedCount === 0) {
      return NextResponse.json({ error: "Try again" }, { status: 409 });
    }

    return NextResponse.json({
      text: texts[row.hintsUsed],
      hintsUsed: row.hintsUsed + 1,
      cost: costs[row.hintsUsed],
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
