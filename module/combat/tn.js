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
import { collectCombatTNModifiersFromAE } from "../ae/combat-tn-modifiers.js";

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
function getCombatTNModifiers(actor, role, defenseType, context) {
  return collectCombatTNModifiersFromAE(actor, role, defenseType, context);
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
  // This helper has no context, so only non-contextual effects will be included.
  return getCombatTNModifiers(actor, role, defenseType, {})?.entries ?? [];
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

// --- Size-to-Hit (Chapter 5) ----------------------------------------------

const SIZE_INDEX = {
  puny: 0,
  tiny: 1,
  small: 2,
  standard: 3,
  large: 4,
  huge: 5,
  enormous: 6
};

function _normalizeSize(size) {
  const s = String(size ?? "standard").trim().toLowerCase();
  if (s === "punity") return "puny"; // legacy typo in some rule text
  return SIZE_INDEX[s] != null ? s : "standard";
}

function _sizeIndex(size) {
  return SIZE_INDEX[_normalizeSize(size)] ?? SIZE_INDEX.standard;
}

function _sizeToHitModForTargetSize(size) {
  // Chapter 5: Size-to-Hit Effects
  // Puny -30, Tiny -20, Small -10, Standard 0, Large +10, Huge +20, Enormous +30
  switch (_normalizeSize(size)) {
    case "puny": return -30;
    case "tiny": return -20;
    case "small": return -10;
    case "large": return 10;
    case "huge": return 20;
    case "enormous": return 30;
    case "standard":
    default: return 0;
  }
}

function computeSizeToHitModifier({ attackerSize, targetSize, attackMode } = {}) {
  const aIdx = _sizeIndex(attackerSize);
  const tIdx = _sizeIndex(targetSize);
  const mode = String(attackMode ?? "melee").toLowerCase();

  // Ranged: apply the size-to-hit table directly.
  if (mode === "ranged") return _sizeToHitModForTargetSize(targetSize);

  // Melee: apply only the conditional clauses in Chapter 5.
  // - Small targets are harder to hit by larger creatures.
  // - Huge/Enormous targets are easier to hit by smaller creatures.
  const tNorm = _normalizeSize(targetSize);

  if (aIdx > tIdx && (tNorm === "puny" || tNorm === "tiny" || tNorm === "small")) {
    return _sizeToHitModForTargetSize(tNorm);
  }

  if (aIdx < tIdx && (tNorm === "huge" || tNorm === "enormous")) {
    return _sizeToHitModForTargetSize(tNorm);
  }

  return 0;
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
  if (!actor || !styleUuidOrId) {
    if (!actor) console.warn("UESRPG | getCombatStyleItem: No actor provided");
    if (!styleUuidOrId) console.warn("UESRPG | getCombatStyleItem: No styleUuidOrId provided");
    return null;
  }
if (typeof styleUuidOrId === "string" && styleUuidOrId.startsWith("prof:")) {
  const key = styleUuidOrId.slice(5);
  const sys = actor?.system ?? {};
  const base = Number(sys?.professions?.[key] ?? 0);
  const woundPenalty = Number(sys?.woundPenalty ?? 0);
  const fatiguePenalty = Number(sys?.fatigue?.penalty ?? 0);

  console.log("UESRPG | getCombatStyleItem: Resolved profession combat style", { 
    actor: actor.name, 
    key, 
    value: base + fatiguePenalty + woundPenalty 
  });
  
  return {
    uuid: styleUuidOrId,
    id: styleUuidOrId,
    type: "combatStyle",
    name: key.charAt(0).toUpperCase() + key.slice(1),
    system: { value: base + fatiguePenalty + woundPenalty, bonus: 0, miscValue: 0 },
    _professionKey: key
  };
}

  // Prefer UUID match when present
  const byUuid = (actor.items ?? []).find(i => i.uuid === styleUuidOrId);
  if (byUuid) {
    console.log("UESRPG | getCombatStyleItem: Resolved by UUID", { 
      actor: actor.name, 
      uuid: styleUuidOrId,
      name: byUuid.name,
      type: byUuid.type,
      value: byUuid.system?.value ?? 0
    });
    return byUuid;
  }
  const byId = (actor.items ?? []).find(i => i.id === styleUuidOrId);
  if (byId) {
    console.log("UESRPG | getCombatStyleItem: Resolved by ID", { 
      actor: actor.name, 
      id: styleUuidOrId,
      name: byId.name,
      type: byId.type,
      value: byId.system?.value ?? 0
    });
    return byId;
  }
  
  console.error("UESRPG | getCombatStyleItem: Could not resolve combat style", { 
    actor: actor.name, 
    styleUuidOrId 
  });
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
  const value = asNumber(styleItem?.system?.value ?? 0);
  
  if (value === 0 && styleItem) {
    console.warn("UESRPG | computeCombatStyleTN: Combat Style has 0 value", { 
      name: styleItem.name,
      type: styleItem.type,
      system: styleItem.system 
    });
  }
  
  console.log("UESRPG | computeCombatStyleTN: Computed TN", { 
    name: styleItem?.name,
    value 
  });
  
  return value;
}

function computeBlockTN(defender, styleItem) {
  // RAW: Combat Style test using Strength.
  const woundPenalty = asNumber(defender?.system?.woundPenalty ?? 0);
  const fatiguePenalty = asNumber(defender?.system?.fatigue?.penalty ?? 0);

  const strTotal = getCharTotal(defender, "str");
  const styleBonus = asNumber(styleItem?.system?.bonus ?? 0);
  const miscValue = asNumber(styleItem?.system?.miscValue ?? 0);
  
  // REMOVED: itemChaBonus from skillHelper - this was double-counting Trait/Talent bonuses
  // Traits/Talents modify characteristics directly, which are already included in strTotal
  
  const itemSkillBonus = asNumber(skillModHelper(defender, styleItem?.name ?? "") ?? 0);

  // Chapter 5: wound penalties are derived from Wound Active Effects and exposed via system.woundPenalty.
  // Do not use legacy system.wounded flags.
  return strTotal + styleBonus + miscValue + itemSkillBonus + fatiguePenalty + woundPenalty;
}

function computeEvadeTN(defender) {
if (defender?.type === "NPC") {
  const sys = defender?.system ?? {};
  const base = Number(sys?.professions?.evade ?? 0);
  const woundPenalty = Number(sys?.woundPenalty ?? 0);
  const fatiguePenalty = Number(sys?.fatigue?.penalty ?? 0);
  return base + fatiguePenalty + woundPenalty;
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
  situationalMods = [],
  context = {}
} = {}) {
  const breakdown = [];

  console.log("UESRPG | computeTN called", { 
    actor: actor?.name, 
    role, 
    variant, 
    defenseType, 
    styleUuid,
    context 
  });

  // --- Base TN
  let baseTN = 0;
  let baseLabel = "Base";

  if (role === "attacker") {
    const styleItem = getCombatStyleItem(actor, styleUuid);
    if (!styleItem) {
      console.error("UESRPG | computeTN: No combat style item resolved for attacker", { 
        actor: actor?.name, 
        styleUuid 
      });
    }
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

  // --- Situational modifiers (e.g. sensory impairment toggles, range bands, etc.)
  // These are passed in explicitly by callers and must always be reflected in TN and breakdown.
  if (Array.isArray(situationalMods) && situationalMods.length) {
    let i = 0;
    for (const m of situationalMods) {
      const v = asNumber(m?.value);
      if (!v) continue;

      const k = String(m?.key ?? `m${i}`).trim() || `m${i}`;
      const label = String(m?.label ?? m?.name ?? "Situational").trim() || "Situational";

      breakdown.push({
        key: `situational:${k}`,
        label,
        value: v,
        source: String(m?.source ?? "situational")
      });

      i += 1;
    }
  }

  // --- Size-to-Hit (Chapter 5): attacker TN only
  // Caller must provide sizes in context to keep computeTN synchronous.
  if (role === "attacker") {
    const sizeMod = computeSizeToHitModifier({
      attackerSize: context?.selfSize ?? actor?.system?.size,
      targetSize: context?.opponentSize,
      attackMode: context?.attackMode
    });
    if (sizeMod) breakdown.push({ key: "size", label: "Size", value: sizeMod, source: "size" });
  }

  // --- Active Effects combat TN modifiers (from system.modifiers.combat.*)
  // Applied exactly once at this stage, and only to TN (not to base characteristics).
  const ae = getCombatTNModifiers(actor, role, defenseType, context);
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