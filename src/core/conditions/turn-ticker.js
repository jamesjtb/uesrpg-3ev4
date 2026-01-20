/**
 * src/core/conditions/turn-ticker.js
 *
 * Deterministic end-of-turn condition ticking.
 * Runs GM-only on updateCombat.
 *
 * Also handles start-of-turn expiry for temporary action effects (e.g., Defensive Stance)
 * flagged with `flags.uesrpg.expiresOnTurnStart === true`.
 */

import { tickConditionsEndTurn } from "./condition-engine.js";
import { tickWoundsEndTurn } from "../wounds/wound-engine.js";
import { getActorTraitValue } from "../traits/trait-registry.js";
import { postRegenerationPrompt } from "../traits/trait-automation.js";
import { requestUpdateDocument } from "../../utils/authority-proxy.js";

let _registered = false;

function _getPreviousCombatant(combat, changed) {
  if (!combat) return null;
  const turns = combat.turns ?? [];
  if (!Array.isArray(turns) || turns.length === 0) return null;

  // We only tick when turn/round changes.
  if (!("turn" in (changed ?? {})) && !("round" in (changed ?? {}))) return null;

  const turn = Number(combat.turn ?? 0);

  // Combat starting guard: first round, first turn.
  if (turn === 0 && Number(combat.round ?? 0) === 1 && Number(changed?.round ?? 1) === 1) return null;

  const prevIndex = (turn - 1) < 0 ? (turns.length - 1) : (turn - 1);
  return turns[prevIndex] ?? null;
}

async function _expireStartOfTurnEffects(combat, changed) {
  if (!combat) return;
  // Only react on turn/round changes.
  if (!((changed ?? {}) && ("turn" in changed || "round" in changed))) return;

  const turns = combat.turns ?? [];
  if (!Array.isArray(turns) || turns.length === 0) return;

  const idx = Number(combat.turn ?? 0);
  const current = turns[idx] ?? null;
  const actor = current?.actor ?? null;
  if (!actor) return;
  const currentTurn = Number(combat.turn ?? 0);
  const currentRound = Number(combat.round ?? 0);
  const currentCombatantId = String(current?.id ?? "");

  const combatId = String(combat.id ?? "");

  // Remove any temporary effects flagged to expire at the start of the actor's next turn.
  const effects = actor?.effects?.contents ?? [];
  const toRemove = effects.filter((e) => {
    if (!e || e.disabled) return false;
    const flags = e.flags?.uesrpg ?? null;
    if (!flags) return false;
    if (flags.expiresOnTurnStart !== true) return false;
    const eCombatId = String(flags.expiresCombatId ?? "");
    // If a combat id is recorded, it must match to avoid expiring effects across combats.
    if (eCombatId && combatId && eCombatId !== combatId) return false;
    const eCombatantId = String(flags.expiresCombatantId ?? "");
    // If a combatant id is recorded, it must match the current combatant to avoid cross-combatant expiry.
    if (eCombatantId && currentCombatantId && eCombatantId !== currentCombatantId) return false;

    const hasRoundTurn = (flags.expiresRound !== undefined || flags.expiresTurn !== undefined);
    if (hasRoundTurn) {
      const eRound = Number(flags.expiresRound ?? NaN);
      const eTurn = Number(flags.expiresTurn ?? NaN);
      if (Number.isFinite(eRound) && Number.isFinite(currentRound) && eRound !== currentRound) return false;
      if (Number.isFinite(eTurn) && Number.isFinite(currentTurn) && eTurn !== currentTurn) return false;
    }
    return true;
  });

  if (toRemove.length === 0) return;

  // Avoid noisy errors when an effect is already removed by another system/module
  // (e.g., concurrent cleanup). Delete only currently-existing effect ids.
  const uniqueIds = Array.from(new Set(toRemove.map((e) => e?.id).filter(Boolean)));
  const existingIds = uniqueIds.filter((id) => actor.effects?.get?.(id));
  if (existingIds.length === 0) return;

  try {
    await actor.deleteEmbeddedDocuments("ActiveEffect", existingIds);
  } catch (err) {
    // If the bulk delete fails due to a stale id race, retry individually for those that still exist.
    const msg = String(err?.message ?? "");
    const stillExisting = existingIds.filter((id) => actor.effects?.get?.(id));

    if (stillExisting.length > 0) {
      try {
        await Promise.allSettled(stillExisting.map((id) => actor.effects.get(id).delete()));
        return;
      } catch (_retryErr) {
        // Fall through to warn below.
      }
    }

    // Suppress “does not exist” noise; warn on other unexpected failures.
    if (!msg.includes("does not exist")) {
      console.warn("UESRPG | Start-of-turn effect expiry failed", err);
    }
  }
}

async function _postRegenerationPrompts(combat, changed) {
  if (!combat) return;
  if (!changed || !Object.prototype.hasOwnProperty.call(changed, "round")) return;

  const round = Number(combat.round ?? 0);
  const combatants = Array.isArray(combat.combatants) ? combat.combatants : Array.from(combat.combatants ?? []);

  for (const c of combatants) {
    const actor = c?.actor ?? null;
    if (!actor) continue;

    const value = Number(getActorTraitValue(actor, "regeneration", { mode: "max" })) || 0;
    if (value <= 0) continue;

    const lastRound = Number(actor.getFlag("uesrpg-3ev4", "regenerationPromptRound") ?? 0);
    if (lastRound === round) continue;

    await postRegenerationPrompt({ actor, traitValue: value, round });
    await requestUpdateDocument(actor, { "flags.uesrpg-3ev4.regenerationPromptRound": round });
  }
}

export function registerConditionTurnTicker() {
  if (_registered) return;
  _registered = true;

  Hooks.on("updateCombat", async (combat, changed, options, userId) => {
    try {
      if (!game.user?.isGM) return;
      // Only react to the GM's combat updates.
      if (userId && game.userId && userId !== game.userId) return;

      const prevCombatant = _getPreviousCombatant(combat, changed);
      const actor = prevCombatant?.actor ?? null;
      if (actor) {
        await tickConditionsEndTurn(actor);
        await tickWoundsEndTurn(actor);
      }

      // Start-of-turn expiry for temporary action effects (e.g., Defensive Stance).
      await _expireStartOfTurnEffects(combat, changed);

      // Start-of-round regeneration prompts.
      await _postRegenerationPrompts(combat, changed);
    } catch (err) {
      console.warn("UESRPG | Condition/Wound turn ticker failed", err);
    }
  });
}
