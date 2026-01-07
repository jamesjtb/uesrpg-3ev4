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
import { resolveShockTestFromChat } from "../wounds/wound-engine.js";
import { requestUpdateChatMessage } from "../helpers/authority-proxy.js";

let _chatHooksRegistered = false;

/**
 * Resolve an Actor from a UUID or speaker.
 * @param {ChatMessage} message
 * @param {string|null} uuid
 * @returns {Actor|null}
 */
async function _maybeConsumeAmmoFromMessage(message) {
  const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed;
  const pendingAmmo = opposed?.pendingAmmo ?? null;
  if (!pendingAmmo) return;
  if (opposed?.ammoConsumed) return;

  // Ensure exactly one client performs consumption.
  const activeGM = game.users.activeGM;
  const shouldRun = activeGM ? (game.user.id === activeGM.id) : message.isAuthor;
  if (!shouldRun) return;

  const ok = await OpposedWorkflow.consumePendingAmmo(pendingAmmo);
  await requestUpdateChatMessage(message, {
    "flags.uesrpg-3ev4.opposed.ammoConsumed": true,
    "flags.uesrpg-3ev4.opposed.ammoConsumedOk": !!ok,
    "flags.uesrpg-3ev4.opposed.ammoConsumedAt": Date.now(),
  });
}

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


async function _onShockAction(event, message) {
  event.preventDefault();
  const el = event.currentTarget;
  const action = el?.dataset?.uesShockAction;
  if (!action) return;

  const actorUuid = el?.dataset?.actorUuid;
  const woundEffectId = el?.dataset?.woundEffectId;
  if (!actorUuid || !woundEffectId) {
    ui.notifications?.warn?.("Shock: missing actor or wound reference.");
    return;
  }

  let actor = null;
  try {
    actor = fromUuidSync(actorUuid);
  } catch (_e) {
    actor = null;
  }

  if (!actor) {
    ui.notifications?.warn?.("Shock: actor not found.");
    return;
  }

  if (!canUserRollActor(game.user, actor)) {
    ui.notifications?.warn?.("You do not have permission to roll for this actor.");
    return;
  }

  try {
    await resolveShockTestFromChat({ actorUuid, woundEffectId, action });
  } catch (err) {
    console.error("UESRPG | Shock roll handler failed", err);
    ui.notifications?.error?.("Shock roll failed. Check console for details.");
  }
}

async function _onOpposedAction(ev, message) {
  ev.preventDefault();
  const btn = ev.currentTarget;
  const action = btn.dataset.uesOpposedAction;
  await OpposedWorkflow.handleAction(message, action);
}

/**
 * Determine whether an updateChatMessage change object is relevant for banked-choice opposed auto-rolling.
 * We only care about updates that affect the opposed flags or the chat content of an opposed card.
 *
 * @param {object} changes
 * @returns {boolean}
 */
function _isRelevantOpposedUpdate(changes) {
  if (!changes || typeof changes !== "object") return false;

  // Direct top-level content update.
  if (Object.prototype.hasOwnProperty.call(changes, "content")) return true;

  // Dot-path style updates (defensive; some update payloads may include these).
  for (const k of Object.keys(changes)) {
    if (k === "content") return true;
    if (typeof k === "string" && k.startsWith("flags.uesrpg-3ev4.opposed")) return true;
  }

  // Nested flags update payloads.
  const flags = changes.flags;
  if (flags && typeof flags === "object") {
    const ns = flags["uesrpg-3ev4"];
    if (ns && typeof ns === "object" && Object.prototype.hasOwnProperty.call(ns, "opposed")) return true;
  }

  return false;
}

/**
 * Register chat handlers (v13).
 */
