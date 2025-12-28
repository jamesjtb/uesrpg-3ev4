/**
 * module/combat/damage-resolver.js
 *
 * Single, shared resolver path for damage application.
 *
 * This module is the canonical boundary between UI payloads (chat card datasets,
 * sheet buttons, legacy cards) and the underlying damage engine.
 *
 * Pre-Active Effects responsibilities:
 *  - Normalize hit location keys/labels.
 *  - Derive effective penetration from weapon + payload.
 *  - Provide consistent option-shaping for damage-automation.applyDamage.
 *
 * Future Active Effects insertion point:
 *  - Apply Effects-derived modifiers to ctx BEFORE calling applyDamage().
 */

import { applyDamage, DAMAGE_TYPES } from "./damage-automation.js";
import { normalizeHitLocation } from "./mitigation.js";

/**
 * Resolve penetration from weapon data + payload override.
 *
 * Policy (pre-AE):
 *  - Start with payload penetration (e.g., ammo or explicit override).
 *  - Add weapon penetration if present.
 *  - Clamp at >= 0.
 */
function _resolvePenetration({ weapon, penetration = 0 } = {}) {
  const payloadPen = Number(penetration ?? 0) || 0;
  const weaponPen = Number(weapon?.system?.penetrationEffective ?? weapon?.system?.penetration ?? 0) || 0;
  return Math.max(0, payloadPen + weaponPen);
}

/**
 * Normalize a damage type string.
 */
function _normalizeDamageType(damageType) {
  const dt = String(damageType ?? "physical").toLowerCase();
  const valid = new Set(Object.values(DAMAGE_TYPES));
  return valid.has(dt) ? dt : DAMAGE_TYPES.PHYSICAL;
}

/**
 * Build a canonical damage context from a UI payload.
 *
 * @param {object} payload
 * @param {number} payload.rawDamage
 * @param {string} payload.damageType
 * @param {string} payload.hitLocation
 * @param {number} payload.penetration
 * @param {number} payload.dosBonus
 * @param {boolean} payload.ignoreReduction
 * @param {boolean} payload.penetrateArmorForTriggers
 * @param {boolean} payload.forcefulImpact
 * @param {boolean} payload.pressAdvantage
 * @param {Actor|null} payload.attackerActor
 * @param {Item|null} payload.weapon
 * @param {string} payload.source
 *
 * @returns {{ rawDamage:number, damageType:string, options:object, meta:object }}
 */
export function buildDamageContext(payload = {}) {
  const rawDamage = Number(payload.rawDamage ?? 0) || 0;
  const damageType = _normalizeDamageType(payload.damageType);

  const loc = normalizeHitLocation(payload.hitLocation);
  const hitLocationLabel = loc.label;

  const penetration = _resolvePenetration({ weapon: payload.weapon, penetration: payload.penetration });
  const dosBonus = Number(payload.dosBonus ?? 0) || 0;
  const ignoreReduction = payload.ignoreReduction === true;

  const options = {
    ignoreReduction,
    penetration,
    dosBonus,
    hitLocation: hitLocationLabel,
    source: String(payload.source ?? "Unknown"),
    penetrateArmorForTriggers: payload.penetrateArmorForTriggers === true,
    forcefulImpact: payload.forcefulImpact === true,
    pressAdvantage: payload.pressAdvantage === true,
    weapon: payload.weapon ?? null,
    attackerActor: payload.attackerActor ?? null,
  };

  const meta = {
    hitLocationKey: loc.key,
    hitLocationLabel,
    penetration,
    weaponPenetration: Number(payload.weapon?.system?.penetrationEffective ?? payload.weapon?.system?.penetration ?? 0) || 0,
  };

  return { rawDamage, damageType, options, meta };
}

/**
 * Apply damage using the canonical resolver path.
 *
 * @param {Actor} targetActor
 * @param {object} payload - see buildDamageContext
 * @returns {Promise<object|null>} Damage engine result (applyDamage return value)
 */
export async function applyDamageResolved(targetActor, payload = {}) {
  if (!targetActor) {
    ui.notifications.warn("No valid target actor found for damage application.");
    return null;
  }

  const ctx = buildDamageContext(payload);

  // Future AE insertion point:
  //  - modify ctx.rawDamage / ctx.options / ctx.damageType as needed based on AEs.

  return await applyDamage(targetActor, ctx.rawDamage, ctx.damageType, ctx.options);
}
