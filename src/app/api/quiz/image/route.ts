import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";

/**
 * Upload a team's recreation for Round 1's "Image Replication".
 *
 * Images don't go through the submission pipeline — its payload cap is 64KB,
 * three orders of magnitude too small. The image is stored here and the
 * submission carries only its id.
 *
 * One image per team per challenge. Re-uploading replaces the previous one,
 * which is also how a team retries after a failed judging.
 */

const MAX_BYTES = 1_400_000; // Cosmos caps a document ~2MB; leave headroom.
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request) {
  try {
    const session = await requireSession();

    let body: { challengeSlug?: unknown; dataUrl?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed request" }, { status: 400 });
    }

    const { challengeSlug, dataUrl } = body;
    if (typeof challengeSlug !== "string" || !challengeSlug.trim()) {
      return NextResponse.json({ error: "Missing challengeSlug" }, { status: 400 });
    }
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "Expected an image data URL" }, { status: 400 });
    }

    // SVG here would be an upload that can execute script when rendered, and
    // the vision model can't read one as a picture anyway.
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "";
    if (!ALLOWED.includes(mime)) {
      return NextResponse.json({ error: `Upload a JPEG, PNG or WebP — got ${mime || "no type"}` }, { status: 400 });
    }

    const bytes = Buffer.byteLength(dataUrl, "utf8");
    if (bytes > MAX_BYTES) {
      return NextResponse.json(
        { error: `That image is ${Math.round(bytes / 1024)}KB after encoding; the cap is ${Math.round(MAX_BYTES / 1024)}KB.` },
        { status: 413 }
      );
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: challengeSlug });
    if (!challenge || challenge.config.format !== "prompt-image") {
      return NextResponse.json({ error: "That challenge doesn't take an image" }, { status: 404 });
    }

    const teamId = new ObjectId(session.teamId);
    const images = await collections.promptImages();

    await images.updateOne(
      { teamId, challengeSlug },
      { $set: { teamId, challengeSlug, dataUrl, bytes, uploadedAt: new Date() } },
      { upsert: true }
    );

    const stored = await images.findOne({ teamId, challengeSlug });
    return NextResponse.json({ ok: true, imageId: stored?._id?.toString(), bytes });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/image] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
