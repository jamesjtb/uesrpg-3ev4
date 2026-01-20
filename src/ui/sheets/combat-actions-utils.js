/**
 * module/sheets/combat-actions-utils.js
 *
 * Sheet utilities for the Combat tab “Actions” surface.
 * - Builds template-friendly equipped summaries
 * - Provides safe quick-action execution (Attack) without duplicating workflow logic
 *
 * Foundry VTT v13 (AppV1) compatible.
 */

/**
 * Build a template-friendly quick-action context for Combat tab UI.
 *
 * Note: This function intentionally operates on the sheetData.actor object
 * (plain objects), not on Actor documents.
 *
 * @param {object} actorData - The sheet actor data object (from sheet getData())
 * @returns {{
 *   combatStyleName: string|null,
 *   meleeWeaponId: string|null,
 *   meleeWeaponName: string|null,
 *   rangedWeaponId: string|null,
 *   rangedWeaponName: string|null,
 *   equippedAmmo: Array<{_id: string, name: string, qty: number|null}>,
 *   equippedArmor: Array<{_id: string, name: string}>,
 *   equippedShields: Array<{_id: string, name: string}>
 * }}
 */
import { ActionEconomy } from "../../core/combat/action-economy.js";
export function buildCombatQuickContext(actorData) {
  const combatStyleName = (actorData?.combatStyle?.[0]?.name) ?? null;

  const equippedWeapons = Array.isArray(actorData?.weapon?.equipped)
    ? actorData.weapon.equipped
    : [];

  const meleeWeapon = equippedWeapons.find(w => (w?.system?.attackMode ?? "melee") !== "ranged") ?? null;
  const rangedWeapon = equippedWeapons.find(w => (w?.system?.attackMode ?? "") === "ranged") ?? null;

  const equippedAmmoDocs = Array.isArray(actorData?.ammunition?.equipped)
    ? actorData.ammunition.equipped
    : [];

  const equippedAmmo = equippedAmmoDocs.map(a => ({
    _id: a?._id,
    name: a?.name ?? "(Unnamed)",
    // Ammunition schema uses system.quantity (not qty)
    qty: Number.isFinite(Number(a?.system?.quantity)) ? Number(a.system.quantity) : null,
  })).filter(a => !!a._id);

  const equippedArmorDocs = Array.isArray(actorData?.armor?.equipped)
    ? actorData.armor.equipped
    : [];

  const equippedShields = equippedArmorDocs
    .filter(a => Boolean(a?.system?.isShield))
    .map(a => ({ _id: a?._id, name: a?.name ?? "(Unnamed)" }))
    .filter(a => !!a._id);

  const equippedArmor = equippedArmorDocs
    .filter(a => !Boolean(a?.system?.isShield))
    .map(a => ({ _id: a?._id, name: a?.name ?? "(Unnamed)" }))
    .filter(a => !!a._id);

  // Optional action economy gating for quick actions.
  // - World setting controls whether AP<=0 disables attack buttons.
  // - If AP is missing/unparseable, quick actions remain enabled.
  const enableActionEconomyUI = Boolean(game?.settings?.get?.("uesrpg-3ev4", "enableActionEconomyUI"));
  const apValueRaw = actorData?.system?.action_points?.value;
  const apValue = Number(apValueRaw);
  const quickAttacksDisabled = enableActionEconomyUI && Number.isFinite(apValue) && apValue <= 0;
  const quickAttacksDisabledReason = quickAttacksDisabled ? "No Action Points remaining." : "";

  return {
    combatStyleName,
    meleeWeaponId: meleeWeapon?._id ?? null,
    meleeWeaponName: meleeWeapon?.name ?? null,
    rangedWeaponId: rangedWeapon?._id ?? null,
    rangedWeaponName: rangedWeapon?.name ?? null,
    equippedAmmo,
    equippedArmor,
    equippedShields,
    quickAttacksDisabled,
    quickAttacksDisabledReason,
  };
}

/**
 * Resolve a Token on the current canvas for a given Actor.
 * Prefers a controlled token for the actor, otherwise uses the first owned token.
 *
 * @param {Actor} actor
 * @returns {Token|null}
 */
export function resolveTokenForActor(actor) {
  if (!actor || !canvas?.tokens) return null;

  const controlled = Array.isArray(canvas.tokens.controlled) ? canvas.tokens.controlled : [];
  const controlledMatch = controlled.find(t => t?.actor?.id === actor.id) ?? null;
  if (controlledMatch) return controlledMatch;

  const placeables = Array.isArray(canvas.tokens.placeables) ? canvas.tokens.placeables : [];
  const owned = placeables.find(t => t?.actor?.id === actor.id && t.isOwner) ?? null;
  return owned;
}

