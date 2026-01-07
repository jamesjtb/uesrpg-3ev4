/**
 * Stamina integration hooks for automatic effect application and consumption.
 * Integrates with existing roll handlers to apply stamina bonuses and consume effects.
 */

import { getActiveStaminaEffect, consumeStaminaEffect } from "./stamina-dialog.js";

/**
 * Check and apply Physical Exertion bonus to characteristic test
 * Should be called before rolling STR or END characteristic tests
 * @param {Actor} actor - The actor making the test
 * @param {string} characteristicId - The characteristic being tested (str, end, etc.)
 * @returns {Promise<number>} The bonus to apply (0 or 20)
 */
export async function applyPhysicalExertionBonus(actor, characteristicId) {
  if (!actor || !characteristicId) return 0;
  
  const charId = String(characteristicId).toLowerCase();
  
  // Physical Exertion only applies to STR/END tests
  if (charId !== 'str' && charId !== 'end') return 0;
  
  const effect = getActiveStaminaEffect(actor, "stamina-physical-exertion");
  if (!effect) return 0;
  
  // Consume the effect and apply bonus
  await consumeStaminaEffect(actor, "stamina-physical-exertion", {
    bonus: "+20 to test"
  });
  
  return 20;
}

/**
 * Check and apply Physical Exertion bonus to skill test
 * Should be called before rolling STR/END based skill tests (excluding Combat Style)
 * @param {Actor} actor - The actor making the test
 * @param {Item} skillItem - The skill being tested
 * @returns {Promise<number>} The bonus to apply (0 or 20)
 */
export async function applyPhysicalExertionToSkill(actor, skillItem) {
  if (!actor || !skillItem) return 0;
  
  // Don't apply to Combat Style
  if (skillItem.type === 'combatStyle') return 0;
  
  const characteristic = skillItem.system?.characteristic;
  if (!characteristic) return 0;
  
  const charId = String(characteristic).toLowerCase();
  
  // Physical Exertion only applies to STR/END based skills
  if (charId !== 'str' && charId !== 'end') return 0;
  
  const effect = getActiveStaminaEffect(actor, "stamina-physical-exertion");
  if (!effect) return 0;
  
  // Consume the effect and apply bonus
  await consumeStaminaEffect(actor, "stamina-physical-exertion", {
    bonus: "+20 to test",
    message: `Applied to ${skillItem.name} skill test`
  });
  
  return 20;
}

/**
 * Check and apply Power Attack bonus to damage roll
 * Should be called before rolling damage
 * @param {Actor} actor - The actor making the damage roll
 * @returns {Promise<number>} The damage bonus to apply
 */
export async function applyPowerAttackBonus(actor) {
  if (!actor) return 0;
  
  const effect = getActiveStaminaEffect(actor, "stamina-power-attack");
  if (!effect) return 0;
  
  const bonus = effect.flags?.uesrpg?.damageBonus || 0;
  
  // Consume the effect
  await consumeStaminaEffect(actor, "stamina-power-attack", {
    bonus: `+${bonus} damage`
  });
  
  return bonus;
}

/**
 * Check and apply Sprint bonus to Dash action
 * Should be called when performing a Dash action
 * @param {Actor} actor - The actor performing the dash
 * @returns {Promise<Object|null>} Effect data if consumed, null otherwise
 */
export async function applySprintBonus(actor) {
  if (!actor) return null;
  
  const effect = getActiveStaminaEffect(actor, "stamina-sprint");
  if (!effect) return null;
  
  // Consume the effect
  const result = await consumeStaminaEffect(actor, "stamina-sprint", {
    message: "Movement range doubled for this Dash action"
  });
  
  return result;
}

/**
 * Check and apply Power Draw bonus to ranged attack
 * Should be called when making a ranged attack
 * @param {Actor} actor - The actor making the ranged attack
 * @param {Item} weapon - The ranged weapon being used
 * @returns {Promise<number>} The reload reduction to apply
 */
export async function applyPowerDrawBonus(actor, weapon) {
  if (!actor) return 0;
  
  const effect = getActiveStaminaEffect(actor, "stamina-power-draw");
  if (!effect) return 0;
  
  // Consume the effect
  await consumeStaminaEffect(actor, "stamina-power-draw", {
    message: `Reload time reduced by 1 for ${weapon?.name || "ranged weapon"}`
  });
  
  return 1;
}

/**
 * Check and apply Power Block bonus to shield block
 * Should be called when resolving a block with a shield
 * @param {Actor} actor - The actor blocking
 * @param {number} originalBR - The original BR value of the shield
 * @returns {Promise<number>} The effective BR to use (doubled if effect active)
 */
export async function applyPowerBlockBonus(actor, originalBR) {
  if (!actor) return originalBR;
  
  const effect = getActiveStaminaEffect(actor, "stamina-power-block");
  if (!effect) return originalBR;
  
  const doubledBR = originalBR * 2;
  
  // Consume the effect
  await consumeStaminaEffect(actor, "stamina-power-block", {
    message: `Shield BR doubled: ${originalBR} → ${doubledBR} (physical damage only)`
  });
  
  return doubledBR;
}

/**
 * Helper to check if any stamina effect is active
 * @param {Actor} actor - The actor to check
 * @param {string} effectKey - The effect key to check
 * @returns {boolean} True if the effect is active
 */
export function hasStaminaEffect(actor, effectKey) {
  return getActiveStaminaEffect(actor, effectKey) !== null;
}
