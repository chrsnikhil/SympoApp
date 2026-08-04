import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { appendScore } from "@/lib/score/ledger";
import { computeStandings, standings } from "./rounds";
import { markAnswered } from "./serve";
import type { Challenge, ComebackAbility, ComebackState, QuizRound } from "@/lib/db/types";

/**
 * Round 3's Comeback Meter — THE single implementation. Nothing else in the
 * codebase may write `comeback_states`.
 *
 * RULES (as specified by the coordinator):
 *   - Eligibility: every team EXCEPT the live Rank #1.
 *   - Rank #1 FREEZES rather than loses. A team that climbs to #1 keeps its
 *     bars and its banked power exactly as they were — they are simply
 *     suspended: no new bars, no new powers, nothing activates, and the UI
 *     hides the whole thing. Drop back to #2 and the meter and power return
 *     untouched. This is implemented by NOT WRITING while a team is #1, so
 *     "restore the previous progress" needs no snapshot to restore from —
 *     there is nothing to restore, because nothing was ever taken away.
 *   - The meter is 3 bars. Every unsuccessful question fills one — wrong
 *     answer, timeout, or no submission at all. A correct answer never does.
 *   - Filling all 3 bars rolls ONE power (25% each), stores it, and empties
 *     the meter. The power does NOT fire on the question that earned it.
 *   - The stored power fires automatically on the team's NEXT question. It
 *     cannot be skipped, saved, exchanged, or held past that question, and is
 *     deleted the moment that question settles.
 *   - While a power is stored, the meter is dormant — it starts filling again
 *     only once the power has been spent.
 *
 * ORDERING is the whole game here. The old implementation read a 3-second
 * cached leaderboard, so it could decide "is this team Rank #1" against
 * standings that predated the score it was reacting to. Every meter decision
 * below runs against `computeStandings` DIRECTLY (never the cache), and only
 * after the score for that question is already in the ledger:
 *
 *      answer → grade → ledger append → recompute standings → rank → meter
 *
 * IDEMPOTENCE is the other half. A question settles EXACTLY once per team, on
 * whichever path gets there first (the team answered, or their deadline
 * passed and the next serve swept it up). The claim is a single atomic
 * `findOneAndUpdate` on the serve record's `streakProcessed` flag — a
 * read-then-write, which is what the old code did, lets two concurrent 500ms
 * polls both fill a bar for the same wrong answer.
 */

export const MAX_BARS = 3;

/** Rolled at 25% each. All four always apply — every Round 3 question is a 4-option MCQ. */
const ABILITIES: readonly ComebackAbility[] = ["fifty-fifty", "double-points", "safety-net", "free-pass"];

export interface AbilityInfo {
  label: string;
  description: string;
  /** Present-tense line shown while the power is firing. */
  tagline: string;
}

export const ABILITY_INFO: Record<ComebackAbility, AbilityInfo> = {
  "fifty-fifty": {
    label: "Spider-Sense (50-50)",
    description: "Removes two incorrect options from this question.",
    tagline: "Removing two incorrect options…",
  },
  "double-points": {
    label: "Symbiote Surge",
    description: "Doubles the points earned if you answer correctly.",
    tagline: "Points doubled on this question.",
  },
  "safety-net": {
    label: "Iron Spider Armor",
    description: "Awards 50% of the points even if you answer incorrectly.",
    tagline: "A wrong answer still scores half points.",
  },
  "free-pass": {
    label: "Web-Slinger's Pass",
    description: "Answers this question correctly for full points.",
    tagline: "Answered correctly for you — full points awarded.",
  },
};

/** A power as the browser sees it. Never carries `correctIndex` or anything derived from it. */
export interface PowerView extends AbilityInfo {
  id: ComebackAbility;
}

/** The one read model every surface renders from. */
export interface ComebackView {
  /** 1-based live rank in Round 3, or null if the team isn't in the round. */
  rank: number | null;
  isRankOne: boolean;
  /** False for Rank #1 and for teams outside the round — no meter is shown. */
  eligible: boolean;
  /**
   * Rank #1 while holding progress: the meter and power are suspended and
   * hidden, NOT cleared, and come back untouched if the team drops to #2.
   */
  frozen: boolean;
  bars: number;
  maxBars: number;
  /** Earned, waiting to fire on the next question. */
  stored: PowerView | null;
  /** Firing right now, on `activeOnSlug`. */
  active: PowerView | null;
  activeOnSlug: string | null;
}

