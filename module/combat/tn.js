/**
 * module/combat/tn.js
 *
 * Deterministic TN computation pipeline for opposed workflow.
 *
 * Scope (Step 2):
 *  - Base TN (combat style / governing characteristic)
 *  - Attack variant mod (+20 / -20 / 0)
 *  - Manual modifier
 *  - Placeholders for later pipeline stages (difficulty, wounds, situational, effects)
 *
 * NOTE: This system is not on ApplicationV2.
 */

import { skillHelper, skillModHelper } from "../helpers/skillCalcHelper.js";
import { evaluateAEModifierKeys } from "../ae/modifier-evaluator.js";

/**
 * Read combat TN modifiers from actor.system.modifiers.combat.*.
 * These are intended to be written by Active Effects.
 *
 * Supported keys (all optional, default 0):
 *  - system.modifiers.combat.attackTN
 *  - system.modifiers.combat.defenseTN
 *  - system.modifiers.combat.defenseTN.<evade|block|parry|counter>
 */
/**
 * Collect combat TN modifiers from Active Effects.
 *
 * We do NOT rely on implicit "transfer" resolution for roll-time provenance. Instead we:
 *  - read Actor embedded effects
 *  - read Item effects that are marked transfer=true
 *
 * This allows:
 *  - deterministic application
 *  - per-effect provenance in TN breakdown (labels = effect.name)
 *
 * Supported change modes:
 *  - ADD (numeric)
 * Other modes are ignored for now by design to avoid implicit behavior differences.
 */
function getCombatTNModifiers(actor, role, defenseType) {
  const targetKeys = [];
  if (role === "attacker") targetKeys.push("system.modifiers.combat.attackTN");
  else if (role === "defender") {
    targetKeys.push("system.modifiers.combat.defenseTN.total");
    if (defenseType) targetKeys.push(`system.modifiers.combat.defenseTN.${defenseType}`);
  }

  const resolved = evaluateAEModifierKeys(actor, targetKeys);
  const entries = [];

  for (const k of targetKeys) {
    const r = resolved[k];
    if (!r || !r.entries?.length) continue;
    for (const e of r.entries) {
      entries.push({
        key: `ae-${k}-${e.effectId ?? randomID()}`,
        label: e.label,
        value: e.value,
        source: k,
        mode: e.mode,
      });
    }
  }

  const total = targetKeys.reduce((sum, k) => sum + (resolved[k]?.total ?? 0), 0);
  return { total, entries, resolvedByKey: resolved };
}


/**
 * Public helper for other pipelines (e.g. unopposed Combat Style checks) to
 * consume combat TN modifiers with the same provenance labels used by the
 * opposed combat TN workflow.
 *
 * @param {Actor} actor
 * @param {"attacker"|"defender"} role
 * @param {string|null} defenseType
 * @returns {Array<{key: string, label: string, value: number, source: string}>}
 */
export function collectCombatTNModifierEntries(actor, role, defenseType = null) {
  return getCombatTNModifiers(actor, role, defenseType)?.entries ?? [];
}

function asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function getCharTotal(actor, key) {
  return asNumber(actor?.system?.characteristics?.[key]?.total ?? actor?.system?.characteristics?.[key]?.value ?? 0);
}

export function listCombatStyles(actor) {
  const styles = (actor?.items ?? [])
    .filter(i => i.type === "combatStyle")
    .map(i => ({ uuid: i.uuid, id: i.id, name: i.name, item: i }));

  if (actor?.type === "NPC") {
    const sys = actor?.system ?? {};
    const combatVal = Number(sys?.professions?.combat ?? 0);
    styles.push({
      uuid: "prof:combat",
      id: "prof:combat",
      name: "Combat (Profession)",
      item: {
        uuid: "prof:combat",
        id: "prof:combat",
        type: "combatStyle",
        name: "Combat (Profession)",
        system: { value: combatVal, bonus: 0, miscValue: 0 }
      }
    });
  }

  return styles;
}


export function getCombatStyleItem(actor, styleUuidOrId) {
  if (!actor || !styleUuidOrId) return null;
if (typeof styleUuidOrId === "string" && styleUuidOrId.startsWith("prof:")) {
  const key = styleUuidOrId.slice(5);
  const sys = actor?.system ?? {};
  const base = Number(sys?.professions?.[key] ?? 0);
  const woundPenalty = Number(sys?.woundPenalty ?? 0);
  const fatiguePenalty = Number(sys?.fatigue?.penalty ?? 0);

  return {
    uuid: styleUuidOrId,
    id: styleUuidOrId,
    type: "combatStyle",
    name: key.charAt(0).toUpperCase() + key.slice(1),
    system: { value: base + fatiguePenalty + (sys?.wounded ? woundPenalty : 0), bonus: 0, miscValue: 0 },
    _professionKey: key
  };
}

  // Prefer UUID match when present
  const byUuid = (actor.items ?? []).find(i => i.uuid === styleUuidOrId);
  if (byUuid) return byUuid;
  const byId = (actor.items ?? []).find(i => i.id === styleUuidOrId);
  if (byId) return byId;
  return null;
}

/**
 * Determine whether an Actor has an equipped shield.
 *
 * Repository conventions (validated via exported shield item JSON):
 *  - Item type: "armor"
 *  - system.equipped: true
 *  - system.item_cat: "shield"
 */
export function hasEquippedShield(actor) {
  return (actor?.items ?? []).some(i => {
    if (i.type !== "armor") return false;
    if (!i.system?.equipped) return false;
    const itemCat = String(i.system?.item_cat ?? "").toLowerCase();
    if (itemCat === "shield") return true;
    // Backwards compatibility / legacy heuristics
    if (String(i.name ?? "").toLowerCase().includes("shield")) return true;
    return false;
  });
}

