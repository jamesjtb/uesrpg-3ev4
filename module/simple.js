// Import Modules
import { UESRPG } from "./config.js";
import { SimpleActor } from "./actor.js";
import { npcSheet } from "./npc-sheet.js";
import { SimpleActorSheet } from "./actor-sheet.js";
import { merchantSheet } from "./merchant-sheet.js";
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

  // Record Configuration Values
	CONFIG.UESRPG = UESRPG;

	// Define custom Entity classes
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Item.documentClass = SimpleItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);
  Actors.registerSheet("uesrpg-d100", SimpleActorSheet, 
    {types: ["character"], 
    makeDefault: true,
    label: "Default UESRPG Character Sheet"
    });
  Items.registerSheet("uesrpg-d100", SimpleItemSheet, 
    { 
    makeDefault: true,
    label: "Default UESRPG Item Sheet"
    });
  Actors.registerSheet("uesrpg-d100", npcSheet, {
    types: ["npc"], 
    makeDefault: true,
    label: "Default UESRPG NPC Sheet"
    });
  Actors.registerSheet("uesrpg-d100", merchantSheet, {
    types: ["npc"],
    makeDefault: false,
    label: "Default UESRPG Merchant Sheet"
  });

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

  const startUpFunction = () => {
    const startUpDialog = game.settings.get("uesrpg-d100", "startUpDialog");
    let discordIcon = `<i class="fab fa-discord fa-2x"></i>`;
    let patreonIcon = `<i class="fab fa-patreon fa-2x"></i>`;
    let gitLabIcon = `<i class="fab fa-gitlab fa-2x"></i>`;
    let patreonLink = "Patreon";
    let discordLink = "Discord Channel";
    let gitLabLink = 'GitLab Repo'
    let contentModLink = "https://github.com/95Gman/UESRPG-revised";

    let popup = new Dialog({
      title: "Welcome to the UESRPG Foundry System!",
      content: `<form>
        <div class="dialogForm" style="padding: 5px">

          <div style="text-align: center; margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
            <span style="margin-left: 10px; margin-right: 10px;">  
              ${patreonIcon.link("https://www.patreon.com/bePatron?u=30258550")}
            </span>
            <span style="margin-left: 10px; margin-right: 10px;"> 
              ${discordIcon.link("https://discord.gg/pBRJwy3Ec5")}
            </span>
            <span style="margin-left: 10px; margin-right: 10px;">
              ${gitLabIcon.link("https://gitlab.com/DogBoneZone/uesrpg-3e")}
            </span>
          </div>

          <div style="margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
              <h2 style="text-align: center;">Join the Community!</h2>
              <label>
                Hey adventurer! Thanks for taking the time to check out the UESRPG system on Foundry. UESRPG is 
                an incredible game developed by a team of dedicated and talented designers. You can find out more about the game, 
                download the free rulebooks, and interact with our lively community on the ${discordLink.link("https://discord.gg/pBRJwy3Ec5")}.
              </label>

              <p></p>

              <label>
                If you want to support further development of this system, please consider supporting me on ${patreonLink.link("https://www.patreon.com/bePatron?u=30258550")}. 
                Thank you, and enjoy the UESRPG System!
              </<label>

              <p></p>

            <h2 style="text-align: center;">Recommended Game Content</h2>
              <label>
                The following modules/content were created by some dedicated community members and are <b>highly recommended</b> 
                as they provide hundreds of pre-built items, NPC's, and much more.
              </label>
              <ul>
                <li>${contentModLink.link("https://github.com/95Gman/UESRPG-revised")}</li>
              </ul>
          </div>

          <div style="margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
            <h2 style="text-align: center;">v1.41 Changelog</h2>
              <ul>
                <li>Added new All-In-One Combat Macro to roll Combat Style + Weapon Damage Roll simultaneously</li>
                <li>Added new Reset Action Points Macro that resets all Action Points to Max for any combatants in the current scene</li>
                <li>Fixed Wound Calculation error in the All-In-One Spellcasting Macro</li>
                <li>Removed border lines in many areas of the sheets to look more appropriate on Firefox browser</li>
                <li>Added buttons to the Set Base Characteristics Menu to easily click into the items that are applying the characteristic bonus/penalty</li>
                <li>All Item/Skill/Spell lists are now automatically sorted alphabetically to more easily find items in longer lists</li>
                <li>Resolved issue where buttons would register a click when hitting the Enter key</li>
                <li>Slightly increased the default size of character/NPC sheets to better fit content when using custom borders and themes</li>
              </ul>
          </div>

          <div>
            <i>You can disable this popup message in the System Settings and checking the box to not show this again.</i>
          </div>
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
    popup.position.width = 600;
    popup.render(true);
  }

  if (game.settings.get('uesrpg-d100', 'startUpDialog') === false) {startUpFunction()}

});
