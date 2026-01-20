/**
 * src/utils/permissions.js
 *
 * Centralized permission checks for roll workflows.
 * Target: Foundry VTT v13.351.
 */

/**
 * Whether the given user can perform rolls on behalf of the actor.
 *
 * Notes:
 * - GM can always roll.
 * - Otherwise require ownership.
 */
export function canUserRollActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  return Boolean(actor.isOwner);
}

/**
 * Require that a user can roll for an actor, emitting a UI notification if not.
 * @returns {boolean}
 */
export function requireUserCanRollActor(user, actor, { message = "You do not have permission to roll for this actor." } = {}) {
  const ok = canUserRollActor(user, actor);
  if (!ok) {
    try { ui.notifications?.warn(message); } catch (_e) {}
  }
  return ok;
}
