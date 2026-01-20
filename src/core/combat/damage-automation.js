/**
 * module/combat/damage-automation.js
 * UESRPG 3e v4 — Damage Calculation and Application System
 *
 * Handles:
 *  - Damage type calculations (physical, fire, frost, shock, poison, magic, etc.)
 *  - Armor and resistance reduction
 *  - Natural Toughness (natToughness) for all damage types (NO END-bonus soak)
 *  - Automatic HP deduction (supports linked/unlinked tokens)
 *  - Simple wound status: wounded @ <= 50% HP, unconscious @ 0 HP
 *  - Hit location support
 *
 * Core Functions:
 *  - calculateDamage(rawDamage, damageType, targetActor, options)
 *  - applyDamage(actor, damage, damageType, options)
 *  - getDamageReduction(actor, damageType, hitLocation)
 */

import { evaluateAEModifierKeys } from "../ae/modifier-evaluator.js";
import { UESRPG } from "../constants.js";
import { requestCreateActiveEffect } from "../../utils/active-effect-proxy.js";
import { requestUpdateDocument } from "../../utils/authority-proxy.js";
import { isActorImmuneToDamageType, isActorIncorporeal, getActorTraitValue } from "../traits/trait-registry.js";

export const DAMAGE_TYPES = {
  HEALING: "healing",
  PHYSICAL: "physical",
  FIRE: "fire",
  FROST: "frost",
  SHOCK: "shock",
  POISON: "poison",
  MAGIC: "magic",
  SILVER: "silver",
  SUNLIGHT: "sunlight",
};

/**
 * Best-effort condition check without importing the condition engine.
 *
 * We avoid circular dependencies (condition-engine -> damage-automation).
 */
function _actorHasConditionKey(actor, key) {
  const k = String(key || "").trim().toLowerCase();
  if (!actor || !k) return false;

  for (const ef of (actor.effects ?? [])) {
    try {
      if (ef?.disabled) continue;
      if (ef?.statuses?.has?.(k)) return true;
      const coreId = String(ef?.flags?.core?.statusId ?? "").toLowerCase();
      if (coreId === k) return true;

      const sysKey = String(ef?.flags?.["uesrpg-3ev4"]?.condition?.key ?? "").toLowerCase();
      if (sysKey === k) return true;

      // Loose fallback: some legacy effects only have a name.
      const n = String(ef?.name ?? "").toLowerCase();
      if (n === k) return true;
    } catch (_e) {
      continue;
    }
  }

  return false;
}

function _normalizeToken(token) {
  return String(token ?? "").trim().toLowerCase();
}

function _normalizeTokenLoose(token) {
  return _normalizeToken(token).replace(/[\s._-]+/g, "");
}

function _collectItemTokens(item) {
  const sys = item?.system ?? {};
  const tokens = [];

  const structured = Array.isArray(sys.qualitiesStructuredInjected)
    ? sys.qualitiesStructuredInjected
    : Array.isArray(sys.qualitiesStructured)
      ? sys.qualitiesStructured
      : [];

  for (const q of structured) {
    if (!q) continue;
    const key = typeof q === "string" ? q : (q.key ?? q.name ?? q.label ?? "");
    if (key) tokens.push(key);
  }

  const traits = Array.isArray(sys.qualitiesTraitsInjected)
    ? sys.qualitiesTraitsInjected
    : Array.isArray(sys.qualitiesTraits)
      ? sys.qualitiesTraits
      : [];

  for (const t of traits) {
    if (!t) continue;
    tokens.push(t);
  }

  const activationDamage = sys.activation?.damage ?? null;
  const activationStructured = Array.isArray(activationDamage?.qualitiesStructured) ? activationDamage.qualitiesStructured : [];
  for (const q of activationStructured) {
    if (!q) continue;
    const key = typeof q === "string" ? q : (q.key ?? q.name ?? q.label ?? "");
    if (key) tokens.push(key);
  }

  const activationTraits = Array.isArray(activationDamage?.qualitiesTraits) ? activationDamage.qualitiesTraits : [];
  for (const t of activationTraits) {
    if (!t) continue;
    tokens.push(t);
  }

  const tags = Array.isArray(sys.activation?.roll?.tags) ? sys.activation.roll.tags : [];
  for (const tag of tags) {
    if (!tag) continue;
    tokens.push(tag);
  }

  return tokens.map(_normalizeToken).filter(Boolean);
}

export function collectItemTokens(item) {
  return _collectItemTokens(item);
}

export function itemHasToken(item, tokenKey) {
  const target = _normalizeTokenLoose(tokenKey);
  if (!target) return false;
  const tokens = _collectItemTokens(item);
  if (!tokens.length) return false;
  return tokens.some(t => _normalizeTokenLoose(t) === target);
}

export function isItemMagicSource(item) {
  if (!item) return false;
  const sys = item.system ?? {};
  const tokens = _collectItemTokens(item);

  const hasMagicToken = tokens.includes("magic");
  const hasSilverToken = tokens.includes("silver") || tokens.includes("silvered");

  const legacy = String(sys.qualities ?? "").toLowerCase();
  const legacyMagic = legacy.includes("magic");
  const legacySilver = legacy.includes("silver");

  const runed = sys.runed === true;
  const chargeValue = Number(sys.charge?.value ?? 0);
  const chargeMax = Number(sys.charge?.max ?? 0);
  const hasCharge = (Number.isFinite(chargeValue) && chargeValue > 0)
    || (Number.isFinite(chargeMax) && chargeMax > 0);

  if (String(item.type ?? "") === "armor") {
    const magicAR = Number(sys.magic_arEffective ?? sys.magic_ar ?? 0);
    const hasMagicAR = Number.isFinite(magicAR) && magicAR > 0;
    return hasMagicAR || hasMagicToken || legacyMagic || runed || hasCharge;
  }

  return hasMagicToken || hasSilverToken || legacyMagic || legacySilver || runed || hasCharge;
}

/**
 * Get total damage reduction for an actor based on damage type.
 * Physical: armor (by hit location) + natToughness
 * Non-physical: resistance only (no generic END soak)
 *
 * @param {Actor} actor
 * @param {string} damageType
 * @param {string} hitLocation
 * @returns {{armor:number,resistance:number,toughness:number,total:number,penetrated:number}}
 */
