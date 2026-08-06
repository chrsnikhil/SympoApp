import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { PLAYABLE_HUNT_SLUGS } from "@/lib/hunt/content";

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

    // Self-healing hunt_progress. This is load-bearing, not defensive
    // decoration — DO NOT remove it or "simplify" it into a plain insert.
    //
    // hunt_progress rows are otherwise created in exactly one place
    // (/api/enter's unclaimed-coin branch) and deleted in another
    // (scripts/seed-hunt.ts wipes them for every team on every reseed, which
    // the spec explicitly allows mid-event). Nothing else ever backfills them.
    // That means: a team that entered via the returning-coin or access-code
    // branch never gets rows at all; a mid-event reseed erases solvedAt for
    // every team that already solved something; and a transient insertMany
    // failure after the coin+team+participant are committed strands that team
    // hunt-less forever. All three look identical from the client: four empty
    // puzzles that never load.
    //
    // Upserting here, on every load, collapses all three cases at once — any
    // page load after the gap heals it. `$setOnInsert` is the whole point: it
    // only sets fields when the upsert CREATES a new document, so a row that
    // already exists is left completely untouched. Using `$set` here instead
    // would reset solvedAt to null and hintsUsed to 0 on every page load,
    // silently un-solving every puzzle a team has already gotten points for
    // (and letting appendScore fire a second time), which is worse than the
    // bug this fixes.
    //
    // Only the playable puzzles are unlocked and returned. The rest are seeded
    // and gradeable but have no component yet, so surfacing them showed the
    // team three "Coming Soon" tiles worth 100 points each that nothing could
    // solve. Unlocking is scoped to the same list so no progress row is created
    // for a puzzle a team cannot reach.
    await Promise.all(
      PLAYABLE_HUNT_SLUGS.map((challengeSlug) =>
        progress.updateOne(
          { teamId, challengeSlug },
          {
            $setOnInsert: {
              teamId,
              challengeSlug,
              unlockedAt: new Date(),
              solvedAt: null,
              hintsUsed: 0,
            },
          },
          { upsert: true }
        )
      )
    );

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
