import type { ObjectId } from "mongodb";
import type { EventKey, SubmissionStatus } from "@/lib/config";

/**
 * Collection shapes. Cosmos DB for MongoDB (vCore free tier) — chosen over
 * Postgres because a Burstable Postgres tier caps around 30–50 connections,
 * which a 500-person burst walks straight into. Mongo handles hundreds.
 */

/**
 * The Spider-Verse identity a team plays as. Claimed by entering the number on
 * a 3D-printed coin, whose number range decides the character — see
 * `lib/quiz/avatars.ts`. Optional because the other three events (hunt/ctf/code)
 * use the plain access-code path and never touch this.
 */
export type AvatarId = "spider-man" | "miles" | "gwen" | "miguel";

export interface Team {
  _id?: ObjectId;
  name: string;
  /** Set when the team's coin is claimed. */
  avatar?: AvatarId;
  /** The coin number that granted it, 1..60. Kept so a coin can be traced. */
  coin?: number;
  createdAt: Date;
}

export interface Participant {
  _id?: ObjectId;
  teamId: ObjectId;
  name: string;
  role: "participant" | "admin";
  createdAt: Date;
}

/**
 * Pre-issued entry codes. We store ONLY the hash — a leaked database dump
 * must not hand someone a working set of codes. Used by the coordinator and by
 * the other three events; teams enter the quiz with a coin instead (see
 * `AccessCode` vs `Coin` — two different login paths for two different needs).
 */
export interface AccessCode {
  _id?: ObjectId;
  codeHash: string; // sha256(code), indexed
  teamId: ObjectId;
  participantId: ObjectId;
  role: "participant" | "admin";
  redeemedAt: Date | null;
}

/**
 * A challenge in any event. `config` is the per-event payload — deliberately
 * loose, because a quiz question and a code problem share nothing structurally.
 * Answers/flags live here HASHED, never in plaintext.
 */
export interface Challenge {
  _id?: ObjectId;
  type: EventKey;
  slug: string;
  title: string;
  points: number;
  opensAt: Date | null;
  closesAt: Date | null;
  config: {
    /** hunt + ctf: sha256 of the accepted answer/flag. */
    answerHash?: string;
    /** hunt: the next clue unlocked by solving this one. */
    nextSlug?: string;
    /** hunt: point cost of each hint, in order. */
    hintCosts?: number[];
    /** quiz mcq: option index that scores. */
    correctIndex?: number;
    /** quiz mcq: seconds allowed from serve to answer (round 1 legacy path, unused by rounds 2/3). */
    limitSeconds?: number;
    /** quiz mcq: bonus for answering fast — rounds 2/3 don't use this (flat scoring), kept for format completeness. */
    speedBonus?: number;
    /** quiz: which round this question belongs to. */
    round?: QuizRound;
    /** quiz: how the answer is scored/served. */
    format?: QuizFormat;
    /** quiz mcq: visible options, fixed order — fifty-fifty indexes into it. */
    options?: string[];
    /** quiz mcq: optional image associated with the question. */
    image?: string;
    /** quiz mcq: revealed only when a team spends a fifty-fifty/hint-shaped comeback ability. */
    hint?: string;
    /** quiz estimate: the true value. Closest guess takes the points. */
    answerValue?: number;
    /** quiz prompt-image: the reference image teams must recreate (public path, browser-rendered). */
    referenceImage?: string;
    /**
     * quiz prompt-image: the reference as image DATA, for the vision judge.
     * The judge sends both images to the model in one request and cannot
     * follow a relative URL. Populate with `scripts/set-reference.ts`.
     */
    referenceDataUrl?: string;
    /** quiz prompt-image: rubric override. Falls back to DEFAULT_RUBRIC. */
    rubric?: Array<{ key: string; label: string; weight: number; guidance: string }>;
    /** quiz: display order within a round/game. */
    order?: number;
    /** quiz memory: how many face-up pairs the grid holds (8 pairs = 16 cells is the default). */
    memoryPairs?: number;
    /** quiz memory: max flips before the grid locks. */
    memoryFlipCap?: number;
    /** quiz connections: tile image paths for this puzzle, 3-5 of them. */
    connectionsImages?: string[];
    /** quiz connections: which puzzle this is in the 5-puzzle sequence (1-5). */
    connectionsPuzzleIndex?: number;
    /** quiz connections: one-line clue shown alongside the tiles. */
    connectionsClue?: string;
    /**
     * quiz connections: how many tiles are currently revealed to every team —
     * admin-paced (coordinator clicks "reveal next image" live on stage),
     * not timed. Mutated by the `reveal-next-image` admin action, capped at
     * `connectionsImages.length`.
     */
    connectionsRevealedCount?: number;
    /** ctf: extra points for the first team to solve. */
    firstBloodBonus?: number;
    /** code: reference to the hidden test bundle in blob storage. */
    testsRef?: string;
  };
}

