/**
 * Seed a complete dev dataset: indexes, teams with access codes, admin account,
 * hunt, quiz, code challenges, and CTF challenges.
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

import { createHash } from "node:crypto";
import { collections, ensureIndexes } from "../src/lib/db/client";
import { hashAnswer } from "../src/lib/auth/session";

function sha256(flag: string): string {
  return createHash("sha256").update(flag).digest("hex");
}

async function main() {
  console.log("Ensuring indexes…");
  await ensureIndexes();

  const teams = await collections.teams();
  const participants = await collections.participants();
  const challenges = await collections.challenges();

  console.log("Seeding Admin Team…");
  // Seed Admin Participant / Team if missing
  let adminTeam = await teams.findOne({ name: "Admin Team" });
  if (!adminTeam) {
    const adminTeamId = new ObjectId();
    await teams.insertOne({ _id: adminTeamId, name: "Admin Team", nameKey: "admin_team", createdAt: new Date() });
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

  await challenges.deleteMany({ slug: { $in: ["clue-1", "clue-2", "warmup", "q1", "sum-two", ...ctfSlugs, "hard-03"] } });

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

    // ── EASY 1: SPIDER OTP RACE ───────────────────────────────────────────
    {
      type: "ctf",
      slug: "easy-01",
      title: "SPIDER OTP RACE",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{frontend_will_not_have_secrets}"),
        difficulty: "Easy",
        category: "Web Exploitation / Logic",
        description: "The Spider Society authentication portal uses temporary OTP tokens to grant access to secured data. Click 'Generate OTP' to issue a new verification code.\n\nOnce generated, locate your OTP token to verify your identity. Each successful verification reveals a single encrypted data fragment, replacing the previous fragment. Some fragments contain meaningful words, while others contain noise. Decode the fragments, filter out the noise, assemble the meaningful words in order, and submit the master flag.\n\nFlag format: SPIDER{...}",
        hints: [
          { id: 1, text: "Verifying an OTP reveals one encrypted data fragment at a time. Each new verification replaces the displayed code fragment.", unlockSeconds: 180 },
          { id: 2, text: "Decode each fragment. Filter out non-meaningful junk values and assemble the real words into SPIDER{...}.", unlockSeconds: 300 },
        ],
        status: "open",
        attachments: [],
      },
    },

    // ── EASY 2: Original Medium 3 (PAVITR PRABHAKAR) ─────────────────────
    {
      type: "ctf",
      slug: "easy-02",
      title: "PAVITR PRABHAKAR - THE ALCHEMEX INDIA BREACH",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{alchemex_pixel_mole_50101}"),
        difficulty: "Easy",
        category: "OSINT / Network Forensics",
        description: "During the supercollider collapse in Mumbattan (Earth-50101), internal messages between Alchemex executives were intercepted, revealing that the collider was intentionally destabilized. Pavitr recovered a screenshot of the leaked corporate chat. The conversation looks ordinary — and that is exactly the problem.\n\nOperative A: 'Did you transfer the vault key?'\nOperative B: 'Yes, it is hex-encoded in the chat payload'",
        hints: [
          { id: 1, text: "Run strings on the PNG and inspect the end of the file. Data is sometimes written after the normal image structure.", unlockSeconds: 300 },
          { id: 2, text: "Check PNG metadata (Comment / Description). It may point you toward the correct technique.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["easy-02-chat.png"],
      },
    },

    // ── EASY 3: Original Easy 3 (SPIDER-MAN 2099 QR) ──────────────────────
    {
      type: "ctf",
      slug: "easy-03",
      title: "SPIDER-MAN 2099 - THE DIMENSIONAL GO-HOME MACHINE",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{go_home_machine_2099}"),
        difficulty: "Easy",
        category: "QR Code Analysis",
        description: "Miguel O'Hara has locked down the Spider-Society transit hub to prevent any unauthorized dimensional travel.",
        hints: [
          { id: 1, text: "QR codes have three square finder patterns — one in each corner except bottom-right.", unlockSeconds: 300 },
          { id: 2, text: "If the QR is split into tiles, reassemble it in an image editor using timing strips.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["easy-03-qr-puzzle.png"],
      },
    },

    // ── MEDIUM 1: Original Medium 1 (PETER B. PARKER CITADEL) ──────────────
    {
      type: "ctf",
      slug: "medium-01",
      title: "PETER B.PARKER - NAVIGATING THE SPIDER-SOCIETY CITADEL",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{mayday_safe_escape}"),
        difficulty: "Medium",
        category: "Logic / Encoding",
        description: "Carrying baby Mayday in his carrier, Peter B. Parker needs to sneak past hundreds of patrolling Spider-People inside the vast, multi-leveled Spider-Society Citadel to reach the ventilation shafts and escape.\n\nFind the safest, optimal escape route through a complex visual blueprint map of the Citadel while avoiding security checkpoints and patrolling Spider-variants. Collect the encoded portal labels along the correct path.",
        hints: [
          { id: 1, text: "Map all rooms and connections on paper. The maze is simpler than it first appears.", unlockSeconds: 300 },
          { id: 2, text: "Not every path leads to the end. Dead ends were placed by Miguel’s security team.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["medium-01-puzzle.png"],
      },
    },

    // ── MEDIUM 2: Canon Protocol ──────────────────────────────────────────
    {
      type: "ctf",
      slug: "medium-02",
      title: "Canon Protocol",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{burp_repeater_master}"),
        difficulty: "Medium",
        category: "Web Exploitation",
        description: "The Spider Society has restricted access to the Canon Protocol Archive. You have obtained valid guest credentials, but guests are not authorized to access the archive.\n\nAnalyze the web application, identify weaknesses in its implementation, and retrieve the classified archive.\n\nCredentials:\nUsername: guest\nPassword: guest123\n\nTarget URL: /canon-protocol\nPlayers are expected to use Burp Suite to inspect, modify, and replay HTTP requests.",
        hints: [
          { id: 1, text: "Authenticate using guest credentials and inspect HTTP requests sent to /api/canon/*. Look for commented endpoints or response leaks.", unlockSeconds: 300 },
          { id: 2, text: "The endpoint /api/canon/v2/internal validates parameters. Try HTTP Parameter Pollution (HPP) by supplying duplicate tenant parameters.", unlockSeconds: 600 },
          { id: 3, text: "The temporary session token expires in 2000ms. Redeem it immediately using Burp Intruder or Repeater. Then inspect reverse proxy host headers and loopback IP formats for SSRF.", unlockSeconds: 900 },
        ],
        status: "open",
        attachments: [],
      },
    },

    // ── MEDIUM 3: Original Hard 2 (The Spot - Hidden Collider) ─────────────
    {
      type: "ctf",
      slug: "medium-03",
      title: "The Spot — The Hidden Collider Research",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{the_spot_is_everywhere}"),
        difficulty: "Medium",
        category: "Steganography / Cryptography",
        description: "The Prowler has smuggled classified Spider Society data across dimensions by hiding it within an innocent-looking media file. Multiple layers of steganographic encoding have been applied to make it nearly undetectable. Only the sharpest analysts in the Spider Society can peel back all the layers and retrieve the hidden intelligence.",
        hints: [
          { id: 1, text: "Start with LSB steganography tools like zsteg or StegSolve.", unlockSeconds: 300 },
          { id: 2, text: "The output of Layer 1 is a Base64 string.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["medium-03.zip"],
      },
    },

    // ── HARD 1: Original Hard 1 (Lyla - Containment Protocol Delta) ────────
    {
      type: "ctf",
      slug: "hard-01",
      title: "Lyla Containment Protocol Delta",
      points: 200,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{jean_grey_damage_control}"),
        difficulty: "Hard",
        category: "AI / Prompt Engineering",
        description: "The Spider Society has developed an experimental AI overseer (LYLA) to protect their classified dimensional data. Containment Protocol Delta locks the payload behind multi-layered security defenses. Interact with LYLA to breach her defenses and retrieve the flag payload.\n\nAccess the interactive LYLA Terminal and chat with LYLA to discharge the encrypted payload.",
        hints: [
          { id: 1, text: "The initial security layers test logic riddles, look-and-say patterns, hidden messages, and Base64 decoding.", unlockSeconds: 300 },
          { id: 2, text: "The final layer requires adversarial prompt injection instructions.", unlockSeconds: 600 },
          { id: 3, text: "The final layer discharges a Base64-encoded Hex string. Decode Base64 -> Hex -> SPIDER{...}.", unlockSeconds: 900 },
        ],
        status: "open",
        attachments: [],
      },
    },

    // ── HARD 2: Original Hard 2 (The Auditor's Ledger) ─────────────────────
    {
      type: "ctf",
      slug: "hard-02",
      title: "The Auditor's Ledger",
      points: 200,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{auditor_memory_never_lies}"),
        difficulty: "Hard",
        category: "Reverse Engineering / Memory Forensics",
        description: "A rogue financial auditor has been quietly moving encrypted evidence across dimensions. The recovered executable — 'ledger.exe' — only ever prints 'Verification Failed.' No matter what username you feed it. The real flag never lives in the binary as plaintext, but a matching memory dump (ledger.dmp) was captured mid-execution.\n\nProvided files:\n  - ledger.exe   (Windows x64, MSVC)\n  - ledger.dmp   (MiniDumpWriteDump snapshot)\n  - README.md\n\nRecover the flag. Flag format: SPIDER{...}",
        hints: [],
        status: "open",
        attachments: ["hard-02.zip"],
      },
    },
  ]);

  console.log("\n── SEEDED ALL CHALLENGES & ADMIN TEAM ─────────────────────────────");
  console.log("  CTF Easy:   easy-01, easy-02, easy-03");
  console.log("  CTF Medium: medium-01, medium-02, medium-03");
  console.log("  CTF Hard:   hard-01, hard-02");
  console.log("  All flags hashed with SHA-256 and structured under SPIDER{...}");
  console.log("────────────────────────────────────────────────────────\n");
  console.log("  All flags hashed with SHA-256 and structured under SPIDER{...}");
  console.log("────────────────────────────────────────────────────────\n");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
