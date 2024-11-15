// Import Modules
import { UESRPG } from "./config.js";
import { SimpleActor } from "./actor.js";
import { npcSheet } from "./npc-sheet.js";
import { SimpleActorSheet } from "./actor-sheet.js";
import { merchantSheet } from "./merchant-sheet.js";
import { SimpleItem } from "./item.js";
import { SimpleItemSheet } from "./item-sheet.js";
import { SystemCombat } from "./combat.js";


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

  // Set up custom combat functionality for the system.
  CONFIG.Combat.documentClass = SystemCombat;

  // Record Configuration Values
	CONFIG.UESRPG = UESRPG;

	// Define custom Entity classes
  CONFIG.Actor.documentClass = SimpleActor;
  CONFIG.Item.documentClass = SimpleItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);
  Actors.registerSheet("uesrpg-3ev4", SimpleActorSheet,
    {types: ["character"],
    makeDefault: true,
    label: "Default UESRPG Character Sheet"
    });
  Items.registerSheet("uesrpg-3ev4", SimpleItemSheet,
    {
    makeDefault: true,
    label: "Default UESRPG Item Sheet"
    });
  Actors.registerSheet("uesrpg-3ev4", npcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "Default UESRPG NPC Sheet"
    });
  Actors.registerSheet("uesrpg-3ev4", merchantSheet, {
    types: ["npc"],
    makeDefault: false,
    label: "Default UESRPG Merchant Sheet"
  });

  // Register system settings
  function delayedReload() {window.setTimeout(() => location.reload(), 500)}

  game.settings.register("uesrpg-3ev4", "legacyUntrainedPenalty", {
    name: "v3 Untrained Penalty",
    hint: "Checking this option enables the UESRPG v3 penalty for Untrained skills at -10 instead of the standard -20.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: delayedReload
  });

  game.settings.register("uesrpg-3ev4", "startUpDialog", {
    name: "Do Not Show Dialog on Startup",
    hint: "Checking this box hides the startup popup dialog informing the user on additional game resources.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  game.settings.register("uesrpg-3ev4", "automateMagicka", {
    name: "Automate Magicka Cost",
    hint: "Automatically deduct the cost of a spell after cost calculation from the token/character's current magicka.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: delayedReload
  });

  game.settings.register("uesrpg-3ev4", "automateActionPoints", {
    name: "Automate Action Points",
    hint: `Automatically set all combatants' AP to max at the start of each encounter.
           Automatically set a combatant's AP to max at the start of their turn (except during the first round).`,
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });

  game.settings.register("uesrpg-3ev4", "npcENCPenalty", {
    name: "NPC's Suffer Encumbrance Penalties",
    hint: "If checked, NPC's suffer from the same overencumbrance penalties that player characters do. Otherwise, they suffer no ENC Penalties.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
    onChange: delayedReload
  });

  game.settings.register("uesrpg-3ev4", "sortAlpha", {
    name: "Sort Actor Items Alphabetically",
    hint: "If checked, Actor items are automatically sorted alphabetically. Otherwise, items are not sorted and are organized manually.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean,
    onChange: delayedReload
  });

  const startUpFunction = () => {
    const discordIcon = `<i class="fab fa-discord fa-2x"></i>`;
    const githubIcon = `<i class="fab fa-github fa-2x"></i>`;
    const discordInviteUrl = "https://discord.gg/pBRJwy3Ec5";
    const githubUrl = "https://github.com/jamesjtb/uesrpg-3ev4"

    const renderLink = (content, url) => `<a href="${url}">${content}</a>`;

    const popup = new Dialog({
      title: "Welcome to the UESRPG Foundry System!",
      content: `<form style="height: 100%;>
        <div class="dialogForm" style="padding: 5px">

          <div style="text-align: center; margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
            <span style="margin-left: 10px; margin-right: 10px;">
              ${renderLink(discordIcon, discordInviteUrl)}
            </span>
            <span style="margin-left: 10px; margin-right: 10px;">
              ${renderLink(githubIcon, githubUrl)}
            </span>
          </div>

          <div style="margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
              <h2 style="text-align: center;">Join the Community!</h2>
              <label>
                Hey adventurer! Thanks for taking the time to check out the UESRPG system on Foundry. UESRPG is
                an incredible game developed by a team of dedicated and talented designers. You can find out more about the game,
                download the free rulebooks, and interact with our lively community on the ${renderLink("Discord Server", discordInviteUrl)}.
              </label>

              <p></p>

            <h2 style="text-align: center;">Recommended Game Content</h2>
              <label>
                The following modules/content were created by some dedicated community members and are <b>highly recommended</b>
                as they provide hundreds of pre-built items, NPC's, and much more.
              </label>
              <ul>
                <li>${renderLink('UESRPG-Revised', contentModLink)}</li>
              </ul>
          </div>

          <div style="overflow-y: scroll; height: 300px; margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
            <h2 style="text-align: center;">v${game.system.version}</h2>
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
    popup.position.height = 750;
    popup.render(true);
  }

  if (game.settings.get('uesrpg-3ev4', 'startUpDialog') === false) {startUpFunction()}

});
