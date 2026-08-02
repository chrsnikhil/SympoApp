import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { resolvePromptImage } from "@/lib/quiz/scoring";
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

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "openrouter/free";

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
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY);
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
  try {
    require("fs").writeFileSync("c:\\Users\\ponr2\\SympoApp\\groq-error.log", `RAW RESPONSE:\n${raw}\n\n`, { flag: "a" });
  } catch(e) {}
  
  let parsed: unknown;
  try {
    let clean = raw.trim();
    // Remove qwen <think> blocks
    const thinkEnd = clean.indexOf("</think>");
    if (thinkEnd !== -1) {
      clean = clean.substring(thinkEnd + 8).trim();
    }
    
    // sometimes it adds markdown json blocks
    if (clean.startsWith("```json")) {
      clean = clean.substring(7);
    } else if (clean.startsWith("```")) {
      clean = clean.substring(3);
    }
    if (clean.endsWith("```")) {
      clean = clean.substring(0, clean.length - 3);
    }
    parsed = JSON.parse(clean.trim());
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
    "You are a strict, objective judge at a college symposium image-replication contest.",
    "",
    "You will be shown two images:",
    "  IMAGE 1 = the REFERENCE (the original target).",
    "  IMAGE 2 = a team's RECREATION attempt using an AI image generator.",
    "",
    "Your job: score how faithfully IMAGE 2 reproduces IMAGE 1.",
    "",
    "Score each criterion on an INTEGER scale 0-5:",
    "  0 = completely absent / totally wrong",
    "  1 = barely related",
    "  2 = some similarity but major differences",
    "  3 = moderate match with noticeable differences",
    "  4 = close match with only minor differences",
    "  5 = excellent / near-perfect match",
    "",
    "Criteria:",
    ...rubric.map((c) => `  ${c.key} (${c.label}, weight ${c.weight}) — ${c.guidance}`),
    "",
    "CRITICAL RULES — violating these is a judging error:",
    "- If the recreation shows a COMPLETELY DIFFERENT subject or scene from the",
    "  reference, the 'subject' score MUST be 0, and no other criterion may exceed 1.",
    "  A picture of a cat cannot score above 1 on anything if the reference is a landscape.",
    "- If the recreation is the EXACT SAME image as the reference (identical content),",
    "  every criterion MUST score 5.",
    "- Be harsh, not generous. A 3 means 'decent but clearly different'. Reserve 4-5",
    "  for genuinely close reproductions.",
    "- Judge the recreation against the reference ONLY, not against aesthetics or quality.",
    "- Keep each note to one short sentence naming the specific difference.",
    "",
    "Reply with JSON only, in exactly this shape:",
    '{"criteria":[' +
      rubric.map((c) => `{"key":"${c.key}","score":<0-5>,"note":"<one sentence>"}`).join(",") +
      '],"summary":"<one sentence overall>"}',
    "",
    "CRITICAL INSTRUCTION FOR REASONING MODELS: Keep your internal <think> process extremely brief (under 100 words). Output the final JSON immediately.",
    "Every criterion listed above must appear exactly once. Scores must be integers.",
  ].join("\n");
}

export type ImageDataUrl = string;