function computeCombatStyleTN(styleItem) {
  // styleItem.system.value is already computed in prepareData with penalties/bonuses.
  return asNumber(styleItem?.system?.value ?? 0);
}

function computeBlockTN(defender, styleItem) {
  // RAW: Combat Style test using Strength.
  const woundPenalty = asNumber(defender?.system?.woundPenalty ?? 0);
  const fatiguePenalty = asNumber(defender?.system?.fatigue?.penalty ?? 0);

  const strTotal = getCharTotal(defender, "str");
  const styleBonus = asNumber(styleItem?.system?.bonus ?? 0);
  const miscValue = asNumber(styleItem?.system?.miscValue ?? 0);
  const itemChaBonus = asNumber(skillHelper(defender, "str") ?? 0);
  const itemSkillBonus = asNumber(skillModHelper(defender, styleItem?.name ?? "") ?? 0);

  let tn = strTotal + styleBonus + miscValue + itemChaBonus + itemSkillBonus + fatiguePenalty;
  if (defender?.system?.wounded) tn += woundPenalty;
  return tn;
}

function computeEvadeTN(defender) {
if (defender?.type === "NPC") {
  const sys = defender?.system ?? {};
  const base = Number(sys?.professions?.evade ?? 0);
  const woundPenalty = Number(sys?.woundPenalty ?? 0);
  const fatiguePenalty = Number(sys?.fatigue?.penalty ?? 0);
  return base + fatiguePenalty + (sys?.wounded ? woundPenalty : 0);
}

  const evadeItem = (defender?.items ?? []).find(i => i.type === "skill" && String(i.name ?? "").toLowerCase() === "evade");
  const evadeTN = asNumber(evadeItem?.system?.value ?? 0);
  if (evadeTN) return evadeTN;
  return getCharTotal(defender, "agi");
}

export function variantMod(variant) {
  switch (variant) {
    case "allOut": return 20;
    case "precision": return -20;
    case "coup": return 0;
    case "normal":
    default: return 0;
  }
}

export function computeTN({
  actor,
  role,
  variant = "normal",
  defenseType = null,
  styleUuid = null,
  manualMod = 0,
  circumstanceMod = 0,
  context = {}
} = {}) {
  const breakdown = [];

  // --- Base TN
  let baseTN = 0;
  let baseLabel = "Base";

  if (role === "attacker") {
    const styleItem = getCombatStyleItem(actor, styleUuid);
    baseTN = computeCombatStyleTN(styleItem);
    baseLabel = "Base TN";
  } else if (role === "defender") {
    if (defenseType === "evade") {
      baseTN = computeEvadeTN(actor);
      baseLabel = "Base TN";
    } else if (defenseType === "block") {
      const shieldOk = hasEquippedShield(actor);
      if (!shieldOk) {
        baseTN = 0;
      } else if (typeof styleUuid === "string" && styleUuid.startsWith("prof:")) {
        const styleItem = getCombatStyleItem(actor, styleUuid);
        baseTN = Number(styleItem?.system?.value ?? 0);
      } else {
        const styleItem = getCombatStyleItem(actor, styleUuid);
        baseTN = styleItem ? computeBlockTN(actor, styleItem) : 0;
      }
      baseLabel = "Base TN";
    } else if (defenseType === "parry" || defenseType === "counter") {
      const styleItem = getCombatStyleItem(actor, styleUuid);
      baseTN = computeCombatStyleTN(styleItem);
      baseLabel = "Base TN";
    } else {
      baseTN = 0;
      baseLabel = "Base TN";
    }
  }

  // Keep a short label for chat-card real estate; preserve detail for debugging.
  const baseDetail = (role === "attacker")
    ? "Combat Style"
    : (defenseType === "evade")
      ? "Evade"
      : (defenseType === "block")
        ? "Block"
        : (defenseType === "parry" || defenseType === "counter")
          ? "Combat Style"
          : "—";

  breakdown.push({ key: "base", label: baseLabel, value: asNumber(baseTN), source: "base", detail: baseDetail });

  // --- Variant mod (attacker only)
  const vMod = (role === "attacker") ? variantMod(variant) : 0;
  if (vMod) breakdown.push({ key: "variant", label: "Attack option", value: vMod, source: "variant" });

  // --- Manual
  const mMod = asNumber(manualMod);
  if (mMod) breakdown.push({ key: "manual", label: "Manual", value: mMod, source: "manual" });

  // --- Combat circumstances (pre-AE): discrete disadvantage dropdown applied to this side's TN.
  const cMod = asNumber(circumstanceMod);
  if (cMod) breakdown.push({ key: "circumstance", label: "Circumstance", value: cMod, source: "circumstance" });

  // --- Active Effects combat TN modifiers (from system.modifiers.combat.*)
  // Applied exactly once at this stage, and only to TN (not to base characteristics).
  const ae = getCombatTNModifiers(actor, role, defenseType);
  for (const e of (ae.entries ?? [])) breakdown.push(e);


  // --- Placeholders for Step 2+ expansions
  if (context?.includePlaceholders) {
    breakdown.push({ key: "difficulty", label: "Difficulty", value: 0, source: "difficulty" });
    breakdown.push({ key: "wounds", label: "Wounds", value: 0, source: "wounds" });
    breakdown.push({ key: "situational", label: "Situational", value: 0, source: "situational" });
    breakdown.push({ key: "effects", label: "Effects", value: 0, source: "effects" });
  }

  const totalMod = breakdown
    .filter(b => b.key !== "base")
    .reduce((acc, b) => acc + asNumber(b.value), 0);

  const finalTN = asNumber(baseTN) + totalMod;

  return {
    finalTN,
    baseTN: asNumber(baseTN),
    totalMod,
    breakdown
  };
}
