import { isItemEffectActive } from "./transfer.js";

/**
 * UESRPG Active Effect Modifier Evaluator
 *
 * Purpose:
 * - Deterministically aggregate a subset of Active Effect changes into numeric modifiers.
 * - Avoid reliance on Foundry's implicit AE application semantics for gameplay-critical math.
 *
 * Supported behaviors:
 * - Only `ADD` and `OVERRIDE` modes are intentionally supported for numeric aggregation.
 * - All other AE change modes are ignored by default (opt-in debug logging via options).
 *
 * Notes:
 * - This evaluator is "context-capable" but context checks are opt-in and no-op by default.
 * - Dedupe-by-origin is conservative: if an actor already has an effect with the same origin
 *   as a transfer effect, the transfer effect is ignored to prevent double-application.
 */

/**
 * @typedef {object} AEEvaluateOptions
 * @property {object} [context] Optional evaluation context (e.g., opponentUuid, attackMode, itemUuid).
 * @property {boolean} [enforceConditions=false] If true, will enforce `effect.flags.uesrpg.conditions`.
 * @property {boolean} [dedupeByOrigin=true] If true, will ignore transfer effects duplicating actor effects by origin.
 * @property {boolean} [debug=false] If true, will emit console.debug logs for ignored/unsupported changes.
 */

/**
 * Evaluate a set of modifier keys against the actor's currently-applicable Active Effects.
 *
 * @param {import("foundry").documents.BaseActor} actor
 * @param {string[]} keys
 * @param {AEEvaluateOptions} [options]
 * @returns {Record<string, number>} Map of key->numeric modifier total
 */
export function evaluateAEModifierKeys(actor, keys, options = {}) {
  return _evaluateCore(actor, keys, options).totalsByKey;
}

/**
 * Evaluate a set of modifier keys and return a deterministic breakdown by Active Effect.
 *
 * This is used by opposed-roll TN breakdown cards so users can see which effects contributed.
 *
 * @param {import("foundry").documents.BaseActor} actor
 * @param {string[]} keys
 * @param {AEEvaluateOptions} [options]
 * @returns {{ totalsByKey: Record<string, number>, entries: Array<{label:string, value:number, source:"ae", effectId?:string, effectUuid?:string}>, resolvedByKey: Record<string, number> }}
 */
export function evaluateAEModifierKeysDetailed(actor, keys, options = {}) {
  return _evaluateCore(actor, keys, options);
}

function _evaluateCore(actor, keys, options = {}) {
  const {
    context = null,
    enforceConditions = false,
    dedupeByOrigin = true,
    debug = false
  } = options ?? {};

  const keySet = new Set(Array.isArray(keys) ? keys : []);
  /** @type {Record<string, number>} */
  const totalsByKey = {};
  for (const k of keySet) totalsByKey[k] = 0;

  /** @type {Map<string, { label: string, order: number, value: number, effectId?: string, effectUuid?: string }>} */
  const entriesByEffect = new Map();

  if (!actor || keySet.size === 0) {
    return { totalsByKey, entries: [], resolvedByKey: totalsByKey };
  }

  const effects = _collectApplicableEffects(actor, { dedupeByOrigin, debug });

  // Track per-key per-effect contributions so OVERRIDE can replace prior values deterministically.
  /** @type {Map<string, Map<string, number>>} */
  const byKeyByEffect = new Map();
  for (const k of keySet) byKeyByEffect.set(k, new Map());

  for (let idx = 0; idx < effects.length; idx++) {
    const effect = effects[idx];

    if (enforceConditions && !_effectMatchesContext(effect, context)) {
      if (debug) console.debug(`[UESRPG|AE] Skipping effect due to conditions`, { effect, context });
      continue;
    }

    const changes = Array.isArray(effect.changes) ? effect.changes : [];
    for (const change of changes) {
      const key = change?.key;
      if (!keySet.has(key)) continue;

      const mode = change?.mode;
      const rawValue = change?.value;

      const numeric = _toNumber(rawValue);
      if (numeric === null) {
        if (debug) console.debug(`[UESRPG|AE] Ignoring non-numeric AE change`, { change, effect });
        continue;
      }

      const effKey = String(effect?.uuid ?? effect?.id ?? effect?._id ?? `${idx}`);
      const effName = String(effect?.name ?? "Active Effect");

      // Ensure entry exists to preserve stable ordering.
      if (!entriesByEffect.has(effKey)) {
        entriesByEffect.set(effKey, {
          label: effName,
          order: idx,
          value: 0,
          effectId: effect?.id,
          effectUuid: effect?.uuid
        });
      }

      const mapForKey = byKeyByEffect.get(key);
      if (!mapForKey) continue;

      if (_isAddMode(mode)) {
        const prev = mapForKey.get(effKey) ?? 0;
        mapForKey.set(effKey, prev + numeric);
        continue;
      }

      if (_isOverrideMode(mode)) {
        // OVERRIDE replaces all prior contributions for that key.
        mapForKey.clear();
        mapForKey.set(effKey, numeric);
        continue;
      }

      if (debug) console.debug(`[UESRPG|AE] Ignoring unsupported AE change mode`, { mode, change, effect });
    }
  }

  // Finalize totals by key and entries by effect (aggregate across all keys)
  for (const key of keySet) {
    const mapForKey = byKeyByEffect.get(key);
    if (!mapForKey) continue;

    let keyTotal = 0;
    for (const v of mapForKey.values()) keyTotal += (Number(v) || 0);
    totalsByKey[key] = keyTotal;

    for (const [effKey, v] of mapForKey.entries()) {
      const entry = entriesByEffect.get(effKey);
      if (!entry) continue;
      entry.value += (Number(v) || 0);
    }
  }

  // Convert to ordered breakdown, omitting zero-value entries.
  const entries = Array.from(entriesByEffect.values())
    .filter(e => (Number(e.value) || 0) !== 0)
    .sort((a, b) => a.order - b.order)
    .map(e => ({
      label: e.label,
      value: e.value,
      source: "ae",
      effectId: e.effectId,
      effectUuid: e.effectUuid
    }));

  return { totalsByKey, entries, resolvedByKey: totalsByKey };
}

