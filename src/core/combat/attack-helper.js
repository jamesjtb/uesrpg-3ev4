/**
 * src/core/combat/attack-helper.js
 * Helper functions for performing attacks with weapons
 * Integrates combat rolls, damage calculation, and automation
 */

import { OpposedRoll } from "./opposed-rolls.js";
import { getDamageTypeFromWeapon } from "./combat-utils.js";
import { DefenseDialog } from "./defense-dialog.js";

/**
 * Perform a weapon attack
 * @param {Token} attackerToken - Attacking token
 * @param {Token} defenderToken - Defending token
 * @param {Item} weapon - Weapon item
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Attack result
 */
export async function performWeaponAttack(attackerToken, defenderToken, weapon, options = {}) {
  if (!attackerToken || !defenderToken) {
    ui.notifications.warn("Both attacker and defender tokens must be selected");
    return null;
  }

  if (!weapon) {
    ui.notifications.warn("No weapon specified");
    return null;
  }

  const attacker = attackerToken.actor;
  const defender = defenderToken.actor;

  // Determine combat style skill value for attacker
  const attackSkill = getAttackSkill(attacker, weapon);
  
  // Determine defense skill for defender (typically Evade or Block)
  // If requested, prompt for the defense choice (GM/attacker workflow).
  let defenseType = options.defenseType;
  let defenseSkill;
  if (!defenseType || defenseType === "prompt") {
    const choice = await DefenseDialog.show(defender);
    defenseType = choice?.defenseType ?? "evade";
    defenseSkill = Number(choice?.skill ?? 0) || getDefenseSkill(defender, defenseType);
  } else {
    defenseSkill = getDefenseSkill(defender, defenseType);
  }

  // Determine damage roll (Automation Contract: fully effective damage)
  const damageRoll = (weapon && typeof weapon.getDamageRoll === "function")
    ? weapon.getDamageRoll({ twoHanded: Boolean(weapon?.system?.weapon2H) })
    : (weapon?.system?.weapon2H
        ? (weapon?.system?.damage2 || weapon?.system?.damage)
        : weapon?.system?.damage);

  if (!damageRoll) {
    ui.notifications.warn(`Weapon "${weapon.name}" has no damage formula configured.`);
  }

  // Determine damage type from weapon qualities
  const damageType = getDamageTypeFromWeapon(weapon);

  // Get penetration if weapon has it
  const penetration = Number(weapon?.system?.penetration ?? 0);
  // Automatically Apply Damage is core behavior (always on).
  const autoApplyDamage = true;

  // Perform opposed roll with damage
  const result = await OpposedRoll.perform(attackerToken, defenderToken, {
    attackerTarget: attackSkill,
    defenderTarget: defenseSkill,
    weapon: weapon,
    damageRoll: damageRoll,
    damageType: damageType,
    autoApplyDamage: autoApplyDamage,
    penetration: penetration,
    flavor: options.flavor || ""
  });

  return result;
}

/**
 * Get attack skill value for an actor with a weapon
 * @param {Actor} actor - The attacking actor
 * @param {Item} weapon - The weapon being used
 * @returns {number} - Attack skill value
 */
function getAttackSkill(actor, weapon) {
  if (!actor?.system || !weapon) return 50;

  // Try to find combat style that matches weapon
  const weaponStyle = weapon?.system?.combatStyle ?? weapon?.system?.skill ?? null;
  
  if (weaponStyle) {
    // Look for combat style item
    const combatStyleItem = actor.items.find(i => 
      i.type === 'combatStyle' && i.name.toLowerCase().includes(weaponStyle.toLowerCase())
    );
    
    if (combatStyleItem?.system?.value) {
      return Number(combatStyleItem.system.value);
    }
  }

  // Fallback to a generic combat skill or attribute
  return Number(actor?.system?.combat?.value || actor?.system?.attributes?.initiative?.value || 50);
}

/**
 * Get defense skill value for an actor
 * @param {Actor} actor - The defending actor
 * @param {string} defenseType - Type of defense (evade, block, parry)
 * @returns {number} - Defense skill value
 */
function getDefenseSkill(actor, defenseType = 'evade') {
  if (!actor?.system) return 50;

  // Look for specific defense skill
  const defenseSkillName = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);
  const defenseSkill = actor.items.find(i => 
    (i.type === 'skill' || i.type === 'combatStyle') && 
    i.name.toLowerCase() === defenseSkillName.toLowerCase()
  );

  if (defenseSkill?.system?.value) {
    return Number(defenseSkill.system.value);
  }

  // Fallback to agility-based defense
  const agiTotal = Number(actor?.system?.characteristics?.agi?.total || 50);
  return agiTotal;
}

/**
 * Quick attack macro - attacks selected target with specified weapon
 * @param {string} weaponName - Name of weapon to use
 * @param {Object} options - Additional options
 */
export async function quickAttack(weaponName, options = {}) {
  // Get controlled token
  const controlled = canvas.tokens.controlled;
  if (controlled.length === 0) {
    ui.notifications.warn("Please select your token");
    return;
  }
  const attackerToken = controlled[0];

  // Get targeted token
  const targets = game.user.targets;
  if (targets.size === 0) {
    ui.notifications.warn("Please target an enemy");
    return;
  }
  const defenderToken = Array.from(targets)[0];

  // Find weapon
  const weapon = attackerToken.actor.items.find(i => 
    i.type === 'weapon' && i.name.toLowerCase().includes(weaponName.toLowerCase())
  );

  if (!weapon) {
    ui.notifications.warn(`Weapon "${weaponName}" not found`);
    return;
  }

  // Perform attack
  return await performWeaponAttack(attackerToken, defenderToken, weapon, options);
}

// Global exposure for macros
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.combat = window.Uesrpg3e.combat || {};
window.Uesrpg3e.combat.performWeaponAttack = performWeaponAttack;
window.Uesrpg3e.combat.quickAttack = quickAttack;
