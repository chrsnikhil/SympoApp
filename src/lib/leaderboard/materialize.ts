import { collections } from "@/lib/db/client";
import { EVENTS, LEADERBOARD_REFRESH_MS, type EventKey } from "@/lib/config";
import type { LeaderboardSnapshot, Challenge } from "@/lib/db/types";
import { calculateChallengeValue } from "@/lib/ctf/scoring";

/**
 * Leaderboard materializer.
 *
 * For CTF: calculates dynamic scores using `calculateChallengeValue`,
 * atomic first blood bonuses, and category completion time bonuses.
 *
 * For Hunt, Quiz, Code, and Overall: uses the existing score events pipeline.
 */
export async function materialize(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const teams = event === "ctf" ? await collections.teamsCtf() : await collections.teams();
  const teamDocs = await teams.find({}).project<{ _id: unknown; name: string; banned?: boolean; penaltyPoints?: number }>({ name: 1, banned: 1, penaltyPoints: 1 }).toArray();
  const names = new Map(teamDocs.map((t) => [String(t._id), t.name]));
  const bannedTeamIds = new Set(teamDocs.filter((t) => t.banned || t.name === "Admin Team").map((t) => String(t._id)));

  if (event === "ctf") {
    const subsCollection = await collections.submissionsCtf();
    const challengesCollection = await collections.challengesCtf();

    const ctfChallenges = await challengesCollection.find({ type: "ctf" }).toArray();
    const correctSubmissions = await subsCollection
      .find({ type: "ctf", "verdict.correct": true })
      .sort({ receivedAt: 1 })
      .toArray();

    // Count solves per challenge
    const solveCountMap = new Map<string, number>();
    for (const sub of correctSubmissions) {
      if (bannedTeamIds.has(String(sub.teamId))) continue;
      const cId = String(sub.challengeId);
      solveCountMap.set(cId, (solveCountMap.get(cId) ?? 0) + 1);
    }

    // Precalculate dynamic value for each challenge
    const challengeValueMap = new Map<string, number>();
    const challengeMap = new Map<string, Challenge>();

    for (const ch of ctfChallenges) {
      const cId = String(ch._id);
      challengeMap.set(cId, ch);
      const count = solveCountMap.get(cId) ?? 0;
      const initialPts = ch.config.initialPoints ?? ch.points;
      const minPts = ch.config.minimumPoints ?? 50;
      const decayAfter = ch.config.decayAfter ?? 5;
      const val = calculateChallengeValue(initialPts, minPts, decayAfter, count);
      challengeValueMap.set(cId, val);
    }

    // Group solves and calculate team stats
    interface TeamCtfStats {
      teamId: string;
      points: number;
      solvedCount: number;
      lastScoreAt: Date | null;
      solvesByCategory: Map<string, Array<{ challengeId: string; receivedAt: Date }>>;
      solvedChallengeIds: Set<string>;
    }

    const teamStats = new Map<string, TeamCtfStats>();

    const scoreEventsCollection = await collections.scoreEventsCtf();
    const [submittedIds, scoredIds] = await Promise.all([
      subsCollection.distinct("teamId", { type: "ctf" }),
      scoreEventsCollection.distinct("teamId", { event: "ctf" }),
    ]);
    const ctfTeamIds = new Set([...submittedIds, ...scoredIds].map((id) => String(id)));

    // Initialize non-banned teams (excluding Admin Team) with initial penalty deductions if any
    for (const t of teamDocs) {
      const tid = String(t._id);
      if (bannedTeamIds.has(tid)) continue;
      if (!ctfTeamIds.has(tid)) continue;
      teamStats.set(tid, {
        teamId: tid,
        points: -(t.penaltyPoints ?? 0),
        solvedCount: 0,
        lastScoreAt: null,
        solvesByCategory: new Map(),
        solvedChallengeIds: new Set(),
      });
    }

    for (const sub of correctSubmissions) {
      const tid = String(sub.teamId);
      if (bannedTeamIds.has(tid)) continue;
      const cId = String(sub.challengeId);
      let stats = teamStats.get(tid);

      if (!stats) {
        stats = {
          teamId: tid,
          points: 0,
          solvedCount: 0,
          lastScoreAt: null,
          solvesByCategory: new Map(),
          solvedChallengeIds: new Set(),
        };
        teamStats.set(tid, stats);
      }

      // Avoid double counting solve for same team if multiple correct subs recorded
      if (stats.solvedChallengeIds.has(cId)) continue;
      stats.solvedChallengeIds.add(cId);

      const ch = challengeMap.get(cId);
      const baseVal = challengeValueMap.get(cId) ?? (ch?.points ?? 0);

      stats.points += baseVal;
      stats.solvedCount += 1;

      if (!stats.lastScoreAt || sub.receivedAt > stats.lastScoreAt) {
        stats.lastScoreAt = sub.receivedAt;
      }

      // Track solves by difficulty category for Time Bonus
      const category = (ch?.config.difficulty ?? ch?.config.category ?? "easy").toLowerCase().trim();
      if (!stats.solvesByCategory.has(category)) {
        stats.solvesByCategory.set(category, []);
      }
      stats.solvesByCategory.get(category)!.push({ challengeId: cId, receivedAt: sub.receivedAt });
    }

    // Calculate Category Time Bonus (+50 pts if category completed within category limit, max ONCE per team)
    const categoryLimitsMs: Record<string, number> = {
      easy: 15 * 60 * 1000,   // 15 mins
      medium: 25 * 60 * 1000, // 25 mins
      hard: 30 * 60 * 1000,   // 30 mins
    };

    const challengesByCategory = new Map<string, string[]>();
    for (const ch of ctfChallenges) {
      const cId = String(ch._id);
      const diff = (ch.config.difficulty ?? ch.config.category ?? "easy").toLowerCase().trim();
      if (!challengesByCategory.has(diff)) {
        challengesByCategory.set(diff, []);
      }
      challengesByCategory.get(diff)!.push(cId);
    }

    for (const stats of teamStats.values()) {
      let earnedBonus = false;
      for (const [diffCategory, categoryChallengeIds] of challengesByCategory.entries()) {
        if (earnedBonus) break;
        if (categoryChallengeIds.length === 0) continue;

        const limitMs = categoryLimitsMs[diffCategory] ?? (30 * 60 * 1000);
        const teamCategorySolves = stats.solvesByCategory.get(diffCategory) ?? [];

        // Check if team solved all challenges in this difficulty category
        if (teamCategorySolves.length >= categoryChallengeIds.length) {
          const solvedIds = new Set(teamCategorySolves.map((s) => s.challengeId));
          const hasAll = categoryChallengeIds.every((id) => solvedIds.has(id));

          if (hasAll) {
            // Find earliest and latest solve time in this category
            const timestamps = teamCategorySolves.map((s) => s.receivedAt.getTime());
            const minTime = Math.min(...timestamps);
            const maxTime = Math.max(...timestamps);
            const durationMs = maxTime - minTime;

            if (durationMs <= limitMs) {
              stats.points += 50; // Award +50 time bonus once per team ONLY
              earnedBonus = true;
            }
          }
        }
      }
    }

    // Convert to sorted rows (excluding Admin Team)
    const rowsList = Array.from(teamStats.values())
      .map((s) => ({
        teamId: s.teamId,
        teamName: names.get(s.teamId) ?? "Unknown",
        points: s.points,
        lastScoreAt: s.lastScoreAt,
        solvedCount: s.solvedCount,
      }))
      .filter((r) => r.teamName.toLowerCase() !== "admin team");

    // Sort: points descending, then lastScoreAt ascending
    rowsList.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (a.lastScoreAt && b.lastScoreAt) return a.lastScoreAt.getTime() - b.lastScoreAt.getTime();
      if (a.lastScoreAt) return -1;
      if (b.lastScoreAt) return 1;
      return 0;
    });

    const snapshot: LeaderboardSnapshot = {
      event: "ctf",
      generatedAt: new Date(),
      rows: rowsList.slice(0, 200),
    };

    const boards = await collections.leaderboards();
    await boards.updateOne({ event: "ctf" }, { $set: snapshot }, { upsert: true });
    return snapshot;
  }

  // Standard materializer for non-CTF events
  const scores = await collections.scoreEvents();
  const match = event === "overall" ? {} : { event };

  const rows = await scores
    .aggregate<{ _id: unknown; points: number; lastScoreAt: Date }>([
      { $match: match },
      { $group: { _id: "$teamId", points: { $sum: "$points" }, lastScoreAt: { $max: "$at" } } },
      { $sort: { points: -1, lastScoreAt: 1 } },
      { $limit: 200 },
    ])
    .toArray();

  const snapshot: LeaderboardSnapshot = {
    event,
    generatedAt: new Date(),
    rows: rows
      .filter((r) => names.get(String(r._id))?.toLowerCase() !== "admin team")
      .map((r) => ({
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

/**
 * A snapshot older than this is refreshed in the background on the next read.
 *
 * Three poll intervals, so a board that is being written to normally never
 * reaches it — a submission re-materializes long before this — and only a
 * genuinely idle board pays for a refresh.
 */
const STALE_AFTER_MS = LEADERBOARD_REFRESH_MS * 3;

/**
 * Per-event timestamp of the last refresh THIS process kicked off.
 *
 * The stampede guard. Without it, a stale board plus 500 clients polling every
 * five seconds means 500 simultaneous aggregations — precisely the load the
 * materialized snapshot exists to prevent, arriving in one spike instead of
 * being spread out. With it, a replica starts at most one refresh per event per
 * interval regardless of how many readers notice the staleness at once.
 *
 * In-process, so the ceiling is one refresh per replica rather than one
 * globally. That is fine at this replica count and needs no coordination; if
 * the app ever scales out far enough for that to matter, this wants to become a
 * lease document instead.
 */
const refreshStartedAt = new Map<string, number>();

/**
 * Read the current snapshot, materializing on demand if it is missing and
 * refreshing it in the background if it is stale.
 *
 * Nothing was refreshing these on a schedule. `materializeAll` exists but is
 * called from nowhere, so a board only ever changed when something wrote to it
 * — a submission, a login, an admin action. During play that is constant and
 * invisible. In a lull it is not: after the CTF leaderboard fix shipped, the
 * live board kept serving pre-fix rows for twenty minutes because no team had
 * logged in since the deploy, which looks exactly like a broken deploy.
 *
 * The refresh is deliberately NOT awaited. The caller gets the snapshot it
 * already has, at the same latency as before, and the fresh one lands for the
 * next poll — five seconds later. Blocking here would make the unlucky reader
 * that happens to notice the staleness pay for everyone else's refresh.
 */
export async function readSnapshot(event: EventKey | "overall"): Promise<LeaderboardSnapshot> {
  const boards = await collections.leaderboards();
  const existing = await boards.findOne({ event });
  if (!existing) return materialize(event);

  const now = Date.now();
  const age = now - new Date(existing.generatedAt).getTime();
  if (age > STALE_AFTER_MS && now - (refreshStartedAt.get(event) ?? 0) > STALE_AFTER_MS) {
    refreshStartedAt.set(event, now);
    void materialize(event).catch((err) => {
      console.error(`[leaderboard] background refresh failed for ${event}`, err);
    });
  }

  return existing;
}
