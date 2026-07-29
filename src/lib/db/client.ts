import { MongoClient, type Db, type Collection } from "mongodb";
import { requireEnv } from "@/lib/config";
import type {
  AccessCode,
  Challenge,
  ComebackState,
  Coin,
  HuntProgress,
  LeaderboardSnapshot,
  MemoryGameState,
  Participant,
  ProctorFlag,
  PromptImage,
  QuizServe,
  QuizState,
  RoundQualification,
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
    // retryWrites is deliberately NOT set here. Cosmos DB's RU-based Mongo API
    // rejects retryable writes outright ("Retryable writes are not supported"),
    // and its connection string carries retrywrites=false to say so. An explicit
    // driver option overrides the URI, so hardcoding `true` breaks every write
    // against Cosmos while looking harmless. Leaving it unset lets the URI
    // decide: false on Cosmos, the driver's default true on a plain mongod.
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
  coins: async (): Promise<Collection<Coin>> => (await getDb()).collection<Coin>("coins"),
  promptImages: async (): Promise<Collection<PromptImage>> =>
    (await getDb()).collection<PromptImage>("prompt_images"),
  memoryStates: async (): Promise<Collection<MemoryGameState>> =>
    (await getDb()).collection<MemoryGameState>("memory_states"),
  quizServes: async (): Promise<Collection<QuizServe>> =>
    (await getDb()).collection<QuizServe>("quiz_serves"),
  roundQualifications: async (): Promise<Collection<RoundQualification>> =>
    (await getDb()).collection<RoundQualification>("round_qualifications"),
  comebackStates: async (): Promise<Collection<ComebackState>> =>
    (await getDb()).collection<ComebackState>("comeback_states"),
  proctorFlags: async (): Promise<Collection<ProctorFlag>> =>
    (await getDb()).collection<ProctorFlag>("proctor_flags"),
  quizState: async (): Promise<Collection<QuizState>> =>
    (await getDb()).collection<QuizState>("quiz_state"),
};

/**
 * Create the indexes the hot paths depend on. Safe to run repeatedly.
 * Call from a seed/admin script, not per request.
 *
 * Uses allSettled, not all: Cosmos refuses to create a UNIQUE index on a
 * collection that already holds documents ("Cannot create unique index when
 * collection contains documents"). With Promise.all a single such rejection
 * takes down the whole call, and because seeding starts here, the seed then
 * silently does nothing while appearing to have run. Indexes are an
 * optimisation and a guard, not the schema — a missing one should be loud,
 * not fatal.
 */
export async function ensureIndexes(): Promise<void> {
  const [codes, challenges, subs, scores, hunt, boards, images, memory, serves, quals, comebacks, flags] =
    await Promise.all([
      collections.accessCodes(),
      collections.challenges(),
      collections.submissions(),
      collections.scoreEvents(),
      collections.huntProgress(),
      collections.leaderboards(),
      // No index needed for `coins` — it's keyed by `_id`, unique for free.
      collections.promptImages(),
      collections.memoryStates(),
      collections.quizServes(),
      collections.roundQualifications(),
      collections.comebackStates(),
      collections.proctorFlags(),
    ]);

  const wanted: Array<[string, Promise<unknown>]> = [
    ["access_codes.codeHash", codes.createIndex({ codeHash: 1 }, { unique: true })],
    ["challenges.type_slug", challenges.createIndex({ type: 1, slug: 1 }, { unique: true })],
    ["submissions.team_time", subs.createIndex({ teamId: 1, receivedAt: -1 })],
    ["submissions.status", subs.createIndex({ status: 1 })],
    ["submissions.challenge_team", subs.createIndex({ challengeId: 1, teamId: 1, receivedAt: 1 })],
    ["score_events.team", scores.createIndex({ teamId: 1 })],
    ["score_events.event_at", scores.createIndex({ event: 1, at: -1 })],
    ["hunt_progress.team_slug", hunt.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    ["leaderboards.event", boards.createIndex({ event: 1 }, { unique: true })],
    ["prompt_images.team_slug", images.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    ["memory_states.team_slug", memory.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    // Unique so a team can't be served the same question twice and restart its clock.
    ["quiz_serves.team_slug", serves.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    ["quiz_serves.team_round", serves.createIndex({ teamId: 1, round: 1 })],
    ["round_qualifications.round_team", quals.createIndex({ round: 1, teamId: 1 }, { unique: true })],
    ["comeback_states.team_round", comebacks.createIndex({ teamId: 1, round: 1 }, { unique: true })],
    ["proctor_flags.team_round", flags.createIndex({ teamId: 1, round: 1, at: -1 })],
  ];

  const results = await Promise.allSettled(wanted.map(([, p]) => p));
  const failed = results
    .map((r, i) => (r.status === "rejected" ? ([wanted[i][0], r.reason] as const) : null))
    .filter(Boolean) as Array<readonly [string, unknown]>;

  for (const [name, reason] of failed) {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.warn(`[indexes] could not create ${name}: ${message}`);
  }
}
