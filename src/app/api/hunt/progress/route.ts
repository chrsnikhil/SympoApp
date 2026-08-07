import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { PLAYABLE_HUNT_SLUGS } from "@/lib/hunt/content";
import { ensureHuntProgress } from "@/lib/hunt/unlock";

/**
 * What this team can play, and how far they have got.
 *
 * answerHash is stripped before responding. It is a hash, not the code, but
 * shipping it invites an offline dictionary attack against an eight-letter
 * answer — which is a weekend's work, not a lifetime's.
 */
export async function GET() {
  try {
    const session = await requireSession();

    const teamId = new ObjectId(session.teamId);
    const [challenges, progress] = await Promise.all([
      collections.challenges(),
      collections.huntProgress(),
    ]);

    // Self-healing, and load-bearing rather than defensive: a team that
    // entered by a path which never wrote progress rows, or whose rows a
    // mid-event reseed removed, otherwise sees an empty hunt forever. The
    // reasoning and the $setOnInsert that makes it safe live in unlock.ts.
    await ensureHuntProgress(teamId);

    const docs = await challenges.find({ type: "hunt", slug: { $in: [...PLAYABLE_HUNT_SLUGS] } }).toArray();
    const rows = await progress.find({ teamId }).toArray();
    const byslug = new Map(rows.map((r) => [r.challengeSlug, r]));

    const puzzles = PLAYABLE_HUNT_SLUGS.map((slug) => {
      const doc = docs.find((d) => d.slug === slug);
      const row = byslug.get(slug);
      if (!doc || !row) return null;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { answerHash, hintCosts, ...safeConfig } = doc.config;
      return {
        slug,
        title: doc.title,
        points: doc.points,
        solved: Boolean(row.solvedAt),
        hintsUsed: row.hintsUsed,
        hintCount: (hintCosts ?? []).length,
        config: safeConfig,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json({ puzzles });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
