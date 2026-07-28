/**
 * Seed the Spider Multiverse Tech Quiz: 60 coins, the coordinator's login,
 * and every question across the three rounds, per the official rules doc.
 *
 * Run:  npx tsx scripts/seed-quiz.ts
 *
 * Prints the coordinator's PLAINTEXT access code once — it's stored hashed,
 * so this is the only time you'll see it. Regenerate rather than trying to
 * recover one.
 *
 * Safe to re-run: it clears the quiz's own state first (teams that came from
 * claiming a coin, quiz challenges, serves, memory/comeback state) and leaves
 * hunt/ctf/code untouched.
 */
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { withThrottleRetry } from "../src/lib/db/retry";
import { hashCode, normaliseCode } from "../src/lib/auth/session";
import { AVATARS, MAX_COIN, formatCoin } from "../src/lib/quiz/avatars";
import type { Challenge } from "../src/lib/db/types";

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) => Array.from(randomBytes(n)).map((b) => alphabet[b % alphabet.length]).join("");
  return `X26-${chunk(5)}-${chunk(5)}`;
}

// ── Round 1, Game 3 — Guess the Number ───────────────────────────────────────
const GUESS_TITLE = "A canon event touches every universe once. Roughly how many Spider-People has the Multiverse recorded, according to the Spider-Society's registry?";
const GUESS_TRUE_VALUE = 300;

// ── Round 2 — Warm-up MCQs (8 questions, flat scoring, no reveal) ───────────
type Mcq = { q: string; options: string[]; correct: number; hint?: string };

