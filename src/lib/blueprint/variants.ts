import "server-only";

/**
 * Blueprint Recovery — the ten sectors and the code that closes each one.
 *
 * SERVER ONLY, and that is the whole reason this file exists separately from
 * everything else the round needs. In the original the codes sat in
 * `lib/constants.js` next to the sector colours, imported by the page that
 * checks them: validation called a Supabase RPC, and when that failed it fell
 * back to comparing against the same table in the browser. So the answer to
 * every sector was one devtools search away, and a team that never found the
 * physical checkpoint could read the code off the page that was asking for it.
 *
 * `import "server-only"` makes that a build error rather than a code review
 * question — anything in the client graph importing this fails `next build`.
 * The sector's colour and name are public and live in `sectors.ts`; only the
 * code is here.
 *
 * Sixty teams across ten sectors, each named for a Spider-Man's dimension.
 */
const ACCESS_CODES: readonly string[] = [
  "PETER-PARKER-616",     // 1  Red    Earth-616
  "SPIDER-MAN-2099",      // 2  Blue   Earth-928
  "SPIDER-PUNK-138",      // 3  Green  Earth-138
  "MILES-MORALES-1610",   // 4  Yellow Earth-1610
  "SPIDER-INDIA-50101",   // 5  Orange Earth-50101
  "SPIDER-BYTE-22191",    // 6  Purple Earth-22191
  "SPIDER-NOIR-1935",     // 7  Black  Earth-90214
  "SPIDER-GWEN-65",       // 8  White  Earth-65
  "SP//DR-14512",         // 9  Pink   Earth-14512
  "SPIDER-HAM-8311",      // 10 Brown  Earth-8311
];

/**
 * Which sector a team is sent to, 1-based.
 *
 * `((n - 1) % 10) + 1`, the original's formula, so a team's sector does not
 * change in the port. Derived from the modulus rather than a literal 10 so
 * adding an eleventh sector is one edit.
 */
export function sectorNumberFor(teamNumber: number): number {
  const n = Math.trunc(teamNumber);
  const count = ACCESS_CODES.length;
  return (((n - 1) % count) + count) % count + 1;
}

/**
 * Is this the right access code for this team's sector?
 *
 * Compared case-insensitively and with surrounding whitespace ignored: the
 * codes are read off a physical card and typed under time pressure, and a
 * trailing space is not a wrong answer. Nothing else is normalised — the
 * hyphens and the `//` in SP//DR are part of the code.
 *
 * Returns false for an out-of-range sector rather than throwing, so a bad
 * request is a wrong answer and not a 500 that distinguishes real sectors from
 * invented ones.
 */
export function isSectorCode(sectorNumber: number, guess: string): boolean {
  const code = ACCESS_CODES[sectorNumber - 1];
  if (typeof code !== "string") return false;
  return guess.trim().toUpperCase() === code.toUpperCase();
}

/** How many sectors exist. For the seed and for tests. */
export const SECTOR_COUNT = ACCESS_CODES.length;
