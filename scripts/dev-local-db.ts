/**
 * Local-only throwaway MongoDB for UI preview.
 *
 * Not part of the app's runtime — spins up mongodb-memory-server on a fixed
 * port so `.env.local` can point at it, then stays alive until killed. Never
 * used in production; production always talks to real Cosmos DB via
 * MONGODB_URI.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const mongod = await MongoMemoryServer.create({
    instance: { port: 27117, dbName: "xplore26" },
  });
  const uri = mongod.getUri();
  console.log(`[dev-local-db] Mongo running at ${uri}`);

  const envPath = resolve(process.cwd(), ".env.local");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing.split("\n").filter((l) => l && !l.startsWith("MONGODB_URI=") && !l.startsWith("JWT_SECRET="));
  lines.push(`MONGODB_URI=${uri}`);
  lines.push("JWT_SECRET=dev-only-preview-secret-not-for-production");
  writeFileSync(envPath, lines.join("\n") + "\n");
  console.log("[dev-local-db] .env.local updated");
  console.log("[dev-local-db] Ctrl+C to stop (this also destroys the data)");

  process.on("SIGINT", async () => {
    await mongod.stop();
    process.exit(0);
  });
}

main();
