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
import { requestCreateEmbeddedDocuments, requestDeleteEmbeddedDocuments, requestUpdateDocument } from "../../utils/authority-proxy.js";

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

/**
 * Generate the Active Effect changes array for Frenzied condition.
 * Exported for use by actor repair mechanism.
 * 
 * @param {Actor} actor
 * @returns {Array<{key: string, mode: number, value: string, priority: number}>}
 */
export function _mkFrenziedChanges(actor) {
  const mods = _getTalentModifiers(actor);
  
  // Ensure values are properly formatted (Foundry expects strings for AE changes)
  return [
    // +WT
    // Using system.modifiers.wound_threshold.value as per condition-engine.js (bleeding)
    { 
      key: "system.modifiers.wound_threshold.value", 
      mode: CONST.ACTIVE_EFFECT_MODES.ADD, 
      value: String(mods.wtBonus), 
      priority: 20 
    },
    
    // +SB (Strength Bonus contributes to damage)
    { 
      key: "system.characteristics.str.bonus", 
      mode: CONST.ACTIVE_EFFECT_MODES.ADD, 
      value: String(mods.sbBonus), 
      priority: 20 
    },
    
    // NOTE: SP bonus is applied immediately on application (not via Active Effect)
    // to ensure it can exceed max and is properly tracked
    
    // Skill penalty (non-physical tests)
    // NOTE: This is a blanket penalty; skill-tn.js must check if skill is STR/AGI/END-based and exempt it
    { 
      key: "system.modifiers.skills.frenziedPenalty", 
      mode: CONST.ACTIVE_EFFECT_MODES.ADD, 
      value: String(mods.skillPenalty), 
      priority: 20 
    },
    
    // Suppress passive wound penalty
    { 
      key: "system.woundPenalty", 
      mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, 
      value: "0", 
      priority: 30 
    }
  ];
}

//------------------------------------------------------------------------------
// Effect Repair Hook
//------------------------------------------------------------------------------

/**
 * Register a hook to repair Frenzied effects that have empty changes arrays.
 * This ensures effects created before fixes are applied get their changes populated.
 */
