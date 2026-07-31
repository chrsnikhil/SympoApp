import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { hashCode, signSession, sessionCookieOptions } from "@/lib/auth/session";

/**
 * Single Authentication / Entry Endpoint.
 *
 * Supports:
 *  1. Access Code Redemption (`{ code }`) for existing events.
 *  2. Admin Login (`{ username: "licet", password: "licet@2026" }`).
 *  3. Participant Login (`{ teamName: "...", password: "licet@123" }`).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  // 1 ── ADMIN LOGIN: username === "licet" & password === "licet@2026"
  if (typeof body.username === "string" && body.username.trim().toLowerCase() === "licet") {
    if (body.password !== "licet@2026") {
      return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });
    }

    const teams = await collections.teams();
    const participants = await collections.participants();

    let adminTeam = await teams.findOne({ name: "Admin Team" });
    if (!adminTeam) {
      const inserted = await teams.insertOne({ name: "Admin Team", nameKey: "admin_team", createdAt: new Date() } as any);
      adminTeam = { _id: inserted.insertedId, name: "Admin Team", createdAt: new Date() };
    }

    let adminParticipant = await participants.findOne({ role: "admin" });
    if (!adminParticipant) {
      const inserted = await participants.insertOne({
        teamId: adminTeam._id!,
        name: "Admin",
        role: "admin",
        createdAt: new Date(),
      });
      adminParticipant = { _id: inserted.insertedId, teamId: adminTeam._id!, name: "Admin", role: "admin", createdAt: new Date() };
    }

    const token = await signSession({
      sub: adminParticipant._id!.toString(),
      teamId: adminTeam._id!.toString(),
      role: "admin",
    });

    const res = NextResponse.json({ ok: true, teamId: adminTeam._id!.toString(), role: "admin" });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  }

  // 2 ── PARTICIPANT TEAM LOGIN: teamName + password === "licet@123"
  if (typeof body.teamName === "string" && body.teamName.trim()) {
    const teamNameStr = body.teamName.trim();
    if (body.password !== "licet@123") {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const teams = await collections.teams();
    const participants = await collections.participants();

    // Match team by exact case-insensitive name
    let team = await teams.findOne({ name: { $regex: new RegExp(`^${escapeRegex(teamNameStr)}$`, "i") } });
    if (!team) {
      const insertedTeam = await teams.insertOne({
        name: teamNameStr,
        nameKey: teamNameStr.toLowerCase().replace(/\s+/g, "_"),
        createdAt: new Date(),
      } as any);
      team = { _id: insertedTeam.insertedId, name: teamNameStr, createdAt: new Date() };
    }

    let participant = await participants.findOne({ teamId: team._id! });
    if (!participant) {
      const insertedParticipant = await participants.insertOne({
        teamId: team._id!,
        name: `${teamNameStr} Captain`,
        role: "participant",
        createdAt: new Date(),
      });
      participant = { _id: insertedParticipant.insertedId, teamId: team._id!, name: `${teamNameStr} Captain`, role: "participant", createdAt: new Date() };
    }

    const token = await signSession({
      sub: participant._id!.toString(),
      teamId: team._id!.toString(),
      role: "participant",
    });

    const res = NextResponse.json({ ok: true, teamId: team._id!.toString(), role: "participant" });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  }

  // 3 ── ACCESS CODE REDEMPTION (Original Flow for Other Events)
  const code = body.code;
  if (typeof code === "string" && code.trim()) {
    const codes = await collections.accessCodes();
    const record = await codes.findOne({ codeHash: hashCode(code) });

    if (!record) {
      return NextResponse.json({ error: "That code isn't valid" }, { status: 401 });
    }

    if (!record.redeemedAt) {
      await codes.updateOne({ _id: record._id }, { $set: { redeemedAt: new Date() } });
    }

    const token = await signSession({
      sub: record.participantId.toString(),
      teamId: record.teamId.toString(),
      role: record.role,
    });

    const res = NextResponse.json({ ok: true, teamId: record.teamId.toString(), role: record.role });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  }

  return NextResponse.json({ error: "Please enter Team Name / Code or Admin credentials" }, { status: 400 });
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
