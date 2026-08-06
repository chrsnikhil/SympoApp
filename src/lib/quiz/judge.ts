import { ObjectId } from "mongodb";
import { IMAGE_JUDGE_MODELS } from "@/lib/config";
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

// `||` not `??`: an env var set to an empty string is a misconfiguration, not
// a deliberate override, and `?? ` would happily pass "" through to fetch().
const API_URL = process.env.VISION_API_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions";

/**
 * The model id was hardcoded to "openrouter/free" — an auto-router alias that
 * resolves to a different model on every call, which is why the error log is
 * full of `json_validate_failed`: some of the models it picked couldn't hold
 * the JSON contract. Pinned ids from IMAGE_JUDGE_MODEL replace it, tried in
 * order so a rate-limited free model falls through to the next instead of
 * failing the whole judging pass.
 */
const VISION_MODELS = IMAGE_JUDGE_MODELS;

export interface Criterion {
  key: string;
  label: string;
  weight: number;
  guidance: string;
}

/**
 * The rubric. Nine criteria, each scored 0-10, combined by weight.
 *
 * WHY NINE AND NOT FIVE. The mark's resolution is bounded by the weights, not
 * by how many decimals it is printed to: with integer per-criterion scores the
 * weighted total can only land on `(sum of weights) * 10 + 1` distinct values.
 * The previous five criteria summed to weight 10 — exactly 101 possible scores,
 * so across a 60-team field ties were near-certain however many decimal places
 * the number carried. These weights sum to 23, giving 231 distinct totals, and
 * the uneven spread (5,4,3,3,2,2,2,1,1) means different combinations of
 * criteria land on different totals far more often than they collide.
 *
 * It is also a better rubric on its own terms. Each entry is a question a judge
 * can answer by looking, and a model asked nine specific questions produces
 * more defensible scores than one asked for a single overall impression. Every
 * digit of the final mark traces back to a judgement that was actually made,
 * which is what matters when a team disputes their score.
 */
export const DEFAULT_RUBRIC: readonly Criterion[] = [
  {
    key: "subject",
    label: "Subject",
    weight: 5,
    guidance:
      "Is the same thing depicted, doing the same thing? Wrong or missing subject is the most " +
      "expensive error — nothing else rescues it. Score 0 if the subject is unrelated.",
  },
  {
    key: "composition",
    label: "Composition and framing",
    weight: 4,
    guidance:
      "Camera angle, crop, where the subject sits in frame, and the foreground/background " +
      "relationship. Judge the arrangement, not the content.",
  },
  {
    key: "colour",
    label: "Colour palette",
    weight: 3,
    guidance:
      "Dominant hues and their relative proportions. A recreation in the right colours but the " +
      "wrong arrangement still scores here.",
  },
  {
    key: "lighting",
    label: "Lighting and contrast",
    weight: 3,
    guidance:
      "Direction and hardness of the light, where highlights and shadows fall, overall contrast " +
      "range. Judged apart from palette: an image can match the colours and miss the light.",
  },
  {
    key: "style",
    label: "Style and medium",
    weight: 2,
    guidance:
      "Rendering style and medium — photographic vs illustrated vs 3D, line weight, brush or " +
      "grain texture, apparent era.",
  },
  {
    key: "pose",
    label: "Pose and gesture",
    weight: 2,
    guidance:
      "If the subject is a figure or creature: stance, limb positions, facing, expression. Score " +
      "5 when the reference has no clearly posed subject, so this neither helps nor hurts.",
  },
  {
    key: "background",
    label: "Background and setting",
    weight: 2,
    guidance:
      "The environment behind and around the subject: location, depth, what fills the space. A " +
      "correct subject on a blank background loses marks here and nowhere else.",
  },
  {
    key: "detail",
    label: "Detail fidelity",
    weight: 1,
    guidance:
      "Specific elements carried over from the reference: props, signage, patterns, background " +
      "features. Reward precise reproduction of small things.",
  },
  {
    key: "balance",
    label: "Visual weight and balance",
    weight: 1,
    guidance:
      "How mass is distributed — symmetry, negative space, where the eye is drawn first. Distinct " +
      "from framing: an image can be cropped alike yet feel differently weighted.",
  },
] as const;

export interface CriterionScore {
  key: string;
  score: number; // 0..10
  note: string;
}

