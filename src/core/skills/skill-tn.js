/**
 * src/core/skills/skill-tn.js
 *
 * Skill TN computation for UESRPG 3ev4 (Foundry v13.351).
 *
 * Design:
 *  - Deterministic TN computation with an explicit breakdown (for debug / UI).
 *  - Does not mutate documents.
 */

import { collectCombatTNModifierEntries } from "../combat/tn.js";
import { evaluateAEModifierKeys } from "../active-effects/modifier-evaluator.js";

export const SKILL_DIFFICULTIES = Object.freeze([
  { key: "effortless", label: "Effortless", mod: 40 },
  { key: "simple", label: "Simple", mod: 30 },
  { key: "easy", label: "Easy", mod: 20 },
  { key: "ordinary", label: "Ordinary", mod: 10 },
  { key: "average", label: "Average", mod: 0 },
  { key: "challenging", label: "Challenging", mod: -10 },
  { key: "difficult", label: "Difficult", mod: -20 },
  { key: "hard", label: "Hard", mod: -30 },
  { key: "veryHard", label: "Very Hard", mod: -40 }
]);

export function getDifficultyByKey(key) {
  return SKILL_DIFFICULTIES.find(d => d.key === key) ?? SKILL_DIFFICULTIES.find(d => d.key === "average");
}

function _asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}


function _normalizeKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}
function _isAgilityBasedSkill(skillItem) {
  // Skills can encode governing characteristics as a single token ("Agi"),
  // a full word ("Agility"), or a comma/space separated list ("Str, Agi").
  // Treat any token containing AGI/Agility as agility-based for mobility rules.
  const governingRaw = String(skillItem?.system?.governingCha || skillItem?.system?.baseCha || "");
  const governing = governingRaw.trim().toLowerCase();
  if (!governing) return false;

  // Match whole tokens to avoid false positives.
  return /\bagi\b|\bagility\b/.test(governing);
}

/**
 * Determine if a skill is based on STR, AGI, or END.
 * Used for Frenzied condition penalty exemption.
 */
function _isPhysicalSkill(skill) {
  const gov = String(skill?.system?.governingCha ?? skill?.system?.baseCha ?? skill?.governingCharacteristic ?? "").trim().toLowerCase();
  return /\bstr\b|\bstrength\b|\bagi\b|\bagility\b|\bend\b|\bendurance\b/.test(gov);
}

function _collectItemSkillBonuses(actor, skill) {
  const out = [];
  if (!actor) return out;

  const key = String(skill?._professionKey ?? "").trim();
  const name = String(skill?.name ?? "").trim();

  const candidates = new Set();
  if (key) {
    candidates.add(key.toLowerCase());
    candidates.add(_normalizeKey(key));
  }
  if (name) {
    candidates.add(name.toLowerCase());
    candidates.add(_normalizeKey(name));
  }

  const seen = new Set(); // dedupe by itemId+entryKey+value

  for (const item of (actor.items ?? [])) {
    const sys = item?.system ?? {};
    if (!sys.equipped) continue;

    const arr = Array.isArray(sys.skillArray) ? sys.skillArray : [];
    for (const entry of arr) {
      const eName = String(entry?.name ?? "").trim();
      const eValue = _asNumber(entry?.value);
      if (!eName || !eValue) continue;

      const lc = eName.toLowerCase();
      const ek = _normalizeKey(eName);
      if (!(candidates.has(lc) || candidates.has(ek))) continue;

      const sig = `${item.id}|${ek}|${eValue}`;
      if (seen.has(sig)) continue;
      seen.add(sig);

      out.push({ itemName: item.name, value: eValue });
    }
  }
  return out;
}

function _isCombatStyle(skillItem) {
  return (skillItem?.type === "combatStyle") || /combat style/i.test(String(skillItem?.name || ""));
}

