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
      content: `<form style="height: 100%;>
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

          <div style="overflow-y: scroll; height: 300px; margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
            <h2 style="text-align: center;">v1.44 Changelog</h2>

                <h3>General Changes</h3>
                  <ul>
                      <li>Redesign of the entire character, merchant, and NPC sheets to be easier to use and in general more practical.</li>
                      <li>Character Birthsign Selection Menu: Select a birthsign (or input a custom label to circumvent automation) and it will automatically create the appropriate 
                          talents, powers, and traits according to your selection.
                      </li>
                      <li>Character Race Selection Menu: Select from 10 of the default races (likely more will be added, as well as additional stat block options in later releases)
                          and have their stat blocks automatically applied to the character's characteristics! Also has an option for custom races with no automation.
                      </li>
                      <li>Lucky/Unlucky Numbers Selection Menu: Input your lucky/unlucky numbers into the menu, which also includes automation support for The Thief birthsign, which grants
                          an additional lucky number.
                      </li>
                      <li>XP Tracker Menu: Track and input your XP and easily see your progress toward the next Campaign Rank level</li>
                  </ul>

                <h3>Combat Changes</h3>
                  <ul>
                      <li>New blood splatter effect over the combat avatar when the wounded checkbox is ticked.</li>
                      <li>Select a custom body avatar or use the default avatars. It is recommended you use a transparent file, otherwise the wounded effects might not be visible.</li>
                      <li>New Equip Armor Menu: Equip armor and other items using the Armor button on the combat tab. Allows you to easily see your load-out and details in one place.</li>
                      <li>New Primary/Secondary Weapon Hotkeys: Right click the hotkeys next to your combat avatar to select from your weapon list and assign the weapon for quick access.</li>
                      <li>New Toggle for hiding Resistance Column. Useful if you want to clear up the UI a bit.</li>
                  </ul>

                <h3>Magic Changes</h3>
                  <ul>
                      <li>New Magic Spell Filter: Spells are now able to be filtered by School category (Alteration, Destruction, etc.). Helps with those massive spell lists on mage characters!</li>
                      <li>New Spellcasting menu when you click to cast a spell. Lets you select Overload, Restraint, and a few others if you have the appropriate talents.</li>
                      <li>If a spell does not have a damage value (or is set to 0), the output will not show up in the chat result (requested for non-damaging spells)</li>
                  </ul>

                <h3>Item Changes</h3>
                  <ul>
                      <li>New Equipment Tab Design: Alphabetically sorted to better organize long item lists, plus new qty increment function. Right click to decrease, click to increase.</li>
                      <li>Items now have a "wearable" property. When tagged, it allows you to Equip it via the Equip Armor menu on the Combat tab. Great for use with rings, amulets, jewelry, and clothing.</li>
                  </ul>
          </div>

          <div style="padding: 5px;">
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
    popup.position.width = 650;
    popup.render(true);
  }

  if (game.settings.get('uesrpg-d100', 'startUpDialog') === false) {startUpFunction()}

});