export function getDamageReduction(actor, damageType = DAMAGE_TYPES.PHYSICAL, hitLocation = "Body", options = {}) {
  if (!actor?.system) {
    return { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 };
  }

  const ignoreNonMagicArmor = options?.ignoreNonMagicArmor === true;

  // Template uses RightArm/LeftArm/RightLeg/LeftLeg keys; sheets might still pass "Right Arm" etc.
  const locationMap = {
    Head: "Head",
    Body: "Body",
    "Right Arm": "RightArm",
    "Left Arm": "LeftArm",
    "Right Leg": "RightLeg",
    "Left Leg": "LeftLeg",
    RightArm: "RightArm",
    LeftArm: "LeftArm",
    RightLeg: "RightLeg",
    LeftLeg: "LeftLeg",
  };

  const propertyName = locationMap[hitLocation] ?? hitLocation;

  // RAW: While Prone, treat any FULL armor as PARTIAL for coverage purposes.
  // This is implemented as a coverage-class downgrade only (does not mutate item data).
  const isProneForArmor = _actorHasConditionKey(actor, "prone");

  // --- Armor coverage normalization ---
  // Legacy data (and the base template) can create armor items where all hitLocations are set to true.
  // This causes unrelated pieces (e.g. body armor) to incorrectly contribute AR to other locations.
  // We normalize coverage deterministically using the armor item's "category" when possible.
  //
  // Rules:
  // - For FULL armor pieces, category is authoritative.
  // - For PARTIAL armor pieces, if hitLocations are "all true" (legacy default), fall back to category.
  // - Otherwise, only explicit true values count as covered (undefined does not).
  const ARMOR_CATEGORY_TO_LOCATIONS = {
    head: ["Head"],
    body: ["Body"],
    l_arm: ["LeftArm"],
    r_arm: ["RightArm"],
    l_leg: ["LeftLeg"],
    r_leg: ["RightLeg"],
  };

  const ARMOR_LOCATION_KEYS = ["Head", "Body", "RightArm", "LeftArm", "RightLeg", "LeftLeg"];

  const getCoveredLocations = (item) => {
    const sys = item?.system ?? {};
    let armorClass = String(sys.armorClass || "partial").toLowerCase();
    const category = String(sys.category || "").toLowerCase();
    const hitLocs = sys.hitLocations ?? {};

    if (isProneForArmor && armorClass === "full") armorClass = "partial";

    const allTrue = ARMOR_LOCATION_KEYS.every(k => hitLocs?.[k] === true);

    const catLocs = ARMOR_CATEGORY_TO_LOCATIONS[category] ?? null;
    if (catLocs && (armorClass === "full" || (armorClass === "partial" && allTrue))) {
      return new Set(catLocs);
    }

    // Only explicit true counts.
    return new Set(ARMOR_LOCATION_KEYS.filter(k => hitLocs?.[k] === true));
  };

  const actorData = actor.system;

  // Track base vs AE modifier contributions so the chat report can attribute reductions to effects.
  let armor = 0;
  let resistance = 0;
  // RAW: Natural Toughness reduces incoming damage of all types and functions like AR but is not armor.
  let toughness = Number(actorData.resistance?.natToughness ?? 0);

  const base = { armor: 0, resistance: 0, toughness };
  const ae = {
    armorRating: {
      global: { total: 0, entries: [] },
      location: { key: propertyName, total: 0, entries: [] },
    },
    resistance: { key: null, total: 0, entries: [] },
    natToughness: { total: 0, entries: [] },
  };

  // PHYSICAL: armor by hitLocation + natToughness
  if (damageType === DAMAGE_TYPES.PHYSICAL) {
    const equippedArmor = actor.items?.filter((i) => i.type === "armor" && i.system?.equipped === true) ?? [];

    for (const item of equippedArmor) {
      // Shields do not contribute AR; they are handled via Block in later steps.
      if (item.system?.isShield) continue;
      if (ignoreNonMagicArmor && !isItemMagicSource(item)) continue;

      const covered = getCoveredLocations(item);
      if (!covered.has(propertyName)) continue;

      // Automation should always prefer derived effective values.
      let ar = (item.system?.armorEffective != null)
        ? Number(item.system.armorEffective)
        : Number(item.system?.armor ?? 0);

      // RAW: While Prone, treat FULL armor as PARTIAL.
      // Implement as a derived-value override at damage time (no item mutation).
      // This ensures AR follows the partial profile even if armorEffective was derived as full.
      if (isProneForArmor) {
        const sys = item.system ?? {};
        const armorClass = String(sys.armorClass || "partial").toLowerCase();
        if (armorClass === "full") {
          const materialKey = String(sys.material || "").trim();
          const partialProfile = UESRPG?.ARMOR_PROFILES?.partial?.[materialKey] ?? null;

          if (partialProfile && partialProfile.ar != null) {
            const qs = Array.isArray(sys.qualitiesStructured) ? sys.qualitiesStructured : [];
            const damagedQ = qs.find(q => String(q?.key ?? "").toLowerCase() === "damaged");
            const damagedValue = Number(damagedQ?.value ?? 0) || 0;
            ar = Math.max(0, Number(partialProfile.ar) - damagedValue);
          }
        }
      }

      armor += Number.isFinite(ar) ? ar : 0;
    }

    base.armor = armor;

    // RAW: Physical resistance is separate from Natural Toughness and reduces physical damage like other resistances.
    resistance = Number(actorData.resistance?.physicalR ?? 0);
    base.resistance = resistance;

  } else {
    // NON-PHYSICAL:
    //  - Resistance always applies.
    //  - Armor usually does NOT mitigate magic/elemental damage.
    //    However, when armor has explicit magic/elemental reduction lanes, it mitigates accordingly.
    //    Schema (armor items):
    //      - system.magic_ar (generic magic AR; intended for "magic" damage)
    //      - system.special_ar_type + system.special_ar (typed mitigation; e.g. fire/frost/shock)
    //    These reductions are location-based and use the same deterministic coverage resolver.

    const equippedArmor = actor.items?.filter((i) => i.type === "armor" && i.system?.equipped === true) ?? [];
    const dtLower = String(damageType ?? "").toLowerCase();

    for (const item of equippedArmor) {
      // Shields do not contribute AR; they are handled via Block in later steps.
      if (item.system?.isShield) continue;

      const covered = getCoveredLocations(item);
      if (!covered.has(propertyName)) continue;

      const sys = item.system ?? {};

      // Typed mitigation (elemental, poison, etc.)
      const specialType = String(sys.special_ar_type ?? "").toLowerCase();
      const specialAR = Number(sys.special_arEffective ?? sys.special_ar ?? 0);
      if (specialType && specialType === dtLower && Number.isFinite(specialAR) && specialAR) {
        armor += Math.max(0, specialAR);
      }

      // Generic magic mitigation lane
      if (dtLower === DAMAGE_TYPES.MAGIC) {
        const magicAR = Number(sys.magic_arEffective ?? sys.magic_ar ?? 0);
        if (Number.isFinite(magicAR) && magicAR) armor += Math.max(0, magicAR);
      }
    }

    base.armor = armor;

    // Resistance lane
    switch (damageType) {
      case DAMAGE_TYPES.FIRE:
        resistance = Number(actorData.resistance?.fireR ?? 0);
        break;
      case DAMAGE_TYPES.FROST:
        resistance = Number(actorData.resistance?.frostR ?? 0);
        break;
      case DAMAGE_TYPES.SHOCK:
        resistance = Number(actorData.resistance?.shockR ?? 0);
        break;
      case DAMAGE_TYPES.POISON:
        resistance = Number(actorData.resistance?.poisonR ?? 0);
        break;
      case DAMAGE_TYPES.MAGIC:
        resistance = Number(actorData.resistance?.magicR ?? 0);
        break;
      case DAMAGE_TYPES.SILVER:
        resistance = Number(actorData.resistance?.silverR ?? 0);
        break;
      case DAMAGE_TYPES.SUNLIGHT:
        resistance = Number(actorData.resistance?.sunlightR ?? 0);
        break;
      default:
        resistance = 0;
    }

    base.resistance = resistance;

  }

  base.toughness = toughness;


  // --- Active Effects: Armor Rating & Resistance modifiers (ADD/OVERRIDE)
  // These are applied deterministically as modifier totals (not absolute armor/resistance replacement).
  // Keys:
  //  - Armor: system.modifiers.combat.armorRating and optional per-location system.modifiers.combat.armorRating.<LocationKey>
  //  - Resistance: system.modifiers.resistance.<resKey> (fireR, frostR, shockR, poisonR, magicR, diseaseR, silverR, sunlightR)
  //  - Nat Toughness: system.modifiers.resistance.natToughness
  try {
    const armorKeys = [
      "system.modifiers.combat.armorRating",
      `system.modifiers.combat.armorRating.${propertyName}`,
    ];
    const armorMods = evaluateAEModifierKeys(actor, armorKeys);
    const gKey = "system.modifiers.combat.armorRating";
    const lKey = `system.modifiers.combat.armorRating.${propertyName}`;
    const g = armorMods[gKey] ?? { total: 0, entries: [] };
    const l = armorMods[lKey] ?? { total: 0, entries: [] };
    ae.armorRating.global = { total: Number(g.total ?? 0) || 0, entries: Array.isArray(g.entries) ? g.entries : [] };
    ae.armorRating.location = { key: propertyName, total: Number(l.total ?? 0) || 0, entries: Array.isArray(l.entries) ? l.entries : [] };
    const armorModTotal = ae.armorRating.global.total + ae.armorRating.location.total;
    if (armorModTotal) armor += armorModTotal;

    // Determine applicable resistance keys for this damage type
    // Support multiple AE key paths for backward compatibility and Chapter 4 expansion:
    // 1. Legacy: system.modifiers.resistance.<resKey> (existing)
    // 2. New: system.resistances.<type> (Chapter 4)
    // 3. New: system.traits.resistance.<type> (Chapter 4 trait-specific)
    const resKeyByType = {
      [DAMAGE_TYPES.PHYSICAL]: { legacy: "physicalR", resistances: null, traits: "physical" },
      [DAMAGE_TYPES.FIRE]: { legacy: "fireR", resistances: null, traits: "fire" },
      [DAMAGE_TYPES.FROST]: { legacy: "frostR", resistances: null, traits: "frost" },
      [DAMAGE_TYPES.SHOCK]: { legacy: "shockR", resistances: null, traits: "shock" },
      [DAMAGE_TYPES.POISON]: { legacy: "poisonR", resistances: "poison", traits: "poison" },
      [DAMAGE_TYPES.MAGIC]: { legacy: "magicR", resistances: "magic", traits: null },
      [DAMAGE_TYPES.SILVER]: { legacy: "silverR", resistances: null, traits: null },
      [DAMAGE_TYPES.SUNLIGHT]: { legacy: "sunlightR", resistances: null, traits: null },
    };

    const resKeyMap = (resKeyByType[damageType] ?? null);
    if (resKeyMap) {
      // Collect all applicable resistance AE keys
      const resistanceKeys = [];
      
      // Legacy key (always check for backward compatibility)
      if (resKeyMap.legacy) {
        resistanceKeys.push(`system.modifiers.resistance.${resKeyMap.legacy}`);
      }
      
      // New system.resistances.* keys
      if (resKeyMap.resistances) {
        resistanceKeys.push(`system.resistances.${resKeyMap.resistances}`);
      }
      
      // New system.traits.resistance.* keys
      if (resKeyMap.traits) {
        resistanceKeys.push(`system.traits.resistance.${resKeyMap.traits}`);
      }
      
      // Evaluate all resistance keys and sum them
      // evaluateAEModifierKeys returns Record<string, number>
      if (resistanceKeys.length > 0) {
        const resMods = evaluateAEModifierKeys(actor, resistanceKeys);
        let totalResistance = 0;
        
        for (const rKey of resistanceKeys) {
          const r = resMods[rKey] ?? 0;
          const numericValue = Number(r) || 0;
          totalResistance += numericValue;
        }
        
        ae.resistance.key = resKeyMap.legacy || resKeyMap.resistances || resKeyMap.traits || "unknown";
        ae.resistance.total = totalResistance;
        ae.resistance.entries = []; // Legacy structure preserved for compatibility
        resistance += totalResistance;
      }
    }

    // Natural Toughness modifier applies to all damage types (RAW).
    const tKey = "system.modifiers.resistance.natToughness";
    const toughMods = evaluateAEModifierKeys(actor, [tKey]);
    const t = toughMods[tKey] ?? { total: 0, entries: [] };
    ae.natToughness.total = Number(t.total ?? 0) || 0;
    ae.natToughness.entries = Array.isArray(t.entries) ? t.entries : [];
    toughness += ae.natToughness.total;
  } catch (err) {
    console.warn("UESRPG | AE armor/resistance modifier evaluation failed", err);
  }

  const total = armor + resistance + toughness;
  return { armor, resistance, toughness, total, penetrated: 0, base, ae };
}

