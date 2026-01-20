import { executeItemActivation, executeItemMacroBestEffort } from "../../src/core/system/activation/activation-executor.js";

/**
 * Shared sheet handler utilities.
 * These functions are used across multiple sheet types to reduce code duplication.
 */

function _buildDefaultPostContent({ item, actor, includeImage }) {
  if (includeImage) {
    // Actor sheet format: image inside <h2>, no <p> after </h2>
    return `<h2><img src="${item.img}"</img>${item.name}</h2>
    <i><b>${item.type}</b></i><p>
      <i>${item.system.description}</i>`;
  }
  // NPC/Merchant sheet format: <p> directly after </h2> on same line
  return `<h2>${item.name}</h2><p>
  <i><b>${item.type}</b></i><p>
    <i>${item.system.description}</i>`;
}

/**
 * Post a standardized Activated Talent chat card and optionally spend costs.
 * Returns true if the activation succeeded (chat posted), false if it was blocked.
 */
export async function postActivatedTalentToChat({ item, actor, includeImage = false, event = null } = {}) {
  if (!item) return false;
  const result = await executeItemActivation({ item, actor, includeImage, event });
  return Boolean(result?.ok);
}

/**
 * Post a standardized Activated Power chat card and optionally spend costs/uses.
 * Returns true if the activation succeeded (chat posted), false if it was blocked.
 */
export async function postActivatedPowerToChat({ item, actor, includeImage = false, event = null } = {}) {
  if (!item) return false;
  const result = await executeItemActivation({ item, actor, includeImage, event });
  return Boolean(result?.ok);
}

/**
 * Item-sheet entry point: activate the currently opened Talent item.
 * Safe for owned items and gracefully degrades for unowned items (no cost spending).
 */
export async function activateTalentFromItemSheet({ item, event = null } = {}) {
  if (!item || item.type !== "talent") return;
  const actor = item.actor ?? null;
  const isActivated = Boolean(item?.system?.activation?.enabled);

  if (isActivated) {
    await executeItemActivation({ item, actor, includeImage: true, event });
    return;
  }

  // Non-activated: behave like a normal post-to-chat for parity.
  const content = _buildDefaultPostContent({ item, actor, includeImage: true });
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
  await executeItemMacroBestEffort(item, { event });
}

/**
 * Item-sheet entry point: activate the currently opened Power item.
 * Safe for owned items and gracefully degrades for unowned items (no cost spending).
 */
export async function activatePowerFromItemSheet({ item, event = null } = {}) {
  if (!item || item.type !== "power") return;
  const actor = item.actor ?? null;
  const isActivated = Boolean(item?.system?.activation?.enabled);

  if (isActivated) {
    await executeItemActivation({ item, actor, includeImage: true, event });
    return;
  }

  // Non-activated: behave like a normal post-to-chat for parity.
  const content = _buildDefaultPostContent({ item, actor, includeImage: true });
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
  await executeItemMacroBestEffort(item, { event });
}

/**
 * Post a talent/trait/power item's description to chat.
 * This is the shared implementation of _onTalentRoll across sheet types.
 *
 * When the item is a Talent configured as an Activated Talent, it posts an activation card and
 * can optionally spend resources before posting.
 *
 * @param {Event} event - The click event
 * @param {Actor} actor - The actor document
 * @param {Object} options - Optional configuration
 * @param {boolean} [options.includeImage=false] - Whether to include the item image in the header
 */
export async function postItemToChat(event, actor, options = {}) {
  event.preventDefault();

  const { includeImage = false } = options;

  // The initiating element may be inside <li class="item"> or a <tr data-item-id="..."> depending on the sheet template.
  // Resolve the embedded Item id defensively from the nearest ancestor that declares it.
  const $target = $(event.currentTarget);

  // Prefer standard Foundry-style attribute: data-item-id
  const $itemEl = $target.closest("[data-item-id]").length
    ? $target.closest("[data-item-id]")
    : ($target.parents("[data-item-id]").first().length ? $target.parents("[data-item-id]").first() : $target.parents(".item").first());

  const itemId = $itemEl?.data("itemId");

  if (!itemId) {
    console.warn("uesrpg-3ev4 | postItemToChat: No itemId found on element");
    return;
  }

  const item = actor?.items?.get?.(itemId) ?? actor?.getEmbeddedDocument?.("Item", itemId);

  if (!item) {
    console.warn(`uesrpg-3ev4 | postItemToChat: Item ${itemId} not found on actor ${actor?.name ?? "UNKNOWN"}`);
    return;
  }

  // Activated items: use unified activation engine.
  if (item?.system?.activation?.enabled) {
    const ok = await executeItemActivation({ item, actor, includeImage, event });
    if (!ok?.ok) return;
    return;
  }

  const contentString = _buildDefaultPostContent({ item, actor, includeImage });
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: contentString
  });

  await executeItemMacroBestEffort(item, { event });
}
