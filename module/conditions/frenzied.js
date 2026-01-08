/**
 * module/conditions/frenzied.js
 *
 * Chapter 5: Frenzied condition automation.
 *
 * RAW Summary (Phase 1 - Implemented):
 *  - +3 Wound Threshold
 *  - +1 Strength Bonus
 *  - +1 Stamina Points (can exceed max)
 *  - -20 penalty to non-physical skill tests (excludes STR/AGI/END)
 *  - Immune to passive wound penalties
 *  - Immune to stunned condition
 *  - On combat end or voluntary exit: lose 2 SP (cannot kill)
 *  - Can test Willpower (-20) as Secondary Action to end
 *
 * RAW Summary (Phase 2 - Deferred):
 *  - Must use All-Out Attacks only
 *  - Must attack nearest enemy
 *  - Cannot flee
 *
 * Talent Modifiers:
 *  - Berserker: SP loss 2 → 1
 *  - Controlled Anger: No SP loss, halve skill penalty (-10 instead of -20)
 *  - 'Tis But a Scratch: Double WT bonus (+6), ignore Crippled/Lost Limb
 *  - Rage-fueled Frenzy: Double SB/SP bonuses (+2 SB, +2 SP)
 */

import { hasCondition } from "./condition-engine.js";
import { requestCreateEmbeddedDocuments, requestDeleteEmbeddedDocuments, requestUpdateDocument } from "../helpers/authority-proxy.js";

const FLAG_SCOPE = "uesrpg-3ev4";
const FLAG_PATH = `flags.${FLAG_SCOPE}`;
const CONDITION_KEY = "frenzied";

let _registered = false;

/** @type {Map<string, {combatId: string|null}>} */
const _actorCombatState = new Map();

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

function _effectsOf(actor) {
  return Array.isArray(actor?.effects) ? Array.from(actor.effects) : [];
}

function _normKey(k) {
  return String(k ?? "").trim().toLowerCase();
}

function _isFrenziedEffect(effect) {
  if (!effect) return false;
  
  const k = _normKey(effect?.getFlag?.(FLAG_SCOPE, "condition")?.key ?? effect?.flags?.[FLAG_SCOPE]?.condition?.key);
  if (k === CONDITION_KEY) return true;

  const coreId = _normKey(effect?.getFlag?.("core", "statusId") ?? effect?.flags?.core?.statusId);
  if (coreId === CONDITION_KEY) return true;

  try {
    if (effect.statuses && typeof effect.statuses?.has === "function" && effect.statuses.has(CONDITION_KEY)) return true;
  } catch (_err) {}

  const nm = _normKey(effect.name);
  return nm.startsWith(CONDITION_KEY) || nm === "frenzied";
}

async function _dedup(actor) {
  const effects = _effectsOf(actor).filter(_isFrenziedEffect);
  if (effects.length <= 1) return effects[0] ?? null;

  // Keep the first, delete the rest
  const keep = effects[0];
  const deleteIds = effects.slice(1).map(e => e.id).filter(Boolean);
  if (deleteIds.length) {
    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", deleteIds);
    } catch (err) {
      console.warn("UESRPG | Frenzied | dedup failed", err);
    }
  }
  return keep;
}

//------------------------------------------------------------------------------
// Talent Detection
//------------------------------------------------------------------------------

function _hasTalent(actor, talentName) {
  if (!actor?.items) return false;
  const norm = _normKey(talentName);
  return actor.items.some(i => i.type === "talent" && _normKey(i.name) === norm);
}

