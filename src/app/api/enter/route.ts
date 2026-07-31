import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { collections } from "@/lib/db/client";
import { hashCode, signSession, sessionCookieOptions } from "@/lib/auth/session";
import { materialize } from "@/lib/leaderboard/materialize";

/**
 * In-memory IP rate limiter to protect against brute-force login attacks.
 * Tracks FAILED authentication attempts per IP (max 10 failures per 3-minute window).
 */
interface RateLimitRecord {
  failures: number;
  resetAt: number;
}

const loginRateMap = new Map<string, RateLimitRecord>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginRateMap.get(ip);
  if (!record) return false;
  if (now > record.resetAt) {
    loginRateMap.delete(ip);
    return false;
  }
  return record.failures >= 10;
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const windowMs = 3 * 60 * 1000; // 3 minutes
  const record = loginRateMap.get(ip);
  if (!record || now > record.resetAt) {
    loginRateMap.set(ip, { failures: 1, resetAt: now + windowMs });
  } else {
    record.failures += 1;
  }
}

function clearRateLimit(ip: string): void {
  loginRateMap.delete(ip);
}

/**
 * Constant-time string comparison using SHA-256 digests and timingSafeEqual.
 * Protects against side-channel timing attacks on password verification.
 */
function safeCompare(input: string, target: string): boolean {
  const hashA = createHash("sha256").update(String(input)).digest();
  const hashB = createHash("sha256").update(String(target)).digest();
  return hashA.length === hashB.length && timingSafeEqual(hashA, hashB);
}

function sha256Hex(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Security-hardened Single Authentication / Entry Endpoint.
 */
export async function POST(request: Request) {
  // Extract client IP address for rate limiting
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please wait 3 minutes before trying again." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    recordFailedAttempt(clientIp);
    return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
  }

  const expectedAdminUser = process.env.ADMIN_USERNAME ?? "licet";
  const expectedAdminPass = process.env.ADMIN_PASSWORD ?? "licet@2026";
  const expectedParticipantPass = process.env.PARTICIPANT_PASSWORD ?? "licet@123";

  // 1 ── ADMIN LOGIN
  if (typeof body.username === "string" && body.username.trim()) {
    const userStr = body.username.trim();
    const pass = typeof body.password === "string" ? body.password : "";

    const userMatch = safeCompare(userStr.toLowerCase(), expectedAdminUser.toLowerCase());
    const passMatch = pass.length <= 100 && safeCompare(pass, expectedAdminPass);

    if (!userMatch || !passMatch) {
      recordFailedAttempt(clientIp);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    clearRateLimit(clientIp);

    const teams = await collections.teams();
    const participants = await collections.participants();

    let adminTeam = await teams.findOne({ name: "Admin Team" });
    if (!adminTeam) {
      const inserted = await teams.insertOne({
        name: "Admin Team",
        nameKey: "admin_team",
        createdAt: new Date(),
      } as any);
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

  // 2 ── PARTICIPANT TEAM LOGIN / REGISTRATION
  if (typeof body.teamName === "string" && body.teamName.trim()) {
    const teamNameStr = body.teamName.trim();
    if (teamNameStr.length < 2 || teamNameStr.length > 60) {
      recordFailedAttempt(clientIp);
      return NextResponse.json({ error: "Team name must be between 2 and 60 characters" }, { status: 400 });
    }

    const pass = typeof body.password === "string" ? body.password : "";
    if (!pass || pass.length > 100) {
      recordFailedAttempt(clientIp);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const teams = await collections.teams();
    const participants = await collections.participants();
    const nameKey = teamNameStr.toLowerCase().replace(/\s+/g, "_");

    // Match team by nameKey or exact case-insensitive name
    let team = await teams.findOne({
      $or: [
        { nameKey },
        { name: { $regex: new RegExp(`^${escapeRegex(teamNameStr)}$`, "i") } },
      ],
    });

    if (team?.banned) {
      recordFailedAttempt(clientIp);
      return NextResponse.json(
        { error: `Your team has been banned: ${team.bannedReason || "Violation of event rules"}` },
        { status: 403 }
      );
    }

    const inputHash = sha256Hex(pass);

    if (!team) {
      // NEW TEAM REGISTRATION: Verify event password
      if (!safeCompare(pass, expectedParticipantPass)) {
        recordFailedAttempt(clientIp);
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const insertedTeam = await teams.insertOne({
        name: teamNameStr,
        nameKey,
        passwordHash: inputHash,
        createdAt: new Date(),
      } as any);
      team = {
        _id: insertedTeam.insertedId,
        name: teamNameStr,
        nameKey,
        passwordHash: inputHash,
        createdAt: new Date(),
      };
    } else {
      // EXISTING TEAM LOGIN: Verify against stored passwordHash (or fallback for legacy teams)
      let isPasswordValid = false;
      if (team.passwordHash) {
        isPasswordValid = safeCompare(inputHash, team.passwordHash);
      } else {
        // Fallback for legacy teams without passwordHash: verify against event pass and backfill
        isPasswordValid = safeCompare(pass, expectedParticipantPass);
        if (isPasswordValid) {
          await teams.updateOne({ _id: team._id }, { $set: { passwordHash: inputHash } });
        }
      }

      if (!isPasswordValid) {
        recordFailedAttempt(clientIp);
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
    }

    clearRateLimit(clientIp);

    let participant = await participants.findOne({ teamId: team._id! });
    if (!participant) {
      const insertedParticipant = await participants.insertOne({
        teamId: team._id!,
        name: `${teamNameStr} Captain`,
        role: "participant",
        createdAt: new Date(),
      });
      participant = {
        _id: insertedParticipant.insertedId,
        teamId: team._id!,
        name: `${teamNameStr} Captain`,
        role: "participant",
        createdAt: new Date(),
      };
    }

    const token = await signSession({
      sub: participant._id!.toString(),
      teamId: team._id!.toString(),
      role: "participant",
    });

    // Re-materialize CTF leaderboard so newly logged-in team appears immediately
    try {
      await materialize("ctf");
    } catch (e) {
      console.error("[enter] materialize error:", e);
    }

    const res = NextResponse.json({ ok: true, teamId: team._id!.toString(), role: "participant" });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  }

  // 3 ── ACCESS CODE REDEMPTION
  const code = body.code;
  if (typeof code === "string" && code.trim()) {
    const codeStr = code.trim();
    if (codeStr.length > 50) {
      recordFailedAttempt(clientIp);
      return NextResponse.json({ error: "Access code invalid" }, { status: 400 });
    }

    const codes = await collections.accessCodes();
    const record = await codes.findOne({ codeHash: hashCode(codeStr) });

    if (!record) {
      recordFailedAttempt(clientIp);
      return NextResponse.json({ error: "That access code is invalid" }, { status: 401 });
    }

    clearRateLimit(clientIp);

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

  recordFailedAttempt(clientIp);
  return NextResponse.json({ error: "Please enter Team Name / Code or Admin credentials" }, { status: 400 });
}
