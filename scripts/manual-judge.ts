import { collections } from './src/lib/db/client.ts';
import { judgeImage } from './src/lib/quiz/judge.ts';

async function test() {
  console.log("Fetching images...");
  const challenges = await collections.challenges();
  const images = await collections.promptImages();

  const challenge = await challenges.findOne({ type: 'quiz', slug: 'image-1' });
  if (!challenge) {
    console.log("No challenge found");
    return;
  }

  const promptImg = await images.findOne({ challengeSlug: 'image-1' });
  if (!promptImg) {
    console.log("No uploaded image found");
    return;
  }

  console.log("Judging image...");
  try {
    const res = await judgeImage(challenge, challenge.config.referenceDataUrl, promptImg.dataUrl);
    console.log("SUCCESS:", res);
  } catch (e) {
    console.log("FAILED:", e);
  }
  process.exit(0);
}
test();