export interface JudgeVerdict {
  cheating_detected: boolean;
  cheating_reason: string | null;
  cheating_confidence: "low" | "medium" | "high" | null;
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
  return Boolean((process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY) && VISION_MODELS.length > 0);
}

function rubricFor(challenge: Challenge): readonly Criterion[] {
  const custom = challenge.config.rubric;
  return custom && custom.length > 0 ? custom : DEFAULT_RUBRIC;
}

export function toSimilarity(cheating_detected: boolean, scores: CriterionScore[], rubric: readonly Criterion[]): number {
  if (cheating_detected) return 0;
  
  const byKey = new Map(rubric.map((c) => [c.key, c.weight]));
  let weighted = 0;
  let total = 0;
  for (const s of scores) {
    const weight = byKey.get(s.key) ?? 0;
    weighted += Math.min(10, Math.max(0, s.score)) * weight;
    total += 10 * weight; // Max score is 10 per weight
  }
  // Four decimal places. Note this does not CREATE precision — the resolution
  // comes from the rubric's weights (see DEFAULT_RUBRIC), and rounding here
  // only avoids carrying float noise like 0.7391304347826086 into the ledger
  // and the admin export.
  return total === 0 ? 0 : Math.round((weighted / total) * 10_000) / 10_000;
}

function parseVerdict(raw: string, rubric: readonly Criterion[]): Omit<JudgeVerdict, "similarity"> {
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

  const obj = parsed as { 
    cheating_detected?: unknown; 
    cheating_reason?: unknown;
    cheating_confidence?: unknown;
    criteria?: unknown; 
    summary?: unknown 
  };
  
  if (!Array.isArray(obj.criteria)) throw new JudgeError("Judge response has no criteria array");

  const wanted = new Set(rubric.map((c) => c.key));
  const seen = new Map<string, CriterionScore>();

  for (const entry of obj.criteria) {
    const c = entry as { key?: unknown; score?: unknown; note?: unknown };
    if (typeof c.key !== "string" || !wanted.has(c.key)) continue;
    if (typeof c.score !== "number" || !Number.isFinite(c.score)) {
      throw new JudgeError(`Criterion "${c.key}" has a non-numeric score`);
    }
    if (c.score < 0 || c.score > 10) throw new JudgeError(`Criterion "${c.key}" scored ${c.score}, outside 0-10`);
    seen.set(c.key, { key: c.key, score: Math.round(c.score), note: typeof c.note === "string" ? c.note : "" });
  }

  const missing = [...wanted].filter((k) => !seen.has(k));
  if (missing.length > 0) throw new JudgeError(`Judge skipped criteria: ${missing.join(", ")}`);

  return { 
    cheating_detected: Boolean(obj.cheating_detected),
    cheating_reason: typeof obj.cheating_reason === "string" ? obj.cheating_reason : null,
    cheating_confidence: (obj.cheating_confidence === "low" || obj.cheating_confidence === "medium" || obj.cheating_confidence === "high") ? obj.cheating_confidence : null,
    criteria: rubric.map((c) => seen.get(c.key)!), 
    summary: typeof obj.summary === "string" ? obj.summary : "" 
  };
}

