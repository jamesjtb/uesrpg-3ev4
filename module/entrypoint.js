import { migrateItemsIfNeeded } from "./migrations/items.js";
import startupHandler from './handlers/startup.js';
import initHandler from './handlers/init.js';
import { dumpAEKeys } from "./dev/ae-keys-dump.js";
import { openStaminaDialog, getActiveStaminaEffect, consumeStaminaEffect } from "./stamina/stamina-dialog.js";
import { 
  applyPhysicalExertionBonus, 
  applyPhysicalExertionToSkill,
  applyPowerAttackBonus,
  applySprintBonus,
  applyPowerDrawBonus,
  applyPowerBlockBonus,
  hasStaminaEffect
} from "./stamina/stamina-integration-hooks.js";
import { AttackTracker } from "./combat/attack-tracker.js";
import { initializeUpkeepSystem } from "./magic/upkeep-workflow.js";
import { initializeDamageApplication } from "./magic/damage-application.js";

Hooks.once('ready', async function () {
  console.log(`UESRPG | Ready`);
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
