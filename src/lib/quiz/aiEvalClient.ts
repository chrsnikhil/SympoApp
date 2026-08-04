import { AI_EVAL_SERVICE_URL } from "@/lib/config";

export interface FastApiSubmissionResponse {
  id: string;
  challenge_id: string;
  participant_id: string;
  status: "pending" | "processing" | "scored" | "rejected_watermark" | "failed";
}

export interface FastApiSubmissionResult {
  id: string;
  challenge_id: string;
  status: "pending" | "processing" | "scored" | "rejected_watermark" | "failed";
  watermark_detected: boolean;
  watermark_confidence: number | null;
  similarity: number | null;
  final_score: number | null;
  model_used: string | null;
  processing_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Obtain a JWT access token from the FastAPI backend for the specified team.
 * Uses a deterministic email/password per team ID so each team operates as
 * a distinct PARTICIPANT in the FastAPI service.
 */
export async function getFastApiToken(teamId: string, teamName: string): Promise<string> {
  const cached = tokenCache.get(teamId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const baseUrl = AI_EVAL_SERVICE_URL.replace(/\/$/, "");
  const email = `team_${teamId}@sympoapp.local`;
  const password = `pass_${teamId}_sympo26`;

  // 1. Try logging in
  try {
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(5000),
    });

    if (loginRes.ok) {
      const data = (await loginRes.json()) as { access_token: string };
      tokenCache.set(teamId, { token: data.access_token, expiresAt: Date.now() + 30 * 60 * 1000 });
      return data.access_token;
    }
  } catch (err) {
    console.warn("[aiEvalClient] Login check failed, trying registration", err);
  }

  // 2. Register if login didn't succeed
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: teamName || `Team ${teamId}` }),
    signal: AbortSignal.timeout(5000),
  });

  if (!regRes.ok) {
    const errText = await regRes.text();
    throw new Error(`Failed to authenticate with AI Evaluation Service (${regRes.status}): ${errText}`);
  }

  const regData = (await regRes.json()) as { access_token: string };
  tokenCache.set(teamId, { token: regData.access_token, expiresAt: Date.now() + 30 * 60 * 1000 });
  return regData.access_token;
}

/**
 * Retrieve the active challenge ID from the FastAPI backend.
 */
export async function getFastApiChallengeId(token: string): Promise<string> {
  const baseUrl = AI_EVAL_SERVICE_URL.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/challenge`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`Failed to list challenges from AI Evaluation Service (${res.status})`);
  }

  const list = (await res.json()) as Array<{ id: string; title: string }>;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("No active challenges found in the AI Evaluation Service database.");
  }

  return list[0].id;
}

/**
 * Upload an image submission to the FastAPI backend service (POST /api/v1/submission).
 */
export async function submitToFastApi(
  imageBuffer: Buffer,
  mimeType: string,
  teamId: string,
  teamName: string
): Promise<FastApiSubmissionResponse> {
  const baseUrl = AI_EVAL_SERVICE_URL.replace(/\/$/, "");
  const token = await getFastApiToken(teamId, teamName);
  const challengeId = await getFastApiChallengeId(token);

  const formData = new FormData();
  formData.append("challenge_id", challengeId);

  const uint8 = new Uint8Array(imageBuffer);
  const blob = new Blob([uint8], { type: mimeType || "image/jpeg" });
  formData.append("file", blob, "recreation.jpg");

  const res = await fetch(`${baseUrl}/submission`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI Evaluation Service rejected submission (${res.status}): ${errorText}`);
  }

  return (await res.json()) as FastApiSubmissionResponse;
}

/**
 * Poll for submission results from the FastAPI backend service (GET /api/v1/submission/{id}).
 */
export async function pollFastApiSubmission(
  submissionId: string,
  teamId: string,
  teamName: string
): Promise<FastApiSubmissionResult> {
  const baseUrl = AI_EVAL_SERVICE_URL.replace(/\/$/, "");
  const token = await getFastApiToken(teamId, teamName);

  const res = await fetch(`${baseUrl}/submission/${submissionId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`AI Evaluation Service status request failed (${res.status}): ${errorText}`);
  }

  return (await res.json()) as FastApiSubmissionResult;
}
