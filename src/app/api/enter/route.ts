import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { SESSION_COOKIE } from "@/lib/config";
import { hashCode, normaliseCode, signSession, sessionCookieOptions } from "@/lib/auth/session";
import { avatarById, avatarForCoin, formatCoin, parseCoin } from "@/lib/quiz/avatars";

async function sessionFor(teamId: ObjectId, participantId: ObjectId, role: "participant" | "admin") {
  return signSession({ sub: participantId.toString(), teamId: teamId.toString(), role });
}

export async function POST(request: Request) {
  try {
    let body: { code?: unknown; coin?: unknown; teamName?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    const rawCode = typeof body.code === "string" ? body.code.trim() : "";
    if (rawCode) {
      const inputCode = rawCode;
      const codes = await collections.accessCodes();
      const teams = await collections.teams();
      const participants = await collections.participants();

      if (inputCode === "1684" || normaliseCode(inputCode) === "1684") {
        let adminTeam = await teams.findOne({ name: "Quiz Control" });
        if (!adminTeam) {
          const adminTeamId = new ObjectId();
          await teams.insertOne({ _id: adminTeamId, name: "Quiz Control", createdAt: new Date() });
          adminTeam = (await teams.findOne({ _id: adminTeamId }))!;
        }
        let adminParticipant = await participants.findOne({ teamId: adminTeam._id, role: "admin" });
        if (!adminParticipant) {
          const adminPartId = new ObjectId();
          await participants.insertOne({
            _id: adminPartId,
            teamId: adminTeam._id,
            name: "Quiz coordinator",
            role: "admin",
            createdAt: new Date(),
          });
          adminParticipant = (await participants.findOne({ _id: adminPartId }))!;
        }

        let record = await codes.findOne({ codeHash: hashCode("1684") });
        if (!record) {
          await codes.insertOne({
            codeHash: hashCode("1684"),
            teamId: adminTeam._id,
            participantId: adminParticipant._id,
            role: "admin",
            redeemedAt: new Date(),
          });
        } else if (!record.teamId || !(await teams.findOne({ _id: record.teamId }))) {
          await codes.updateOne({ _id: record._id }, { $set: { teamId: adminTeam._id, participantId: adminParticipant._id } });
        }

        const token = await sessionFor(adminTeam._id, adminParticipant._id, "admin");
        const res = NextResponse.json({
          ok: true,
          teamId: adminTeam._id.toString(),
          role: "admin",
          teamName: adminTeam.name,
          coin: null,
          avatar: null,
        });
        res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
        return res;
      }

      const record = await codes.findOne({ codeHash: hashCode(inputCode) });
      if (!record) {
        return NextResponse.json({ error: "That code isn't valid" }, { status: 401 });
      }
      if (!record.redeemedAt) {
        await codes.updateOne({ _id: record._id }, { $set: { redeemedAt: new Date() } });
      }

      let team = await teams.findOne({ _id: record.teamId });
      if (!team) {
        const newTeamId = new ObjectId();
        await teams.insertOne({ _id: newTeamId, name: "Quiz Control", createdAt: new Date() });
        team = (await teams.findOne({ _id: newTeamId }))!;
        await codes.updateOne({ _id: record._id }, { $set: { teamId: newTeamId } });
      }

      const token = await sessionFor(team._id, record.participantId, record.role);
      const res = NextResponse.json({
        ok: true,
        teamId: team._id.toString(),
        role: record.role,
        teamName: team.name,
        coin: team?.coin === undefined ? null : formatCoin(team.coin),
        avatar: team?.avatar ? avatarById(team.avatar) : null,
      });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    }

    // ── Coin path: team login (coins 01 to 60) ───────────────────────────────
    if (body.coin === undefined || body.coin === null || body.coin === "") {
      return NextResponse.json({ error: "Enter the number on your coin" }, { status: 400 });
    }

    const parsed = parseCoin(String(body.coin));
    if (parsed === null) {
      return NextResponse.json({ error: "Coins are numbered 01 to 60" }, { status: 400 });
    }

    const forCoin = avatarForCoin(parsed);
    if (!forCoin) {
      return NextResponse.json({ error: "That isn't a valid coin" }, { status: 400 });
    }

    const coins = await collections.coins();
    const teams = await collections.teams();
    const participants = await collections.participants();

    let disc = await coins.findOne({ _id: parsed });
    if (!disc) {
      await coins.insertOne({ _id: parsed, teamId: null, claimedAt: null });
      disc = (await coins.findOne({ _id: parsed }))!;
    }

    // Auto-assign coin token to character team if not pre-assigned by coordinator
    if (!disc.teamId) {
      const defaultTeamName = `${forCoin.name} #${formatCoin(parsed)}`;
      let team = await teams.findOne({ name: defaultTeamName });
      if (!team) {
        const teamId = new ObjectId();
        await teams.insertOne({
          _id: teamId,
          name: defaultTeamName,
          avatar: forCoin.id,
          coin: parsed,
          createdAt: new Date(),
        });
        team = (await teams.findOne({ _id: teamId }))!;
      }
      let participant = await participants.findOne({ teamId: team._id });
      if (!participant) {
        const partId = new ObjectId();
        await participants.insertOne({
          _id: partId,
          teamId: team._id,
          name: defaultTeamName,
          role: "participant",
          createdAt: new Date(),
        });
      }
      await coins.updateOne({ _id: parsed }, { $set: { teamId: team._id, claimedAt: new Date() } });
      disc.teamId = team._id;
    }

    const team = await teams.findOne({ _id: disc.teamId });
    let participant = await participants.findOne({ teamId: disc.teamId });
    if (!participant) {
      const partId = new ObjectId();
      await participants.insertOne({
        _id: partId,
        teamId: disc.teamId,
        name: team?.name ?? `Team #${formatCoin(parsed)}`,
        role: "participant",
        createdAt: new Date(),
      });
      participant = (await participants.findOne({ _id: partId }))!;
    }

    if (!team || !participant?._id) {
      return NextResponse.json({ error: "That coin's team is missing — tell a coordinator" }, { status: 409 });
    }

    // Block entry if token is currently in use (locked) until coordinator unlocks it
    if (disc.redeemedAt) {
      return NextResponse.json(
        { error: "🔒 This token is currently in use! Ask the coordinator to unlock it." },
        { status: 403 }
      );
    }

    // Stamp token as in-use (redeemed) on successful login
    await coins.updateOne({ _id: parsed }, { $set: { redeemedAt: new Date() } });

    const token = await sessionFor(team._id, participant._id, participant.role);
    const res = NextResponse.json({
      ok: true,
      teamId: team._id.toString(),
      role: participant.role,
      teamName: team.name,
      coin: team?.coin === undefined ? null : formatCoin(team.coin),
      avatar: team?.avatar ? avatarById(team.avatar) : null,
      returning: true,
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err: any) {
    console.error("POST /api/enter error:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
