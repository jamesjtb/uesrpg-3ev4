/**
 * Aim audit logging (debug lane).
 * Logs only when the uesrpg-3ev4.debugAim setting is enabled.
 *
 * Events:
 * - apply/stack: stacks + itemUuid
 * - break: reason
 * - consume: weapon/spell uuid
 *
 * Foundry VTT v13 compatible.
 */
export const AimAudit = {
  _enabled() {
    try {
      return Boolean(game?.settings?.get?.("uesrpg-3ev4", "debugAim"));
    } catch (_e) {
      return false;
    }
  },

  applyStack(actor, { stacks = 0, itemUuid = null } = {}) {
    if (!this._enabled()) return;
    console.log("[UESRPG][Aim] apply/stack", {
      actorUuid: actor?.uuid ?? null,
      stacks: Number(stacks) || 0,
      itemUuid: itemUuid ? String(itemUuid) : null
    });
  },

  break(actor, { reason = "" } = {}) {
    if (!this._enabled()) return;
    console.log("[UESRPG][Aim] break", {
      actorUuid: actor?.uuid ?? null,
      reason: reason ? String(reason) : ""
    });
  },

  consume(actor, { itemUuid = null } = {}) {
    if (!this._enabled()) return;
    console.log("[UESRPG][Aim] consume", {
      actorUuid: actor?.uuid ?? null,
      itemUuid: itemUuid ? String(itemUuid) : null
    });
  }
};
