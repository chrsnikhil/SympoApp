import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
import type { EventKey } from "@/lib/config";

/**
 * Teams this process has already recorded, per event.
 *
 * The dashboards that call `recordArrival` poll every 3 seconds. Sixty teams is
 * twenty upserts a second, forever, to write a row that never changes after the
 * first one — on a Cosmos free tier that is a 16500 waiting to happen, and it
 * would be spent entirely on rewriting the same document.
 *
 * The guard reduces it to one write per team per event per process. It is
 * in-memory, so a restart or a second replica repeats the write once; the
 * upsert is idempotent, so that costs one wasted round trip and nothing else.
 * A shared lock would be more precise and would not be worth its own failure
 * mode.
 */
const recorded = new Map<EventKey, Set<string>>();

/**
 * Note that a team has turned up to an event.
 *
 * Call from the participant-facing dashboard of an event — the point a team is
 * definitely present, rather than the point they first score. That distinction
 * is the reason this exists: filtering the CTF admin console on submissions cut
 * it from 30 teams to 1, because 29 had arrived and not yet submitted, and a
 * coordinator who cannot see a team cannot help one.
 *
 * Never throws. Arrival is bookkeeping for the admin console; a team's ability
 * to play must not depend on it, so a failure here is logged and swallowed
 * rather than turned into a 500 on the page they are trying to load.
 */
export async function recordArrival(event: EventKey, teamId: string): Promise<void> {
  let seen = recorded.get(event);
  if (!seen) {
    seen = new Set();
    recorded.set(event, seen);
  }
  if (seen.has(teamId)) return;

  try {
    const parts = await collections.eventParticipation();
    await withThrottleRetry(() =>
      parts.updateOne(
        { teamId: new ObjectId(teamId), event },
        { $setOnInsert: { teamId: new ObjectId(teamId), event, firstSeenAt: new Date() } },
        { upsert: true }
      )
    );
    // Only after the write lands. Marking it first would let one failed upsert
    // hide a team from the console for the life of the process.
    seen.add(teamId);
  } catch (err) {
    console.error(`[participation] failed to record ${teamId} in ${event}`, err);
  }
}

/** Team ids that have turned up to an event, for the admin consoles. */
export async function arrivedTeamIds(event: EventKey): Promise<ObjectId[]> {
  const parts = await collections.eventParticipation();
  const rows = await parts.find({ event }).project<{ teamId: ObjectId }>({ teamId: 1 }).toArray();
  return rows.map((r) => r.teamId);
}
