/**
 * Items migration / normalization (v13-safe, no ApplicationV2 dependency).
 *
 * Scope:
 * - World Items (game.items)
 * - Embedded Items on Actors (game.actors[].items)
 *
 * Notes:
 * - Compendia are not auto-migrated here.
 */

const MODULE_ID = "uesrpg-3ev4";

/** @typedef {"melee"|"ranged"} AttackMode */

function _ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function _debugEnabled() {
  try {
    return !!game.settings.get(MODULE_ID, "opposedDebug");
  } catch (_e) {
    return false;
  }
}

/**
 * Best-effort, deterministic inference of weapon attack mode from existing weapon data.
 *
 * We only infer "ranged" when we have explicit signals. Otherwise we return null
 * so the caller can apply the legacy default (currently melee).
 *
 * @param {Item} item
 * @param {object} sys
 * @returns {"melee"|"ranged"|null}
 */
function _inferAttackMode(item, sys = {}) {
  // 1) Structured qualities: explicit ranged signals
  const structured = Array.isArray(sys.qualitiesStructured) ? sys.qualitiesStructured : [];
  const sKeys = new Set(structured.map(q => String(q?.key ?? "").toLowerCase()).filter(Boolean));
  if (sKeys.has("reload") || sKeys.has("thrown")) return "ranged";

  // 2) Explicit thrown range fields (newer schema)
  const ts = Number(sys.thrownShort ?? 0);
  const tm = Number(sys.thrownMed ?? 0);
  const tl = Number(sys.thrownLong ?? 0);
  if ([ts, tm, tl].some(n => Number.isFinite(n) && n > 0)) return "ranged";

  // 3) Trait pills: explicit ranged identifiers (sling, etc.)
  const traits = Array.isArray(sys.qualitiesTraits) ? sys.qualitiesTraits : [];
  const tSet = new Set(traits.map(t => String(t).toLowerCase()));
  if (tSet.has("sling")) return "ranged";

  // 4) Category-ish fields: deterministic keyword mapping (only promotes to ranged)
  const cat = String(sys.item_cat ?? sys.category ?? "").trim().toLowerCase();
  const style = String(sys.combatStyle ?? sys.skill ?? "").trim().toLowerCase();
  const name = String(item?.name ?? "").trim().toLowerCase();

  const hay = `${cat} ${style} ${name}`;
  // NOTE: These are only used to promote to ranged. If none match, we do not guess.
  const rangedKeywords = [
    "bow",
    "crossbow",
    "arbalest",
    "sling",
    "marksman",
    "archery",
    "ranged"
  ];
  if (rangedKeywords.some(k => hay.includes(k))) return "ranged";

  return null;
}

function _normalizeWeaponSystem(item, sys = {}) {
  const update = {};

  // Fix legacy typo: equippped -> equipped
  if (Object.prototype.hasOwnProperty.call(sys, "equippped") && !Object.prototype.hasOwnProperty.call(sys, "equipped")) {
    update["system.equipped"] = !!sys.equippped;
  }
  if (Object.prototype.hasOwnProperty.call(sys, "equippped")) {
    update["system.-=equippped"] = null;
  }

  // Ensure attackMode exists (melee|ranged).
  // Legacy assumption in this system has been melee unless explicitly ranged.
  const hasValidAttackMode = (sys.attackMode === "melee" || sys.attackMode === "ranged");
  if (!hasValidAttackMode) {
    const inferred = _inferAttackMode(item, sys);
    if (inferred) update["system.attackMode"] = inferred;
    else update["system.attackMode"] = "melee";

    // Debug-only diagnostics when we had to fall back.
    if (!inferred && _debugEnabled()) {
      const ident = `${item?.type ?? "item"}:${item?.name ?? item?.id ?? "<unknown>"}`;
      console.warn(`${MODULE_ID} | attackMode inference fallback (defaulted to melee) for ${ident}`);
    }
  }

  // Ensure quality/material defaults
  if (!sys.qualityLevel) update["system.qualityLevel"] = "common";
  if (!sys.material) update["system.material"] = "standard";

  // Ensure structured qualities array
  if (!Array.isArray(sys.qualitiesStructured)) update["system.qualitiesStructured"] = [];

  return update;
}

function _normalizeArmorSystem(sys = {}) {
  const update = {};

  if (!sys.qualityLevel) update["system.qualityLevel"] = "common";
  if (!sys.material) update["system.material"] = "standard";
  if (!sys.weightClass) update["system.weightClass"] = "none";

  if (!Array.isArray(sys.qualitiesStructured)) update["system.qualitiesStructured"] = [];

  return update;
}

function _normalizeAmmoSystem(sys = {}) {
  const update = {};

  // Per-10 pricing: if missing, backfill from legacy per-item price
  if (sys.pricePer10 === undefined || sys.pricePer10 === null) {
    const legacy = Number(sys.price ?? 0);
    update["system.pricePer10"] = Number.isFinite(legacy) ? legacy : 0;
  }

  if (!sys.arrowType) update["system.arrowType"] = "none";
  if (!sys.ammoMaterial) update["system.ammoMaterial"] = "standard";

  if (!Array.isArray(sys.qualitiesStructured)) update["system.qualitiesStructured"] = [];

  return update;
}

async function _migrateWorldItems() {
  const updates = [];
  for (const item of game.items.contents) {
    if (!["weapon", "armor", "ammunition"].includes(item.type)) continue;
    const sys = item.system ?? {};
    const update =
      item.type === "weapon" ? _normalizeWeaponSystem(item, sys)
      : item.type === "armor" ? _normalizeArmorSystem(sys)
      : _normalizeAmmoSystem(sys);

    if (Object.keys(update).length) {
      update._id = item.id;
      updates.push(update);
    }
  }

  if (updates.length) {
    console.log(`${MODULE_ID} | Migrating ${updates.length} world item(s)`);
    await Item.updateDocuments(updates, { diff: false });
  }
}

async function _migrateActorItems() {
  for (const actor of game.actors.contents) {
    const updates = [];
    for (const item of actor.items.contents) {
      if (!["weapon", "armor", "ammunition"].includes(item.type)) continue;
      const sys = item.system ?? {};
      const update =
        item.type === "weapon" ? _normalizeWeaponSystem(item, sys)
        : item.type === "armor" ? _normalizeArmorSystem(sys)
        : _normalizeAmmoSystem(sys);

      if (Object.keys(update).length) {
        update._id = item.id;
        updates.push(update);
      }
    }

    if (updates.length) {
      console.log(`${MODULE_ID} | Migrating ${updates.length} item(s) on actor ${actor.name}`);
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    }
  }
}

export async function migrateItemsIfNeeded() {
  // Lightweight normalization pass; safe to run on every startup.
  if (!game.user.isGM) return;
  try {
    await _migrateWorldItems();
    await _migrateActorItems();
  } catch (err) {
    console.error(`${MODULE_ID} | Item migration failed`, err);
    ui.notifications?.error?.("UESRPG item migration failed; check console for details.");
  }
}
