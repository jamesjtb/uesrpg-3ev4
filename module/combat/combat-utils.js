/**
 * module/combat/combat-utils.js
 * Shared utility functions for combat and damage
 */

import { DAMAGE_TYPES } from "./damage-automation.js";

/**
 * Determine damage type from weapon qualities
 * @param {Item} weapon - The weapon item
 * @returns {string} - Damage type
 */

export function getDamageTypeFromWeapon(weapon) {
  if (!weapon?.system) return DAMAGE_TYPES.PHYSICAL;

  // Prefer structured qualities (manual + auto-injected) for automation.
  const structured = Array.isArray(weapon.system.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : null;

  const keys = structured ? structured.map(q => String(q?.key ?? "").toLowerCase()).filter(Boolean) : [];

  // Structured-driven fast path
  if (keys.includes("fire") || keys.includes("flame")) return DAMAGE_TYPES.FIRE;
  if (keys.includes("frost") || keys.includes("ice")) return DAMAGE_TYPES.FROST;
  if (keys.includes("shock") || keys.includes("lightning")) return DAMAGE_TYPES.SHOCK;
  if (keys.includes("poison")) return DAMAGE_TYPES.POISON;
  if (keys.includes("magic")) return DAMAGE_TYPES.MAGIC;
  if (keys.includes("silver")) return DAMAGE_TYPES.SILVER;
  if (keys.includes("sunlight")) return DAMAGE_TYPES.SUNLIGHT;

  // Fallback to legacy rich-text qualities (reference-only)
  if (!weapon.system.qualities) return DAMAGE_TYPES.PHYSICAL;
  const qualities = String(weapon.system.qualities).toLowerCase();

  if (qualities.includes('fire') || qualities.includes('flame')) return DAMAGE_TYPES.FIRE;
  if (qualities.includes('frost') || qualities.includes('ice')) return DAMAGE_TYPES.FROST;
  if (qualities.includes('shock') || qualities.includes('lightning')) return DAMAGE_TYPES.SHOCK;
  if (qualities.includes('poison')) return DAMAGE_TYPES.POISON;
  if (qualities.includes('magic')) return DAMAGE_TYPES.MAGIC;
  if (qualities.includes('silver')) return DAMAGE_TYPES.SILVER;
  if (qualities.includes('sunlight')) return DAMAGE_TYPES.SUNLIGHT;

  return DAMAGE_TYPES.PHYSICAL;
}


/**
 * Roll for hit location using 1d100
 * @returns {Promise<string>} Hit location description
 */
/**
 * Return hit location using ones digit of d100 roll as per UESRPG rules.
 * @param {number} attackRollResult
 * @returns {string}
 */
export function getHitLocationFromRoll(attackRollResult) {
  const digit = Math.abs(Number(attackRollResult) || 0) % 10;
  switch (digit) {
    case 0: return "Head";
    case 1: case 2: case 3: case 4: case 5: return "Body";
    case 6: return "Right Leg";
    case 7: return "Left Leg";
    case 8: return "Right Arm";
    case 9: return "Left Arm";
  }

  // Defensive fallback (should never be reached)
  return "Body";
}

/**
 * Backwards-compatible helper.
 *
 * Historically the system exposed `rollHitLocation()` globally and some modules/macros
 * still import/call it. RAW hit-location in UESRPG 3e v4 is based on the ones digit
 * of the attack roll result.
 *
 * If an attack roll result is provided, we derive hit location from it.
 * If not provided, we roll 1d100 (only to obtain a ones digit) and derive from that.
 *
 * @param {number} [attackRollResult]
 * @returns {Promise<string>} Hit location
 */
export async function rollHitLocation(attackRollResult) {
  if (Number.isFinite(attackRollResult)) return getHitLocationFromRoll(Number(attackRollResult));

  // RAW: hit location is the 1s digit of the attack roll, but can also be rolled as 1d10 (treat 10 as 0).
  // We use 1d10 here as a deterministic fallback when an attack roll isn't provided.
  console.warn("UESRPG | rollHitLocation() called without attack roll result; rolling 1d10 as fallback.");
  const r = await new Roll("1d10").evaluate();
  return getHitLocationFromRoll(Number(r.total));
}

// Global exposure for macros
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.utils = window.Uesrpg3e.utils || {};
window.Uesrpg3e.utils.getDamageTypeFromWeapon = getDamageTypeFromWeapon;
window.Uesrpg3e.utils.getHitLocationFromRoll = getHitLocationFromRoll;
window.Uesrpg3e.utils.rollHitLocation = rollHitLocation;
