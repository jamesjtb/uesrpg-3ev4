/**
 * module/combat/chat-handlers.js
 * Foundry VTT v13-compatible chat card handlers for UESRPG 3ev4.
 *
 * Exports expected by module/handlers/init.js:
 *  - initializeChatHandlers()
 *  - registerCombatChatHooks()
 *
 * Notes:
 *  - Uses Hooks.on("renderChatMessageHTML") (v13) instead of deprecated renderChatMessage
 *  - Attaches delegated click handlers for:
 *      - Apply Damage
 *      - Apply Healing
 *      - Future opposed-roll actions via [data-ues-opposed-action]
 */

import { applyDamage, applyHealing, DAMAGE_TYPES } from "./damage-automation.js";

/**
 * Resolve an Actor from a UUID or speaker.
 * @param {ChatMessage} message
 * @param {string|null} uuid
 * @returns {Actor|null}
 */
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

/**
 * Handle Apply Damage click.
 * Expects dataset attributes:
 *  - data-target-uuid (optional)
 *  - data-damage (raw)
 *  - data-damage-type
 *  - data-dos-bonus
 *  - data-penetration
 *  - data-hit-location
 *  - data-source
 */
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

  await applyDamage(targetActor, dmg, damageType, {
    dosBonus,
    penetration,
    hitLocation,
    source
  });
}

/**
 * Handle Apply Healing click.
 * Expects dataset attributes:
 *  - data-target-uuid (optional)
 *  - data-healing
 *  - data-source
 */
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

/**
 * Stub for opposed workflow chat actions.
 * We will implement these actions in the opposed workflow phase.
 */
async function _onOpposedAction(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const action = btn.dataset.uesOpposedAction;
  console.warn("UESRPG | Opposed action clicked but not yet implemented:", action, btn.dataset);
}

/**
 * Register chat handlers (v13).
 */
export function initializeChatHandlers() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    // html is an HTMLElement in v13
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
}

/**
 * Backwards-compatible export expected by init.js.
 */
export function registerCombatChatHooks() {
  initializeChatHandlers();
}