/**
 * Calculate final damage after reductions.
 *
 * @param {number} rawDamage
 * @param {string} damageType
 * @param {Actor} targetActor
 * @param {object} options
 * @param {number} options.penetration
 * @param {number} options.dosBonus
 * @param {string} options.hitLocation
 * @param {boolean} options.ignoreArmor
 * @returns {{
 *   rawDamage:number,
 *   dosBonus:number,
 *   totalDamage:number,
 *   reductions:{armor:number,resistance:number,toughness:number,total:number,penetrated:number},
 *   finalDamage:number,
 *   hitLocation:string,
 *   damageType:string
 * }}
 */
export function calculateDamage(rawDamage, damageType, targetActor, options = {}) {
  const {
    penetration = 0,
    dosBonus = 0,
    hitLocation = "Body",
    ignoreArmor = false,
    // Advantage: Penetrate Armor — does not change AR, but treats armored locations as less protected
    // for the purpose of trigger-style effects (e.g., Slashing).
    penetrateArmorForTriggers = false,
    // Optional: provide weapon/attacker to enable RAW weapon-quality bonus damage
    // ("The Big Three": Crushing, Splitting, Slashing).
    weapon = null,
    attackerActor = null,
  } = options;

  /** @type {{armor:number,resistance:number,toughness:number,total:number,penetrated:number}} */
  let reductions = { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 };

  // Track the target's *pre-penetration* armor for RAW interactions (e.g., Crushing cap, Slashing trigger).
  let originalArmor = 0;

  const attackerIncorporeal = isActorIncorporeal(attackerActor);
  const ignoreNonMagicArmor = attackerIncorporeal && String(damageType ?? "").toLowerCase() === DAMAGE_TYPES.PHYSICAL;

  if (!ignoreArmor) {
    reductions = getDamageReduction(targetActor, damageType, hitLocation, { ignoreNonMagicArmor });

    // Penetration reduces ARMOR only (not resistance/toughness)
    originalArmor = Number(reductions.armor ?? 0);
    const penetratedArmor = Math.max(0, originalArmor - Number(penetration || 0));
    reductions.penetrated = Math.max(0, originalArmor - penetratedArmor);
    reductions.armor = penetratedArmor;
    reductions.total = reductions.armor + reductions.resistance + reductions.toughness;
  }

  // Base damage = raw + DoS bonus (existing behavior)
  const baseTotalDamage = Math.max(0, Number(rawDamage || 0) + Number(dosBonus || 0));

  // --- Weapon quality bonuses (Step 1): Crushing, Splitting, Slashing
  // These bonuses are only applied for PHYSICAL damage.
  const qualBonus = computeBigThreeBonus({
    damageType,
    weapon,
    attackerActor,
    originalArmor,
    triggerArmor: penetrateArmorForTriggers ? 0 : originalArmor,
    baseTotalDamage,
    reductionsTotal: reductions.total,
  });

  const totalDamage = Math.max(0, baseTotalDamage + qualBonus);
  const finalDamage = Math.max(0, totalDamage - reductions.total);

  return {
    rawDamage: Number(rawDamage || 0),
    dosBonus: Number(dosBonus || 0),
    totalDamage,
    reductions,
    finalDamage,
    hitLocation,
    damageType,
    weaponBonus: qualBonus,
    incorporealAttack: ignoreNonMagicArmor ? { ignoreNonMagicArmor: true } : null,
  };
}

