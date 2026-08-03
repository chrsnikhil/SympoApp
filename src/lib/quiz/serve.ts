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

function parseQuestionTitle(title: string) {
  if (!title) return { prompt: "", code: null };
  const lines = title.split("\n");

  const isCodeLine = (line: string) => {
    const t = line.trim();
    return (
      t.startsWith("#include") ||
      t.startsWith("using namespace") ||
      t.startsWith("def ") ||
      t.startsWith("class ") ||
      t.startsWith("import ") ||
      t.startsWith("int main") ||
      t.startsWith("int f(") ||
      t.startsWith("int ") ||
      t.startsWith("void ") ||
      t.startsWith("struct ") ||
      t.startsWith("public static") ||
      t.startsWith("x = ") ||
      t.startsWith("print(") ||
      t.startsWith("cout") ||
      t.startsWith("return ") ||
      t.includes("nonlocal ") ||
      (t.includes("{") && !t.toLowerCase().startsWith("what")) ||
      (t.includes("}") && t.length < 5)
    );
  };

  const firstCodeIdx = lines.findIndex(isCodeLine);
  if (firstCodeIdx !== -1) {
    const prompt = lines.slice(0, firstCodeIdx).join("\n").trim();
    const code = lines.slice(firstCodeIdx).join("\n").trim();
    return { prompt: prompt || title, code };
  }

  return { prompt: title, code: null };
}

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
  return {
    slug: challenge.slug,
    title: challenge.title,
    round: cfg.round ?? 2,
    points: challenge.points,
    options: cfg.options ?? [],
    readUntil: serve.readUntil.toISOString(),
    answerableUntil: serve.answerableUntil.toISOString(),
    eliminated: serve.eliminated ?? [],
    hint: null,
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

  // 15s pre-round rules interlude gate (matches RoundTransition countdown in QuizClient)
  const RULES_INTERLUDE_MS = 15_000;
  const elapsedMs = Math.max(0, now - (roundStart.getTime() + RULES_INTERLUDE_MS));

  let activeIndex = questions.length;
  let accumulatedMs = 0;
  let currentReadSeconds = READ_SECONDS;
  let currentSelectSeconds = SELECT_SECONDS;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const isSnippet = !!parseQuestionTitle(q.title).code;
    const rSec = isSnippet ? 10 : READ_SECONDS;
    const sSec = isSnippet ? 15 : SELECT_SECONDS;
    const stepMs = (rSec + sSec) * 1000;
    
    if (elapsedMs < accumulatedMs + stepMs) {
      activeIndex = i;
      currentReadSeconds = rSec;
      currentSelectSeconds = sSec;
      break;
    }
    accumulatedMs += stepMs;
  }

  if (activeIndex >= questions.length) {
    return { ok: true, done: true };
  }

  const q = questions[activeIndex];
  const serves = await collections.quizServes();
  let serve = await serves.findOne({ teamId, challengeSlug: q.slug });

  const questionServedAt = new Date(roundStart.getTime() + RULES_INTERLUDE_MS + accumulatedMs);
  const readUntil = new Date(questionServedAt.getTime() + currentReadSeconds * 1000);
  const answerableUntil = new Date(questionServedAt.getTime() + (currentReadSeconds + currentSelectSeconds) * 1000);

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
    // Keep in-flight serve timestamps synced with the global clock
    if (true) {
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
