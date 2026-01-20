/**
 * module/conditions/bleeding.js
 *
 * Chapter 5: Bleeding (X) condition automation.
 *
 * RAW summary (implemented):
 *  - At the start of the bleeding character's turn, they take X damage (bypasses AR/resistance).
 *  - Then X is reduced by 1.
 *  - If X reaches 0, the Bleeding condition is removed.
 *  - If multiple Bleeding effects exist, their values are combined into one.
 *
 * Partial (known limitation vs RAW):
 *  - Healing reduces X by the amount of HP actually restored by applyHealing().
 *    (The RAW text counts overheal; current system healing hook only reports actual HP restored.)
 *
 * This module does not mutate documents directly; it uses embedded document APIs.
 */

import { hasCondition } from "./condition-engine.js";
import { applyDamage } from "../combat/damage-automation.js";
import { requestCreateEmbeddedDocuments, requestDeleteEmbeddedDocuments, requestUpdateDocument } from "../../../module/helpers/authority-proxy.js";

const FLAG_SCOPE = "uesrpg-3ev4";
const FLAG_PATH = `flags.${FLAG_SCOPE}`;
const CONDITION_KEY = "bleeding";

let _registered = false;

/** @type {Map<string, {round: number, turn: number, combatantId: string|null}>} */
const _combatState = new Map();

function _getState(combat) {
  if (!combat?.id) return null;
  return _combatState.get(String(combat.id)) ?? null;
}

function _setState(combat) {
  if (!combat?.id) return;
  _combatState.set(String(combat.id), {
    round: Number(combat.round ?? 0),
    turn: Number(combat.turn ?? 0),
    combatantId: String(combat.combatantId ?? "") || null
  });
}

function _effectsOf(actor) {
  const e = actor?.effects;
  if (!e) return [];
  if (Array.isArray(e)) return e;
  return Array.isArray(e.contents) ? e.contents : [];
}

function _normKey(k) {
  return String(k ?? "").trim().toLowerCase();
}

function _readBleedingValue(effect) {
  // Prefer canonical flag value; fall back to parsing the name "Bleeding (X)".
  try {
    const flagged = effect?.getFlag?.(FLAG_SCOPE, "condition") ?? effect?.flags?.[FLAG_SCOPE]?.condition;
    const v = Number(flagged?.value ?? flagged?.x ?? 0);
    if (Number.isFinite(v) && v > 0) return Math.floor(v);
  } catch (_err) {}

  try {
    const name = String(effect?.name ?? "");
    const m = name.match(/\((\d+)\)/);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > 0) return Math.floor(v);
    }
  } catch (_err) {}

  return 1; // default for HUD-toggled bleeding with no parameter
}

function _isBleedingEffect(effect) {
  if (!effect) return false;
  const k = _normKey(effect?.getFlag?.(FLAG_SCOPE, "condition")?.key ?? effect?.flags?.[FLAG_SCOPE]?.condition?.key);
  if (k === CONDITION_KEY) return true;

  const coreId = _normKey(effect?.getFlag?.("core", "statusId") ?? effect?.flags?.core?.statusId);
  if (coreId === CONDITION_KEY) return true;

  try {
    if (effect.statuses && typeof effect.statuses?.has === "function" && effect.statuses.has(CONDITION_KEY)) return true;
  } catch (_err) {}

  const nm = _normKey(effect.name);
  return nm.startsWith(CONDITION_KEY);
}

async function _consolidateBleedingEffects(actor) {
  const effects = _effectsOf(actor).filter(_isBleedingEffect);
  if (!effects.length) return { effect: null, value: 0 };

  let total = 0;
  for (const ef of effects) total += Math.max(0, _readBleedingValue(ef));

  const primary = effects[0];
  const toDelete = effects.slice(1).map(e => e.id).filter(Boolean);

  if (toDelete.length) {
    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", toDelete);
    } catch (err) {
      console.warn("UESRPG | Bleeding | failed to delete duplicate effects", err);
    }
  }

  // Ensure the primary effect carries the consolidated value + stable flags + name.
  await _setBleedingValue(primary, total);
  return { effect: primary, value: total };
}

async function _setBleedingValue(effect, value) {
  if (!effect) return;
  const v = Math.max(0, Math.floor(Number(value) || 0));
  const name = v > 0 ? `Bleeding (${v})` : "Bleeding";
  const update = {
    name,
    [`${FLAG_PATH}.condition`]: { key: CONDITION_KEY, value: v },
    "flags.core.statusId": CONDITION_KEY
  };

  try {
    await requestUpdateDocument(effect, update);
  } catch (err) {
    console.warn("UESRPG | Bleeding | failed to update effect value", err);
  }
}

async function _removeBleeding(actor, effect) {
  if (!actor || !effect?.id) return;
  try {
    await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [effect.id]);
  } catch (err) {
    console.warn("UESRPG | Bleeding | failed to delete effect", err);
  }
}

