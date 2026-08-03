import type { ObjectId } from "mongodb";
import type { EventKey, SubmissionStatus } from "@/lib/config";

/**
 * Collection shapes. Cosmos DB for MongoDB (vCore free tier) — chosen over
 * Postgres because a Burstable Postgres tier caps around 30–50 connections,
 * which a 500-person burst walks straight into. Mongo handles hundreds.
 */

export interface Team {
  _id?: ObjectId;
  name: string;
  nameKey?: string;
  createdAt: Date;
  banned?: boolean;
  bannedReason?: string;
  bannedAt?: Date;
  penaltyPoints?: number;
  passwordHash?: string;
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
 * must not hand someone a working set of codes.
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
    /** quiz: option index that scores. */
    correctIndex?: number;
    /** quiz: seconds allowed from serve to answer. */
    limitSeconds?: number;
    /** quiz: bonus for answering fast, scaled by time remaining. */
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

