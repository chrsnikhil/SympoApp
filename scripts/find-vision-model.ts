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

  console.log(`\n${"─".repeat(70)}`);
  if (working.length === 0) {
    console.log("No working vision model found — Game 1 judging cannot run without one.");
    process.exit(1);
  }

  console.log("WORKING VISION MODELS:\n");
  for (const w of working) console.log(`  ${w.model}\n    via ${w.url}\n    sample: ${w.sample}\n`);
  console.log("Set in .env.local:");
  console.log(`  IMAGE_JUDGE_MODEL="${working[0].model}"`);
  console.log(`  VISION_API_URL="${working[0].url}"`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
