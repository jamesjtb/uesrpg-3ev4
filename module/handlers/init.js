// Import Modules
import { UESRPG } from "../constants.js";
import { SimpleActor } from "../entities/actor.js";
import { npcSheet } from "../sheets/npc-sheet.js";
import { SimpleActorSheet } from "../sheets/actor-sheet.js";
import { merchantSheet } from "../sheets/merchant-sheet.js";
import { SimpleItem } from "../entities/item.js";
import { SimpleItemSheet } from "../sheets/item-sheet.js";
import { SystemCombat } from "../entities/combat.js";

async function registerSettings() {
  // Register system settings
  function delayedReload() {
    window.setTimeout(() => location.reload(), 500);
  }

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
}

async function registerSheets () {
    // Register sheet application classes
    Actors.unregisterSheet("core", ActorSheet);
    Items.unregisterSheet("core", ItemSheet);
    Actors.registerSheet("uesrpg-3ev4", SimpleActorSheet, {
      types: ['Player Character'],
      makeDefault: true,
      label: "Default UESRPG Character Sheet",
    });
    Items.registerSheet("uesrpg-3ev4", SimpleItemSheet, {
      makeDefault: true,
      label: "Default UESRPG Item Sheet",
    });
    Actors.registerSheet("uesrpg-3ev4", npcSheet, {
      types: ["NPC"],
      makeDefault: true,
      label: "Default UESRPG NPC Sheet",
    });
    Actors.registerSheet("uesrpg-3ev4", merchantSheet, {
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
}
