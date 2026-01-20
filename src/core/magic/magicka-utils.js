/**
 * src/core/magic/magicka-utils.js
 *
 * Magicka consumption and spell damage helpers for UESRPG 3ev4.
 *
 * Notes:
 * - This file is intentionally "schema-tolerant": spells in this repository currently have
 *   multiple historical lanes for cost/damage (e.g. system.cost vs system.scaling.levels[].cost,
 *   system.damage vs system.damageFormula vs system.scaling.levels[].damageFormula).
 * - Package 1 normalizes reads without migrating or renaming any data fields.
 */

import { getDifficultyByKey } from "../skills/skill-tn.js";

/**
 * Safely coerce a value into a finite number.
 * @param {*} v
 * @param {number} fallback
 * @returns {number}
 */
function _num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize a string value.
 * @param {*} v
 * @returns {string}
 */
function _str(v) {
  return String(v ?? "").trim();
}

/**
 * Safely coerce a value into a boolean.
 * Form-derived values are often strings ("true"/"false"), which must not be treated as truthy.
 * @param {*} v
 * @returns {boolean}
 */
function _bool(v) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off" || s === "") return false;
  return Boolean(v);
}

/**
 * Return the spell level (1..7).
 * @param {Item} spell
 * @returns {number}
 */
export function getSpellLevel(spell) {
  const lvl = _num(spell?.system?.level, 1);
  return Math.max(1, Math.min(7, lvl));
}

/**
 * Get a scaling entry for the spell at a specific level.
 * If no explicit entry exists, falls back to array index (level-1) if present.
 * @param {Item} spell
 * @param {number|null} level
 * @returns {object|null}
 */
export function getSpellScalingEntry(spell, level = null) {
  const levels = spell?.system?.scaling?.levels;
  if (!Array.isArray(levels) || levels.length === 0) return null;

  const targetLevel = level == null ? getSpellLevel(spell) : _num(level, getSpellLevel(spell));
  const byLevel = levels.find(l => _num(l?.level, 0) === targetLevel);
  if (byLevel) return byLevel;

  const byIndex = levels[targetLevel - 1];
  return byIndex ?? null;
}

/**
 * Canonical spell cost getter.
 * Prefers scaling lane when present, otherwise falls back to system.cost.
 * @param {Item} spell
 * @param {number|null} level
 * @returns {number}
 */
export function getSpellCost(spell, level = null) {
  const scaling = getSpellScalingEntry(spell, level);
  const scaledCost = scaling ? _num(scaling.cost, NaN) : NaN;
  if (Number.isFinite(scaledCost)) return Math.max(0, scaledCost);

  const baseCost = _num(spell?.system?.cost, 0);
  return Math.max(0, baseCost);
}

/**
 * Canonical spell damage formula getter.
 * Returns damageFormula, falling back to legacy damage field.
 * Scaling system is deprecated and ignored.
 * @param {Item} spell
 * @param {number|null} level - Ignored; kept for API compatibility
 * @returns {string} Damage formula or "0" for non-damaging spells
 */
export function getSpellDamageFormula(spell, level = null) {
  // Prefer primary damageFormula field
  const primary = _str(spell?.system?.damageFormula);
  if (primary) return primary;

  // Legacy fallback for older spells
  const legacy = _str(spell?.system?.damage);
  // Return "0" for spells without damage (used in isDamaging checks)
  return legacy || "0";
}

/**
 * Canonical spell damage type getter.
 * @param {Item} spell
 * @returns {string}
 */
export function getSpellDamageType(spell) {
  const dt = _str(spell?.system?.damageType).toLowerCase();
  return dt || "none";
}

/**
 * Determine whether this spell should be treated as healing.
 * Checks both the isHealingSpell toggle and damageType for backwards compatibility.
 * @param {Item} spell
 * @returns {boolean}
 */
export function isHealingSpell(spell) {
  // Check the dedicated healing toggle first (new system)
  if (_bool(spell?.system?.isHealingSpell)) return true;
  // Fall back to damage type check (legacy/backwards compatibility)
  return getSpellDamageType(spell) === "healing";
}

/**
 * Read the actor's current Magicka value from the canonical lane in this system.
 * @param {Actor} actor
 * @returns {number}
 */
export function getActorMagicka(actor) {
  return _num(actor?.system?.magicka?.value, 0);
}

