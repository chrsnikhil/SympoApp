import type { ServerDitherResult } from "./serverDither";

/**
 * Per-team cache of generated dither frames.
 *
 * Generating a frame set is ~1.4s of CPU and ~2.6MB of PNG. With 100 teams in
 * Round 1 that is minutes of encoding and a quarter of a gigabyte over venue
 * wifi — and teams reload. A nervous team refreshing three times paid for three
 * identical generations.
 *
 * Keyed by team because the frames carry that team's watermark and cannot be
 * shared. Held in memory rather than in Mongo: the entries are megabytes each,
 * they are worthless the moment the round ends, and a cache miss costs a
 * regeneration rather than a wrong answer. Per-replica, therefore — three
 * replicas may each generate once for the same team, which is 3 generations
 * instead of one but still far short of one per request.
 *
 * WHAT THIS COSTS. A cached team keeps ONE session id and timestamp for the
 * lifetime of the entry rather than a fresh one per view, so a leaked
 * screenshot still names the team but pins the time to the TTL window rather
 * than the exact request. The team is the part that matters for acting on a
 * leak; the precision loss is the price of not melting the CPU during the round.
 */

interface Entry {
  result: ServerDitherResult;
  sessionId: string;
  expiresAt: number;
}

/**
 * Long enough to cover a team's whole Image Replication round — the reference
 * shows early, hides, and peeks again mid-game, and a reload at any point
 * should be free. Short enough that a re-seeded event does not serve frames of
 * the previous reference.
 */
const TTL_MS = 15 * 60 * 1000;

/**
 * A ceiling so a long-running replica cannot grow without bound. At ~2.6MB an
 * entry, 128 is roughly 330MB worst case against the 2Gi the container has —
 * and 100 teams fit inside it, which is the case that matters.
 */
const MAX_ENTRIES = 128;

const cache = new Map<string, Entry>();

function evictExpired(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export function getCachedFrames(teamId: string): { result: ServerDitherResult; sessionId: string } | null {
  const now = Date.now();
  const hit = cache.get(teamId);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(teamId);
    return null;
  }
  return { result: hit.result, sessionId: hit.sessionId };
}

export function setCachedFrames(teamId: string, result: ServerDitherResult, sessionId: string): void {
  const now = Date.now();
  evictExpired(now);
  if (cache.size >= MAX_ENTRIES) {
    // Oldest insertion first — Map preserves insertion order, and every entry
    // has the same TTL, so the first key is always the nearest to expiring.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(teamId, { result, sessionId, expiresAt: now + TTL_MS });
}

/** Drop everything — used when the coordinator restarts or re-seeds the quiz. */
export function clearFrameCache(): void {
  cache.clear();
}