function buildSystem(rubric: readonly Criterion[]): string {
  return [
    "You are a strict, meticulous judge at a college symposium AI-image-replication contest. Thousands of rupees in prizes and team rankings depend on your accuracy. You must be fair, consistent, and impossible to fool.",
    "",
    "You will be shown two images:",
    "IMAGE 1 = the REFERENCE (the original target, watermarked with team name and timestamp for traceability).",
    "IMAGE 2 = a team's RECREATION attempt, claimed to be generated fresh by an AI image generator during the contest window.",
    "",
    "Your job has TWO phases, in strict order. Do not skip or reorder them.",
    "",
    "═══════════════════════════════════",
    "PHASE 1 — INTEGRITY CHECK (mandatory, before any scoring)",
    "═══════════════════════════════════",
    "Examine IMAGE 2 closely for ANY sign it is not an independent, freshly-generated AI image. Check for:",
    "",
    "A) Watermark/traceability leakage — repeating diagonal text, team name text, tiling text patterns, timestamp overlays (e.g. clock-style stamps), any text overlay not naturally part of an AI-generated scene.",
    "",
    "B) Screen/UI capture artifacts — countdown timers, banner headers, buttons, scrollbars, cursor or pointer icons, app borders, browser chrome, \"Reference/Display\" style UI frames.",
    "",
    "C) Photograph-of-a-screen artifacts — moiré/pixel-grid interference patterns, screen glare or reflection, phone bezel edges, keystone/trapezoid distortion from an off-angle photo, visible screen pixel subpixel structure.",
    "",
    "D) Near-duplication — IMAGE 2 matches IMAGE 1 pixel-for-pixel or near-pixel-for-pixel: identical fine detail, identical noise/grain pattern, identical exact object placement down to compression artifacts. Genuine independent AI generations essentially never reproduce a reference this precisely — extreme similarity is itself evidence of copying, not evidence of a great recreation.",
    "",
    "E) Inconsistent generation signature — parts of the image look like genuine AI-model output (soft gradients, generative texture) while other parts look like flat scan/photo compression, suggesting an edited composite or partial screenshot.",
    "",
    "F) Any visible fragment of a watermark, timestamp digit, or UI element even if partially cropped, faded, or overlapped by other content — partial evidence still counts.",
    "",
    "If ANY of A–F is present, even faintly:",
    "- \"cheating_detected\": true",
    "- \"cheating_reason\": one short sentence naming exactly what you saw and where (e.g. \"faint diagonal watermark text visible in upper-left sky area\")",
    "- \"cheating_confidence\": \"low\" | \"medium\" | \"high\" — how certain you are this is a genuine violation vs. a coincidental artifact",
    "- Every criterion score = 0",
    "- Skip Phase 2 entirely",
    "",
    "If NONE of A–F is present:",
    "- \"cheating_detected\": false",
    "- \"cheating_reason\": null",
    "- \"cheating_confidence\": null",
    "- Proceed to Phase 2",
    "",
    "Do not give benefit of the doubt. A faint or partial trace is still a trace. When uncertain between \"artifact of AI generation\" and \"artifact of screenshotting,\" treat repeating/structured patterns (text-like, grid-like, or tiling) as cheating evidence, and treat one-off random noise as innocent.",
    "",
    "═══════════════════════════════════",
    "PHASE 2 — SIMILARITY SCORING (only if cheating_detected = false)",
    "═══════════════════════════════════",
    "Score each criterion below as an INTEGER 0–10, using these anchors — do not interpolate loosely, pick the anchor that best fits:",
    "",
    "0     = Completely absent. Zero resemblance on this criterion.",
    "1–2   = Barely related. Only a vague, coincidental echo.",
    "3–4   = Some real similarity but major, obvious differences a viewer would immediately notice.",
    "5–6   = Moderate match. Recognizably attempting the same thing, but clearly distinguishable from the reference in this criterion.",
    "7–8   = Close match. Small, nitpicky differences only — a casual viewer might not notice them.",
    "9–10  = Excellent to near-perfect. Virtually indistinguishable on this criterion.",
    "",
    "Criteria:",
    ...rubric.map((c) => `  ${c.key} (${c.label}, weight ${c.weight}) — ${c.guidance}`),
    "",
    "CRITICAL RULES — violating any of these is a judging error:",
    "1. Phase 1 overrides everything. If cheating_detected is true, all scores are 0, no exceptions, no matter how good the \"recreation\" looks.",
    "2. SUBJECT MISMATCH RULE: if IMAGE 2 depicts a different subject, character, setting, or scene category than IMAGE 1 (e.g. reference has superheroes on a rooftop, recreation has an unrelated animal, landscape, or object), the 'subject' criterion MUST be 0, and no other criterion may score above 2 — regardless of incidental color/mood similarity.",
    "3. EXACT MATCH RULE: only score all-10s if IMAGE 2 is confirmed independently generated (Phase 1 passed) AND is a startlingly close match. This should be rare.",
    "4. NO GRADE INFLATION: default to the lower anchor when torn between two bands. A \"pretty good but off in three ways\" is a 5-6, not a 7. Reserve 9-10 for cases you'd show as a \"wow\" example.",
    "5. SCORE INDEPENDENTLY PER CRITERION: do not let a high score on one criterion pull up your score on another. A recreation can nail \"color palette\" (9) while completely failing \"pose/composition\" (2). Do not average them in your head before scoring each one.",
    "6. NO EXTERNAL AESTHETICS: never reward IMAGE 2 for looking \"good\" or \"high quality\" in a vacuum. Only fidelity to IMAGE 1 matters. A technically gorgeous image that ignores the reference scores low.",
    "7. NOTES MUST BE SPECIFIC: each note must name one concrete, checkable visual difference (e.g. \"portal is orange, not blue\" or \"only one figure present, reference has four\"), not a vague statement like \"somewhat different.\"",
    "8. INTERNAL CONSISTENCY CHECK: before finalizing, verify your summary sentence agrees with your individual scores. If your summary says \"very close match\" but your scores average below 5, revise one or the other — do not submit contradictory output.",
    "",
    "Reply with JSON only, in exactly this shape, no markdown fences, no preamble:",
    '{"cheating_detected": <true|false>, "cheating_reason": "<string or null>", "cheating_confidence": "<low|medium|high|null>", "criteria":[' +
      rubric.map((c) => `{"key":"${c.key}","score":<0-10>,"note":"<one sentence, specific>"}`).join(",") +
      '],"summary":"<one honest sentence overall>"}',
  ].join("\n");
}

