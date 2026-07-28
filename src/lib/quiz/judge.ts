import type { Challenge } from "@/lib/db/types";

/**
 * Vision judge for Round 1 "Image Replication" — Groq.
 *
 * Teams recreate a reference image with an AI image generator (the ONE game
 * in the whole quiz where that's allowed) and upload the result. This sends
 * BOTH images to a vision model and scores the recreation against a rubric.
 * It grades the picture, which is what the game is actually about; grading
 * the prompt text instead would reward describing the image well rather than
 * reproducing it.
 *
 * ON FAILURE, THE TEAM RETRIES. A judging error doesn't award a fallback score
 * and doesn't hand the round to a human scorer — the submission is released so
 * the team submits again. That keeps every score in the round produced the
 * same way, which is what makes them comparable.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export interface Criterion {
  key: string;
  label: string;
  weight: number;
  guidance: string;
}

export const DEFAULT_RUBRIC: readonly Criterion[] = [
  {
    key: "subject",
    label: "Subject",
    weight: 3,
    guidance:
      "Is the same thing depicted, doing the same thing? Wrong or missing subject is the most " +
      "expensive error — nothing else rescues it.",
  },
  {
    key: "composition",
    label: "Composition",
    weight: 2,
    guidance: "Camera angle, framing, where the subject sits in frame, and the foreground/background relationship.",
  },
  {
    key: "colour",
    label: "Colour and light",
    weight: 2,
    guidance: "Palette, lighting direction and quality, contrast, overall mood.",
  },
  {
    key: "style",
    label: "Style and medium",
    weight: 2,
    guidance: "Rendering style and medium — photographic vs illustrated, line weight, texture, era.",
  },
  {
    key: "detail",
    label: "Detail fidelity",
    weight: 1,
    guidance: "Specific elements from the reference that carried over: props, signage, background features.",
  },
] as const;

export interface CriterionScore {
  key: string;
  score: number; // 0..5
  note: string;
}

export interface JudgeVerdict {
  similarity: number; // 0..1
  criteria: CriterionScore[];
  summary: string;
}

export class JudgeError extends Error {
  constructor(message: string, readonly teamId?: string) {
    super(message);
    this.name = "JudgeError";
  }
}

export function judgeAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

function rubricFor(challenge: Challenge): readonly Criterion[] {
  const custom = challenge.config.rubric;
  return custom && custom.length > 0 ? custom : DEFAULT_RUBRIC;
}

export function toSimilarity(scores: CriterionScore[], rubric: readonly Criterion[]): number {
  const byKey = new Map(rubric.map((c) => [c.key, c.weight]));
  let weighted = 0;
  let total = 0;
  for (const s of scores) {
    const weight = byKey.get(s.key) ?? 0;
    weighted += Math.min(5, Math.max(0, s.score)) * weight;
    total += 5 * weight;
  }
  return total === 0 ? 0 : Math.round((weighted / total) * 1000) / 1000;
}

function parseVerdict(raw: string, rubric: readonly Criterion[]): { criteria: CriterionScore[]; summary: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JudgeError("Judge returned text that isn't JSON");
  }

  const obj = parsed as { criteria?: unknown; summary?: unknown };
  if (!Array.isArray(obj.criteria)) throw new JudgeError("Judge response has no criteria array");

  const wanted = new Set(rubric.map((c) => c.key));
  const seen = new Map<string, CriterionScore>();

  for (const entry of obj.criteria) {
    const c = entry as { key?: unknown; score?: unknown; note?: unknown };
    if (typeof c.key !== "string" || !wanted.has(c.key)) continue;
    if (typeof c.score !== "number" || !Number.isFinite(c.score)) {
      throw new JudgeError(`Criterion "${c.key}" has a non-numeric score`);
    }
    if (c.score < 0 || c.score > 5) throw new JudgeError(`Criterion "${c.key}" scored ${c.score}, outside 0-5`);
    seen.set(c.key, { key: c.key, score: Math.round(c.score), note: typeof c.note === "string" ? c.note : "" });
  }

  const missing = [...wanted].filter((k) => !seen.has(k));
  if (missing.length > 0) throw new JudgeError(`Judge skipped criteria: ${missing.join(", ")}`);

  return { criteria: rubric.map((c) => seen.get(c.key)!), summary: typeof obj.summary === "string" ? obj.summary : "" };
}

function buildSystem(rubric: readonly Criterion[]): string {
  return [
    "You are judging a live competition round at a college symposium.",
    "",
    "You will be shown two images. The FIRST is the reference. The SECOND is a",
    "team's attempt to recreate it using an AI image generator. Score how well",
    "the second reproduces the first.",
    "",
    "Score each criterion 0-5, where 0 is absent and 5 is an excellent match:",
    ...rubric.map((c) => `  ${c.key} (${c.label}) — ${c.guidance}`),
    "",
    "Rules:",
    "- Judge the recreation against the reference, not against your own taste.",
    "  A faithful copy of an ugly image scores high.",
    "- Be consistent: the same pair of images must always receive the same scores.",
    "- Keep each note to one short sentence naming the specific difference.",
    "",
    "Reply with JSON only, in exactly this shape:",
    '{"criteria":[' +
      rubric.map((c) => `{"key":"${c.key}","score":<0-5>,"note":"<one sentence>"}`).join(",") +
      '],"summary":"<one sentence overall>"}',
    "",
    "Every criterion listed above must appear exactly once.",
  ].join("\n");
}

export type ImageDataUrl = string;

export async function judgeImage(challenge: Challenge, referenceImage: ImageDataUrl, submittedImage: ImageDataUrl): Promise<JudgeVerdict> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new JudgeError("GROQ_API_KEY is not set");

  const rubric = rubricFor(challenge);

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: 1500,
        messages: [
          { role: "system", content: buildSystem(rubric) },
          {
            role: "user",
            content: [
              { type: "text", text: "Reference image:" },
              { type: "image_url", image_url: { url: referenceImage } },
              { type: "text", text: "The team's recreation:" },
              { type: "image_url", image_url: { url: submittedImage } },
              { type: "text", text: "Score the recreation against the reference." },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    throw new JudgeError(`Could not reach Groq: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new JudgeError(`Groq returned ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new JudgeError("Groq returned an empty response");

  const { criteria, summary } = parseVerdict(content, rubric);
  return { similarity: toSimilarity(criteria, rubric), criteria, summary };
}

export interface JudgedSubmission {
  teamId: string;
  image: ImageDataUrl;
}

export interface JudgeResult extends JudgeVerdict {
  teamId: string;
  rank: number;
}

export interface JudgeBatch {
  judged: JudgeResult[];
  failed: Array<{ teamId: string; reason: string }>;
}

export async function judgeAll(challenge: Challenge, referenceImage: ImageDataUrl, submissions: JudgedSubmission[]): Promise<JudgeBatch> {
  const settled = await Promise.all(
    submissions.map(async (s) => {
      try {
        return { teamId: s.teamId, verdict: await judgeImage(challenge, referenceImage, s.image) };
      } catch (err) {
        return { teamId: s.teamId, reason: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  const judged = settled
    .filter((r): r is { teamId: string; verdict: JudgeVerdict } => "verdict" in r)
    .map((r) => ({ teamId: r.teamId, ...r.verdict }))
    .sort((a, b) => b.similarity - a.similarity)
    .map((v, i) => ({ ...v, rank: i + 1 }));

  const failed = settled
    .filter((r): r is { teamId: string; reason: string } => "reason" in r)
    .map((r) => ({ teamId: r.teamId, reason: r.reason }));

  return { judged, failed };
}
