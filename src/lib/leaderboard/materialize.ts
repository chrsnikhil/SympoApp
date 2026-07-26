import { collections } from "@/lib/db/client";
import { EVENTS, type EventKey } from "@/lib/config";
import type { LeaderboardSnapshot } from "@/lib/db/types";

/**
 * Leaderboard materializer.
 *
 * Aggregating the ledger per request would mean ~100 aggregations/sec with 500
 * clients polling every 5s. Instead we aggregate ONCE every few seconds into a
 * snapshot document and serve that, so polling cost is independent of how many
 * people are watching — roughly 0.2 DB reads/sec total.
 *
 * Ties break on the EARLIER last-score time: the team that got there first
 * ranks higher. That's the same server-clock fairness the pipeline stamps.
 */
export async function materialize(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const scores = await collections.scoreEvents();
  const teams = await collections.teams();

  const match = event === "overall" ? {} : { event };

  const rows = await scores
    .aggregate<{ _id: unknown; points: number; lastScoreAt: Date }>([
      { $match: match },
      { $group: { _id: "$teamId", points: { $sum: "$points" }, lastScoreAt: { $max: "$at" } } },
      { $sort: { points: -1, lastScoreAt: 1 } },
      { $limit: 200 },
    ])
    .toArray();

  // One lookup for the names rather than a $lookup per row.
  const teamDocs = await teams.find({}).project<{ _id: unknown; name: string }>({ name: 1 }).toArray();
  const names = new Map(teamDocs.map((t) => [String(t._id), t.name]));

  const snapshot: LeaderboardSnapshot = {
    event,
    generatedAt: new Date(),
    rows: rows.map((r) => ({
      teamId: String(r._id),
      teamName: names.get(String(r._id)) ?? "Unknown",
      points: r.points,
      lastScoreAt: r.lastScoreAt ?? null,
    })),
  };

  const boards = await collections.leaderboards();
  await boards.updateOne({ event }, { $set: snapshot }, { upsert: true });
  return snapshot;
}

/** Refresh every board. Called on a timer or by an admin endpoint. */
export async function materializeAll(): Promise<void> {
  await Promise.all([...EVENTS, "overall" as const].map((e) => materialize(e)));
}

/** Read the current snapshot; materialize on demand if it's missing. */
export async function readSnapshot(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const boards = await collections.leaderboards();
  const existing = await boards.findOne({ event });
  return existing ?? materialize(event);
}
