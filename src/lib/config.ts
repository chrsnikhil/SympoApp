/**
 * Central config + the subdomain → event map.
 *
 * One container serves all four events. `proxy.ts` reads the Host header and
 * rewrites into the matching route group, so `hunt.example.com/clue/3` renders
 * `app/(hunt)/clue/3`. Adding an event = adding a row here plus a route group.
 */

export const EVENTS = ["hunt", "ctf", "code", "quiz", "shiftverse"] as const;
export type EventKey = (typeof EVENTS)[number];

/** Hosts that are NOT an event: the auth/entry surface. */
export const APP_HOSTS = ["app", "www", "localhost"] as const;

export type SubmissionStatus = "queued" | "running" | "done" | "error";

/**
 * Root domain the session cookie is scoped to. A leading dot makes the cookie
 * valid on every subdomain, which is what lets one login carry across all four
 * events. Must match the real domain in production.
 */
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? undefined;

export const SESSION_COOKIE = "session";

/** How long a session lasts. Events run for hours, so a day is plenty. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24;

/**
 * Image Replication (Round 1, Game 1) is judged by ONE evaluator: the vision
 * model configured below. There is no mode switch — the app talks to nothing
 * else and needs no companion service to score a picture.
 *
 * The local SigLIP service still lives in `ai-image-eval-platform/`, kept
 * intact as a future alternative. Reconnecting it means restoring a client for
 * its HTTP contract and branching in `lib/quiz/imageRound.ts` on a new flag —
 * see that folder's README and API_CONTRACT.md. Nothing in the web app
 * currently reaches for it, which is why there is no URL, no health check and
 * no polling code here any more.
 */

/**
 * Image Replication's similarity→marks ladder.
 *
 * This is a symposium game, not an evaluation benchmark: a team that clearly
 * had a go at recreating the reference should walk away with marks, and only
 * a copy of the reference or something unrelated to it should score nothing.
 *
 * Read as: the first band whose threshold the similarity meets, from the top
 * down. Anything under the lowest band scores 0 — that is the "unrelated
 * image" floor, and the only route to 0 marks other than cheating detection.
 *
 * Override the whole ladder with IMAGE_SCORE_BANDS as a comma-separated list
 * of `similarity:marks` pairs, e.g.
 *   IMAGE_SCORE_BANDS="0.95:10,0.85:9,0.7:8,0.55:6,0.4:4,0.25:2"
 * and the floor with IMAGE_SCORE_MIN_SIMILARITY.
 */
export interface ScoreBand {
  atLeast: number;
  marks: number;
}

const DEFAULT_BANDS: ScoreBand[] = [
  { atLeast: 0.95, marks: 10 },
  { atLeast: 0.85, marks: 9 },
  { atLeast: 0.7, marks: 8 },
  { atLeast: 0.55, marks: 6 },
  { atLeast: 0.4, marks: 4 },
  { atLeast: 0.25, marks: 2 },
];

function parseBands(raw: string | undefined): ScoreBand[] {
  if (!raw?.trim()) return DEFAULT_BANDS;
  const parsed: ScoreBand[] = [];
  for (const pair of raw.split(",")) {
    const [sim, marks] = pair.split(":").map((s) => Number(s.trim()));
    if (Number.isFinite(sim) && Number.isFinite(marks)) parsed.push({ atLeast: sim, marks });
  }
  if (parsed.length === 0) {
    console.warn(`[config] IMAGE_SCORE_BANDS="${raw}" could not be parsed — falling back to defaults`);
    return DEFAULT_BANDS;
  }
  return parsed.sort((a, b) => b.atLeast - a.atLeast);
}

export const IMAGE_SCORE_BANDS = parseBands(process.env.IMAGE_SCORE_BANDS);

/** Below this, the image is treated as unrelated to the reference: 0 marks. */
export const IMAGE_SCORE_MIN_SIMILARITY = Number(process.env.IMAGE_SCORE_MIN_SIMILARITY ?? 0.25) || 0.25;

/**
 * Vision model(s) for Game 1's image judging, via OpenRouter/Groq.
 *
 * Comma-separated, tried in order. A fallback list matters on free tiers: the
 * models that cost nothing are exactly the ones that return 429 under load,
 * and a Round 1 judging pass that dies on the first rate limit loses the whole
 * game's scores.
 *
 * No default — ids change, and an invalid one fails every request. Discover
 * working ids for your key with `scripts/find-vision-model.ts`.
 */
export const IMAGE_JUDGE_MODEL = process.env.IMAGE_JUDGE_MODEL ?? "";

export const IMAGE_JUDGE_MODELS: string[] = IMAGE_JUDGE_MODEL.split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Leaderboard snapshot interval. Clients poll at roughly this rate and the
 * response carries a matching Cache-Control, so 500 pollers cost ~0.2 DB
 * queries/sec rather than 100 req/s of aggregation.
 */
export const LEADERBOARD_REFRESH_MS = 5_000;

/** Hard caps on what a single submission may carry. */
export const LIMITS = {
  /** Source files for the code event. Anything larger is a mistake or abuse. */
  maxPayloadBytes: 64 * 1024,
  /** Per-team submissions allowed per rolling window. */
  rateLimit: { windowMs: 10_000, max: 20 },
};

/** How long a team has on its Shiftverse word once the board is first served. */
export const SHIFTVERSE_DURATION_MS = 15 * 60 * 1000;

/**
 * Resolve a Host header to an event key.
 * Handles ports (`hunt.localhost:3000`) and falsy hosts.
 * Returns null for the app/entry hosts and anything unrecognised.
 */
export function eventFromHost(host: string | null | undefined): EventKey | null {
  if (!host) return null;
  const sub = host.split(":")[0].split(".")[0].toLowerCase();
  return (EVENTS as readonly string[]).includes(sub) ? (sub as EventKey) : null;
}

/**
 * Swap the leading label of a host for an event's, so `/enter` can send a
 * freshly-logged-in participant to the right subdomain even when they
 * reached the entry form directly (no `?rt=` from a proxy bounce).
 *
 *   eventHostFor("localhost:3000", "quiz")      -> "quiz.localhost:3000"
 *   eventHostFor("app.localhost:3000", "quiz")  -> "quiz.localhost:3000"
 *   eventHostFor("www.example.com", "quiz")     -> "quiz.example.com"
 *
 * Only rewrites when the leading label is a known app host — a host that's
 * already an event subdomain (or anything unrecognised) is left alone rather
 * than guessed at.
 */
export function eventHostFor(host: string, event: EventKey): string {
  const [first, ...rest] = host.split(".");
  const label = first.split(":")[0].toLowerCase();
  if (!(APP_HOSTS as readonly string[]).includes(label)) return host;
  return rest.length > 0 ? `${event}.${rest.join(".")}` : `${event}.${host}`;
}

/** Env var that must exist before the app can do anything meaningful. */
export function requireEnv(name: string): string {
  let v = process.env[name];
  if (!v && typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      if (fs.existsSync(".env.local")) {
        const text = fs.readFileSync(".env.local", "utf8");
        const line = text.split("\n").find((l: string) => l.startsWith(`${name}=`));
        if (line) v = line.slice(line.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      // ignore
    }
  }
  if (!v && name === "MONGODB_URI") {
    v = "mongodb://127.0.0.1:27017/xplore26";
  }
  if (!v && name === "JWT_SECRET") {
    v = "dev-only-preview-secret-not-for-production";
  }
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
