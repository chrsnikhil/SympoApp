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

    if (!challenge) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    
    let dataUrl = challenge.config.referenceDataUrl;
    
    if (!dataUrl && challenge.config.referenceImage) {
      // Fallback: read from filesystem if not in DB
      const fs = await import("fs");
      const path = await import("path");
      const refPath = path.join(process.cwd(), "public", challenge.config.referenceImage.replace(/^\//, ""));
      if (fs.existsSync(refPath)) {
        const ext = path.extname(refPath).slice(1) || "jpeg";
        dataUrl = `data:image/${ext};base64,${fs.readFileSync(refPath).toString("base64")}`;
      }
    }

    if (!dataUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      { dataUrl },
      { headers: { "Cache-Control": "private, max-age=3600" } }
    );
  } catch (err) {
    console.error("[quiz/round1/reference]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
