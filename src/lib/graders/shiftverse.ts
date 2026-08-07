import { collections } from "@/lib/db/client";
import { claimSlot } from "@/lib/shiftverse/slot";
import { isBoardExpired } from "@/lib/shiftverse/board";
import type { GradeInput, GradeResult } from "./types";

/**
 * Shiftverse grader — a case-insensitive word match against the team's own
 * slot.
 *
 * Case-insensitive because the board is uppercase and a team typing lowercase
 * has still solved it; nothing else is normalised, so a wrong word stays wrong.
 * The slot is fetched by teamId rather than taken from the payload, so a team
 * cannot submit against another team's word.
 */
export async function gradeShiftverse(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;
  const subs = await collections.submissions();

  /**
   * One score per team, enforced here rather than by the client.
   *
   * The pipeline appends a `score_events` row every time a grader returns
   * `correct: true` — it keeps no memory of earlier verdicts, by design. Without
   * this check, a team that has already answered correctly could POST the same
   * word again and be paid for it each time, bounded only by the guess route's
   * rate limiter and the board's own deadline. That is thousands of points on
   * the leaderboard this grader exists to populate.
   *
   * Read from `submissions` rather than tracked on the slot document: it is how
   * every sibling grader does it (ctf, hunt, quiz), it survives a restart and a
   * second replica, and it needs no new field — so a slot seeded before this
   * change behaves correctly with no migration.
   */
  const alreadySolved = await subs.findOne({
    challengeId: challenge._id,
    teamId,
    "verdict.correct": true,
  });
  if (alreadySolved) {
    // Not a penalty. A team poking at a puzzle it has already won should be a
    // no-op, not a way to lose points it earned.
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  const slot = await claimSlot(teamId);
  if (!slot) return { correct: false, points: 0, meta: { reason: "no-slot" } };

  /**
   * The deadline is enforced HERE, not only in the guess route.
   *
   * /api/shiftverse/guess checked the clock and this grader did not, but the
   * shared pipeline reaches the grader directly: POST /api/submit with
   * {"event":"shiftverse"} skipped the check entirely. A team whose fifteen
   * minutes had run out could still score by posting to the other endpoint —
   * and the guess route's own comment said a late guess "must never reach the
   * grader at all", which was true of that route and of nothing else.
   *
   * `receivedAt` is the server's stamp for this submission, not Date.now() and
   * not anything the client sent, so the clock a team is judged against is the
   * same one every other event uses.
   */
  if (isBoardExpired(slot.startTime, input.receivedAt.getTime())) {
    return { correct: false, points: 0, meta: { reason: "expired" } };
  }

  const correct = payload.trim().toUpperCase() === slot.plaintextWord.toUpperCase();
  return {
    correct,
    points: correct ? challenge.points : 0,
    meta: { teamNumber: slot.teamNumber },
  };
}