function view(ability: ComebackAbility): PowerView {
  return { id: ability, ...ABILITY_INFO[ability] };
}

/**
 * One state document per team per round, created on demand. Upserted rather
 * than insert-and-catch: the unique index on (teamId, round) turns two
 * simultaneous first-touches into a duplicate-key error, and an upsert makes
 * that the database's problem instead of ours.
 */
async function loadState(teamId: ObjectId, round: QuizRound): Promise<ComebackState> {
  const states = await collections.comebackStates();
  const blank = {
    teamId,
    round,
    bottomStreak: 0,
    ability: null,
    grantedAt: null,
    usableOnSlug: null,
    usedAt: null,
    usedOnSlug: null,
    frozen: false,
  };
  try {
    const doc = await states.findOneAndUpdate(
      { teamId, round },
      { $setOnInsert: blank },
      { upsert: true, returnDocument: "after" }
    );
    if (doc) return doc;
  } catch {
    // Lost the upsert race against another request — the doc exists now.
  }
  return (await states.findOne({ teamId, round })) ?? (blank as ComebackState);
}

/** Public read model. Cached standings are fine here — this only paints a screen. */
export async function getComebackView(teamId: ObjectId, round: QuizRound = 3): Promise<ComebackView> {
  const table = await standings(round);
  const idx = table.findIndex((r) => r.teamId === String(teamId));
  const isRankOne = idx === 0;
  const inRound = idx !== -1;

  const s = await loadState(teamId, round);
  const eligible = inRound && !isRankOne;
  const holdsProgress = s.bottomStreak > 0 || s.ability !== null;

  // A power that was ALREADY firing when the team climbed to #1 keeps being
  // reported: it is spent on the question in front of them, its eliminations
  // are already on screen, and pretending it vanished mid-question would be
  // worse than showing it out. Only NEW activations are frozen.
  const firing = s.ability !== null && s.usableOnSlug !== null;

  return {
    rank: inRound ? idx + 1 : null,
    isRankOne,
    eligible,
    frozen: inRound && isRankOne && holdsProgress,
    // Values are reported as stored — never zeroed. Rank #1 is hidden by
    // `eligible`, not by throwing its progress away.
    bars: inRound ? s.bottomStreak : 0,
    maxBars: MAX_BARS,
    stored: s.ability && !s.usableOnSlug ? view(s.ability) : null,
    active: firing ? view(s.ability as ComebackAbility) : null,
    activeOnSlug: s.ability ? s.usableOnSlug : null,
  };
}

/**
 * Did this team get `slug` right?
 *
 * ANY correct submission counts, not the most recent one. A question can be
 * won by Web-Slinger's Pass, which writes a correct submission server-side and
 * closes the serve — a client that then POSTs its own answer gets a rejected
 * "already-answered" row stamped later, and reading only the latest row would
 * conclude the team had failed a question it actually won.
 */
async function wasCorrect(teamId: ObjectId, slug: string): Promise<boolean> {
  const challenges = await collections.challenges();
  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge?._id) return false;

  const subs = await collections.submissions();
  const correct = await subs.countDocuments({
    type: "quiz",
    challengeId: challenge._id,
    teamId,
    status: "done",
    "verdict.correct": true,
  });

  return correct > 0;
}

/**
 * Settle ONE question for ONE team: consume the power that fired on it,
 * re-rank, then move the meter. Idempotent and concurrency-safe — the first
 * caller to claim the serve record does the work, everyone else returns.
 *
 * `outcome` is passed by the answer path (which knows the verdict before the
 * submission row is updated) and derived from the ledger by the timeout sweep.
 */
