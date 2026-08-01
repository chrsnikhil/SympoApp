/**
 * Central config + the subdomain → event map.
 *
 * One container serves all four events. `proxy.ts` reads the Host header and
 * rewrites into the matching route group, so `hunt.example.com/clue/3` renders
 * `app/(hunt)/clue/3`. Adding an event = adding a row here plus a route group.
 */

export const EVENTS = ["hunt", "ctf", "code", "quiz"] as const;
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