/**
 * Collect currently-applicable effects from actor + transferable embedded item effects.
 * Uses the system's transfer gating helper when available.
 *
 * @param {import("foundry").documents.BaseActor} actor
 * @param {{dedupeByOrigin:boolean, debug:boolean}} options
 * @returns {any[]} Array of ActiveEffect-like objects
 */
function _collectApplicableEffects(actor, { dedupeByOrigin, debug }) {
  const actorEffects = Array.from(actor.effects ?? []);

  // Index origins already present directly on the actor.
  const actorOrigins = new Set(
    actorEffects.map(e => e?.origin).filter(o => typeof o === "string" && o.length > 0)
  );

  /** @type {any[]} */
  const transferable = [];

  // Collect transfer effects from embedded items (actor-owned).
  for (const item of actor.items ?? []) {
    const itemEffects = Array.from(item?.effects ?? []);
    for (const effect of itemEffects) {
      // Respect existing gating helper if present, otherwise fallback to transfer flag.
      let isActive = false;
      try {
        // Use the system's deterministic transfer gating (same as actor-sheet TN breakdown).
        isActive = isItemEffectActive(actor, item, effect);
      } catch (err) {
        if (debug) console.debug(`[UESRPG|AE] Transfer gating threw; skipping effect`, { err, effect, item });
        isActive = false;
      }

      if (!isActive) continue;

      if (dedupeByOrigin) {
        const origin = effect?.origin;
        if (origin && actorOrigins.has(origin)) {
          if (debug) console.debug(`[UESRPG|AE] Dedupe transfer effect by origin`, { origin, effect, item });
          continue;
        }
      }

      transferable.push(effect);
    }
  }

  return actorEffects.concat(transferable);
}

/**
 * Optional condition matching for context-specific effects.
 * Convention:
 * - effect.flags.uesrpg.conditions is an object with optional keys like:
 *   - opponentUuid, attackMode, itemUuid
 *
 * This is intentionally strict: if conditions exist, all present ones must match.
 *
 * @param {any} effect
 * @param {object|null} context
 * @returns {boolean}
 */
function _effectMatchesContext(effect, context) {
  const conditions = effect?.flags?.uesrpg?.conditions;
  if (!conditions || typeof conditions !== "object") return true;

  if (!context || typeof context !== "object") return false;

  for (const [k, expected] of Object.entries(conditions)) {
    if (expected === undefined) continue;

    // RAW (Chapter 5): Overextend applies to the opponent's next attack within 1 round
    // regardless of who that attack targets. Some legacy effects store opponent scoping
    // in conditions.opponentUuid; ignore that scoping for Overextend so it applies to
    // the next attack against any target.
    const uesrpgKey = effect?.flags?.uesrpg?.key;
    if (uesrpgKey === "overextend" && k === "opponentUuid") continue;

    // Canonical combat lane: `context.attackMode`. Older chat cards/effects may use `attackType`.
    if (k === "attackMode" || k === "attackType") {
      const actual = (context.attackMode ?? context.attackType ?? "");
      if (String(actual).toLowerCase() !== String(expected).toLowerCase()) return false;
      continue;
    }

    if (context[k] !== expected) return false;
  }

  return true;
}

function _toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
    return null;
  }

  // Do not attempt to coerce booleans/objects.
  return null;
}

function _isAddMode(mode) {
  // Foundry uses CONST.ACTIVE_EFFECT_MODES; support numeric + string.
  if (mode === 2 || mode === "ADD") return true;
  const CONST_MODES = globalThis?.CONST?.ACTIVE_EFFECT_MODES;
  if (CONST_MODES && mode === CONST_MODES.ADD) return true;
  return false;
}

function _isOverrideMode(mode) {
  if (mode === 5 || mode === "OVERRIDE") return true;
  const CONST_MODES = globalThis?.CONST?.ACTIVE_EFFECT_MODES;
  if (CONST_MODES && mode === CONST_MODES.OVERRIDE) return true;
  return false;
}