/**
 * Resolve the first targeted token for the current user.
 *
 * @returns {Token|null}
 */
export function resolveFirstTargetedToken() {
  const targets = game?.user?.targets;
  if (!targets || targets.size === 0) return null;
  return Array.from(targets)[0] ?? null;
}

/**
 * Perform a quick weapon attack using the system's existing combat helper.
 *
 * This delegates to window.Uesrpg3e.combat.performWeaponAttack.
 * The sheet only supplies token context and weapon selection.
 *
 * @param {Actor} actor
 * @param {string} weaponId
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function performQuickWeaponAttack(actor, weaponId, options = {}) {
  if (!actor) return null;

  const weapon = actor.items?.get?.(weaponId) ?? null;
  if (!weapon) {
    ui.notifications.warn("No weapon found for that quick action.");
    return null;
  }

  const attackerToken = resolveTokenForActor(actor);
  if (!attackerToken) {
    ui.notifications.warn("Please place and select a token for this actor.");
    return null;
  }

  const defenderToken = resolveFirstTargetedToken();
  if (!defenderToken) {
    ui.notifications.warn("Please target an enemy token.");
    return null;
  }

  const perform = window?.Uesrpg3e?.combat?.performWeaponAttack;
  if (typeof perform !== "function") {
    ui.notifications.error("Combat attack helper is unavailable (Uesrpg3e.combat.performWeaponAttack).");
    return null;
  }

  return await perform(attackerToken, defenderToken, weapon, options);
}

/**
 * Spend Action Points (AP) from an actor.
 *
 * Schema: `actor.system.action_points.value`.
 * This helper is used by sheet quick-actions and is deliberately strict:
 *  - If insufficient AP, it warns and returns false.
 *  - It never mutates actor.system directly; it uses Actor#update.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @param {{ reason?: string }} [options]
 * @returns {Promise<boolean>}
 */
export async function spendActionPoints(actor, amount = 1, { reason = "" } = {}) {
  // Canonical lane: module/combat/action-economy.js
  return ActionEconomy.spendAP(actor, amount, { reason, silent: false });
}

/**
 * Build a collapsed (expandable) action card HTML string.
 *
 * The body is hidden by default and expanded client-side via a chat hook.
 *
 * @param {string} title
 * @param {string} bodyHtml
 * @returns {string}
 */
export function buildCollapsedActionCardHtml(title, bodyHtml) {
  const safeTitle = String(title ?? "Action");
  const body = String(bodyHtml ?? "");

  return `
    <div class="uesrpg-action-card" data-ues-action-card="1" data-ues-action-card-expanded="0">
      <div class="uesrpg-action-card__header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
        <h3 style="margin:0; border:none;">${safeTitle}</h3>
        <button
          type="button"
          class="uesrpg-action-card__toggle"
          data-ues-action-card-toggle="1"
          aria-expanded="false"
          style="display:inline-flex; align-items:center; justify-content:center; white-space:nowrap; word-break:keep-all; min-width:84px; line-height:1; padding:4px 10px; text-align:center;"
        >Expand</button>
      </div>
      <div class="uesrpg-action-card__body" data-ues-action-card-body="1" aria-hidden="true" style="display:none;">
        ${body}
      </div>
    </div>
  `;
}

/**
 * Locate the first enabled ActiveEffect matching the given sheet action key.
 *
 * Convention used across quick-action effects:
 * `effect.flags.uesrpg.key === <key>`
 *
 * @param {Actor} actor
 * @param {string} key
 * @returns {ActiveEffect|null}
 */
export function getEnabledEffectByKey(actor, key) {
  if (!actor || !key) return null;
  const k = String(key);
  const effects = actor.effects ?? [];
  return effects.find((e) => !e.disabled && e?.flags?.uesrpg?.key === k) ?? null;
}

/**
 * Read Aim state from an Aim ActiveEffect.
 *
 * Stored by sheet quick-action as:
 * `effect.flags.uesrpg.aim = { stacks, itemUuid }`
 *
 * @param {ActiveEffect|null} effect
 * @returns {{ stacks: number, itemUuid: string|null }}
 */
export function getAimStateFromEffect(effect) {
  if (!effect) return { stacks: 0, itemUuid: null };

  const aim = effect?.flags?.uesrpg?.aim ?? null;
  const stacks = Math.max(0, Math.min(3, Number(aim?.stacks ?? 0) || 0));
  const itemUuidRaw = aim?.itemUuid ?? effect?.flags?.uesrpg?.conditions?.itemUuid ?? null;
  const itemUuid = itemUuidRaw ? String(itemUuidRaw) : null;

  return { stacks, itemUuid };
}