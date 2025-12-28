/**
 * module/combat/chat-handlers.js
 * Foundry VTT v13-compatible chat card handlers for UESRPG 3ev4.
 *
 * Exports expected by init.js:
 *  - initializeChatHandlers()
 *  - registerCombatChatHooks()
 *
 * Notes:
 *  - Uses Hooks.on("renderChatMessageHTML") (v13) instead of deprecated renderChatMessage
 *  - Registers only once (guards against double-calls from init.js)
 */

import { applyHealing, DAMAGE_TYPES } from "./damage-automation.js";
import { applyDamageResolved } from "./damage-resolver.js";
import { OpposedWorkflow } from "./opposed-workflow.js";
import { SkillOpposedWorkflow } from "../skills/opposed-workflow.js";
import { canUserRollActor } from "../helpers/permissions.js";

let _chatHooksRegistered = false;

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

async function _onApplyDamage(ev, message) {
  ev.preventDefault();

  const btn = ev.currentTarget;
  const targetUuid = btn.dataset.targetUuid || null;
  const rawDamage = Number(btn.dataset.damage || 0);
  const damageType = btn.dataset.damageType || DAMAGE_TYPES.PHYSICAL;
  const dosBonus = Number(btn.dataset.dosBonus || 0);
  const penetration = Number(btn.dataset.penetration || 0);
  const hitLocation = btn.dataset.hitLocation || "Body";
  const source = btn.dataset.source || (message?.speaker?.alias ?? "Unknown");
  const penetrateArmorForTriggers = String(btn.dataset.penetrateArmor ?? "0") === "1";
	const forcefulImpact = String(btn.dataset.forcefulImpact ?? "0") === "1";
	const pressAdvantage = String(btn.dataset.pressAdvantage ?? "0") === "1";
  const ignoreReduction = String(btn.dataset.ignoreReduction ?? "0") === "1";

  // Optional enrichment for RAW weapon trait bonuses.
  // If present, these are resolved safely and passed through to applyDamage().
  const attackerActorUuid = btn.dataset.attackerActorUuid || null;
  const weaponUuid = btn.dataset.weaponUuid || null;

  const targetActor = _resolveActor(message, targetUuid);
  if (!targetActor) {
    ui.notifications.warn("No valid target actor found for damage application.");
    return;
  }

  let attackerActor = null;
  let weapon = null;

  try {
    if (attackerActorUuid) {
      const a = fromUuidSync(attackerActorUuid);
      attackerActor = (a?.documentName === "Actor") ? a : (a?.actor ?? null);
    }
  } catch (_e) {
    attackerActor = null;
  }

  try {
    if (weaponUuid) {
      weapon = fromUuidSync(weaponUuid) ?? null;
    }
  } catch (_e) {
    weapon = null;
  }

  await applyDamageResolved(targetActor, {
    rawDamage,
    damageType,
    dosBonus,
    penetration,
    hitLocation,
    source,
    ignoreReduction,
    penetrateArmorForTriggers,
    forcefulImpact,
    pressAdvantage,
    weapon,
    attackerActor,
  });
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



async function _onSkillOpposedAction(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const action = btn.dataset.uesSkillOpposedAction;
  await SkillOpposedWorkflow.handleAction(message, action, { event: ev });
}

function _getSkillOpposedState(message) {
  const raw = message?.flags?.["uesrpg-3ev4"]?.skillOpposed;
  if (!raw) return null;
  if (raw && typeof raw === "object" && Number(raw.version) >= 1 && raw.state) return raw.state;
  if (raw && typeof raw === "object" && raw.attacker && raw.defender) return raw;
  return null;
}

async function _onOpposedAction(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const action = btn.dataset.uesOpposedAction;
  await OpposedWorkflow.handleAction(message, action);
}

/**
 * Register chat handlers (v13).
 */
export function initializeChatHandlers() {
  if (_chatHooksRegistered) return;
  _chatHooksRegistered = true;

  Hooks.on("renderChatMessageHTML", (message, html) => {
    // html is an HTMLElement in v13, but some modules provide a jQuery wrapper.
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

    // Skill opposed-roll chat card buttons
    root.querySelectorAll("[data-ues-skill-opposed-action]").forEach((el) => {
      const action = el.dataset.uesSkillOpposedAction;
      const data = _getSkillOpposedState(message);
      let actor = null;
      try {
        const actorUuid = (action === "attacker-roll") ? data?.attacker?.actorUuid : (action === "defender-roll") ? data?.defender?.actorUuid : null;
        actor = actorUuid ? fromUuidSync(actorUuid) : null;
      } catch (_e) {
        actor = null;
      }

      // Permission-aware button state
      if (actor && !canUserRollActor(game.user, actor)) {
        el.setAttribute("disabled", "disabled");
        el.setAttribute("title", "You do not have permission to roll for this actor.");
      }

      el.addEventListener("click", (ev) => _onSkillOpposedAction(ev, message));
    });
  });
}

/**
 * Backwards-compatible export expected by some init scripts.
 */
export function registerCombatChatHooks() {
  initializeChatHandlers();
}
