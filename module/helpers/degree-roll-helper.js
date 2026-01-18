import { SYSTEM_ROLL_FORMULA } from "../constants.js";
import { isNPC, resolveCriticalFlags } from "../rules/npc-rules.js";
/**
 * module/helpers/degree-roll-helper.js
 * UESRPG v3e — Degree of Success / Degree of Failure helper
 *
 * Exposes:
 *  - doTestRoll(actor, { rollFormula, target, allowLucky, allowUnlucky })
 *  - resolveOpposed(aResult, dResult)
 *
 * RAW implemented:
 *  - DoS = tens digit of d100 roll (min 1 on success)
 *  - DoF = 1 + tens digit of (roll - target) (min 1 on failure)
 *  - TN > 100: add the tens digit of TN to DoS (RAW)
 *  - Lucky/unlucky: critical success/failure, still has numeric DoS/DoF
 *
 * Returns structured result objects suitable for chat rendering or further logic.
 */

export async function doTestRoll(actor, { rollFormula = SYSTEM_ROLL_FORMULA, target = 0, allowLucky = true, allowUnlucky = true } = {}) {
  // Evaluate the roll
  // Foundry V13+: the `async` option was removed; Roll#evaluate is async by default.
  const roll = await new Roll(rollFormula).evaluate();
  const total = Number(roll.total);

  // Determine actor type / NPC status (deterministic)
  // Per project rules: NPCs use fixed critical bands; PCs use lucky/unlucky numbers.
  const actorIsNPC = isNPC(actor);
  const crit = resolveCriticalFlags(actor, total, { allowLucky, allowUnlucky });
  const isCriticalSuccess = crit.isCriticalSuccess;
  const isCriticalFailure = crit.isCriticalFailure;

  // Success / failure vs target
  const tn = Number(target || 0);
  // RAW hard rule for PC critical numbers: a critical success always succeeds regardless of TN.
  // (Critical failure always fails regardless of TN.)
  let isSuccess = (total <= tn);
  if (!actorIsNPC) {
    if (isCriticalSuccess) isSuccess = true;
    if (isCriticalFailure) isSuccess = false;
  }

  // Compute DoS / DoF (RAW) — TN>100: add tens digit of TN to DoS
  let degree = 0;
  if (isSuccess) {
    const baseDos = Math.max(1, Math.floor(total / 10)); // tens digit of roll, min 1
    let tnTensBonus = 0;
    if (tn > 100) {
      // RAW: tens digit of target number is added
      // e.g. TN = 123 => tens digit is 2 => extra +2
      tnTensBonus = Math.floor((tn % 100) / 10);
    }
    degree = baseDos + tnTensBonus;
  } else {
    const diff = Math.max(0, total - tn);
    degree = 1 + Math.floor(diff / 10); // 1 + tens digit of difference
  }

  return {
    roll,                  // full Roll object
    rollTotal: total,
    target: tn,
    isSuccess,
    isCriticalSuccess,
    isCriticalFailure,
    degree,                // DoS when success, DoF when failure
    textual: isSuccess ? `${degree} DoS` : `${degree} DoF`,
    meta: {
      actorId: actor?.id,
      actorName: actor?.name,
      actorIsNPC
    }
  };
}

/**
 * Compute a deterministic DoS/DoF result from an already-known d100 total.
 *
 * This exists to support cross-user opposed workflows where the roll message is
 * created successfully (Dice So Nice compatibility) but the originating opposed
 * card cannot be updated by the rolling user due to document permissions.
 *
 * @param {Actor} actor
 * @param {object} opts
 * @param {number} opts.rollTotal
 * @param {number} opts.target
 * @param {boolean} [opts.allowLucky=true]
 * @param {boolean} [opts.allowUnlucky=true]
 * @returns {object} A result object with the same shape as doTestRoll (minus the Roll).
 */
export function computeResultFromRollTotal(actor, { rollTotal = 0, target = 0, allowLucky = true, allowUnlucky = true } = {}) {
  const total = Number(rollTotal);
  const tn = Number(target || 0);

  const actorIsNPC = isNPC(actor);
  const crit = resolveCriticalFlags(actor, total, { allowLucky, allowUnlucky });
  const isCriticalSuccess = crit.isCriticalSuccess;
  const isCriticalFailure = crit.isCriticalFailure;

  let isSuccess = (total <= tn);
  if (!actorIsNPC) {
    if (isCriticalSuccess) isSuccess = true;
    if (isCriticalFailure) isSuccess = false;
  }

  let degree = 0;
  if (isSuccess) {
    const baseDos = Math.max(1, Math.floor(total / 10));
    let tnTensBonus = 0;
    if (tn > 100) tnTensBonus = Math.floor((tn % 100) / 10);
    degree = baseDos + tnTensBonus;
  } else {
    const diff = Math.max(0, total - tn);
    degree = 1 + Math.floor(diff / 10);
  }

  return {
    roll: null,
    rollTotal: total,
    target: tn,
    isSuccess,
    isCriticalSuccess,
    isCriticalFailure,
    degree,
    textual: isSuccess ? `${degree} DoS` : `${degree} DoF`,
    meta: {
      actorId: actor?.id,
      actorName: actor?.name,
      actorIsNPC
    }
  };
}

