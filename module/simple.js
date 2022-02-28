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

  game.settings.register("uesrpg-d100", "automateMagicka", {
    name: "Automate Magicka Cost",
    hint: "Automatically deduct the cost of a spell after cost calculation from the token/character's current magicka.",
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
            <h2 style="text-align: center;">v${game.system.data.version} Changelog</h2>

                <h3>General Changes</h3>
                  <ul>
                      <li><strong>Sheet Redesign:</strong> New layout for character, merchant, NPC, and all item sheets to be easier to use and in general more practical. Can now freely resize the sheet with minimal negative
                          effect on the layout and design. Go nuts!
                      </li>
                      <li><strong>Status Modifiers:</strong> A new way to visualize current effects on characters with a status column on the combat tab as well as icons next to the character portrait.
                          Currently supports Fatigue effects, Wounded effects, and Overencumbered effects. This also outputs a tag on any rolled tests so users can easily see what effects
                          are applied on the roll. Combat rolls, profession rolls, and characteristic rolls are automatically modified with status effects. Merchant sheet NPC's rolls are unaffected by ENC status so they
                          can have as many items on them as you want without affecting their rolls.
                      </li>
                      <li><strong>Item Equip System:</strong> Weapons, Armor, Items, and Ammo now have an equipped state. Unequipped items are now part of an item master list included on the Items tab. Any equipped
                          items are moved over to the combat tab. They can easily be equipped in bulk on the combat tab by clicking on the headers and equipped any items. This cleans up the combat tab
                          so that only the equipped items are shown, and all others are left on the items master list. NOTE: Regular items must have the "Wearable" toggle on in order to be equipped via the 
                          combat tab Equip Armor button.
                      </li>
                      <li><strong>New Item Filter:</strong> Filter by item types within the new master item list on the item tab.</li>
                      <li><strong>Combat Style Auto-Select Highest Characteristic:</strong> New Combat Styles created on Character sheets automatically select the highest from STR or AGI on creation. This saves a click or two.</li>
                  </ul>

                <h3>Combat Changes</h3>
                  <ul>
                      <li><strong>Weapon Damage Toggle:</strong> Weapon damage toggle from 1H to 2H dynamically shows damage based on toggle status.</li>
                      <li><strong>NPC Combat Buttons:</strong> New NPC Combat buttons on the Combat tab to make rolling a bit easier during combat.</li>
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