export interface Submission {
  _id?: ObjectId;
  type: EventKey;
  challengeId: ObjectId;
  teamId: ObjectId;
  participantId: ObjectId;
  /**
   * SERVER clock, stamped the moment the request is accepted. This is the
   * fairness anchor: ties, first-blood and quiz time limits all resolve
   * against it, never against a client-supplied time.
   */
  receivedAt: Date;
  /** Inline answer for sync events; blob reference for code submissions. */
  payload?: string;
  payloadRef?: string;
  status: SubmissionStatus;
  verdict?: {
    correct: boolean;
    points: number;
    meta?: Record<string, unknown>;
  };
}

/**
 * Append-only score ledger. Never updated, never deleted — the leaderboard is
 * derived from it. That means a scoring bug can be corrected by appending a
 * compensating row, and the history stays auditable for disputes.
 */
export interface ScoreEvent {
  _id?: ObjectId;
  teamId: ObjectId;
  event: EventKey;
  points: number;
  reason: string;
  submissionId?: ObjectId;
  at: Date;
}

/** Server-side gate for the hunt's clue chain — clients can't skip ahead. */
export interface HuntProgress {
  _id?: ObjectId;
  teamId: ObjectId;
  challengeSlug: string;
  unlockedAt: Date;
  solvedAt: Date | null;
  hintsUsed: number;
}

/** One doc per event, overwritten by the materializer. */
export interface LeaderboardSnapshot {
  _id?: ObjectId;
  event: EventKey | "overall";
  generatedAt: Date;
  rows: Array<{
    teamId: string;
    teamName: string;
    points: number;
    lastScoreAt: Date | null;
  }>;
}

// ── Tech quiz ────────────────────────────────────────────────────────────────
// Spider Multiverse Tech Quiz: three rounds, each with a different shape.
//
//   Round 1 "Final Universe"   every team    3 mini-games, combined score  → shortlist to Round 2
//   Round 2 "Universe 1"       shortlisted   warm-up MCQs, 6s read+10s pick → shortlist to Round 3
//   Round 3 "Universe 2"       finalists     same MCQ timing + comeback meter → winner
//
// This needs more state than the other three events: who is still in, what a
// team has done in each Round 1 mini-game, a per-question two-phase clock for
// rounds 2/3, and a comeback-eligibility tracker.

export type QuizRound = 1 | 2 | 3;

/**
 * How a quiz answer is scored/served. The submission pipeline stays untouched
 * — the quiz grader dispatches on this, which is how three unrelated Round 1
 * mini-games and a two-phase-timed MCQ format all live inside one event.
 */
export type QuizFormat = "mcq" | "estimate" | "prompt-image" | "memory" | "connections";

/**
 * A physical 3D-printed coin, one document per disc, `_id` being the number
 * stamped on it (1..60).
 *
 * Keyed by `_id` rather than enforced with a unique index on `teams.coin`,
 * because Cosmos DB refuses to create a unique index on a collection that
 * already holds documents — so that index could never exist on a live `teams`.
 * `_id` is unique for free, which makes claiming a coin a single atomic
 * conditional update and needs no extra index at all.
 */
export interface Coin {
  _id: number;
  teamId: ObjectId | null;
  claimedAt: Date | null;
  redeemedAt?: Date | null;
}

/**
 * A team's uploaded recreation for "Image Replication" (Round 1, Game 1).
 *
 * Kept in its own collection rather than inline on the submission: images are
 * three orders of magnitude bigger than every other payload, and the
 * submissions collection is on the hot path for rate limiting. One image per
 * team per challenge — re-uploading replaces it, which is also how a team
 * retries after a failed judging.
 */
export interface PromptImage {
  _id?: ObjectId;
  teamId: ObjectId;
  challengeSlug: string;
  /** `data:image/jpeg;base64,…` — resized client-side before upload. */
  dataUrl: string;
  bytes: number;
  uploadedAt: Date;
}

/**
 * Round 1, Game 2 — Memory Game state. One doc per team per challenge.
 *
 * The grid is generated ONCE, server-side, at first serve, and never sent to
 * the client whole — the same "never let something reach the browser that
 * names its own answer" discipline the platform applies everywhere else. A
 * team requests a flip by cell index; the server answers with what was under
 * it and updates the state. A reload replays this exact state rather than
 * regenerating the grid, for the same reload-safety reason the quiz clock is
 * server-side.
 */
