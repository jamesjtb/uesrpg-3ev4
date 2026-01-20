import { migrateItemsIfNeeded } from "./core/migrations/items.js";
import { migrateActorsIfNeeded } from "./core/migrations/actors.js";
import startupHandler from '../module/handlers/startup.js';
import initHandler from '../module/handlers/init.js';
import { dumpAEKeys } from "../module/dev/ae-keys-dump.js";
import { openStaminaDialog, getActiveStaminaEffect, consumeStaminaEffect } from "./core/stamina/stamina-dialog.js";
import { 
  applyPhysicalExertionBonus, 
  applyPhysicalExertionToSkill,
  applyPowerAttackBonus,
  applySprintBonus,
  applyPowerDrawBonus,
  applyPowerBlockBonus,
  hasStaminaEffect
} from "./core/stamina/stamina-integration-hooks.js";
import { AttackTracker } from "./core/combat/attack-tracker.js";
import { initializeUpkeepSystem } from "./core/magic/upkeep-workflow.js";
import { initializeDamageApplication } from "./core/magic/damage-application.js";

Hooks.once('ready', async function () {
  console.log(`UESRPG | Ready`);
  await migrateActorsIfNeeded();
  await migrateItemsIfNeeded();
  await startupHandler();
  
  // Initialize spell upkeep system
  initializeUpkeepSystem();
  
  // Initialize magic damage application
  initializeDamageApplication();
});

Hooks.once("init", async function() {
  console.log(`UESRPG | Initializing`);
  await initHandler();
  
  // Register Handlebars helpers
  Handlebars.registerHelper('capitalize', function(str) {
    const s = String(str || '');
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  // Expose AE key inspection helper
  game.uesrpg = game.uesrpg || {};
  game.uesrpg.dumpAEKeys = dumpAEKeys;
  
  // Expose stamina helpers
  game.uesrpg.stamina = {
    openDialog: openStaminaDialog,
    getActiveEffect: getActiveStaminaEffect,
    consumeEffect: consumeStaminaEffect,
    applyPhysicalExertion: applyPhysicalExertionBonus,
    applyPhysicalExertionToSkill,
    applyPowerAttack: applyPowerAttackBonus,
    applySprint: applySprintBonus,
    applyPowerDraw: applyPowerDrawBonus,
    applyPowerBlock: applyPowerBlockBonus,
    hasEffect: hasStaminaEffect
  };
  
  // Expose attack tracker
  game.uesrpg.AttackTracker = AttackTracker;

  // Note: The prior GM-only "AE Keys" sheet header button was a debugging aid.
  // It has been removed; the helper remains available as game.uesrpg.dumpAEKeys(...).
});
