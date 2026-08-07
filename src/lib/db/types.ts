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
export type AvatarId =
  | "spider-man"
  | "miles"
  | "gwen"
  | "miguel"
  | "spider-punk"
  | "pavitr"
  | "spider-noir"
  | "spider-ham"
  | "peni"
  | "spider-byte"
  | "cyborg"
  | "sun-spider"
  | (string & {});

export interface Team {
  _id?: ObjectId;
  name: string;
  nameKey?: string;
  /** Set when the team's coin is claimed. */
  avatar?: AvatarId;
  /** The coin number that granted it, 1..60. Kept so a coin can be traced. */
  coin?: number;
  /**
   * The team's number for the universe hunt, when it has no coin.
   *
   * `coin` is the quiz's identity and only the coin login sets it, so a team
   * that registered by name had no number at all and the universe hunt refused
   * to serve it. This is assigned instead — on registration, or on first demand
   * for teams that predate the field. `coin` still wins where both exist, so a
   * coin-holding team keeps the number printed on the physical coin.
   */
  teamNumber?: number;
  createdAt: Date;
  banned?: boolean;
  bannedReason?: string;
  bannedAt?: Date;
  penaltyPoints?: number;
  passwordHash?: string;
  event?: EventKey;
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
  disabled?: boolean;
  config: {
    /** hunt + ctf: sha256 of the accepted answer/flag. */
    answerHash?: string;
    /** hunt: the next clue unlocked by solving this one. */
    nextSlug?: string;
    /** hunt: point cost of each hint, in order. */
    hintCosts?: number[];
    /**
     * hunt (octavius circuit): which of the server-side LEVELS this challenge
     * is. Held here rather than taken from the submission so a team cannot
     * solve level 1's circuit and be paid for level 5.
     */
    levelId?: number;
    /**
     * hunt: which sub-grader owns this round, for rounds that are not a hashed
     * word answer.
     *
     * The hunt has grown rounds that grade in their own way — a circuit is
     * rebuilt, a shiftverse slot is compared against the team's own word — but
     * they are all hunt challenges and all go through gradeHunt. Naming the
     * grader here rather than matching on the slug means renaming a round
     * cannot silently route it back to the word check and mark every correct
     * answer wrong.
     */
    flow?: "shiftverse" | "blueprint";
    /** quiz mcq: option index that scores. */
    correctIndex?: number;
    /** quiz mcq: seconds allowed from serve to answer (round 1 legacy path, unused by rounds 2/3). */
    limitSeconds?: number;
    /** quiz mcq: bonus for answering fast — rounds 2/3 don't use this (flat scoring), kept for format completeness. */
    speedBonus?: number;
    initialPoints?: number;
    /** minimum score after decay */
    minimumPoints?: number;
    /** number of solves before score starts decreasing */
    decayAfter?: number;
    /** challenge category (Web, Crypto, Forensics, etc.) */
    category?: string;
    /** difficulty category (Easy, Medium, Hard) */
    difficulty?: "Easy" | "Medium" | "Hard" | string;
    /** detailed description / prompt */
    description?: string;
    /** additional scenario details / instructions */
    details?: string;
    /** structured hints array */
    hints?: Array<{ id: number; text: string; unlockSeconds: number }>;
    /** challenge attachments (ZIP, PDF, PCAP, Images) */
    attachments?: string[];
    /** status: open, closed, hidden, released */
    status?: "open" | "closed" | "hidden" | "released";
    disabled?: boolean;
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
    /**
     * quiz prompt-image: TRUE when a reference has been loaded. Deliberately a
     * flag, not a path — the master must never be reachable as a public URL,
     * so there is no file under `public/` to point at.
     */
    referenceImage?: boolean | string;
    /**
     * quiz prompt-image: the FULL-RESOLUTION master, for the vision judge only.
     * Never sent to a browser. The judge sends both images to the model in one
     * request and cannot follow a relative URL. Set via `scripts/set-reference.ts`.
     */
    referenceDataUrl?: string;
    /**
     * quiz prompt-image: a downscaled, re-encoded copy — the ONLY version any
     * browser receives. Teams need to see the picture well enough to recreate
     * it, which does not require handing them the master's pixels.
     */
    referenceDisplayDataUrl?: string;
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
    /** quiz connections: list of acceptable answer hashes for aliases. */
    acceptedHashes?: string[];
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

/**
 * "This team turned up to this event."
 *
 * `Team` has no event field — a team is a name and a coin, shared by every
 * event on the deployment — so there was no way to ask which event a team
 * belongs to. The admin consoles asked anyway, by listing `teams` unfiltered,
 * and put all thirty teams in front of every coordinator: the quiz's control
 * rows and test teams in the CTF console, hunt registrations in the quiz panel.
 * On a console whose buttons are penalty and ban, a row you cannot identify is
 * a row you can act on by mistake.
 *
 * Two events could already answer it by luck. The quiz has `teams.coin`, which
 * only its own login sets. The hunt has `hunt_progress`, whose rows are created
 * when a team first opens the page — so it records *arriving*, not solving. The
 * CTF had neither: filtering it on submissions cut a live console from 30 teams
 * to 1, because 29 had entered and not yet submitted, and a coordinator who
 * cannot see a team cannot help one.
 *
 * So arrival is recorded explicitly. Written the first time a team loads an
 * event's dashboard, `$setOnInsert` so the first-seen time survives, and unique
 * on (teamId, event) so a poll cannot duplicate it.
 */
export interface EventParticipation {
  _id?: ObjectId;
  teamId: ObjectId;
  event: EventKey;
  firstSeenAt: Date;
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
    solvedCount?: number;
  }>;
}

export interface LylaMessage {
  id: string;
  sender: "user" | "lyla" | "system";
  text: string;
  timestamp: string;
  layer?: number;
}

export interface LylaProgress {
  _id?: ObjectId;
  teamId: ObjectId;
  layer: number; // 1 to 6 (6 is completed payload discharge)
  attempts?: number; // failed attempts for current layer
  messages: LylaMessage[];
  updatedAt: Date;
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
  /**
   * Set when this image has been claimed for judging at the end of the round.
   *
   * Nothing is judged while the clock is running — a team may re-upload as
   * often as it likes and each upload simply replaces this document, so only
   * the LAST image survives to be scored. When the timer hits zero the
   * finalizer claims each team's surviving image exactly once by flipping
   * this field, which is what guarantees one evaluation request per team no
   * matter how many clients trigger the finalize at the same instant.
   *
   * Cleared on every fresh upload, so a replaced image is judgeable again.
   */
  evaluationClaimedAt?: Date | null;
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
  /** Shuffled option order for this serve: optionOrder[displayIndex] = originalIndex.
   *  Stored so polls re-serve the same order rather than re-shuffling each time. */
  optionOrder?: number[];
  /** Set once this serve's outcome has been folded into the team's comeback
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
 * Round 3's Comeback Meter. One document per team per round, and the ONLY
 * place meter/power state lives — see `lib/quiz/comeback.ts`, which is the
 * only module permitted to write it.
 *
 * Every team except the live Rank #1 carries a 3-bar meter. Each unsuccessful
 * question (wrong answer, timeout, or no submission) fills one bar; a correct
 * answer never does. Filling all three rolls one ability at random, banks it,
 * and empties the meter — the ability does NOT fire on the question that
 * earned it. It fires automatically on the team's next question and is deleted
 * when that question settles. While an ability is banked the meter is dormant,
 * so a team can never hold two.
 *
 * The three-field power lifecycle reads:
 *   ability=null                          → nothing banked
 *   ability set, usableOnSlug=null        → banked, fires next question
 *   ability set, usableOnSlug=<slug>      → firing on that question now
 */
export type ComebackAbility = "fifty-fifty" | "double-points" | "safety-net" | "free-pass";

export interface ComebackState {
  _id?: ObjectId;
  teamId: ObjectId;
  round: QuizRound;
  /** Bars filled, 0..3. Held at 0 while an ability is banked. */
  bottomStreak: number;
  /** Rolled the moment the meter fills; null until earned, null again once spent. */
  ability: ComebackAbility | null;
  grantedAt: Date | null;
  /** The question it is firing on. Null while banked and waiting. */
  usableOnSlug: string | null;
  usedAt: Date | null;
  usedOnSlug: string | null;
  /**
   * Suspended because the team is Rank #1. Bars and any banked ability above
   * are preserved untouched while this is set — nothing is cleared, so
   * dropping out of the lead needs no restore step.
   *
   * This is a settle-time marker for the admin dashboard and the debug log
   * only. Gameplay always recomputes "is this team frozen" from the LIVE
   * leaderboard (`getComebackView`), never from this field, so the two can
   * never disagree about who is actually leading.
   */
  frozen?: boolean;
}

/**
 * Every surface except Round 1's Image Replication game treats the tab as the
 * only legitimate place to be — that one exception exists because teams are
 * expected to tab out to an AI image generator mid-game. This is an
 * append-only log of moments a client reported leaving the tab: switch,
 * window blur, dropping out of fullscreen, a detected screenshot key, or a
 * freeze/unfreeze transition.
 *
 * The log itself is still just a timestamped signal for the coordinator to
 * review — client-reported events can be suppressed by a determined team, and
 * this doesn't pretend otherwise. Actual enforcement (freezing a team out)
 * lives in `ProctorFreeze` below; this collection never drives it directly.
 */
export type ProctorFlagKind =
  | "tab-switch"
  | "window-blur"
  | "fullscreen-exit"
  | "screenshot-attempt"
  | "freeze"
  | "unfreeze";

export interface ProctorFlag {
  _id?: ObjectId;
  teamId: ObjectId;
  round: QuizRound;
  kind: ProctorFlagKind;
  at: Date;
}

/**
 * Live per-team-per-round proctoring state — the enforcement counterpart to
 * `ProctorFlag`'s log. One mutable document per team+round (upserted, same
 * "current state, not history" shape as `ComebackState`), because the client
 * needs a cheap answer to "am I frozen right now" on every poll.
 *
 * Strikes 1-3 (a tab-switch or window-blur under 10 seconds) are warnings
 * only. A 4th strike, or any single switch away that runs 10+ seconds, sets
 * `frozen: true` — the UI blocks further interaction until a coordinator
 * clears it from the admin dashboard. Never applies to Round 1's Image
 * Replication game; that game doesn't arm this system at all.
 */
export interface ProctorFreeze {
  _id?: ObjectId;
  teamId: ObjectId;
  round: QuizRound;
  strikes: number;
  frozen: boolean;
  frozenAt: Date | null;
  frozenReason: "strikes" | "long-switch" | null;
  updatedAt: Date;
}

/**
 * Atomic "next number please" counter, keyed by an arbitrary caller-chosen
 * string. Backs rank-by-arrival scoring (Connections' per-stage rank,
 * Memory's completion-order bonus) that used to be computed by counting
 * existing documents and adding one — a read-then-write with no atomicity
 * between the two, so two teams finishing in the same instant could both
 * read the same count and both get awarded the same rank. `$inc` on a single
 * document is atomic in Mongo regardless of how many requests hit it at
 * once, which a count-then-insert never is.
 */
export interface RankCounter {
  _id: string;
  count: number;
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

export interface ShiftverseTeam {
  _id?: ObjectId;
  /** Puzzle slot 1..40. Identifies the WORD, never the caller. */
  teamNumber: number;
  /**
   * Which team owns this slot. Null until claimed. This — not a URL segment —
   * is what ties a puzzle to a player, so one team cannot read or overwrite
   * another's board.
   */
  teamId: ObjectId | null;
  claimedAt: Date | null;
  plaintextWord: string;
  encryptedWord: string;
  shiftKey: number;
  perLetterGuesses: number[];
  startTime: number;
}
