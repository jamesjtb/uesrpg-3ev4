import startupHandler from './handlers/startup.js';
import initHandler from './handlers/init.js';
import { runMigrations } from './migrations.js';

Hooks.once("init", async function() {
  console.log(`UESRPG | Initializing`);
  await initHandler();
});

Hooks.once('ready', async function () {
  console.log(`UESRPG | Ready`);
  await runMigrations();
  await startupHandler();
});
