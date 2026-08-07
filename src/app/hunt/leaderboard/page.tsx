import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import HuntStandings from "./HuntStandings";

/**
 * Hunt standings.
 *
 * Behind the gate like the rest of the hunt, but visible to every team rather
 * than to coordinators only — a leaderboard nobody can see is just a database
 * row. The session is read here purely to know which row is the viewer's own,
 * so it can be marked; the standings themselves are the same for everyone and
 * come from the materialized snapshot.
 */
export default async function HuntLeaderboardPage() {
  const session = await getSession();
  if (!session) redirect("/enter");
  return <HuntStandings ownTeamId={session.teamId} />;
}