export async function judgeImage(challenge: Challenge, referenceImage: ImageDataUrl, submittedImage: ImageDataUrl): Promise<JudgeVerdict> {
  const rubric = rubricFor(challenge);

  // Exact image upload check — compare the raw base64 payload after the header
  const refBody = referenceImage.replace(/^data:[^,]+,/, "");
  const subBody = submittedImage.replace(/^data:[^,]+,/, "");
  if (refBody === subBody) {
    const criteria = rubric.map((c) => ({
      key: c.key,
      score: 5,
      note: `Perfect 100% ${c.label.toLowerCase()} match with reference image.`,
    }));
    return {
      similarity: 1.0,
      criteria,
      summary: "Exact 100% match with the reference image.",
    };
  }

  const key = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;

  if (key) {
    // Current working vision models
    const visionModels = [VISION_MODEL];
    for (const model of visionModels) {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { 
            "content-type": "application/json", 
            authorization: `Bearer ${key}`,
            "HTTP-Referer": "https://sympoapp.local",
            "X-Title": "SympoApp Image Judge"
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            model,
            temperature: 0.0,
            max_completion_tokens: 2000,
            messages: [
              { role: "system", content: buildSystem(rubric) },
              {
                role: "user",
                content: [
                  { type: "text", text: "Reference image (the ORIGINAL that the team must replicate):" },
                  { type: "image_url", image_url: { url: referenceImage } },
                  { type: "text", text: "Team's submitted recreation (judge THIS against the reference above):" },
                  { type: "image_url", image_url: { url: submittedImage } },
                  {
                    type: "text",
                    text:
                      "Score the recreation against the reference. " +
                      "If the recreation depicts a COMPLETELY DIFFERENT subject or scene, " +
                      "the subject score MUST be 0 and all other scores should be 0 or 1. " +
                      "Only give high scores (4-5) when the recreation is genuinely close to the reference.",
                  },
                ],
              },
            ],
          }),
        });

        if (response.ok) {
          const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const content = payload.choices?.[0]?.message?.content;
          if (content) {
            const { criteria, summary } = parseVerdict(content, rubric);
            return { similarity: toSimilarity(criteria, rubric), criteria, summary };
          }
        } else {
          const errBody = await response.text();
          console.error(`[judgeImage] Groq error (${model}): HTTP ${response.status}`, errBody);
          try {
            require("fs").writeFileSync(
              "c:\\Users\\ponr2\\SympoApp\\groq-error.log",
              `HTTP ${response.status} ${errBody}\n`,
              { flag: "a" }
            );
          } catch(e) {}
        }
      } catch (e) {
        console.error(`[judgeImage] Groq model (${model}) failed:`, e);
        try {
          require("fs").writeFileSync(
            "c:\\Users\\ponr2\\SympoApp\\groq-error.log",
            `Exception ${e}\n`,
            { flag: "a" }
          );
        } catch(err) {}
      }
    }
  }

  // All vision models failed — throw so the caller knows judging didn't happen.
  // The submission stays queued for retry rather than receiving a fake score.
  throw new JudgeError(
    "Vision API unavailable — all models failed. " +
      (key ? "GROQ_API_KEY is set but every model returned an error." : "GROQ_API_KEY is not set.") +
      " The submission will remain queued for retry."
  );
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

/**
 * Fire-and-forget: grade ONE team's Image Replication submission the moment
 * it's accepted, instead of waiting on a coordinator to click "judge" once
 * everyone's in. This is what makes marking genuinely automatic — every other
 * Round 1 game scores the instant an answer arrives; this is the one that
 * can't (a vision call takes real seconds), so it gets its shot the instant
 * the picture lands rather than sitting queued until someone remembers it.
 *
 * Deliberately not awaited by the caller — `gradeQuiz` has already returned
 * `pending: true` to the team by the time this runs, exactly like the queued
 * state before this existed. Two things are required for this to actually
 * fire: a GROQ_API_KEY and a `referenceDataUrl` on the challenge (set via
 * `scripts/set-reference.ts`). Missing either just leaves the submission
 * queued for the coordinator's manual "Judge Image" button — the automatic
 * path is additive, not a new failure mode.
 *
 * ON FAILURE, THE TEAM RETRIES — same rule as the manual judge route: a
 * judging error releases the queued submission (and the image, so a stale
 * upload doesn't block the retry) rather than leaving a team stuck pending
 * forever on a call that errored.
 */
export function scheduleImageJudging(challenge: Challenge, teamId: ObjectId, submissionId: ObjectId): void {
  if (!judgeAvailable()) return;
  const reference = challenge.config.referenceDataUrl;
  if (!reference) return;

  void runImageJudging(challenge, teamId, submissionId, reference).catch((err) => {
    console.error(`[image-judge] background grading crashed for ${challenge.slug}/${teamId}`, err);
  });
}

async function runImageJudging(challenge: Challenge, teamId: ObjectId, submissionId: ObjectId, reference: string): Promise<void> {
  const [subs, images] = await Promise.all([collections.submissions(), collections.promptImages()]);

  try {
    // "running", not "queued" — the shared submission pipeline (see
    // lib/submission/pipeline.ts) only ever writes "queued" for `code`
    // events. Every other event, including quiz, starts a submission at
    // "running" and leaves it there when the grader returns `pending: true`,
    // only moving to "done" once something resolves it. Filtering on
    // "queued" here would never match a real pending image submission.
    const sub = await subs.findOne({ _id: submissionId, teamId, status: "running" });
    if (!sub?.payload || !ObjectId.isValid(sub.payload)) return;

    const image = await images.findOne({ _id: new ObjectId(sub.payload), teamId, challengeSlug: challenge.slug });
    if (!image) return;

    const verdict = await judgeImage(challenge, reference, image.dataUrl);
    await resolvePromptImage(challenge.slug, { [String(teamId)]: verdict.similarity });
  } catch (err) {
    console.error(`[image-judge] background grading failed for ${challenge.slug}/${teamId} — releasing for retry`, err);
    await subs.deleteOne({ _id: submissionId, teamId, status: "running" }).catch((cleanupErr) => {
      console.error(`[image-judge] release-for-retry cleanup failed for ${challenge.slug}/${teamId}`, cleanupErr);
    });
  }
}
