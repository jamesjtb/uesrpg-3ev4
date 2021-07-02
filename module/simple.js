// Import Modules
import { SimpleActor } from "./actor.js";
import { npcSheet } from "./npc-sheet.js";
import { SimpleActorSheet } from "./actor-sheet.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function() {
  console.log(`Initializing UESRPG System`);

	/**
	 * Set an initiative formula for the system
	 * @type {String}
	 */
	CONFIG.Combat.initiative = {
    formula: "1d6 + @initiative.base",
    decimals: 0
  };

	// Define custom Entity classes
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Item.documentClass = SimpleItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("dnd5e", SimpleActorSheet, {types: ["character"], makeDefault: true});
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("uesrpg-d100", SimpleItemSheet, 
    {types: [
          "item", 
          "armor", 
          "weapon", 
          "spell", 
          "trait", 
          "talent", 
          "power", 
          "combatStyle", 
          "skill", 
          "magicSkill", 
          "ammunition"], 
    makeDefault: true});
  Actors.registerSheet("uesrpg-d100", npcSheet, {types: ["npc"], makeDefault: true});

  // Register system settings
  game.settings.register("uesrpg-d100", "legacyUntrainedPenalty", {
    name: "Legacy Untrained Penalty",
    hint: "Checking this option enables the UESRPG v2 penalty for Untrained skills at -20 instead of the standard -10. Must refresh the client manually (F5) after selecting this option to see the changes on actor sheets.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });
});
