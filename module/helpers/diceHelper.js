/**
 * Calculate Degrees of Success or Failure per UESRPG rules.
 * @param {number} roll - The d100 roll result (1-100 or higher)
 * @param {number} target - The test's TN
 * @returns {Object} { isSuccess, doS, doF }
 */
export function calculateDegrees(roll, target) {
  const isSuccess = roll <= target;
  let doS = 1, doF = 0;

  if (isSuccess) {
    // Degrees of Success
    doS = Math.floor(roll / 10) || 1;
    // If target > 100, add tens digit of TN as bonus DoS
    if (target > 100) {
      doS += Math.floor(target / 10);
    }
    return { isSuccess, doS, doF: 0 };
  } else {
    // Degrees of Failure
    const diff = roll - target;
    doF = 1 + Math.floor(diff / 10);
    return { isSuccess, doS: 0, doF };
  }
}
