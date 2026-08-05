/**
 * Live smoke test of the REAL vision judge — no mock.
 *
 * Calls the actual OpenRouter/Groq endpoint with the actual reference image
 * and a couple of test recreations, through the project's own `judgeImage`,
 * so the integration is proven end to end rather than assumed.
 *
 *   npx tsx --env-file=.env.local scripts/test-vision-live.ts
 *
 * Costs a few free-tier requests. Skips itself if VISION_API_URL still points
 * at the local mock.
 */
import { readFileSync } from "node:fs";

async function main() {
  if ((process.env.VISION_API_URL ?? "").includes("localhost")) {
    console.log("VISION_API_URL points at the local mock — unset it to run a live test.");
    process.exit(2);
  }

  const { collections } = await import("../src/lib/db/client");
  const { judgeImage, judgeAvailable } = await import("../src/lib/quiz/judge");
  const { similarityToMarks } = await import("../src/lib/quiz/scoring");

  console.log(`judgeAvailable: ${judgeAvailable()}`);
  console.log(`models: ${process.env.IMAGE_JUDGE_MODEL}\n`);

  const challenges = await collections.challenges();
  const challenge = await challenges.findOne({ type: "quiz", slug: "image-1" });
  if (!challenge?.config?.referenceDataUrl) {
    console.log("No referenceDataUrl — run scripts/set-reference.ts first.");
    process.exit(1);
  }
  const reference = challenge.config.referenceDataUrl;

  const cases: Array<{ label: string; image: string; expect: string }> = [
    {
      label: "the reference image itself (cheat)",
      image: reference,
      expect: "0 marks — detected as a copy",
    },
    {
      label: "an unrelated screenshot (a different quiz asset)",
      image: `data:image/png;base64,${readFileSync("./public/quiz/heap.png").toString("base64")}`,
      expect: "low marks — unrelated",
    },
  ];

  for (const c of cases) {
    console.log(`── ${c.label}`);
    console.log(`   expecting: ${c.expect}`);
    try {
      const verdict = await judgeImage(challenge, reference, c.image);
      const marks = verdict.cheating_detected ? 0 : similarityToMarks(verdict.similarity, challenge.points ?? 10);
      console.log(`   similarity: ${verdict.similarity}`);
      console.log(`   marks:      ${marks}/${challenge.points ?? 10}`);
      console.log(`   cheating:   ${verdict.cheating_detected} ${verdict.cheating_reason ?? ""}`);
      console.log(`   reason:     ${verdict.summary}`);
    } catch (err) {
      console.log(`   FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log("");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
