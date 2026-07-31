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
  serverNow: string;
  image?: string | null;
}

export type ServeResult =
  | { ok: true; question: ServedQuestion }
  | { ok: true; done: true }
  | { ok: false; reason: "no-questions" };

function toPublic(challenge: Challenge, serve: QuizServe | import("mongodb").WithId<QuizServe>, index: number, total: number): ServedQuestion {
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
    serverNow: new Date().toISOString(),
    image: cfg.image ?? null,
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

  const stateCol = await collections.quizState();
  let state = await stateCol.findOne({ _id: "quiz" });

  const roundKey = `round${round}StartedAt`;
  let roundStart: Date | null = state && state[roundKey] ? new Date(state[roundKey] as Date) : null;

  const now = Date.now();

  // If no round start timestamp exists in quizState yet, set it now to synchronize all teams
  if (!roundStart) {
    roundStart = new Date();
    await stateCol.updateOne({ _id: "quiz" }, { $set: { [roundKey]: roundStart } }, { upsert: true });
  }

  // 16s question time (6s read + 10s select) per question step
  const QUESTION_STEP_MS = 16_000;
  const elapsedMs = Math.max(0, now - roundStart.getTime());
  const activeIndex = Math.floor(elapsedMs / QUESTION_STEP_MS);

  if (activeIndex >= questions.length) {
    return { ok: true, done: true };
  }

  const q = questions[activeIndex];
  const serves = await collections.quizServes();
  let serve = await serves.findOne({ teamId, challengeSlug: q.slug });

  const questionServedAt = new Date(roundStart.getTime() + activeIndex * QUESTION_STEP_MS);
  const readUntil = new Date(questionServedAt.getTime() + READ_SECONDS * 1000);
  const answerableUntil = new Date(questionServedAt.getTime() + (READ_SECONDS + SELECT_SECONDS) * 1000);

  if (!serve) {
    const fresh: QuizServe = {
      teamId,
      challengeSlug: q.slug,
      round,
      servedAt: questionServedAt,
      readUntil,
      answerableUntil,
      answeredAt: null,
      abilitiesUsed: [],
    };
    try {
      await serves.insertOne(fresh);
      serve = (await serves.findOne({ teamId, challengeSlug: q.slug })) ?? (fresh as import("mongodb").WithId<QuizServe>);
    } catch {
      serve = (await serves.findOne({ teamId, challengeSlug: q.slug })) ?? (fresh as import("mongodb").WithId<QuizServe>);
    }
  } else if (serve.readUntil.getTime() !== readUntil.getTime() || serve.answerableUntil.getTime() !== answerableUntil.getTime()) {
    // Keep in-flight serve timestamps synced with the global clock (unless extra-time ability was used)
    if (!serve.abilitiesUsed.includes("extra-time")) {
      serve.readUntil = readUntil;
      serve.answerableUntil = answerableUntil;
      await serves.updateOne({ _id: serve._id }, { $set: { readUntil, answerableUntil } });
    }
  }

  if (!serve) throw new Error(`Could not find serve for ${q.slug}`);
  return { ok: true, question: toPublic(q, serve, activeIndex + 1, questions.length) };
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