export type ImageDataUrl = string;

/**
 * How hard to lean on a throttled vision API before giving up on a model.
 *
 * This matters more than it looks. The account has exactly ONE vision model —
 * Groq withdrew the llama-4 vision ids, and qwen is the only remaining id that
 * accepts image content — so the model loop below has no second model to fall
 * through to. A 429 that is not retried here is a team that gets no score.
 * That is precisely the failure the IMAGE_JUDGE_MODEL comment warns about:
 * "a Round 1 judging pass that dies on the first rate limit loses the whole
 * game's scores."
 */
export const RETRY_ATTEMPTS = 4;
export const RETRY_BASE_MS = 800;
export const RETRY_MAX_MS = 8_000;

/**
 * Free-tier limits are per-minute, so the way to lose a round is to fire every
 * team's image at once and have the back half rejected together. A modest
 * ceiling keeps a 60-team batch inside the quota for a few seconds of extra
 * wall clock that nobody is watching — judging already runs behind a "pending"
 * state.
 */
const JUDGE_CONCURRENCY = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry throttling and transient server errors; never a 4xx we caused. */
export function isRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * `Retry-After` is honoured when present — it is the only source that knows the
 * real quota window, and guessing shorter just burns another attempt. Otherwise
 * exponential backoff WITH jitter: without jitter, a batch throttled at the
 * same instant retries at the same instant and throttles again in lockstep.
 */
export function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_MAX_MS);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), RETRY_MAX_MS);
  }
  const backoff = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  return backoff / 2 + Math.random() * (backoff / 2);
}

