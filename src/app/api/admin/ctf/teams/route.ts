import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { materialize } from "@/lib/leaderboard/materialize";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const teamsColl = await collections.teamsCtf();
    const legacyTeamsColl = await collections.teams();
    const partColl = await collections.participantsCtf();
    const legacyPartColl = await collections.participants();
    const subsColl = await collections.submissionsCtf();
    const scoresColl = await collections.scoreEventsCtf();

    // 1. Fetch CTF scores and correct CTF submissions
    const scores = await scoresColl.find({}).toArray();
    const subs = await subsColl.find({ "verdict.correct": true }).toArray();

    // 2. Fetch CTF teams from teams_ctf (and any legacy ctf-tagged teams)
    const teamsCtfList = await teamsColl.find({ name: { $ne: "Admin Team" } }).toArray();
    const legacyCtfTeams = await legacyTeamsColl.find({ event: "ctf", name: { $nin: ["Admin Team", "Quiz Control"] } }).toArray();

    const teamMap = new Map<string, typeof teamsCtfList[0]>();
    for (const t of [...teamsCtfList, ...legacyCtfTeams]) {
      teamMap.set(String(t._id), t);
    }
    const teams = Array.from(teamMap.values());

    // 3. Map participants to CTF teams
    const allParticipants = [
      ...(await partColl.find({ role: { $ne: "admin" } }).toArray()),
      ...(await legacyPartColl.find({ role: { $ne: "admin" } }).toArray()),
    ];
    const teamParticipantsMap = new Map<string, string[]>();
    for (const p of allParticipants) {
      if (!p.teamId) continue;
      const tId = String(p.teamId);
      if (!teamParticipantsMap.has(tId)) {
        teamParticipantsMap.set(tId, []);
      }
      if (!teamParticipantsMap.get(tId)!.includes(p.name)) {
        teamParticipantsMap.get(tId)!.push(p.name);
      }
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

    const teamsColl = await collections.teamsCtf();
    const scoresColl = await collections.scoreEventsCtf();
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
