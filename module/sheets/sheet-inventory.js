/**
 * Shared inventory helpers for Actor sheets.
 *
 * Foundry VTT v13 / AppV1-compatible. No schema changes.
 */

/**
 * Item types which represent physical inventory and are eligible for containment.
 * @type {Set<string>}
 */
export const CONTAINABLE_ITEM_TYPES = new Set(["item", "weapon", "armor", "ammunition"]);

/**
 * Determine whether an item is marked as contained in a container.
 * @param {Item|object} item
 * @returns {boolean}
 */
export function isContainedItem(item) {
  const cs = item?.system?.containerStats;
  return (cs?.contained === true) && !!cs?.container_id;
}

/**
 * Determine whether an item is a containable physical inventory type.
 * @param {Item|object} item
 * @returns {boolean}
 */
export function isContainableType(item) {
  return CONTAINABLE_ITEM_TYPES.has(item?.type);
}

/**
 * Whether an item should be hidden from the main inventory lists because it is inside a container.
 * Contained items remain owned by the Actor and are surfaced via the container sheet UI.
 *
 * @param {Item|object} item
 * @returns {boolean}
 */
export function shouldHideFromMainInventory(item) {
  return isContainableType(item) && isContainedItem(item);
}