export async function settleQuestion(
  teamId: ObjectId,
  round: QuizRound,
  slug: string,
  outcome?: "correct" | "failed"
): Promise<void> {
  if (round !== 3) return;

  const serves = await collections.quizServes();
  const claimed = await serves.findOneAndUpdate(
    { teamId, challengeSlug: slug, streakProcessed: { $ne: true } },
    { $set: { streakProcessed: true } },
    { returnDocument: "after" }
  );
  if (!claimed) return; // already settled by the other path

  const failed = outcome ? outcome === "failed" : !(await wasCorrect(teamId, slug));

  const states = await collections.comebackStates();
  const state = await loadState(teamId, round);
  const team = String(teamId);

  const patch: Partial<ComebackState> = {};
  let bars = state.bottomStreak ?? 0;
  let holding = state.ability;

  // 1 ── A power that fired on THIS question is now spent. Powers cannot be
  //      saved or carried, so it dies with the question it was attached to.
  if (holding && state.usableOnSlug === slug) {
    console.log(`[comeback] power:consumed team=${team} q=${slug} power=${holding}`);
    holding = null;
    Object.assign(patch, {
      ability: null,
      grantedAt: null,
      usableOnSlug: null,
      usedAt: null,
      usedOnSlug: null,
    });
  }

  // 2 ── Rank, recomputed from scratch AFTER this question's points are in the
  //      ledger. Never the 3s cache: the meter must never see a leaderboard
  //      older than the score change it is reacting to.
  const table = await computeStandings(round);
  console.log(
    `[comeback] leaderboard round=${round} ` +
      table
        .slice(0, 3)
        .map((r, i) => `#${i + 1} ${r.teamName}=${r.points}`)
        .join(" ")
  );

  const rank = table.findIndex((r) => r.teamId === team);
  if (rank === -1) {
    // Not in the round at all — settle the serve, touch nothing else.
    if (Object.keys(patch).length > 0) await states.updateOne({ teamId, round }, { $set: patch });
    return;
  }
  console.log(`[comeback] rank team=${team} q=${slug} rank=#${rank + 1} outcome=${failed ? "failed" : "correct"}`);

  // 3 ── Rank #1 FREEZES. Bars and any banked power are preserved exactly as
  //      they are; the team simply cannot gain more while it leads. Nothing
  //      is zeroed, so dropping back to #2 needs no restore step — the values
  //      were never touched. The only write here is the freeze marker (and
  //      the consumption of a power that had already fired).
  if (rank === 0) {
    console.log(
      `[comeback] freeze team=${team} q=${slug} rank=#1 — meter (${bars}/${MAX_BARS}) ` +
        `and power (${holding ?? "none"}) suspended, preserved intact`
    );
    await states.updateOne({ teamId, round }, { $set: { ...patch, frozen: true } });
    return;
  }

  // Dropped back out of the lead: whatever was suspended is live again,
  // unchanged. Logged so the hand-back is visible in a live round.
  if (state.frozen) {
    console.log(
      `[comeback] restore team=${team} q=${slug} rank=#${rank + 1} — meter (${bars}/${MAX_BARS}) ` +
        `and power (${holding ?? "none"}) handed back untouched`
    );
    patch.frozen = false;
  }

  // 4 ── A stored power that hasn't fired yet keeps the meter dormant, so a
  //      team can never sit on two powers at once.
  if (holding) {
    if (Object.keys(patch).length > 0) await states.updateOne({ teamId, round }, { $set: patch });
    return;
  }

  // 5 ── Failure fills exactly one bar. Correct answers never fill.
  const before = bars;
  if (failed) bars = Math.min(MAX_BARS, bars + 1);
  if (bars !== before) console.log(`[comeback] meter team=${team} q=${slug} ${before}→${bars}/${MAX_BARS}`);

  if (bars >= MAX_BARS) {
    const rolled = ABILITIES[randomInt(ABILITIES.length)];
    console.log(`[comeback] power:generated team=${team} power=${rolled} (meter reset 3→0, fires next question)`);
    Object.assign(patch, {
      bottomStreak: 0,
      ability: rolled,
      grantedAt: new Date(),
      usableOnSlug: null,
      usedAt: null,
      usedOnSlug: null,
    });
  } else {
    patch.bottomStreak = bars;
  }

  await states.updateOne({ teamId, round }, { $set: patch });
}

