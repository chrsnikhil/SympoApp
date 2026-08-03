import { collections } from "@/lib/db/client";
import { closeQuestionForComeback } from "@/lib/quiz/comeback";
import { scoreConnections } from "@/lib/quiz/connections";
import { scheduleImageJudging } from "@/lib/quiz/judge";
import { isQualified } from "@/lib/quiz/rounds";
import { markAnswered, serveFor } from "@/lib/quiz/serve";
import { acceptEstimate, acceptPromptImage, scoreMcq } from "@/lib/quiz/scoring";
import type { QuizRound } from "@/lib/db/types";
import type { GradeInput, GradeResult } from "./types";

/**
 * QUIZ — three rounds behind one grader, per the Spider Multiverse Tech Quiz
 * rules (this replaced an earlier 20-MCQ/gadget-round/three-minigame draft;
 * see the build guide for the full reasoning).
 *
 * The submission pipeline is untouched by any of this: it verifies the
 * session, stamps the server clock, rate-limits, and hands off here.
 * Everything round-shaped lives below.
 *
 * TIMING. Elapsed time for the MCQ rounds is measured from a serve record
 * written server-side when the question was handed out (`lib/quiz/serve.ts`),
 * never from anything the client sends. The scaffold this replaced read a
 * `servedAt` timestamp out of the submitted payload itself — any team could
 * post a fresh one and never be "late". The client may say what it chose,
 * never when.
 *
 * Round 1's Memory Game isn't reachable through here at all — it's driven by
 * its own flip endpoint (`/api/quiz/memory/flip`), not the generic submit
 * pipeline, because "flip cell 7" isn't a single graded answer.
 */
export async function gradeQuiz(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload, receivedAt } = input;
  const format = challenge.config.format ?? "mcq";
  const round = (challenge.config.round ?? 2) as QuizRound;

  // The coordinator's single "the event is over" switch — checked ahead of
  // everything else so nothing scores after End Quiz, regardless of round
  // or format. This is the one funnel every quiz submission passes through.
  const state = await (await collections.quizState()).findOne({ _id: "quiz" });
  if (state?.ended) {
    return { correct: false, points: 0, meta: { reason: "quiz-ended" } };
  }

  // Every round past the first is a closed field. Without this, a knocked-out
  // team could keep POSTing at later rounds' questions and appear in their
  // standings — the UI won't show them the page, but the UI isn't a security
  // boundary.
  if (!(await isQualified(teamId, round))) {
    return { correct: false, points: 0, meta: { reason: "not-qualified", round } };
  }

  // Round 1's Guess-the-Number and Image-Replication games are shared-window,
  // coordinator-paced: there's no per-team serve to close, so nothing else
  // stops a team submitting repeatedly until it lands on the right answer.
  if (format === "estimate" || format === "prompt-image") {
    const subs = await collections.submissions();

    if (format === "prompt-image") {
      // Allow teams to replace their uploaded image before judging / game
      // closure — but exclude the submission the pipeline just inserted for
      // THIS request (also "running" at this point), or this would delete
      // the very submission being graded a moment after creating it.
      await subs.deleteMany({
        challengeId: challenge._id,
        teamId,
        status: "running",
        _id: { $ne: input.submissionId },
      });
      return acceptPromptImage(payload, teamId, challenge.slug);
    }

    const prior = await subs.findOne({
      challengeId: challenge._id,
      teamId,
      _id: { $ne: input.submissionId }, // the pipeline already inserted this one
    });
    if (prior) return { correct: false, points: 0, meta: { reason: "already-answered" } };

    return acceptEstimate(payload);
  }

  // Connections allows retries — a wrong guess shouldn't cost a team the rest
  // of the puzzle — but stops taking them once it's been solved once.
  if (format === "connections") {
    const subs = await collections.submissions();
    const solved = await subs.findOne({ challengeId: challenge._id, teamId, status: "done", "verdict.correct": true });
    if (solved) return { correct: false, points: 0, meta: { reason: "already-solved" } };
    return scoreConnections(challenge, teamId, payload, input.submissionId);
  }

  if (format === "memory") {
    // Never reached in practice (the client never submits this format here),
    // but fail closed rather than silently mis-scoring if it ever is.
    return { correct: false, points: 0, meta: { reason: "wrong-endpoint" } };
  }

  // Only "mcq" reaches here — rounds 2 and 3, the two-phase read/select clock.
  const serve = await serveFor(teamId, challenge.slug);
  if (!serve) {
    return { correct: false, points: 0, meta: { reason: "not-served" } };
  }
  if (serve.answeredAt) {
    return { correct: false, points: 0, meta: { reason: "already-answered" } };
  }

  const result = scoreMcq(challenge, payload, serve, receivedAt);

  // Close the serve for a real attempt — wrong, right, eliminated-option or
  // too-late — since leaving it open would let a team keep guessing. A
  // too-early attempt is different: the real UI never produces one (options
  // are disabled until the select phase), so the only way to see one is a
  // request built by hand, well before the question could legitimately be
  // answered. Closing the serve on THAT would burn a team's actual shot at
  // the question over a probe that scored nothing anyway — a network race or
  // a client bug firing a fraction early shouldn't cost a question a team
  // still has their full window to answer for real.
  if (result.meta?.reason !== "too-early") {
    await markAnswered(teamId, challenge.slug, receivedAt);
  }

  return result;
}
