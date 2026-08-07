/**
 * Constants — Blueprint Recovery
 *
 * Support for 60 Total Teams across 10 Sector Variants per cycle.
 * Sector Names are named directly after each Spider-Man's Earth Dimension Number:
 * 1. Red    — Earth-616 (Peter Parker)
 * 2. Blue   — Earth-928 (Spider-Man 2099)
 * 3. Green  — Earth-138 (Spider-Punk)
 * 4. Yellow — Earth-1610 (Miles Morales)
 * 5. Orange — Earth-50101 (Spider-Man India)
 * 6. Purple — Earth-22191 (Spider-Byte)
 * 7. Black  — Earth-90214 (Spider-Man Noir)
 * 8. White  — Earth-65 (Spider-Gwen)
 * 9. Pink   — Earth-14512 (Peni Parker SP//dr)
 * 10. Brown — Earth-8311 (Spider-Ham)
 */

export const TOTAL_TEAMS = 60;
export const TOTAL_VARIANTS = 10;

export const VARIANT_COLORS = {
  1:  { color: 'Red',    sectorName: 'Earth-616',   defaultAccessCode: 'PARKER-616' },
  2:  { color: 'Blue',   sectorName: 'Earth-928',   defaultAccessCode: 'SPIDER-2099' },
  3:  { color: 'Green',  sectorName: 'Earth-138',   defaultAccessCode: 'PUNK-138' },
  4:  { color: 'Yellow', sectorName: 'Earth-1610',  defaultAccessCode: 'MILES-1610' },
  5:  { color: 'Orange', sectorName: 'Earth-50101', defaultAccessCode: 'INDIA-50101' },
  6:  { color: 'Purple', sectorName: 'Earth-22191', defaultAccessCode: 'BYTE-22191' },
  7:  { color: 'Black',  sectorName: 'Earth-90214', defaultAccessCode: 'NOIR-90214' },
  8:  { color: 'White',  sectorName: 'Earth-65',    defaultAccessCode: 'GWEN-65' },
  9:  { color: 'Pink',   sectorName: 'Earth-14512', defaultAccessCode: 'SPDR-14512' },
  10: { color: 'Brown',  sectorName: 'Earth-8311',  defaultAccessCode: 'HAM-8311' },
};

/**
 * Calculate variant number from team number (1 to 60 mapped across 10 variants).
 * Formula: ((teamNumber - 1) % 10) + 1
 */
export function getVariantNumber(teamNumber) {
  const num = parseInt(teamNumber, 10);
  if (isNaN(num) || num <= 0) return 1;
  return ((num - 1) % 10) + 1;
}

/**
 * Get the full variant info for a team number.
 */
export function getVariantForTeam(teamNumber) {
  const variantNumber = getVariantNumber(teamNumber);
  return {
    variantNumber,
    ...VARIANT_COLORS[variantNumber],
  };
}
