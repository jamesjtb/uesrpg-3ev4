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
  return (actor?.items ?? [])
    .filter(i => i.type === "combatStyle")
    .map(i => ({ uuid: i.uuid, id: i.id, name: i.name, item: i }));
}

export function getCombatStyleItem(actor, styleUuidOrId) {
  if (!actor || !styleUuidOrId) return null;
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
      const styleItem = getCombatStyleItem(actor, styleUuid);
      const shieldOk = hasEquippedShield(actor);
      baseTN = (styleItem && shieldOk) ? computeBlockTN(actor, styleItem) : 0;
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
