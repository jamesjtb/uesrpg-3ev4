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

  game.settings.register("uesrpg-d100", "migrateChaData", {
    name: "Migrate Characteristic Data",
    hint: "If updating from v1.33 or older, enable this to save your Player Character's Characteristics to the new data model.",
    scope: "world",
    config: true,
    default: true,
    type: Boolean
  })

  const startUpDialog = game.settings.get("uesrpg-d100", "startUpDialog");
  let discordIcon = `<a class="fab fa-discord fa-2x"></a>`;
  let patreonIcon = `<a class="fab fa-patreon fa-2x"></a>`;
  let patreonLink = "Patreon";
  let discordLink = "Discord Channel";
  let contentModLink = "https://github.com/95Gman/UESRPG-revised";

  if (startUpDialog === false) {
  let popup = new Dialog({
    title: "Welcome to the UESRPG Foundry System!",
    content: `<form>
      <div class="dialogForm" style="padding: 5px">

        <div style="text-align: center; border: inset; margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
          <span style="margin-left: 10px; margin-right: 10px;">  
            ${patreonIcon.link("https://www.patreon.com/bePatron?u=30258550")}
          </span>
          <span style="margin-left: 10px; margin-right: 10px;"> 
            ${discordIcon.link("https://discord.gg/pBRJwy3Ec5")}
          </span>
        </div>

        <div style="border: inset; margin: 5px; padding: 5px; background-color: rgba(78, 78, 78, 0.137);">
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

          <i>You can disable this popup message in the System Settings and checking the box to not show this again.</i>
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

Hooks.once("ready", async function() {
  const migrateCharacteristicData = game.settings.get("uesrpg-d100", "migrateChaData");
  const worldActors = game.actors;
  const actorCompendiums = game.packs.filter(pack => pack.documentName == "Actor");
  const itemCompendiums = game.packs.filter(pack => pack.documentName == "Item");
  const docArray = [];
  const itemArray = [];

  console.log(actorCompendiums);

  //Unlock Actor Compendiums for Updating
  if (migrateCharacteristicData){
    for (let i of actorCompendiums) {
      i.configure({locked: false});
      let docs = await i.getDocuments();
      docArray.push(docs);
    }

  for (let i of itemCompendiums) {
    i.configure({locked: false});
    let x = await i.getDocuments();
    itemArray.push(x);
  }

  //Migrate World Actor Data
    console.log("Migrating Actor Characteristic Data to new Data Model")
    for (let a of worldActors) {
      console.log("Migrating data for %s", a.name);
      a.data.data.characteristics.str.base = a.data.data.characteristics.str.value;
      a.data.data.characteristics.end.base = a.data.data.characteristics.end.value;
      a.data.data.characteristics.agi.base = a.data.data.characteristics.agi.value;
      a.data.data.characteristics.int.base = a.data.data.characteristics.int.value;
      a.data.data.characteristics.wp.base = a.data.data.characteristics.wp.value;
      a.data.data.characteristics.prc.base = a.data.data.characteristics.prc.value;
      a.data.data.characteristics.prs.base = a.data.data.characteristics.prs.value;
      a.data.data.characteristics.lck.base = a.data.data.characteristics.lck.value;
      a.update({"data.characteristics" : a.data.data.characteristics})

      console.log("Converting Owned Items of %s from PNG to WEBP", a.name);
      let actorItems = a.items;
      for (let item of actorItems) {
        console.log("Converting img filepath for %s", item.img);
          if (item.img.startsWith("systems/uesrpg-d100/images/Icons/") && (item.img.endsWith(".png"))) {
            let path = item.img.replace(".png", ".webp");
            await item.update({"img" : path});
            console.log("This filepath has now been updated to %s", item.img)
          } else if (item.img.startsWith("systems/uesrpg-d100/images/Icons" && (item.img.endsWith(".jpg")))) {
            let path = item.img.replace(".jpg", ".webp");
            await item.update({"img" : path});
            console.log("This filepath has now been updated to %s", item.img)
          }
      }
    }

    //Migrate Actor Compendiums
    for (let b of actorCompendiums) {
      for (let a of b) {
        console.log("Migrating Compendium data for %s", a.name);
        a.data.data.characteristics.str.base = a.data.data.characteristics.str.value;
        a.data.data.characteristics.end.base = a.data.data.characteristics.end.value;
        a.data.data.characteristics.agi.base = a.data.data.characteristics.agi.value;
        a.data.data.characteristics.int.base = a.data.data.characteristics.int.value;
        a.data.data.characteristics.wp.base = a.data.data.characteristics.wp.value;
        a.data.data.characteristics.prc.base = a.data.data.characteristics.prc.value;
        a.data.data.characteristics.prs.base = a.data.data.characteristics.prs.value;
        a.data.data.characteristics.lck.base = a.data.data.characteristics.lck.value;
        a.update({"data.characteristics" : a.data.data.characteristics})

        console.log("Converting Owned Items of %s from PNG to WEBP", a.name);
        let actorItems = a.items;
        for (let item of actorItems) {
          console.log("Converting img filepath for %s", item.img);
          if (item.img.startsWith("systems/uesrpg-d100/images/Icons/") && (item.img.endsWith(".png"))) {
            let path = item.img.replace(".png", ".webp");
            await item.update({"img" : path});
            console.log("This filepath has now been updated to %s", item.img)
          } else if (item.img.startsWith("systems/uesrpg-d100/images/Icons" && (item.img.endsWith(".jpg")))) {
            let path = item.img.replace(".jpg", ".webp");
            await item.update({"img" : path});
            console.log("This filepath has now been updated to %s", item.img)
          }
        }
      }
      await b.configure({locked: true});
    }

    //Migrate Item Compendiums
    for (let b of itemCompendiums) {
      for (let a of b) {
        console.log("Converting Owned Items of %s from PNG to WEBP", a.name);
          console.log("Converting img filepath for %s", a.img);
          if (a.img.startsWith("systems/uesrpg-d100/images/Icons/") && (a.img.endsWith(".png"))) {
            let path = a.img.replace(".png", ".webp");
            await a.update({"img" : path});
            console.log("This filepath has now been updated to %s", a.img)
          } else if (a.img.startsWith("systems/uesrpg-d100/images/Icons" && (a.img.endsWith(".jpg")))) {
            let path = a.img.replace(".jpg", ".webp");
            await a.update({"img" : path});
            console.log("This filepath has now been updated to %s", a.img)
          }
      }
      await b.configure({locked: true});
    }
  
    
    console.log("Migration Complete");
    let d = new Dialog({
      title: "Character Migration Complete",
      content: `<form>
                  <div style="margin: 5px; padding: 5px; border: inset; background-color: rgba(78, 78, 78, 0.137);">
                    <h2 style="text-align: center;">Migration to v${game.system.data.version} Complete!</h2>

                    Your character's Characteristics values and owned item images are now stored in a different location, which means
                    the data needed to be migrated to fit the new data model. This has been done automatically 
                    for you! You just need to do <b>TWO QUICK THINGS</b> to make sure all is well in your world!

                    <ul>
                      <li>Refresh the game by pressing F5 after seeing this message.</li>
                      <li>Go into the system settings and <b>toggle OFF the Migration setting</b>.</li>
                    </ul>
                    
                    <p></p>

                    Thank you, and enjoy the update. :)
                  </div>

                </form>`,
      buttons: {
        one: {
          label: "Close"
            }
      },
      default: "one",
      close: html => console.log()
    })
    d.render(true);
  }
})
