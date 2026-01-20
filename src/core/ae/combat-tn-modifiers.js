/**
 * src/core/ae/combat-tn-modifiers.js
 *
 * Deterministic aggregation of combat TN modifiers sourced from Active Effects.
 *
 * This system deliberately avoids relying on Foundry's implicit AE application
 * semantics for combat math. Instead, we evaluate a subset of AE change keys
 * at roll time.
 *
 * Chapter 5 in-combat effects (e.g. Press Advantage, Overextend) are modeled as
 * temporary Active Effects with contextual scoping stored in flags:
 *   effect.flags.uesrpg.conditions = { opponentUuid, attackMode, ... }
 *
 * This helper collects those effects deterministically and provides a breakdown
 * suitable for chat-card TN debrief.
 */

import { evaluateAEModifierKeysDetailed } from "./modifier-evaluator.js";

/**
 * @typedef {object} CombatTNContext
 * @property {string|null} [opponentUuid]
 * @property {"melee"|"ranged"|"magic"|string} [attackMode]
 */

/**
 * Collect Active Effect combat TN modifier entries.
 *
 * Keys are intentionally conservative and versioned:
 * - Generic combat lanes:
 *   - system.modifiers.combat.attackTN
 *   - system.modifiers.combat.defenseTN.total
 *   - system.modifiers.combat.defenseTN.<evade|block|parry|counter>
 * - Opposed-only lane (Chapter 5 actions):
 *   - system.modifiers.combat.opposed.attackTN
 *
 * @param {Actor} actor
 * @param {"attacker"|"defender"} role
 * @param {string|null} defenseType
 * @param {CombatTNContext} [context]
 * @returns {{ total: number, entries: Array<{key:string,label:string,value:number,source:string,detail?:string}>, totalsByKey: Record<string, number> }}
 */
export function collectCombatTNModifiersFromAE(actor, role, defenseType = null, context = {}) {
  const keys = [];

  if (role === "attacker") {
    // Generic lane (legacy/other effects)
    keys.push("system.modifiers.combat.attackTN");
    // Opposed-only lane used by Chapter 5 temporary effects
    keys.push("system.modifiers.combat.opposed.attackTN");
  } else if (role === "defender") {
    keys.push("system.modifiers.combat.defenseTN.total");
    if (defenseType) keys.push(`system.modifiers.combat.defenseTN.${defenseType}`);
  }

  const result = evaluateAEModifierKeysDetailed(actor, keys, {
    context,
    enforceConditions: true,
    dedupeByOrigin: true,
    debug: false
  });

  const totalsByKey = result?.totalsByKey ?? {};
  /** @type {Array<{key:string,label:string,value:number,source:string,detail?:string}>} */
  const entries = [];

  // We keep breakdown ordering stable: preserve evaluation order and label by effect name.
  for (const entry of (result?.entries ?? [])) {
    const value = Number(entry?.value ?? 0) || 0;
    if (!value) continue;

    entries.push({
      key: `ae-${entry.effectId ?? foundry.utils.randomID()}`,
      label: String(entry.label ?? "Active Effect"),
      value,
      source: "ae",
      detail: entry.effectUuid ? String(entry.effectUuid) : undefined
    });
  }

  const total = keys.reduce((sum, k) => sum + (Number(totalsByKey?.[k] ?? 0) || 0), 0);
  return { total, entries, totalsByKey };
}