export function initializeChatHandlers() {
  if (_chatHooksRegistered) return;
  _chatHooksRegistered = true;

  Hooks.on("createChatMessage", (message) => {
    _maybeConsumeAmmoFromMessage(message).catch((err) => console.error("UESRPG | Ammo consumption hook failed", err));

    // Opposed workflows: bank attacker/defender roll results into the parent opposed card.
    // This is intentionally executed only by the active GM when present (or by the parent
    // message author when no GM is active) to avoid concurrent updates.
    try {
      const meta = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      const parentId = meta?.parentMessageId ?? null;
      const stage = meta?.stage ?? null;

      if (parentId && stage) {
        const parent = game.messages.get(parentId) ?? null;
        if (parent) {
          const activeGM = game.users.activeGM;
          const shouldRun = activeGM ? (game.user.id === activeGM.id) : parent.isAuthor;
          if (shouldRun) {
            OpposedWorkflow.applyExternalRollMessage(message).catch((err) => console.error("UESRPG | Opposed external roll banking failed", err));
          }
        }
      }
    } catch (err) {
      console.error("UESRPG | Opposed external roll banking hook failed", err);
    }

    // Skill opposed workflows use a separate workflow card; the roll messages include
    // a lightweight meta flag that identifies the parent card.
    try {
      const meta = message?.flags?.["uesrpg-3ev4"]?.skillOpposedMeta ?? null;
      const parentId = meta?.parentMessageId ?? null;
      if (parentId) {
        const parent = game.messages.get(parentId) ?? null;
        if (parent) {
          const activeGM = game.users.activeGM;
          const shouldRun = activeGM ? (game.user.id === activeGM.id) : parent.isAuthor;
          if (shouldRun) {
            SkillOpposedWorkflow.applyExternalRollMessage(message).catch((err) => console.error("UESRPG | Skill opposed external roll banking failed", err));
          }
        }
      }
    } catch (err) {
      console.error("UESRPG | Skill opposed external roll banking hook failed", err);
    }
  });



  Hooks.on("updateChatMessage", (message, changes, _options, _userId) => {
    // Banked-choice opposed workflows: once both sides have committed, rolling proceeds automatically.
    // Guard against unrelated message updates to minimize hook overhead.
    try {
      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isRelevantOpposedUpdate(changes)) return;
      const activeGM = game.users.activeGM ?? null;
      if (activeGM) {
        OpposedWorkflow.maybeAutoRollBanked(message).catch((err) => console.error("UESRPG | Opposed banked GM auto-roll hook failed", err));
      } else {
        OpposedWorkflow.maybeAutoRollBankedNoGM(message).catch((err) => console.error("UESRPG | Opposed banked no-GM auto-roll hook failed", err));
      }
    } catch (err) {
      console.error("UESRPG | Opposed banked auto-roll update hook failed", err);
    }
  });

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

    // Shock Test chat card buttons (Wounds).
    root.querySelectorAll("[data-ues-shock-action]").forEach((el) => {
      const actorUuid = el.dataset.actorUuid;
      let actor = null;
      try {
        actor = actorUuid ? fromUuidSync(actorUuid) : null;
      } catch (_e) {
        actor = null;
      }

      if (actor && !canUserRollActor(game.user, actor)) {
        el.setAttribute("disabled", "disabled");
        el.setAttribute("title", "You do not have permission to roll for this actor.");
      }

      el.addEventListener("click", (ev) => _onShockAction(ev, message));
    });

    // Collapsible action cards (sheet quick-actions).
    // IMPORTANT: Foundry chat sanitization may strip the `hidden` attribute.
    // We therefore enforce the default collapsed state at render time and
    // toggle via inline `style.display`.
    root.querySelectorAll(".uesrpg-action-card[data-ues-action-card]").forEach((card) => {
      const body = card.querySelector("[data-ues-action-card-body]");
      const btn = card.querySelector("[data-ues-action-card-toggle]");
      if (!body || !btn) return;

      // One-time initialization per rendered DOM instance.
      if (!card.dataset.uesActionCardInit) {
        card.dataset.uesActionCardInit = "1";

        // Default collapsed unless explicitly marked expanded.
        const isExpanded = String(card.dataset.uesActionCardExpanded ?? "0") === "1";
        body.style.display = isExpanded ? "" : "none";
        body.setAttribute("aria-hidden", isExpanded ? "false" : "true");
        btn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        btn.textContent = isExpanded ? "Collapse" : "Expand";
      }

      // Ensure consistent button styling (prevents wrap like "Expan\nd").
      if (!btn.style.whiteSpace) btn.style.whiteSpace = "nowrap";
      if (!btn.style.display) btn.style.display = "inline-flex";
      if (!btn.style.alignItems) btn.style.alignItems = "center";
      if (!btn.style.justifyContent) btn.style.justifyContent = "center";

      if (btn.dataset.uesActionCardToggleInit) return;
      btn.dataset.uesActionCardToggleInit = "1";

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();

        const currentlyCollapsed = (body.style.display === "none");
        const nextExpanded = currentlyCollapsed;

        body.style.display = nextExpanded ? "" : "none";
        body.setAttribute("aria-hidden", nextExpanded ? "false" : "true");

        // Persist state on the DOM dataset (survives subsequent hook re-renders
        // for the same message render instance).
        card.dataset.uesActionCardExpanded = nextExpanded ? "1" : "0";

        btn.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
        btn.textContent = nextExpanded ? "Collapse" : "Expand";
      });
    });

  });
}

/**
 * Backwards-compatible export expected by some init scripts.
 */
export function registerCombatChatHooks() {
  initializeChatHandlers();
}