/**
 * Compute WP bonus (floor(WP.total / 10)).
 * @param {Actor} actor
 * @returns {number}
 */
export function getActorWillpowerBonus(actor) {
  return Math.floor(_num(actor?.system?.characteristics?.wp?.total, 0) / 10);
}

/**
 * Consume magicka from actor for casting a spell.
 *
 * Important:
 * - This function does NOT clamp Magicka to 0; it will refuse to consume if insufficient.
 * - Callers should treat ok:false as "the spell is not cast".
 *
 * @param {Actor} actor - The caster
 * @param {Item} spell - The spell being cast
 * @param {object} options - Spell options (isRestrained, isOverloaded, etc.)
 * @param {number|null} options.level - Optional casting level (defaults to spell.system.level)
 * @returns {Promise<object>} - { ok, consumed, remaining, previous, required?, baseCost? }
 */

/**
 * Compute the final Magicka cost for casting a spell given options.
 * Pure helper: does not mutate actor or spell.
 *
 * RAW (Chapter 6):
 * - Spell Restraint reduces cost by WP bonus, minimum 1 Magicka when base cost > 0.
 * - Overload / Reinforce modify spell effects, not the Magicka cost itself.
 *
 * @param {Actor} actor - The caster (may be null/undefined)
 * @param {Item} spell - The spell being cast
 * @param {object} options - { isRestrained, isOverloaded, isOvercharged, level }
 * @param {number|null} options.level - Optional casting level (defaults to spell.system.level)
 * @returns {{ cost:number, baseCost:number, wpBonus:number, isRestrained:boolean, isOverloaded:boolean, isOvercharged:boolean }}
 */
export function computeSpellMagickaCost(actor, spell, options = {}) {
  const baseCost = getSpellCost(spell, options.level ?? null);

  const isRestrained = _bool(options.isRestrained);
  const isOverloaded = _bool(options.isOverloaded);
  const isOvercharged = _bool(options.isOvercharged);

  let cost = baseCost;
  let wpBonus = 0;

  // NOTE: This helper assumes the cast succeeded. If you need the cost to *attempt* a cast,
  // use computeSpellAttemptMagickaCost().
  if (isRestrained && baseCost > 0) {
    wpBonus = getActorWillpowerBonus(actor);
    cost = Math.max(1, baseCost - wpBonus);
  }

  cost = Math.max(0, Math.floor(cost));
  return { cost, baseCost, wpBonus, isRestrained, isOverloaded, isOvercharged };
}

/**
 * Compute the Magicka cost required to *attempt* casting a spell.
 * RAW (Chapter 6): Spell Restraint reduces cost only on a successful cast,
 * so the attempt cost is always the listed base cost.
 *
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} options - { level }
 * @returns {{ cost:number, baseCost:number }}
 */
export function computeSpellAttemptMagickaCost(actor, spell, options = {}) {
  const baseCost = getSpellCost(spell, options.level ?? null);
  return { cost: baseCost, baseCost };
}

/**
 * Apply Spell Restraint refund on successful casts.
 * RAW (Chapter 6): On a successful spellcast, a mage can reduce the cost by their
 * Willpower bonus to a minimum of 1 Magicka (when base cost > 0).
 *
 * Also RAW (Chapter 6, Attack Spells): On a critical success, non-damaging spells
 * double their Magicka cost reduction from Spell Restraint (still subject to the 1 cost minimum).
 *
 * Returns refund details for reporting.
 *
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} options - { isRestrained, level }
 * @param {object} result - roll result (degree-roll-helper.js)
 * @param {object} spendInfo - return value from consumeSpellMagicka()
 * @returns {Promise<{ refund:number, finalCost:number, breakdown:string }>}
 */
