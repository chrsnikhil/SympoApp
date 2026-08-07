import { NextResponse } from "next/server";
import { SESSION_COOKIE, eventFromHost } from "@/lib/config";
import { timingSafeEqual, createHash } from "node:crypto";
import { collections } from "@/lib/db/client";
import { hashCode, normaliseCode, signSession, sessionCookieOptions } from "@/lib/auth/session";
import { materialize } from "@/lib/leaderboard/materialize";
import { ObjectId } from "mongodb";
import { avatarById, avatarForCoin, formatCoin, parseCoin, MAX_COIN } from "@/lib/quiz/avatars";

/**
 * The single entry endpoint for every event — but not a single login *model*.
 *
 * The quiz claims a physical coin and derives an avatar from it; the CTF and
 * hunt use team-name/password with an admin credential path and IP rate
 * limiting. Those are genuinely different flows, not variations of one, and
 * folding them into a single handler produces an auth endpoint nobody can
 * reason about.
 *
 * So the dispatch is by HOST. `quiz.example.com/api/enter` gets the quiz's
 * flow; every other event subdomain gets the platform flow. Each half below is
 * exactly what its team wrote and tested, moved but not rewritten.
 *
 * Path-based deployments (localhost, ngrok) have no subdomain to read, so
 * those fall back to the shape of the body: a `coin` field means quiz.
 */
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
async function platformEntry(
  request: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  /**
   * Which set of team records this login belongs to.
   *
   * The CTF keeps its own teams, participants and access codes; the hunt and
   * the code event share the originals. One form serves all three, so it has
   * to know which host it is answering on — and it did not: every platform
   * login wrote to the CTF's collections, whatever subdomain it came from.
   *
   * A hunt team therefore ended up in `teams_ctf` while every hunt route looks
   * in `teams`, so the lookup missed and the 64 Grid and Blueprint Recovery
   * answered "your login has no team number" to every entrant. The session was
   * valid; the team it pointed at was in the wrong drawer.
   *
   * On a path-based deployment (localhost, ngrok) there is no subdomain to read
   * and `event` is null. That falls to the shared collections, which is right
   * for the hunt and the code event and wrong for local CTF testing — a CTF
   * team created on localhost lands in `teams`. Production always has a host,
   * so this only affects local runs, and getting it right there needs a signal
   * the request does not carry.
   */
  const event = eventFromHost(request.headers.get("host"));
  const isCtf = event === "ctf";
  const teamsFor = () => (isCtf ? collections.teamsCtf() : collections.teams());
  const participantsFor = () =>
    isCtf ? collections.participantsCtf() : collections.participants();
  const accessCodesFor = () =>
    isCtf ? collections.accessCodesCtf() : collections.accessCodes();

  // Extract client IP address for rate limiting
  const forwarded = request.headers.get("x-forwarded-for");
  const clientIp = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isSecure = forwardedProto === "https" || request.url.startsWith("https:");

  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please wait 3 minutes before trying again." },
      { status: 429 }
    );
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

    const teams = await teamsFor();
    const participants = await participantsFor();

    let adminTeam = await teams.findOne({ name: "Admin Team" });
    if (!adminTeam) {
      // Same correction as the participant branch below: the event this admin
      // signed in for. Harmless today because every console excludes "Admin
      // Team" by name, which is the only reason a hardcoded "ctf" here never
      // showed up as a bug — not a property worth depending on.
      const inserted = await teams.insertOne({
        name: "Admin Team",
        nameKey: "admin_team",
        ...(event ? { event } : {}),
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
    res.cookies.set({ ...sessionCookieOptions(isSecure), value: token });
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

    const teams = await teamsFor();
    const participants = await participantsFor();
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

      /**
       * The event this team is actually entering, not the literal "ctf".
       *
       * This branch serves every platform event — the same form is behind
       * hunt.<domain>, ctf.<domain> and code.<domain> — and it used to stamp
       * event:"ctf" on all of them. #49 fixed the sibling half of this bug (the
       * COLLECTION was hardcoded, so hunt teams were written to teams_ctf and
       * every hunt route then failed to find them) and left the label alone, so
       * the symptom came back wearing a different cause: the CTF console
       * selects `teams` on event:"ctf", and a hunt team carrying that stamp is
       * indistinguishable there from a team that actually turned up to the CTF.
       *
       * Omitted rather than guessed when the host tells us nothing — on
       * localhost and ngrok there is no subdomain, and an absent field is
       * honest where "ctf" would be a fabrication that later reads as fact.
       */
      const eventStamp = event ? { event } : {};

      const insertedTeam = await teams.insertOne({
        name: teamNameStr,
        nameKey,
        passwordHash: inputHash,
        ...eventStamp,
        createdAt: new Date(),
      } as any);
      team = {
        _id: insertedTeam.insertedId,
        name: teamNameStr,
        nameKey,
        passwordHash: inputHash,
        ...eventStamp,
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

      // Backfill the event for rows that predate the field — again with the
      // event this login is actually for. Stamping "ctf" here was the more
      // damaging half: it relabelled EXISTING hunt teams on every login, so the
      // CTF console kept refilling with hunt teams after each clean-up.
      if (!team.event && event) {
        await teams.updateOne({ _id: team._id }, { $set: { event } });
        team.event = event;
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

    // Re-materialize CTF leaderboard in background so newly logged-in team appears without blocking login latency
    void materialize("ctf").catch((e) => {
      console.error("[enter] background materialize error:", e);
    });

    const res = NextResponse.json({ ok: true, teamId: team._id!.toString(), role: "participant" });
    res.cookies.set({ ...sessionCookieOptions(isSecure), value: token });
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

    const codesCtf = await accessCodesFor();
    const codesShared = await collections.accessCodes();
    let record = await codesCtf.findOne({ codeHash: hashCode(codeStr) });
    let codes = codesCtf;
    if (!record) {
      record = await codesShared.findOne({ codeHash: hashCode(codeStr) });
      codes = codesShared;
    }

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
    res.cookies.set({ ...sessionCookieOptions(isSecure), value: token });
    return res;
  }

  recordFailedAttempt(clientIp);
  return NextResponse.json({ error: "Please enter Team Name / Code or Admin credentials" }, { status: 400 });
}

async function sessionFor(teamId: ObjectId, participantId: ObjectId, role: "participant" | "admin") {
  return signSession({ sub: participantId.toString(), teamId: teamId.toString(), role });
}

async function quizEntry(
  body: { code?: unknown; coin?: unknown; teamName?: unknown },
): Promise<Response> {
  try {

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

        const record = await codes.findOne({ codeHash: hashCode("1684") });
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

    // ── Coin path: team login (coins 01..MAX_COIN) ───────────────────────────
    if (body.coin === undefined || body.coin === null || body.coin === "") {
      return NextResponse.json({ error: "Enter the number on your coin" }, { status: 400 });
    }

    const parsed = parseCoin(String(body.coin));
    if (parsed === null) {
      return NextResponse.json(
        { error: `Coins are numbered 01 to ${MAX_COIN}` },
        { status: 400 }
      );
    }

    const forCoin = avatarForCoin(parsed);
    if (!forCoin) {
      return NextResponse.json({ error: "That isn't a valid coin" }, { status: 400 });
    }

    const coins = await collections.coins();
    const teams = await collections.teams();
    const participants = await collections.participants();

    const disc = await coins.findOne({ _id: parsed });
    if (!disc || !disc.teamId) {
      return NextResponse.json(
        { error: "🔒 This token has not been assigned to a team yet. Please register with a coordinator!" },
        { status: 403 }
      );
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

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const event = eventFromHost(request.headers.get("host"));
  // No subdomain (localhost / ngrok): fall back to the body's shape. `coin` is
  // unique to the quiz, so it is an unambiguous signal.
  const isQuiz = event === "quiz" || (event === null && body.coin !== undefined);

  return isQuiz
    ? quizEntry(body as { code?: unknown; coin?: unknown; teamName?: unknown })
    : platformEntry(request, body);
}
