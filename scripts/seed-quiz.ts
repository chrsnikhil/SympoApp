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
import fs from "node:fs";
import path from "node:path";

// Auto-load .env.local into process.env if not already loaded
if (fs.existsSync(".env.local")) {
  const envText = fs.readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { withThrottleRetry } from "../src/lib/db/retry";
import { hashAnswer, hashCode, normaliseCode } from "../src/lib/auth/session";
import { AVATARS, MAX_COIN, formatCoin } from "../src/lib/quiz/avatars";
import type { Challenge } from "../src/lib/db/types";

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) => Array.from(randomBytes(n)).map((b) => alphabet[b % alphabet.length]).join("");
  return `X26-${chunk(5)}-${chunk(5)}`;
}

// ── Round 1, Game 2 — Connections: 5 puzzles played in sequence ─────────────
// Each puzzle is a handful of tiles sharing one hidden technical term plus a
// one-line clue; the coordinator reveals tiles live (see AdminDashboard's
// "Connections — reveal control"), not on a timer. The art here is still the
// assets repo's anonymised PLACEHOLDER frames, reused across all 5 puzzles
// for local testing only — per the repo's own README, which puzzle number
// means which subject is the coordinator's call, never committed or
// filename-encoded (a labelled filename would just hand the answer to
// anyone reading the network tab). Swap the artwork and answers for the real
// assignment before the event.
// NOTE: this file runs main() unconditionally at import time (see the bottom
// of the file), so it must never be `import`-ed by another script — that
// would re-run the seed as a side effect. scripts/verify-quiz.ts duplicates
// these literals for that reason; keep them in sync by hand.
type ConnectionsPuzzle = { title: string; clue: string; answer: string; images?: string[] };

const CONNECTIONS_IMAGES = ["/quiz/connect-1-a.svg", "/quiz/connect-1-b.svg", "/quiz/connect-1-c.svg", "/quiz/connect-1-d.svg"];
const CONNECTIONS_PUZZLES: ConnectionsPuzzle[] = [
  {
    title: "Puzzle 1: Two pictures. One shared technical term.",
    clue: "A data structure and a way to organize things.",
    answer: "heap sort",
    images: ["/quiz/heap.png", "/quiz/sort.png"],
  },
  {
    title: "Puzzle 2: Three pictures. One shared technical term.",
    clue: "Gamers chase it. AI depends on it.",
    answer: "gpu",
    images: ["/quiz/p2-a.png", "/quiz/p2-b.png", "/quiz/p2-c.png"],
  },
  {
    title: "Puzzle 3: Two pictures. One shared technical term.",
    clue: "A digital chain that remembers everything.",
    answer: "blockchain",
    images: ["/quiz/p3-b.png", "/quiz/p3-c.png"],
  },
  {
    title: "Puzzle 4: Three pictures. One shared technical term.",
    clue: "A framework where mathematics meets AI.",
    answer: "pytorch",
    images: ["/quiz/p4-a.png", "/quiz/p4-b.png", "/quiz/p4-c.png"],
  },
  {
    title: "Puzzle 5: Three pictures. One shared technical term.",
    clue: "Different apps. One common language.",
    answer: "api",
    images: ["/quiz/p5-a.png", "/quiz/p5-b.png", "/quiz/p5-c.png"],
  },
];

// ── Round 2 — Warm-up MCQs (8 questions, flat scoring, no reveal) ───────────
type Mcq = { q: string; options: string[]; correct: number; hint?: string; image?: string };

