import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";

export async function POST() {
  try {
    await requireSession();

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const response = NextResponse.json({
      status: "DISPATCHED",
      channel: "spider-society-auth-v2",
      generated_otp: otp,
      timestamp: new Date().toISOString(),
      instruction: "Inspect this Network tab response payload to copy the generated_otp.",
    });

    // Also include in header for DevTools Headers tab inspection
    response.headers.set("X-Spider-OTP", otp);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return response;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to generate OTP" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
