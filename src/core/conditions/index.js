/**
 * src/core/conditions/index.js
 */

import { registerConditionHooks, ConditionsAPI, auditConditionRegistry } from "./condition-engine.js";
import { registerConditionTurnTicker } from "./turn-ticker.js";
import { registerSystemStatusEffects, registerStatusHudInterop } from "./status-hud.js";

let _conditionsRegistered = false;

export function registerConditions() {
  if (_conditionsRegistered) return;
  _conditionsRegistered = true;
  // Token HUD: expose system conditions as status effects and route interactions through the
  // deterministic condition engine.
  // Apply early.
  registerSystemStatusEffects();
  registerStatusHudInterop();

  // Re-assert after other packages/modules have had an opportunity to mutate CONFIG.statusEffects.
  Hooks.once("setup", () => registerSystemStatusEffects());
  Hooks.once("ready", () => {
    registerSystemStatusEffects();

    // Stability-only audit (no data mutation). Useful to catch duplicates, missing icons, or leaked core statuses.
    let log = false;
    try {
      log = !!(
        game.settings.get("uesrpg-3ev4", "opposedDebug") ||
        game.settings.get("uesrpg-3ev4", "skillRollDebug") ||
        game.settings.get("uesrpg-3ev4", "debugSkillTN")
      );
    } catch (_e) {
      log = false;
    }

    auditConditionRegistry({ log });
  });

  registerConditionHooks();
  registerConditionTurnTicker();

  game.uesrpg = game.uesrpg || {};
  game.uesrpg.conditions = ConditionsAPI;
}