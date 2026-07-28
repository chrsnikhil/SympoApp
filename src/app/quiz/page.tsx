import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { avatarById } from "@/lib/quiz/avatars";
import { isQualified } from "@/lib/quiz/rounds";
import type { QuizRound } from "@/lib/db/types";
import QuizClient from "./QuizClient";

/**
 * QUIZ — reached via proxy rewrite from quiz.<domain>.
 *
 * The round a team plays is decided here, on the server, from the stored
 * qualification set: the furthest round they're allowed into. Letting the
 * client pick would mean "which round am I in" came from the same place as
 * "let me into round 3", and the API would be the only thing saying no.
 */
export default async function QuizPage() {
  const session = await getSession();
  if (!session) redirect("/enter");

  const teamId = new ObjectId(session.teamId);
  const teams = await collections.teams();
  const team = await teams.findOne({ _id: teamId });

  let round: QuizRound = 1;
  if (await isQualified(teamId, 2)) round = 2;
  if (await isQualified(teamId, 3)) round = 3;

  return (
    <QuizClient
      round={round}
      teamName={team?.name ?? "Your team"}
      avatar={avatarById(team?.avatar ?? null)}
      isAdmin={session.role === "admin"}
    />
  );
}