/**
 * Settle every question whose deadline has passed but which nobody has
 * settled — the timeout / no-submission path. Called on each serve, and once
 * more when the round runs out of questions so the LAST question of the round
 * still counts (the old code returned `done` before ever reaching this).
 */
export async function sweepClosedQuestions(teamId: ObjectId, round: QuizRound = 3): Promise<void> {
  const serves = await collections.quizServes();
  const stale = await serves
    .find({ teamId, round, streakProcessed: { $ne: true }, answerableUntil: { $lt: new Date() } })
    .sort({ answerableUntil: 1 })
    .toArray();

  for (const s of stale) {
    await settleQuestion(teamId, round, s.challengeSlug);
  }
}

/**
 * Rejections that are NOT an attempt at the question. A POST turned away for
 * one of these tells us nothing about how the team did, so it must never
 * drive the meter — the timeout sweep will settle the question from what
 * actually happened.
 *
 * `already-answered` is the load-bearing one: Web-Slinger's Pass answers and
 * closes the question server-side, so the team's own click arrives afterwards
 * and is refused. Treating that refusal as a wrong answer filled a bar for a
 * question the team had just won outright.
 */
const NON_ATTEMPT_REASONS = new Set([
  "already-answered",
  "already-solved",
  "not-served",
  "too-early",
  "quiz-ended",
  "not-qualified",
  "wrong-endpoint",
  "bad-choice",
]);

/** The answer path. Runs from /api/submit AFTER the ledger append, never before. */
export async function settleAfterQuizSubmit(
  teamId: ObjectId,
  slug: string,
  correct: boolean,
  meta?: Record<string, unknown>
): Promise<void> {
  const challenges = await collections.challenges();
  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge) return;
  if ((challenge.config.round ?? 2) !== 3) return;
  if ((challenge.config.format ?? "mcq") !== "mcq") return;

  const reason = typeof meta?.reason === "string" ? meta.reason : null;
  if (reason && NON_ATTEMPT_REASONS.has(reason)) {
    console.log(`[comeback] score team=${String(teamId)} q=${slug} ignored (${reason} — not an attempt)`);
    return;
  }

  console.log(`[comeback] score team=${String(teamId)} q=${slug} correct=${correct}${reason ? ` (${reason})` : ""}`);
  await settleQuestion(teamId, 3, slug, correct ? "correct" : "failed");
}

/** Two of the three wrong options, chosen at random. */
function rollFiftyFifty(challenge: Challenge): number[] {
  const options = challenge.config.options ?? [];
  const correct = challenge.config.correctIndex;
  if (correct === undefined) {
    console.error(`[comeback] ${challenge.slug} has no correctIndex — Spider-Sense cannot eliminate`);
    return [];
  }

  const wrong = options.map((_, i) => i).filter((i) => i !== correct);
  if (wrong.length < 3) {
    // Every Round 3 question is a 4-option MCQ. If that ever stops being true,
    // say so loudly rather than silently burning a team's power.
    console.error(`[comeback] ${challenge.slug} has ${options.length} options — Spider-Sense expects 4`);
  }

  const pool = [...wrong];
  const eliminated: number[] = [];
  while (eliminated.length < 2 && pool.length > 0) {
    eliminated.push(...pool.splice(randomInt(pool.length), 1));
  }
  return eliminated.sort((a, b) => a - b);
}

export interface ActivationResult {
  power: (PowerView & { eliminated: number[]; autoAnswered: boolean }) | null;
  /** True only on the request that actually fired it — the free-pass award hangs off this. */
  justActivated: boolean;
}

/**
 * Fire a stored power onto the question being served. Called from the serve
 * route BEFORE the question is sent, so a Spider-Sense elimination reaches the
 * browser in the SAME response as the options it removes — the old code wrote
 * `eliminated` after the payload had already been serialised, so the strike
 * never appeared and a team could be zeroed for picking an option it was never
 * told was gone.
 *
 * Safe to call on every poll: the claim is atomic, and a repeat call just
 * re-reports the power already firing on this question.
 */
