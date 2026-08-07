import { MongoClient, ObjectId, type Db, type Collection } from "mongodb";
import dns from "dns";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

import { requireEnv } from "@/lib/config";
import type {
  AccessCode,
  Challenge,
  ComebackState,
  Coin,
  HuntProgress,
  EventParticipation,
  LeaderboardSnapshot,
  LylaProgress,
  MemoryGameState,
  Participant,
  ProctorFlag,
  ProctorFreeze,
  PromptImage,
  QuizServe,
  QuizState,
  RankCounter,
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
  var __mongoIndexesEnsured: boolean | undefined;
}

function fixDns() {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  } catch {}
}

async function getConnectUri(srvUri: string): Promise<string> {
  fixDns();
  if (!srvUri.startsWith("mongodb+srv://")) return srvUri;

  try {
    const match = srvUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]*)\??(.*)/);
    if (!match) return srvUri;
    const [, user, pass, host, db, query] = match;

    const srvName = `_mongodb._tcp.${host}`;
    const addresses = await new Promise<dns.SrvRecord[]>((resolve, reject) => {
      dns.resolveSrv(srvName, (err, addrs) => {
        if (err || !addrs || addrs.length === 0) reject(err);
        else resolve(addrs);
      });
    });

    const hostList = addresses.map((a) => `${a.name}:${a.port}`).join(",");
    const params = new URLSearchParams(query);
    if (!params.has("ssl") && !params.has("tls")) params.set("ssl", "true");
    if (!params.has("authSource")) params.set("authSource", "admin");

    return `mongodb://${user}:${pass}@${hostList}/${db}?${params.toString()}`;
  } catch {
    // If SRV lookup fails via local ISP DNS, use Google DNS resolved Atlas shards
    try {
      const match = srvUri.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]*)\??(.*)/);
      if (match) {
        const [, user, pass, host, db, query] = match;
        const domain = host.split(".").slice(1).join(".");
        const hostList = `ac-vjjprmc-shard-00-00.${domain}:27017,ac-vjjprmc-shard-00-01.${domain}:27017,ac-vjjprmc-shard-00-02.${domain}:27017`;
        const params = new URLSearchParams(query);
        if (!params.has("ssl") && !params.has("tls")) params.set("ssl", "true");
        if (!params.has("authSource")) params.set("authSource", "admin");
        return `mongodb://${user}:${pass}@${hostList}/${db}?${params.toString()}`;
      }
    } catch {}
    return srvUri;
  }
}

/**
 * `USE_LOCAL_DB=true` points this at `MONGODB_URI_LOCAL` — a real local
 * mongod, for testing without touching Cosmos at all — instead of
 * `MONGODB_URI`. Defaults to false when unset, so any deployment that only
 * ever sets `MONGODB_URI` (every one so far) is unaffected.
 */
function localDbEnabled(): boolean {
  return (process.env.USE_LOCAL_DB ?? "false").trim().toLowerCase() === "true";
}

async function createClient(): Promise<MongoClient> {
  const rawUri = localDbEnabled() ? requireEnv("MONGODB_URI_LOCAL") : requireEnv("MONGODB_URI");
  const uri = await getConnectUri(rawUri);
  return new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
  }).connect();
}

