/**
 * module/magic/magicka-utils.js
 *
 * Magicka consumption and spell damage helpers for UESRPG 3ev4.
 * Implements RAW Chapter 6 rules for:
 *  - Spell Restraint (p.128 lines 215-224)
 *  - MP consumption
 *  - Spell damage calculation
 *  - Overload bonuses
 */

/**
 * Consume magicka from actor for casting a spell
 * @param {Actor} actor - The caster
 * @param {Item} spell - The spell being cast
 * @param {object} options - Spell options (isRestrained, isOverloaded, etc.)
 * @returns {Promise<object>} - { consumed: number, remaining: number }
 */
export async function consumeSpellMagicka(actor, spell, options = {}) {
  let cost = Number(spell.system?.cost ?? 0);
  
  // Apply Spell Restraint (RAW p.128 lines 215-224)
  // Reduces cost by WP bonus, minimum 1 MP
  if (options.isRestrained) {
    const wpBonus = Math.floor(Number(actor.system?.characteristics?.wp?.total ?? 0) / 10);
    cost = Math.max(1, cost - wpBonus);
  }
  
  // Overload doubles cost (talent-specific)
  if (options.isOverloaded) {
    cost *= 2;
  }
  
  // Deduct MP from actor
  const currentMP = Number(actor.system?.resources?.mp?.value ?? 0);
  const newMP = Math.max(0, currentMP - cost);
  
  await actor.update({ "system.resources.mp.value": newMP });
  
  return { consumed: cost, remaining: newMP };
}

/**
 * Roll spell damage
 * @param {Item} spell - The spell
 * @param {object} options - { isOverloaded, wpBonus, isCritical }
 * @returns {Promise<Roll>} - Evaluated damage roll
 */
export async function rollSpellDamage(spell, options = {}) {
  const damageFormula = String(spell.system?.damage ?? "0").trim();
  if (!damageFormula || damageFormula === "0") {
    return await new Roll("0").evaluate();
  }
  
  const roll = await new Roll(damageFormula).evaluate();
  
  // Critical success: return max damage instead
  if (options.isCritical) {
    const maxDamage = getMaxSpellDamage(spell);
    roll._total = maxDamage;
  }
  
  // Overload: +WB to damage (if specified and provided)
  if (options.isOverloaded && options.wpBonus) {
    roll._total += Number(options.wpBonus);
  }
  
  return roll;
}

/**
 * Get maximum damage for a spell (for critical hits)
 * @param {Item} spell - The spell
 * @returns {number} - Maximum damage value
 */
export function getMaxSpellDamage(spell) {
  const formula = String(spell.system?.damage ?? "0").trim();
  if (!formula || formula === "0") return 0;
  
  // Parse dice formula and return max (e.g., "2d6" -> 12, "3d8+5" -> 29)
  // Match pattern like "XdY" or "XdY+Z" or "XdY-Z"
  const diceMatch = formula.match(/(\d+)d(\d+)/g);
  let total = 0;
  
  if (diceMatch) {
    for (const dice of diceMatch) {
      const [count, sides] = dice.split('d').map(Number);
      total += count * sides;
    }
  }
  
  // Add modifiers (e.g., +5 or -3)
  const modMatch = formula.match(/[+\-]\d+/g);
  if (modMatch) {
    for (const mod of modMatch) {
      total += Number(mod);
    }
  }
  
  return Math.max(0, total);
}

/**
 * Get the magic skill level for a given school
 * @param {Actor} actor - The caster
 * @param {string} school - The spell school (e.g., "destruction")
 * @returns {number} - Spellcasting level (skill rank numeric + 1)
 */
export function getMagicSkillLevel(actor, school) {
  const schoolNormalized = String(school ?? "").toLowerCase();
  
  // Find the magic skill for this school
  const magicSkill = actor.items.find(i => 
    i.type === "magicSkill" && 
    String(i.name ?? "").toLowerCase().includes(schoolNormalized)
  );
  
  if (!magicSkill) return 0;
  
  // Convert rank to numeric value
  const rankToNumeric = {
    untrained: 0,
    novice: 1,
    apprentice: 2,
    journeyman: 3,
    adept: 4,
    expert: 5,
    master: 6
  };
  
  const rank = String(magicSkill.system?.rank ?? "untrained").toLowerCase();
  const rankValue = rankToNumeric[rank] ?? 0;
  
  // RAW Chapter 6 p.128 lines 180-184: Spellcasting Level = skill rank + 1
  return rankValue + 1;
}

/**
 * Compute the casting TN for a spell
 * @param {Actor} actor - The caster
 * @param {Item} spell - The spell being cast
 * @param {object} options - Additional modifiers
 * @returns {object} - { baseTN, modifiers, finalTN }
 */
export function computeMagicCastingTN(actor, spell, options = {}) {
  const school = String(spell.system?.school ?? "").toLowerCase();
  
  // Find magic skill for this school
  const magicSkill = actor.items.find(i => 
    i.type === "magicSkill" && 
    String(i.name ?? "").toLowerCase().includes(school)
  );
  
  // Base TN from skill or WP bonus
  const wpTotal = Number(actor.system?.characteristics?.wp?.total ?? 0);
  const wpBonus = Math.floor(wpTotal / 10);
  const baseTN = magicSkill ? Number(magicSkill.system?.value ?? 0) : wpBonus;
  
  // Calculate spellcasting level
  const spellcastingLevel = getMagicSkillLevel(actor, school);
  
  // Spell level penalty: -10 per spell level above spellcasting level
  const spellLevel = Number(spell.system?.level ?? 1);
  const levelPenalty = Math.max(0, spellLevel - spellcastingLevel) * -10;
  
  // Apply standard actor penalties
  const fatiguePenalty = Number(actor.system?.fatigue?.penalty ?? 0);
  const carryPenalty = Number(actor.system?.carry_rating?.penalty ?? 0);
  const woundPenalty = Number(actor.system?.woundPenalty ?? 0);
  
  // Manual modifier from options
  const manualMod = Number(options.manualModifier ?? 0);
  
  const modifiers = [
    { label: "Base TN", value: baseTN },
    { label: "Spell Level Penalty", value: levelPenalty },
    { label: "Fatigue Penalty", value: fatiguePenalty },
    { label: "Carry Penalty", value: carryPenalty },
    { label: "Wound Penalty", value: woundPenalty }
  ];
  
  if (manualMod !== 0) {
    modifiers.push({ label: "Manual Modifier", value: manualMod });
  }
  
  const finalTN = baseTN + levelPenalty + fatiguePenalty + carryPenalty + woundPenalty + manualMod;
  
  return {
    baseTN,
    spellcastingLevel,
    spellLevel,
    modifiers,
    finalTN: Math.max(0, finalTN)
  };
}
