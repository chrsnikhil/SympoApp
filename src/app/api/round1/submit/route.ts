import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { collections } from "@/lib/db/client";
import { finalizeImageRound, imageRoundDeadline, uploadsLocked } from "@/lib/quiz/imageRound";

const MAX_BYTES = 10_000_000; // 10MB upload limit
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/round1/submit — STORE ONLY.
 *
 * Receives the team's recreation and saves it, replacing whatever it had
 * before. It does NOT judge: no similarity, no score, no call to the
 * evaluator. Teams may re-upload freely until the clock hits zero, and only
 * the last image they leave behind is ever evaluated (see lib/quiz/imageRound).
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;
    const teamId = new ObjectId(teamIdStr);

    let challengeSlug = "prompt-image";
    let dataUrl = "";

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      challengeSlug = (form.get("challengeSlug") as string) || "prompt-image";
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No image file provided" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/jpeg";
      dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    } else {
      let body: { challengeSlug?: string; dataUrl?: string };
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "Malformed JSON request" }, { status: 400 });
      }
      challengeSlug = body.challengeSlug || "prompt-image";
      dataUrl = body.dataUrl || "";
    }

    if (!dataUrl || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "Valid image file or data URL is required" }, { status: 400 });
    }

    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/jpeg";
    if (!ALLOWED.includes(mime)) {
      return NextResponse.json({ error: `Unsupported image format (${mime}). Use JPEG, PNG or WebP.` }, { status: 400 });
    }

    const buffer = Buffer.from(dataUrl.replace(/^data:[^,]+,/, ""), "base64");
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: `Image too large (${Math.round(buffer.length / 1024)}KB). Maximum size is 10MB.` }, { status: 413 });
    }

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: challengeSlug });
    if (!challenge) {
      return NextResponse.json({ error: `Challenge "${challengeSlug}" not found` }, { status: 404 });
    }

    // Uploads close the instant the clock hits zero — after that the team's
    // last image is what gets judged and nothing more can be swapped in.
    if (uploadsLocked(challenge)) {
      return NextResponse.json(
        { error: "Time's up — uploads are closed. Your last submitted image is being judged.", locked: true },
        { status: 403 }
      );
    }

    // STORE ONLY. Nothing is judged while the clock runs: a team may upload as
    // often as it likes and each upload REPLACES the previous one, so exactly
    // one image per team survives to be evaluated when the timer ends.
    // `evaluationClaimedAt` is reset so a replacement is judgeable again.
    const images = await collections.promptImages();
    await images.updateOne(
      { teamId, challengeSlug },
      {
        $set: {
          teamId,
          challengeSlug,
          dataUrl,
          bytes: buffer.length,
          uploadedAt: new Date(),
          evaluationClaimedAt: null,
        },
      },
      { upsert: true }
    );
    const storedImg = await images.findOne({ teamId, challengeSlug });
    const imageId = storedImg?._id;

    const deadline = imageRoundDeadline(challenge);
    console.log(`[image-round] stored upload team=${teamIdStr} q=${challengeSlug} bytes=${buffer.length} (not judged yet)`);

    return NextResponse.json({
      ok: true,
      status: "saved",
      imageId: imageId?.toString(),
      submissionId: imageId?.toString(),
      bytes: buffer.length,
      deadline: deadline ? deadline.toISOString() : null,
      note: "Saved. You can replace it until the timer ends; only your last image is judged.",
    });

  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[round1/submit POST] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to submit image for judging" }, { status: 500 });
  }
}

/**
 * GET /api/round1/submit?challengeSlug={slug}
 *
 * Reports where this team's ONE image stands: saved and waiting for the clock,
 * or judged. Never awards points itself — the finalizer owns scoring.
 *
 * Crossing the deadline is what triggers the round's single evaluation pass;
 * any client poll may set it off, and it is safe for all of them to try
 * because the finalizer claims each team's image atomically.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;
    const teamId = new ObjectId(teamIdStr);

    const { searchParams } = new URL(request.url);
    const challengeSlug = searchParams.get("challengeSlug") || "prompt-image";

    const subs = await collections.submissions();
    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: challengeSlug });
    const gamePoints = challenge?.points ?? 10;

    const images = await collections.promptImages();
    const myImage = await images.findOne({ teamId, challengeSlug });
    const deadline = challenge ? imageRoundDeadline(challenge) : null;
    const locked = challenge ? uploadsLocked(challenge) : false;

    // The clock has run out — run the round's one evaluation pass. Idempotent
    // and single-flight, so the whole field's browsers hitting this in the
    // same second still produce exactly one evaluation per team.
    if (locked && challenge) {
      await finalizeImageRound(challengeSlug);
    }

    const sub = await subs.findOne({ type: "quiz", challengeId: challenge?._id, teamId });

    const meta = (sub?.verdict?.meta ?? {}) as {
      evalStatus?: string;
      similarity?: number;
      modelUsed?: string | null;
      errorMessage?: string;
      watermarkConfidence?: number | null;
    };

    if (meta.evalStatus === "rejected_watermark") {
      return NextResponse.json({
        ok: true,
        status: "rejected_watermark",
        watermarkDetected: true,
        watermarkConfidence: meta.watermarkConfidence ?? null,
        error: "That's the reference image, not your generation — upload the image YOUR AI generated.",
      });
    }

    if (meta.evalStatus === "failed" || sub?.status === "error") {
      return NextResponse.json({
        ok: false,
        status: "failed",
        error: meta.errorMessage || "Image evaluation failed — please upload again",
      });
    }

    if (sub?.status === "done" && sub.verdict) {
      return NextResponse.json({
        ok: true,
        status: "scored",
        similarity: meta.similarity ?? sub.verdict.points / gamePoints,
        // Always the game's own scale, so the number a team reads is the
        // number they were awarded. The service's 0..100 value used to be
        // shown here verbatim: a 9/10 submission displayed as "80".
        final_score: sub.verdict.points,
        max_score: gamePoints,
        model_used: meta.modelUsed ?? "Vision judge",
      });
    }

    // Nothing judged yet. Before the deadline that is the CORRECT state: the
    // image is banked and replaceable, and no evaluator has seen it.
    return NextResponse.json({
      ok: true,
      status: myImage ? (locked ? "judging" : "saved") : "none",
      pending: true,
      locked,
      hasUpload: Boolean(myImage),
      uploadedAt: myImage?.uploadedAt ? new Date(myImage.uploadedAt).toISOString() : null,
      deadline: deadline ? deadline.toISOString() : null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[round1/submit GET] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to fetch submission status" }, { status: 500 });
  }
}