const ROUND_2: Mcq[] = [
  { q: "Who created Python?", options: ["Dennis Ritchie", "Guido van Rossum", "James Gosling", "Bjarne Stroustrup"], correct: 1 },
  { q: "What is Java's official mascot?", options: ["Duke", "Tux", "Gopher", "Red Hat Guy"], correct: 0 },
  { q: "A dark monochrome silhouette of a half-cat, half-octopus mascot (\"Octocat\") represents which platform?", options: ["GitLab", "GitHub", "Bitbucket", "SourceForge"], correct: 1 },
  { q: "The blue-and-white infinity loop logo belongs to which JavaScript library?", options: ["Vue.js", "React", "Angular", "Svelte"], correct: 1 },
  { q: "Which company released the GPT-5.6 model family in 2026?", options: ["Google", "Anthropic", "OpenAI", "Meta"], correct: 2 },
  { q: "A model trained on labeled spam/not-spam emails uses which type of learning?", options: ["Unsupervised Learning", "Supervised Learning", "Reinforcement Learning", "Semi-supervised Learning"], correct: 1 },
  { q: "Grouping customers into similar categories without predefined labels is an example of:", options: ["Classification", "Clustering (Unsupervised Learning)", "Regression", "Reinforcement Learning"], correct: 1 },
  { q: "Predicting the exact price of a house is an example of:", options: ["Classification", "Regression", "Clustering", "Dimensionality Reduction"], correct: 1 },
  { q: "Which component introduces non-linearity into a neural network?", options: ["Loss Function", "Activation Function", "Optimizer", "Regularizer"], correct: 1 },
  { q: "A model performs very well on training data but poorly on unseen data. This is called:", options: ["Underfitting", "Overfitting", "Regularization", "Backpropagation"], correct: 1 },
  { q: "Which type of learning allows an agent to learn through rewards and penalties without labeled data?", options: ["Supervised Learning", "Reinforcement Learning", "Unsupervised Learning", "Transfer Learning"], correct: 1 },
  { q: "What is the process called when a deployed AI model generates predictions or responses without updating its weights?", options: ["Training", "Backpropagation", "Inference", "Fine-tuning"], correct: 2 },
  { q: "Retrieval-Augmented Generation (RAG) primarily improves an LLM by:", options: ["Increasing the number of model parameters", "Fetching relevant external documents to ground the answer", "Replacing the neural network with a database", "Removing the context window"], correct: 1 },
  {
    q: `What is the output of this C++ snippet?

#include <iostream>
using namespace std;

int f(int &x, int y) {
    static int count = 0;
    count++;
    if (y == 0) return count;
    x += y;
    return f(x, y - 1) + x;
}

int main() {
    int a = 0;
    cout << f(a, 3);
}`,
    options: ["15", "10", "22", "28"],
    correct: 2,
  },
  { q: "Java: int a = 5; int b = a++ + ++a; What is the value of b?", options: ["10", "11", "12", "13"], correct: 2 },
  { q: "In C++, overriding a virtual function enables:", options: ["No further inheritance", "Runtime polymorphism via vtable", "Forces static binding", "Disables overloading"], correct: 1 },
  { q: "In C++, what happens if an exception has no matching catch block anywhere?", options: ["Silently ignored", "std::terminate() is called", "Compile-time error", "Automatically logged and suppressed"], correct: 1 },
  { q: "Which Tamil movie features a masked vigilante, similar to Spider-Man?", options: ["Hero", "Ethir Neechal", "Thiruchitrambalam", "Velaikkaran"], correct: 0 },
  { q: "Which Tamil actor dubbed Spider-Man (Peter Parker) in the Tamil version of Spider-Man: Homecoming?", options: ["Sivakarthikeyan", "Mirchi Vijay", "Rio Raj", "M. M. Manasi"], correct: 1 },
  { q: "Which Kollywood movie best matches the Spider-Verse concept of alternate realities?", options: ["Maanaadu", "VIP", "Thani Oruvan", "Beast"], correct: 0 },
];

