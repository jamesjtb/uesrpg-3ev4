import { UESRPG } from "../constants.js";
import { SimpleActor } from "../entities/actor.js";
import { npcSheet } from "../sheets/npc-sheet.js";
import { SimpleActorSheet } from "../sheets/actor-sheet.js";
import { merchantSheet } from "../sheets/merchant-sheet.js";
import { SimpleItem } from "../entities/item.js";
import { SimpleItemSheet } from "../sheets/item-sheet.js";
import { SystemCombat } from "../entities/combat.js";
import { initializeChatHandlers, registerCombatChatHooks } from "../combat/chat-handlers.js";
import { registerSkillTNDebug } from "../dev/skill-tn-debug.js";
import { registerActorSelectDebug } from "../dev/actor-select-debug.js";

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
    config: true,
    default: false,
    type: Boolean,
  });

  // Skill roll diagnostics
  game.settings.register("uesrpg-3ev4", "skillRollDebug", {
    name: "Skill Roll Debug Logging",
    hint: "When enabled, skill rolls and skill-opposed workflows log structured diagnostic information to the browser console.",
    scope: "world",
    config: true,
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
    config: true,
    type: Boolean,
    default: false,
    onChange: delayedReload
  });

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
foundry.documents.collections.Actors.registerSheet("uesrpg-3ev4", merchantSheet, {
  types: ["NPC"],
  makeDefault: false,
  label: "Default UESRPG Merchant Sheet",
});
}

export default async function initHandler() {
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

  await registerSettings();

  await registerSheets();

  // Initialize combat automation chat handlers
  initializeChatHandlers();
  registerCombatChatHooks();

// Applying Font to system
function applyFont(fontFamily) {
  document.documentElement.style.setProperty("--main-font-family", fontFamily);
}

//Hook for changing font on startup
Hooks.once("ready", () => {
  const fontFamily = game.settings.get("uesrpg-3ev4", "changeUiFont");
  applyFont(fontFamily);

  // Developer-only: expose a skill TN debug helper for the GM.
  if (game.user?.isGM && game.settings.get("uesrpg-3ev4", "debugSkillTN")) {
    registerSkillTNDebug();
  registerActorSelectDebug();
  }
});
}
