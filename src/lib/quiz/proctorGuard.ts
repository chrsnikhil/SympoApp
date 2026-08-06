import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { QuizRound } from "@/lib/db/types";

/**
 * Is this team currently frozen by the proctor?
 *
 * The freeze existed only in the UI. `/api/quiz/round1` reported `frozen` so the
 * client could paint `FrozenScreen`, and nothing on the write path ever asked.
 * A frozen team saw a blocking overlay while the server went on accepting their
 * flips and their guesses — so the control was advisory, and anyone with
 * DevTools open, or simply a second tab still polling, played straight through
 * it. A proctoring control that exists only in the client is not a control.
 *
 * Read on the write path rather than trusted from the client, for the same
 * reason the serve timestamps are: the client is the thing being policed.
 */
export async function isTeamFrozen(teamId: ObjectId, round: QuizRound): Promise<boolean> {
  const freezes = await collections.proctorFreezes();
  const doc = await freezes.findOne({ teamId, round });
  return doc?.frozen === true;
}

/** The message a frozen team gets back, phrased for the participant, not the log. */
export const FROZEN_MESSAGE =
  "Your round is frozen after repeated tab switches. Call a coordinator over to unfreeze it.";
