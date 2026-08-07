import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { isSectorCode, sectorNumberFor } from "@/lib/blueprint/variants";
import type { GradeInput, GradeResult } from "./types";

/**
 * BLUEPRINT RECOVERY — the sector's access code, checked against the sector
 * this team was actually sent to.
 *
 * The original validated through a Supabase RPC and, when that call failed,
 * fell back to comparing against the same code table it had shipped to the
 * browser. Two problems in one: the answer to every sector was readable in
 * devtools, and the fallback meant a network blip turned the server check into
 * a client check. Here the table is `server-only` and there is no fallback —
 * if this cannot resolve the team's sector, the answer is wrong.
 *
 * The sector comes from the team record, never the request. Sending it would
 * let a team submit against whichever of the ten sectors they had overheard,
 * which is the whole game: the code is on a card at a physical location, and
 * knowing someone else's is exactly the shortcut this prevents.
 */
export async function gradeBlueprint(input: GradeInput): Promise<GradeResult> {
  const { challenge, teamId, payload } = input;
  const progress = await collections.huntProgress();

  const current = await progress.findOne({ teamId, challengeSlug: challenge.slug });
  if (!current) return { correct: false, points: 0, meta: { reason: "not-unlocked" } };
  if (current.solvedAt) return { correct: false, points: 0, meta: { reason: "already-solved" } };

  const teams = await collections.teams();
  const team = await teams.findOne({ _id: teamId as ObjectId });
  // coin first, then the assigned number — the same order the universe round
  // uses, so a team is in one sector across the whole hunt.
  const number = typeof team?.coin === "number" ? team.coin : team?.teamNumber;
  if (typeof number !== "number") {
    return { correct: false, points: 0, meta: { reason: "no-team-number" } };
  }

  if (!isSectorCode(sectorNumberFor(number), payload)) {
    return { correct: false, points: 0 };
  }

  // Claim the solve rather than record it: two correct submissions in flight at
  // once would otherwise both pass the read above and both be paid.
  const claim = await progress.updateOne(
    { teamId, challengeSlug: challenge.slug, solvedAt: null },
    { $set: { solvedAt: input.receivedAt } }
  );
  if (claim.modifiedCount === 0) {
    return { correct: false, points: 0, meta: { reason: "already-solved" } };
  }

  const hintCosts = challenge.config.hintCosts ?? [];
  const spent = hintCosts.slice(0, current.hintsUsed).reduce((a, b) => a + b, 0);

  return {
    correct: true,
    points: Math.max(0, challenge.points - spent),
    meta: { sector: sectorNumberFor(number) },
  };
}