/**
 * Apply Bleeding (X) to an actor, stacking with any existing Bleeding.
 *
 * @param {Actor} actor
 * @param {number} x
 * @param {object} options
 * @param {string} options.source
 */
export async function applyBleeding(actor, x, { source = "Bleeding" } = {}) {
  const amt = Math.floor(Number(x) || 0);
  if (!actor || amt <= 0) return null;

  // If the actor already has bleeding, consolidate and increase X.
  const existing = hasCondition(actor, CONDITION_KEY);
  if (existing) {
    const { effect, value } = await _consolidateBleedingEffects(actor);
    const next = Math.max(0, Math.floor(Number(value) || 0) + amt);
    await _setBleedingValue(effect, next);
    return effect;
  }

  // Create a fresh bleeding effect with canonical flags.
  const effectData = {
    name: `Bleeding (${amt})`,
    icon: "systems/uesrpg-3ev4/images/Icons/bleeding.webp",
    disabled: false,
    flags: {
      core: { statusId: CONDITION_KEY },
      [FLAG_SCOPE]: {
        condition: { key: CONDITION_KEY, value: amt },
        owner: "system",
        effectGroup: `condition.${CONDITION_KEY}`,
        stackRule: "refresh",
        source: "condition"
      }
    },
    origin: null,
    duration: {},
    changes: []
  };

  try {
    const created = await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [effectData]);
    return created?.[0] ?? null;
  } catch (err) {
    console.warn("UESRPG | Bleeding | failed to create effect", err);
    return null;
  }
}

/**
 * Reduce Bleeding (X) by an amount (e.g., from healing).
 *
 * @param {Actor} actor
 * @param {number} amount
 */
export async function reduceBleeding(actor, amount) {
  const amt = Math.floor(Number(amount) || 0);
  if (!actor || amt <= 0) return;

  const { effect, value } = await _consolidateBleedingEffects(actor);
  if (!effect || value <= 0) return;

  const next = Math.max(0, value - amt);
  if (next <= 0) return _removeBleeding(actor, effect);
  return _setBleedingValue(effect, next);
}

/**
 * Tick bleeding at the start of the actor's turn (GM-only).
 */
export async function tickBleedingStartTurn(actor) {
  if (!actor) return;

  const { effect, value } = await _consolidateBleedingEffects(actor);
  if (!effect || value <= 0) return;

  // Apply X damage, bypassing all reductions.
  try {
    await applyDamage(actor, value, "physical", {
      ignoreReduction: true,
      source: `Bleeding (${value})`,
      hitLocation: "Body"
    });
  } catch (err) {
    console.warn("UESRPG | Bleeding | applyDamage failed", err);
  }

  const next = Math.max(0, value - 1);
  if (next <= 0) return _removeBleeding(actor, effect);
  return _setBleedingValue(effect, next);
}

/**
 * Register Bleeding hooks once.
 */
export function registerBleeding() {
  if (_registered) return;
  _registered = true;

  // Combat ticker (start-of-turn).
  if (game?.combat) _setState(game.combat);

  Hooks.on("createCombat", (combat) => _setState(combat));

  Hooks.on("deleteCombat", (combat) => {
    if (!combat?.id) return;
    _combatState.delete(String(combat.id));
  });

  Hooks.on("updateCombat", async (combat) => {
    // Deterministic ticking: GM only.
    if (game?.user?.isGM !== true) return;
    if (!combat?.id) return;

    const prev = _getState(combat);
    const next = {
      round: Number(combat.round ?? 0),
      turn: Number(combat.turn ?? 0),
      combatantId: String(combat.combatantId ?? "") || null
    };

    const changed =
      !prev ||
      prev.round !== next.round ||
      prev.turn !== next.turn ||
      prev.combatantId !== next.combatantId;

    _combatState.set(String(combat.id), next);
    if (!changed) return;

    const cId = next.combatantId;
    if (!cId) return;

    const combatant = combat.combatants?.get?.(cId) ?? null;
    const actor = combatant?.actor ?? null;
    if (!actor) return;

    try {
      await tickBleedingStartTurn(actor);
    } catch (err) {
      console.warn("UESRPG | Bleeding | tick failed", err);
    }
  });

  // Healing reduction (GM only).
  Hooks.on("uesrpgHealingApplied", async (actor, data) => {
    try {
      if (game?.user?.isGM !== true) return;
      if (!actor) return;
      const healing = Math.floor(Number(data?.healing ?? 0) || 0);
      if (healing <= 0) return;
      await reduceBleeding(actor, healing);
    } catch (err) {
      console.warn("UESRPG | Bleeding | healing reduction failed", err);
    }
  });
}

export const BleedingAPI = {
  applyBleeding,
  reduceBleeding
};
