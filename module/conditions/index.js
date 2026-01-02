/**
 * module/conditions/index.js
 *
 * Restored conditions entrypoint.
 *
 * The previous automated cleanup removed the `module/conditions/` directory,
 * which caused Foundry to fail loading the system module at boot due to missing
 * imports (404 on /module/conditions/index.js).
 *
 * This module provides:
 * - registerConditions(): installs UESRPG condition status effects into
 *   CONFIG.statusEffects in a non-destructive way.
 * - game.uesrpg.conditions API: currently exposes hasCondition()/listConditions().
 */

import { hasCondition, listConditions } from "./condition-engine.js";

const FLAG_SCOPE = "uesrpg-3ev4";

/**
 * Minimal, system-owned status effect definitions.
 *
 * These are intentionally conservative:
 * - We do not overwrite existing system/module status effects.
 * - We use a known core icon for all entries to avoid missing-path 404 spam.
 * - All effects include the canonical uesrpg condition flag (condition.key).
 */
function _uesStatusEffects() {
  const icon = "icons/svg/mystery-man.svg";

  /**
   * NOTE: ids are canonical keys used across the system.
   * Add here when mechanics need a token-HUD toggle and deterministic detection.
   */
  const ids = [
    "blinded",
    "deafened",
    "dazed",
    "entangled",
    "hidden",
    "immobilized",
    "paralyzed",
    "prone",
    "restrained",
    "slowed",
    "unconscious"
  ];

  const titleCase = (s) => String(s)
    .split(/\s+|-/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return ids.map((id) => ({
    id,
    name: titleCase(id),
    img: icon,
    flags: {
      [FLAG_SCOPE]: {
        condition: { key: id }
      }
    }
  }));
}

function _upsertStatusEffects(effects) {
  const current = Array.isArray(CONFIG.statusEffects) ? CONFIG.statusEffects : [];
  const byId = new Map(current.map((e) => [String(e?.id ?? "").trim().toLowerCase(), e]));

  const next = [...current];
  for (const ef of effects) {
    const id = String(ef?.id ?? "").trim().toLowerCase();
    if (!id) continue;
    if (byId.has(id)) continue;
    next.push(ef);
  }

  CONFIG.statusEffects = next;
}

export function registerConditions() {
  // 1) Token HUD status effects (non-destructive)
  try {
    _upsertStatusEffects(_uesStatusEffects());
  } catch (err) {
    // Do not hard-fail system boot due to third-party status effects.
    console.warn("uesrpg-3ev4 | Failed to register status effects", err);
  }

  // 2) Public system API (used by combat and other subsystems)
  game.uesrpg = game.uesrpg || {};
  game.uesrpg.conditions = {
    hasCondition,
    listConditions
  };
}
