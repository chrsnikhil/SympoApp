/**
 * 100% Offline Local Database Server with Auto-Seeding.
 *
 * Runs a local MongoDB server at mongodb://127.0.0.1:27117/
 * No internet connection or MongoDB Atlas SRV lookup required!
 *
 * Usage:
 *   npx tsx scripts/dev-db.ts
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

async function main() {
  console.log("🚀 Starting 100% Offline Local MongoDB Server...");
  
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27117,
      dbName: "xplore26",
    },
  });

  const uri = mongod.getUri();
  console.log(`\n✅ Local Database is live at: ${uri}`);

  const envPath = resolve(process.cwd(), ".env.local");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing
    .split("\n")
    .filter((l) => l && !l.startsWith("MONGODB_URI=") && !l.startsWith("JWT_SECRET="));

  lines.push(`MONGODB_URI="${uri}"`);
  lines.push(`JWT_SECRET="dev-only-preview-secret-not-for-production"`);
  writeFileSync(envPath, lines.join("\n") + "\n");
  console.log("📝 Updated .env.local with local database URI!");

  console.log("\n🌱 Auto-seeding quiz questions, coordinator code (1684), and tokens (01-60)...");
  try {
    execSync(`npx tsx --env-file=.env.local scripts/seed-quiz.ts --if-empty`, { stdio: "inherit", shell: "/bin/sh" });
    console.log("\n✨ DATABASE IS READY FOR OFFLINE / REMOTE TUNNEL TESTING!");
    console.log("----------------------------------------------------------------");
    console.log("🔑 Coordinator Code: 1684");
    console.log("🎟️ Team Tokens: 01 to 60");
    console.log("🌐 Local App URL: http://localhost:3000/enter");
    console.log("----------------------------------------------------------------\n");
  } catch (err) {
    console.error("Warning: Seeding script failed to run automatically:", err);
  }

  process.on("SIGINT", async () => {
    console.log("\nStopping local MongoDB server...");
    await mongod.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Error starting local MongoDB:", err);
  process.exit(1);
});
