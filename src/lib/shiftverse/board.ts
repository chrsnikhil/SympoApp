import { SHIFTVERSE_DURATION_MS } from "@/lib/config";

/**
 * Has this board's fifteen minutes run out?
 *
 * WHY THIS IS ITS OWN MODULE. The function is pure time arithmetic, but it has
 * to be callable from both the guess route and the grader — and it needs to be
 * testable without either. It lived in `api/shiftverse/guess/route.ts`, which
 * made it reachable only through that route: /api/submit reaches the grader
 * directly, so a submission sent to the pipeline was graded with no deadline at
 * all, and a team whose clock had run out could still score by posting to the
 * other endpoint.
 *
 * Moving it into `slot.ts` fixed the sharing and broke the testing: slot.ts
 * imports the Mongo client, which transitively imports `server-only`, which
 * throws the moment a test imports it outside a Server Component. Pure logic
 * that anything may import belongs in a module that imports nothing but a
 * constant.
 *
 * A `startTime` of 0 (never stamped) is treated as "just started" rather than
 * as epoch zero — otherwise every unstamped board reads as already expired and
 * a team is locked out before its clock begins.
 */
export function isBoardExpired(startTime: number, now: number): boolean {
  const started = startTime > 0 ? startTime : now;
  return now - started > SHIFTVERSE_DURATION_MS;
}