function _registerFrenziedRepairHook() {
  if (game.uesrpg?._frenziedRepairHookRegistered) return;
  if (!game.uesrpg) game.uesrpg = {};
  game.uesrpg._frenziedRepairHookRegistered = true;

  Hooks.on("updateActiveEffect", async (effect, data, options, userId) => {
    try {
      // Only process Frenzied effects
      const isFrenzied = effect?.flags?.[FLAG_SCOPE]?.condition?.key === CONDITION_KEY ||
                         effect?.flags?.core?.statusId === CONDITION_KEY;
      if (!isFrenzied) return;

      // Check if changes are missing or empty
      const currentChanges = Array.isArray(effect.changes) ? effect.changes : [];
      if (currentChanges.length === 0) {
        const actor = effect.parent;
        if (!actor || !actor.system) return;

        // Defer to avoid timing issues during prepareData
        // Use a longer delay to ensure actor data is fully prepared
        setTimeout(async () => {
          try {
            // Double-check actor is still valid
            const refreshedActor = game.actors.get(actor.id);
            if (!refreshedActor || !refreshedActor.system) {
              console.debug("UESRPG | Frenzied | Actor no longer valid for repair", { actorId: actor.id });
              return;
            }

            const refreshedEffect = refreshedActor.effects.get(effect.id);
            if (!refreshedEffect) {
              console.debug("UESRPG | Frenzied | Effect no longer exists", { effectId: effect.id });
              return;
            }

            // Check again if changes are still empty
            const stillEmpty = !Array.isArray(refreshedEffect.changes) || refreshedEffect.changes.length === 0;
            if (!stillEmpty) {
              console.debug("UESRPG | Frenzied | Effect already has changes, skipping repair", { effectId: effect.id });
              return;
            }

            console.warn("UESRPG | Frenzied | Repairing effect with missing changes", { 
              effectId: effect.id,
              actor: refreshedActor.name 
            });

            const changes = _mkFrenziedChanges(refreshedActor);
            const changesToApply = changes.map(c => ({
              key: String(c.key ?? ""),
              mode: Number(c.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
              value: String(c.value ?? ""),
              priority: Number(c.priority ?? 20)
            }));

            if (changesToApply.length > 0) {
              await refreshedEffect.update({ changes: changesToApply }, { diff: false });
              console.log("UESRPG | Frenzied | Effect repaired with changes", { 
                effectId: effect.id,
                changesCount: changesToApply.length 
              });
            }
          } catch (err) {
            console.warn("UESRPG | Frenzied | Repair failed", { effectId: effect.id, err });
          }
        }, 200);
      }
    } catch (err) {
      // Silently fail - repair is non-critical
      console.debug("UESRPG | Frenzied | Repair hook error", err);
    }
  });
}

// Register the repair hook on ready
Hooks.once("ready", () => {
  _registerFrenziedRepairHook();
});

// Register a preCreateActiveEffect hook to inject changes if they're missing
// This MUST run BEFORE condition-automation.js hook (which returns early for frenzied)
// Use a high priority to ensure it runs first
function _registerFrenziedPreCreateHook() {
  if (game.uesrpg?._frenziedPreCreateHookRegistered) return;
  if (!game.uesrpg) game.uesrpg = {};
  game.uesrpg._frenziedPreCreateHookRegistered = true;

  // Use a high priority number to run before other hooks
  Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
    try {
      // Only process for the creating user
      if (game.userId !== userId) return;
      
      const parent = effect?.parent ?? options?.parent ?? null;
      if (!parent || parent.documentName !== "Actor") return;
      
      // Check if this is a Frenzied effect by multiple methods
      const key1 = data?.flags?.[FLAG_SCOPE]?.condition?.key;
      const key2 = data?.flags?.core?.statusId;
      const key3 = data?.statuses?.[0] ?? (Array.isArray(data?.statuses) ? data.statuses[0] : null);
      
      const isFrenzied = _normKey(key1) === CONDITION_KEY || 
                         _normKey(key2) === CONDITION_KEY ||
                         _normKey(key3) === CONDITION_KEY;
      
      if (!isFrenzied) return;
      
      // If changes are missing or empty, inject them
      const currentChanges = Array.isArray(data?.changes) ? data.changes : [];
      if (currentChanges.length === 0) {
        const changes = _mkFrenziedChanges(parent);
        const changesToApply = changes.map(c => ({
          key: String(c.key ?? ""),
          mode: Number(c.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
          value: String(c.value ?? ""),
          priority: Number(c.priority ?? 20)
        }));
        
        // Inject changes into the create data
        data.changes = changesToApply;
        
        // Also ensure flags are set correctly
        if (!data.flags) data.flags = {};
        if (!data.flags.core) data.flags.core = {};
        if (!data.flags[FLAG_SCOPE]) data.flags[FLAG_SCOPE] = {};
        data.flags.core.statusId = CONDITION_KEY;
        data.flags[FLAG_SCOPE].condition = {
          key: CONDITION_KEY,
          source: data.flags[FLAG_SCOPE]?.condition?.source ?? "Frenzied",
          voluntary: data.flags[FLAG_SCOPE]?.condition?.voluntary ?? false
        };
        data.flags[FLAG_SCOPE].owner = "system";
        data.flags[FLAG_SCOPE].effectGroup = `condition.${CONDITION_KEY}`;
        data.flags[FLAG_SCOPE].stackRule = "override";
        data.flags[FLAG_SCOPE].source = "condition";
        
        console.log("UESRPG | Frenzied | Injected changes via preCreateActiveEffect hook", {
          actor: parent.name,
          changesCount: changesToApply.length,
          changes: changesToApply.map(c => ({ key: c.key, value: c.value }))
        });
      }
    } catch (err) {
      console.warn("UESRPG | Frenzied | preCreateActiveEffect hook error", err);
    }
  }, { once: false });
}

