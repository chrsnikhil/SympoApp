import { MongoClient, type Db, type Collection } from "mongodb";
import { requireEnv } from "@/lib/config";
import type {
  AccessCode,
  Challenge,
  HuntProgress,
  LeaderboardSnapshot,
  Participant,
  ScoreEvent,
  Submission,
  Team,
} from "./types";

/**
 * Mongo client as a module singleton.
 *
 * Container Apps runs several replicas and each replica may handle many
 * concurrent requests; creating a client per request would exhaust the
 * connection pool the moment traffic spikes. The driver pools internally, so
 * one client per process is both correct and what we want under a 500-user
 * burst. The global cache also survives dev hot-reload, which otherwise leaks
 * a new pool on every file save.
 */

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClient(): Promise<MongoClient> {
  const uri = requireEnv("MONGODB_URI");
  return new MongoClient(uri, {
    // Keep the pool modest per replica: ACA scales out horizontally, so many
    // small pools beat one large one, and Cosmos vCore has per-account limits.
    maxPoolSize: 20,
    minPoolSize: 0,
    // Fail fast rather than hanging a request for 30s if the DB is unreachable.
    serverSelectionTimeoutMS: 5_000,
    retryWrites: true,
  }).connect();
}

function clientPromise(): Promise<MongoClient> {
  if (!global.__mongoClientPromise) {
    global.__mongoClientPromise = createClient();
  }
  return global.__mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB ?? "xplore26");
}

/** Typed collection accessors — one place that knows the collection names. */
export const collections = {
  teams: async (): Promise<Collection<Team>> => (await getDb()).collection<Team>("teams"),
  participants: async (): Promise<Collection<Participant>> =>
    (await getDb()).collection<Participant>("participants"),
  accessCodes: async (): Promise<Collection<AccessCode>> =>
    (await getDb()).collection<AccessCode>("access_codes"),
  challenges: async (): Promise<Collection<Challenge>> =>
    (await getDb()).collection<Challenge>("challenges"),
  submissions: async (): Promise<Collection<Submission>> =>
    (await getDb()).collection<Submission>("submissions"),
  scoreEvents: async (): Promise<Collection<ScoreEvent>> =>
    (await getDb()).collection<ScoreEvent>("score_events"),
  huntProgress: async (): Promise<Collection<HuntProgress>> =>
    (await getDb()).collection<HuntProgress>("hunt_progress"),
  leaderboards: async (): Promise<Collection<LeaderboardSnapshot>> =>
    (await getDb()).collection<LeaderboardSnapshot>("leaderboard_snapshots"),
};

/**
 * Create the indexes the hot paths depend on. Safe to run repeatedly.
 * Call from a seed/admin script, not per request.
 *
 * These three matter most under load:
 *  - access_codes.codeHash  → login is a single indexed lookup
 *  - score_events.teamId    → the materializer aggregates by team
 *  - submissions.status     → the judge queue reconciler scans by status
 */
export async function ensureIndexes(): Promise<void> {
  const [codes, challenges, subs, scores, hunt, boards] = await Promise.all([
    collections.accessCodes(),
    collections.challenges(),
    collections.submissions(),
    collections.scoreEvents(),
    collections.huntProgress(),
    collections.leaderboards(),
  ]);

  await Promise.all([
    codes.createIndex({ codeHash: 1 }, { unique: true }),
    challenges.createIndex({ type: 1, slug: 1 }, { unique: true }),
    subs.createIndex({ teamId: 1, receivedAt: -1 }),
    subs.createIndex({ status: 1 }),
    // First-blood and duplicate-solve checks hit this one.
    subs.createIndex({ challengeId: 1, teamId: 1, receivedAt: 1 }),
    scores.createIndex({ teamId: 1 }),
    scores.createIndex({ event: 1, at: -1 }),
    hunt.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true }),
    boards.createIndex({ event: 1 }, { unique: true }),
  ]);
}
