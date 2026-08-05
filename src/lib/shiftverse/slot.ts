import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { ShiftverseTeam } from "@/lib/db/types";

/**
 * A team's puzzle slot, claimed on first access and never reassigned.
 *
 * `teamNumber` identifies the WORD, not the player. Handing it in from the URL
 * — as the original routes did — let anyone read or overwrite anyone's board
 * by editing a path segment. Every other event on this platform keys its state
 * by the session's `teamId`; this brings Shiftverse into line.
 *
 * The claim is a single conditional update rather than find-then-write.
 * Two teams hitting an empty board in the same instant would both pass a
 * read-then-check and be handed the same word; `findOneAndUpdate` filtered on
 * `teamId: null` can only succeed for one of them.
 */
export async function claimSlot(teamId: ObjectId): Promise<ShiftverseTeam | null> {
  const coll = await collections.shiftverseTeams();

  const existing = await coll.findOne({ teamId });
  if (existing) return existing;

  const claimed = await coll.findOneAndUpdate(
    { teamId: null },
    { $set: { teamId, claimedAt: new Date() } },
    { sort: { teamNumber: 1 }, returnDocument: "after" }
  );
  return claimed ?? null;
}