// Register on init to ensure it runs early
Hooks.once("init", () => {
  _registerFrenziedPreCreateHook();
  
  // Also register createActiveEffect hook to immediately fix missing changes
  Hooks.on("createActiveEffect", async (effect, options, userId) => {
    try {
      // Only process for the creating user
      if (game.userId !== userId) return;
      
      const actor = effect.parent;
      if (!actor || actor.documentName !== "Actor") return;
      
      // Check if this is a Frenzied effect
      const isFrenzied = effect?.flags?.[FLAG_SCOPE]?.condition?.key === CONDITION_KEY ||
                         effect?.flags?.core?.statusId === CONDITION_KEY;
      if (!isFrenzied) return;
      
      // Check if changes are missing
      const currentChanges = Array.isArray(effect.changes) ? effect.changes : [];
      if (currentChanges.length === 0) {
        // Immediately update with changes
        const changes = _mkFrenziedChanges(actor);
        const changesToApply = changes.map(c => ({
          key: String(c.key ?? ""),
          mode: Number(c.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
          value: String(c.value ?? ""),
          priority: Number(c.priority ?? 20)
        }));
        
        if (changesToApply.length > 0) {
          await effect.update({ changes: changesToApply }, { diff: false });
          console.log("UESRPG | Frenzied | Fixed missing changes immediately after creation", {
            effectId: effect.id,
            actor: actor.name,
            changesCount: changesToApply.length
          });
        }
      }
    } catch (err) {
      console.warn("UESRPG | Frenzied | createActiveEffect hook error", err);
    }
  });
});

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
  
  // If already frenzied, ensure it has changes and update flags
  if (existing) {
    const existingChanges = Array.isArray(existing.changes) ? existing.changes : [];
    
    // If changes are missing, add them
    if (existingChanges.length === 0) {
      const changes = _mkFrenziedChanges(actor);
      const changesToApply = changes.map(c => ({
        key: String(c.key ?? ""),
        mode: Number(c.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
        value: String(c.value ?? ""),
        priority: Number(c.priority ?? 20)
      }));
      
      await requestUpdateDocument(existing, {
        changes: changesToApply,
        [`${FLAG_PATH}.condition.voluntary`]: voluntary,
        [`${FLAG_PATH}.condition.source`]: source
      });
      console.log("UESRPG | Frenzied | Updated existing effect with missing changes", { 
        effectId: existing.id,
        changesCount: changesToApply.length 
      });
    } else {
      // Just update flags if changes already exist
      await requestUpdateDocument(existing, {
        [`${FLAG_PATH}.condition.voluntary`]: voluntary,
        [`${FLAG_PATH}.condition.source`]: source
      });
    }
    return existing;
  }

  // Track combat association
  const combat = game.combat;
  if (combat?.id) {
    _actorCombatState.set(actor.uuid, { combatId: combat.id });
  }

  // Create effect with dynamic changes based on actor's talents
  const mods = _getTalentModifiers(actor);
  const changes = _mkFrenziedChanges(actor);
  
  // Ensure changes array is properly formatted
  if (!Array.isArray(changes) || changes.length === 0) {
    console.warn("UESRPG | Frenzied | No changes generated", { actor: actor.name, mods });
  }

  // Deep clone changes to avoid any reference issues
  const changesToApply = changes.map(c => ({
    key: String(c.key ?? ""),
    mode: Number(c.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
    value: String(c.value ?? ""),
    priority: Number(c.priority ?? 20)
  }));

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
        },
        owner: "system",
        effectGroup: `condition.${CONDITION_KEY}`,
        stackRule: "override",
        source: "condition"
      }
    },
    origin: null,
    duration: {},
    changes: changesToApply  // Use cloned changes
  };

  try {
    // Ensure changes are properly formatted before creation
    if (!Array.isArray(changesToApply) || changesToApply.length === 0) {
      console.error("UESRPG | Frenzied | No changes generated", { actor: actor.name, mods, changes, changesToApply });
      return null;
    }
    
    // Log changes for debugging
    console.log("UESRPG | Frenzied | Creating effect with changes", { 
      actor: actor.name, 
      changesCount: changesToApply.length,
      changes: changesToApply.map(c => ({ key: c.key, mode: c.mode, value: c.value }))
    });
    
    // Ensure changes are in the effectData before creation
    effectData.changes = changesToApply;
    
    // Final verification before creation
    if (!Array.isArray(effectData.changes) || effectData.changes.length === 0) {
      console.error("UESRPG | Frenzied | CRITICAL: effectData.changes is empty before creation!", {
        actor: actor.name,
        effectData: JSON.stringify(effectData, null, 2),
        changesToApply
      });
      return null;
    }

    console.log("UESRPG | Frenzied | About to create effect", {
      actor: actor.name,
      changesInEffectData: effectData.changes.length,
      changesPreview: effectData.changes.map(c => ({ key: c.key, value: c.value }))
    });

    const created = await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [effectData]);
    
    // Verify changes were applied
    const createdEffect = created?.[0];
    if (createdEffect) {
      const appliedChanges = Array.isArray(createdEffect.changes) ? createdEffect.changes : [];
      
      if (appliedChanges.length === 0) {
        console.warn("UESRPG | Frenzied | Effect created but changes are empty - repair hook will fix", { 
          effectId: createdEffect.id,
          expectedChanges: changesToApply.length
        });
        // The repair hook will handle this on the next update cycle
      } else {
        console.log("UESRPG | Frenzied | Effect created successfully with changes", { 
          effectId: createdEffect.id,
          changesCount: appliedChanges.length
        });
      }
    } else {
      console.error("UESRPG | Frenzied | No effect was created", { created, effectData });
    }
    
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
 * @param {string} options.reason - Reason for ending: "encounter" (encounter ended) or "snapped" (Willpower test success)
 */
