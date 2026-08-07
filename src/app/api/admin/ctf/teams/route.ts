import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { materialize } from "@/lib/leaderboard/materialize";
import { arrivedTeamIds } from "@/lib/event/participation";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const teamsColl = await collections.teams();
    const partColl = await collections.participants();
    const subsColl = await collections.submissions();
    const scoresColl = await collections.scoreEvents();

    const participants = await partColl.find({ role: { $ne: "admin" } }).toArray();
    const scores = await scoresColl.find({ event: "ctf" }).toArray();
    const subs = await subsColl.find({ type: "ctf", "verdict.correct": true }).toArray();

    /**
     * Only teams that have turned up to the CTF belong in the CTF console.
     *
     * `teams` is one global collection with no event field — a Team is a name
     * and a coin, shared by every event — so listing it unfiltered put all
     * thirty teams in front of the CTF coordinator: the quiz's "Quiz Control"
     * and "Test Team 1..6", and everyone who registered on the hunt. On a
     * console whose buttons are penalty and ban, a row you cannot identify is a
     * row you can act on by mistake, and the team it lands on has no CTF score
     * for anyone to notice it against.
     *
     * Membership is ARRIVAL, not scoring. The obvious filter — teams with a CTF
     * submission or score row — was measured against production first and cut
     * the console from 30 teams to 1: twenty-nine had entered the CTF and not
     * yet submitted. A coordinator who cannot see a team cannot help one, so
     * that filter would have been worse than the noise it removed.
     *
     * `event_participation` records arrival instead, written when a team loads
     * the CTF dashboard. Ledger activity is unioned in as a backstop so a team
     * that scored before this existed — or during a restart that lost the
     * in-process write guard — cannot vanish from the console.
     */
    const [arrived, ctfSubmitters, ctfScorers] = await Promise.all([
      arrivedTeamIds("ctf"),
      subsColl.distinct("teamId", { type: "ctf" }),
      scoresColl.distinct("teamId", { event: "ctf" }),
    ]);
    const ctfTeamIds = [...arrived, ...ctfSubmitters, ...ctfScorers].map(
      (id) => new ObjectId(String(id))
    );

    const teams = await teamsColl
      .find({ _id: { $in: ctfTeamIds }, name: { $ne: "Admin Team" } })
      .toArray();

    // Map participants to teams
    const teamParticipantsMap = new Map<string, string[]>();
    for (const p of participants) {
      if (!p.teamId) continue;
      const tId = String(p.teamId);
      if (!teamParticipantsMap.has(tId)) {
        teamParticipantsMap.set(tId, []);
      }
      teamParticipantsMap.get(tId)!.push(p.name);
    }

    // Calculate total score and penalty points per team
    const result = teams.map((t) => {
      const tId = String(t._id);
      const teamSubs = subs.filter((s) => s.teamId && String(s.teamId) === tId);
      const teamScores = scores.filter((s) => s.teamId && String(s.teamId) === tId);
      const scoreTotal = teamScores.reduce((acc, curr) => acc + (curr.points || 0), 0);

      return {
        id: tId,
        name: t.name,
        createdAt: t.createdAt,
        banned: Boolean(t.banned),
        bannedReason: t.bannedReason ?? null,
        bannedAt: t.bannedAt ?? null,
        penaltyPoints: t.penaltyPoints ?? 0,
        score: scoreTotal,
        solvedCount: teamSubs.length,
        members: teamParticipantsMap.get(tId) ?? [],
      };
    });

    return NextResponse.json({ teams: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Admin teams GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { action, teamId, penaltyPoints, reason } = body;

    if (!teamId || !ObjectId.isValid(teamId)) {
      return NextResponse.json({ error: "Invalid or missing team ID" }, { status: 400 });
    }

    const teamsColl = await collections.teams();
    const scoresColl = await collections.scoreEvents();
    const teamObjId = new ObjectId(teamId);

    const team = await teamsColl.findOne({ _id: teamObjId });
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (action === "penalty") {
      const points = Math.abs(Number(penaltyPoints) || 0);
      if (points <= 0) {
        return NextResponse.json({ error: "Penalty points must be greater than 0" }, { status: 400 });
      }

      // Record negative score event in ledger
      await scoresColl.insertOne({
        teamId: teamObjId,
        event: "ctf",
        points: -points,
        reason: reason?.trim() || "Admin Penalty",
        at: new Date(),
      });

      // Update team penaltyPoints total
      await teamsColl.updateOne(
        { _id: teamObjId },
        { $inc: { penaltyPoints: points } }
      );

      await materialize("ctf");
      return NextResponse.json({ ok: true, message: `Issued -${points} pts penalty to ${team.name}` });
    }

    if (action === "ban") {
      await teamsColl.updateOne(
        { _id: teamObjId },
        {
          $set: {
            banned: true,
            bannedReason: reason?.trim() || "Violation of rules",
            bannedAt: new Date(),
          },
        }
      );

      await materialize("ctf");
      return NextResponse.json({ ok: true, message: `Banned team ${team.name}` });
    }

    if (action === "unban") {
      await teamsColl.updateOne(
        { _id: teamObjId },
        {
          $unset: {
            banned: "",
            bannedReason: "",
            bannedAt: "",
          },
        }
      );

      await materialize("ctf");
      return NextResponse.json({ ok: true, message: `Unbanned team ${team.name}` });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Admin teams POST error:", err);
    return NextResponse.json({ error: "Failed to perform admin team action" }, { status: 500 });
  }
}