/**
 * Compute the RAW weapon-quality bonus damage for "The Big Three":
 *  - Crushing (X): +min(STR bonus (or X), target AR at hit location)
 *  - Splitting (X): +STR bonus (or X) if the *initial* damage causes the target to lose >=1 HP
 *  - Slashing (X): +STR bonus (or X) against *unarmored* hit locations
 *
 * Notes (implementation choices):
 *  - Only applies to PHYSICAL damage.
 *  - The cap for Crushing uses the target location's armor *before* penetration.
 *  - Splitting triggers based on damage after reductions, before applying the Splitting bonus.
 */
function computeBigThreeBonus({ damageType, weapon, attackerActor, originalArmor, triggerArmor, baseTotalDamage, reductionsTotal }) {
  if (String(damageType ?? "").toLowerCase() !== "physical") return 0;
  if (!weapon || !attackerActor) return 0;

  // Resolve attacker STR bonus (schema: actor.system.characteristics.str.bonus)
  const strBonus = Number(attackerActor?.system?.characteristics?.str?.bonus ?? 0) || 0;
  const viciousValue = Math.max(0, Number(getActorTraitValue(attackerActor, "vicious", { mode: "max" })) || 0);
  const effectiveBonus = viciousValue > 0 ? viciousValue : strBonus;

  // Pull structured qualities (manual + injected) if available.
  let structured = Array.isArray(weapon?.system?.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon?.system?.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];
  if (!structured.length) {
    const activationStructured = Array.isArray(weapon?.system?.activation?.damage?.qualitiesStructured)
      ? weapon.system.activation.damage.qualitiesStructured
      : [];
    if (activationStructured.length) structured = activationStructured;
  }

  const getQualityValue = (key) => {
    const q = structured.find(e => String(e?.key ?? e ?? "").toLowerCase() === key);
    if (!q) return null;
    const v = q?.value;
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : null;
  };

  const hasQuality = (key) => structured.some(e => String(e?.key ?? e ?? "").toLowerCase() === key);

  let bonus = 0;

  // Crushing (X)
  if (hasQuality("crushing")) {
    const x = getQualityValue("crushing") ?? effectiveBonus;
    const cap = Math.max(0, Number(originalArmor ?? 0));
    bonus += Math.max(0, Math.min(Math.max(0, x), cap));
  }

  // Slashing (X)
  if (hasQuality("slashing")) {
    const isUnarmored = Number(triggerArmor ?? originalArmor ?? 0) <= 0;
    if (isUnarmored) {
      const x = getQualityValue("slashing") ?? effectiveBonus;
      bonus += Math.max(0, x);
    }
  }

  // Splitting (X)
  if (hasQuality("splitting")) {
    const initialFinal = Math.max(0, Number(baseTotalDamage ?? 0) - Number(reductionsTotal ?? 0));
    if (initialFinal >= 1) {
      const x = getQualityValue("splitting") ?? effectiveBonus;
      bonus += Math.max(0, x);
    }
  }

  return Number.isFinite(bonus) ? bonus : 0;
}

/**
 * Apply damage to an actor with automatic HP reduction and wound tracking.
 *
 * @param {Actor} actor
 * @param {number} damage
 * @param {string} damageType
 * @param {object} options
 * @param {boolean} options.ignoreReduction
 * @param {number} options.penetration
 * @param {number} options.dosBonus
 * @param {string} options.source
 * @param {string} options.hitLocation
 * @returns {Promise<{
 *   actor:Actor,
 *   damage:number,
 *   reductions:{armor:number,resistance:number,toughness:number,total:number,penetrated:number},
 *   oldHP:number,
 *   newHP:number,
 *   woundStatus:string,
 *   prevented:number
 * }|null>}
 */
