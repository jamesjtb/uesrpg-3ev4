/**
 * module/skills/skill-tn.js
 *
 * Skill TN computation for UESRPG 3ev4 (Foundry v13.351).
 *
 * Design:
 *  - Deterministic TN computation with an explicit breakdown (for debug / UI).
 *  - Does not mutate documents.
 */

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

function _isCombatStyle(skillItem) {
  return (skillItem?.type === "combatStyle") || /combat style/i.test(String(skillItem?.name || ""));
}

export function computeSkillTN({
  actor,
  skillItem,
  difficultyKey = "average",
  manualMod = 0,
  useSpecialization = false
} = {}) {
  // Derive item-based skill bonuses from equipped items that use the legacy `system.skillArray` format.
  // This allows the chat card breakdown to attribute bonuses to specific items.
  const skillName = String(skillItem?.name ?? "").trim();
  const itemBonuses = [];
  if (actor && skillName) {
    for (const item of actor.items ?? []) {
      const sys = item?.system;
      if (!sys?.equipped) continue;
      if (!Array.isArray(sys.skillArray) || sys.skillArray.length === 0) continue;
      const match = sys.skillArray.find(e => String(e?.name ?? "").trim() === skillName);
      const v = _asNumber(match?.value);
      if (!v) continue;
      itemBonuses.push({ itemName: item.name, value: v });
    }
  }

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
    difficultyKey,
    manualMod,
    useSpecialization
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
  difficultyKey = "average",
  manualMod = 0,
  useSpecialization = false
} = {}) {
  const breakdown = [];

  const baseSkill = _asNumber(skill?.system?.value);
  breakdown.push({ label: "Base Skill", value: baseSkill, source: "base" });

  // Skill-linked item automation.
  // Preferred (document-aware path): explicit per-item modifiers are supplied by computeSkillTN.
  // Fallback: use the legacy aggregated delta in actor.system.professions (older data paths).
  if (Array.isArray(itemBonuses) && itemBonuses.length) {
    for (const b of itemBonuses) {
      const v = _asNumber(b?.value);
      if (!v) continue;
      const itemName = String(b?.itemName ?? "").trim();
      const label = itemName ? `Item Bonus: ${itemName}` : "Item Bonus";
      breakdown.push({ label, value: v, source: "itemBonus" });
    }
  } else {
    const profName = String(skill?.name ?? "").trim();
    const profValue = profName ? _asNumber(actorSystem?.professions?.[profName]) : 0;
    const itemDelta = (profValue && Number.isFinite(profValue)) ? (profValue - baseSkill) : 0;
    if (itemDelta) breakdown.push({ label: "Item Bonus", value: itemDelta, source: "itemBonus" });
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

  // Difficulty (RAW Chapter 1)
  const diff = getDifficultyByKey(difficultyKey);
  if (diff?.mod) breakdown.push({ label: `Difficulty: ${diff.label}`, value: diff.mod, source: "difficulty" });

  // Specialization (RAW Chapter 3): +10 when applicable.
  const specBonus = useSpecialization ? 10 : 0;
  if (specBonus) breakdown.push({ label: "Specialization", value: specBonus, source: "specialization" });

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