export async function applySpellRestraintRefund(actor, spell, options = {}, result = {}, spendInfo = {}) {
  const isRestrained = _bool(options.isRestrained);
  const spent = Number(spendInfo?.consumed ?? 0) || 0;

  if (!isRestrained) return { refund: 0, finalCost: spent, breakdown: "" };

  const isSuccess = Boolean(
    result?.isSuccess ??
    result?.success ??
    result?.outcome?.success ??
    (typeof result?.degrees === "number" ? (result.degrees >= 0) : false)
  );

  if (!isSuccess) return { refund: 0, finalCost: spent, breakdown: "" };

  const baseCost = getSpellCost(spell, options.level ?? null);
  if (baseCost <= 0) return { refund: 0, finalCost: 0, breakdown: "" };

  const wpBonus = getActorWillpowerBonus(actor);

  // Determine whether this spell is "damaging" for the critical success clause.
  // Healing and effect-only spells are treated as non-damaging.
  const formula = getSpellDamageFormula(spell, options.level ?? null);
  const isDamaging = Boolean(formula && formula !== "0" && getSpellDamageType(spell) !== "healing");

  const isCriticalSuccess = Boolean(result?.isCriticalSuccess ?? result?.criticalSuccess ?? result?.isCritSuccess);
  const doubled = isCriticalSuccess && !isDamaging;

  const reductionCap = Math.max(0, baseCost - 1);
  const reductionCandidate = doubled ? (wpBonus * 2) : wpBonus;
  const reduction = Math.min(reductionCap, Math.max(0, reductionCandidate));

  if (reduction <= 0) return { refund: 0, finalCost: baseCost, breakdown: "" };

  const current = getActorMagicka(actor);
  const max = _num(actor?.system?.magicka?.max, 0);
  const next = (max > 0) ? Math.min(max, current + reduction) : (current + reduction);
  await actor.update({ "system.magicka.value": next });

  const finalCost = baseCost - reduction;
  const breakdown = doubled
    ? `Spell Restraint (Critical): -${reduction} (2×WPB), min 1`
    : `Spell Restraint: -${reduction} (WPB), min 1`;

  // If the spendInfo differs from baseCost for any reason, treat the refund as best-effort.
  const refund = Math.min(reduction, spent > 0 ? spent : reduction);
  return { refund, finalCost, breakdown };
}
export async function consumeSpellMagicka(actor, spell, options = {}) {
  const { cost: attemptCost, baseCost } = computeSpellAttemptMagickaCost(actor, spell, options);

  const current = getActorMagicka(actor);
  const remaining = current - attemptCost;

  // Insufficient Magicka: do not cast.
  if (remaining < 0) {
    ui.notifications.warn(
      `Not enough Magicka to cast ${spell?.name ?? "spell"}. Required: ${attemptCost}, Available: ${current}.`
    );
    return {
      ok: false,
      consumed: 0,
      remaining: current,
      previous: current,
      required: attemptCost,
      baseCost
    };
  }

  await actor.update({ "system.magicka.value": remaining });

  // Track the most recent spell cast for RAW upkeep restrictions.
  // Best-effort only: this flag is used by the upkeep workflow to enforce
  // the "no other spell since" rule for spells with no listed duration.
  try {
    await actor.setFlag("uesrpg-3ev4", "lastSpellCastWorldTime", Number(game.time?.worldTime ?? 0) || 0);
    await actor.setFlag("uesrpg-3ev4", "lastSpellCastSpellUuid", String(spell?.uuid ?? ""));
  } catch (_e) {
    // no-op
  }

  return {
    ok: true,
    consumed: attemptCost,
    remaining,
    previous: current,
    baseCost
  };
}

/**
 * Roll spell damage
 * @param {Item} spell - The spell
 * @param {object} options - { isOverloaded, wpBonus, isCritical, level }
 * @returns {Promise<Roll>} - Evaluated damage roll
 */
export async function rollSpellDamage(spell, options = {}) {
  const damageFormula = getSpellDamageFormula(spell, options.level ?? null);
  if (!damageFormula || damageFormula === "0") {
    return await new Roll("0").evaluate();
  }

  const roll = await new Roll(damageFormula).evaluate();

  // Critical success: return max damage instead
  if (options.isCritical) {
    const maxDamage = getMaxSpellDamage(spell, { level: options.level ?? null });
    // Foundry computes total at evaluate time; we preserve formula but override total for reporting.
    // This is a controlled internal assignment used elsewhere in the codebase.
    roll._total = maxDamage;
  }

  // Overload: optional flat bonus to damage.
  if (_bool(options.isOverloaded)) {
    const b = _num(options.overloadBonus, 0);
    if (b) roll._total = _num(roll._total, roll.total) + b;
  }

  return roll;
}

/**
 * Compute overload bonus damage for a spell.
 *
 * Current data lane:
 * - spell.system.overloadBonusDamage may be:
 *   - a number (flat bonus)
 *   - a number >=10 meaning a characteristic total (bonus = floor(total/10))
 *   - a string token "WB" / "WPB" meaning Willpower Bonus
 *
 * @param {Actor} actor
 * @param {Item} spell
 * @returns {number}
 */
