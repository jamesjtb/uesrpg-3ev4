import { UESRPG } from "../constants.js";
import { SimpleActor } from "../entities/actor.js";
import { npcSheet } from "../sheets/npc-sheet.js";
import { SimpleActorSheet } from "../sheets/actor-sheet.js";
import { SimpleItem } from "../entities/item.js";
import { SimpleItemSheet } from "../sheets/item-sheet.js";
import { SystemCombat } from "../entities/combat.js";
import { initializeChatHandlers, registerCombatChatHooks } from "../combat/chat-handlers.js";
import { registerSkillTNDebug } from "../dev/skill-tn-debug.js";
import { registerActorSelectDebug } from "../dev/actor-select-debug.js";
import { registerDebugSettingsMenu } from "../dev/debug-settings.js";
import { registerOpposedDiagnostics } from "../dev/opposed-diagnostics.js";
import { registerConditions } from "../conditions/index.js";
import { registerWounds } from "../wounds/index.js";
import { applyDamage, applyHealing, DAMAGE_TYPES } from "../combat/damage-automation.js";
import { applyDamageResolved } from "../combat/damage-resolver.js";
import { registerChatMessageSocket } from "../helpers/chat-message-socket.js";
import { registerActiveEffectProxy } from "../helpers/active-effect-proxy.js";

/**
 * Preload Handlebars partials used by system sheets.
 *
 * Foundry requires partial templates to be loaded before they can be referenced via {{> }}.
 */
async function preloadHandlebarsTemplates() {
  const templatePaths = [
    "systems/uesrpg-3ev4/templates/partials/sheets/fixed-header.hbs",
  ];

  try {
    // Foundry v13: use the namespaced template loader.
    // Avoid touching the deprecated global loadTemplates to keep the console clean.
    const loader = foundry?.applications?.handlebars?.loadTemplates;
    if (typeof loader !== "function") {
      throw new Error("foundry.applications.handlebars.loadTemplates is not available");
    }
    await loader(templatePaths);
  } catch (err) {
    console.error("UESRPG | Failed to preload Handlebars templates", err);
  }
}

