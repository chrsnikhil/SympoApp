/**
 * Blueprint Recovery — the public half of a sector.
 *
 * Colour, dimension name and flavour: everything a team is meant to see once
 * they know which sector they are in. Deliberately split from `variants.ts`,
 * which holds the access codes and is `server-only` — a page that renders "you
 * are in the Red sector, Earth-616" needs this and must never be able to reach
 * that.
 *
 * Indexed from 1 to match the sector number the original used, so a team's
 * sector reads the same here as on any printed material.
 */
export interface Sector {
  number: number;
  colour: string;
  dimension: string;
  /** Tailwind-ish hex for the sector's accent, used by the reveal screen. */
  accent: string;
}

export const SECTORS: readonly Sector[] = [
  { number: 1, colour: "Red", dimension: "Earth-616", accent: "#E63946" },
  { number: 2, colour: "Blue", dimension: "Earth-928", accent: "#3A86FF" },
  { number: 3, colour: "Green", dimension: "Earth-138", accent: "#2A9D8F" },
  { number: 4, colour: "Yellow", dimension: "Earth-1610", accent: "#E9C46A" },
  { number: 5, colour: "Orange", dimension: "Earth-50101", accent: "#F4A261" },
  { number: 6, colour: "Purple", dimension: "Earth-22191", accent: "#7209B7" },
  { number: 7, colour: "Black", dimension: "Earth-90214", accent: "#4A4A4A" },
  { number: 8, colour: "White", dimension: "Earth-65", accent: "#D8E2DC" },
  { number: 9, colour: "Pink", dimension: "Earth-14512", accent: "#F72585" },
  { number: 10, colour: "Brown", dimension: "Earth-8311", accent: "#8B5E3C" },
];

/** The sector a number identifies, or undefined if it names none. */
export function sectorInfo(sectorNumber: number): Sector | undefined {
  return SECTORS.find((s) => s.number === sectorNumber);
}
