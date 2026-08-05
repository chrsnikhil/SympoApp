import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { judgeImage } from "./judge";
import { recordImageEvaluation, scaleSimilarity } from "./scoring";
import type { Challenge, PromptImage } from "@/lib/db/types";

/**
 * Round 1, Game 1 — "Image Replication" round lifecycle.
 *
 * THE COMPETITION FLOW THIS IMPLEMENTS, exactly:
 *
 *   1. There is ONE reference image, and ONE challenge. Every team recreates
 *      the same picture. No challenge selection anywhere.
 *   2. While the clock runs, a team may upload as many times as it likes.
 *      Each upload REPLACES the previous one — `prompt_images` holds a single
 *      document per (team, challenge), enforced by a unique index.
 *   3. NOTHING is judged while the clock runs. No similarity, no scores, no
 *      call to the evaluator. Uploading is pure storage.
 *   4. When the timer reaches zero, uploads lock and the finalizer takes each
 *      team's ONE surviving image and evaluates it — once.
 *
 * The previous implementation judged on every upload, which meant a team that
 * uploaded ten times was evaluated ten times, paid for ten model runs, and
 * had its score rewritten by whichever evaluation happened to land last.
 */

/**
 * 8 minutes, per the coordinator's call — raised from 3m30s because teams
 * have to leave the tab, prompt an image generator, wait for it, download and
 * upload, and 3m30s did not survive contact with real generator latency.
 *
 * THE ONE definition. `round1.ts` decides when the phase times out and
 * `api/quiz/round1` computes the closing time the client counts down to; both
 * import this. They were three separate 210_000 literals, which is a silent
 * way for the round to end at one time and the judge to think it ended at
 * another.
 */
export const IMAGE_ROUND_DURATION_MS = 480_000;

export const IMAGE_CHALLENGE_SLUG = "image-1";

/**
 * When uploads close. `closesAt` (a coordinator ending the game early) wins
 * over the natural deadline; if the game was never opened there is no
 * deadline at all and nothing auto-finalizes.
 */
export function imageRoundDeadline(challenge: Challenge): Date | null {
  const opensAt = challenge.opensAt ? new Date(challenge.opensAt).getTime() : null;
  const natural = opensAt !== null ? opensAt + IMAGE_ROUND_DURATION_MS : null;
  const closes = challenge.closesAt ? new Date(challenge.closesAt).getTime() : null;

  if (natural === null && closes === null) return null;
  if (natural === null) return new Date(closes as number);
  if (closes === null) return new Date(natural);
  return new Date(Math.min(natural, closes));
}

export function uploadsLocked(challenge: Challenge, now: Date = new Date()): boolean {
  const deadline = imageRoundDeadline(challenge);
  if (!deadline) return false; // never opened — nothing to lock yet
  return now.getTime() >= deadline.getTime();
}

export interface FinalizeResult {
  ok: boolean;
  reason?: "no-challenge" | "not-due";
  evaluated: number;
  failed: number;
  alreadyDone: number;
}

/**
 * Single-flight per process. The Round 1 poll endpoint is hit by every team's
 * browser every ~2s, and they all cross the deadline in the same tick — this
 * stops one process from launching dozens of overlapping finalize passes. The
 * per-team atomic claim below is what makes it safe ACROSS processes.
 */
const inFlight = new Map<string, Promise<FinalizeResult>>();

export async function finalizeImageRound(
  slug: string = IMAGE_CHALLENGE_SLUG,
  opts: { force?: boolean } = {}
): Promise<FinalizeResult> {
  const key = `${slug}:${opts.force ? "force" : "due"}`;
  const running = inFlight.get(key);
  if (running) return running;

  const p = runFinalize(slug, opts.force === true);
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

async function runFinalize(slug: string, force: boolean): Promise<FinalizeResult> {
  const challenges = await collections.challenges();
  const challenge = await challenges.findOne({ type: "quiz", slug });
  if (!challenge) return { ok: false, reason: "no-challenge", evaluated: 0, failed: 0, alreadyDone: 0 };

  if (!force && !uploadsLocked(challenge)) {
    return { ok: false, reason: "not-due", evaluated: 0, failed: 0, alreadyDone: 0 };
  }

  const images = await collections.promptImages();
  const pending = await images.find({ challengeSlug: slug }).toArray();

  let evaluated = 0;
  let failed = 0;
  let alreadyDone = 0;

  for (const image of pending) {
    // ATOMIC CLAIM. `prompt_images` is unique on (teamId, challengeSlug), so
    // exactly one caller can flip this field for a given team — that is the
    // guarantee of "one evaluation request per team", however many clients
    // trip the finalize at once.
    const claimed = await images.findOneAndUpdate(
      { _id: image._id, $or: [{ evaluationClaimedAt: null }, { evaluationClaimedAt: { $exists: false } }] },
      { $set: { evaluationClaimedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!claimed) {
      alreadyDone++;
      continue;
    }

    try {
      await evaluateOne(challenge, claimed);
      evaluated++;
      console.log(`[image-round] evaluated team=${String(claimed.teamId)} q=${slug} via vision judge`);
    } catch (err) {
      failed++;
      console.error(`[image-round] evaluation failed for team=${String(claimed.teamId)}`, err);
      // Release the claim so a retry (admin re-run) can pick it up again.
      await images.updateOne({ _id: image._id }, { $set: { evaluationClaimedAt: null } });
      await recordImageEvaluation(slug, claimed.teamId, {
        status: "failed",
        message: err instanceof Error ? err.message : "Evaluation failed",
      });
    }
  }

  if (evaluated > 0 || failed > 0) {
    console.log(`[image-round] finalize ${slug}: evaluated=${evaluated} failed=${failed} alreadyDone=${alreadyDone}`);
  }
  return { ok: true, evaluated, failed, alreadyDone };
}

/**
 * Judge ONE team's final image. There is exactly one evaluator — the vision
 * model in `lib/quiz/judge.ts` — so a submission cannot be seen by two.
 */
async function evaluateOne(challenge: Challenge, image: PromptImage): Promise<void> {
  const teamId = image.teamId instanceof ObjectId ? image.teamId : new ObjectId(String(image.teamId));
  const gamePoints = challenge.points ?? 10;

  const reference = challenge.config.referenceDataUrl;
  if (!reference) {
    throw new Error("Challenge has no referenceDataUrl — run scripts/set-reference.ts");
  }
  const verdict = await judgeImage(challenge, reference, image.dataUrl);

  // The judge's own integrity check (reference re-uploaded, watermark
  // fragments, screenshot artifacts) zeroes the similarity, so a detected copy
  // lands on 0 marks through the same band ladder as everything else.
  const points = scaleSimilarity(verdict.similarity, gamePoints);

  console.log(
    `[image-round] groq verdict team=${String(teamId)} similarity=${verdict.similarity} score=${points}/${gamePoints}` +
      (verdict.cheating_detected ? ` CHEATING(${verdict.cheating_confidence}): ${verdict.cheating_reason}` : "")
  );

  await recordImageEvaluation(challenge.slug, teamId, {
    status: verdict.cheating_detected ? "rejected_watermark" : "scored",
    similarity: verdict.similarity,
    points: verdict.cheating_detected ? 0 : points,
    modelUsed: "vision-judge",
    reason: verdict.summary,
  });
}