export async function removeFrenzied(actor, { applySPLoss = true, reason = "encounter" } = {}) {
  if (!actor) return;

  const effect = await _dedup(actor);
  if (!effect) return;

  // Apply SP loss before removing effect
  if (applySPLoss && reason === "encounter") {
    const mods = _getTalentModifiers(actor);
    const spLoss = mods.spLossOnEnd;
    
    if (spLoss > 0) {
      const currentSP = Number(actor.system?.stamina?.value ?? 0);
      // RAW: SP loss "cannot kill them" - minimum 1 SP remains
      const newSP = Math.max(1, currentSP - spLoss);
      
      try {
        await requestUpdateDocument(actor, { "system.stamina.value": newSP });
        
        // Chat notification for encounter end (with SP loss)
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="uesrpg-condition-card" style="padding:8px; border:1px solid rgba(200,0,0,0.3); background:rgba(200,0,0,0.05);">
            <h3 style="margin:0 0 8px 0; color:rgba(200,0,0,0.9);">Frenzy Ended: ${actor.name}</h3>
            <p style="margin:4px 0;"><b>Encounter ended - Lost ${spLoss} Stamina Point${spLoss > 1 ? 's' : ''}</b> (now ${newSP} SP).</p>
            <hr style="margin:8px 0; border:none; border-top:1px solid rgba(0,0,0,0.2);">
            <p style="margin:4px 0; opacity:0.9;"><b>RAW:</b> Once the encounter has ended, the character snaps out of their frenzied state and loses 2 SP (this cannot kill them).</p>
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
      } catch (err) {
        console.warn("UESRPG | Frenzied | SP loss failed", err);
      }
    }
  } else if (reason === "snapped") {
    // Chat notification for Willpower test success (no SP loss)
    try {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="uesrpg-condition-card" style="padding:8px; border:1px solid rgba(0,150,0,0.3); background:rgba(0,150,0,0.05);">
          <h3 style="margin:0 0 8px 0; color:rgba(0,150,0,0.9);">Frenzy Ended: ${actor.name}</h3>
          <p style="margin:4px 0;"><b>Snapped out via Willpower test - No Stamina loss.</b></p>
          <hr style="margin:8px 0; border:none; border-top:1px solid rgba(0,0,0,0.2);">
          <p style="margin:4px 0; opacity:0.9;"><b>RAW:</b> The character can test Willpower at -20 as a Secondary Action during combat to attempt to snap out of frenzy, which ends the condition without SP loss.</p>
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
      });
    } catch (err) {
      console.warn("UESRPG | Frenzied | chat message failed", err);
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
            await removeFrenzied(actor, { applySPLoss: false, reason: "snapped" });
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
