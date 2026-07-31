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
    tagline: "The original",
    colour: "#3a86ff",
    webColour: "#9ec5ff",
    gloveColour: "#e5223b",
    reticle: "classic",
    shout: "NAILED IT.",
    miss: "...YEAH, NO.",
    coins: [1, 15],
  },
  {
    id: "miles",
    name: "Miles Morales",
    tagline: "Brooklyn's own",
    colour: "#e5223b",
    webColour: "#ff2a6d",
    gloveColour: "#14161a",
    reticle: "spray",
    shout: "BOOM!",
    miss: "NAH.",
    coins: [16, 30],
  },
  {
    id: "gwen",
    name: "Spider-Gwen",
    tagline: "Drummer, dimension-hopper",
    colour: "#ff6ec7",
    webColour: "#ffa9dd",
    gloveColour: "#f2efe9",
    reticle: "ribbon",
    shout: "ON BEAT!",
    miss: "OFF-BEAT.",
    coins: [31, 45],
  },
  {
    id: "miguel",
    name: "Spider-Man 2099",
    tagline: "Miguel O'Hara, from Nueva York",
    colour: "#00e5ff",
    webColour: "#00e5ff",
    gloveColour: "#b3122b",
    reticle: "hex",
    shout: "CONFIRMED.",
    miss: "REJECTED.",
    coins: [46, 60],
  },
] as const;

/** Highest coin that exists. Coins run 01..60, fifteen per character. */
export const MAX_COIN = 60;

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarById(id: AvatarId | undefined | null): Avatar | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/**
 * Normalise whatever someone typed into a coin number. People will type "7",
 * "07", " 07 " and occasionally "#07" off a metal disc in a noisy hall, and
 * all of those mean the same coin.
 */
export function parseCoin(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_COIN) return null;
  return n;
}

/** Which character a coin grants — randomized/interleaved across the 4 Spider-Verse heroes so teams get different characters. */
export function avatarForCoin(coin: number): Avatar | null {
  if (!Number.isInteger(coin) || coin < 1 || coin > MAX_COIN) return null;
  // Interleaved formula: (coin * 7) % 4 ensures consecutive coins get distinct Spider-Verse heroes
  const index = (coin * 7) % AVATARS.length;
  return AVATARS[index];
}

/** Zero-padded, the way it's stamped on the coin. */
export function formatCoin(coin: number): string {
  return String(coin).padStart(2, "0");
}
