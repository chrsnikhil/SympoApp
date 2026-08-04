import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireSession, UnauthorizedError } from "@/lib/auth/guard";
import { IMAGE_JUDGE_MODE } from "@/lib/config";
import { collections } from "@/lib/db/client";
import { pollFastApiSubmission, submitToFastApi } from "@/lib/quiz/aiEvalClient";
import { scheduleImageJudging } from "@/lib/quiz/judge";
import { resolvePromptImage } from "@/lib/quiz/scoring";

const MAX_BYTES = 10_000_000; // 10MB upload limit
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/round1/submit
 * Receives the participant's uploaded recreation image.
 * Routes to either SigLIP (FastAPI backend service) or Groq based on IMAGE_JUDGE_MODE.
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

    const teams = await collections.teams();
    const teamDoc = await teams.findOne({ _id: teamId });
    const teamName = teamDoc?.name || `Team ${teamIdStr}`;

    const challenges = await collections.challenges();
    const challenge = await challenges.findOne({ type: "quiz", slug: challengeSlug });
    if (!challenge) {
      return NextResponse.json({ error: `Challenge "${challengeSlug}" not found` }, { status: 404 });
    }

    // Save image into promptImages for persistence and reference
    const images = await collections.promptImages();
    await images.updateOne(
      { teamId, challengeSlug },
      { $set: { teamId, challengeSlug, dataUrl, bytes: buffer.length, uploadedAt: new Date() } },
      { upsert: true }
    );
    const storedImg = await images.findOne({ teamId, challengeSlug });
    const imageId = storedImg?._id;

    if (IMAGE_JUDGE_MODE === "siglip") {
      // MODE 2: FastAPI SigLIP service
      try {
        const fastApiRes = await submitToFastApi(buffer, mime, teamIdStr, teamName);

        // Store active submission record in MongoDB
        const subs = await collections.submissions();
        await subs.updateOne(
          { challengeId: challenge._id, teamId },
          {
            $set: {
              type: "quiz",
              challengeId: challenge._id,
              teamId,
              participantId: new ObjectId(session.sub),
              receivedAt: new Date(),
              status: "running",
              payload: fastApiRes.id, // Store FastAPI submission UUID in payload
              meta: { mode: "siglip", fastApiId: fastApiRes.id },
            },
          },
          { upsert: true }
        );

        return NextResponse.json({
          ok: true,
          submissionId: fastApiRes.id,
          imageId: imageId?.toString(),
          status: "pending",
          mode: "siglip",
        });
      } catch (fastApiErr) {
        console.error("[round1/submit] FastAPI error:", fastApiErr);
        return NextResponse.json(
          { error: fastApiErr instanceof Error ? fastApiErr.message : "AI Evaluation Service unavailable" },
          { status: 502 }
        );
      }
    } else {
      // MODE 1: Groq Vision judging code path
      const subs = await collections.submissions();
      await subs.updateOne(
        { challengeId: challenge._id, teamId },
        {
          $set: {
            type: "quiz",
            challengeId: challenge._id,
            teamId,
            participantId: new ObjectId(session.sub),
            receivedAt: new Date(),
            status: "running",
            payload: imageId?.toString(),
            meta: { mode: "groq" },
          },
        },
        { upsert: true }
      );

      const subDoc = await subs.findOne({ challengeId: challenge._id, teamId });
      if (subDoc?._id) {
        scheduleImageJudging(challenge, teamId, subDoc._id);
      }

      return NextResponse.json({
        ok: true,
        submissionId: subDoc?._id?.toString() || imageId?.toString(),
        imageId: imageId?.toString(),
        status: "pending",
        mode: "groq",
      });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[round1/submit POST] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to submit image for judging" }, { status: 500 });
  }
}

/**
 * GET /api/round1/submit?id={submissionId}&challengeSlug={slug}
 * Polls for the judging result of an uploaded image.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const teamIdStr = session.teamId;
    const teamId = new ObjectId(teamIdStr);

    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("id");
    const challengeSlug = searchParams.get("challengeSlug") || "prompt-image";

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submission ID parameter (?id=...)" }, { status: 400 });
    }

    const teams = await collections.teams();
    const teamDoc = await teams.findOne({ _id: teamId });
    const teamName = teamDoc?.name || `Team ${teamIdStr}`;

    if (IMAGE_JUDGE_MODE === "siglip") {
      // MODE 2: Poll FastAPI SigLIP service
      try {
        const result = await pollFastApiSubmission(submissionId, teamIdStr, teamName);

        if (result.status === "scored") {
          const similarity = result.similarity ?? (result.final_score ? result.final_score / 10 : 0);
          const finalScore = result.final_score ?? Math.round(similarity * 10);

          // Write score into Round 1 score aggregation
          await resolvePromptImage(challengeSlug, { [teamIdStr]: similarity });

          return NextResponse.json({
            ok: true,
            status: "scored",
            similarity,
            final_score: finalScore,
            model_used: result.model_used ?? "SigLIP 2",
          });
        }

        if (result.status === "rejected_watermark") {
          return NextResponse.json({
            ok: true,
            status: "rejected_watermark",
            watermarkDetected: true,
            error: "that's the reference image, not your generation",
          });
        }

        if (result.status === "failed") {
          return NextResponse.json({
            ok: false,
            status: "failed",
            error: result.error_message || "AI image evaluation failed",
          });
        }

        return NextResponse.json({
          ok: true,
          status: result.status, // "pending" or "processing"
          pending: true,
        });
      } catch (err) {
        console.error("[round1/submit GET] FastAPI polling error:", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Error polling AI Evaluation Service" },
          { status: 502 }
        );
      }
    } else {
      // MODE 1: Poll MongoDB submission status for Groq vision judging
      const subs = await collections.submissions();
      const challenges = await collections.challenges();
      const challenge = await challenges.findOne({ type: "quiz", slug: challengeSlug });

      const sub = ObjectId.isValid(submissionId)
        ? await subs.findOne({ _id: new ObjectId(submissionId), teamId })
        : await subs.findOne({ challengeId: challenge?._id, teamId });

      if (sub?.status === "done" && sub.verdict) {
        const similarity = (sub.verdict.meta as { similarity?: number })?.similarity ?? sub.verdict.points / 10;
        return NextResponse.json({
          ok: true,
          status: "scored",
          similarity,
          final_score: sub.verdict.points,
          model_used: "Groq Vision",
        });
      }

      return NextResponse.json({
        ok: true,
        status: sub?.status ?? "pending",
        pending: true,
      });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    console.error("[round1/submit GET] Unexpected error:", err);
    return NextResponse.json({ error: "Failed to fetch submission status" }, { status: 500 });
  }
}
