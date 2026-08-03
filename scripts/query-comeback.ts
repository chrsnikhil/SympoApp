import { collections } from '../src/lib/db/client';

async function main() {
  const c = await collections.comebackStates();
  const states = await c.find({}).toArray();
  console.log(JSON.stringify(states, null, 2));
  process.exit(0);
}
main();
