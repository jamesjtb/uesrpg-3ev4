 import startupHandler from './handlers/startup.js';
 import initHandler from './handlers/init.js';
 import { runMigrations } from './migrations.js';
 import { initAutomatedCombat } from './combat/automated-combat.js';
 import { registerChatListeners } from './combat/chat-listeners.js';

 Hooks.once("init", async function() {
   console.log(`UESRPG | Initializing`);
   await initHandler();
 });

 Hooks.once('ready', async function () {
   console.log(`UESRPG | Ready`);
   initAutomatedCombat();
   await runMigrations();
   await startupHandler();
   
   // Initialize opposed card listeners
   registerChatListeners();
 });
