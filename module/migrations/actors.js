/**
 * Actor migration / normalization (v13-safe).
 *
 * Scope:
 * - World Actors (game.actors)
 *
 * Notes:
 * - This is a lightweight normalization pass that is safe to run on every startup.
 * - It repairs a small class of legacy/corrupted actors that can have an invalid
 *   system payload (e.g. an empty string), which would otherwise crash data prep.
 */

const MODULE_ID = "uesrpg-3ev4";

function _isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function _ensureResistanceDefaults(sys) {
  const update = {};
  const res = _isPlainObject(sys?.resistance) ? sys.resistance : null;

  if (!res) {
    update["system.resistance"] = {
      diseaseR: 0,
      fireR: 0,
      frostR: 0,
      shockR: 0,
      poisonR: 0,
      magicR: 0,
      natToughness: 0,
      silverR: 0,
      sunlightR: 0,
      physicalR: 0
    };
    return update;
  }

  // Additive defaults only; do not overwrite existing values.
  if (res.diseaseR === undefined) update["system.resistance.diseaseR"] = 0;
  if (res.fireR === undefined) update["system.resistance.fireR"] = 0;
  if (res.frostR === undefined) update["system.resistance.frostR"] = 0;
  if (res.shockR === undefined) update["system.resistance.shockR"] = 0;
  if (res.poisonR === undefined) update["system.resistance.poisonR"] = 0;
  if (res.magicR === undefined) update["system.resistance.magicR"] = 0;
  if (res.natToughness === undefined) update["system.resistance.natToughness"] = 0;
  if (res.silverR === undefined) update["system.resistance.silverR"] = 0;
  if (res.sunlightR === undefined) update["system.resistance.sunlightR"] = 0;
  if (res.physicalR === undefined) update["system.resistance.physicalR"] = 0;
  return update;
}

export async function migrateActorsIfNeeded() {
  if (!game.user.isGM) return;

  try {
    const updates = [];

    for (const actor of game.actors.contents) {
      const sys = actor.system;

      // Repair invalid system payload.
      if (!_isPlainObject(sys)) {
        updates.push({
          _id: actor.id,
          system: {
            resistance: {
              diseaseR: 0,
              fireR: 0,
              frostR: 0,
              shockR: 0,
              poisonR: 0,
              magicR: 0,
              natToughness: 0,
              silverR: 0,
              sunlightR: 0,
              physicalR: 0
            }
          }
        });
        continue;
      }

      const update = _ensureResistanceDefaults(sys);
      if (Object.keys(update).length) {
        update._id = actor.id;
        updates.push(update);
      }
    }

    if (updates.length) {
      console.log(`${MODULE_ID} | Migrating ${updates.length} actor(s)`);
      await Actor.updateDocuments(updates, { diff: false });
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Actor migration failed`, err);
    ui.notifications?.error?.("UESRPG actor migration failed; check console for details.");
  }
}
