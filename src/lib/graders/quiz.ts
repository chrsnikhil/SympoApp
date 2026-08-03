import type { GradeInput, GradeResult } from "./types";

/**
 * QUIZ — correct option plus a speed bonus, both judged on the server clock.
 *
 * The time limit is checked against `receivedAt` vs when the question was
 * served. A client-supplied elapsed time would be trivially forgeable, so it
 * is never trusted.
 */
export async function gradeQuiz(input: GradeInput): Promise<GradeResult> {
  const { challenge, payload, receivedAt } = input;
  const limit = challenge.config.limitSeconds ?? 30;

  // `servedAt` is carried on the submission payload as "<choice>|<servedAtISO>"
  // — the serve time is issued and signed server-side when the question is
  // handed out, so it can't be back-dated by the client.
  const [choiceRaw, servedAtRaw] = payload.split("|");
  const choice = Number.parseInt(choiceRaw, 10);
  const servedAt = servedAtRaw ? new Date(servedAtRaw) : null;

  if (Number.isNaN(choice)) return { correct: false, points: 0, meta: { reason: "bad-choice" } };

  if (servedAt) {
    const elapsed = (receivedAt.getTime() - servedAt.getTime()) / 1000;
    if (elapsed > limit) {
      return { correct: false, points: 0, meta: { reason: "too-late", elapsed } };
    }
    if (choice !== challenge.config.correctIndex) return { correct: false, points: 0 };

    // Scale the bonus by how much time was left.
    const remaining = Math.max(0, limit - elapsed) / limit;
    const bonus = Math.round((challenge.config.speedBonus ?? 0) * remaining);
    return { correct: true, points: challenge.points + bonus, meta: { elapsed, bonus } };
  }

  if (choice !== challenge.config.correctIndex) return { correct: false, points: 0 };
  return { correct: true, points: challenge.points };
}
