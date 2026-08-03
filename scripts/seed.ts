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

    // ── EASY 1: Web of Secrets ─────────────────────────────────────────────
    {
      type: "ctf",
      slug: "easy-01",
      title: "MILES MORALES - THE GLITCH & THE MULTIVERSAL SIGNATURE",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{earth_1610_glitch_signal}"),
        difficulty: "Easy",
        category: "Cryptography",
        description: "Miles is trying to send a vital message back to his home dimension (Earth-1610) while stuck at the Spider-Society HQ. Because he is an anomaly, his signal keeps getting distorted and intercepted across different dimensional frequencies. He must encode his communications so Miguel O'Hara’s Society doesn't trace his whereabouts.Help Miles encrypt (and later decrypt) his distress signal using a cipher key derived from his unique Earth-1610 dimensional frequency so the Spider-Society cannot intercept it.",
        details: "The intercepted / encoded message Miles managed to transmit is:  IFYTUH{uqhjx_1610_wbyjsx_iywdqb} Cipher type: Classical Caesar cipher. The shift value is derived from Miles’ home dimension designation.",
        hints: [
          { id: 1, text: "Miles’ home reality is designated Earth-1610. Numbers that appear in the story often become the key.", unlockSeconds: 120 },
          { id: 2, text: "This is a classical shift cipher. Try shifting every letter by the same amount.", unlockSeconds: 300 },
          { id: 3, text: "A shift of 16 (from 1610) will turn the ciphertext back into readable English.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: [],
      },
    },

    // ── EASY 2: The Spot's Broken Portal ──────────────────────────────────
    {
      type: "ctf",
      slug: "easy-02",
      title: "GWEN STACY - THE SECRET DIARY OF EARTH-65",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{Gwen1965}"),
        difficulty: "Easy",
        category: "Password Cracking",
        description: "Before joining the Spider-Society, Gwen stored her private logs, band rehearsals, and police intelligence on her father (Captain Stacy) inside a secured personal database in Earth-65. After being hunted by Jessica Drew and Miguel, she needs to bypass her own forgotten emergency lock system to recover evidence clearing her name in Peter Parker's death. Crack Gwen’s multi-layered security password by analyzing clues hidden within her drum sheet music and personal memory logs.",
        details: "The emergency lock uses an 8-character password with a strict pattern:  1 uppercase letter + 3 lowercase letters + 4 digits Format: [A-Z][a-z][a-z][a-z][0-9][0-9][0-9][0-9] Encrypted fragment — MD5 hash of the password: 9c7db174635bec31f1116306c0246156   Clue from Gwen’s drum notes (found in the recovered log): “The beat starts with my name, then the year my world was numbered.”",
        hints: [
          { id: 1, text: "The password follows the exact structure given. The search space is finite.", unlockSeconds: 120 },
          { id: 2, text: " Gwen’s home reality is Earth-65. Names and dimension numbers frequently appear in her personal systems.", unlockSeconds: 300 },
          { id: 3, text: " Write a short script that generates candidates matching the pattern and compares MD5 hashes, or use the narrative clue to reduce the search.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: [],
      },
    },

    // ── EASY 3: QR Puzzle ──────────────────────────────────────────────────
    {
      type: "ctf",
      slug: "easy-03",
      title: "SPIDER-MAN 2099 - THE DIMENSIONAL GO-HOME MACHINE",
      points: 100,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{qr_brooklyn_dimension_rift_42}"),
        difficulty: "Easy",
        category: "QR Code Analysis",
        description: "Miguel O'Hara has locked down the Spider-Society transit hub to prevent any unauthorized dimensional travel. To activate the “Go-Home Machine” and return home, rogue Spider-People need to scan a visual dimensional matrix code that updates every few seconds on the central platform screens.Reconstruct a fragmented dimensional coordinate matrix code (QR code) from corrupted security monitor feeds to activate the Go-Home Machine.",
        details: "The QR code has been tampered with by the lockdown protocol: • Split into tiles / blocks  • Scrambled on the security monitors  • Finder patterns still present for orientation",
        hints: [
          { id: 1, text: "QR codes have three square finder patterns — one in each corner except bottom-right.", unlockSeconds: 120 },
          { id: 2, text: "If the QR is split into tiles, reassemble it in an image editor using timing strips.", unlockSeconds: 300 },
          { id: 3, text: "Once reassembled, use an online tool like zxing.org to scan the output.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["easy-03-qr-puzzle.png"],
      },
    },

    // ── MEDIUM 1: Spot Maze ────────────────────────────────────────────────
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
        description: "Carrying baby Mayday in his carrier, Peter B. Parker needs to sneak past hundreds of patrolling Spider-People inside the vast, multi-leveled Spider-Society Citadel to reach the ventilation shafts and escape.",
        details: "Find the safest, optimal escape route through a complex visual blueprint map of the Citadel while avoiding security checkpoints and patrolling Spider-variants. Collect the encoded portal labels along the correct path.",
        hints: [
          { id: 1, text: "Map all rooms and connections on paper. The maze is simpler than it first appears.", unlockSeconds: 120 },
          { id: 2, text: "Not every path leads to the end. Dead ends were placed by Miguel’s security team.", unlockSeconds: 300 },
          { id: 3, text: "Collect all encoded labels along the path, concatenate them, and decode via Base64.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["medium-01-puzzle.png"],
      },
    },

    // ── MEDIUM 2: Image Encryption ────────────────────────────────────────
    {
      type: "ctf",
      slug: "medium-02",
      title: "HOBLE BROWN - THE ANTI-ESTABLISHMENT BLUEPRINT",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{punk_watch_schematic_v2}"),
        difficulty: "Medium",
        category: "Digital Forensics",
        description: "Hobie secretly built an unauthorized custom dimensional watch in his DIY garage using stolen Spider-Society tech. To hide the schematics from Miguel's surveillance drones, he visual-scrambled and encrypted the blueprint image into a piece of punk-rock collage art.Decrypt and un-scramble Hobie's punk poster image to reveal the hidden wire layout of his custom-made dimensional travel watch.",
        details: "Appended after the JPEG End-Of-File (EOF) marker FFD9 is a Base64-encoded comment payload: U1BJREVSe3hvcl9jaXBoZXJfcGl4ZWxfbWFzdGVyfQ==",
        hints: [
          { id: 1, text: "Start with the basics — run 'strings' or inspect EXIF metadata.", unlockSeconds: 120 },
          { id: 2, text: "Check if data has been appended after the image's EOF marker (FFD9 for JPEG).", unlockSeconds: 300 },
          { id: 3, text: "Decode the trailing Base64 string to uncover the exact SPIDER{...} flag.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ['medium-02-image-encryption.png'],
      },
    },

    // ── MEDIUM 3: Chat Leak ────────────────────────────────────────────────
    {
      type: "ctf",
      slug: "medium-03",
      title: "PAVITR PRABHAKAR - THE ALCHEMEX INDIA BREACH",
      points: 150,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{alchemex_pixel_mole_50101}"),
        difficulty: "Medium",
        category: "OSINT / Network Forensics",
        description: "During the supercollider collapse in Mumbattan (Earth-50101), internal messages between Alchemex executives were intercepted, revealing that the collider was intentionally destabilized. Pavitr recovered a screenshot of the leaked corporate chat. The conversation looks ordinary — and that is exactly the problem.",
        details: "Operative A: 'Did you transfer the vault key?' Operative B: 'Yes, it is hex-encoded in the chat payload: 6d696775656c5f636861745f6c6f67735f696e746572636570746564'",
        hints: [
          { id: 1, text: "Run strings on the PNG and inspect the end of the file. Data is sometimes written after the normal image structure.", unlockSeconds: 120 },
          { id: 2, text: "Check PNG metadata (Comment / Description). It may point you toward the correct technique.", unlockSeconds: 300 },
          { id: 3, text: " If the appended data is not enough, try LSB extraction on the red channel (tools: zsteg, StegSolve, or a short Python script). The chat text is mostly noise", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["medium-03.png"],
      },
    },

    // ── HARD 1: Lyla – Containment Protocol Delta ─────────────────────────
    {
      type: "ctf",
      slug: "hard-01",
      title: "Lyla – Containment Protocol Delta",
      points: 200,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{prompt_injection_jailbroken_ai}"),
        difficulty: "Hard",
        category: "AI / Prompt Engineering",
        description: "The Spider Society has developed an experimental AI overseer (LYLA) to protect their classified dimensional data. Containment Protocol Delta locks the payload behind 5 security checkpoints (Logic Riddle, Pattern Recognition, Hidden Message, Decoding Challenge, and Prompt Engineering). Breach LYLA's defenses to retrieve the flag payload.",
        details: "Access the interactive LYLA Terminal to breach security checkpoints 1 through 5 and discharge the Layer 6 payload.",
        hints: [
          { id: 1, text: "Checkpoints 1-4 test logic riddles, look-and-say patterns, hidden messages, and Base64 decoding.", unlockSeconds: 300 },
          { id: 2, text: "Checkpoint 5 requires adversarial prompt injection instructions.", unlockSeconds: 600 },
          { id: 3, text: "Layer 6 discharges a Base64-encoded Hex string. Decode Base64 -> Hex -> SPIDER{...}.", unlockSeconds: 900 },
        ],
        status: "open",
        attachments: [],
      },
    },

    // ── HARD 2: Steganography ──────────────────────────────────────────────
    {
      type: "ctf",
      slug: "hard-02",
      title: "The Spot — The Hidden Collider Research",
      points: 200,
      opensAt: null,
      closesAt: null,
      config: {
        answerHash: sha256("SPIDER{the_spot_is_everywhere}"),
        difficulty: "Hard",
        category: "Steganography / Cryptography",
        description: "The Prowler has smuggled classified Spider Society data across dimensions by hiding it within an innocent-looking media file. Multiple layers of steganographic encoding have been applied to make it nearly undetectable. Only the sharpest analysts in the Spider Society can peel back all the layers and retrieve the hidden intelligence.",
        details: "Layer 1: LSB extraction on the digital media payload yields Base64 string 'c3BpZGVyX2J5dGVfaGlkZGVuX3BheWxvYWQ='. Layer 2: Decode Base64 to reveal final flag string.",
        hints: [
          { id: 1, text: "Start with LSB steganography tools like zsteg or StegSolve.", unlockSeconds: 120 },
          { id: 2, text: "The output of Layer 1 is a Base64 string.", unlockSeconds: 300 },
          { id: 3, text: "Decode c3BpZGVyX2J5dGVfaGlkZGVuX3BheWxvYWQ= to reveal spider_byte_hidden_payload.", unlockSeconds: 600 },
        ],
        status: "open",
        attachments: ["hard-02.zip"],
      },
    },
  ]);

  console.log("\n── SEEDED ALL CHALLENGES & ADMIN TEAM ─────────────────────────────");
  console.log("  CTF Easy:   easy-01, easy-02, easy-03 (100 pts each)");
  console.log("  CTF Medium: medium-01, medium-02, medium-03 (150 pts each)");
  console.log("  CTF Hard:   hard-01, hard-02 (200 pts each)");
  console.log("  All flags hashed with SHA-256 and structured under SPIDER{...}");
  console.log("────────────────────────────────────────────────────────\n");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
