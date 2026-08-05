import { collections } from "../src/lib/db/client";
import { hashAnswer } from "../src/lib/auth/session";

async function main() {
  const c = await collections.challenges();

  const p1Aliases = ["cookie", "cookies", "web cookie", "browser cookie", "http cookie", "session cookie"];
  const p2Aliases = ["nvidia", "nvidia gpu"];
  const p3Aliases = ["blockchain", "block chain"];
  const p4Aliases = ["tensorflow", "tensor flow"];
  const p5Aliases = ["api", "apis", "rest api", "web api", "application programming interface", "restful api", "endpoint"];

  await c.updateOne({ slug: "connections-1" }, { $set: { "config.answerHash": hashAnswer("cookie"), "config.acceptedHashes": p1Aliases.map(hashAnswer) } });
  await c.updateOne({ slug: "connections-2" }, { $set: { "config.answerHash": hashAnswer("nvidia"), "config.acceptedHashes": p2Aliases.map(hashAnswer) } });
  await c.updateOne({ slug: "connections-3" }, { $set: { "config.answerHash": hashAnswer("blockchain"), "config.acceptedHashes": p3Aliases.map(hashAnswer) } });
  await c.updateOne({ slug: "connections-4" }, { $set: { "config.answerHash": hashAnswer("tensorflow"), "config.acceptedHashes": p4Aliases.map(hashAnswer) } });
  await c.updateOne({ slug: "connections-5" }, { $set: { "config.answerHash": hashAnswer("api"), "config.acceptedHashes": p5Aliases.map(hashAnswer) } });

  console.log("UPDATED MONGODB ATLAS WITH MULTI-ALIAS ANSWERS FOR PUZZLES 1-5!");
  process.exit(0);
}

main();
