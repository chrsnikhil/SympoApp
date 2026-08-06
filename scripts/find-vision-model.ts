/**
 * Find a vision-capable model that this project's API key can actually use.
 *
 * IMAGE_JUDGE_MODEL has no safe default — model ids change, and an invalid one
 * fails 100% of requests (the old hardcoded "openrouter/free" did exactly
 * that). This asks the provider what exists, filters to models that accept
 * image input, and then PROVES the pick works by sending a real two-image
 * comparison through it.
 *
 *   npx tsx --env-file=.env.local scripts/find-vision-model.ts
 */
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? "";
const GROQ_KEY = process.env.GROQ_API_KEY ?? "";

/** 1x1 red and 1x1 blue PNGs — enough to prove the vision path accepts images. */
const RED =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const BLUE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function listOpenRouterVisionModels(): Promise<string[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: OPENROUTER_KEY ? { authorization: `Bearer ${OPENROUTER_KEY}` } : {},
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    console.log(`  models list failed: HTTP ${res.status}`);
    return [];
  }
  const body = (await res.json()) as {
    data?: Array<{ id: string; architecture?: { input_modalities?: string[]; modality?: string }; pricing?: { prompt?: string } }>;
  };

  const vision = (body.data ?? []).filter((m) => {
    const mods = m.architecture?.input_modalities ?? [];
    const modality = m.architecture?.modality ?? "";
    return mods.includes("image") || modality.includes("image");
  });

  // Prefer free models, then cheapest.
  const isFree = (m: { id: string; pricing?: { prompt?: string } }) =>
    m.id.includes(":free") || m.pricing?.prompt === "0";

  const free = vision.filter(isFree).map((m) => m.id);
  const paid = vision.filter((m) => !isFree(m)).map((m) => m.id);
  return [...free, ...paid];
}

/**
 * Groq's OpenAI-compatible model list.
 *
 * Unlike OpenRouter, the payload carries no modality field — every entry looks
 * identical whether or not it can see. So there is nothing to filter on, and
 * guessing from the id ("does it contain 'vision'?") goes stale the moment
 * Groq renames a family. Everything is returned and `probe` decides: a model
 * that cannot accept an image fails the two-image request, which is exactly
 * the signal we want and the only one that can't drift.
 */
async function listGroqModels(): Promise<string[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { authorization: `Bearer ${GROQ_KEY}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    console.log(`  models list failed: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    return [];
  }
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  const ids = (body.data ?? []).map((m) => m.id);

  // Probing costs a real request each, so put the plausible ones first rather
  // than burning the budget on whisper/guard/tts models that certainly can't.
  const unlikely = /whisper|tts|guard|embed|rerank|moderation/i;
  const likely = /vision|scout|maverick|llava|vl\b|multimodal/i;
  return [
    ...ids.filter((id) => likely.test(id) && !unlikely.test(id)),
    ...ids.filter((id) => !likely.test(id) && !unlikely.test(id)),
  ];
}

async function probe(url: string, key: string, model: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://sympoapp.local",
        "X-Title": "SympoApp Image Judge",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 200,
        messages: [
          { role: "system", content: 'Reply with JSON only: {"similarity": <0-1>, "reason": "<short>"}' },
          {
            role: "user",
            content: [
              { type: "text", text: "Image 1 (reference):" },
              { type: "image_url", image_url: { url: RED } },
              { type: "text", text: "Image 2 (recreation):" },
              { type: "image_url", image_url: { url: BLUE } },
              { type: "text", text: "How similar is image 2 to image 1? JSON only." },
            ],
          },
        ],
      }),
    });

    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 150)}` };

    const payload = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return { ok: false, detail: "empty completion" };
    return { ok: true, detail: content.replace(/\s+/g, " ").slice(0, 120) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log(`OPENROUTER_API_KEY: ${OPENROUTER_KEY ? "set" : "MISSING"}`);
  console.log(`GROQ_API_KEY:       ${GROQ_KEY ? "set" : "MISSING"}\n`);

  const working: Array<{ provider: string; url: string; model: string; sample: string }> = [];

  if (OPENROUTER_KEY) {
    console.log("── OpenRouter: listing vision-capable models ──");
    const models = await listOpenRouterVisionModels();
    console.log(`  ${models.length} vision model(s) advertised\n`);

    const url = "https://openrouter.ai/api/v1/chat/completions";
    for (const model of models.slice(0, 12)) {
      process.stdout.write(`  probing ${model} … `);
      const r = await probe(url, OPENROUTER_KEY, model);
      console.log(r.ok ? `OK — ${r.detail}` : `fail — ${r.detail}`);
      if (r.ok) {
        working.push({ provider: "openrouter", url, model, sample: r.detail });
        if (working.length >= 3) break;
      }
    }
  }

  if (GROQ_KEY) {
    console.log("── Groq: probing models for image input ──");
    const models = await listGroqModels();
    console.log(`  ${models.length} model(s) to try\n`);

    const url = "https://api.groq.com/openai/v1/chat/completions";
    let found = 0;
    for (const model of models.slice(0, 12)) {
      process.stdout.write(`  probing ${model} … `);
      const r = await probe(url, GROQ_KEY, model);
      console.log(r.ok ? `OK — ${r.detail}` : `fail — ${r.detail}`);
      if (r.ok) {
        working.push({ provider: "groq", url, model, sample: r.detail });
        // Three gives IMAGE_JUDGE_MODEL a real fallback chain: the judge walks
        // the list in order, so a rate-limited first choice drops to the next
        // instead of failing the team's judging outright.
        if (++found >= 3) break;
      }
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  if (working.length === 0) {
    console.log("No working vision model found — Game 1 judging cannot run without one.");
    process.exit(1);
  }

  console.log("WORKING VISION MODELS:\n");
  for (const w of working) console.log(`  ${w.model}\n    via ${w.url}\n    sample: ${w.sample}\n`);

  // Emit every model from the winning provider, not just the first. The judge
  // tries IMAGE_JUDGE_MODEL in order and falls through on error, so a list is
  // the difference between one rate-limited model failing a team's judging and
  // it quietly succeeding on the next.
  const url = working[0].url;
  const sameProvider = working.filter((w) => w.url === url).map((w) => w.model);

  console.log("Set in .env.local:");
  console.log(`  IMAGE_JUDGE_MODEL="${sameProvider.join(",")}"`);
  console.log(`  VISION_API_URL="${url}"`);
  if (sameProvider.length === 1) {
    console.log("\n  NOTE: only one working model — there is no fallback if it rate-limits.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
