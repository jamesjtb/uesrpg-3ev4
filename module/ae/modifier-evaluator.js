/**
 * module/ae/modifier-evaluator.js
 *
 * Deterministic Active Effect modifier evaluation for roll-time pipelines.
 *
 * Goals:
 *  - Deterministic application order and behavior.
 *  - Support both ADD and OVERRIDE modes explicitly (only for recognized modifier keys).
 *  - Preserve transfer semantics hardening v1 via isTransferEffectActive().
 *  - Provide provenance breakdown per source (effect or item:effect).
 *
 * NOTE: This system is not on ApplicationV2.
 */

import { isTransferEffectActive } from "./transfer.js";

/**
 * Coerce a value into a finite number.
 * @param {*} v
 * @returns {number}
 */
function asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}


/**
 * Detect typed bonus damage syntax (e.g. "3[fire]") used for damage.dealt.
 * These values are handled separately by the damage resolver and must not be
 * treated as numeric dealt modifiers.
 * @param {*} v
 * @returns {boolean}
 */
function isTypedDamageDealtValue(v) {
  if (v == null) return false;
  const str = String(v).trim();
  return /^-?\d+(?:\.\d+)?\s*\[\s*[^\]]+\s*\]\s*$/i.test(str);
}

/**
 * Determine a stable priority for an ActiveEffect for deterministic OVERRIDE selection.
 * @param {ActiveEffect} effect
 * @returns {number}
 */
function getEffectPriority(effect) {
  const p = effect?.priority;
  if (typeof p === "number" && Number.isFinite(p)) return p;
  // Some AEs may store priority under flags; we intentionally do not infer those.
  return 0;
}

/**
 * Build roll-time modifier sources:
 *  - Actor embedded effects
 *  - Item effects that are transfer=true AND pass transfer semantics hardening v1
 *
 * @param {Actor} actor
 * @returns {Array<{effect: ActiveEffect, sourceName: string}>}
 */
function collectEffectSources(actor) {
  /** @type {Array<{effect: any, sourceName: string}>} */
  const sources = [];
  for (const ef of (actor?.effects ?? [])) {
    sources.push({ effect: ef, sourceName: ef?.name ?? "Effect" });
  }
  for (const item of (actor?.items ?? [])) {
    for (const ef of (item?.effects ?? [])) {
      if (!isTransferEffectActive(actor, item, ef)) continue;
      const src = item?.name ? `${item.name}` : (ef?.name ?? "Effect");
      sources.push({ effect: ef, sourceName: ef?.name ? `${src}: ${ef.name}` : src });
    }
  }
  return sources;
}

/**
 * Evaluate one or more modifier keys for a given actor.
 *
 * OVERRIDE behavior (explicit, deterministic):
 *  - If one or more OVERRIDE-mode changes exist for a key, choose the candidate with the
 *    highest ActiveEffect.priority; on tie, choose lexicographically greatest effect id.
 *  - When OVERRIDE is present, ADD contributions for that key are ignored.
 *
 * ADD behavior:
 *  - Sum all ADD-mode changes for that key (grouped by sourceName for provenance).
 *
 * @param {Actor} actor
 * @param {string[]} keys
 * @returns {Record<string, {total:number, mode:"ADD"|"OVERRIDE"|"NONE", entries:Array<{label:string,value:number,mode:"ADD"|"OVERRIDE",priority?:number,effectId?:string}>}>}
 */
export function evaluateAEModifierKeys(actor, keys) {
  const ADD = CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  const OVERRIDE = CONST?.ACTIVE_EFFECT_MODES?.OVERRIDE ?? 5;

  /**
   * Normalize an ActiveEffect change mode to a numeric CONST.ACTIVE_EFFECT_MODES value.
   * Foundry stores modes as numbers, but some data/model layers or legacy content can surface strings.
   * @param {unknown} mode
   * @returns {number}
   */
  function normalizeMode(mode) {
    if (typeof mode === "number" && Number.isFinite(mode)) return mode;
    if (typeof mode === "string") {
      const trimmed = mode.trim();
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
      const upper = trimmed.toUpperCase();
      if (upper === "ADD") return ADD;
      if (upper === "OVERRIDE") return OVERRIDE;
      if (upper === "MULTIPLY") return CONST?.ACTIVE_EFFECT_MODES?.MULTIPLY ?? 1;
      if (upper === "DOWNGRADE") return CONST?.ACTIVE_EFFECT_MODES?.DOWNGRADE ?? 3;
      if (upper === "UPGRADE") return CONST?.ACTIVE_EFFECT_MODES?.UPGRADE ?? 4;
      if (upper === "CUSTOM") return CONST?.ACTIVE_EFFECT_MODES?.CUSTOM ?? 0;
    }
    return Number.NaN;
  }

  const keySet = new Set(keys);

  /** @type {Record<string, any>} */
  const out = {};
  for (const k of keys) out[k] = { total: 0, mode: "NONE", entries: [] };

  const sources = collectEffectSources(actor);

  /** @type {Record<string, Map<string, number>>} */
  const addByKey = {};
  /** @type {Record<string, Array<{label:string,value:number,priority:number,effectId:string}>>} */
  const overrideByKey = {};

  for (const { effect, sourceName } of sources) {
    if (!effect || effect.disabled) continue;
    const changes = Array.isArray(effect.changes) ? effect.changes : [];
    for (const ch of changes) {
      if (!ch) continue;
      if (!keySet.has(ch.key)) continue;
      // Typed bonus damage values (e.g. "3[fire]") are handled by the damage resolver.
      if (ch.key === "system.modifiers.combat.damage.dealt" && isTypedDamageDealtValue(ch.value)) continue;

      if (normalizeMode(ch.mode) === OVERRIDE) {
        const cand = {
          label: sourceName,
          value: asNumber(ch.value),
          priority: getEffectPriority(effect),
          effectId: String(effect.id ?? ""),
        };
        (overrideByKey[ch.key] ??= []).push(cand);
        continue;
      }

      if (normalizeMode(ch.mode) === ADD) {
        (addByKey[ch.key] ??= new Map());
        const m = addByKey[ch.key];
        const prev = m.get(sourceName) ?? 0;
        m.set(sourceName, prev + asNumber(ch.value));
      }
    }
  }

  for (const k of keys) {
    const overrides = overrideByKey[k] ?? [];
    if (overrides.length) {
      // Deterministic selection: highest priority; tie-break by effectId
      overrides.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        // lexicographic descending for stability across sessions
        return String(b.effectId).localeCompare(String(a.effectId));
      });
      const chosen = overrides[0];
      out[k] = {
        total: chosen.value,
        mode: "OVERRIDE",
        entries: [{
          label: chosen.label,
          value: chosen.value,
          mode: "OVERRIDE",
          priority: chosen.priority,
          effectId: chosen.effectId,
        }],
      };
      continue;
    }

    const adds = addByKey[k];
    if (adds && adds.size) {
      const entries = [];
      let total = 0;
      for (const [label, value] of adds.entries()) {
        if (!value) continue;
        total += value;
        entries.push({ label, value, mode: "ADD" });
      }
      out[k] = { total, mode: "ADD", entries };
      continue;
    }

    out[k] = { total: 0, mode: "NONE", entries: [] };
  }

  return out;
}
