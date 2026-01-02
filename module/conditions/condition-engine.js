/**
 * module/conditions/condition-engine.js
 *
 * Lightweight condition helpers.
 *
 * This system represents conditions primarily as ActiveEffects. Many mechanics
 * (combat TN modifiers, movement restriction semantics, AP refresh rules) need
 * a single, deterministic way to detect whether a condition is present.
 *
 * Canonical representation (preferred):
 * - effect.flags["uesrpg-3ev4"].condition.key === <conditionKey>
 *
 * Defensive fallbacks:
 * - effect.getFlag("core", "statusId") === <conditionKey>
 * - effect.statuses contains <conditionKey> (Foundry status tracking)
 * - effect.name begins with <conditionKey>
 */

const FLAG_SCOPE = "uesrpg-3ev4";

function _normKey(key) {
  return String(key ?? "").trim().toLowerCase();
}

function _effectsOf(actor) {
  const e = actor?.effects;
  if (!e) return [];
  if (Array.isArray(e)) return e;
  // v13: ActiveEffectCollection on Actor has .contents
  return Array.isArray(e.contents) ? e.contents : [];
}

function _flaggedConditionKey(effect) {
  try {
    const flagged = effect?.getFlag?.(FLAG_SCOPE, "condition") ?? effect?.flags?.[FLAG_SCOPE]?.condition;
    const k = flagged?.key ? _normKey(flagged.key) : "";
    return k || "";
  } catch (_err) {
    return "";
  }
}

function _coreStatusId(effect) {
  try {
    const id = effect?.getFlag?.("core", "statusId") ?? effect?.flags?.core?.statusId;
    return _normKey(id);
  } catch (_err) {
    return "";
  }
}

function _nameKey(effect) {
  const nm = _normKey(effect?.name);
  if (!nm) return "";
  // Allow "prone" or "prone (some notes)"
  const first = nm.split("(")[0].trim();
  // Also allow "prone something" (legacy)
  const token = first.split(/\s+/)[0]?.trim() ?? "";
  return token;
}

/**
 * Does the actor currently have the specified condition?
 *
 * @param {Actor} actor
 * @param {string} key canonical condition key (lowercase recommended)
 * @returns {boolean}
 */
export function hasCondition(actor, key) {
  const k = _normKey(key);
  if (!actor || !k) return false;

  for (const ef of _effectsOf(actor)) {
    if (!ef) continue;

    // 1) Foundry status tracking
    try {
      if (ef.statuses && typeof ef.statuses?.has === "function" && ef.statuses.has(k)) return true;
    } catch (_err) {}

    // 2) System canonical flag
    if (_flaggedConditionKey(ef) === k) return true;

    // 3) Core statusId flag
    if (_coreStatusId(ef) === k) return true;

    // 4) Name-based legacy fallback
    if (_nameKey(ef) === k) return true;
  }

  return false;
}

/**
 * Return a Set of all detected condition keys on an Actor.
 *
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function listConditions(actor) {
  const out = new Set();
  if (!actor) return out;
  for (const ef of _effectsOf(actor)) {
    const k1 = _flaggedConditionKey(ef);
    if (k1) out.add(k1);
    const k2 = _coreStatusId(ef);
    if (k2) out.add(k2);
    const k3 = _nameKey(ef);
    if (k3) out.add(k3);
    try {
      if (ef.statuses && typeof ef.statuses?.forEach === "function") {
        ef.statuses.forEach((s) => {
          const ks = _normKey(s);
          if (ks) out.add(ks);
        });
      }
    } catch (_err) {}
  }
  return out;
}
