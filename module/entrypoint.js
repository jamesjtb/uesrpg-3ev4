1: import startupHandler from './handlers/startup.js';
2: import initHandler from './handlers/init.js';
3: import { runMigrations } from './migrations.js';
4: import { initAutomatedCombat } from './combat/automated-combat.js';

6: Hooks.once("init", async function() {
7:   console.log(`UESRPG | Initializing`);
8:   await initHandler();
9: });

11: Hooks.once('ready', async function () {
12:   console.log(`UESRPG | Ready`);
13:   initAutomatedCombat();
14:   await runMigrations();
15:   await startupHandler();
16: });
