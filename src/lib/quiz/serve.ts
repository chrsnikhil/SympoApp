import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { Challenge, QuizRound, QuizServe } from "@/lib/db/types";

/**
 * Server-side MCQ serving for Rounds 2 & 3 — the two-phase 6s-read/10s-select
 * clock the rules doc specifies.
 *
 * This is where the quiz clock actually lives. The scaffold's original
 * `gradeQuiz` read a `servedAt` timestamp out of the CLIENT's own submitted
 * payload ("<choice>|<servedAtISO>") and trusted it — any team could post a
 * fresh timestamp with every answer and never be late. That bug is what this
 * file replaces: the serve time is written here, server-side, before the
 * question ever reaches a browser, and the grader reads it back from the
 * database. The client may say what it chose, never when.
 *
 * The unique index on (teamId, challengeSlug) is what makes the clock
 * tamper-proof: a team gets exactly one serve per question, so reloading the
 * page cannot restart the timer.
 */

/** Read phase: question visible, answering locked. */
const READ_SECONDS = 6;
/** Select phase: answering open. Read + select = the rules doc's 16s total. */
const SELECT_SECONDS = 10;
/** How long past its deadline a question stays open before serving moves on
 *  — absorbs an answer that was in flight when the clock hit zero. */
const LATE_GRACE_MS = 2_000;

/** What the client is allowed to see. Note what is NOT here: correctIndex,
 *  answerHash, answerValue — and `hint` is populated only once paid for. */
export interface ServedQuestion {
  slug: string;
  title: string;
  round: QuizRound;
  points: number;
  options: string[];
  readUntil: string;
  answerableUntil: string;
  eliminated: number[];
  hint: string | null;
  index: number;
  total: number;
}

export type ServeResult =
  | { ok: true; question: ServedQuestion }
  | { ok: true; done: true }
  | { ok: false; reason: "no-questions" };

function toPublic(challenge: Challenge, serve: QuizServe, index: number, total: number): ServedQuestion {
  const cfg = challenge.config;
  const hintPaidFor = serve.abilitiesUsed.includes("hint");
  return {
    slug: challenge.slug,
    title: challenge.title,
    round: cfg.round ?? 2,
    points: challenge.points,
    options: cfg.options ?? [],
    readUntil: serve.readUntil.toISOString(),
    answerableUntil: serve.answerableUntil.toISOString(),
    eliminated: serve.eliminated ?? [],
    hint: hintPaidFor ? (cfg.hint ?? null) : null,
    index,
    total,
  };
}

/** Every MCQ question in a round, in the order they should be asked. */
export async function questionsInRound(round: QuizRound): Promise<Challenge[]> {
  const challenges = await collections.challenges();
  const list = await challenges.find({ type: "quiz", "config.round": round, "config.format": "mcq" }).toArray();
  return list.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0));
}

/**
 * Hand a team its current question, or the next unserved one.
 *
 * Resuming an in-flight question returns the ORIGINAL serve — the clock is
 * not restarted. Without this, refreshing the page would be a free extension,
 * which is exactly the exploit the comeback meter's extra-time ability is
 * supposed to be the only legitimate source of.
 */
export async function serveNext(teamId: ObjectId, round: QuizRound): Promise<ServeResult> {
  const questions = await questionsInRound(round);
  if (questions.length === 0) return { ok: false, reason: "no-questions" };

  const serves = await collections.quizServes();
  const existing = await serves.find({ teamId, round }).toArray();
  const bySlug = new Map(existing.map((s) => [s.challengeSlug, s]));

  const now = Date.now();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const serve = bySlug.get(q.slug);

    if (serve && (serve.answeredAt || serve.skipped)) continue;

    // Served, never answered, clock long gone. Move past it rather than
    // handing back a dead question forever — a team that lost one to a flat
    // battery is otherwise stuck for the rest of the round. It still costs
    // them: standings charge an unanswered question its full window.
    if (serve && serve.answerableUntil.getTime() + LATE_GRACE_MS < now) continue;

    if (serve) return { ok: true, question: toPublic(q, serve, i + 1, questions.length) };

    const servedAt = new Date();
    const fresh: QuizServe = {
      teamId,
      challengeSlug: q.slug,
      round,
      servedAt,
      readUntil: new Date(servedAt.getTime() + READ_SECONDS * 1000),
      answerableUntil: new Date(servedAt.getTime() + (READ_SECONDS + SELECT_SECONDS) * 1000),
      answeredAt: null,
      abilitiesUsed: [],
    };

    try {
      await serves.insertOne(fresh);
      return { ok: true, question: toPublic(q, fresh, i + 1, questions.length) };
    } catch {
      // Two tabs asked at once and the unique index rejected the second.
      // The winner's serve is authoritative — read it back rather than retry.
      const won = await serves.findOne({ teamId, challengeSlug: q.slug });
      if (won) return { ok: true, question: toPublic(q, won, i + 1, questions.length) };
      throw new Error(`Could not serve ${q.slug}`);
    }
  }

  return { ok: true, done: true };
}

/** The serve record backing a submission. The grader's source of truth for time. */
export async function serveFor(teamId: ObjectId, challengeSlug: string) {
  const serves = await collections.quizServes();
  return serves.findOne({ teamId, challengeSlug });
}

/** Close a serve out. Called by the grader once an answer lands. */
export async function markAnswered(teamId: ObjectId, challengeSlug: string, at: Date): Promise<void> {
  const serves = await collections.quizServes();
  await serves.updateOne({ teamId, challengeSlug, answeredAt: null }, { $set: { answeredAt: at } });
}
