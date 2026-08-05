/**
 * Live patch for an already-seeded DB: drops questions 15-20 in rounds 2 & 3
 * (the lighter/pop-culture-adjacent ones) to 25 points each, and removes
 * round 3's 21st question entirely. `scripts/seed-quiz.ts` already reflects
 * this for any future reseed — this is for applying it without wiping
 * current teams/progress via a full reseed.
 *
 * Run: npx tsx --env-file=.env.local scripts/fix-round23-points.ts
 */
import { collections } from "../src/lib/db/client";

const FUN_QUESTION_SLUGS = [
  "r2-q15", "r2-q16", "r2-q17", "r2-q18", "r2-q19", "r2-q20",
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
