/**
 * module/combat/chat-handlers.js
 * v13-compatible chat handlers for UESRPG 3ev4.
 *
 * Exports expected by init.js:
 *  - initializeChatHandlers()
 *  - registerCombatChatHooks()
 */

import { applyDamage, applyHealing, DAMAGE_TYPES } from "./damage-automation.js";
import { OpposedWorkflow } from "./opposed-workflow.js";

let _chatHandlersInitialized = false;

function _resolveActor(message, uuid) {
  if (uuid) {
    const doc = fromUuidSync(uuid);
    if (doc?.actor) return doc.actor;
    if (doc?.documentName === "Actor") return doc;
  }
  const sp = message?.speaker;
  if (sp?.token) return canvas?.tokens?.get(sp.token)?.actor ?? null;
  if (sp?.actor) return game.actors?.get(sp.actor) ?? null;
  return null;
}

async function _onApplyDamage(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const targetUuid = btn.dataset.targetUuid || null;
  const dmg = Number(btn.dataset.damage || 0);
  const damageType = btn.dataset.damageType || DAMAGE_TYPES.PHYSICAL;
  const dosBonus = Number(btn.dataset.dosBonus || 0);
  const penetration = Number(btn.dataset.penetration || 0);
  const hitLocation = btn.dataset.hitLocation || "Body";
  const source = btn.dataset.source || (message?.speaker?.alias ?? "Unknown");

  const targetActor = _resolveActor(message, targetUuid);
  if (!targetActor) {
    ui.notifications.warn("No valid target actor found for damage application.");
    return;
  }

  await applyDamage(targetActor, dmg, damageType, { dosBonus, penetration, hitLocation, source });
}

async function _onApplyHealing(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const targetUuid = btn.dataset.targetUuid || null;
  const healing = Number(btn.dataset.healing || 0);
  const source = btn.dataset.source || (message?.speaker?.alias ?? "Healing");

  const targetActor = _resolveActor(message, targetUuid);
  if (!targetActor) {
    ui.notifications.warn("No valid target actor found for healing.");
    return;
  }

  await applyHealing(targetActor, healing, { source });
}

async function _onOpposedAction(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const action = btn.dataset.uesOpposedAction;
  await OpposedWorkflow.handleAction(message, action);
}

export function initializeChatHandlers() {
  // Guard to avoid double-registration (init.js currently calls this twice).
  if (_chatHandlersInitialized) return;
  _chatHandlersInitialized = true;
  Hooks.on("renderChatMessage", (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    root.querySelectorAll(".apply-damage-btn").forEach((el) => {
      el.addEventListener("click", (ev) => _onApplyDamage(ev, message));
    });

    root.querySelectorAll(".apply-healing-btn").forEach((el) => {
      el.addEventListener("click", (ev) => _onApplyHealing(ev, message));
    });

    root.querySelectorAll("[data-ues-opposed-action]").forEach((el) => {
      el.addEventListener("click", (ev) => _onOpposedAction(ev, message));
    });
  });

    root.querySelectorAll(".apply-healing-btn").forEach((el) => {
      el.addEventListener("click", (ev) => _onApplyHealing(ev, message));
    });

    root.querySelectorAll("[data-ues-opposed-action]").forEach((el) => {
      el.addEventListener("click", (ev) => _onOpposedAction(ev, message));
    });
  });
}

export function registerCombatChatHooks() {
  initializeChatHandlers();
}
