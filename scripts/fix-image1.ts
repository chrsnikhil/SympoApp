import { collections } from "../src/lib/db/client";

async function main() {
  const c = await collections.challenges();
  const now = new Date();
  await c.updateOne(
    { slug: "image-1" },
    { $set: { opensAt: now, closesAt: null } }
  );
  console.log("FIXED IMAGE-1 IN MONGODB ATLAS: opensAt = now, closesAt = null");
  process.exit(0);
}

main();
