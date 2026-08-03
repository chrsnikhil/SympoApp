import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", "config.format": "prompt-image" });
    
    if (!challenge || !challenge.config.referenceDataUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      { dataUrl: challenge.config.referenceDataUrl },
      { headers: { "Cache-Control": "private, max-age=3600" } }
    );
  } catch (err) {
    console.error("[quiz/round1/reference]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
