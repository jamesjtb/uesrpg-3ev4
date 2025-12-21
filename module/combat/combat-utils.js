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
  if (!weapon?.system?.qualities) return DAMAGE_TYPES.PHYSICAL;

  const qualities = weapon.system.qualities.toLowerCase();

  // Check for special damage types
  if (qualities.includes('fire') || qualities.includes('flame')) return DAMAGE_TYPES.FIRE;
  if (qualities.includes('frost') || qualities.includes('ice')) return DAMAGE_TYPES.FROST;
  if (qualities.includes('shock') || qualities.includes('lightning')) return DAMAGE_TYPES.SHOCK;
  if (qualities.includes('poison')) return DAMAGE_TYPES.POISON;
  if (qualities.includes('magic')) return DAMAGE_TYPES.MAGIC;
  
  // Default to physical
  return DAMAGE_TYPES.PHYSICAL;
}

/**
 * Roll for hit location using 1d100
 * @returns {Promise<string>} Hit location description
 */
export async function rollHitLocation() {
  const roll = await new Roll("1d100").evaluate({ async: true });
  const result = roll.total;
  
  if (result <= 15) return "Head";
  if (result <= 35) return "Right Arm";
  if (result <= 55) return "Left Arm";
  if (result <= 80) return "Body";
  if (result <= 90) return "Right Leg";
  return "Left Leg";
}

// Global exposure for macros
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.utils = window.Uesrpg3e.utils || {};
window.Uesrpg3e.utils.getDamageTypeFromWeapon = getDamageTypeFromWeapon;
window.Uesrpg3e.utils.rollHitLocation = rollHitLocation;
