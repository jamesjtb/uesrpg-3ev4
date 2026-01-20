/**
 * src/core/conditions/condition-automation.js
 *
 * Restoration: condition mechanics and ticking automation.
 *
 * Goals:
 * - No schema changes
 * - Deterministic
 * - GM-authoritative ticking in combat for turn-based effects (Bleeding/Burning)
 * - Inject system-owned Active Effect "changes" for key conditions when created from Token HUD
 *
 * Notes:
 * - Condition keys are represented canonically via:
 *   effect.flags["uesrpg-3ev4"].condition.key
 * - Condition value (X) for Bleeding/Burning is stored in:
 *   effect.flags["uesrpg-3ev4"].condition.value (number)
 *   and mirrored in effect.name as "Bleeding (X)" / "Burning (X)" for readability.
 */

import { applyDamageResolved } from "../combat/damage-resolver.js";
import { hasCondition } from "./condition-engine.js";

const FLAG_SCOPE = "uesrpg-3ev4";
const MODE_ADD = (globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2);

/* -------------------------------------------- */
/* Condition template helpers                    */
/* -------------------------------------------- */

function _asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _normKey(k) {
  return String(k ?? "").trim().toLowerCase();
}

function _getConditionKeyFromAECreateData(data = {}) {
  const k1 = data?.flags?.[FLAG_SCOPE]?.condition?.key;
  if (k1) return _normKey(k1);

  const k2 = data?.flags?.core?.statusId;
  if (k2) return _normKey(k2);

  // Sometimes Foundry provides statuses as a Set or array (varies by caller)
  const sts = data?.statuses;
  try {
    if (Array.isArray(sts) && sts.length) return _normKey(sts[0]);
    if (sts && typeof sts?.values === "function") {
      const v = sts.values().next?.().value;
      if (v) return _normKey(v);
    }
  } catch (_err) {}

  return "";
}

function _defaultConditionValue(key) {
  if (key === "bleeding") return 1;
  if (key === "burning") return 1;
  return 0;
}

function _formatValueName(key, value) {
  const title = key.charAt(0).toUpperCase() + key.slice(1);
  if (value > 0 && (key === "bleeding" || key === "burning")) return `${title} (${value})`;
  return title;
}

/**
 * Inject deterministic change keys for specific conditions.
 *
 * IMPORTANT:
 * - We only inject if the incoming create data does NOT define changes.
 * - This allows manual effects or compendium effects to override/extend behavior safely.
 */
function _ensureConditionAEChanges(data, key) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data.changes) && data.changes.length) return data;

  /** @type {Array<{key:string, mode:number, value:string, priority:number}>} */
  const changes = [];

  // RAW: Prone => -20 to all combat-related tests (attacks + all defenses).
  if (key === "prone") {
    changes.push({ key: "system.modifiers.combat.attackTN", mode: MODE_ADD, value: "-20", priority: 20 });
    changes.push({ key: "system.modifiers.combat.defenseTN.total", mode: MODE_ADD, value: "-20", priority: 20 });
  }

  // RAW: Entangled => -20 to Combat Style tests; defense penalty should apply to parry/counter/block, not evade.
  if (key === "entangled") {
    changes.push({ key: "system.modifiers.combat.attackTN", mode: MODE_ADD, value: "-20", priority: 20 });
    changes.push({ key: "system.modifiers.combat.defenseTN.parry", mode: MODE_ADD, value: "-20", priority: 20 });
    changes.push({ key: "system.modifiers.combat.defenseTN.counter", mode: MODE_ADD, value: "-20", priority: 20 });
    changes.push({ key: "system.modifiers.combat.defenseTN.block", mode: MODE_ADD, value: "-20", priority: 20 });
  }

  // Bleeding: reduce Wound Threshold by 1.
  if (key === "bleeding") {
    changes.push({ key: "system.wound_threshold.bonus", mode: MODE_ADD, value: "-1", priority: 20 });
  }

  if (!changes.length) return data;
  return { ...data, changes };
}

/* -------------------------------------------- */
/* Actor effect accessors (Bleeding/Burning X)   */
/* -------------------------------------------- */