export async function activateForServe(
  teamId: ObjectId,
  round: QuizRound,
  slug: string,
  challenge: Challenge
): Promise<ActivationResult> {
  if (round !== 3) return { power: null, justActivated: false };

  const states = await collections.comebackStates();

  // A banked power is frozen while the team leads: it must not fire, and must
  // still be sitting there unspent if they drop back. An already-firing power
  // is reported below regardless — it belongs to the question on screen.
  const table = await standings(round);
  const isRankOne = table.findIndex((r) => r.teamId === String(teamId)) === 0;

  // Claim a stored power for this question. Atomic, so two concurrent polls
  // can't both fire it.
  let doc = isRankOne
    ? null
    : await states.findOneAndUpdate(
        { teamId, round, ability: { $ne: null }, usableOnSlug: null },
        { $set: { usableOnSlug: slug, usedAt: new Date(), usedOnSlug: slug } },
        { returnDocument: "after" }
      );
  const justClaimed = doc !== null;

  if (isRankOne) {
    const held = await states.findOne({ teamId, round, ability: { $ne: null }, usableOnSlug: null });
    if (held?.ability) {
      console.log(`[comeback] freeze team=${String(teamId)} q=${slug} — banked ${held.ability} withheld at rank #1`);
    }
  }

  if (!doc) {
    // Nothing new to fire — but a power already firing on this question must
    // keep being reported, or the badge would vanish on the next poll.
    doc = await states.findOne({ teamId, round, usableOnSlug: slug, ability: { $ne: null } });
    if (!doc?.ability) return { power: null, justActivated: false };
  }

  const ability = doc.ability as ComebackAbility;

  // Apply the effect against the serve record exactly once.
  const serves = await collections.quizServes();
  const push =
    ability === "fifty-fifty"
      ? { $push: { abilitiesUsed: ability }, $set: { eliminated: rollFiftyFifty(challenge) } }
      : { $push: { abilitiesUsed: ability } };

  const applied = await serves.findOneAndUpdate(
    { teamId, challengeSlug: slug, abilitiesUsed: { $ne: ability } },
    push as Parameters<typeof serves.findOneAndUpdate>[1],
    { returnDocument: "after" }
  );
  const serve = applied ?? (await serves.findOne({ teamId, challengeSlug: slug }));

  if (applied) {
    console.log(
      `[comeback] power:activated team=${String(teamId)} q=${slug} power=${ability}` +
        (ability === "fifty-fifty" ? ` eliminated=[${(serve?.eliminated ?? []).join(",")}]` : "")
    );
  }

  return {
    power: {
      ...view(ability),
      eliminated: serve?.eliminated ?? [],
      autoAnswered: ability === "free-pass",
    },
    justActivated: justClaimed && applied !== null,
  };
}

/**
 * Web-Slinger's Pass: the question is answered correctly ON the team's behalf.
 *
 * This writes a real submission and a real ledger row, because the leaderboard
 * is a pure function of the ledger — the old code called the grader directly
 * and threw the result away, so the strongest power in the game awarded zero
 * points and painted a MISS. It deliberately does NOT go through `scoreMcq`:
 * the power fires the instant the question is served, which is inside the
 * read phase, and `scoreMcq` correctly rejects anything that early.
 */
export async function awardFreePass(teamId: ObjectId, participantId: ObjectId, challenge: Challenge): Promise<void> {
  if (!challenge._id) return;

  const subs = await collections.submissions();
  const existing = await subs.findOne({ type: "quiz", challengeId: challenge._id, teamId });
  if (existing) return; // already answered or already awarded

  const receivedAt = new Date();
  const insert = await subs.insertOne({
    type: "quiz",
    challengeId: challenge._id,
    teamId,
    participantId,
    receivedAt,
    payload: String(challenge.config.correctIndex ?? ""),
    status: "done",
    verdict: {
      correct: true,
      points: challenge.points,
      meta: { reason: "free-pass", abilitiesUsed: ["free-pass"] },
    },
  });

  await appendScore({
    teamId,
    event: "quiz",
    points: challenge.points,
    reason: `quiz:${challenge.slug}`,
    submissionId: insert.insertedId,
    at: receivedAt,
  });

  // Close the serve so the team can't also answer it by hand.
  await markAnswered(teamId, challenge.slug, receivedAt);

  console.log(`[comeback] score team=${String(teamId)} q=${challenge.slug} correct=true +${challenge.points} (free-pass)`);
}
