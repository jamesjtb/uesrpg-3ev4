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
  
  const button = $(event.currentTarget);
  const li = button.parents(".item");
  const itemId = li.data("itemId");
  
  if (!itemId) {
    console.warn("uesrpg-3ev4 | postItemToChat: No itemId found on element");
    return;
  }
  
  const item = actor.getEmbeddedDocument("Item", itemId);
  
  if (!item) {
    console.warn(`uesrpg-3ev4 | postItemToChat: Item ${itemId} not found on actor ${actor.name}`);
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

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker(),
    content: contentString
  });
}