function _findConditionEffect(actor, key) {
  const k = _normKey(key);
  for (const ef of (actor?.effects ?? [])) {
    if (!ef) continue;
    if (ef?.disabled) continue;

    const fk = ef?.flags?.[FLAG_SCOPE]?.condition?.key;
    if (_normKey(fk) === k) return ef;

    const coreId = ef?.flags?.core?.statusId;
    if (_normKey(coreId) === k) return ef;

    // fallback: statuses contains key
    try {
      if (ef.statuses && typeof ef.statuses?.has === "function" && ef.statuses.has(k)) return ef;
    } catch (_err) {}
  }
  return null;
}

function _getConditionValue(effect, key) {
  if (!effect) return 0;
  const v = _asNumber(effect?.flags?.[FLAG_SCOPE]?.condition?.value);
  if (v) return v;

  // Fallback: parse "(X)" from name
  const name = String(effect?.name ?? "");
  const m = name.match(/\((\d+)\)/);
  if (m) return _asNumber(m[1]);

  return _defaultConditionValue(key);
}

async function _setConditionValue(actor, effect, key, nextValue) {
  if (!actor || !effect) return;
  const v = Math.max(0, Math.floor(_asNumber(nextValue)));

  if (v <= 0) {
    try { await effect.delete(); } catch (_err) {}
    return;
  }

  const updates = {
    name: _formatValueName(key, v),
    flags: {
      [FLAG_SCOPE]: {
        ...(effect?.flags?.[FLAG_SCOPE] ?? {}),
        condition: {
          ...((effect?.flags?.[FLAG_SCOPE] ?? {})?.condition ?? {}),
          key,
          value: v
        }
      }
    }
  };

  try {
    await effect.update(updates);
  } catch (_err) {
    // If effect update fails, do not hard-fail combat progression.
  }
}

/* -------------------------------------------- */
/* Combat ticking (GM-authoritative)             */
/* -------------------------------------------- */

let _tickerRegistered = false;
/** @type {Map<string, {round:number, turn:number, combatantId:string|null}>} */
const _combatState = new Map();

function _getState(combat) {
  return _combatState.get(String(combat?.id ?? ""));
}

function _setState(combat) {
  _combatState.set(String(combat.id), {
    round: Number(combat.round ?? 0),
    turn: Number(combat.turn ?? 0),
    combatantId: String(combat.combatantId ?? "")
  });
}

/**
 * Tick end-of-turn effects for the combatant who just finished their turn.
 */
async function _tickEndOfTurn(combat, prevCombatantId) {
  if (!combat || !prevCombatantId) return;

  const prev = combat.combatants?.get(prevCombatantId) ?? null;
  const actor = prev?.actor ?? null;
  if (!actor) return;

  // BLEEDING (X): end of turn => take X damage ignoring AR/resistance, then X -= 1, remove at 0
  const bleedingEf = _findConditionEffect(actor, "bleeding");
  if (bleedingEf) {
    const x = _getConditionValue(bleedingEf, "bleeding");
    if (x > 0) {
      try {
        await applyDamageResolved(actor, {
          damage: x,
          damageType: "physical",
          hitLocation: "Body",
          ignoreReduction: true,
          source: "Bleeding"
        });
      } catch (_err) {}

      await _setConditionValue(actor, bleedingEf, "bleeding", x - 1);
    }
  }

  // BURNING (X): end of turn => take X fire damage, then X += 1
  const burningEf = _findConditionEffect(actor, "burning");
  if (burningEf) {
    const x = _getConditionValue(burningEf, "burning");
    if (x > 0) {
      try {
        await applyDamageResolved(actor, {
          damage: x,
          damageType: "fire",
          hitLocation: "Body",
          ignoreReduction: false,
          source: "Burning"
        });
      } catch (_err) {}

      await _setConditionValue(actor, burningEf, "burning", x + 1);
    }
  }
}

/**
 * Prompt start-of-turn reminder for Burning action restriction (prompt sufficient).
 */
async function _promptStartOfTurn(combat) {
  const c = combat?.combatant ?? null;
  const actor = c?.actor ?? null;
  if (!actor) return;

  if (!hasCondition(actor, "burning")) return;

  // Prompt sufficient: chat note. No enforcement is applied.
  try {
    const speaker = ChatMessage.getSpeaker({ actor });
    await ChatMessage.create({
      speaker,
      content: `<p><strong>Burning:</strong> At the start of your turn, you must pass a <strong>Willpower test (-20)</strong> to attempt any action other than putting out the fire.</p>`,
      whisper: []
    });
  } catch (_err) {}
}