export async function applyDamage(actor, damage, damageType = DAMAGE_TYPES.PHYSICAL, options = {}) {
  const {
    ignoreReduction = false,
    penetration = 0,
    dosBonus = 0,
    source = "Unknown",
    hitLocation = "Body",
    penetrateArmorForTriggers = false,
    // Advantage: Forceful Impact — applies/advances Damaged (1) on the armor piece protecting the hit location.
    // Current implementation: increments the Damaged quality on ONE equipped armor piece covering the location.
    forcefulImpact = false,
    // Advantage: Press Advantage — currently informational only (advantage economy is handled in opposed workflow).
    pressAdvantage = false,
    // Optional: enable RAW weapon-quality bonuses.
    weapon = null,
    attackerActor = null,
    magicSource = false,
    // For magic wounds: track damage by type for proper wound side effects
    damageAppliedByType = null,
  } = options;

  if (!actor?.system) {
    ui.notifications.error("Invalid actor for damage application");
    return null;
  }

  // Compatibility: allow calling applyDamage with DAMAGE_TYPES.HEALING.
  // Route to applyHealing to avoid negative HP application.
  if (String(damageType ?? "").toLowerCase() === DAMAGE_TYPES.HEALING) {
    return applyHealing(actor, damage, options);
  }

  const rawDamage = Number(damage || 0);

  // Compute damage breakdown
  const damageCalc = ignoreReduction
    ? {
        rawDamage,
        dosBonus: Number(dosBonus || 0),
        totalDamage: Math.max(0, rawDamage + Number(dosBonus || 0)),
        reductions: { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 },
        finalDamage: Math.max(0, rawDamage + Number(dosBonus || 0)),
        hitLocation,
        damageType,
      }
    : calculateDamage(rawDamage, damageType, actor, { penetration, dosBonus, hitLocation });

  // If weapon/attacker are provided, prefer the enriched calculation.
  // (calculateDamage is backwards-compatible; extra keys are ignored by older callers.)
  if (!ignoreReduction && (weapon || attackerActor)) {
    Object.assign(damageCalc, calculateDamage(rawDamage, damageType, actor, {
      penetration,
      dosBonus,
      hitLocation,
      penetrateArmorForTriggers,
      weapon,
      attackerActor,
    }));
  }

  if (isActorImmuneToDamageType(actor, damageType)) {
    damageCalc.immunity = { isImmune: true, damageType: String(damageType ?? "") };
    damageCalc.finalDamage = 0;
  }

  const defenderIncorporeal = isActorIncorporeal(actor);
  const isMagicAttack = magicSource || isItemMagicSource(weapon);
  if (defenderIncorporeal && !isMagicAttack) {
    damageCalc.incorporealBlock = { isBlocked: true, reason: "non-magic source" };
    damageCalc.finalDamage = 0;
  }

  const finalDamage = Number(damageCalc.finalDamage || 0);

  // --- Active Effects: Damage & Mitigation modifiers (final resolution stage)
  // All values are additive and sourced from AEs using explicit keys.
  // - aeDamageTaken: applied AFTER armor/resistance/toughness (positive increases damage taken; negative reduces)
  // - aeMitigationFlat: flat mitigation applied AFTER reductions (positive reduces damage)
  const aeDamageTaken = Number(options?.aeDamageTaken ?? 0) || 0;
  const aeMitigationFlat = Number(options?.aeMitigationFlat ?? 0) || 0;
  let finalDamageAdjusted = Math.max(0, finalDamage + aeDamageTaken - aeMitigationFlat);
  if (damageCalc.immunity?.isImmune) finalDamageAdjusted = 0;
  if (damageCalc.incorporealBlock?.isBlocked) finalDamageAdjusted = 0;

  // Wound Threshold (RAW): WOUNDED is applied when a *single* instance of damage meets/exceeds
  // the target's Wound Threshold value. This is not derived from remaining HP.
  // Schema: actor.system.wound_threshold.value (PC + NPC).
  const woundThreshold = (() => {
    const wt = actor.system?.wound_threshold;
    // Preferred
    if (wt && typeof wt === "object") {
      const v = Number(wt.value ?? wt.total ?? wt.base);
      return Number.isFinite(v) ? v : 0;
    }
    // Defensive fallbacks
    const v = Number(actor.system?.woundThreshold ?? actor.system?.wounds ?? 0);
    return Number.isFinite(v) ? v : 0;
  })();

  // HP state with temp HP support
  const currentHP = Number(actor.system?.hp?.value ?? 0);
  const maxHP = Number(actor.system?.hp?.max ?? 1);
  const currentTempHP = Number(actor.system?.tempHP ?? 0);
  
  // Temp HP absorbs damage first, then regular HP
  let remainingDamage = finalDamageAdjusted;
  let newTempHP = currentTempHP;
  let newHP = currentHP;
  let tempHPAbsorbed = 0;
  
  if (currentTempHP > 0 && remainingDamage > 0) {
    if (remainingDamage <= currentTempHP) {
      // Temp HP absorbs all damage
      newTempHP = currentTempHP - remainingDamage;
      tempHPAbsorbed = remainingDamage;
      remainingDamage = 0;
    } else {
      // Temp HP absorbs some damage, rest goes to regular HP
      tempHPAbsorbed = currentTempHP;
      remainingDamage -= currentTempHP;
      newTempHP = 0;
    }
  }
  
  // Apply remaining damage to regular HP
  if (remainingDamage > 0) {
    newHP = Math.max(0, currentHP - remainingDamage);
  }

  // Choose update target: unlinked token actor if applicable, else base actor
  const activeToken = actor.token ?? actor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && actor.prototypeToken && actor.prototypeToken.actorLink === false);

  const updateTarget = isUnlinkedToken ? activeToken.actor : actor;

  // Determine wound status from RAW threshold.
  // NOTE: We intentionally do not auto-clear the flag on healing.
  const isWounded = (finalDamageAdjusted >= Math.max(0, woundThreshold)) && finalDamageAdjusted > 0 && woundThreshold > 0;

  let woundStatus = "uninjured";
  if (newHP === 0) woundStatus = "unconscious";
  else if (isWounded) woundStatus = "wounded";

  // Persist Wounded flag if the damage exceeded the threshold.
  // Keep update minimal: only write the flag when it needs to be set.
  const updateData = { 
    "system.hp.value": newHP,
    "system.tempHP": newTempHP
  };
  if (isWounded && !updateTarget.system?.wounded) updateData["system.wounded"] = true;

  await requestUpdateDocument(updateTarget, updateData);

  // Emit damage-applied hook for downstream automation (wounds, conditions, etc.)
  try {
    Hooks.callAll("uesrpgDamageApplied", updateTarget, {
      applicationId: options?.applicationId ?? crypto?.randomUUID?.() ?? foundry?.utils?.randomID?.() ?? null,
      origin: options?.origin ?? null,
      source,
      amountApplied: finalDamageAdjusted,
      hitLocation,
      damageType,
      damageAppliedByType: damageAppliedByType,
      woundThreshold,
      woundTriggered: isWounded === true
    });
  } catch (err) {
    console.error("UESRPG | uesrpgDamageApplied hook dispatch failed", err);
  }


  // Optional: Forceful Impact may damage the armor protecting the hit location.
  // This is intentionally best-effort and should never block damage resolution.
  if (forcefulImpact && String(damageType ?? "").toLowerCase() === DAMAGE_TYPES.PHYSICAL) {
    try {
      await _applyForcefulImpact(updateTarget, hitLocation);
    } catch (err) {
      console.warn("UESRPG | Forceful Impact armor update failed", err);
    }
  }

  // Optional: apply unconscious effect (safe + idempotent)
  if (woundStatus === "unconscious") {
    try {
      const targetActor = updateTarget;

      const hasUnconsciousEffect = targetActor.effects?.some(
        (e) => e?.statuses?.has?.("unconscious") || e?.name === "Unconscious"
      );

      if (!hasUnconsciousEffect) {
        const unconsciousEffect = {
          name: "Unconscious",
          icon: "icons/svg/unconscious.svg",
          duration: {},
          statuses: ["unconscious"],
          flags: { core: { statusId: "unconscious" } },
        };

        await requestCreateActiveEffect(targetActor, unconsciousEffect);
      }
    } catch (err) {
      console.error("UESRPG | Failed to apply unconscious effect:", err);
    }
  }

  // Damage chat message (GM-only, blind by default)
  const gmIds = game.users?.filter(u => u.isGM).map(u => u.id) ?? [];
  const hpDelta = Math.max(0, currentHP - newHP);

  const parts = [];
  const rollHTML = String(options?.rollHTML ?? "");

  const criticalNote = String(options?.criticalNote ?? "");
  const extraBreakdownLines = Array.isArray(options?.extraBreakdownLines) ? options.extraBreakdownLines : [];

  if (rollHTML) {
    parts.push(`<div class="uesrpg-da-row"><span class="k">Roll</span><span class="v">${rollHTML}</span></div>`);
  }

  if (criticalNote) {
    parts.push(`<div class="uesrpg-da-row"><span class="k">Critical</span><span class="v">${criticalNote}</span></div>`);
  }
  
  // Show temp HP absorption if any
  if (tempHPAbsorbed > 0) {
    parts.push(`<div class="uesrpg-da-row"><span class="k">Temp HP Absorbed</span><span class="v">${tempHPAbsorbed}</span></div>`);
  }

  for (const line of extraBreakdownLines) {
    const s = String(line ?? "");
    if (!s) continue;
    parts.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">${s}</span></div>`);
  }

  if (damageCalc.immunity?.isImmune) {
    const immType = String(damageCalc.immunity?.damageType ?? damageType ?? "");
    const label = immType ? `Immune (${immType})` : "Immune";
    parts.push(`<div class="uesrpg-da-row"><span class="k">Trait</span><span class="v">${label}</span></div>`);
  }

  if (damageCalc.incorporealBlock?.isBlocked) {
    parts.push(`<div class="uesrpg-da-row"><span class="k">Trait</span><span class="v">Incorporeal (non-magic source)</span></div>`);
  }

  if (damageCalc.incorporealAttack?.ignoreNonMagicArmor) {
    parts.push(`<div class="uesrpg-da-row"><span class="k">Trait</span><span class="v">Incorporeal Attack (non-magic AR ignored)</span></div>`);
  }

  if (!ignoreReduction) {
    const rd = Number(damageCalc.rawDamage ?? 0);
    const db = Number(damageCalc.dosBonus ?? 0);
    const wb = Number(damageCalc.weaponBonus ?? 0);
    const showZeroDoS = Boolean(options?.showZeroDoS);
    const dosPart = (db || showZeroDoS) ? `+${db} DoS` : null;
    const rawLine = [rd, dosPart, wb ? `+${wb} Wpn` : null].filter(Boolean).join(" ");
    parts.push(`<div class="uesrpg-da-row"><span class="k">Raw</span><span class="v">${rawLine}</span></div>`);
    parts.push(`<div class="uesrpg-da-row"><span class="k">Reduction</span><span class="v">-${damageCalc.reductions.total} <span class="muted">(AR ${damageCalc.reductions.armor} / R ${damageCalc.reductions.resistance} / T ${damageCalc.reductions.toughness}${damageCalc.reductions.penetrated ? ` / Pen ${damageCalc.reductions.penetrated}` : ""})</span></span></div>`);
  }
  const aeBreakdown = options?.aeBreakdown ?? null;

  const aeSummary = (() => {
    const hasBreakdown =
      aeBreakdown &&
      (Array.isArray(aeBreakdown.attacker) || Array.isArray(aeBreakdown.defender));

    const rows = [];

    const fmt = (n) => {
      const v = Number(n ?? 0) || 0;
      return v >= 0 ? `+${v}` : `${v}`;
    };

    const sumByTarget = (entries, target) => {
      if (!Array.isArray(entries)) return 0;
      return entries
        .filter(e => e?.target === target)
        .reduce((a, e) => a + (Number(e?.value ?? 0) || 0), 0);
    };

    const renderDetails = (entries, target, label) => {
      if (!Array.isArray(entries)) return;
      for (const e of entries) {
        if (!e || e.target !== target) continue;
        const value = Number(e.value ?? 0) || 0;
        if (!value) continue;
        const name = String(e.label ?? "Effect");
        rows.push(
          `<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">${label}: ${name} ${fmt(value)}</span></div>`
        );
      }
    };

    // --- Attacker-side (dealt damage + penetration) ---
    if (hasBreakdown) {
      const dealt = sumByTarget(aeBreakdown.attacker, "damage.dealt");
      const pen = sumByTarget(aeBreakdown.attacker, "penetration");

      const bits = [];
      if (dealt) bits.push(`Dealt ${fmt(dealt)}`);
      if (pen) bits.push(`Pen ${fmt(pen)} <span class="muted">(via penetration)</span>`);

      if (bits.length) {
        rows.push(
          `<div class="uesrpg-da-row"><span class="k">AE (Attacker)</span><span class="v">${bits.join(" • ")}</span></div>`
        );
        renderDetails(aeBreakdown.attacker, "damage.dealt", "Dealt");
        renderDetails(aeBreakdown.attacker, "penetration", "Pen");
      }
    }

    // --- Defender-side (damage taken + flat mitigation) ---
    {
      const bits = [];
      if (aeDamageTaken) bits.push(`Taken ${fmt(aeDamageTaken)}`);
      if (aeMitigationFlat) bits.push(`Mit -${Number(aeMitigationFlat || 0)}`);

      if (bits.length) {
        rows.push(
          `<div class="uesrpg-da-row"><span class="k">AE (Defender)</span><span class="v">${bits.join(" • ")}</span></div>`
        );

        if (hasBreakdown) {
          renderDetails(aeBreakdown.defender, "damage.taken", "Taken");
          renderDetails(aeBreakdown.defender, "mitigation.flat", "Mit");
        }
      }
    }

    return rows.join("");
  })();

  // --- Reduction provenance (Armor / Resistance / Toughness) ---
  // If the reduction calculation surfaced AE breakdown info, attribute it here.
  const reductionAEBreakdown = (() => {
    const r = damageCalc?.reductions;
    const ae = r?.ae;
    const base = r?.base;
    if (!ae || !base) return "";

    const lines = [];
    const fmt = (n) => {
      const v = Number(n ?? 0) || 0;
      return v >= 0 ? `+${v}` : `${v}`;
    };

    const pushEntries = (title, entries) => {
      if (!Array.isArray(entries) || !entries.length) return;
      for (const e of entries) {
        const value = Number(e?.value ?? 0) || 0;
        if (!value) continue;
        const label = String(e?.label ?? "Effect");
        lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">${title}: ${label} ${fmt(value)}</span></div>`);
      }
    };

    // Armor Rating
    if ((ae.armorRating?.global?.total ?? 0) || (ae.armorRating?.location?.total ?? 0)) {
      const bits = [];
      if (ae.armorRating?.global?.total) bits.push(`Global ${fmt(ae.armorRating.global.total)}`);
      if (ae.armorRating?.location?.total) bits.push(`${ae.armorRating.location.key} ${fmt(ae.armorRating.location.total)}`);
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">AR AE: ${bits.join(" • ")}</span></div>`);
      pushEntries("AR", ae.armorRating?.global?.entries);
      pushEntries("AR", ae.armorRating?.location?.entries);
    }

    // Resistance
    if (ae.resistance?.key && ae.resistance?.total) {
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">R AE (${ae.resistance.key}): ${fmt(ae.resistance.total)}</span></div>`);
      pushEntries("R", ae.resistance.entries);
    }

    // Natural Toughness
    if (ae.natToughness?.total) {
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">T AE (natToughness): ${fmt(ae.natToughness.total)}</span></div>`);
      pushEntries("T", ae.natToughness.entries);
    }

    return lines.join("");
  })();

  const messageContent = `
    <div class="uesrpg-damage-applied-card">
      <div class="hdr">
        <div class="title">${updateTarget.name}</div>
        <div class="sub">${source}${hitLocation ? ` • ${hitLocation}` : ""}${damageType ? ` • ${damageType}` : ""}</div>
      </div>
      <div class="body">
        
        <div class=\"uesrpg-da-row\"><span class=\"k\">Total Damage</span><span class=\"v final\">${finalDamageAdjusted}</span></div>
        <div class=\"uesrpg-da-row\"><span class=\"k\">HP</span><span class="v">${newHP} / ${maxHP}${hpDelta ? ` <span class="muted">(-${hpDelta})</span>` : ""}</span></div>
        ${currentTempHP > 0 || newTempHP > 0 ? `<div class=\"uesrpg-da-row\"><span class=\"k\">Temp HP</span><span class="v">${newTempHP}${tempHPAbsorbed ? ` <span class="muted">(-${tempHPAbsorbed})</span>` : ""}</span></div>` : ""}
        ${woundStatus === "wounded" ? `<div class="status wounded">WOUNDED <span class="muted">(WT ${woundThreshold})</span></div>` : ""}
        ${woundStatus === "unconscious" ? `<div class="status unconscious">UNCONSCIOUS</div>` : ""}