// ── Round 3 — Multiverse Abilities (20 questions, each carries a hint the ───
// ── comeback meter's "Goblin Intel" ability can unlock) ─────────────────────
const ROUND_3: Mcq[] = [
  {
    q: "What is the main purpose of the Banker's Algorithm in operating systems?",
    options: [
      "A) To speed up CPU scheduling",
      "B) To avoid deadlock by only granting requests that leave the system in a safe state",
      "C) To manage file storage",
      "D) To assign process priorities",
    ],
    correct: 1,
    hint: "Focus on preventing resource deadlocks by checking for safe states.",
  },
  {
    q: "In paging, what does the \"offset\" part of a virtual address represent?",
    options: [
      "A) The page number",
      "B) The frame number",
      "C) The exact location of the data within a page/frame",
      "D) The process ID",
    ],
    correct: 2,
    hint: "It specifies the exact byte location within a page or frame.",
  },
  {
    q: "What is a \"cascading rollback\" in database concurrency control?",
    options: [
      "A) When one transaction's failure forces other dependent transactions to also roll back",
      "B) When a transaction commits early",
      "C) When two transactions run in parallel successfully",
      "D) When a database backup fails",
    ],
    correct: 0,
    hint: "A domino effect of transaction rollbacks when uncommitted data was read.",
  },
  {
    q: "A B+ tree index has all data pointers in leaf nodes. What advantage does this give over a B-tree?",
    options: [
      "A) Faster random access",
      "B) Efficient range queries via linked leaf nodes",
      "C) Smaller tree height always",
      "D) No advantage",
    ],
    correct: 1,
    hint: "Leaf nodes form a doubly-linked list allowing linear range scans.",
  },
  {
    q: "What is the primary purpose of CSMA/CD in Ethernet networks?",
    options: [
      "A) Encryption of frames",
      "B) Detecting and handling collisions on a shared medium",
      "C) Routing packets between networks",
      "D) Error correction of corrupted frames",
    ],
    correct: 1,
    hint: "Carrier Sense Multiple Access with Collision Detection.",
  },
  {
    q: "How many subnets are created if a /24 network is divided using a /27 mask?",
    options: ["A) 4", "B) 8", "C) 16", "D) 32"],
    correct: 1,
    hint: "2^(27 - 24) = 2^3 subnets.",
  },
  {
    q: "What is the time complexity of the standard 0/1 Knapsack DP solution for n items and capacity W?",
    options: ["A) O(n)", "B) O(nW)", "C) O(2ⁿ)", "D) O(n log W)"],
    correct: 1,
    hint: "Pseudo-polynomial time complexity based on items and total capacity.",
  },
  {
    q: "To detect a cycle in a linked list in O(n) time and O(1) space, which technique is used?",
    options: [
      "A) Hash set of visited nodes",
      "B) Floyd's cycle detection (slow/fast pointers)",
      "C) Reversing the list",
      "D) Recursive traversal",
    ],
    correct: 1,
    hint: "Tortoise and Hare algorithm.",
  },
  {
    q: `What's the issue with this C++ code?\n\nclass A {\npublic:\n  ~A() { cout << "A destroyed"; }\n};\nclass B : public A {\npublic:\n  ~B() { cout << "B destroyed"; }\n};\nA *obj = new B();\ndelete obj;`,
    options: [
      "A) Compilation error",
      "B) Undefined behavior — non-virtual base destructor causes only \"A destroyed\" to print, leaking B's resources",
      "C) Both destructors called correctly",
      "D) Memory leak only, no other issue",
    ],
    correct: 1,
    hint: "Base class destructor is missing the virtual keyword.",
  },
  {
    q: `What prints in Python?\n\nclass Node:\n    def __init__(self, val, children=[]):\n        self.val = val\n        self.children = children\n\nn1 = Node(1)\nn2 = Node(2)\nn1.children.append("x")\nprint(n2.children)`,
    options: ["A) []", "B) ['x']", "C) Error", "D) [None]"],
    correct: 1,
    hint: "Default list parameters in Python functions/methods are mutable and shared across instances.",
  },
  {
    q: `What is the output of this C snippet?\n\n#define SQUARE(x) x*x\nint result = 100 / SQUARE(5);\nprintf("%d", result);`,
    options: ["A) 4", "B) 100", "C) 500", "D) 200"],
    correct: 1,
    hint: "Macro expansion replaces it as 100 / 5 * 5 without parenthesis.",
  },
  {
    q: `What is the output of this Java snippet?\n\npublic class Test {\n    public static void main(String[] args) {\n        int[] arr = new int[3];\n        System.out.println(arr[0]);\n        String[] sArr = new String[3];\n        System.out.println(sArr[0]);\n    }\n}`,
    options: ["A) 0, null", "B) null, 0", "C) Error, Error", "D) 0, 0"],
    correct: 0,
    hint: "Primitive int arrays default to 0, Object reference arrays default to null in Java.",
  },
  {
    q: `What prints in Python?\n\nx = 10\ndef outer():\n    x = 20\n    def inner():\n        nonlocal x\n        x = 30\n    inner()\n    print(x)\nouter()\nprint(x)`,
    options: ["A) 30, 10", "B) 20, 10", "C) 30, 30", "D) 20, 20"],
    correct: 0,
    hint: "nonlocal binds x to outer's scope, while global x remains 10.",
  },
  {
    q: "Which sorting algorithm has the best average-case performance but worst-case O(n²)?",
    options: ["A) MergeSort", "B) HeapSort", "C) QuickSort", "D) BubbleSort"],
    correct: 2,
    hint: "It uses partitioning around a pivot, which degrades to O(n²) on sorted arrays with bad pivot choices.",
  },
  {
    q: "A client sends multiple HTTP requests over a single TCP connection without waiting for each response before sending the next. This technique is called:",
    options: ["A) Multiplexing", "B) HTTP pipelining", "C) Load balancing", "D) Connection pooling"],
    correct: 1,
    hint: "Introduced in HTTP/1.1 to send requests sequentially on one TCP socket.",
  },
  {
    q: "What will this JavaScript snippet print?",
    image: "/quiz/r3-code-q16.png",
    options: ["A) true, true", "B) false, true", "C) false, false", "D) true, false"],
    correct: 1,
    hint: "Floating point precision issues in JS (0.1 + 0.2 === 0.30000000000000004) and array coercion ([1,2,3] == '1,2,3').",
  },
  {
    q: "Which isolation level prevents dirty reads but still allows non-repeatable reads?",
    options: ["A) Read Uncommitted", "B) Read Committed", "C) Repeatable Read", "D) Serializable"],
    correct: 1,
    hint: "Standard ANSI SQL isolation level that only reads committed rows.",
  },
  {
    q: "Guess the Celebrity:",
    image: "/quiz/r3-garfield.png",
    options: ["A) Logan Lerman", "B) Andrew Garfield", "C) Jamie Bell", "D) Nicholas Hoult"],
    correct: 1,
    hint: "He played Spider-Man in The Amazing Spider-Man!",
  },
  {
    q: "Guess the series by its pixelated title:",
    image: "/quiz/r3-strangerthings.png",
    options: ["A) Twin Peaks", "B) Dark", "C) Castle Rock", "D) Stranger Things"],
    correct: 3,
    hint: "Popular Netflix sci-fi series set in Hawkins, Indiana.",
  },
  {
    q: "This 1938 logo, resembling a postage stamp with three stars and Korean lettering, was the original logo of a company that started out trading dried fish, noodles, and groceries. Which tech giant is it?",
    image: "/quiz/r3-samsung.png",
    options: ["A) LG", "B) Samsung", "C) Hyundai", "D) Sony"],
    correct: 1,
    hint: "'Samsung' translates to 'three stars' in Korean.",
  },
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
  const proctorFlags = await collections.proctorFlags();
  const quizState = await collections.quizState();

  const isIfEmpty = process.argv.includes("--if-empty");
  const existingCount = await challenges.countDocuments({ type: "quiz" });
  if (isIfEmpty && existingCount > 0) {
    console.log("Database already seeded — preserving all existing assigned teams and coins.");
    const adminCodeRecord = await codes.findOne({ role: "admin" });
    if (!adminCodeRecord) {
      const adminTeamId = new ObjectId();
      await teams.insertOne({ _id: adminTeamId, name: "Quiz Control", createdAt: new Date() });
      const adminId = new ObjectId();
      await participants.insertOne({ _id: adminId, teamId: adminTeamId, name: "Quiz coordinator", role: "admin", createdAt: new Date() });
      await codes.insertOne({ codeHash: hashCode("1684"), teamId: adminTeamId, participantId: adminId, role: "admin", redeemedAt: null });
    }
    return;
  }

  console.log("Clearing previous quiz state…");
  await withThrottleRetry(() => participants.deleteMany({}));
  await withThrottleRetry(() => codes.deleteMany({}));
  await withThrottleRetry(() => teams.deleteMany({}));

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
  await withThrottleRetry(() => proctorFlags.deleteMany({}));

  // Reset the state machine too, or seeding leaves the database incoherent:
  // `quiz_state` still claims the quiz is running — carrying round start
  // timestamps from the previous session — while every team, serve and
  // submission behind that claim has just been deleted. Round 1's clock then
  // reads as however long ago the last run began, so the first team to join is
  // already out of time on a quiz nobody has started.
  //
  // Same field set the coordinator's Restart Quiz button writes, so seeding and
  // restarting leave the database in exactly the same place.
  await withThrottleRetry(() =>
    quizState.updateOne(
      { _id: "quiz" },
      {
        $set: {
          ended: false,
          endedAt: null,
          started: false,
          startedAt: null,
          round1StartedAt: null,
          round2StartedAt: null,
          round3StartedAt: null,
        },
      },
      { upsert: true }
    )
  );

  const adminTeamId = new ObjectId();
  await teams.insertOne({ _id: adminTeamId, name: "Quiz Control", createdAt: new Date() });
  const adminId = new ObjectId();
  await participants.insertOne({ _id: adminId, teamId: adminTeamId, name: "Quiz coordinator", role: "admin", createdAt: new Date() });
  const adminCode = "1684";
  await codes.insertOne({ codeHash: hashCode(adminCode), teamId: adminTeamId, participantId: adminId, role: "admin", redeemedAt: null });

  console.log("Seeding questions…");
  const docs: Challenge[] = [];

  // Round 1, Game 1 — Image Replication. opensAt/closesAt start null; the
  // coordinator opens the 5-minute window on the day with `quiz-admin.ts open`.
  // The master lives in `private/reference/` — deliberately NOT under
  // `public/`, where anyone could download it by guessing the path. Seeding
  // produces the same two copies `scripts/set-reference.ts` does: the
  // full-resolution master for the vision judge, and a downscaled display
  // copy which is the only version a browser is ever sent.
  let refDataUrl: string | undefined;
  let refDisplayDataUrl: string | undefined;

  const masterDir = path.join(process.cwd(), "private", "reference");
  const master = fs.existsSync(masterDir)
    ? fs.readdirSync(masterDir).find((f) => /^image-1\.(jpe?g|png|webp)$/i.test(f))
    : undefined;

  if (master) {
    const bytes = fs.readFileSync(path.join(masterDir, master));
    const mime = /\.png$/i.test(master) ? "image/png" : /\.webp$/i.test(master) ? "image/webp" : "image/jpeg";
    refDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    const displayBuf = await sharp(bytes)
      .resize({ width: 900, withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
    refDisplayDataUrl = `data:image/jpeg;base64,${displayBuf.toString("base64")}`;
  } else {
    console.warn(
      "  ! No reference master in private/reference/ — Game 1 will have no image.\n" +
        "    Load one with: npx tsx --env-file=.env.local scripts/set-reference.ts image-1 <file>"
    );
  }

  docs.push({
    type: "quiz",
    slug: "image-1",
    title: "Recreate the reference image using an AI image generator",
    points: 10,
    opensAt: null,
    closesAt: null,
    config: {
      round: 1,
      format: "prompt-image",
      order: 1,
      referenceImage: refDataUrl ? true : undefined,
      referenceDataUrl: refDataUrl,
      referenceDisplayDataUrl: refDisplayDataUrl,
    },
  });

  // Round 1, Game 2 — Connections: 5 puzzles in sequence, played after Image
  // Replication and before the Memory Game — see `lib/quiz/round1.ts` for
  // the sequencing, both across games and within this one across puzzles.
  CONNECTIONS_PUZZLES.forEach((p, i) => {
    docs.push({
      type: "quiz",
      slug: `connections-${i + 1}`,
      title: p.title,
      points: 8,
      opensAt: null,
      closesAt: null,
      config: {
        round: 1,
        format: "connections",
        order: 2,
        connectionsImages: p.images ?? CONNECTIONS_IMAGES,
        connectionsPuzzleIndex: i + 1,
        connectionsClue: p.clue,
        connectionsRevealedCount: 0,
        answerHash: hashAnswer(p.answer),
      },
    });
  });

  // Round 1, Game 3 — Memory Game.
  docs.push({
    type: "quiz",
    slug: "memory-1",
    title: "Match every Spider-Verse variant pair",
    points: 16,
    opensAt: null,
    closesAt: null,
    // memoryFlipCap: 16 is the true minimum to clear 8 pairs (2 flips each) —
    // no falloff room at all, so this is binary: finish in exactly 16 for
    // full points, or the grid locks at 0. Confirmed with the coordinator as
    // intentional, not the earlier par/cap-with-partial-credit default.
    config: { round: 1, format: "memory", order: 3, memoryPairs: 8, memoryFlipCap: 14 },
  });

  // Questions 15-20 in rounds 2 and 3 are the lighter/pop-culture-adjacent
  // ones mixed in with the technical set — worth less than the core
  // questions, per the coordinator's call.
  const FUN_QUESTION_POINTS = 25;
  const isFunQuestionIndex = (i: number) => i >= 14 && i <= 19; // 0-indexed positions of questions 15-20

  ROUND_2.forEach((m, i) => {
    docs.push({
      type: "quiz",
      slug: `r2-q${i + 1}`,
      title: m.q,
      points: isFunQuestionIndex(i) ? FUN_QUESTION_POINTS : 100,
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
      points: i >= 17 && i <= 19 ? FUN_QUESTION_POINTS : 100,
      opensAt: null,
      closesAt: null,
      config: { round: 3, format: "mcq", order: i + 1, options: m.options, correctIndex: m.correct, hint: m.hint, image: m.image },
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

  console.log(
    `\nSeeded 3 round-1 games (sequential: image -> connections [${CONNECTIONS_PUZZLES.length} puzzles] -> memory), ${ROUND_2.length} round-2 and ${ROUND_3.length} round-3 questions.`
  );
  console.log("Before Round 1 runs: npx tsx scripts/set-reference.ts image-1 ./reference.jpg");
  console.log("Then on the day: open image-1 from the dashboard, and open/reveal each connections-N puzzle live from its reveal panel.");
  console.log("Connections art is still the assets repo's PLACEHOLDER frames, and every puzzle answer is a dev-only stand-in --");
  console.log("replace the tiles, clues and answers with the coordinator's real assignment before the event.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
