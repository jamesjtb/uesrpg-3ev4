/**
 * module/magic/spell-routing.js
 *
 * Centralized spell classification and routing helpers.
 */

const NAMESPACE = "uesrpg-3ev4";

function _str(v) {
  return v === undefined || v === null ? "" : String(v);
}

function _bool(v) {
  if (v === true || v === false) return v;
  const s = _str(v).trim().toLowerCase();
  if (!s) return false;
  if (s === "true" || s === "1" || s === "yes" || s === "y" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "n" || s === "off") return false;
  return false;
}

/**
 * Classify a spell for routing purposes.
 * @param {Item} spell
 * @returns {{isAttack: boolean, isHealing: boolean, isDirect: boolean, isTargeted: boolean, damageType: string}}
 */
export function classifySpellForRouting(spell) {
  const isAttack = (spell?.system?.isAttackSpell === true) || (_str(spell?.system?.isAttackSpell).toLowerCase() === "true");
  const damageType = _str(spell?.system?.damageType).toLowerCase();
  // Check both the isHealingSpell toggle AND the damageType for backwards compatibility
  const isHealing = _bool(spell?.system?.isHealingSpell) || (damageType === "healing");
  const isDirect = _bool(spell?.system?.isDirect);
  const isTargeted = isAttack || isHealing || isDirect;
  return { isAttack, isHealing, isDirect, isTargeted, damageType };
}

/**
 * Get current user targets in a stable array.
 * @returns {Token[]}
 */
export function getUserSpellTargets() {
  try {
    return Array.from(game.user?.targets ?? []);
  } catch (_e) {
    return [];
  }
}

/**
 * Determine whether this cast should route into the targeted MagicOpposedWorkflow.
 * @param {Item} spell
 * @param {Token[]} targets
 * @returns {boolean}
 */
export function shouldUseTargetedSpellWorkflow(spell, targets) {
  const cls = classifySpellForRouting(spell);
  return cls.isTargeted && Array.isArray(targets) && targets.length > 0;
}

/**
 * Determine whether this spell should use the modern casting engine even when untargeted.
 * All spells now use the modern pipeline for consistent Magicka handling and spell options.
 * @param {Item} spell
 * @returns {boolean}
 */
export function shouldUseModernSpellWorkflow(spell) {
  // All spells use the modern rolling pipeline
  return true;
}

/**
 * Optional debug logging for routing decisions.
 * @param {object} params
 * @param {string} params.source
 * @param {Actor} params.actor
 * @param {Item} params.spell
 * @param {Token[]} params.targets
 */
export function debugMagicRoutingLog({ source, actor, spell, targets }) {
  let enabled = false;
  try {
    enabled = game.settings?.get?.(NAMESPACE, "debugMagicRouting") === true;
  } catch (_e) {
    // Setting may not be registered yet if a world is mid-upgrade or a partial file copy occurred.
    enabled = false;
  }
  if (!enabled) return;
  const cls = classifySpellForRouting(spell);
  const t = Array.isArray(targets) ? targets.map(tt => tt?.document?.uuid ?? tt?.uuid ?? "?") : [];
  console.debug(`[UESRPG][MagicRouting] ${source}`, {
    actor: actor?.uuid ?? actor?.id,
    spell: spell?.uuid ?? spell?.id,
    classification: cls,
    targets: t
  });
}
