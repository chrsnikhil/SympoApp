import type { ObjectId } from "mongodb";
import type { EventKey } from "@/lib/config";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";

/**
 * Append-only score ledger.
 *
 * Rows are never updated or deleted. A scoring mistake is corrected by
 * appending a compensating row, which means:
 *   - the leaderboard is always a pure function of the ledger
 *   - disputes can be settled by reading history
 *   - concurrent writers never contend on a shared counter (no lost updates
 *     when 500 people score in the same second)
 */
export async function appendScore(entry: {
  teamId: ObjectId;
  event: EventKey;
  points: number;
  reason: string;
  submissionId?: ObjectId;
  at: Date;
}): Promise<void> {
  const scores = entry.event === "ctf" ? await collections.scoreEventsCtf() : await collections.scoreEvents();
  // Retried on Cosmos throttling: dropping a ledger row loses points a team
  // actually earned, at exactly the moment throughput is tightest — everyone
  // scoring at once.
  await withThrottleRetry(() => scores.insertOne(entry));
}
