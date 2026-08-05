import { collections } from '../src/lib/db/client';

async function main() {
  const c = await collections.challenges();
  const r = await c.updateMany(
    { type: 'quiz', 'config.round': 3 },
    { $set: { points: 100 } }
  );
  console.log('Updated', r.modifiedCount, 'questions');
  process.exit(0);
}

main().catch(console.error);
