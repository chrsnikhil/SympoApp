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

    const teamsColl = await collections.teams();
    const partColl = await collections.participants();
    const subsColl = await collections.submissions();
    const scoresColl = await collections.scoreEvents();
    const huntColl = await collections.huntProgress();

    // 1. Fetch CTF scores and correct CTF submissions
    const scores = await scoresColl.find({ event: "ctf" }).toArray();
    const subs = await subsColl.find({ type: "ctf", "verdict.correct": true }).toArray();

    const ctfTeamIdSet = new Set<string>();
    for (const s of scores) {
      if (s.teamId) ctfTeamIdSet.add(String(s.teamId));
    }
    for (const s of subs) {
      if (s.teamId) ctfTeamIdSet.add(String(s.teamId));
    }

    const huntDocs = await huntColl.find({}).toArray();
    const huntTeamIdSet = new Set<string>();
    for (const h of huntDocs) {
      if (h.teamId) huntTeamIdSet.add(String(h.teamId));
    }

    // 2. Fetch candidates: exclude Admin Team, Quiz Control, and Quiz coin teams
    const rawTeams = await teamsColl.find({
      name: { $nin: ["Admin Team", "Quiz Control"] },
      coin: { $exists: false },
    }).toArray();

    // Filter strictly CTF teams
    const teams = rawTeams.filter((t) => {
      const tId = String(t._id);
      if (t.event) return t.event === "ctf";
      if (ctfTeamIdSet.has(tId)) return true;
      if (huntTeamIdSet.has(tId)) return false;
      return true;
    });

    const ctfTeamIdMap = new Set(teams.map((t) => String(t._id)));

    // 3. Map participants to CTF teams
    const allParticipants = await partColl.find({ role: { $ne: "admin" } }).toArray();
    const teamParticipantsMap = new Map<string, string[]>();
    for (const p of allParticipants) {
      if (!p.teamId) continue;
      const tId = String(p.teamId);
      if (!ctfTeamIdMap.has(tId)) continue;
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
