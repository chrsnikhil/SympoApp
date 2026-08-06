import { NextResponse } from "next/server";
import { judgeImage, judgeAvailable, DEFAULT_RUBRIC, JudgeError } from "@/lib/quiz/judge";
import type { Challenge } from "@/lib/db/types";

/**
 * Run the real vision judge on two supplied images — DEVELOPMENT ONLY.
 *
 * The full Round 1 flow needs a seeded database, a team session, an upload and
 * a deadline to pass before anything is judged. That is a lot of machinery to
 * stand up when the question is only ever "does the judge score this pair the
 * way I would?". This calls `judgeImage` directly with the same rubric,
 * the same model and the same prompt the event uses, so what it reports is what
 * teams would get.
 *
 * Production returns 404, identical to a route that does not exist: this takes
 * arbitrary images and spends API quota, and it answers a question nobody needs
 * answered on the live site.
 *
 * No database, deliberately. Nothing here reads or writes a collection, so it
 * cannot disturb a live event, and it works on a machine whose local Mongo is
 * not running.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!judgeAvailable()) {
    return NextResponse.json(
      {
        error:
          "Judge not configured. .env.local needs GROQ_API_KEY, VISION_API_URL " +
          "and IMAGE_JUDGE_MODEL (currently: " +
          `${process.env.IMAGE_JUDGE_MODEL || "unset"}).`,
      },
      { status: 400 }
    );
  }

  let body: { reference?: unknown; submission?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference : "";
  const submission = typeof body.submission === "string" ? body.submission : "";
  if (!reference || !submission) {
    return NextResponse.json({ error: "Both a reference and a submission image are required" }, { status: 400 });
  }

  // Minimal stand-in. `judgeImage` reads only `config.rubric` (absent here, so
  // it falls back to DEFAULT_RUBRIC — the rubric the event actually scores on)
  // and nothing else off the challenge.
  const challenge = { _id: "dev", slug: "dev-judge", points: 10, config: {} } as unknown as Challenge;

  const startedAt = Date.now();
  try {
    const verdict = await judgeImage(challenge, reference, submission);
    return NextResponse.json({
      ...verdict,
      elapsedMs: Date.now() - startedAt,
      model: process.env.IMAGE_JUDGE_MODEL ?? null,
      // So the caller can see the weights the score came from without opening
      // the source — the whole point is checking the score is defensible.
      rubric: DEFAULT_RUBRIC.map((c) => ({ key: c.key, label: c.label, weight: c.weight })),
    });
  } catch (err) {
    const message = err instanceof JudgeError || err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, elapsedMs: Date.now() - startedAt }, { status: 502 });
  }
}