<details style="margin-top:6px;">
          <summary style="cursor:pointer; user-select:none;">Damage breakdown</summary>
          <div style="margin-top:4px;">${parts.join("\n")}${reductionAEBreakdown}${aeSummary}</div>
        </details>
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    whisper: gmIds,
    blind: true,
  });

  const prevented = Math.max(0, Number(damageCalc.totalDamage ?? rawDamage) - finalDamageAdjusted);

  return {
    actor: updateTarget,
    damage: finalDamageAdjusted,
    baseFinalDamage: finalDamage,
    aeDamageTaken,
    aeMitigationFlat,
    reductions: damageCalc.reductions,
    immunity: damageCalc.immunity ?? null,
    incorporealBlock: damageCalc.incorporealBlock ?? null,
    incorporealAttack: damageCalc.incorporealAttack ?? null,
    oldHP: currentHP,
    newHP,
    woundStatus,
    prevented,
  };
}

/**
 * Apply Forceful Impact: increment Damaged (X) on one armor item that covers the hit location.
 * Selection policy: choose the single equipped, non-shield armor item with the highest effective AR at the location.
 *
 * This does NOT attempt to handle edge cases beyond deterministic item selection.
 */
export async function applyForcefulImpact(targetActor, hitLocation) {
  return _applyForcefulImpact(targetActor, hitLocation);
}

