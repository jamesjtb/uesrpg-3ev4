/**
 * module/magic/damage-application.js
 *
 * Magic damage/healing application wrappers which delegate to the unified combat
 * damage/healing pipeline for full parity.
 *
 * Target: Foundry VTT v13.351
 */

import { applyDamage, applyHealing, DAMAGE_TYPES } from "../combat/damage-automation.js";

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

  return applyDamage(targetActor, Number(damage || 0), dt, {
    source,
    hitLocation,
    rollHTML,
    // Magic damage usually ignores armor unless the item provides specific magical/elemental reduction.
    // The unified pipeline already applies armor conditionally per damage type; keep default behavior.
    extraBreakdownLines,
  });
}

/**
 * Apply magic healing using the unified healing pipeline.
 *
 * @param {Actor} targetActor
 * @param {number} healing
 * @param {Item} spell
 * @param {object} options
 */
export async function applyMagicHealing(targetActor, healing, spell, options = {}) {
  if (!targetActor) return null;
  const source = _str(options.source ?? spell?.name ?? "Spell");
  const rollHTML = _str(options.rollHTML);
  return applyHealing(targetActor, Number(healing || 0), {
    source,
    rollHTML,
    // Per user requirement: omit current/max HP line to reduce metagame information.
    hideHpLine: true,
  });
}

// Legacy exports retained for compatibility (manual application lane not used by modern workflow).
export function renderMagicDamageButtons() {
  return "";
}

export function initializeDamageApplication() {
  // No-op: the modern workflow uses unified damage buttons in the combat card and direct application.
}
