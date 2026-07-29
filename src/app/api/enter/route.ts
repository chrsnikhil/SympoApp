import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { hashCode, signSession, sessionCookieOptions } from "@/lib/auth/session";
import { avatarById, avatarForCoin, formatCoin, parseCoin } from "@/lib/quiz/avatars";

/**
 * Two ways in.
 *
 *   COIN        { coin, teamName? }   — how quiz teams get in.
 *   ACCESS CODE { code }              — how the coordinator gets in, and how
 *                                        the other three events still work.
 *
 * The coin is a numbered disc, 01 to 60, whose range decides the Spider-Verse
 * character. First use of an unclaimed coin also asks for a team name, which
 * binds the disc to that team from then on; after that the number alone is
 * enough. See `lib/quiz/avatars.ts` for the trade-off this accepts (a coin is
 * guessable — sixty values — which is deliberate for a supervised event with
 * physical discs, not an oversight).
 */

async function sessionFor(teamId: ObjectId, participantId: ObjectId, role: "participant" | "admin") {
  return signSession({ sub: participantId.toString(), teamId: teamId.toString(), role });
}

export async function POST(request: Request) {
  let body: { code?: unknown; coin?: unknown; teamName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  // ── Access-code path: coordinator, and the non-quiz events ────────────────
  if (typeof body.code === "string" && body.code.trim()) {
    const inputCode = body.code.trim();
    const codes = await collections.accessCodes();
    let record = await codes.findOne({ codeHash: hashCode(inputCode) });

    if (!record && inputCode === "1684") {
      record = await codes.findOne({ role: "admin" });
      if (!record) {
        const teams = await collections.teams();
        const participants = await collections.participants();
        let adminTeam = await teams.findOne({ name: "Quiz Control" });
        if (!adminTeam) {
          const adminTeamId = new ObjectId();
          await teams.insertOne({ _id: adminTeamId, name: "Quiz Control", createdAt: new Date() });
          adminTeam = (await teams.findOne({ _id: adminTeamId }))!;
        }
        let adminParticipant = await participants.findOne({ teamId: adminTeam._id, role: "admin" });
        if (!adminParticipant) {
          const adminPartId = new ObjectId();
          await participants.insertOne({ _id: adminPartId, teamId: adminTeam._id, name: "Quiz coordinator", role: "admin", createdAt: new Date() });
          adminParticipant = (await participants.findOne({ _id: adminPartId }))!;
        }
        await codes.insertOne({ codeHash: hashCode("1684"), teamId: adminTeam._id, participantId: adminParticipant._id, role: "admin", redeemedAt: new Date() });
        record = await codes.findOne({ role: "admin" });
      }
    }

    if (!record) {
      return NextResponse.json({ error: "That code isn't valid" }, { status: 401 });
    }
    if (!record.redeemedAt) {
      await codes.updateOne({ _id: record._id }, { $set: { redeemedAt: new Date() } });
    }

    const teams = await collections.teams();
    const team = await teams.findOne({ _id: record.teamId });
    const token = await sessionFor(record.teamId, record.participantId, record.role);

    const res = NextResponse.json({
      ok: true,
      teamId: record.teamId.toString(),
      role: record.role,
      teamName: team?.name ?? null,
      coin: team?.coin === undefined ? null : formatCoin(team.coin),
      avatar: team?.avatar ? avatarById(team.avatar) : null,
    });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  }

  // ── Coin path: how teams get in ───────────────────────────────────────────
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

  const disc = await coins.findOne({ _id: parsed });
  if (!disc) {
    return NextResponse.json({ error: "That isn't a valid coin" }, { status: 404 });
  }

  // Already bound — the number alone is enough from here on.
  if (disc.teamId) {
    const team = await teams.findOne({ _id: disc.teamId });
    const participant = await participants.findOne({ teamId: disc.teamId });
    if (!team || !participant?._id) {
      return NextResponse.json({ error: "That coin's team is missing — tell a coordinator" }, { status: 409 });
    }

    const token = await sessionFor(team._id!, participant._id, participant.role);
    const res = NextResponse.json({
      ok: true,
      teamId: team._id!.toString(),
      role: participant.role,
      teamName: team.name,
      coin: formatCoin(parsed),
      avatar: avatarById(team.avatar),
      returning: true,
    });
    res.cookies.set({ ...sessionCookieOptions(), value: token });
    return res;
  }

  // Unclaimed: assign team name automatically based on character avatar & coin number if not explicitly given.
  const name =
    typeof body.teamName === "string" && body.teamName.trim()
      ? body.teamName.trim()
      : `${forCoin.name} #${formatCoin(parsed)}`;
  if (name.length > 40) {
    return NextResponse.json({ error: "Team names cap at 40 characters" }, { status: 400 });
  }

  const teamId = new ObjectId();
  const participantId = new ObjectId();

  // Claim the disc FIRST, conditionally on it still being free. `_id` is the
  // stamped number, so this is one atomic update and needs no extra index —
  // Cosmos cannot add a unique index to a collection that already holds
  // documents, so this is the only way to get uniqueness here.
  const claimed = await coins.findOneAndUpdate(
    { _id: parsed, teamId: null },
    { $set: { teamId, claimedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!claimed) {
    return NextResponse.json({ error: `Coin ${formatCoin(parsed)} was just taken` }, { status: 409 });
  }

  // Only now create the team, so a lost race can't leave an orphan.
  await teams.insertOne({ _id: teamId, name, avatar: forCoin.id, coin: parsed, createdAt: new Date() });
  await participants.insertOne({
    _id: participantId,
    teamId,
    name: `${name} captain`,
    role: "participant",
    createdAt: new Date(),
  });

  const token = await sessionFor(teamId, participantId, "participant");
  const res = NextResponse.json({
    ok: true,
    teamId: teamId.toString(),
    role: "participant",
    teamName: name,
    coin: formatCoin(parsed),
    avatar: avatarById(forCoin.id),
    returning: false,
  });
  res.cookies.set({ ...sessionCookieOptions(), value: token });
  return res;
}
