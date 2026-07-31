/**
 * Seed a usable dev dataset: indexes, teams with access codes, and challenges per event.
 *
 * Run:  npx tsx scripts/seed.ts
 */
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
import { createHash, randomBytes } from "node:crypto";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { hashCode, hashAnswer, normaliseCode } from "../src/lib/auth/session";

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) =>
    Array.from(randomBytes(n))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `X26-${chunk(5)}-${chunk(5)}`;
}

function sha256(flag: string): string {
  return createHash("sha256").update(flag).digest("hex");
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
    const existingTeam = await teams.findOne({ name });
    let teamId = existingTeam?._id;
    if (!teamId) {
      teamId = new ObjectId();
      await teams.insertOne({ _id: teamId, name, createdAt: new Date() });
    }

    const existingPart = await participants.findOne({ teamId });
    if (!existingPart) {
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
    }

    await hunt.updateOne(
      { teamId, challengeSlug: "clue-1" },
      { $setOnInsert: { teamId, challengeSlug: "clue-1", unlockedAt: new Date(), solvedAt: null, hintsUsed: 0 } },
      { upsert: true }
    );
  }

  // Seed Admin Participant / Team if missing
  let adminTeam = await teams.findOne({ name: "Admin Team" });
  if (!adminTeam) {
    const adminTeamId = new ObjectId();
    await teams.insertOne({ _id: adminTeamId, name: "Admin Team", createdAt: new Date() });
    adminTeam = await teams.findOne({ _id: adminTeamId });
  }
  if (adminTeam?._id) {
    const adminParticipant = await participants.findOne({ role: "admin" });
    if (!adminParticipant) {
      await participants.insertOne({
        teamId: adminTeam._id,
        name: "Admin",
        role: "admin",
        createdAt: new Date(),
      });
    }
  }

  console.log("Seeding CTF and event challenges…");
  const ctfSlugs = [
    "easy-01",
    "easy-02",
    "easy-03",
    "medium-01",
    "medium-02",
    "medium-03",
    "hard-01",
    "hard-02",
  ];

  await challenges.deleteMany({ slug: { $in: ["clue-1", "clue-2", "warmup", "q1", "sum-two", ...ctfSlugs] } });

  await challenges.insertMany([
    // Hunt / Quiz / Code challenges
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
      type: "quiz",
      slug: "q1",
      title: "Which year is Miguel from?",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: { correctIndex: 2, limitSeconds: 30, speedBonus: 50 },
    },
    {
      type: "code",
      slug: "sum-two",
      title: "Sum two numbers",
      points: 300,
      opensAt: null,
      closesAt: null,
      config: { testsRef: "tests/sum-two.json" },
    },

    // ── EASY CTF CHALLENGES ───────────────────────────────────────────────
    {
      type: "ctf",
      slug: "easy-01",
      title: "Web of Secrets",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{web_of_secrets_multiverse_2026}"),
        difficulty: "Easy",
        category: "Web",
        description: "Explore the Spider-Society hidden web endpoint to intercept the secret access token.",
        initialPoints: 100,
        minimumPoints: 50,
        decayAfter: 3,
        firstBloodBonus: 30,
        status: "open",
        attachments: [],
      },
    },
    {
      type: "ctf",
      slug: "easy-02",
      title: "The Spot's Broken Portal",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{broken_portal_dimension_42}"),
        difficulty: "Easy",
        category: "Reverse Engineering",
        description: "The Spot left a malfunctioning interdimensional portal configuration. Inspect the dimensional coordinates.",
        initialPoints: 100,
        minimumPoints: 50,
        decayAfter: 3,
        firstBloodBonus: 30,
        status: "open",
        attachments: [],
      },
    },
    {
      type: "ctf",
      slug: "easy-03",
      title: "QR Puzzle",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{qr_spider_code_scanned_77}"),
        difficulty: "Easy",
        category: "Misc",
        description: "Decode the corrupted spider barcode found inside Gwen's sketchbook.",
        initialPoints: 100,
        minimumPoints: 50,
        decayAfter: 3,
        firstBloodBonus: 30,
        status: "open",
        attachments: [],
      },
    },

    // ── MEDIUM CTF CHALLENGES ─────────────────────────────────────────────
    {
      type: "ctf",
      slug: "medium-01",
      title: "Spot Maze",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{spot_maze_traversed_99}"),
        difficulty: "Medium",
        category: "Algorithms",
        description: "Navigate through Alchemax portal nodes to find the shortest exit route without falling into dark matter spots.",
        initialPoints: 150,
        minimumPoints: 75,
        decayAfter: 2,
        firstBloodBonus: 40,
        status: "open",
        attachments: [],
      },
    },
    {
      type: "ctf",
      slug: "medium-02",
      title: "Image Encryption",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{xor_cipher_pixel_master}"),
        difficulty: "Medium",
        category: "Crypto",
        description: "An encrypted blueprint image from Earth-42 was captured. Crack the key XOR cipher to reveal the flag.",
        initialPoints: 150,
        minimumPoints: 75,
        decayAfter: 2,
        firstBloodBonus: 40,
        status: "open",
        attachments: [],
      },
    },
    {
      type: "ctf",
      slug: "medium-03",
      title: "Chat Leak",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{miguel_chat_logs_intercepted}"),
        difficulty: "Medium",
        category: "Forensics",
        description: "Analyze the intercepted network PCAP packet capture between Miguel O'Hara and Lyla to extract confidential chat logs.",
        initialPoints: 150,
        minimumPoints: 75,
        decayAfter: 2,
        firstBloodBonus: 40,
        status: "open",
        attachments: [],
      },
    },

    // ── HARD CTF CHALLENGES ───────────────────────────────────────────────
    {
      type: "ctf",
      slug: "hard-01",
      title: "AI Escape Room",
      points: 225,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{prompt_injection_jailbroken_ai}"),
        difficulty: "Hard",
        category: "AI Safety",
        description: "Lyla's security guard model is locking down the Multiverse Headquarters. Perform prompt injection to bypass guardrails.",
        initialPoints: 225,
        minimumPoints: 100,
        decayAfter: 1,
        firstBloodBonus: 50,
        status: "open",
        attachments: [],
      },
    },
    {
      type: "ctf",
      slug: "hard-02",
      title: "Steganography",
      points: 225,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{hidden_in_the_spider_byte}"),
        difficulty: "Hard",
        category: "Steganography",
        description: "Hidden data encoded inside the low-order bits of Spider-Byte's digital avatar image. Extract the hidden payload.",
        initialPoints: 225,
        minimumPoints: 100,
        decayAfter: 1,
        firstBloodBonus: 50,
        status: "open",
        attachments: [],
      },
    },
  ]);

  console.log("\n── SEEDED CTF CHALLENGES ─────────────────────────────");
  console.log("  Easy:   easy-01, easy-02, easy-03 (100 pts each)");
  console.log("  Medium: medium-01, medium-02, medium-03 (150 pts each)");
  console.log("  Hard:   hard-01, hard-02 (225 pts each)");
  console.log("  Total Base Points: ~1200 points");
  console.log("────────────────────────────────────────────────────────\n");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
