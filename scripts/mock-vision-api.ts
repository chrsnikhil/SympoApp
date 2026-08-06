/**
 * Counting stand-in for the OpenAI-compatible vision endpoint that
 * `lib/quiz/judge.ts` calls (OpenRouter / Groq).
 *
 * Point VISION_API_URL at this to test the Game 1 flow deterministically:
 * it counts every request, so "exactly one evaluation per team" becomes a
 * measurable fact rather than an assumption, and it costs no free-tier quota.
 *
 *   npx tsx scripts/mock-vision-api.ts [port]
 *
 * Outcome is driven by a marker inside the SECOND image (the team's upload):
 *   "MOCK_SIM=0.62"  -> that similarity across all rubric criteria
 *   "MOCK_CHEAT"     -> cheating_detected, every criterion 0
 *   otherwise        -> similarity 0.80
 *
 * GET /__stats returns the per-request call log for assertions.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.argv[2] ?? 877);

interface CallRecord { at: string; model: string; imageBytes: number[]; marker: string }
const calls: CallRecord[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** The rubric keys judge.ts insists on seeing back. */
const KEYS = ["subject", "composition", "colour", "style", "detail"];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/__stats") {
    const body = JSON.stringify({ total: calls.length, calls });
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(body);
  }

  if (req.method === "POST" && url.pathname === "/__reset") {
    calls.length = 0;
    res.writeHead(200, { "content-type": "application/json" });
    return res.end('{"ok":true}');
  }

  if (req.method !== "POST") {
    res.writeHead(404);
    return res.end("not found");
  }

  const raw = await readBody(req);
  let payload: { model?: string; messages?: Array<{ content?: unknown }> };
  try {
    payload = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    return res.end('{"error":"bad json"}');
  }

  // Pull the two data: URLs out of the user message; the SECOND is the team's.
  const images: string[] = [];
  for (const m of payload.messages ?? []) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content as Array<{ type?: string; image_url?: { url?: string } }>) {
      if (part.type === "image_url" && part.image_url?.url) images.push(part.image_url.url);
    }
  }

  const submitted = images[1] ?? images[0] ?? "";
  const decoded = Buffer.from(submitted.replace(/^data:[^,]+,/, ""), "base64").toString("latin1");

  let similarity = 0.8;
  let cheating = false;
  let marker = "default";

  if (decoded.includes("MOCK_CHEAT")) {
    cheating = true;
    marker = "MOCK_CHEAT";
  } else {
    const m = /MOCK_SIM=([0-9.]+)/.exec(decoded);
    if (m) {
      similarity = Number(m[1]);
      marker = `MOCK_SIM=${m[1]}`;
    }
  }

  calls.push({
    at: new Date().toISOString(),
    model: payload.model ?? "?",
    imageBytes: images.map((i) => i.length),
    marker,
  });

  // judge.ts derives similarity from the weighted rubric, so emit per-criterion
  // scores that average back to the similarity we want.
  const per = Math.round(Math.min(10, Math.max(0, similarity * 10)));
  const verdict = {
    cheating_detected: cheating,
    cheating_reason: cheating ? "Mock detected a reference re-upload." : null,
    cheating_confidence: cheating ? "high" : null,
    criteria: KEYS.map((key) => ({ key, score: cheating ? 0 : per, note: `mock ${key} note` })),
    summary: cheating ? "Mock: submission is the reference image." : `Mock: recreation at ~${similarity}.`,
  };

  const body = JSON.stringify({
    id: "mock-completion",
    choices: [{ message: { content: JSON.stringify(verdict) } }],
  });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(body);
});

server.listen(PORT, () => {
  console.log(`[mock-vision] listening on http://localhost:${PORT}/chat/completions`);
});
