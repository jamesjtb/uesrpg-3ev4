/**
 * src/core/config/special-actions.js
 *
 * Canonical Special Actions registry (UESRPG 3ev4, Chapter 5 - Advanced Mechanics).
 *
 * Rules used by automation:
 * - All Special Actions are always available from the sheet "Special Actions" list.
 * - Only Special Actions marked as known in the actor's *active combat style* may be offered
 *   as Advantage spend options.
 * - Action type matters:
 *   - Primary: only usable on the actor's own turn.
 *   - Secondary: usable on the actor's own turn OR as a reaction.
 */

/** @typedef {"primary"|"secondary"} SpecialActionType */

/**
 * @type {Array<{id: string, name: string, actionType: SpecialActionType}>}
 */
export const SPECIAL_ACTIONS = [
  { id: "arise", name: "Arise", actionType: "secondary" },
  { id: "bash", name: "Bash", actionType: "primary" },
  // Chapter 5: user-confirmed Secondary
  { id: "blindOpponent", name: "Blind Opponent", actionType: "secondary" },
  { id: "disarm", name: "Disarm", actionType: "primary" },
  { id: "feint", name: "Feint", actionType: "primary" },
  { id: "forceMovement", name: "Force Movement", actionType: "primary" },
  { id: "resist", name: "Resist", actionType: "secondary" },
  { id: "trip", name: "Trip", actionType: "secondary" }
];

/**
 * @param {string} id
 * @returns {{id:string,name:string,actionType:SpecialActionType}|null}
 */
export function getSpecialActionById(id) {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return SPECIAL_ACTIONS.find(sa => sa.id === key) ?? null;
}
