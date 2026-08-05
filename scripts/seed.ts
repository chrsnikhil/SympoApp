/**
 * Seed a usable dev dataset: indexes, two teams with access codes, and one
 * challenge per event.
 *
 * Run:  npx tsx scripts/seed.ts
 *
 * Prints the PLAINTEXT codes once — they're stored hashed, so this is the only
 * time you'll see them. Regenerate rather than trying to recover one.
 */
import { ObjectId } from "mongodb";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { hashCode, hashAnswer, normaliseCode } from "../src/lib/auth/session";
import { randomBytes } from "node:crypto";

function makeCode(): string {
  // Ambiguous characters removed — these get read aloud and typed by hand.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) =>
    Array.from(randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `X26-${chunk(5)}-${chunk(5)}`;
}

async function main() {
  console.log("Ensuring indexes…");
  await ensureIndexes();

  const teams = await collections.teams();
  const participants = await collections.participants();
  const codes = await collections.accessCodes();
  const challenges = await collections.challenges();
  const hunt = await collections.huntProgress();

  console.log("Seeding teams + codes…");
  const issued: Array<{ team: string; code: string }> = [];

  for (const name of ["Team Arachnid", "Team Multiverse"]) {
    const teamId = new ObjectId();
    await teams.insertOne({ _id: teamId, name, createdAt: new Date() });

    const participantId = new ObjectId();
    await participants.insertOne({
      _id: participantId,
      teamId,
      name: `${name} captain`,
      role: "participant",
      createdAt: new Date(),
    });

    const code = makeCode();
    await codes.insertOne({
      codeHash: hashCode(code),
      teamId,
      participantId,
      role: "participant",
      redeemedAt: null,
    });
    issued.push({ team: name, code: normaliseCode(code) });

    // The hunt only lets a team submit against an unlocked clue, so open the
    // first one for every team up front.
    await hunt.updateOne(
      { teamId, challengeSlug: "clue-1" },
      { $setOnInsert: { teamId, challengeSlug: "clue-1", unlockedAt: new Date(), solvedAt: null, hintsUsed: 0 } },
      { upsert: true }
    );
  }

  console.log("Seeding challenges…");
  await challenges.deleteMany({ slug: { $in: ["clue-1", "clue-2", "warmup", "q1", "sum-two"] } });
  await challenges.insertMany([
    {
      type: "hunt",
      slug: "clue-1",
      title: "Where it begins",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { answerHash: hashAnswer("library"), nextSlug: "clue-2", hintCosts: [10, 25] },
    },
    {
      type: "hunt",
      slug: "clue-2",
      title: "Second thread",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: { answerHash: hashAnswer("rooftop"), hintCosts: [15] },
    },
    {
      type: "ctf",
      slug: "warmup",
      title: "Warmup",
      points: 200,
      opensAt: null,
      closesAt: null,
      config: { answerHash: hashAnswer("flag{hello_multiverse}"), firstBloodBonus: 50 },
    },
    // No `quiz` entry here — the quiz event has its own seed script,
    // `scripts/seed-quiz.ts`, because it needs 60 coins, three rounds and a
    // coordinator login rather than one sample question.
    {
      type: "code",
      slug: "sum-two",
      title: "Sum two numbers",
      points: 300,
      opensAt: null,
      closesAt: null,
      config: { testsRef: "tests/sum-two.json" },
    },
  ]);

  console.log("\n── ACCESS CODES (shown once, stored hashed) ─────────────");
  for (const i of issued) console.log(`  ${i.team.padEnd(18)} ${i.code}`);
  console.log("────────────────────────────────────────────────────────\n");
  console.log("Try: hunt clue-1 → 'library' · ctf warmup → 'flag{hello_multiverse}'");
  console.log("For the quiz, run scripts/seed-quiz.ts instead — coins, three rounds, a coordinator login.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
