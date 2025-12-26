/**
 * module/dev/skill-tn-debug.js
 *
 * GM-only developer utility for inspecting Skill TN computation.
 *
 * This module does not modify any documents.
 * It is only exposed when the client setting "Debug: Skill TN Macro" is enabled.
 */

import { computeSkillTN } from "../skills/skill-tn.js";

function _resolveActorFromContext(explicitActor) {
  if (explicitActor) return explicitActor;
  const token = canvas?.tokens?.controlled?.[0];
  if (token?.actor) return token.actor;
  if (game.user?.character) return game.user.character;
  return null;
}

function _findSkill(actor, skillRef) {
  if (!actor) return null;
  if (!skillRef) return null;

  const ref = String(skillRef).trim();
  // UUID reference
  const byUuid = actor.items.get(ref) ?? actor.items.find(i => i.uuid === ref);
  if (byUuid) return byUuid;

  // Name reference (case-insensitive)
  const lower = ref.toLowerCase();
  return actor.items.find(i => String(i.name || "").toLowerCase() === lower) ?? null;
}

/**
 * Register a global debug helper.
 *
 * Usage (macro console):
 *   await game.uesrpg.debugSkillTN({ skill: "Acrobatics" })
 *   await game.uesrpg.debugSkillTN({ skill: "Acrobatics", difficultyKey: "hard", manualMod: -20, useSpec: true })
 */
export function registerSkillTNDebug() {
  // Ensure namespace
  game.uesrpg = game.uesrpg || {};

  game.uesrpg.debugSkillTN = async function debugSkillTN({
    actor = null,
    skill = null,
    difficultyKey = "average",
    manualMod = 0,
    useSpec = false
  } = {}) {
    const a = _resolveActorFromContext(actor);
    if (!a) {
      ui.notifications.warn("Skill TN Debug: no actor found (select a token or pass {actor}).");
      return null;
    }
    const skillItem = _findSkill(a, skill);
    if (!skillItem) {
      ui.notifications.warn("Skill TN Debug: skill not found on actor.");
      return null;
    }

    const tn = computeSkillTN({
      actor: a,
      skillItem,
      difficultyKey,
      manualMod,
      useSpecialization: Boolean(useSpec)
    });

    const governing = String(skillItem.system?.governingCha || skillItem.system?.baseCha || "").trim();
    const mobility = a.system?.mobility ?? {};

    // Console-friendly output
    console.groupCollapsed(`uesrpg-3ev4 | Skill TN Debug | ${a.name} | ${skillItem.name}`);
    console.log("Skill:", skillItem.name);
    console.log("Governing:", governing || "(none)");
    console.log("Mobility:", {
      armorWeightClass: mobility.armorWeightClass,
      agilityTestPenalty: mobility.agilityTestPenalty,
      allTestPenalty: mobility.allTestPenalty,
      skillTestPenalties: mobility.skillTestPenalties
    });
    console.log("Difficulty:", difficultyKey);
    console.log("Manual Mod:", manualMod);
    console.log("Specialization:", Boolean(useSpec));
    console.log("Final TN:", tn.finalTN);
    console.table((tn.breakdown || []).map(b => ({ label: b.label, value: b.value, source: b.source })));
    console.groupEnd();

    ui.notifications.info(`Skill TN Debug: ${a.name} — ${skillItem.name} TN ${tn.finalTN}`);
    return tn;
  };
}
