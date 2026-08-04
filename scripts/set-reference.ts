/**
 * Load the reference image for Round 1's "Image Replication".
 *
 *   npx tsx --env-file=.env.local scripts/set-reference.ts image-1 ./private/reference/image-1.png
 *
 * Stores the picture TWICE, at two different resolutions, because the judge
 * and the browser have different needs:
 *
 *   config.referenceDataUrl         full-resolution master — vision judge ONLY,
 *                                   never leaves the server
 *   config.referenceDisplayDataUrl  downscaled + re-encoded — the ONLY version
 *                                   any browser receives
 *
 * Teams need to see the picture well enough to recreate it; that does not
 * require handing them the master's pixels. Nothing is written under
 * `public/` — a file there is downloadable by anyone who guesses the path,
 * which defeats the point of the protected endpoint.
 */
import { readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { extname, basename, join } from "node:path";
import sharp from "sharp";
import { collections } from "../src/lib/db/client";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** The judge's provider caps a request at 20MB; a master well under that
 *  leaves room for the team's image alongside it. */
const MAX_BYTES = 4_000_000;

/**
 * Display copy: wide enough to see composition, subject, colour and style —
 * everything the rubric actually scores — and far short of the master.
 * Re-encoded as JPEG at q72, which also strips any EXIF the master carried.
 */
const DISPLAY_MAX_WIDTH = 900;
const DISPLAY_QUALITY = 72;

/** Masters live here: inside the repo, OUTSIDE `public/`, so Next never
 *  serves them. Keeps a copy so the DB can be rebuilt without the original. */
const MASTER_DIR = join(process.cwd(), "private", "reference");

async function main() {
  const [slug, file] = process.argv.slice(2);
  if (!slug || !file) {
    console.error("\n  usage: npx tsx --env-file=.env.local scripts/set-reference.ts <slug> <image>\n");
    process.exit(1);
  }

  if (!existsSync(file)) {
    console.error(`\n  No such file: ${file}\n`);
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

  const meta = await sharp(bytes).metadata();

  // Downscale only — never upscale a small source into a bigger "display"
  // copy, which would add no detail and only inflate the payload.
  const displayBuf = await sharp(bytes)
    .resize({ width: Math.min(DISPLAY_MAX_WIDTH, meta.width ?? DISPLAY_MAX_WIDTH), withoutEnlargement: true })
    .jpeg({ quality: DISPLAY_QUALITY, mozjpeg: true })
    .toBuffer();
  const displayMeta = await sharp(displayBuf).metadata();

  const masterDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  const displayDataUrl = `data:image/jpeg;base64,${displayBuf.toString("base64")}`;

  // Keep the master alongside the repo but outside public/, so a reseed on
  // another machine doesn't need the original file hunted down again.
  mkdirSync(MASTER_DIR, { recursive: true });
  const archived = join(MASTER_DIR, `${slug}${ext}`);
  copyFileSync(file, archived);

  await challenges.updateOne(
    { _id: challenge._id },
    {
      $set: {
        "config.referenceImage": true,
        "config.referenceDataUrl": masterDataUrl,
        "config.referenceDisplayDataUrl": displayDataUrl,
      },
    }
  );

  const pct = Math.round((displayBuf.length / bytes.length) * 100);
  console.log(`\n  Reference set for ${slug}`);
  console.log(`    source:   ${basename(file)} (${Math.round(bytes.length / 1024)}KB, ${mime})`);
  console.log(`    master:   ${meta.width}x${meta.height} — judge only, never sent to a browser`);
  console.log(`    display:  ${displayMeta.width}x${displayMeta.height} JPEG q${DISPLAY_QUALITY} ` +
    `(${Math.round(displayBuf.length / 1024)}KB, ${pct}% of master)`);
  console.log(`    archived: private/reference/${basename(archived)} (outside public/)`);
  console.log(`    served:   /api/quiz/round1/reference — auth + same-origin, no-store`);
  console.log("\n  The vision judge scores against the master; teams only ever see the display copy.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
