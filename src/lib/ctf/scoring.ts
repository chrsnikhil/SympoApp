/**
 * Calculates the current score of a CTF challenge (static points, decay disabled).
 *
 * @param initialPoints Starting points of the challenge
 */
export function calculateChallengeValue(
  initialPoints: number,
  _minimumPoints?: number,
  _decayAfter?: number,
  _solveCount?: number
): number {
  return initialPoints;
}