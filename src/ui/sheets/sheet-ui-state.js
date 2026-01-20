/**
 * module/sheets/sheet-ui-state.js
 *
 * Per-user sheet UI state helpers (no actor schema changes).
 *
 * - Collapsed groups for sheet sections (stored on the User as flags)
 * - Per-user equipment loadouts (stored on the User as flags)
 *
 * Foundry VTT v13 (AppV1) compatible.
 */

const NAMESPACE = "uesrpg-3ev4";
const COLLAPSE_FLAG = "sheetCollapsedGroups";
const LOADOUT_FLAG = "sheetLoadouts";

function _safeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

/**
 * Get the full collapsed-groups map.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function getCollapsedGroups() {
  const raw = await game.user?.getFlag?.(NAMESPACE, COLLAPSE_FLAG);
  const obj = _safeObject(raw);
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[String(k)] = Boolean(v);
  return out;
}

/**
 * Set collapsed state for a single group.
 * @param {string} groupKey
 * @param {boolean} collapsed
 */
export async function setGroupCollapsed(groupKey, collapsed) {
  const key = String(groupKey ?? "").trim();
  if (!key) return;

  const current = await getCollapsedGroups();
  const next = { ...current, [key]: Boolean(collapsed) };
  await game.user?.setFlag?.(NAMESPACE, COLLAPSE_FLAG, next);
}

/**
 * Toggle collapsed state for a single group.
 * @param {string} groupKey
 * @returns {Promise<boolean>} New collapsed state
 */
export async function toggleGroupCollapsed(groupKey) {
  const current = await getCollapsedGroups();
  const key = String(groupKey ?? "").trim();
  if (!key) return false;

  const next = !Boolean(current[key]);
  await setGroupCollapsed(key, next);
  return next;
}

function _getUserLoadoutsObject() {
  // Shape: { [actorId: string]: Array<{id, name, equippedIds, createdAt}> }
  const raw = game.user?.getFlag?.(NAMESPACE, LOADOUT_FLAG);
  // raw can be a Promise depending on how called; only call synchronously from already awaited callers.
  return raw;
}

/**
 * @param {unknown} v
 * @returns {Array<{id: string, name: string, equippedIds: string[], createdAt: string}>}
 */
function _normalizeLoadoutArray(v) {
  const arr = Array.isArray(v) ? v : [];
  return arr
    .map((x) => {
      const o = _safeObject(x);
      const id = String(o.id ?? "").trim();
      const name = String(o.name ?? "").trim();
      const equippedIds = Array.isArray(o.equippedIds) ? o.equippedIds.map(String).filter(Boolean) : [];
      const createdAt = String(o.createdAt ?? "").trim() || new Date().toISOString();
      if (!id || !name) return null;
      return { id, name, equippedIds, createdAt };
    })
    .filter(Boolean);
}

/**
 * Get loadouts for a specific actor.
 * @param {string} actorId
 * @returns {Promise<Array<{id: string, name: string, equippedIds: string[], createdAt: string}>>}
 */
export async function getLoadouts(actorId) {
  const raw = await game.user?.getFlag?.(NAMESPACE, LOADOUT_FLAG);
  const obj = _safeObject(raw);
  const list = obj[String(actorId)] ?? [];
  return _normalizeLoadoutArray(list);
}

/**
 * Save a new loadout (or overwrite by name) for a specific actor.
 * @param {string} actorId
 * @param {string} name
 * @param {string[]} equippedIds
 * @returns {Promise<void>}
 */
export async function saveLoadout(actorId, name, equippedIds) {
  const aid = String(actorId ?? "").trim();
  const nm = String(name ?? "").trim();
  if (!aid || !nm) return;

  const raw = await game.user?.getFlag?.(NAMESPACE, LOADOUT_FLAG);
  const obj = _safeObject(raw);
  const current = _normalizeLoadoutArray(obj[aid]);

  const now = new Date().toISOString();
  const nextId = foundry.utils.randomID();

  // Overwrite if same name exists.
  const idx = current.findIndex((l) => l.name.toLowerCase() === nm.toLowerCase());
  const record = {
    id: idx >= 0 ? current[idx].id : nextId,
    name: nm,
    equippedIds: Array.isArray(equippedIds) ? equippedIds.map(String).filter(Boolean) : [],
    createdAt: idx >= 0 ? current[idx].createdAt : now,
  };

  const nextArr = [...current];
  if (idx >= 0) nextArr[idx] = record;
  else nextArr.push(record);

  await game.user?.setFlag?.(NAMESPACE, LOADOUT_FLAG, { ...obj, [aid]: nextArr });
}

/**
 * Delete a loadout by id for a specific actor.
 * @param {string} actorId
 * @param {string} loadoutId
 */
export async function deleteLoadout(actorId, loadoutId) {
  const aid = String(actorId ?? "").trim();
  const lid = String(loadoutId ?? "").trim();
  if (!aid || !lid) return;

  const raw = await game.user?.getFlag?.(NAMESPACE, LOADOUT_FLAG);
  const obj = _safeObject(raw);
  const current = _normalizeLoadoutArray(obj[aid]);
  const nextArr = current.filter((l) => l.id !== lid);

  await game.user?.setFlag?.(NAMESPACE, LOADOUT_FLAG, { ...obj, [aid]: nextArr });
}

/**
 * Apply a loadout to an actor by setting system.equipped on items that have that field.
 * This does not create/destroy items and does not mutate document data directly.
 *
 * @param {Actor} actor
 * @param {string[]} equippedIds
 */
export async function applyLoadoutToActor(actor, equippedIds) {
  if (!actor) return;

  const targetSet = new Set((Array.isArray(equippedIds) ? equippedIds : []).map(String).filter(Boolean));

  const updates = [];
  for (const item of actor.items ?? []) {
    // Only items that opt into equip semantics.
    if (!item?.system || typeof item.system.equipped !== "boolean") continue;

    const shouldEquip = targetSet.has(item.id);
    if (Boolean(item.system.equipped) === shouldEquip) continue;

    updates.push({ _id: item.id, "system.equipped": shouldEquip });
  }

  if (updates.length === 0) return;
  await actor.updateEmbeddedDocuments("Item", updates);
}

/**
 * Compatibility exports (used by sheet controllers).
 * These are simple aliases to keep sheet imports stable.
 */
export async function getLoadoutsForActor(actorId) {
  return await getLoadouts(actorId);
}

export async function saveLoadoutForActor(actorId, name, equippedIds) {
  return await saveLoadout(actorId, name, equippedIds);
}
