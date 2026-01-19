/**
 * module/combat/action-economy.js
 * Foundry VTT v13 - UESRPG 3ev4
 *
 * Canonical Action Economy service:
 * - Action Points spending
 * - Aim chain break helper
 * - Attack gating (AP + Defensive Stance)
 * - Standardized action chat card posting
 *
 * IMPORTANT:
 * - Does not mutate document data directly; uses Document update APIs.
 * - Keeps behavior deterministic and reversible.
 */

import { requestDeleteEmbeddedDocuments, requestUpdateDocument } from "../helpers/authority-proxy.js";

/**
 * Safe, minimal HTML escaping for plain-text insertion into markup.
 * We keep this local (not exported) to avoid leaking templating concerns.
 */
function _escapeHtml(str) {
  const s = String(str ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function _getAP(actor) {
  const v = Number(actor?.system?.action_points?.value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function _findEnabledEffectByKey(actor, key) {
  if (!actor) return null;
  const k = String(key ?? "").trim();
  if (!k) return null;
  return actor.effects?.find((e) => !e.disabled && e?.flags?.uesrpg?.key === k) ?? null;
}

function _buildActionCardMarkup({ title, body, collapsed = true } = {}) {
  const safeTitle = _escapeHtml(title);
  const isCollapsed = collapsed !== false;

  // Body is expected to be a markup fragment produced by system code.
  // Do not escape it here (would break intended structure), but isolate it in a container.
  const bodyHtml = String(body ?? "");

  const expanded = isCollapsed ? "false" : "true";
  const ariaHidden = isCollapsed ? "true" : "false";
  const display = isCollapsed ? "none" : "block";
  const btnLabel = isCollapsed ? "Expand" : "Collapse";

  return `
    <div class="uesrpg-action-card" data-ues-action-card="1">
      <div class="uesrpg-action-card__header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
        <h3 style="margin:0; border:none;">${safeTitle}</h3>
        <button
          type="button"
          class="uesrpg-action-card__toggle"
          data-ues-action-card-toggle="1"
          aria-expanded="${expanded}"
          style="display:inline-flex; align-items:center; justify-content:center; min-width:84px; line-height:1; padding:4px 10px; text-align:center;"
        >${btnLabel}</button>
      </div>
      <div class="uesrpg-action-card__body" data-ues-action-card-body="1" aria-hidden="${ariaHidden}" style="display:${display};">
        ${bodyHtml}
      </div>
    </div>
  `;
}

export const ActionEconomy = {
  /**
   * Spend Action Points (AP) from an actor.
   *
   * @param {Actor} actor
   * @param {number} cost
   * @param {{reason?: string, silent?: boolean}} opts
   * @returns {Promise<boolean>} true if spent (or cost<=0), false if insufficient or update failed
   */
  async spendAP(actor, cost = 0, { reason = "", silent = false } = {}) {
    const n = Number(cost ?? 0);
    const spend = Number.isFinite(n) ? n : 0;
    if (!actor || spend <= 0) return true;

    const current = _getAP(actor);
    if (current < spend) {
      if (!silent) ui.notifications?.warn?.(`${actor.name} does not have enough Action Points (${current}/${spend}).`);
      return false;
    }

    const next = Math.max(0, current - spend);
    try {
      await requestUpdateDocument(actor, { "system.action_points.value": next });
      return true;
    } catch (err) {
      console.error("UESRPG | ActionEconomy.spendAP failed", { actor: actor?.uuid, spend, reason, err });
      ui.notifications?.error?.("Failed to spend Action Points. See console for details.");
      return false;
    }
  },

  /**
   * Break the Aim chain by removing the enabled Aim effect, if present.
   *
   * @param {Actor} actor
   * @param {{reason?: string}} opts
   */
  async breakAim(actor, { reason = "" } = {}) {
    const ef = _findEnabledEffectByKey(actor, "aim");
    if (!ef) return;

    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
    } catch (err) {
      console.warn("UESRPG | ActionEconomy.breakAim failed to delete Aim effect", { actor: actor?.uuid, effectId: ef?.id, reason, err });
    }
  },

  /**
   * Gate an attack entry point on:
   *  - AP availability
   *  - Defensive Stance restriction
   *
   * @param {Actor} actor
   * @param {{reason?: string}} opts
   * @returns {Promise<boolean>} true if allowed
   */
  async assertCanAttack(actor, { reason = "" } = {}) {
    if (!actor) return false;

    const ap = _getAP(actor);
    if (ap <= 0) {
      ui.notifications?.warn?.(`${actor.name} has no Action Points left to attack.`);
      return false;
    }

    const defensive = _findEnabledEffectByKey(actor, "defensiveStance");
    if (defensive) {
      ui.notifications?.warn?.("Defensive Stance is active: you cannot attack until your next Turn.");
      return false;
    }

    return true;
  },

  /**
   * Post a standardized collapsible action card to chat.
   *
   * @param {{title: string, body: string, collapsed?: boolean, actor?: Actor}} data
   * @returns {Promise<ChatMessage|null>}
   */
  async postActionCard({ title = "", body = "", collapsed = true, actor = null } = {}) {
    const content = _buildActionCardMarkup({ title, body, collapsed });
    const speaker = actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker();

    try {
      return await ChatMessage.create({ speaker, content });
    } catch (err) {
      console.error("UESRPG | ActionEconomy.postActionCard failed", { title, actor: actor?.uuid, err });
      return null;
    }
  },
};
