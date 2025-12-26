import { migrateItemsIfNeeded } from "./migrations/items.js";
import startupHandler from './handlers/startup.js';
import initHandler from './handlers/init.js';

Hooks.once('ready', async function () {
  console.log(`UESRPG | Ready`);
  await migrateItemsIfNeeded();
  await startupHandler();
});

Hooks.once("init", async function() {
  console.log(`UESRPG | Initializing`);
  await initHandler();
});