function _normSkillKey(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function computeSkillTN({
  actor,
  skillItem,
  difficultyKey = "average",
  manualMod = 0,
  useSpecialization = false,
  situationalMods = []
} = {}) {
  // Derive item-based skill bonuses from equipped items that use the legacy `system.skillArray` format.
  // This allows the chat card breakdown to attribute bonuses to specific items.
  
const skillName = String(skillItem?.name ?? "").trim();
const profKey = String(skillItem?._professionKey ?? "").trim();
const itemBonuses = [];
const seen = new Set();

if (actor && (skillName || profKey)) {
  const candidates = new Set();
  if (skillName) candidates.add(_normSkillKey(skillName));
  if (profKey) candidates.add(_normSkillKey(profKey));

  for (const item of actor.items ?? []) {
    const sys = item?.system;
    if (!sys?.equipped) continue;
    if (!Array.isArray(sys.skillArray) || sys.skillArray.length === 0) continue;

    for (const entry of sys.skillArray) {
      const eName = String(entry?.name ?? "").trim();
      const eVal = _asNumber(entry?.value);
      if (!eName || !eVal) continue;

      const k = _normSkillKey(eName);
      if (!candidates.has(k)) continue;

      const sig = `${item.id}|${k}|${eVal}`;
      if (seen.has(sig)) continue;
      seen.add(sig);

      itemBonuses.push({ itemName: item.name, value: eVal });
    }
  }
}

  // Active Effects: skill-specific and global modifiers.
  // Supported keys:
  // - system.modifiers.skills._all
  // - system.modifiers.skills.<normalizedSkillName>
  // We evaluate these deterministically at roll-time to support both ADD and OVERRIDE modes.
  const _aeSkillNorm = _normalizeKey(skillItem?.name);
  const _aeSkillKeys = ["system.modifiers.skills._all"];
  if (_aeSkillNorm) _aeSkillKeys.push(`system.modifiers.skills.${_aeSkillNorm}`);
  const _aeSkillResolved = actor ? evaluateAEModifierKeys(actor, _aeSkillKeys) : {};

  return computeSkillTNFromData({
    actorSystem: actor?.system ?? {},
    actorType: actor?.type,
    actorHasPlayerOwner: actor?.hasPlayerOwner,
    skill: {
      name: skillItem?.name,
      type: skillItem?.type,
      system: skillItem?.system ?? {}
    },
    itemBonuses,
    aeSkillResolved: _aeSkillResolved,
    combatTNBonuses: (() => {
      // Unopposed Combat Style checks should consume the same AE-driven combat TN bonuses
      // used by the opposed combat workflow (e.g. weapon effects adding Attack TN).
      // This is only relevant for combat styles.
      const isCombat = _isCombatStyle({ type: skillItem?.type, name: skillItem?.name });
      if (!isCombat) return null;
      // Lazy import boundary: keep this file usable in pure-data mode.
      // The import is static (top-level) but the function call is gated.
      return collectCombatTNModifierEntries(actor, "attacker");
    })(),
    difficultyKey,
    manualMod,
    useSpecialization,
    situationalMods
  });
}

/**
 * Pure TN computation operating on plain data objects (no document access).
 */
export function computeSkillTNFromData({
  actorSystem = {},
  actorType = null,
  actorHasPlayerOwner = true,
  skill = { name: null, type: null, system: {} },
  itemBonuses = null,
  aeSkillResolved = null,
  combatTNBonuses = null,
  difficultyKey = "average",
  manualMod = 0,
  useSpecialization = false,
  situationalMods = []
} = {}) {
  const breakdown = [];

  // In UESRPG, the stored skill value represents the rank-derived bonus (and any legacy item-derived parts).
  // In chat cards, present this as "Rank" for clarity.
  const baseSkill = _asNumber(skill?.system?.value);
  breakdown.push({ label: "Rank", value: baseSkill, source: "rank" });

  // Active Effects: skill-specific and global modifiers.
  // Supported keys (dynamic):
  // - system.modifiers.skills.<normalizedSkillName>
  // - system.modifiers.skills._all
  //
  // We evaluate these deterministically at roll-time to support both ADD and OVERRIDE modes.
  const normName = _normalizeKey(skill?.name);
  const keys = ["system.modifiers.skills._all"];
  if (normName) keys.push(`system.modifiers.skills.${normName}`);

  const resolved = aeSkillResolved ?? {};

  const allSkillBonus = _asNumber(resolved["system.modifiers.skills._all"]?.total ?? 0);
  if (allSkillBonus) {
    breakdown.push({ label: "Bonus", value: allSkillBonus, source: "aeSkillAll" });
  }

  const specificBonus = normName ? _asNumber(resolved[`system.modifiers.skills.${normName}`]?.total ?? 0) : 0;
  if (specificBonus) {
    breakdown.push({ label: "Bonus", value: specificBonus, source: "aeSkillSpecific" });
  }

  // Combat Style unopposed checks: include combat TN modifiers (attacker side).
  // These are applied via Actor-level modifiers or transferred item effects.
  // We prefer provenance-carrying entries when provided by the caller.
  if (_isCombatStyle({ type: skill?.type, name: skill?.name })) {
    const entries = Array.isArray(combatTNBonuses) ? combatTNBonuses : null;
    if (entries && entries.length) {
      for (const e of entries) {
        const v = _asNumber(e?.value);
        if (!v) continue;
        const label = String(e?.label ?? "Effects");
        breakdown.push({ label, value: v, source: "combatTN" });
      }
    } else {
      const combatMods = actorSystem?.modifiers?.combat ?? {};
      const v = _asNumber(combatMods?.attackTN);
      if (v) breakdown.push({ label: "Effects", value: v, source: "combatTN" });
    }
  }
  // Skill-linked item automation.
  // NOTE: This function is pure-data; it cannot inspect Actor items. Any item-based bonuses must be
  // collected by the caller and provided via `itemBonuses`.
  const derivedItemBonuses = Array.isArray(itemBonuses) ? itemBonuses : [];

  if (derivedItemBonuses.length) {
    for (const b of derivedItemBonuses) {
      const v = _asNumber(b?.value);
      if (!v) continue;
      const itemName = String(b?.itemName ?? "").trim();
      const label = itemName ? `Item Bonus: ${itemName}` : "Item Bonus";
      breakdown.push({ label, value: v, source: "itemBonus" });
    }
  }

  const fatigue = _asNumber(actorSystem?.fatigue?.penalty);
  if (fatigue) breakdown.push({ label: "Fatigue", value: fatigue, source: "fatigue" });

  const enc = _asNumber(actorSystem?.carry_rating?.penalty);
  if (enc) breakdown.push({ label: "Encumbrance", value: enc, source: "encumbrance" });

  // Mobility: armor weight class penalties (RAW).
  // We rely on the derived actor.system.mobility object.
  // - Light: -10 Acrobatics
  // - Medium/Heavy/Super-Heavy: Agility-based tests (except Combat Style)
  // - Crippling: -40 all tests
  const mobility = actorSystem?.mobility ?? {};
  const allTestPenalty = _asNumber(mobility?.allTestPenalty);
  if (allTestPenalty) breakdown.push({ label: "Armor: Crippling", value: allTestPenalty, source: "armorAll" });

  const nameKey = String(skill?.name ?? "").trim().toLowerCase();
  const skillSpecific = _asNumber(mobility?.skillTestPenalties?.[nameKey]);
  if (skillSpecific) breakdown.push({ label: "Armor: Penalty", value: skillSpecific, source: "armorSkill" });

  const mobilityAgiPenalty = (_isAgilityBasedSkill({ system: skill.system }) && !_isCombatStyle({ type: skill.type, name: skill.name }))
    ? _asNumber(mobility?.agilityTestPenalty)
    : 0;
  if (mobilityAgiPenalty) breakdown.push({ label: "Armor: Penalty", value: mobilityAgiPenalty, source: "armorAgility" });

  const woundedPenalty = (actorSystem?.wounded)
    ? _asNumber(actorSystem?.woundPenalty)
    : 0;
  if (woundedPenalty) breakdown.push({ label: "Wounded", value: woundedPenalty, source: "wounded" });

  // Environmental penalty scaffolding: optional structured penalties by skill name.
  // This does not require schema changes; callers may supply actorSystem.environment via effects/modules.
  const envPenalty = _asNumber(actorSystem?.environment?.skillPenalties?.[nameKey]);
  if (envPenalty) breakdown.push({ label: "Environment", value: envPenalty, source: "environment" });

  // Frenzied skill penalty (non-physical tests only)
  const frenziedPenalty = _asNumber(actorSystem?.modifiers?.skills?.frenziedPenalty);
  if (frenziedPenalty && !_isPhysicalSkill(skill)) {
    breakdown.push({ label: "Frenzied", value: frenziedPenalty, source: "frenzied" });
  }

  // Difficulty (RAW Chapter 1)
  const diff = getDifficultyByKey(difficultyKey);
  if (diff?.mod) breakdown.push({ label: `Difficulty: ${diff.label}`, value: diff.mod, source: "difficulty" });

  // Specialization (RAW Chapter 3): +10 when applicable.
  const specBonus = useSpecialization ? 10 : 0;
  if (specBonus) breakdown.push({ label: "Specialization", value: specBonus, source: "specialization" });

  // Situational modifiers (e.g., sensory impairment toggles in opposed workflows).
  if (Array.isArray(situationalMods)) {
    for (const m of situationalMods) {
      const v = _asNumber(m?.value);
      if (!v) continue;
      const label = String(m?.label ?? m?.name ?? "Situational").trim() || "Situational";
      breakdown.push({ label, value: v, source: String(m?.source ?? "situational") });
    }
  }

  const manual = _asNumber(manualMod);
  if (manual) breakdown.push({ label: "Manual Modifier", value: manual, source: "manual" });

  const finalTN = breakdown.reduce((sum, b) => sum + _asNumber(b.value), 0);

  return {
    baseTN: baseSkill,
    finalTN,
    breakdown,
    difficulty: diff,
    useSpecialization: Boolean(useSpecialization)
  };
}
