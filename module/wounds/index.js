/**
 * module/wounds/index.js
 */

import { registerWoundHooks, WoundsAPI } from "./wound-engine.js";

export function registerWounds() {
  registerWoundHooks();
  game.uesrpg = game.uesrpg || {};
  game.uesrpg.wounds = WoundsAPI;
}
