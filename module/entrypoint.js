import { migrateItemsIfNeeded } from "./migrations/items.js";
import startupHandler from './handlers/startup.js';
import initHandler from './handlers/init.js';
import { dumpAEKeys } from "./dev/ae-keys-dump.js";

Hooks.once('ready', async function () {
  console.log(`UESRPG | Ready`);
  await migrateItemsIfNeeded();
  await startupHandler();
});

Hooks.once("init", async function() {
  console.log(`UESRPG | Initializing`);
  await initHandler();
  // Expose AE key inspection helper
  game.uesrpg = game.uesrpg || {};
  game.uesrpg.dumpAEKeys = dumpAEKeys;

  // GM-only sheet header button to dump AE keys to console
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    if (!game.user?.isGM) return;
    // Only for this system's sheets (avoid affecting other systems if mixed)
    if (sheet?.actor?.type === undefined) return;

    buttons.unshift({
      label: "AE Keys",
      class: "uesrpg-ae-keys",
      icon: "fas fa-list",
      onclick: async () => {
        try {
          await dumpAEKeys(sheet.actor, { print: true, includeDerived: true });
          ui.notifications?.info?.(`AE keys dumped to console for ${sheet.actor.name}`);
        } catch (err) {
          console.error(err);
          ui.notifications?.error?.(`Failed to dump AE keys: ${err.message}`);
        }
      }
    });
  });
});
