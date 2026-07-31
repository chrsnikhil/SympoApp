/**
 * Calculates the current score of a CTF challenge.
 *
 * @param initialPoints Starting points of the challenge
 * @param minimumPoints Minimum points after decay
 * @param decayAfter Number of solves before score starts decreasing
 * @param solveCount Total number of correct solves
 */
export function calculateChallengeValue(
  initialPoints: number,
  minimumPoints: number,
  decayAfter: number,
  solveCount: number
): number {
  if (solveCount <= decayAfter) {
    return initialPoints;
  }

  const extraSolves = solveCount - decayAfter;
  // Calculate dynamic decay step based on initial vs minimum gap
  const step = Math.max(5, Math.round((initialPoints - minimumPoints) / 10));
  const currentPoints = initialPoints - extraSolves * step;

  return Math.max(minimumPoints, currentPoints);
}