async function registerSettings() {
  // Register system settings
  function delayedReload() {
    window.setTimeout(() => location.reload(), 500);
  }
  
  game.settings.register("uesrpg-3ev4", "changeUiFont", {
    name: "System Font",
    hint: "Changes main Font",
    scope: "world",
    requiresReload: true,
    config: true,
    default: false,
    type: String,
    choices: {
      "Cyrodiil": "Сyrodiil - Default",
      "Magic-Cyr": "Magic-Cyr"
    },
    default: "Cyrodiil"
  });

  game.settings.register("uesrpg-3ev4", "legacyUntrainedPenalty", {
    name: "v3 Untrained Penalty",
    hint: "Checking this option enables the UESRPG v3 penalty for Untrained skills at -10 instead of the standard -20.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: delayedReload,
  });

  game.settings.register("uesrpg-3ev4", "noStartUpDialog", {
    name: "Do Not Show Dialog on Startup",
    hint: "Checking this box hides the startup popup dialog informing the user on additional game resources.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register("uesrpg-3ev4", "automateMagicka", {
    name: "Automate Magicka Cost",
    hint: "Automatically deduct the cost of a spell after cost calculation from the token/character's current magicka.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: delayedReload,
  });

  game.settings.register("uesrpg-3ev4", "actionPointAutomation", {
    name: "Action Point Automation",
    hint: "Round-Based: AP is set to max at the start of each round. Turn-Based: Ap is set to max at the start of each turn, except the first round in which all combatants start with max AP. None: No automation.",
    scope: "world",
    config: true,
    type: String,
    default: "round",
    choices: {
      round: "Round-Based",
      turn: "Turn-Based",
      none: "None",
    },
  });

  game.settings.register("uesrpg-3ev4", "npcENCPenalty", {
    name: "NPC's Suffer Encumbrance Penalties",
    hint: "If checked, NPC's suffer from the same overencumbrance penalties that player characters do. Otherwise, they suffer no ENC Penalties.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
    onChange: delayedReload,
  });

  game.settings.register("uesrpg-3ev4", "pcENCPenalty", {
    name: "Player Characters Suffer Encumbrance Penalties",
    hint: "If checked, player characters suffer from the same overencumbrance penalties as written in the Rules Compendium. Otherwise, they suffer no ENC Penalties.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
    onChange: delayedReload,
  });

  game.settings.register("uesrpg-3ev4", "sortAlpha", {
    name: "Sort Actor Items Alphabetically",
    hint: "If checked, Actor items are automatically sorted alphabetically. Otherwise, items are not sorted and are organized manually.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
    onChange: delayedReload,
  });

  game.settings.register("uesrpg-3ev4", "autoApplyDamage", {
    name: "Automatically Apply Damage",
    hint: "When enabled, damage from opposed rolls will automatically be applied to the defender. Otherwise, a button will be shown to manually apply damage.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  game.settings.register("uesrpg-3ev4", "useDosBonus", {
    name: "Apply Degree of Success Damage Bonus",
    hint: "When enabled, half of the attacker's Degree of Success is added as bonus damage.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
  });

  // Opposed workflow diagnostics
  game.settings.register("uesrpg-3ev4", "opposedDebug", {
    name: "Opposed Debug Logging",
    hint: "When enabled, the opposed-roll workflow logs detailed diagnostic information to the browser console.",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
  });

  // Authority proxy diagnostics (GM/owner proxy mutations)
  game.settings.register("uesrpg-3ev4", "effectsProxyDebug", {
    name: "Effects/Proxy Debug Logging",
    hint: "When enabled, the authority proxy (ChatMessage updates + target-side ActiveEffect application) logs concise diagnostics to the browser console.",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
  });

  game.settings.register("uesrpg-3ev4", "opposedDebugFormula", {
    name: "Opposed Debug: Formula Normalization",
    hint: "When enabled (testing), logs when a roll formula is normalized or rejected before evaluation.",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
  });

  game.settings.register("uesrpg-3ev4", "opposedShowResolutionDetails", {
    name: "Opposed: Show Resolution Details",
    hint: "When enabled, opposed-roll chat cards include an additional expandable section with detailed resolution data. Recommended for testing; disable for normal play.",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
  });

  // Opposed workflow: bank choices before rolling to reduce meta-game information.
  game.settings.register("uesrpg-3ev4", "opposedBankChoices", {
    name: "Opposed: Bank Choices Before Rolling",
    hint: "When enabled, attacker and defender choices are banked (committed) and the rolls are triggered only after both sides have committed. This reduces meta-game information on opposed chat cards.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
  });


  // Skill roll diagnostics
  game.settings.register("uesrpg-3ev4", "skillRollDebug", {
    name: "Skill Roll Debug Logging",
    hint: "When enabled, skill rolls and skill-opposed workflows log structured diagnostic information to the browser console.",
    scope: "world",
    config: false,
    default: false,
    type: Boolean,
  });


  // Skill roll UI QoL (client-scoped)
  game.settings.register("uesrpg-3ev4", "skillRollLastOptions", {
    name: "Skill Roll: Remember Last Options",
    hint: "Stores the last-used skill roll options (difficulty, manual modifier, specialization toggle, and last selected skill per actor) for this user only.",
    scope: "client",
    config: false,
    type: Object,
    default: {
      difficultyKey: "average",
      manualMod: 0,
      useSpec: false,
      lastSkillUuidByActor: {}
    }
  });

  game.settings.register("uesrpg-3ev4", "skillRollQuickShift", {
    name: "Skill Roll: Shift Quick Roll",
    hint: "When enabled, holding Shift will bypass the roll options dialog and use remembered/default options.",
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("uesrpg-3ev4", "debugSkillTN", {
    name: "Debug: Skill TN Macro",
    hint: "When enabled (GM only), exposes game.uesrpg.debugSkillTN(...) for diagnosing skill TN computation.",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: delayedReload
  });


game.settings.register("uesrpg-3ev4", "debugAim", {
  name: "Aim: Debug Audit Logging",
  hint: "When enabled, logs Aim apply/stack, break, and consume events to the browser console.",
  scope: "client",
  config: true,
  type: Boolean,
  default: false
});


  // Combat sheet UI: optional Action Economy gating for quick actions
  game.settings.register("uesrpg-3ev4", "enableActionEconomyUI", {
    name: "Combat Sheet: Action Economy UI",
    hint: "When enabled, Combat tab quick action buttons are disabled when the actor has 0 Action Points.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  // Items tab: per-user loadouts (equipment snapshots)
  game.settings.register("uesrpg-3ev4", "enableLoadouts", {
    name: "Sheets: Enable Equipment Loadouts",
    hint: "When enabled, the Items tab shows a per-user Loadout bar (save/apply equipped-state snapshots).",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
  });

  // Client-only diagnostics panel on actor sheets (used for testing)
  game.settings.register("uesrpg-3ev4", "sheetDiagnostics", {
    name: "Debug: Sheet Diagnostics Panel",
    hint: "When enabled, actor sheets show a small diagnostics panel (client only).",
    scope: "client",
    config: false,
    default: false,
    type: Boolean,
  });

  // Register a dedicated Debugging menu to avoid clutter in System Settings.
  registerDebugSettingsMenu();

}

async function registerSheets () {
    // Register sheet application classes
foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);

foundry.documents.collections.Actors.registerSheet("uesrpg-3ev4", SimpleActorSheet, {
  types: ['Player Character'],
  makeDefault: true,
  label: "Default UESRPG Character Sheet",
});
foundry.documents.collections.Items.registerSheet("uesrpg-3ev4", SimpleItemSheet, {
  makeDefault: true,
  label: "Default UESRPG Item Sheet",
});
foundry.documents.collections.Actors.registerSheet("uesrpg-3ev4", npcSheet, {
  types: ["NPC"],
  makeDefault: true,
  label: "Default UESRPG NPC Sheet",
});
}

export default async function initHandler() {

  // DEFAULT_ITEM_AE_TRANSFER_POLICY_V3
  // Default newly created Item Active Effects to transfer=true ("Apply Effect to Actor"), unless explicitly set.
  // We register these hooks once per session.
  if (!game.uesrpg) game.uesrpg = {};

  // Opposed workflow diagnostics helpers (per-client trace ring buffer + console dump utilities)
  // Safe: no schema changes; GM-only dump functions.
  try {
    registerOpposedDiagnostics();
  } catch (err) {
    console.warn("UESRPG | Failed to register opposed diagnostics", err);
  }

// COMBAT_API_EXPORTS_V1
// Provide stable access points for macros and downstream system automation without relying on dynamic imports.
// This avoids incorrect relative import roots (e.g. "/scripts/systems/...") in Foundry macro contexts.
if (!game.uesrpg.combat) game.uesrpg.combat = {};
game.uesrpg.combat.applyDamage = applyDamage;
game.uesrpg.combat.applyDamageResolved = applyDamageResolved;
game.uesrpg.combat.DAMAGE_TYPES = DAMAGE_TYPES;

// Canonical Healing wrapper (Package 5)
// Ensures all healing callers use the unified pipeline (bleeding reduction, forestall, etc.).
game.uesrpg.combat.applyHealing = async (actor, amount, options = {}) => {
  const src = options?.source ?? "Healing";
  return applyHealing(actor, amount, { ...options, source: src });
};

  if (!game.uesrpg._defaultItemAETransferHook) {
    game.uesrpg._defaultItemAETransferHook = true;

    Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
      try {
        if (game.userId !== userId) return;

        const parent = effect?.parent ?? options?.parent ?? null;
        if (!parent || parent.documentName !== "Item") return;

        // Respect explicit setting
        if (data?.transfer !== undefined) return;

        // Ensure we can mutate the pending create data
        if (foundry?.utils?.mergeObject) {
          foundry.utils.mergeObject(data, { transfer: true }, { inplace: true });
        } else {
          data.transfer = true;
        }
      } catch (err) {
        console.error("UESRPG | Default Item AE transfer preCreate failed", err);
      }
    });

    // Fallback: if some creation path bypasses preCreate mutation, enforce immediately after create.
    Hooks.on("createActiveEffect", async (effect, options, userId) => {
      try {
        if (game.userId !== userId) return;
        const parent = effect?.parent;
        if (!parent || parent.documentName !== "Item") return;

        if (effect.transfer) return;
        // Only force if it looks like a default-created effect (no explicit choice).
        await effect.update({ transfer: true });
      } catch (err) {
        console.error("UESRPG | Default Item AE transfer create fallback failed", err);
      }
    });
  }


  // SPELL_EFFECT_APPLICATION_V1
  // Spells do not use Item transfer semantics. Instead, when a spell is marked active, we
  // clone its Item Active Effects onto the owning Actor as embedded ActiveEffects.
  // This is deterministic, reversible, and aligns with future targeting work (self/target/area).
  //
  // - Activation flag: flags.uesrpg.activeSpell (on the Item)
  // - Applied actor effects are tagged: flags.uesrpg.appliedFromSpell = <item.uuid>
  // - On deactivation or deletion: tagged effects are removed.
  if (!game.uesrpg._spellEffectApplicationHook) {
    game.uesrpg._spellEffectApplicationHook = true;

    const FLAG_SCOPE = game.system?.id ?? "uesrpg-3ev4";


    const reconcileSpellEffects = async (item) => {
      try {
        if (!item || item.type !== "spell") return;
        const actor = item.parent;
        if (!actor || actor.documentName !== "Actor") return;
        const active = (item.getFlag?.(FLAG_SCOPE, "activeSpell") ?? foundry.utils.getProperty(item, `flags.${FLAG_SCOPE}.activeSpell`) ?? false) === true;
        const spellUuid = item.uuid;

        // Remove previously applied effects for this spell (idempotent).
        const existing = (actor.effects ?? []).filter(e => {
          const f = e?.flags ?? {};
          return f?.[FLAG_SCOPE]?.appliedFromSpell === spellUuid || f?.uesrpg?.appliedFromSpell === spellUuid;
        });
        if (existing.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
        }

        if (!active) return;

        const itemEffects = Array.from(item.effects ?? []);
        if (!itemEffects.length) return;

        const toCreate = [];
        for (const ef of itemEffects) {
          // Copy only meaningful effects; disabled effects remain disabled on the actor, but still mirrored.
          const changes = foundry.utils.duplicate(ef.changes ?? []);
          if (!Array.isArray(changes) || !changes.length) continue;

          toCreate.push({
            name: ef.name ?? item.name ?? "Spell Effect",
            // Foundry v13: ActiveEffect uses `img` (not legacy `icon`).
            img: ef.img ?? ef.icon ?? item.img,
            disabled: ef.disabled === true,
            origin: spellUuid,
            duration: {},
            changes,
            flags: {
              [FLAG_SCOPE]: {
                system: "uesrpg-3ev4",
                appliedFromSpell: spellUuid,
                sourceItemId: item.id,
                sourceEffectId: ef.id ?? null
              }
            }
          });
        }

        if (toCreate.length) {
          await actor.createEmbeddedDocuments("ActiveEffect", toCreate);
        }
      } catch (err) {
        console.error("UESRPG | Spell effect reconcile failed", err);
      }
    };

    Hooks.on("updateItem", async (item, changed, options, userId) => {
      try {
        // Only the user performing the update should reconcile to avoid races.
        if (game.userId !== userId) return;
        if (!item || item.type !== "spell") return;

        // Reconcile only when something relevant changes. If uncertain, reconcile.
        const touched =
          foundry.utils.getProperty(changed, `flags.${FLAG_SCOPE}.activeSpell`) !== undefined || foundry.utils.getProperty(changed, "flags.uesrpg.activeSpell") !== undefined ||
          foundry.utils.getProperty(changed, "effects") !== undefined ||
          foundry.utils.getProperty(changed, "name") !== undefined;

        if (touched) await reconcileSpellEffects(item);
      } catch (err) {
        console.error("UESRPG | Spell updateItem hook failed", err);
      }
    });

    Hooks.on("deleteItem", async (item, options, userId) => {
      try {
        if (game.userId !== userId) return;
        if (!item || item.type !== "spell") return;
        const actor = item.parent;
        if (!actor || actor.documentName !== "Actor") return;

        const spellUuid = item.uuid;
        const existing = (actor.effects ?? []).filter(e => {
          const f = e?.flags ?? {};
          return f?.[FLAG_SCOPE]?.appliedFromSpell === spellUuid || f?.uesrpg?.appliedFromSpell === spellUuid;
        });
        if (existing.length) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
        }
      } catch (err) {
        console.error("UESRPG | Spell deleteItem cleanup failed", err);
      }
    });
  }


  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d6 + @initiative.base",
    decimals: 0,
  };

  // Set up custom combat functionality for the system.
  CONFIG.Combat.documentClass = SystemCombat;

  // Record Configuration Values
  CONFIG.UESRPG = UESRPG;

  // Define custom Entity classes
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Item.documentClass = SimpleItem;

  // Preload sheet partials after the Handlebars application namespace is fully initialized.
  // Running this too early causes Foundry to fall back to deprecated global loaders.
  Hooks.once("setup", preloadHandlebarsTemplates);

  await registerSettings();

  await registerSheets();

  // Initialize combat automation chat handlers
  initializeChatHandlers();
  registerCombatChatHooks();
  registerChatMessageSocket();
  registerActiveEffectProxy();

  // Chapter 5: conditions + wounds automation (AE-backed, deterministic)
  registerConditions();
  registerWounds();

