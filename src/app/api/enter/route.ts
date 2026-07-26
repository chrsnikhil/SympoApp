import { NextResponse } from "next/server";
import { collections } from "@/lib/db/client";
import { hashCode, signSession, sessionCookieOptions } from "@/lib/auth/session";

/**
 * Redeem a pre-issued access code and mint the cross-subdomain session.
 *
 * The code is looked up BY HASH (indexed, single read) — plaintext codes are
 * never stored, so a database dump doesn't hand out working logins.
 */
export async function POST(request: Request) {
  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Enter your code" }, { status: 400 });
  }

  const codes = await collections.accessCodes();
  const record = await codes.findOne({ codeHash: hashCode(code) });

  // Same message for "no such code" and "wrong code" — don't help someone
  // enumerate valid codes.
  if (!record) {
    return NextResponse.json({ error: "That code isn't valid" }, { status: 401 });
  }

  // First redemption binds the code; later ones just re-issue a session so a
  // participant can log in again on another device.
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
