import type { ObjectId } from "mongodb";
import type { EventKey } from "@/lib/config";
import type { Challenge } from "@/lib/db/types";

/**
 * Every event implements this one interface. The submission pipeline knows
 * nothing about hunts or flags or test cases — it verifies the session, stamps
 * the server clock, rate-limits, then hands off here. Adding a fifth event
 * means writing one of these and registering it; the pipeline is untouched.
 */

export interface GradeInput {
  challenge: Challenge;
  teamId: ObjectId;
  participantId: ObjectId;
  submissionId: ObjectId;
  /** Raw user answer/flag/choice. For `code`, this is the source. */
  payload: string;
  /** SERVER receipt time — the fairness anchor for ties and time limits. */
  receivedAt: Date;
}

export interface GradeResult {
  /**
   * false = graded, wrong. `pending` (below) = not graded yet.
   */
  correct: boolean;
  points: number;
  /**
   * True for asynchronous grading (the code event). The pipeline returns 202
   * and the client polls; the judge posts the real verdict later.
   */
  pending?: boolean;
  /** Anything worth surfacing to the user or keeping for audit. */
  meta?: Record<string, unknown>;
}

export type Grader = (input: GradeInput) => Promise<GradeResult>;

export type GraderRegistry = Record<EventKey, Grader>;