export function computeSpellOverloadBonusDamage(actor, spell) {
  const raw = spell?.system?.overloadBonusDamage;
  if (raw === undefined || raw === null || raw === "") return 0;

  const s = String(raw).trim().toLowerCase();
  if (!s) return 0;

  // Keyword: willpower bonus
  if (s === "wb" || s === "wpb" || s === "willpower bonus" || s === "willpower") {
    return getActorWillpowerBonus(actor);
  }

  // Number: either flat bonus or characteristic total lane.
  const n = Number(s);
  if (Number.isFinite(n)) {
    if (n >= 10) return Math.floor(n / 10);
    return Math.floor(n);
  }

  return 0;
}

/**
 * Roll spell healing.
 *
 * Healing spells in this system use the same formula lane as damage (system.damageFormula/scaling).
 * This helper exists to keep the modern magic workflow deterministic and to keep imports stable.
 *
 * Note:
 * - By default, DoS does not scale healing unless a specific talent/feature implements it.
 * - Critical casting success does not automatically maximize healing unless explicitly stated by RAW.
 *
 * @param {Item} spell - The spell
 * @param {object} options - { level }
 * @returns {Promise<Roll>} - Evaluated healing roll
 */
export async function rollSpellHealing(spell, options = {}) {
  const healingFormula = getSpellDamageFormula(spell, options.level ?? null);
  if (!healingFormula || healingFormula === "0") {
    return await new Roll("0").evaluate();
  }
  return await new Roll(healingFormula).evaluate();
}



/**
 * Get maximum damage for a spell (for critical hits).
 * This does not evaluate actor data references; it supports common dice expressions.
 *
 * @param {Item} spell - The spell
 * @param {object} options - { level }
 * @returns {number} - Maximum damage value
 */
export function getMaxSpellDamage(spell, options = {}) {
  const formula = _str(getSpellDamageFormula(spell, options.level ?? null));
  if (!formula || formula === "0") return 0;

  const cleaned = formula.replace(/\s+/g, "");

  // Sum max dice
  let total = 0;
  const diceRe = /(\d+)d(\d+)/g;
  for (const m of cleaned.matchAll(diceRe)) {
    const count = _num(m[1], 0);
    const sides = _num(m[2], 0);
    total += count * sides;
  }

  // Remove dice portions and sum explicit constants
  const withoutDice = cleaned.replace(diceRe, "");

  // Leading constant without sign (rare but supported)
  const leading = withoutDice.match(/^\d+/);
  if (leading) total += _num(leading[0], 0);

  for (const m of withoutDice.matchAll(/([+-])(\d+)/g)) {
    const sign = m[1] === "-" ? -1 : 1;
    total += sign * _num(m[2], 0);
  }

  return total;
}

/**
 * Get the magic skill level for a given school.
 *
 * Spellcasting Level = (Skill Rank Numeric) + 1
 * Repository rank labels (template.json) imply:
 *   novice=0, apprentice=1, journeyman=2, adept=3, expert=4, master=5
 * We additionally accept grandmaster=6 for future-proofing.
 *
 * @param {Actor} actor - The caster
 * @param {string} school - The spell school (e.g., "destruction")
 * @returns {number} - Spellcasting level
 */
export function getMagicSkillLevel(actor, school) {
  const schoolNormalized = _str(school).toLowerCase();

  // Find the magic skill for this school
  const magicSkill = actor?.items?.find(i =>
    i.type === "magicSkill" &&
    _str(i.name).toLowerCase().includes(schoolNormalized)
  );

  if (!magicSkill) return 0;

  // Convert rank label to numeric "rank number"
  // untrained => -1 so that spellcasting level becomes 0 (rank + 1)
  const rankToNumeric = {
    untrained: -1,
    novice: 0,
    apprentice: 1,
    journeyman: 2,
    adept: 3,
    expert: 4,
    master: 5,
    grandmaster: 6
  };

  const rank = _str(magicSkill.system?.rank ?? "untrained").toLowerCase();
  const rankValue = rankToNumeric[rank] ?? -1;

  return rankValue + 1;
}