export interface MemoryGameState {
  _id?: ObjectId;
  teamId: ObjectId;
  challengeSlug: string;
  servedAt: Date;
  /** Pair token per cell, shuffled once. Never sent to the client whole. */
  grid: string[];
  /** Cell indexes currently face-up mid-turn (0, 1 or 2 while resolving). */
  revealed: number[];
  /** Cell indexes already matched and locked face-up. */
  matched: number[];
  flipsUsed: number;
  flipCap: number;
  completedAt: Date | null;
  /** Set once scored, so a completed game can't be re-scored by re-serving. */
  scoredPoints: number | null;
}

/**
 * When an MCQ question was handed to a team, recorded SERVER-side, with the
 * two-phase read/select clock rounds 2 and 3 use.
 *
 * This is the fairness anchor for the whole quiz: the client may say what it
 * chose, never when. `readUntil` and `answerableUntil` are computed from
 * `servedAt` the instant the question is served and never move afterwards
 * (barring a comeback ability's extra-time effect) — a reload returns the
 * SAME record rather than restarting the clock.
 */
export interface QuizServe {
  _id?: ObjectId;
  teamId: ObjectId;
  challengeSlug: string;
  round: QuizRound;
  servedAt: Date;
  /** servedAt + 6s. Answering before this is rejected server-side. */
  readUntil: Date;
  /** servedAt + 16s (+5s if extra-time was spent). Answering after this is rejected. */
  answerableUntil: Date;
  answeredAt: Date | null;
  /** Comeback abilities spent on THIS question, so each can only land once. */
  abilitiesUsed: ComebackAbility[];
  /** Option indexes removed by a fifty-fifty — kept so the reveal can't be replayed. */
  eliminated?: number[];
  /** Set when the team skips; the question scores zero and can't be revisited. */
  skipped?: boolean;
  /**
   * Set once this serve's outcome has been folded into the team's comeback
   * streak (see `lib/quiz/comeback.ts`), so a reload or a retried request
   * can't double-count it.
   */
  streakProcessed?: boolean;
}

/** Who is allowed into a round. Written by the coordinator's cut between rounds. */
export interface RoundQualification {
  _id?: ObjectId;
  round: QuizRound;
  teamId: ObjectId;
  /** Rank coming out of the PREVIOUS round, kept for the recap screen. */
  rank: number;
  qualifiedAt: Date;
}

/**
 * Round 3's Comeback Meter — the one-time ability a team unlocks by finishing
 * in the bottom tier of the live Round 3 standings on three questions running.
 * Reuses the same four effects the original gadget-token design used
 * (extra-time / fifty-fifty / hint / skip); the only thing that changed is how
 * a team gets one — earned by standing, not by scanning a physical card.
 *
 * One doc per team per round. `bottomStreak` increments each time a team's
 * live rank lands in the bottom quarter of the round after a question closes,
 * and resets to 0 otherwise. Reaching the threshold grants an ability and
 * resets the streak, so the same run of bad answers can't grant two.
 */
export type ComebackAbility = "extra-time" | "fifty-fifty" | "hint" | "skip";

export interface ComebackState {
  _id?: ObjectId;
  teamId: ObjectId;
  round: QuizRound;
  bottomStreak: number;
  /** Rolled the moment a streak crosses the threshold; null until earned. */
  ability: ComebackAbility | null;
  grantedAt: Date | null;
  /** The one question it's usable on — set to the next slug served after granting. */
  usableOnSlug: string | null;
  usedAt: Date | null;
  usedOnSlug: string | null;
}

/**
 * Rounds 2 & 3 run full-screen with the tab treated as the only legitimate
 * surface. This is an append-only log of moments a client reported leaving
 * that surface — tab switch, window blur, or dropping out of fullscreen.
 *
 * DELIBERATELY NOT AN ANTI-CHEAT ENFORCEMENT MECHANISM. A browser cannot be
 * trusted to police itself — anything client-reported can be suppressed by a
 * sufficiently determined team, and this doesn't pretend otherwise. What it
 * gives the coordinator is a timestamped signal to review, same spirit as the
 * append-only score ledger: never silently correct anything, just record what
 * was observed and let a human decide what it means.
 */
export type ProctorFlagKind = "tab-switch" | "window-blur" | "fullscreen-exit";

export interface ProctorFlag {
  _id?: ObjectId;
  teamId: ObjectId;
  round: QuizRound;
  kind: ProctorFlagKind;
  at: Date;
}

/**
 * One well-known document (`_id: "quiz"`), not a per-round record — the
 * coordinator's single "the event is over" switch. Checked by `gradeQuiz`
 * so nothing scores after the coordinator hits End Quiz, regardless of which
 * round or format the submission is for.
 */
export interface QuizState {
  _id: "quiz";
  ended: boolean;
  endedAt: Date | null;
  started?: boolean;
  startedAt?: Date | null;
  round1StartedAt?: Date | null;
  round2StartedAt?: Date | null;
  round3StartedAt?: Date | null;
  [key: string]: unknown;
}
