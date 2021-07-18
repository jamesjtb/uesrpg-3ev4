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

  game.settings.register("uesrpg-d100", "startUpDialog", {
    name: "Do Not Show Dialog on Startup",
    hint: "Checking this box hides the startup popup dialog informing the user on additional game resources.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  const startUpDialog = game.settings.get("uesrpg-d100", "startUpDialog");
  let discordLink = "https://discord.gg/pBRJwy3Ec5";
  let contentModLink = "https://github.com/95Gman/UESRPG-revised";
  let patreonLink = "https://www.patreon.com/swordsandstones";

  if (startUpDialog === false) {
  let popup = new Dialog({
    title: "Welcome to the UESRPG Foundry System!",
    content: `<form>
      <div class="dialogForm" style="padding: 10px">
      <label>Hey adventurer! Thanks for taking the time to check out the UESRPG system. It's an incredible 
      game developed by a team of dedicated and talented designers. You can find out more about the game, 
      download the free rulebooks, and interact with our lively community on our discord channel:<p>
           
      ${discordLink.link("https://discord.gg/pBRJwy3Ec5")}
      </p>
      Also, it is <b>HIGHLY</b> recommended you check out the compatible content modules for this system that contain 
      some incredible material, such as hundreds of prebuilt NPC's and Creatures, all in-game weapons/armor/items, 
      and tons of other great stuff. Visit the link below or search for UESRPG modules on Foundry to download and 
      install all the content:
      <p>
      ${contentModLink.link("https://github.com/95Gman/UESRPG-revised")}
      </p>
  
      Lastly, if you enjoy the work I've done and want to help me out, consider backing me on Patreon. :) Thanks 
      for your time, and enjoy the UESRPG system!
      <p>
      ${patreonLink.link("https://www.patreon.com/swordsandstones")}
      </p>
      <i>You can disable this popup message by going into the System Settings and checking the box to not show this again.</i>
      </div>
      </form>`,
    buttons: {
          one: {
            label: "Close"
          }
        },
    default: "one",
    close: html => console.log()
  });
  popup.render(true);
}
});
