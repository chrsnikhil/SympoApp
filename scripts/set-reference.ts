/**
 * Load the reference image for Round 1's "Image Replication".
 *
 *   npx tsx scripts/set-reference.ts image-1 ./reference.jpg
 *
 * Writes the file two ways: `referenceImage` is a public path the browser
 * renders, and `referenceDataUrl` is the same picture as base64 for the
 * vision judge, which sends both images in one API request and cannot follow
 * a relative URL. The judge does not work until this has been run.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, basename } from "node:path";
import { collections } from "../src/lib/db/client";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** Groq caps a request at 20MB; a reference well under that leaves room for
 *  the team's image alongside it. */
const MAX_BYTES = 4_000_000;

async function main() {
  const [slug, file] = process.argv.slice(2);
  if (!slug || !file) {
    console.error("\n  usage: npx tsx scripts/set-reference.ts <slug> <image>\n");
    process.exit(1);
  }

  const ext = extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) {
    console.error(`\n  ${ext || "(no extension)"} isn't supported — use JPEG, PNG or WebP.\n`);
    process.exit(1);
  }

  const bytes = readFileSync(file);
  if (bytes.length > MAX_BYTES) {
    console.error(`\n  That file is ${Math.round(bytes.length / 1024)}KB; the cap is ${Math.round(MAX_BYTES / 1024)}KB.\n`);
    process.exit(1);
  }

  const challenges = await collections.challenges();
  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge) {
    console.error(`\n  No quiz challenge with slug "${slug}".\n`);
    process.exit(1);
  }
  if (challenge.config.format !== "prompt-image") {
    console.error(`\n  "${slug}" is a ${challenge.config.format} question, not prompt-image.\n`);
    process.exit(1);
  }

  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

  await challenges.updateOne(
    { _id: challenge._id },
    { $set: { "config.referenceImage": true, "config.referenceDataUrl": dataUrl } }
  );

  console.log(`\n  Reference set for ${slug}`);
  console.log(`    source:  ${basename(file)} (${Math.round(bytes.length / 1024)}KB, ${mime})`);
  console.log(`    shown at: /quiz/${publicName}`);
  console.log(`    judge:   ${Math.round(dataUrl.length / 1024)}KB base64 stored on the challenge`);
  console.log("\n  The vision judge can now score this question.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