function _getTalentModifiers(actor) {
  const hasBerserker = _hasTalent(actor, "berserker");
  const hasControlled = _hasTalent(actor, "controlled anger");
  const hasTisScratch = _hasTalent(actor, "'tis but a scratch");
  const hasRageFueled = _hasTalent(actor, "rage-fueled frenzy");

  // Base values
  let wtBonus = 3;
  let sbBonus = 1;
  let spBonus = 1;
  let skillPenalty = -20;
  let spLossOnEnd = 2;

  // Controlled Anger: halve skill penalty, no SP loss
  if (hasControlled) {
    skillPenalty = -10;
    spLossOnEnd = 0;
  } else if (hasBerserker) {
    // Berserker (without Controlled): SP loss 2 → 1
    spLossOnEnd = 1;
  }

  // 'Tis But a Scratch: double WT bonus
  if (hasTisScratch) {
    wtBonus = 6;
  }

  // Rage-fueled Frenzy: double SB and SP bonuses
  if (hasRageFueled) {
    sbBonus = 2;
    spBonus = 2;
  }

  return { wtBonus, sbBonus, spBonus, skillPenalty, spLossOnEnd };
}

//------------------------------------------------------------------------------
// Active Effect Changes
//------------------------------------------------------------------------------

function _mkFrenziedChanges(actor) {
  const mods = _getTalentModifiers(actor);
  
  return [
    // +WT
    // Using system.modifiers.wound_threshold.value as per condition-engine.js (bleeding)
    { key: "system.modifiers.wound_threshold.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: mods.wtBonus, priority: 20 },
    
    // +SB (Strength Bonus contributes to damage)
    { key: "system.characteristics.str.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: mods.sbBonus, priority: 20 },
    
    // NOTE: SP bonus is applied immediately on application (not via Active Effect)
    // to ensure it can exceed max and is properly tracked
    
    // Skill penalty (non-physical tests)
    // NOTE: This is a blanket penalty; skill-tn.js must check if skill is STR/AGI/END-based and exempt it
    { key: "system.modifiers.skills.frenziedPenalty", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: mods.skillPenalty, priority: 20 },
    
    // Suppress passive wound penalty
    { key: "system.woundPenalty", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 0, priority: 30 }
  ];
}

//------------------------------------------------------------------------------
// Public API
//------------------------------------------------------------------------------

/**
 * Apply Frenzied condition to an actor.
 * Replaces any existing Frenzied effect (does not stack).
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {string} options.source - Source description
 * @param {boolean} options.voluntary - Whether entered voluntarily (affects talent interactions)
 */
export async function applyFrenzied(actor, { source = "Frenzied", voluntary = false } = {}) {
  if (!actor) return null;

  // Deduplicate first
  const existing = await _dedup(actor);
  
  // If already frenzied, just update the flag
  if (existing) {
    await requestUpdateDocument(existing, {
      [`${FLAG_PATH}.condition.voluntary`]: voluntary,
      [`${FLAG_PATH}.condition.source`]: source
    });
    return existing;
  }

  // Track combat association
  const combat = game.combat;
  if (combat?.id) {
    _actorCombatState.set(actor.uuid, { combatId: combat.id });
  }

  // Create effect
  const effectData = {
    name: "Frenzied",
    icon: "icons/svg/terror.svg",
    disabled: false,
    flags: {
      core: { statusId: CONDITION_KEY },
      [FLAG_SCOPE]: {
        condition: {
          key: CONDITION_KEY,
          source,
          voluntary
        }
      }
    },
    origin: null,
    duration: {},
    changes: _mkFrenziedChanges(actor)
  };

  try {
    const created = await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [effectData]);
    
    // RAW: Gain +1 SP immediately (can exceed max)
    const mods = _getTalentModifiers(actor);
    const currentSP = Number(actor.system?.stamina?.value ?? 0);
    const newSP = currentSP + mods.spBonus; // Can exceed max per RAW
    
    await requestUpdateDocument(actor, { "system.stamina.value": newSP });
    
    // FIX: Force immediate effect application
    actor.prepareData();
    
    ui.notifications.info(`${actor.name} gains ${mods.spBonus} Stamina Point${mods.spBonus > 1 ? 's' : ''} from Frenzy!`);
    
    return created?.[0] ?? null;
  } catch (err) {
    console.warn("UESRPG | Frenzied | failed to create effect", err);
    return null;
  }
}

/**
 * Remove Frenzied condition and apply SP loss.
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {boolean} options.applySPLoss - Whether to apply SP loss (default: true)
 */
export async function removeFrenzied(actor, { applySPLoss = true } = {}) {
  if (!actor) return;

  const effect = await _dedup(actor);
  if (!effect) return;

  // Apply SP loss before removing effect
  if (applySPLoss) {
    const mods = _getTalentModifiers(actor);
    const spLoss = mods.spLossOnEnd;
    
    if (spLoss > 0) {
      const currentSP = Number(actor.system?.stamina?.value ?? 0);
      // RAW: SP loss "cannot kill them" - minimum 1 SP remains
      const newSP = Math.max(1, currentSP - spLoss);
      
      try {
        await requestUpdateDocument(actor, { "system.stamina.value": newSP });
        
        // Chat notification with RAW text
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="uesrpg-condition-card" style="padding:8px; border:1px solid rgba(0,0,0,0.2); background:rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 8px 0;">Frenzy Ended: ${actor.name}</h3>
            <p style="margin:4px 0;"><b>Lost ${spLoss} Stamina Point${spLoss > 1 ? 's' : ''}</b> (now ${newSP} SP).</p>
            <hr style="margin:8px 0; border:none; border-top:1px solid rgba(0,0,0,0.2);">
            <p style="margin:4px 0; opacity:0.9;"><b>RAW:</b> Once the encounter has ended, the character snaps out of their frenzied state and loses 2 SP (this cannot kill them).</p>
            <p style="margin:4px 0; opacity:0.9;">The character can also <b>test Willpower at -20</b> as a Secondary Action during combat to attempt to snap out of frenzy, which ends the condition.</p>
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
      } catch (err) {
        console.warn("UESRPG | Frenzied | SP loss failed", err);
      }
    }
  }

  // Remove effect
  try {
    await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [effect.id]);
    
    // FIX: Force immediate recalculation
    actor.prepareData();
    
  } catch (err) {
    console.warn("UESRPG | Frenzied | failed to delete effect", err);
  }

  // Clear combat association
  _actorCombatState.delete(actor.uuid);
}

