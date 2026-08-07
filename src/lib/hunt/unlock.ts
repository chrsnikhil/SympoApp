import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { recordArrival } from "@/lib/event/participation";
import { PLAYABLE_HUNT_SLUGS } from "./content";

/**
 * Make sure this team has a progress row for every round that is open to them.
 *
 * WHY THIS IS NOT JUST /api/hunt/progress's JOB ANY MORE. gradeHunt refuses a
 * submission for a round the team has no hunt_progress row for — that is the
 * gate that stops someone reading the circuit's slugs out of the bundle and
 * submitting straight to level 5. The only thing that created those rows was
 * the hunt's own puzzle list.
 *
 * That held while every round rendered inside the hunt shell. It stopped
 * holding when rounds grew their own routes: /universe, /shiftverse and
 * /blueprint can each be opened directly — from a link, a bookmark, or a
 * coordinator telling a team where to go — without /hunt ever loading. Those
 * teams got "not-unlocked" on a correct answer, which reads as the round being
 * broken and is impossible to tell apart from a wrong one.
 *
 * So the rounds that are open by definition create their rows wherever a team
 * arrives. PLAYABLE_HUNT_SLUGS is exactly that set — anything chained behind
 * another round (circuit-2 onwards) is deliberately absent, so the gate still
 * does its job for the rounds it was written for.
 *
 * `$setOnInsert` throughout: a team that has already solved a round must not
 * have solvedAt reset by arriving at it again. That would un-solve the puzzle
 * and let appendScore pay a second time.
 */
export async function ensureHuntProgress(teamId: ObjectId): Promise<void> {
  /**
   * Arrival is recorded HERE rather than at each call site, for the same reason
   * the progress rows are: this is the one chokepoint every entrance to the
   * hunt already goes through, and the next round to grow its own route will
   * get it for free instead of being the one that forgot.
   *
   * "Arrived at the hunt" and "has progress rows for the hunt" are the same
   * event, so there is nothing to keep in sync. The CTF console proved the cost
   * of getting this wrong from the other direction — filtering on submissions
   * showed 1 team of 30, because 29 had turned up and not yet scored, and a
   * coordinator who cannot see a team cannot help one.
   *
   * Not awaited, and it swallows its own errors: this is bookkeeping for a
   * console, and a team's ability to play must never wait on it or fail with it.
   */
  void recordArrival("hunt", String(teamId));

  const progress = await collections.huntProgress();
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
}
