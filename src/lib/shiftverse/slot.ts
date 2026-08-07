import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { withThrottleRetry } from "@/lib/db/retry";
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
 * Two DIFFERENT teams hitting an empty board in the same instant would both
 * pass a read-then-check and be handed the same word; `findOneAndUpdate`
 * filtered on `teamId: null` can only succeed for one of them.
 *
 * That guarantee does NOT extend to the SAME team calling twice at once — a
 * React StrictMode double-invoked effect, a second tab, a refresh mid-request.
 * The `findOne` fast path above is a check, not a lock: two concurrent calls
 * for one teamId can both read null before either write lands, and each then
 * atomically wins a DIFFERENT free slot — `findOneAndUpdate`'s atomicity is
 * per-document, so it has nothing to say about one team ending up owning two
 * documents. A unique index on `teamId` isn't available here (Cosmos only
 * allows a unique index on an empty collection, and `shiftverse_teams` is
 * seeded), so after a successful claim we re-read everything held under this
 * teamId and compensate: keep the lowest `teamNumber` — what a solo caller
 * would have gotten — and release every other one back to the pool exactly as
 * if it had never been claimed. This runs only after an actual claim, so the
 * common repeat-call case (the `existing` fast path above) stays one query.
 */
export async function claimSlot(teamId: ObjectId): Promise<ShiftverseTeam | null> {
  const coll = await collections.shiftverseTeams();

  // Sorted so that if a duplicate-assignment race is ever mid-flight, this
  // still deterministically returns the slot the compensation below would
  // keep, rather than whichever of the duplicates the query happens to hit.
  const existing = await coll.findOne({ teamId }, { sort: { teamNumber: 1 } });
  if (existing) return existing;

  const claimed = await withThrottleRetry(() =>
    coll.findOneAndUpdate(
      { teamId: null },
      { $set: { teamId, claimedAt: new Date() } },
      { sort: { teamNumber: 1 }, returnDocument: "after" }
    )
  );
  if (!claimed) return null;

  const held = await coll.find({ teamId }).sort({ teamNumber: 1 }).toArray();
  if (held.length <= 1) return claimed;

  const [keep, ...extras] = held;
  await withThrottleRetry(() =>
    coll.updateMany(
      { _id: { $in: extras.map((doc) => doc._id) } },
      { $set: { teamId: null, claimedAt: null, startTime: 0, perLetterGuesses: [] } }
    )
  );
  return keep;
}