/**
 * Run `fn` over `items` with at most `limit` in flight. Results keep input
 * order regardless of completion order, since the caller pairs results back to
 * teams positionally before ranking.
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function judgeImage(challenge: Challenge, referenceImage: ImageDataUrl, submittedImage: ImageDataUrl): Promise<JudgeVerdict> {
  const rubric = rubricFor(challenge);

  // Re-uploading the reference image itself is the single most obvious cheat
  // in this game, and it used to score 1.0 — full marks — because the byte
  // match was treated as a "perfect recreation" with cheating_detected false.
  // It is a copy, not a recreation: it scores zero, like every other detected
  // copy.
  const refBody = referenceImage.replace(/^data:[^,]+,/, "");
  const subBody = submittedImage.replace(/^data:[^,]+,/, "");
  if (refBody === subBody) {
    return {
      similarity: 0,
      criteria: rubric.map((c) => ({ key: c.key, score: 0, note: "Submission is the reference image itself." })),
      summary: "Submitted file is byte-for-byte identical to the reference image.",
      cheating_detected: true,
      cheating_reason: "Exact byte match with the reference image — this is the reference, not a generation.",
      cheating_confidence: "high",
    };
  }

  const key = process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;

  if (VISION_MODELS.length === 0) {
    throw new JudgeError(
      "IMAGE_JUDGE_MODEL is not set — the vision judge has no model to call. " +
        "Set it to one or more vision-capable model ids (comma-separated); " +
        "`npx tsx --env-file=.env.local scripts/find-vision-model.ts` lists ones your key can use."
    );
  }

  if (key) {
    // Current working vision models
    for (const model of VISION_MODELS) {
      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
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
            /**
             * Stop the model reasoning at all.
             *
             * The only vision model Groq exposes to this account,
             * qwen/qwen3.6-27b, is a reasoning model: left alone it emits a
             * long chain of thought before answering, and with a 2000-token
             * budget and a nine-criterion rubric to fill in it was running out
             * mid-thought. The reply came back `content: ""` with
             * `finish_reason: "length"`, so the parser threw "Judge returned
             * text that isn't JSON". That is the error filling the old
             * groq-error.log — never a prompt problem.
             *
             * `reasoning_effort: "none"`, NOT `reasoning_format: "hidden"`.
             * The latter looks like the obvious fix and is a trap: it hides the
             * reasoning from the response while the model still generates it
             * and still spends the budget on it. Measured on the pair that was
             * failing — hidden: 2000 reasoning tokens, empty content, truncated;
             * effort none: 0 reasoning tokens, finish_reason "stop", full answer
             * inside the same 2000. Judging is a rubric fill-in, not a problem
             * that needs deliberation.
             *
             * Groq-specific, so it is only sent to Groq — OpenAI-compatible
             * endpoints differ on whether an unknown field is ignored or
             * rejected, and a 400 here would take the judge down entirely.
             * `parseVerdict` still strips `</think>` as a fallback for any
             * model that reasons anyway.
             */
            ...(API_URL.includes("api.groq.com") ? { reasoning_effort: "none" } : {}),
            messages: [
              { role: "system", content: buildSystem(rubric) },
              {
                role: "user",
                content: [
                  { type: "text", text: "Reference image (the ORIGINAL that the team must replicate, watermarked with team name/timestamp):" },
                  { type: "image_url", image_url: { url: referenceImage } },
                  { type: "text", text: "Team's submitted recreation, claimed to be freshly AI-generated (judge THIS against the reference above):" },
                  { type: "image_url", image_url: { url: submittedImage } },
                  {
                    type: "text",
                    text:
                      "Step 1: Inspect IMAGE 2 for any watermark fragments, timestamp text, UI elements, screenshot/photo artifacts, or suspiciously exact pixel-level match to the reference. Even partial or faint traces count as a violation — set cheating_detected=true, explain exactly what you saw, and score everything 0.\n\n" +
                      "Step 2 (only if no violation found): Score the recreation against the reference per-criterion on a 0-10 scale, following the anchors and rules in your instructions. If the recreation depicts a completely different subject/scene, subject score = 0 and all others <= 2. Do not inflate scores — default to the lower band when uncertain. Make sure your summary sentence is consistent with your numeric scores."
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
            const parsed = parseVerdict(content, rubric);
            return { similarity: toSimilarity(parsed.cheating_detected, parsed.criteria, rubric), ...parsed };
          }
          // 200 with no content is not retryable by waiting — move to the next
          // model rather than asking the same one for the same empty answer.
          console.error(`[judgeImage] vision API returned no content (${model})`);
          break;
        }

        const errBody = await response.text();
        if (isRetryable(response.status) && attempt < RETRY_ATTEMPTS - 1) {
          const wait = retryDelayMs(response, attempt);
          console.warn(
            `[judgeImage] ${model} HTTP ${response.status}, retrying in ${Math.round(wait)}ms ` +
              `(attempt ${attempt + 1}/${RETRY_ATTEMPTS})`
          );
          await sleep(wait);
          continue;
        }
        console.error(`[judgeImage] vision API error (${model}): HTTP ${response.status}`, errBody);
        break;
      } catch (e) {
        // A timeout or socket error is worth one more go for the same reason a
        // 429 is: with a single model there is nothing to fall through to.
        const isLast = attempt === RETRY_ATTEMPTS - 1;
        console.error(`[judgeImage] vision model (${model}) failed${isLast ? "" : ", retrying"}:`, e);
        if (isLast) break;
        await sleep(retryDelayMs(new Response(null), attempt));
      }
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
  // Bounded, not Promise.all. Firing 60 images at a per-minute free-tier quota
  // simultaneously is the most reliable way to have most of them rejected
  // together — and a rejected judge call is a team with no score.
  const settled = await mapWithConcurrency(submissions, JUDGE_CONCURRENCY, async (s) => {
    try {
      return { teamId: s.teamId, verdict: await judgeImage(challenge, referenceImage, s.image) };
    } catch (err) {
      return { teamId: s.teamId, reason: err instanceof Error ? err.message : String(err) };
    }
  });

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