/**
 * Compute the casting TN for a spell
 * @param {Actor} actor - The caster
 * @param {Item} spell - The spell being cast
 * @param {object} options - Casting options (manualModifier, etc.)
 * @returns {object} - { baseTN, spellcastingLevel, spellLevel, modifiers, finalTN }
 */
export function computeMagicCastingTN(actor, spell, options = {}) {
  const school = _str(spell?.system?.school).toLowerCase();

  const difficultyKeyRaw = _str(options?.difficultyKey ?? options?.difficulty ?? "average");
  const diff = getDifficultyByKey(difficultyKeyRaw.trim().toLowerCase());
  const difficultyMod = _num(diff?.mod, 0);

  // NPCs do not use embedded Magic Skill items for casting.
  // They rely on the NPC sheet "Magic Profession" lane (system.professions.magic).
  // NPCs also do not have a canonical "spellcasting level" source, so we default to
  // treating them as capable of casting their own spells at their listed level.
  if (actor?.type === "NPC") {
    const sys = actor?.system ?? {};
    const baseTN = _num(sys?.professions?.magic ?? sys?.professionsWound?.magic, 0);
    const spellLevel = getSpellLevel(spell);
    const spellcastingLevel = Math.max(0, spellLevel);

    const fatiguePenalty = _num(sys?.fatigue?.penalty, 0);
    const carryPenalty = _num(sys?.carry_rating?.penalty, 0);
    const woundPenalty = _num(sys?.woundPenalty, 0);
    const manualMod = _num(options?.manualModifier ?? options?.manualMod, 0);

    const modifiers = [
      { label: "Base TN", value: baseTN, keepZero: true },
      { label: `Difficulty: ${diff?.label ?? "Average"}`, value: difficultyMod, keepZero: true },
      { label: "Spell Level Penalty", value: 0 },
      { label: "Fatigue Penalty", value: fatiguePenalty },
      { label: "Carry Penalty", value: carryPenalty },
      { label: "Wound Penalty", value: woundPenalty }
    ];

    if (manualMod !== 0) modifiers.push({ label: "Manual Modifier", value: manualMod });

    const finalTN = Math.max(0, baseTN + difficultyMod + fatiguePenalty + carryPenalty + woundPenalty + manualMod);
    return {
      baseTN,
      spellcastingLevel,
      spellLevel,
      modifiers,
      breakdown: modifiers,
      finalTN
    };
  }

  // Find magic skill for this school
  const magicSkill = actor?.items?.find(i =>
    i.type === "magicSkill" &&
    _str(i.name).toLowerCase().includes(school)
  );

  // Base TN from skill or WP bonus fallback
  const wpBonus = getActorWillpowerBonus(actor);
  const baseTN = magicSkill ? _num(magicSkill.system?.value, 0) : wpBonus;

  // Calculate spellcasting level
  const spellcastingLevel = getMagicSkillLevel(actor, school);

  // Spell level penalty: -10 per spell level above spellcasting level
  const spellLevel = getSpellLevel(spell);
  const levelPenalty = Math.max(0, spellLevel - spellcastingLevel) * -10;

  // Apply standard actor penalties
  const fatiguePenalty = _num(actor?.system?.fatigue?.penalty, 0);
  const carryPenalty = _num(actor?.system?.carry_rating?.penalty, 0);
  const woundPenalty = _num(actor?.system?.woundPenalty, 0);

  // Manual modifier from options
  const manualMod = _num(options?.manualModifier ?? options?.manualMod, 0);

  const modifiers = [
    { label: "Base TN", value: baseTN, keepZero: true },
    { label: `Difficulty: ${diff?.label ?? "Average"}`, value: difficultyMod, keepZero: true },
    { label: "Spell Level Penalty", value: levelPenalty },
    { label: "Fatigue Penalty", value: fatiguePenalty },
    { label: "Carry Penalty", value: carryPenalty },
    { label: "Wound Penalty", value: woundPenalty }
  ];

  if (manualMod !== 0) {
    modifiers.push({ label: "Manual Modifier", value: manualMod });
  }

  const finalTN = baseTN + difficultyMod + levelPenalty + fatiguePenalty + carryPenalty + woundPenalty + manualMod;

  return {
    baseTN,
    spellcastingLevel,
    spellLevel,
    modifiers,
    breakdown: modifiers,
    finalTN: Math.max(0, finalTN)
  };
}