const ROUND_2: Mcq[] = [
  { q: "What does HTTP stand for?", options: ["HyperText Transfer Protocol", "High Throughput Transfer Protocol", "Hyperlink Text Transmission Process", "Host Transfer Type Protocol"], correct: 0 },
  { q: "Which port does HTTPS use by default?", options: ["21", "80", "443", "8080"], correct: 2 },
  { q: "What is the average time complexity of binary search?", options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"], correct: 1 },
  { q: "Which data structure follows First-In-First-Out order?", options: ["Stack", "Queue", "Tree", "Heap"], correct: 1 },
  { q: "What does GPT stand for?", options: ["General Purpose Transformer", "Generative Pre-trained Transformer", "Gradient Propagation Technique", "Guided Predictive Training"], correct: 1 },
  { q: "What year does Miguel O'Hara come from?", options: ["2029", "2099", "3099", "1999"], correct: 1 },
  { q: "Which company originally developed the Rust programming language?", options: ["Google", "Mozilla", "Microsoft", "Oracle"], correct: 1 },
  { q: "Which instrument does Gwen Stacy play in her band?", options: ["Bass", "Guitar", "Drums", "Keyboard"], correct: 2 },
];

// ── Round 3 — Multiverse Abilities (8 questions, each carries a hint the ────
// ── comeback meter's "Goblin Intel" ability can unlock) ─────────────────────
const ROUND_3: Mcq[] = [
  { q: "What is the worst-case time complexity of quicksort?", options: ["O(n log n)", "O(n²)", "O(log n)", "O(n)"], correct: 1, hint: "Think about an already-sorted array with a bad pivot choice." },
  { q: "In the OSI model, which layer does TCP operate at?", options: ["Network (3)", "Transport (4)", "Session (5)", "Data link (2)"], correct: 1, hint: "It's the layer whose whole job is end-to-end delivery." },
  { q: "What problem does dropout address in neural networks?", options: ["Vanishing gradients", "Overfitting", "Slow convergence", "Exploding weights"], correct: 1, hint: "It works by randomly ignoring neurons during training." },
  { q: "What does a CDN primarily reduce?", options: ["Server CPU usage", "Latency by serving from closer edges", "Database size", "Bandwidth cost only"], correct: 1, hint: "Its advantage is geographic, not computational." },
  { q: "Who leads the Spider-Society in Across the Spider-Verse?", options: ["Peter B. Parker", "Miguel O'Hara", "Jessica Drew", "Hobie Brown"], correct: 1, hint: "He's the one from 2099." },
  { q: "What does a 'race condition' require to occur?", options: ["A single thread with recursion", "Concurrent access where ordering affects the result", "Insufficient memory", "A blocking I/O call"], correct: 1, hint: "The bug only appears depending on who gets there first." },
  { q: "What is the main purpose of a hash function in a password store?", options: ["Compress the password", "Make the stored value irreversible", "Encrypt it for later decryption", "Validate its length"], correct: 1, hint: "The key property is that you cannot go backwards." },
  { q: "Which Spider-Person is a self-described anarchist with a guitar?", options: ["Hobie Brown", "Pavitr Prabhakar", "Miles Morales", "Ben Reilly"], correct: 0, hint: "Spider-Punk." },
];

async function main() {
  console.log("Ensuring indexes…");
  await ensureIndexes();

  const teams = await collections.teams();
  const participants = await collections.participants();
  const codes = await collections.accessCodes();
  const challenges = await collections.challenges();
  const coins = await collections.coins();
  const serves = await collections.quizServes();
  const quals = await collections.roundQualifications();
  const memoryStates = await collections.memoryStates();
  const comebackStates = await collections.comebackStates();
  const promptImages = await collections.promptImages();
  const subs = await collections.submissions();
  const scoreEvents = await collections.scoreEvents();

  console.log("Clearing previous quiz state…");
  const previous = await teams.find({ $or: [{ name: "Quiz Control" }, { coin: { $exists: true } }] }).toArray();
  const previousIds = previous.map((t) => t._id!).filter(Boolean);
  if (previousIds.length > 0) {
    await withThrottleRetry(() => participants.deleteMany({ teamId: { $in: previousIds } }));
    await withThrottleRetry(() => codes.deleteMany({ teamId: { $in: previousIds } }));
    await withThrottleRetry(() => teams.deleteMany({ _id: { $in: previousIds } }));
  }

  await withThrottleRetry(() => coins.deleteMany({}));
  await withThrottleRetry(() =>
    coins.insertMany(Array.from({ length: MAX_COIN }, (_, i) => ({ _id: i + 1, teamId: null, claimedAt: null })))
  );

  await withThrottleRetry(() => challenges.deleteMany({ type: "quiz" }));
  await withThrottleRetry(() => serves.deleteMany({}));
  await withThrottleRetry(() => quals.deleteMany({}));
  await withThrottleRetry(() => memoryStates.deleteMany({}));
  await withThrottleRetry(() => comebackStates.deleteMany({}));
  await withThrottleRetry(() => promptImages.deleteMany({}));
  await withThrottleRetry(() => subs.deleteMany({ type: "quiz" }));
  await withThrottleRetry(() => scoreEvents.deleteMany({ event: "quiz" }));

  const adminTeamId = new ObjectId();
  await teams.insertOne({ _id: adminTeamId, name: "Quiz Control", createdAt: new Date() });
  const adminId = new ObjectId();
  await participants.insertOne({ _id: adminId, teamId: adminTeamId, name: "Quiz coordinator", role: "admin", createdAt: new Date() });
  const adminCode = makeCode();
  await codes.insertOne({ codeHash: hashCode(adminCode), teamId: adminTeamId, participantId: adminId, role: "admin", redeemedAt: null });

  console.log("Seeding questions…");
  const docs: Challenge[] = [];

  // Round 1, Game 1 — Image Replication. opensAt/closesAt start null; the
  // coordinator opens the 5-minute window on the day with `quiz-admin.ts open`.
  docs.push({
    type: "quiz",
    slug: "image-1",
    title: "Recreate the reference image using an AI image generator",
    points: 10,
    opensAt: null,
    closesAt: null,
    config: { round: 1, format: "prompt-image", order: 1, referenceImage: "/quiz/reference-1.svg" },
  });

  // Round 1, Game 2 — Memory Game.
  docs.push({
    type: "quiz",
    slug: "memory-1",
    title: "Match every Spider-Verse variant pair",
    points: 16,
    opensAt: null,
    closesAt: null,
    config: { round: 1, format: "memory", order: 2, memoryPairs: 8 },
  });

  // Round 1, Game 3 — Guess the Number.
  docs.push({
    type: "quiz",
    slug: "guess-1",
    title: GUESS_TITLE,
    points: 5,
    opensAt: null,
    closesAt: null,
    config: { round: 1, format: "estimate", order: 3, answerValue: GUESS_TRUE_VALUE },
  });

  ROUND_2.forEach((m, i) => {
    docs.push({
      type: "quiz",
      slug: `r2-q${i + 1}`,
      title: m.q,
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { round: 2, format: "mcq", order: i + 1, options: m.options, correctIndex: m.correct },
    });
  });

  ROUND_3.forEach((m, i) => {
    docs.push({
      type: "quiz",
      slug: `r3-q${i + 1}`,
      title: m.q,
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { round: 3, format: "mcq", order: i + 1, options: m.options, correctIndex: m.correct, hint: m.hint },
    });
  });

  await challenges.insertMany(docs);

  console.log("\n── COORDINATOR LOGIN (shown once, stored hashed) ─────────────");
  console.log(`  ${normaliseCode(adminCode)}`);
  console.log("  Teams don't get one — they enter with their coin number.");
  console.log("────────────────────────────────────────────────────────────────");

  console.log("\n── COIN RANGES (stamped on the printed discs) ────────────────");
  for (const a of AVATARS) {
    console.log(`  ${formatCoin(a.coins[0])}-${formatCoin(a.coins[1])}  ${a.name}`);
  }
  console.log("  Hand a team any coin; its number decides their character.");
  console.log("────────────────────────────────────────────────────────────────");

  console.log(`\nSeeded 3 round-1 games, ${ROUND_2.length} round-2 and ${ROUND_3.length} round-3 questions.`);
  console.log("Before Round 1 runs: npx tsx scripts/set-reference.ts image-1 ./reference.jpg");
  console.log('Then on the day: npx tsx scripts/quiz-admin.ts open image-1 5   (and "open guess-1 3")');
  console.log(`Verify GUESS_TRUE_VALUE (${GUESS_TRUE_VALUE}) before the event — closest-wins scoring is only as fair as the truth value.`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