// Applying Font to system
function applyFont(fontFamily) {
  document.documentElement.style.setProperty("--main-font-family", fontFamily);
}

//Hook for changing font on startup

/**
 * Normalize invalid core SVG icon paths on Active Effects created by older builds.
 * This prevents 404 spam from missing icons (e.g., icons/svg/arrow-up.svg).
 *
 * Safe:
 * - GM-only
 * - idempotent
 * - updates only when the icon path is known-invalid
 */
async function normalizeInvalidEffectIcons() {
  if (!game.user?.isGM) return;

  // Foundry core SVGs live under icons/svg/*.svg
  // Some older builds referenced non-existent arrows (arrow-up.svg / arrow-down.svg).
  const iconMap = new Map([
    ["icons/svg/arrow-up.svg", "icons/svg/up.svg"],
    ["icons/svg/arrow-down.svg", "icons/svg/down.svg"]
  ]);

  /**
   * Normalize icons on a collection of ActiveEffect-like documents.
   * @param {any} parentDoc Actor | Item | TokenDocument.actor etc
   * @param {Iterable<any>} effects
   */
  const normalizeEffects = async (parentDoc, effects) => {
    if (!parentDoc || !effects) return;
    const updates = [];
    for (const ef of effects) {
      const img = ef?.img;
      if (!img || typeof img !== "string") continue;
      const next = iconMap.get(img);
      if (!next || next === img) continue;
      updates.push({ _id: ef.id, img: next });
    }
    if (updates.length === 0) return;

    try {
      await parentDoc.updateEmbeddedDocuments("ActiveEffect", updates);
    } catch (err) {
      // Do not hard-fail boot if a synthetic actor or protected document cannot be updated.
      console.warn("UESRPG | Failed to normalize effect icons on document.", { parent: parentDoc?.uuid ?? parentDoc?.id, err });
    }
  };

  // 1) World Actors (and their embedded item effects)
  for (const actor of (game.actors?.contents ?? [])) {
    await normalizeEffects(actor, actor.effects ?? []);
    for (const it of (actor.items ?? [])) {
      await normalizeEffects(it, it.effects ?? []);
    }
  }

  // 2) World Items
  for (const it of (game.items?.contents ?? [])) {
    await normalizeEffects(it, it.effects ?? []);
  }

  // 3) Unlinked token actors on active scenes (best effort)
  for (const scene of (game.scenes?.contents ?? [])) {
    for (const td of (scene.tokens ?? [])) {
      try {
        const actor = td?.actor;
        if (!actor) continue;
        // Normalize effects on the token actor (may be synthetic).
        await normalizeEffects(actor, actor.effects ?? []);
      } catch (_err) {
        // swallow
      }
    }
  }
}


