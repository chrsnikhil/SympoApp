import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/auth/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    ...sessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return res;
}

export async function GET() {
  const res = NextResponse.redirect(new URL("/enter", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  res.cookies.set({
    ...sessionCookieOptions(),
    value: "",
    maxAge: 0,
  });
  return res;
}
