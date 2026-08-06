import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { appendScore } from "@/lib/score/ledger";

/**
 * Upload a team's recreation for Round 1's "Image Replication".
 *
 * Images don't go through the submission pipeline — its payload cap is 64KB,
 * three orders of magnitude too small. The image is stored here and the
 * submission carries only its id.
 *
 * One image per team per challenge. Re-uploading replaces the previous one,
 * which is also how a team retries after a failed judging.
 *
 * The window stays open for the game's full duration (see `round1Phase` —
 * a team doesn't move on just because it submitted), so DELETE lets a team
 * withdraw its current attempt and upload a different one while there's
 * still time left, rather than being stuck with the first thing it tried.
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

/**
 * Withdraw the current submission so a team can try a different image while
 * the window is still open. If the withdrawn attempt had already been
 * judged and scored, this appends a compensating negative ledger row rather
 * than editing history — same append-only discipline as the rest of the
 * score ledger. The uploaded image itself is left in place; the next upload
 * overwrites it via the same upsert POST already does.
 */
export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const challengeSlug = url.searchParams.get("challengeSlug");
    if (!challengeSlug) {
      return NextResponse.json({ error: "Missing challengeSlug" }, { status: 400 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: challengeSlug });
    if (!challenge || challenge.config.format !== "prompt-image") {
      return NextResponse.json({ error: "That challenge doesn't take an image" }, { status: 404 });
    }
    if (challenge.closesAt && new Date() > challenge.closesAt) {
      return NextResponse.json({ error: "This window has closed — too late to change your submission" }, { status: 409 });
    }

    const teamId = new ObjectId(session.teamId);
    const subs = await collections.submissions();
    const existing = await subs.findOne({ challengeId: challenge._id, teamId });
    if (!existing) {
      return NextResponse.json({ ok: true, hadSubmission: false });
    }

    if (existing.status === "done" && (existing.verdict?.points ?? 0) > 0) {
      await appendScore({
        teamId,
        event: "quiz",
        points: -existing.verdict!.points,
        reason: `quiz:${challengeSlug}`,
        submissionId: existing._id,
        at: new Date(),
      });
    }

    await subs.deleteOne({ _id: existing._id });
    return NextResponse.json({ ok: true, hadSubmission: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[quiz/image DELETE] unexpected", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