/**
 * Prompt Willpower test to end Frenzied voluntarily.
 */
export async function promptWillpowerTest(actor) {
  if (!actor) return;
  if (!hasCondition(actor, CONDITION_KEY)) return;

  const wpTotal = Number(actor.system?.characteristics?.wp?.total ?? 0);
  const tn = wpTotal - 20; // -20 penalty per RAW

  const d = new Dialog({
    title: `${actor.name} - End Frenzied`,
    content: `<p><strong>Willpower Test (-20):</strong> Roll d100 ≤ ${tn} to end Frenzied.</p>`,
    buttons: {
      roll: {
        label: "Roll",
        callback: async () => {
          const roll = await new Roll("1d100").evaluate({ async: true });
          const success = roll.total <= tn;

          await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div style="padding:6px;">
              <strong>Willpower Test to End Frenzied:</strong><br>
              TN: ${tn} | Roll: ${roll.total} | ${success ? "<strong>Success!</strong>" : "Failure"}
            </div>`,
            rolls: [roll]
          });

          if (success) {
            await removeFrenzied(actor);
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll"
  });

  d.render(true);
}

//------------------------------------------------------------------------------
// Hooks
//------------------------------------------------------------------------------

export function registerFrenzied() {
  if (_registered) return;
  _registered = true;

  // Combat end: remove Frenzied from all participants (GM-only)
  Hooks.on("deleteCombat", async (combat, options, userId) => {
    if (game?.user?.isGM !== true) return;
    if (game.user.id !== userId) return;

    for (const c of (combat.combatants ?? [])) {
      const actor = c?.actor;
      if (!actor) continue;
      if (!hasCondition(actor, CONDITION_KEY)) continue;

      const state = _actorCombatState.get(actor.uuid);
      if (state?.combatId === combat.id) {
        await removeFrenzied(actor);
      }
    }
  });
}

export const FrenziedAPI = {
  applyFrenzied,
  removeFrenzied,
  promptWillpowerTest
};
