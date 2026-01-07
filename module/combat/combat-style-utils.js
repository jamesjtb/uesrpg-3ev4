/**
 * module/combat/combat-style-utils.js
 *
 * Combat Style helpers (Option 2):
 *  - For PCs: "known" Special Actions are derived ONLY from an explicitly selected active combat style stored on the Actor.
 *  - For NPCs: "known" Special Actions are stored directly on the Actor (flag), because NPCs may not use Combat Style items.
 *
 * Actor flag lanes:
 *  - flags.uesrpg-3ev4.activeCombatStyleId
 *  - flags.uesrpg-3ev4.npcSpecialActionsKnown   (object map: { [specialActionId]: true|false })
 */

import { SPECIAL_ACTIONS } from "../config/special-actions.js";

export const SYSTEM_ID = "uesrpg-3ev4";
export const NPC_KNOWN_FLAG = "npcSpecialActionsKnown";

/**
 * @param {Actor} actor
 * @returns {string|null}
 */
export function getActiveCombatStyleId(actor) {
  try {
    const v = actor?.getFlag?.(SYSTEM_ID, "activeCombatStyleId");
    return v ? String(v) : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Explicit active combat style lookup (no fallback).
 *
 * @param {Actor} actor
 * @returns {Item|null}
 */
export function getExplicitActiveCombatStyleItem(actor) {
  const id = getActiveCombatStyleId(actor);
  if (!id) return null;
  return actor?.items?.get?.(id) ?? null;
}

/**
 * Resolve the "known" Special Action id set from an actor's explicit active style.
 * (PC lane)
 *
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function getKnownSpecialActionIdsFromActiveStyle(actor) {
  const style = getExplicitActiveCombatStyleItem(actor);
  const map = style?.system?.specialAdvantages;
  const known = new Set();

  if (map && typeof map === "object") {
    for (const sa of SPECIAL_ACTIONS) {
      if (map?.[sa.id] === true) known.add(sa.id);
    }
  }

  return known;
}

/**
 * Resolve the NPC-known map from Actor flag lane.
 *
 * @param {Actor} actor
 * @returns {Record<string, boolean>}
 */
export function getNpcSpecialActionsKnownMap(actor) {
  try {
    const raw = actor?.getFlag?.(SYSTEM_ID, NPC_KNOWN_FLAG);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw;
  } catch (_e) {
    return {};
  }
}

/**
 * Determine which Special Action ids are "known" for this Actor.
 *
 * @param {Actor} actor
 * @returns {Set<string>}
 */
export function getKnownSpecialActionIds(actor) {
  const type = String(actor?.type ?? "").toLowerCase();
  if (type === "npc") {
    const map = getNpcSpecialActionsKnownMap(actor);
    const known = new Set();
    for (const sa of SPECIAL_ACTIONS) {
      if (map?.[sa.id] === true) known.add(sa.id);
    }
    return known;
  }

  return getKnownSpecialActionIdsFromActiveStyle(actor);
}

/**
 * @param {Actor} actor
 * @returns {Array<{id:string,name:string,actionType:string,known:boolean}>}
 */
export function buildSpecialActionsForActor(actor) {
  const knownIds = getKnownSpecialActionIds(actor);
  return SPECIAL_ACTIONS.map((sa) => ({
    id: sa.id,
    name: sa.name,
    actionType: sa.actionType,
    known: knownIds.has(sa.id),
  }));
}

/**
 * Determine whether a Primary action is legal for the actor now.
 * Secondary actions are allowed even when it's not their turn.
 *
 * @param {Actor} actor
 * @param {"primary"|"secondary"} actionType
 * @returns {boolean}
 */
export function isSpecialActionUsableNow(actor, actionType) {
  const t = String(actionType ?? "").toLowerCase();
  if (t === "secondary") return true;
  if (t !== "primary") return true;

  const combat = game?.combat;
  if (!combat || !combat.started) return true;

  const active = combat.combatant;
  const actorId = actor?.id;
  return Boolean(active && active.actor?.id === actorId);
}
