import { NextResponse } from "next/server";
import { collections } from "@/lib/db/client";
import { LEADERBOARD_REFRESH_MS } from "@/lib/config";
import { ROUNDS, standings } from "@/lib/quiz/rounds";
import { avatarById } from "@/lib/quiz/avatars";
import type { AvatarId, QuizRound } from "@/lib/db/types";

/**
 * Live standings for a round. Computed on read rather than materialized on a
 * timer — with a few dozen teams the aggregation is trivial, and a stale
 * snapshot would be worse than the cost of recomputing. Round 3 needs this to
 * feel live for the "auto-advance leaderboard" requirement.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const round = Number(url.searchParams.get("round") ?? "1") as QuizRound;

  if (![1, 2, 3].includes(round)) {
    return NextResponse.json({ error: "Round must be 1, 2 or 3" }, { status: 400 });
  }

  const table = await standings(round);
  const spec = ROUNDS[round];

  const elimsCol = await collections.roundEliminations();
  const elimDocs = await elimsCol.find({}).toArray();
  const eliminatedIds = new Set(elimDocs.map((e) => String(e.teamId)));

  const qualsCol = await collections.roundQualifications();
  const nextRound = (round + 1) as QuizRound;
  const hasCutForNextRound = round < 3 ? (await qualsCol.countDocuments({ round: nextRound })) > 0 : false;

  return NextResponse.json(
    {
      round,
      title: spec.title,
      advances: spec.defaultAdvances,
      generatedAt: new Date().toISOString(),
      rows: table.map((row, i) => {
        const avatar = avatarById(row.avatar as AvatarId | null);
        const isEliminated = eliminatedIds.has(row.teamId);
        const isBelowCut = hasCutForNextRound && spec.defaultAdvances !== null && i >= spec.defaultAdvances;
        return {
          rank: i + 1,
          ...row,
          avatarName: avatar?.name ?? null,
          avatarColour: avatar?.colour ?? null,
          qualifying: isEliminated || isBelowCut ? false : true,
        };
      }),
    },
    { headers: { "Cache-Control": `public, max-age=${Math.floor(LEADERBOARD_REFRESH_MS / 1000)}` } }
  );
}
