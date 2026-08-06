import type { AvatarId } from "@/lib/db/types";

/**
 * The four Spider-Verse identities, and the physical coins that hand them out.
 *
 * A team is given a 3D-printed coin stamped with a two-digit number. The
 * number's RANGE decides the character. This is what the rules doc's "each
 * team logs in using its assigned token" means here: the coin IS the token —
 * one physical object is the ticket, the identity and the theme.
 *
 * The coin is NOT a credential. Two digits is 60 possible values, so anyone
 * could type numbers until they landed in someone else's session. That's a
 * deliberate trade for a one-field entry screen at a supervised event with
 * physical discs handed out in person — the coordinator's own access code
 * (the `code` path on /api/enter) stays the thing that proves admin identity.
 */

export type ReticleShape = "classic" | "spray" | "ribbon" | "hex";

export interface Avatar {
  id: AvatarId;
  name: string;
  tagline: string;
  /** Identity colour, used on chips and standings rows — legible on its own against the dark panel. */
  colour: string;
  /** Web strand and fluid accent. */
  webColour: string;
  /** The glove — a SECOND hue, not a shade of `colour`. Every Spider suit is two-tone. */
  gloveColour: string;
  reticle: ReticleShape;
  /** Signature verdict wording, set in Bangers. */
  shout: string;
  miss: string;
  /** Inclusive coin range that grants this character. */
  coins: readonly [number, number];
}

export const AVATARS: readonly Avatar[] = [
  {
    id: "spider-man",
    name: "Spider-Man",
    tagline: "The Original Webslinger",
    colour: "#3a86ff",
    webColour: "#9ec5ff",
    gloveColour: "#e5223b",
    reticle: "classic",
    shout: "NAILED IT.",
    miss: "...YEAH, NO.",
    coins: [1, 5],
  },
  {
    id: "miles",
    name: "Miles Morales",
    tagline: "Brooklyn's Own",
    colour: "#e5223b",
    webColour: "#ff2a6d",
    gloveColour: "#14161a",
    reticle: "spray",
    shout: "BOOM!",
    miss: "NAH.",
    coins: [6, 10],
  },
  {
    id: "gwen",
    name: "Spider-Gwen",
    tagline: "Ghost-Spider, Dimension Hopper",
    colour: "#ff6ec7",
    webColour: "#ffa9dd",
    gloveColour: "#f2efe9",
    reticle: "ribbon",
    shout: "ON BEAT!",
    miss: "OFF-BEAT.",
    coins: [11, 15],
  },
  {
    id: "miguel",
    name: "Spider-Man 2099",
    tagline: "Miguel O'Hara, Nueva York",
    colour: "#00e5ff",
    webColour: "#00e5ff",
    gloveColour: "#b3122b",
    reticle: "hex",
    shout: "CONFIRMED.",
    miss: "REJECTED.",
    coins: [16, 20],
  },
  {
    id: "spider-punk",
    name: "Spider-Punk",
    tagline: "Hobie Brown, Anarchist Rebel",
    colour: "#e63946",
    webColour: "#457b9d",
    gloveColour: "#1d3557",
    reticle: "spray",
    shout: "SHRED IT!",
    miss: "OUT OF TUNE.",
    coins: [21, 25],
  },
  {
    id: "pavitr",
    name: "Spider-Man India",
    tagline: "Pavitr Prabhakar, Mumbhattan",
    colour: "#ff9f1c",
    webColour: "#2ec4b6",
    gloveColour: "#e71d36",
    reticle: "classic",
    shout: "EASY PEASY!",
    miss: "MISSED IT.",
    coins: [26, 30],
  },
  {
    id: "spider-noir",
    name: "Spider-Noir",
    tagline: "1930s Hardboiled Detective",
    colour: "#495057",
    webColour: "#adb5bd",
    gloveColour: "#212529",
    reticle: "classic",
    shout: "SOLVED.",
    miss: "COLD CASE.",
    coins: [31, 35],
  },
  {
    id: "spider-ham",
    name: "Spider-Ham",
    tagline: "Peter Porker, Cartoon Legend",
    colour: "#ff70a6",
    webColour: "#ff97b7",
    gloveColour: "#ff0a54",
    reticle: "ribbon",
    shout: "THATS ALL FOLKS!",
    miss: "OINK!",
    coins: [36, 40],
  },
  {
    id: "peni",
    name: "Peni Parker & SP//dr",
    tagline: "Neo-Tokyo Mech Pilot",
    colour: "#00f5d4",
    webColour: "#7b2cbf",
    gloveColour: "#fee440",
    reticle: "hex",
    shout: "SYSTEM OPTIMAL!",
    miss: "GLITCH DETECTED.",
    coins: [41, 45],
  },
  {
    id: "spider-byte",
    name: "Spider-Byte",
    tagline: "Margo Kess, Cyberspace Guardian",
    colour: "#7000ff",
    webColour: "#00f0ff",
    gloveColour: "#ff007f",
    reticle: "hex",
    shout: "BYTE FINISHED!",
    miss: "404 NOT FOUND.",
    coins: [46, 50],
  },
  {
    id: "cyborg",
    name: "Cyborg Spider-Woman",
    tagline: "Armored Multiverse Enforcer",
    colour: "#3a0ca3",
    webColour: "#4cc9f0",
    gloveColour: "#f72585",
    reticle: "spray",
    shout: "OVERPOWERED!",
    miss: "MALFUNCTION.",
    coins: [51, 55],
  },
  {
    id: "sun-spider",
    name: "Sun-Spider",
    tagline: "Charlotte Sibley, Solar Acrobat",
    colour: "#ffb703",
    webColour: "#fb8500",
    gloveColour: "#023047",
    reticle: "classic",
    shout: "SUNSHINE!",
    miss: "ECLIPSED.",
    coins: [56, 60],
  },
] as const;

/** Highest coin that exists. Coins run 01..60. */
export const MAX_COIN = 60;

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarById(id: AvatarId | string | undefined | null): Avatar | null {
  if (!id) return null;
  return BY_ID.get(id as AvatarId) ?? AVATARS[0];
}

/**
 * Normalise whatever someone typed into a coin number.
 */
export function parseCoin(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COIN) return null;
  return n;
}

/** Which character a coin grants — randomized/interleaved across the Spider-Verse heroes so teams get distinct characters. */
export function avatarForCoin(coin: number): Avatar | null {
  if (!Number.isInteger(coin) || coin < 1 || coin > MAX_COIN) return null;
  // Interleaved formula: (coin * 7) % AVATARS.length ensures consecutive coins get distinct Spider-Verse heroes
  const index = (coin * 7) % AVATARS.length;
  return AVATARS[index];
}

/** Fallback resolution by team name if no coin is assigned */
export function avatarForTeamName(name: string): Avatar {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return AVATARS[hash % AVATARS.length];
}

/** Zero-padded, the way it's stamped on the coin. */
export function formatCoin(coin: number): string {
  return String(coin).padStart(2, "0");
}