/**
 * Format a DoS/DoF string consistently across the system.
 * @param {object|null} result A result from doTestRoll.
 * @returns {string}
 */
export function formatDegree(result) {
  if (!result) return "—";
  return result.isSuccess ? `${result.degree} DoS` : `${result.degree} DoF`;
}

/**
 * Resolve an opposed test between attacker and defender results.
 * Returns { winner: "attacker"|"defender"|"tie", reason: string }
 *
 * Rules implemented (per your confirmation):
 * - If one side has critical success and the other does not -> critical side wins.
 * - If one side has critical failure and the other does not -> the other side wins.
 * - If both succeed -> compare DoS (higher wins); equal -> tie.
 * - If both fail -> compare DoF (lower wins); equal -> tie.
 * - If one succeeds and the other fails -> success side wins.
 */
export function resolveOpposed(aResult, dResult) {
  // Null/undefined checks - return tie if either result is missing
  if (!aResult || !dResult) {
    return { winner: "tie", reason: "unresolved (missing result)" };
  }

  const A = aResult;
  const D = dResult;

  // Critical success precedence
  // Use safe property access with default false for isCriticalSuccess/isCriticalFailure
  const aIsCritSuccess = Boolean(A.isCriticalSuccess ?? false);
  const dIsCritSuccess = Boolean(D.isCriticalSuccess ?? false);
  const aIsCritFailure = Boolean(A.isCriticalFailure ?? false);
  const dIsCritFailure = Boolean(D.isCriticalFailure ?? false);

  if (aIsCritSuccess && !dIsCritSuccess) return { winner: "attacker", reason: "attacker critical success" };
  if (dIsCritSuccess && !aIsCritSuccess) return { winner: "defender", reason: "defender critical success" };

  // Critical failure precedence (other side wins)
  if (aIsCritFailure && !dIsCritFailure) return { winner: "defender", reason: "attacker critical failure" };
  if (dIsCritFailure && !aIsCritFailure) return { winner: "attacker", reason: "defender critical failure" };

  // One succeeds, other fails
  // Use safe property access with default false
  const aIsSuccess = Boolean(A.isSuccess ?? false);
  const dIsSuccess = Boolean(D.isSuccess ?? false);
  
  if (aIsSuccess && !dIsSuccess) return { winner: "attacker", reason: "attacker success" };
  if (dIsSuccess && !aIsSuccess) return { winner: "defender", reason: "defender success" };

  // Both succeed -> higher DoS wins; equal -> tie
  if (aIsSuccess && dIsSuccess) {
    const aDegree = Number(A.degree ?? 0);
    const dDegree = Number(D.degree ?? 0);
    if (aDegree > dDegree) return { winner: "attacker", reason: `attacker higher DoS (${aDegree} vs ${dDegree})` };
    if (dDegree > aDegree) return { winner: "defender", reason: `defender higher DoS (${dDegree} vs ${aDegree})` };
    return { winner: "tie", reason: "equal DoS" };
  }

  // Both fail -> lower DoF wins; equal -> tie
  if (!aIsSuccess && !dIsSuccess) {
    const aDegree = Number(A.degree ?? 0);
    const dDegree = Number(D.degree ?? 0);
    if (aDegree < dDegree) return { winner: "attacker", reason: `attacker lower DoF (${aDegree} vs ${dDegree})` };
    if (dDegree < aDegree) return { winner: "defender", reason: `defender lower DoF (${dDegree} vs ${aDegree})` };
    return { winner: "tie", reason: "equal DoF" };
  }

  // Fallback
  return { winner: "tie", reason: "unresolved" };
}

// Convenience global exposure so macros and non-module code can access the helper
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.roll = window.Uesrpg3e.roll || {};
window.Uesrpg3e.roll.doTestRoll = window.Uesrpg3e.roll.doTestRoll || doTestRoll;
window.Uesrpg3e.roll.computeResultFromRollTotal = window.Uesrpg3e.roll.computeResultFromRollTotal || computeResultFromRollTotal;
window.Uesrpg3e.roll.resolveOpposed = window.Uesrpg3e.roll.resolveOpposed || resolveOpposed;
window.Uesrpg3e.roll.formatDegree = window.Uesrpg3e.roll.formatDegree || formatDegree;