Hooks.once("ready", async () => {
  const fontFamily = game.settings.get("uesrpg-3ev4", "changeUiFont");
  applyFont(fontFamily);

  await normalizeInvalidEffectIcons();


  // Developer-only: expose a skill TN debug helper for the GM.
  if (game.user?.isGM && game.settings.get("uesrpg-3ev4", "debugSkillTN")) {
    registerSkillTNDebug();
  registerActorSelectDebug();
  }
});

// Auto-execute Special Action outcomes when skill opposed test resolves
Hooks.on("createChatMessage", async (message) => {
  const state = message?.flags?.["uesrpg-3ev4"]?.skillOpposed?.state;
  if (!state?.outcome || !state?.specialActionId) return;

  try {
    const { executeSpecialAction } = await import("../combat/special-actions-helper.js");
    
    const attacker = fromUuidSync(state.attacker?.actorUuid);
    const defender = fromUuidSync(state.defender?.actorUuid);
    
    // Attacker is always required; defender is required for all opposed actions
    // (Arise is handled separately and doesn't trigger this hook)
    if (!attacker) return;
    
    // Most Special Actions require a defender, but be defensive
    const target = defender ?? null;

    const result = await executeSpecialAction({
      specialActionId: state.specialActionId,
      actor: attacker,
      target,
      isAdvantageMode: false,
      opposedResult: state.outcome
    });

    if (result.success) {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        content: `<div class="uesrpg-special-action-outcome"><b>Special Action Outcome:</b><p>${result.message}</p></div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
      });
    }
  } catch (err) {
    console.error("UESRPG | Failed to execute Special Action outcome automation", err);
  }
});
}
