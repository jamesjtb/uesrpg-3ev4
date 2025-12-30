/**
 * module/ae/transfer.js
 *
 * Deterministic "transfer" semantics for Item Active Effects.
 * This system does not rely on implicit Foundry transfer application in roll pipelines.
 *
 * Design goals:
 *  - Explicit, predictable, and type-gated application
 *  - Backward compatible with existing item data (no schema migrations required)
 *  - Forward compatible for spells: spell effects may be enabled later via an explicit "active" flag
 *
 * NOTE: This system is not on ApplicationV2.
 */

/**
 * Determine whether a transfer=true Active Effect on an Item should be considered active for the Actor.
 *
 * Current v1 rules:
 *  - talent / trait / power: always active (passive features)
 *  - weapon / armor: active only when item.system.equipped === true
 *  - spell: inactive unless the item is explicitly marked active via one of:
 *      item.system.active, item.system.isActive, item.flags.uesrpg?.activeSpell
 *    (these fields can be introduced later without rewriting this function)
 *  - other item types: inactive by default (conservative; we whitelist types deliberately)
 */
export function isTransferEffectActive(actor, item, effect) {
  if (!effect?.transfer) return false;
  if (effect?.disabled) return false;
  if (!item) return false;

  const type = item.type;

  // Passive feature types: always on.
  if (type === "talent" || type === "trait" || type === "power") return true;

  // Equipped-gated types.
  const equipped = item?.system?.equipped;
  if (type === "weapon" || type === "armor") return equipped === true;
  // Spells are handled via explicit application onto the Actor (see init.js SPELL_EFFECT_APPLICATION_V1).
  // Item transfer effects on spells remain inactive to prevent implicit or double application.
  if (type === "spell") return false;


  // Conservative default: do not apply unless explicitly supported.
  return false;
}

// Backward-compatible alias for callers.
export const isItemEffectActive = isTransferEffectActive;
