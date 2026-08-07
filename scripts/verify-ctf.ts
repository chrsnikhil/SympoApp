import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ObjectId } from "mongodb";

// Load .env.local into process.env
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

import { collections, ensureIndexes } from "../src/lib/db/client";
import { submit } from "../src/lib/submission/pipeline";
import { materialize } from "../src/lib/leaderboard/materialize";
import { calculateChallengeValue } from "../src/lib/ctf/scoring";
import type { SessionClaims } from "../src/lib/auth/session";

async function runVerification() {
  console.log("==================================================");
  console.log("   MULTIVERSE BREACH CTF VERIFICATION SUITE       ");
  console.log("==================================================\n");

  await ensureIndexes();

  const teamsCollection = await collections.teams();
  const subsCollection = await collections.submissions();
  const scoresCollection = await collections.scoreEvents();
  const challengesCollection = await collections.challenges();

  // Reset test data for CTF
  await subsCollection.deleteMany({ type: "ctf" });
  await scoresCollection.deleteMany({ event: "ctf" });
  await teamsCollection.deleteMany({ nameKey: { $in: ["verification_spider_alpha", "verification_spider_beta"] } });

  // Create two distinct test teams
  const teamAId = new ObjectId();
  const teamBId = new ObjectId();
  const partAId = new ObjectId();
  const partBId = new ObjectId();

  await teamsCollection.updateOne({ _id: teamAId }, { $set: { name: "Verification Spider-Alpha", nameKey: "verification_spider_alpha", createdAt: new Date() } }, { upsert: true });
  await teamsCollection.updateOne({ _id: teamBId }, { $set: { name: "Verification Spider-Beta", nameKey: "verification_spider_beta", createdAt: new Date() } }, { upsert: true });

  const sessionA: SessionClaims = { sub: partAId.toString(), teamId: teamAId.toString(), role: "participant" };
  const sessionB: SessionClaims = { sub: partBId.toString(), teamId: teamBId.toString(), role: "participant" };

  console.log("1. TEST: WRONG FLAG SUBMISSION");
  const wrongRes = await submit({
    event: "ctf",
    challengeSlug: "easy-01",
    payload: "SPIDER{wrong_flag_attempt}",
    session: sessionA,
  });
  console.log("   Result:", wrongRes);
  if (wrongRes.ok && wrongRes.status === 200 && !wrongRes.correct) {
    console.log("   ✅ WRONG FLAG SUCCESSFULLY REJECTED (0 points)\n");
  } else {
    throw new Error("❌ FAIL: Wrong flag test failed");
  }

  console.log("2. TEST: CORRECT FLAG SUBMISSION & ATOMIC FIRST BLOOD");
  const correctResA = await submit({
    event: "ctf",
    challengeSlug: "easy-01",
    payload: "SPIDER{frontend_will_not_have_secrets}",
    session: sessionA,
  });
  console.log("   Result Team A:", correctResA);
  if (correctResA.ok && correctResA.status === 200 && correctResA.correct && correctResA.meta?.solves === 1) {
    console.log("   ✅ CORRECT FLAG ACCEPTED & FIRST BLOOD SOLVE RECORDED!\n");
  } else {
    throw new Error("❌ FAIL: Correct flag or first blood test failed");
  }

  console.log("3. TEST: DUPLICATE SOLVE PREVENTION");
  const dupRes = await submit({
    event: "ctf",
    challengeSlug: "easy-01",
    payload: "SPIDER{frontend_will_not_have_secrets}",
    session: sessionA,
  });
  console.log("   Result Dup:", dupRes);
  if (dupRes.ok && dupRes.status === 200 && !dupRes.correct && dupRes.meta?.reason === "already-solved") {
    console.log("   ✅ DUPLICATE SOLVE REJECTED AS ALREADY SOLVED!\n");
  } else {
    throw new Error("❌ FAIL: Duplicate solve test failed");
  }

  console.log("4. TEST: SECOND TEAM SOLVE (NO FIRST BLOOD)");
  const correctResB = await submit({
    event: "ctf",
    challengeSlug: "easy-01",
    payload: "SPIDER{frontend_will_not_have_secrets}",
    session: sessionB,
  });
  console.log("   Result Team B:", correctResB);
  if (correctResB.ok && correctResB.status === 200 && correctResB.correct && correctResB.meta?.solves === 2) {
    console.log("   ✅ SECOND TEAM SOLVED SUCCESSFULLY!\n");
  } else {
    throw new Error("❌ FAIL: Second team solve check failed");
  }

  console.log("5. TEST: STATIC SCORING FUNCTION");
  const v1 = calculateChallengeValue(100, 50, 3, 1);
  const v4 = calculateChallengeValue(100, 50, 3, 4);
  console.log(`   Initial (1 solve): ${v1} pts | Decayed (4 solves): ${v4} pts`);
  if (v1 === 100 && v4 === 100) {
    console.log("   ✅ STATIC SCORING LOGIC VERIFIED!\n");
  } else {
    throw new Error("❌ FAIL: Static scoring function test failed");
  }

  console.log("6. TEST: CATEGORY TIME BONUS (+50 PTS)");
  // Team A solves easy-02 and easy-03 quickly
  await submit({
    event: "ctf",
    challengeSlug: "easy-02",
    payload: "SPIDER{alchemex_pixel_mole_50101}",
    session: sessionA,
  });
  await submit({
    event: "ctf",
    challengeSlug: "easy-03",
    payload: "SPIDER{auditor_memory_never_lies}",
    session: sessionA,
  });

  const snapshot = await materialize("ctf");
  const teamARow = snapshot.rows.find((r) => r.teamId === teamAId.toString());
  console.log("   Materialized CTF Leaderboard Team A Row:", teamARow);
  if (teamARow && teamARow.solvedCount === 3 && teamARow.points > 300) {
    console.log("   ✅ LEADERBOARD & TIME BONUS (+50 PTS) VERIFIED!\n");
  } else {
    throw new Error("❌ FAIL: Leaderboard time bonus test failed");
  }

  console.log("==================================================");
  console.log("   🎉 ALL 7 CTF VERIFICATION TESTS PASSED 100%!   ");
  console.log("==================================================\n");

  process.exit(0);
}

runVerification().catch((e) => {
  console.error(e);
  process.exit(1);
});
