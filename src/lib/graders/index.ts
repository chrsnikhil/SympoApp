import type { EventKey } from "@/lib/config";
import type { Grader, GraderRegistry } from "./types";
import { gradeHunt } from "./hunt";
import { gradeCtf } from "./ctf";
import { gradeQuiz } from "./quiz";
import { gradeCode } from "./code";
import { gradeShiftverse } from "./shiftverse";

/**
 * The registry. This is the ONLY place the pipeline learns which event does
 * what — everything upstream (auth, rate limiting, timestamping, the score
 * ledger, the leaderboard) is shared and event-agnostic.
 */
const registry: GraderRegistry = {
  hunt: gradeHunt,
  ctf: gradeCtf,
  quiz: gradeQuiz,
  code: gradeCode,
  shiftverse: gradeShiftverse,
};

export function graderFor(event: EventKey): Grader {
  const g = registry[event];
  if (!g) throw new Error(`No grader registered for event: ${event}`);
  return g;
}

export type { GradeInput, GradeResult, Grader } from "./types";
