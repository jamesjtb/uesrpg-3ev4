/**
 * module/wounds/index.js
 */

import { registerWoundHooks, WoundsAPI } from "./wound-engine.js";

let _woundsRegistered = false;

export function registerWounds() {
  if (_woundsRegistered) return;
  _woundsRegistered = true;
  registerWoundHooks();
  game.uesrpg = game.uesrpg || {};
  game.uesrpg.wounds = WoundsAPI;
}