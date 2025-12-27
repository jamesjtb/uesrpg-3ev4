import { SYSTEM_ROLL_FORMULA } from "../constants.js";
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

  // Determine actor type / NPC status (best-effort)
  const actorIsNPC = !!(actor && (actor.type === "npc" || actor.system?.details?.npc === true || actor.hasPlayerOwner === false));

  // Determine criticals via lucky/unlucky or NPC thresholds
  let isCriticalSuccess = false;
  let isCriticalFailure = false;

  if (!actorIsNPC && actor?.system) {
    if (allowLucky) {
      const luckyNums = Object.values(actor.system.lucky_numbers || {}).map(n => Number(n));
      if (luckyNums.includes(total)) isCriticalSuccess = true;
    }
    if (allowUnlucky) {
      const unluckyNums = Object.values(actor.system.unlucky_numbers || {}).map(n => Number(n));
      if (unluckyNums.includes(total)) isCriticalFailure = true;
    }
  }

  // NPC criticals fallback
  if (actorIsNPC && !isCriticalSuccess && !isCriticalFailure) {
    if (total <= 3) isCriticalSuccess = true;
    if (total >= 98) isCriticalFailure = true;
  }

  // Success / failure vs target
  const tn = Number(target || 0);
  const isSuccess = (total <= tn);

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
  const A = aResult;
  const D = dResult;

  // Critical success precedence
  if (A.isCriticalSuccess && !D.isCriticalSuccess) return { winner: "attacker", reason: "attacker critical success" };
  if (D.isCriticalSuccess && !A.isCriticalSuccess) return { winner: "defender", reason: "defender critical success" };

  // Critical failure precedence (other side wins)
  if (A.isCriticalFailure && !D.isCriticalFailure) return { winner: "defender", reason: "attacker critical failure" };
  if (D.isCriticalFailure && !A.isCriticalFailure) return { winner: "attacker", reason: "defender critical failure" };

  // One succeeds, other fails
  if (A.isSuccess && !D.isSuccess) return { winner: "attacker", reason: "attacker success" };
  if (D.isSuccess && !A.isSuccess) return { winner: "defender", reason: "defender success" };

  // Both succeed -> higher DoS wins; equal -> tie
  if (A.isSuccess && D.isSuccess) {
    if (A.degree > D.degree) return { winner: "attacker", reason: `attacker higher DoS (${A.degree} vs ${D.degree})` };
    if (D.degree > A.degree) return { winner: "defender", reason: `defender higher DoS (${D.degree} vs ${A.degree})` };
    return { winner: "tie", reason: "equal DoS" };
  }

  // Both fail -> lower DoF wins; equal -> tie
  if (!A.isSuccess && !D.isSuccess) {
    if (A.degree < D.degree) return { winner: "attacker", reason: `attacker lower DoF (${A.degree} vs ${D.degree})` };
    if (D.degree < A.degree) return { winner: "defender", reason: `defender lower DoF (${D.degree} vs ${A.degree})` };
    return { winner: "tie", reason: "equal DoF" };
  }

  // Fallback
  return { winner: "tie", reason: "unresolved" };
}

// Convenience global exposure so macros and non-module code can access the helper
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.roll = window.Uesrpg3e.roll || {};
window.Uesrpg3e.roll.doTestRoll = window.Uesrpg3e.roll.doTestRoll || doTestRoll;
window.Uesrpg3e.roll.resolveOpposed = window.Uesrpg3e.roll.resolveOpposed || resolveOpposed;
window.Uesrpg3e.roll.formatDegree = window.Uesrpg3e.roll.formatDegree || formatDegree;