/**
 * Exported helper for resolver pipelines.
 * Ensures the target actor has the Unconscious status effect applied.
 *
 * This helper exists because damage-resolver imports it.
 * Keep it small and deterministic: if a compatible unconscious status is already present,
 * do nothing. Otherwise create a minimal ActiveEffect with the standard unconscious status id.
 *
 * @param {Actor} targetActor
 */
export async function ensureUnconsciousEffect(targetActor) {
  try {
    if (!targetActor) return;

    const hasUnconscious = targetActor.effects?.some(
      (e) => e?.statuses?.has?.("unconscious") || e?.name === "Unconscious"
    );

    if (hasUnconscious) return;

    const unconsciousEffect = {
      name: "Unconscious",
      icon: "icons/svg/unconscious.svg",
      duration: {},
      statuses: ["unconscious"],
      flags: { core: { statusId: "unconscious" } },
    };

    await requestCreateActiveEffect(targetActor, unconsciousEffect);
  } catch (err) {
    console.error("UESRPG | Failed to apply unconscious effect:", err);
  }
}

async function _applyForcefulImpact(targetActor, hitLocation) {
  if (!targetActor?.items) return;

  // Normalize hitLocation key variants coming from sheets/chat cards.
  const locationMap = {
    Head: "Head",
    Body: "Body",
    "Right Arm": "RightArm",
    "Left Arm": "LeftArm",
    "Right Leg": "RightLeg",
    "Left Leg": "LeftLeg",
    RightArm: "RightArm",
    LeftArm: "LeftArm",
    RightLeg: "RightLeg",
    LeftLeg: "LeftLeg",
  };
  const propertyName = locationMap[hitLocation] ?? hitLocation;

  // Coverage normalization rules (mirrors getDamageReduction):
  // - For FULL armor pieces, category is authoritative.
  // - For PARTIAL armor pieces, if hitLocations are "all true" (legacy default), fall back to category.
  // - Otherwise, only explicit true values count as covered.
  //
  // Shields:
  // - If a shield defines explicit hitLocations, respect them.
  // - Otherwise, treat shields as protecting the arm locations (LeftArm/RightArm) for Forceful Impact only.
  const ARMOR_CATEGORY_TO_LOCATIONS = {
    head: ["Head"],
    body: ["Body"],
    l_arm: ["LeftArm"],
    r_arm: ["RightArm"],
    l_leg: ["LeftLeg"],
    r_leg: ["RightLeg"],
  };
  const ARMOR_LOCATION_KEYS = ["Head", "Body", "RightArm", "LeftArm", "RightLeg", "LeftLeg"];

  const getCoveredLocations = (item) => {
    const sys = item?.system ?? {};
    const category = String(sys.category || "").toLowerCase();
    const armorClass = String(sys.armorClass || "partial").toLowerCase();
    const hitLocs = sys.hitLocations ?? {};
    const isShield = Boolean(sys.isShieldEffective ?? sys.isShield) || category === "shield" || category.startsWith("shield");

    // If explicit coverage exists, use it (works for both armor and shields).
    const anyExplicit = ARMOR_LOCATION_KEYS.some(k => hitLocs?.[k] === true);
    if (anyExplicit) return new Set(ARMOR_LOCATION_KEYS.filter(k => hitLocs?.[k] === true));

    // Shields without explicit coverage: treat as arm-protection for Forceful Impact.
    if (isShield) return new Set(["LeftArm", "RightArm"]);

    // Armor pieces: category-based fallback when legacy "all true" would otherwise misbehave.
    const allTrue = ARMOR_LOCATION_KEYS.every(k => hitLocs?.[k] === true);
    const catLocs = ARMOR_CATEGORY_TO_LOCATIONS[category] ?? null;
    if (catLocs && (armorClass === "full" || (armorClass === "partial" && allTrue))) {
      return new Set(catLocs);
    }

    return new Set();
  };

  const equippedArmor = targetActor.items?.filter((i) => i.type === "armor" && i.system?.equipped === true) ?? [];
  const candidates = [];

  for (const item of equippedArmor) {
    const sys = item.system ?? {};
    const category = String(sys.category || "").toLowerCase();
    const isShield = Boolean(sys.isShieldEffective ?? sys.isShield) || category === "shield" || category.startsWith("shield");

    const covered = getCoveredLocations(item);
    if (!covered.has(propertyName)) continue;

    // Forceful Impact selects one piece/shield. Prefer the piece that is currently most protective:
    // - Armor uses AR (effective if available)
    // - Shields use Block Rating (effective if available)
    const score = (() => {
      if (isShield) {
        const br = (sys.blockEffective != null) ? Number(sys.blockEffective) : Number(sys.block ?? 0);
        return Number.isFinite(br) ? br : 0;
      }
      const ar = (sys.armorEffective != null) ? Number(sys.armorEffective) : Number(sys.armor ?? 0);
      return Number.isFinite(ar) ? ar : 0;
    })();

    candidates.push({ item, score });
  }

  if (!candidates.length) return;

  // Choose the single most protective item on that location (deterministic).
  candidates.sort((a, b) => (b.score - a.score));
  const targetItem = candidates[0].item;

  // Stack Damaged (X) by +1 per use.
  const current = Array.isArray(targetItem.system?.qualitiesStructured)
    ? targetItem.system.qualitiesStructured
    : [];
  const next = current.map(q => ({ ...q }));

  const idx = next.findIndex(q => String(q?.key ?? "").toLowerCase() === "damaged");
  if (idx >= 0) {
    const v = Number(next[idx].value ?? 0);
    next[idx].value = Number.isFinite(v) ? v + 1 : 1;
  } else {
    next.push({ key: "damaged", value: 1 });
  }

  await requestUpdateDocument(targetItem, { "system.qualitiesStructured": next });
}

/**
 * Apply healing to an actor.
 *
 * @param {Actor} actor
 * @param {number} healing
 * @param {object} options
 * @param {string} options.source
 */
