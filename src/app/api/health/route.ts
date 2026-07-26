import { NextResponse } from "next/server";

/** Liveness probe for Container Apps. Deliberately touches nothing. */
export function GET() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