function _shouldTick(combat, changes) {
  if (!combat?.id) return false;
  if (!changes) return false;
  // Tick on turn or round changes
  return Object.prototype.hasOwnProperty.call(changes, "turn") || Object.prototype.hasOwnProperty.call(changes, "round") || Object.prototype.hasOwnProperty.call(changes, "combatantId");
}

export function registerConditionAutomationHooks() {
  if (_tickerRegistered) return;
  _tickerRegistered = true;

  // Inject AE templates for condition status toggles
  if (!game.uesrpg._conditionAETemplateHook) {
    game.uesrpg._conditionAETemplateHook = true;

    Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
      try {
        // Only the creating user should shape the effect data.
        if (game.userId !== userId) return;

        const parent = effect?.parent ?? options?.parent ?? null;
        if (!parent || parent.documentName !== "Actor") return;

        const key = _getConditionKeyFromAECreateData(data);
        if (!key) return;

        // Frenzied is handled by frenzied.js with dynamic talent-based changes
        // Skip it here to avoid interfering with its custom changes
        if (key === "frenzied") return;

        // Only shape known condition effects from the Token HUD palette.
        const supported = new Set(["prone", "entangled", "bleeding", "burning"]);
        if (!supported.has(key)) return;

        let next = { ...(data ?? {}) };

        // Ensure canonical condition flags exist.
        next.flags = next.flags ?? {};
        next.flags.core = { ...(next.flags.core ?? {}), statusId: key };
        const isNumericCondition = key === "bleeding" || key === "burning";
        const stackRule = isNumericCondition ? "refresh" : "override";
        next.flags[FLAG_SCOPE] = {
          ...(next.flags[FLAG_SCOPE] ?? {}),
          condition: {
            ...((next.flags[FLAG_SCOPE] ?? {})?.condition ?? {}),
            key
          },
          owner: "system",
          effectGroup: `condition.${key}`,
          stackRule: stackRule,
          source: "condition"
        };

        // Ensure value + readable name for X conditions
        if (key === "bleeding" || key === "burning") {
          const dv = _defaultConditionValue(key);
          const curV = _asNumber(next?.flags?.[FLAG_SCOPE]?.condition?.value);
          const v = curV > 0 ? curV : dv;
          next.flags[FLAG_SCOPE].condition.value = v;
          next.name = _formatValueName(key, v);
        }

        // Inject change templates if not already provided.
        next = _ensureConditionAEChanges(next, key);

        // Apply mutation to pending create data
        if (foundry?.utils?.mergeObject) {
          foundry.utils.mergeObject(data, next, { inplace: true });
        }
      } catch (_err) {
        // Do not hard-fail creation.
      }
    });
  }

  // Deterministic combat tick: GM-authoritative
  Hooks.on("deleteCombat", (combat) => {
    if (!combat?.id) return;
    _combatState.delete(String(combat.id));
  });

  Hooks.on("updateCombat", async (combat, changes) => {
    if (game?.user?.isGM !== true) return;
    if (!combat?.id) return;
    if (!_shouldTick(combat, changes)) return;

    const prev = _getState(combat);
    if (!prev) {
      _setState(combat);
      return;
    }

    // Determine if a turn ended
    const prevCombatantId = prev.combatantId;
    const newCombatantId = String(combat.combatantId ?? "");

    const prevRound = prev.round;
    const prevTurn = prev.turn;
    const newRound = Number(combat.round ?? 0);
    const newTurn = Number(combat.turn ?? 0);

    const advanced = (newRound !== prevRound) || (newTurn !== prevTurn) || (newCombatantId !== prevCombatantId);
    if (!advanced) return;

    // Tick the combatant who just finished
    await _tickEndOfTurn(combat, prevCombatantId);

    // Update state
    _setState(combat);

    // Prompt start-of-turn reminder for burning (prompt sufficient)
    await _promptStartOfTurn(combat);
  });

  // Healing hook: reduce Bleeding X by total healing attempted (including overheal)
  Hooks.on("uesrpgHealingApplied", async ({ actor, amountRequested, amountApplied } = {}) => {
    try {
      if (!actor) return;
      const healReq = _asNumber(amountRequested ?? amountApplied ?? 0);
      if (healReq <= 0) return;

      const ef = _findConditionEffect(actor, "bleeding");
      if (!ef) return;

      const x = _getConditionValue(ef, "bleeding");
      if (x <= 0) return;

      await _setConditionValue(actor, ef, "bleeding", x - healReq);
    } catch (_err) {}
  });
}