export async function applyHealing(actor, healing, options = {}) {
  const { source = "Healing" } = options;

  console.log("UESRPG | applyHealing CALLED", {
    actor: actor?.name,
    healing,
    source,
    isTemporary: options.isTemporary
  });

  if (!actor?.system) {
    console.error("UESRPG | applyHealing: Invalid actor");
    ui.notifications.error("Invalid actor for healing");
    return null;
  }

  // NEW: Check if this is temporary HP grant
  if (options.isTemporary === true) {
    console.log("UESRPG | applyHealing: Routing to applyTemporaryHP");
    return await applyTemporaryHP(actor, healing, source, options);
  }

  const currentHP = Number(actor.system?.hp?.value ?? 0);
  const maxHP = Number(actor.system?.hp?.max ?? 1);

  // RAW (Bleeding interaction): "subtract the total HP regained (including HP that would go beyond max HP)".
  // We therefore track both:
  //  - totalHealed: the attempted healing amount (including DoS bonus and overheal)
  //  - effectiveHealed: actual HP restored (capped by maxHP)
  const baseHeal = Number(healing || 0);
  const dosBonus = Number(options?.dosBonus ?? 0);
  const totalHealed = Math.max(0, baseHeal + dosBonus);
  if (totalHealed <= 0) return null;

  const newHP = Math.min(maxHP, currentHP + totalHealed);
  const effectiveHealed = newHP - currentHP;
  const overflow = Math.max(0, totalHealed - effectiveHealed);

  const activeToken = actor.token ?? actor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && actor.prototypeToken && actor.prototypeToken.actorLink === false);
  const updateTarget = isUnlinkedToken ? activeToken.actor : actor;

  // Only update HP when there is an actual HP delta.
  if (effectiveHealed !== 0) {
    await requestUpdateDocument(updateTarget, { "system.hp.value": newHP });
  }

  const rollHTML = String(options?.rollHTML ?? "");

  // Healing should not reveal current/max HP by default to avoid metagame information.
  // Set { revealHP: true } explicitly if a specific workflow needs it.
  const revealHP = options?.revealHP === true;
  
  // For magic healing workflow, skip chat message since it's already shown in the opposed card
  const skipChatMessage = options?.skipChatMessage === true;

  const messageContent = `
    <div class="uesrpg-healing-applied">
      <h3>${updateTarget.name} receives healing!</h3>
      ${rollHTML ? `<div class="dice-roll" style="margin:0.35rem 0;">${rollHTML}</div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Healing:</strong></div><div style="color:#388e3c;font-weight:bold;">+${effectiveHealed}</div>
        ${revealHP ? `<div><strong>HP:</strong></div><div>${newHP} / ${maxHP}</div>` : ""}
      </div>
    </div>
  `;

  // Avoid chat spam when no HP is actually restored (but still dispatch the hook for Bleeding reduction).
  // Also skip chat message if requested (e.g., for magic healing where opposed card already shows result).
  if (effectiveHealed > 0 && !skipChatMessage) {
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
      content: messageContent,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    });
  }
  // Emit healing-applied hook for downstream automation (wounds treatment, etc.)
  try {
    Hooks.callAll("uesrpgHealingApplied", updateTarget, {
      applicationId: options?.applicationId ?? crypto?.randomUUID?.() ?? foundry?.utils?.randomID?.() ?? null,
      origin: options?.origin ?? null,
      source: options?.source ?? "Healing",
      // Backwards-compatible: keep amountApplied as the effective HP restored.
      amountApplied: effectiveHealed,
      // Canonical: total healing including overheal (used by Bleeding).
      totalHealed,
      effectiveHealed,
      overflow,
      oldHP: currentHP,
      newHP,
      maxHP,
    });
  } catch (err) {
    console.error("UESRPG | uesrpgHealingApplied hook dispatch failed", err);
  }


  return {
    actor: updateTarget,
    healing: effectiveHealed,
    oldHP: currentHP,
    newHP,
    totalHealed,
    overflow,
  };
}

/**
 * Grant temporary hit points to actor
 * Temp HP does NOT stack - always use the higher value (RAW)
 * @param {Actor} actor
 * @param {number} amount
 * @param {string} source
 * @param {object} options
 */
async function applyTemporaryHP(actor, amount, source = "Spell", options = {}) {
  console.log("UESRPG | applyTemporaryHP CALLED", {
    actor: actor?.name,
    amount,
    source,
    currentTempHP: actor?.system?.tempHP ?? actor?.system?.hp?.temp ?? 0
  });

  if (!actor?.system) {
    console.error("UESRPG | applyTemporaryHP: Invalid actor");
    ui.notifications.error("Invalid actor for temporary HP");
    return null;
  }

  const grantAmount = Math.max(0, Number(amount || 0));
  if (grantAmount === 0) {
    console.warn("UESRPG | applyTemporaryHP: Grant amount is 0");
    return null;
  }

  // Check both possible locations for backwards compatibility
  const currentTempHP = Number(actor.system?.tempHP ?? actor.system?.hp?.temp ?? 0);

  console.log(`UESRPG | applyTemporaryHP: Current temp HP: ${currentTempHP}, Grant amount: ${grantAmount}`);

  // RAW: Temp HP doesn't stack - take the higher value
  const newTempHP = Math.max(currentTempHP, grantAmount);
  const actualGranted = newTempHP - currentTempHP;

  console.log(`UESRPG | applyTemporaryHP: New temp HP: ${newTempHP}, Actual granted: ${actualGranted}`);

  const activeToken = actor.token ?? actor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && actor.prototypeToken && actor.prototypeToken.actorLink === false);
  const updateTarget = isUnlinkedToken ? activeToken.actor : actor;

  console.log(`UESRPG | applyTemporaryHP: Update target: ${updateTarget?.name}, isUnlinked: ${isUnlinkedToken}`);

  if (newTempHP !== currentTempHP) {
    try {
      console.log(`UESRPG | applyTemporaryHP: Updating actor with temp HP: ${newTempHP}`);
      // Update both fields for backwards compatibility, but system.tempHP is canonical
      await requestUpdateDocument(updateTarget, { 
        "system.tempHP": newTempHP,
        "system.hp.temp": newTempHP 
      });
      console.log("UESRPG | applyTemporaryHP: Actor updated successfully");
    } catch (err) {
      console.error("UESRPG | applyTemporaryHP: Actor update FAILED", err);
      return null;
    }
  } else {
    console.log("UESRPG | applyTemporaryHP: No update needed, temp HP unchanged");
  }

  const rollHTML = String(options?.rollHTML ?? "");
  
  // For magic healing workflow, skip chat message since it's already shown in the opposed card
  const skipChatMessage = options?.skipChatMessage === true;

  // Chat message
  const content = `
    <div class="uesrpg-temp-hp-card">
      <h3>Temporary Hit Points</h3>
      ${rollHTML ? `<div class="dice-roll" style="margin:0.35rem 0;">${rollHTML}</div>` : ""}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Temp HP:</strong></div><div style="color:#2196f3;font-weight:bold;">${actualGranted > 0 ? `+${grantAmount}` : `${currentTempHP} (already higher)`}</div>
        <div><strong>Total Temp HP:</strong></div><div><em>${newTempHP}</em></div>
      </div>
    </div>
  `;

  if (!skipChatMessage) {
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
      content,
      type: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }

  return { tempHP: newTempHP, granted: actualGranted, previous: currentTempHP };
}

// Global exposure for macros and console
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.damage = {
  DAMAGE_TYPES,
  getDamageReduction,
  calculateDamage,
  applyDamage,
  applyHealing,
};
