/**
 * module/magic/damage-application.js
 *
 * Magic damage/healing application wrappers which delegate to the unified combat
 * damage/healing pipeline for full parity.
 *
 * Target: Foundry VTT v13.351
 */

import { applyDamage, applyHealing, DAMAGE_TYPES, getDamageReduction } from "../combat/damage-automation.js";

function _str(v) {
  return v === undefined || v === null ? "" : String(v);
}

function _bool(v) {
  if (v === true || v === false) return v;
  const s = _str(v).trim().toLowerCase();
  if (!s) return false;
  if (s === "true" || s === "1" || s === "yes" || s === "y" || s === "on") return true;
  return false;
}

/**
 * Apply magic damage with combat-parity mitigation breakdown.
 * 
 * RAW (Chapter 6): Magic damage is layered - it has both Magic as base damage type AND 
 * a specific elemental/typed damage. Resistances are applied in order:
 * 1. Elemental/typed resistance (fire, frost, shock, etc.) - applied first
 * 2. Magic resistance - applied second
 *
 * @param {Actor} targetActor
 * @param {number} damage
 * @param {string} damageType
 * @param {Item} spell
 * @param {object} options
 * @param {boolean} options.isCritical
 * @param {string} options.hitLocation
 * @param {string} options.rollHTML
 * @param {boolean} options.isOverloaded
 * @param {number} options.overloadBonus
 * @param {boolean} options.isOvercharged
 * @param {number[]} options.overchargeTotals
 * @param {number} options.elementalBonus
 * @param {string} options.elementalBonusLabel
 */
export async function applyMagicDamage(targetActor, damage, damageType, spell, options = {}) {
  if (!targetActor) return null;

  const dt = _str(damageType).toLowerCase() || DAMAGE_TYPES.MAGIC;
  const rollHTML = _str(options.rollHTML);
  const hitLocation = options.hitLocation ?? "Body";
  const source = _str(options.source ?? spell?.name ?? "Spell");

  const extraBreakdownLines = [];
  if (_bool(options.isOverloaded) && Number(options.overloadBonus || 0) > 0) {
    extraBreakdownLines.push(`Overload Bonus: +${Number(options.overloadBonus || 0)}`);
  }
  if (Number(options.elementalBonus || 0) > 0) {
    extraBreakdownLines.push(`${_str(options.elementalBonusLabel || "Elemental Talent")}: +${Number(options.elementalBonus || 0)}`);
  }
  if (_bool(options.isOvercharged) && Array.isArray(options.overchargeTotals) && options.overchargeTotals.length === 2) {
    const a = Number(options.overchargeTotals[0] ?? 0) || 0;
    const b = Number(options.overchargeTotals[1] ?? 0) || 0;
    extraBreakdownLines.push(`Master of Magicka: rolled twice (kept ${Math.max(a, b)} of ${a} / ${b})`);
  }

  // RAW: Spell damage is layered (Magic base + elemental type).
  // Calculate damage with layered resistance: elemental first, then magic.
  // This implementation ensures that ALL spell damage is treated as magical damage
  // in addition to any specific elemental type (fire, frost, shock, etc.).
  // For example, a Fire spell applies both Fire resistance AND Magic resistance.
  const isElementalSpell = (dt !== DAMAGE_TYPES.MAGIC && dt !== DAMAGE_TYPES.PHYSICAL && dt !== DAMAGE_TYPES.HEALING && dt !== "none");
  
  // For magic wound effects, track damage by type
  // This enables proper wound side effects (Fire -> Burning, Shock -> Magicka loss, etc.)
  const damageAppliedByType = {};
  if (dt && dt !== "none" && dt !== DAMAGE_TYPES.PHYSICAL) {
    damageAppliedByType[dt] = Number(damage || 0);
  }
  
  if (isElementalSpell) {
    // Step 1: Get elemental resistance/weakness
    const elementalReduction = getDamageReduction(targetActor, dt, hitLocation);
    const elementalResistance = elementalReduction.resistance || 0;
    
    // Step 2: Get magic resistance
    const magicReduction = getDamageReduction(targetActor, DAMAGE_TYPES.MAGIC, hitLocation);
    const magicResistance = magicReduction.resistance || 0;
    
    // Step 3: Apply layered resistance
    // Apply elemental resistance/weakness first (RAW: "Weakness is applied first")
    const afterElemental = Number(damage || 0) - elementalResistance;
    // Then apply magic resistance
    const finalDamage = afterElemental - magicResistance;
    
    // Add resistance breakdown to chat
    if (elementalResistance !== 0) {
      const sign = elementalResistance >= 0 ? "-" : "+";
      const absValue = Math.abs(elementalResistance);
      extraBreakdownLines.push(`${dt.charAt(0).toUpperCase() + dt.slice(1)} Resistance: ${sign}${absValue}`);
    }
    if (magicResistance !== 0) {
      const sign = magicResistance >= 0 ? "-" : "+";
      const absValue = Math.abs(magicResistance);
      extraBreakdownLines.push(`Magic Resistance: ${sign}${absValue}`);
    }
    
    // Apply the layered damage with ignoreReduction=true since we calculated it manually
    return applyDamage(targetActor, Math.max(0, finalDamage), dt, {
      source,
      hitLocation,
      rollHTML,
      ignoreReduction: true,
      extraBreakdownLines,
      damageAppliedByType,
    });
  }
  
  // Non-elemental spells (pure magic, physical, etc.) use normal damage pipeline
  return applyDamage(targetActor, Number(damage || 0), dt, {
    source,
    hitLocation,
    rollHTML,
    extraBreakdownLines,
    damageAppliedByType: dt && dt !== "none" && dt !== DAMAGE_TYPES.PHYSICAL ? damageAppliedByType : null,
  });
}

/**
 * Apply magic healing using the unified healing pipeline.
 *
 * @param {Actor} targetActor
 * @param {number} healing
 * @param {Item} spell
 * @param {object} options
 * @param {boolean} options.isTemporary - If true, grants temp HP instead of restoring HP
 */
export async function applyMagicHealing(targetActor, healing, spell, options = {}) {
  if (!targetActor) return null;
  const source = _str(options.source ?? spell?.name ?? "Spell");
  const rollHTML = _str(options.rollHTML);
  return applyHealing(targetActor, Number(healing || 0), {
    source,
    rollHTML,
    isTemporary: options.isTemporary === true,
    // Per user requirement: omit current/max HP line to reduce metagame information.
    hideHpLine: true,
    // Skip chat message since healing is already shown in the magic opposed card
    skipChatMessage: true,
  });
}


// Legacy exports retained for compatibility (manual application lane not used by modern workflow).
export function renderMagicDamageButtons() {
  return "";
}

export function initializeDamageApplication() {
  // No-op: the modern workflow uses unified damage buttons in the combat card and direct application.
}
