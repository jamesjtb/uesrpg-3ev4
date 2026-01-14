/**
 * Shared sheet handler utilities.
 * These functions are used across multiple sheet types to reduce code duplication.
 */

/**
 * Post a talent/trait/power item's description to chat.
 * This is the shared implementation of _onTalentRoll across sheet types.
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

  // Match the exact formatting of the original implementations
  let contentString;
  if (includeImage) {
    // Actor sheet format: image inside <h2>, no <p> after </h2>
    contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
    <i><b>${item.type}</b></i><p>
      <i>${item.system.description}</i>`;
  } else {
    // NPC/Merchant sheet format: <p> directly after </h2> on same line
    contentString = `<h2>${item.name}</h2><p>
    <i><b>${item.type}</b></i><p>
      <i>${item.system.description}</i>`;
  }

  // Prefer speaking as the provided actor when available to preserve attribution.
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: contentString
  });

  // If the Item Macro module is active and this item has an attached macro, execute it.
  // This mirrors the "activation" behavior players get when using the same item via Token Action HUD.
  try {
    const itemMacroActive = game.modules.get("itemacro")?.active;
    const canExecute = itemMacroActive && typeof item.executeMacro === "function" && typeof item.hasMacro === "function" && item.hasMacro();
    if (canExecute) {
      await item.executeMacro({ event });
    }
  } catch (err) {
    console.warn("uesrpg-3ev4 | postItemToChat: ItemMacro execution failed", err);
  }
}

