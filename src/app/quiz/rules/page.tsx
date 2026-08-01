import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { avatarById, avatarForCoin } from "@/lib/quiz/avatars";
import QuizRulesLobby from "../QuizRulesLobby";

export default async function QuizRulesPage() {
  const session = await getSession();

  let teamName = "Spider-Gwen Team";
  let avatar = null;

  if (session?.teamId) {
    try {
      const teamId = new ObjectId(session.teamId);
      const teams = await collections.teams();
      const team = await teams.findOne({ _id: teamId });
      if (team) {
        teamName = team.name;
        avatar =
          avatarById(team.avatar ?? null) ??
          (team.coin !== undefined ? avatarForCoin(team.coin) : null);
      }
    } catch {
      // Fallback to default persona if DB lookup fails
    }
  }

  return <QuizRulesLobby teamName={teamName} avatar={avatar} round={1} />;
}
