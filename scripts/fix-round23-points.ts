/**
 * Live patch for an already-seeded DB: drops the lighter questions in rounds
 * 2 & 3 to 25 points each, and removes round 3's 21st question entirely.
 * `scripts/seed-quiz.ts` already reflects this for any future reseed — this is
 * for applying it without wiping current teams/progress via a full reseed.
 *
 * Round 2's cheap band is questions 18-20 (it was 15-20; the coordinator moved
 * it, so Q1-17 are worth 100). Round 3's is unchanged at 18-20. This list and
 * `isFunQuestionIndex` in seed-quiz.ts are the same rule written twice — change
 * one and you must change the other, or whichever ran last silently wins.
 *
 * Run: npx tsx --env-file=.env.local scripts/fix-round23-points.ts
 */
import { collections } from "../src/lib/db/client";

const FUN_QUESTION_SLUGS = [
  "r2-q18", "r2-q19", "r2-q20",
  "r3-q18", "r3-q19", "r3-q20",
];
const REMOVED_SLUG = "r3-q21";

async function main() {
  const challenges = await collections.challenges();

  const pointsResult = await challenges.updateMany(
    { type: "quiz", slug: { $in: FUN_QUESTION_SLUGS } },
    { $set: { points: 25 } }
  );
  console.log(`Set points to 25 on ${pointsResult.modifiedCount} question(s):`, FUN_QUESTION_SLUGS.join(", "));

  // Restore everything OUTSIDE the cheap band to 100, rather than only pushing
  // the band down. Narrowing round 2's band from 15-20 to 18-20 would otherwise
  // leave q15, q16 and q17 sitting at 25 from a previous run of this script —
  // the change would look applied while three questions still scored the old
  // way. Asserting the full intended state makes this idempotent and makes
  // widening the band later work as well as narrowing it.
  const restored = await challenges.updateMany(
    {
      type: "quiz",
      "config.round": { $in: [2, 3] },
      "config.format": "mcq",
      slug: { $nin: [...FUN_QUESTION_SLUGS, REMOVED_SLUG] },
      points: { $ne: 100 },
    },
    { $set: { points: 100 } }
  );
  console.log(`Restored ${restored.modifiedCount} question(s) to 100.`);

  const removedChallenge = await challenges.findOne({ type: "quiz", slug: REMOVED_SLUG });
  if (removedChallenge?._id) {
    const [subs, serves, scores] = await Promise.all([
      collections.submissions(),
      collections.quizServes(),
      collections.scoreEvents(),
    ]);
    const removedSubs = await subs.deleteMany({ challengeId: removedChallenge._id });
    const removedServes = await serves.deleteMany({ challengeSlug: REMOVED_SLUG });
    const removedScores = await scores.deleteMany({ reason: `quiz:${REMOVED_SLUG}` });
    await challenges.deleteOne({ _id: removedChallenge._id });
    console.log(
      `Removed ${REMOVED_SLUG}: 1 challenge, ${removedSubs.deletedCount} submission(s), ` +
        `${removedServes.deletedCount} serve(s), ${removedScores.deletedCount} ledger row(s).`
    );
  } else {
    console.log(`${REMOVED_SLUG} not found — already removed or never seeded.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
