import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { avatarById, avatarForCoin } from "@/lib/quiz/avatars";
import { isQualified, getActiveQuizRound, isQuizEnded, isQuizStarted } from "@/lib/quiz/rounds";
import type { QuizRound } from "@/lib/db/types";
import QuizClient from "./QuizClient";

export default async function QuizPage() {
  const session = await getSession();
  if (!session) redirect("/enter");

  const teamId = new ObjectId(session.teamId);
  const teams = await collections.teams();
  const team = await teams.findOne({ _id: teamId });
  if (!team) redirect("/enter");

  const activeRound = await getActiveQuizRound();
  const ended = await isQuizEnded();
  const started = await isQuizStarted();
  let round: QuizRound = 1;
  if (await isQualified(teamId, 2)) round = 2;
  if (await isQualified(teamId, 3)) round = 3;

  const isEliminated = session.role !== "admin" && activeRound > 1 && !(await isQualified(teamId, activeRound));
  const avatar = avatarById(team.avatar ?? null) ?? (team.coin !== undefined ? avatarForCoin(team.coin) : null);

  return (
    <QuizClient
      round={isEliminated ? activeRound : round}
      teamName={team.name}
      avatar={avatar}
      isAdmin={session.role === "admin"}
      isEliminated={isEliminated}
      ended={ended}
      started={started}
    />
  );
}
