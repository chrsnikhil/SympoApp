/**
 * Universe RGB Color — Pure computation module.
 *
 * Each universe has an algebraic RGB equation of the form:
 *   channel = (base + coefficient × n) mod 256
 *
 * `n` is the team's actual team number (NOT the mod-8 index).
 * The universe index is determined by `teamNumber % 8`.
 *
 * Base/coefficient data is stored once so both the human-readable
 * equation strings AND the numeric computation derive from the same
 * source — no two representations can drift apart.
 */

/* ── Universe colour data ──────────────────────────────────────────────── */

export interface UniverseColorDef {
  name: string;
  rBase: number;
  rCoef: number;
  gBase: number;
  gCoef: number;
  bBase: number;
  bCoef: number;
}

/**
 * Fixed order — index 0–7 matches the existing UNIVERSES array in
 * universeData.ts (RIOT=0, PUNK=1, SLAM=2, …, GHOST=7).
 */
export const UNIVERSE_COLOR_DEFS: readonly UniverseColorDef[] = [
  { name: "RIOT",     rBase: 154, rCoef: 13, gBase: 253, gCoef: 7,  bBase: 230, bCoef: 19 },
  { name: "PUNK",     rBase: 196, rCoef: 9,  gBase: 49,  gCoef: 11, bBase: 200, bCoef: 15 },
  { name: "SLAM",     rBase: 148, rCoef: 17, gBase: 181, gCoef: 3,  bBase: 1,   bCoef: 21 },
  { name: "VENOM",    rBase: 184, rCoef: 19, gBase: 127, gCoef: 5,  bBase: 89,  bCoef: 9  },
  { name: "ELECTRIC", rBase: 153, rCoef: 23, gBase: 223, gCoef: 17, bBase: 163, bCoef: 7  },
  { name: "ANARCHY",  rBase: 83,  rCoef: 5,  gBase: 199, gCoef: 13, bBase: 102, bCoef: 11 },
  { name: "SMASH",    rBase: 154, rCoef: 7,  gBase: 85,  gCoef: 19, bBase: 151, bCoef: 23 },
  { name: "GHOST",    rBase: 66,  rCoef: 11, gBase: 26,  gCoef: 15, bBase: 6,   bCoef: 17 },
] as const;

/* ── Helpers ───────────────────────────────────────────────────────────── */

/** Safe modulo that always returns a non-negative result. */
function safeMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/* ── Return type ───────────────────────────────────────────────────────── */

export interface UniverseColorResult {
  /** 0–7 index matching the UNIVERSES array */
  universeIndex: number;
  /** Codename: RIOT, PUNK, SLAM, etc. */
  universeName: string;
  /** The team number used in computation (n) */
  n: number;
  /** Human-readable unsolved equations with `n` as variable */
  equations: {
    R: string;
    G: string;
    B: string;
  };
  /** Worked-out arithmetic strings showing substitution */
  worked: {
    R: string;
    G: string;
    B: string;
  };
  /** Computed RGB values */
  rgb: { r: number; g: number; b: number };
  /** Hex colour string, e.g. "#E31F24" */
  hex: string;
}

/* ── Main pure function ────────────────────────────────────────────────── */

/**
 * Compute the RGB colour for a given team number.
 *
 * Pure, deterministic, no randomness. Same input → same output every time.
 *
 * @param teamNumber - The team's actual number (n ≥ 0)
 */
export function getUniverseColor(teamNumber: number): UniverseColorResult {
  const idx = safeMod(teamNumber, 8);
  const u = UNIVERSE_COLOR_DEFS[idx];
  const n = idx;

  const r = safeMod(u.rBase + u.rCoef * (n + 3), 256);
  const g = safeMod(u.gBase + u.gCoef * (n + 3), 256);
  const b = safeMod(u.bBase + u.bCoef * (n + 3), 256);

  return {
    universeIndex: idx,
    universeName: u.name,
    n,
    equations: {
      R: `(${u.rBase} + ${u.rCoef}(n + 3)) mod 256`,
      G: `(${u.gBase} + ${u.gCoef}(n + 3)) mod 256`,
      B: `(${u.bBase} + ${u.bCoef}(n + 3)) mod 256`,
    },
    worked: {
      R: `R = (${u.rBase} + ${u.rCoef}×(${n} + 3)) mod 256 = ${r}`,
      G: `G = (${u.gBase} + ${u.gCoef}×(${n} + 3)) mod 256 = ${g}`,
      B: `B = (${u.bBase} + ${u.bCoef}×(${n} + 3)) mod 256 = ${b}`,
    },
    rgb: { r, g, b },
    hex: rgbToHex(r, g, b),
  };
}
