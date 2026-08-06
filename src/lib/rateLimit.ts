import { LIMITS } from "@/lib/config";

/**
 * Per-team sliding-window rate limit for endpoints that grade an answer but do
 * not go through `lib/submission/pipeline.ts`.
 *
 * The window and the cap are `LIMITS.rateLimit` — the same numbers the
 * submission pipeline enforces (20 per 10s per team) — so a participant hits
 * the same ceiling whichever surface they are hammering, and there is one
 * number to tune rather than two that drift.
 *
 * WHERE THIS DIFFERS FROM THE PIPELINE: the pipeline counts rows in the
 * `submissions` collection, which is shared across replicas for free because
 * it is already writing them. These endpoints don't write a submission and
 * shouldn't start (a universe colour check is not a scored attempt and must
 * not land in the leaderboard's ledger), so the counter lives in process
 * memory instead — same shape as `lib/cache.ts`. On a multi-replica
 * deployment the effective ceiling is therefore per-replica. That is a weaker
 * guarantee than the pipeline's and is the deliberate trade: it costs no
 * writes, and the thing it protects has only eight possible answers anyway, so
 * the limit is there to stop scripted hammering, not to make guessing
 * infeasible.
 */

interface Window {
  /** Epoch ms timestamps of the hits still inside the window. */
  hits: number[];
}

declare global {
  var __rateLimitWindows: Map<string, Window> | undefined;
}

if (!global.__rateLimitWindows) {
  global.__rateLimitWindows = new Map();
}

const windows = global.__rateLimitWindows;

/** Stop the map growing without bound when many keys are seen once and never again. */
const MAX_KEYS = 5000;

export interface RateLimitResult {
  ok: boolean;
  /** Hits remaining in the current window (0 when rejected). */
  remaining: number;
  /** Seconds until the oldest hit falls out of the window. For Retry-After. */
  retryAfterSeconds: number;
}

/**
 * Record a hit against `key` and report whether it is allowed.
 *
 * Call once per request, and only after the request is authenticated — keying
 * on an unauthenticated value lets an attacker pick a fresh key per request.
 */
export function hitRateLimit(
  key: string,
  windowMs: number = LIMITS.rateLimit.windowMs,
  max: number = LIMITS.rateLimit.max
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (windows.size > MAX_KEYS) {
    for (const [k, w] of windows) {
      if (w.hits.length === 0 || w.hits[w.hits.length - 1] < cutoff) windows.delete(k);
    }
  }

  const existing = windows.get(key);
  const hits = (existing?.hits ?? []).filter((t) => t > cutoff);

  if (hits.length >= max) {
    windows.set(key, { hits });
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  windows.set(key, { hits });
  return { ok: true, remaining: max - hits.length, retryAfterSeconds: 0 };
}

/** Test seam — drops all recorded windows. */
export function resetRateLimits(): void {
  windows.clear();
}