function clientPromise(): Promise<MongoClient> {
  if (!global.__mongoClientPromise) {
    global.__mongoClientPromise = createClient().catch((err) => {
      global.__mongoClientPromise = undefined;
      throw err;
    });
    if (!global.__mongoIndexesEnsured) {
      global.__mongoIndexesEnsured = true;
      void global.__mongoClientPromise.then(() => ensureIndexes().catch(() => {}));
    }
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
  eventParticipation: async (): Promise<Collection<EventParticipation>> =>
    (await getDb()).collection<EventParticipation>("event_participation"),
  leaderboards: async (): Promise<Collection<LeaderboardSnapshot>> =>
    (await getDb()).collection<LeaderboardSnapshot>("leaderboard_snapshots"),
  lylaProgress: async (): Promise<Collection<LylaProgress>> =>
    (await getDb()).collection<LylaProgress>("lyla_progress"),
  coins: async (): Promise<Collection<Coin>> => (await getDb()).collection<Coin>("coins"),
  promptImages: async (): Promise<Collection<PromptImage>> =>
    (await getDb()).collection<PromptImage>("prompt_images"),
  memoryStates: async (): Promise<Collection<MemoryGameState>> =>
    (await getDb()).collection<MemoryGameState>("memory_states"),
  quizServes: async (): Promise<Collection<QuizServe>> =>
    (await getDb()).collection<QuizServe>("quiz_serves"),
  roundQualifications: async (): Promise<Collection<RoundQualification>> =>
    (await getDb()).collection<RoundQualification>("round_qualifications"),
  roundEliminations: async (): Promise<Collection<{ teamId: ObjectId; eliminatedAt: Date }>> =>
    (await getDb()).collection<{ teamId: ObjectId; eliminatedAt: Date }>("round_eliminations"),
  comebackStates: async (): Promise<Collection<ComebackState>> =>
    (await getDb()).collection<ComebackState>("comeback_states"),
  proctorFlags: async (): Promise<Collection<ProctorFlag>> =>
    (await getDb()).collection<ProctorFlag>("proctor_flags"),
  proctorFreezes: async (): Promise<Collection<ProctorFreeze>> =>
    (await getDb()).collection<ProctorFreeze>("proctor_freezes"),
  rankCounters: async (): Promise<Collection<RankCounter>> =>
    (await getDb()).collection<RankCounter>("rank_counters"),
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
  const [codes, challenges, subs, scores, hunt, parts, boards, lyla, images, memory, serves, quals, comebacks, flags, freezes] =
    await Promise.all([
      collections.accessCodes(),
      collections.challenges(),
      collections.submissions(),
      collections.scoreEvents(),
      collections.huntProgress(),
      collections.eventParticipation(),
      collections.leaderboards(),
      collections.lylaProgress(),
      // No index needed for `coins` — it's keyed by `_id`, unique for free.
      collections.promptImages(),
      collections.memoryStates(),
      collections.quizServes(),
      collections.roundQualifications(),
      collections.comebackStates(),
      collections.proctorFlags(),
      collections.proctorFreezes(),
    ]);

  const wanted: Array<[string, Promise<unknown>]> = [
    ["access_codes.codeHash", codes.createIndex({ codeHash: 1 }, { unique: true })],
    ["challenges.type_slug", challenges.createIndex({ type: 1, slug: 1 }, { unique: true })],
    ["submissions.team_time", subs.createIndex({ teamId: 1, receivedAt: -1 })],
    ["submissions.status", subs.createIndex({ status: 1 })],
    ["submissions.challenge_team", subs.createIndex({ challengeId: 1, teamId: 1, receivedAt: 1 })],
    // CTF solve counts and the dynamic leaderboard scan by correctness.
    ["submissions.challenge_correct", subs.createIndex({ challengeId: 1, "verdict.correct": 1 })],
    ["submissions.challenge_correct_time", subs.createIndex({ challengeId: 1, "verdict.correct": 1, receivedAt: 1 })],
    ["score_events.team", scores.createIndex({ teamId: 1 })],
    ["score_events.event_at", scores.createIndex({ event: 1, at: -1 })],
    ["hunt_progress.team_slug", hunt.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    // Unique so a 3s dashboard poll cannot insert a second arrival row for the
    // same team. Cosmos only builds a unique index on an EMPTY collection, and
    // event_participation is new — if this ever warns, the collection already
    // has rows and the index has to be built by recreating it.
    ["event_participation.team_event", parts.createIndex({ teamId: 1, event: 1 }, { unique: true })],
    ["event_participation.event", parts.createIndex({ event: 1 })],
    ["leaderboards.event", boards.createIndex({ event: 1 }, { unique: true })],
    ["lyla_progress.team", lyla.createIndex({ teamId: 1 }, { unique: true })],
    ["prompt_images.team_slug", images.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    ["memory_states.team_slug", memory.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    // Unique so a team can't be served the same question twice and restart its clock.
    ["quiz_serves.team_slug", serves.createIndex({ teamId: 1, challengeSlug: 1 }, { unique: true })],
    ["quiz_serves.team_round", serves.createIndex({ teamId: 1, round: 1 })],
    ["round_qualifications.round_team", quals.createIndex({ round: 1, teamId: 1 }, { unique: true })],
    ["comeback_states.team_round", comebacks.createIndex({ teamId: 1, round: 1 }, { unique: true })],
    ["proctor_flags.team_round", flags.createIndex({ teamId: 1, round: 1, at: -1 })],
    ["proctor_freezes.team_round", freezes.createIndex({ teamId: 1, round: 1 }, { unique: true })],
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

