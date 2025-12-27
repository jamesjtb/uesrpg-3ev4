/**
 * module/dev/actor-select-debug.js
 *
 * Developer utility:
 * When enabled, logs an actor's TN-relevant context to the console every time a token is controlled.
 *
 * This module never modifies documents.
 */

import { computeSkillTN } from "../skills/skill-tn.js";

const SETTING_KEY = "debugActorSelect";

function _isEnabled() {
  return Boolean(game.settings.get("uesrpg-3ev4", SETTING_KEY));
}

function _normKey(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function _collectEquippedSkillArray(actor) {
  const map = new Map(); // key -> array of {itemName, value}
  for (const item of actor?.items ?? []) {
    const sys = item?.system;
    if (!sys?.equipped) continue;
    if (!Array.isArray(sys.skillArray)) continue;
    for (const e of sys.skillArray) {
      const name = String(e?.name ?? "").trim();
      const val = Number.parseInt(e?.value, 10) || 0;
      if (!name || !val) continue;
      const key = _normKey(name);
      const arr = map.get(key) ?? [];
      arr.push({ itemName: item.name, value: val });
      map.set(key, arr);
    }
  }
  return map;
}

function _summarizeActor(actor) {
  const sys = actor?.system ?? {};
  const mobility = sys.mobility ?? {};

  return {
    name: actor?.name,
    type: actor?.type,
    penalties: {
      fatigue: Number(sys?.fatigue?.penalty ?? 0),
      encumbrance: Number(sys?.carry_rating?.penalty ?? 0),
      wounded: sys?.wounded ? Number(sys?.woundPenalty ?? 0) : 0,
      armorAll: Number(mobility?.allTestPenalty ?? 0),
      armorAgility: Number(mobility?.agilityTestPenalty ?? 0),
      armorSkillMapKeys: Object.keys(mobility?.skillTestPenalties ?? {}),
      environmentKeys: Object.keys(sys?.environment?.skillPenalties ?? {})
    },
    professions: actor?.type === "NPC" ? (sys?.professions ?? {}) : null,
    combatStyles: actor?.type !== "NPC" ? (actor?.items?.filter(i => i.type === "combatStyle").map(i => i.name) ?? []) : null
  };
}

let _lastTokenId = null;

export function registerActorSelectDebug() {
  game.settings.register("uesrpg-3ev4", SETTING_KEY, {
    name: "Debug: Actor Select (TN Context)",
    hint: "When enabled, logs TN-relevant actor context to the console whenever you control a token.",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    restricted: true
  });



// Dev-only invariant snapshot on ready (helps catch silent sheet regressions).
Hooks.once("ready", () => {
  if (!game.settings.get("uesrpg-3ev4", SETTING_KEY)) return;
  try {
    const sheetClasses = CONFIG?.Actor?.sheetClasses ?? null;
    const npcSheets = [];
    if (sheetClasses && typeof sheetClasses === "object") {
      for (const [scope, entries] of Object.entries(sheetClasses)) {
        if (!entries || typeof entries !== "object") continue;
        for (const [clsKey, meta] of Object.entries(entries)) {
          const types = Array.isArray(meta?.types) ? meta.types : [];
          if (types.includes("NPC")) npcSheets.push({ scope, clsKey, label: meta?.label, types });
        }
      }
    }
    console.groupCollapsed("[UESRPG][Invariant] ActorSheet registration snapshot");
    console.log("NPC sheet registrations", npcSheets.length ? npcSheets : "(none detected via CONFIG.Actor.sheetClasses)");
    console.groupEnd();
  } catch (err) {
    console.warn("[UESRPG][Invariant] Failed to capture sheet registration snapshot", err);
  }
});

  Hooks.on("controlToken", (token, controlled) => {
    if (!controlled) return;
    if (!_isEnabled()) return;
    if (!token?.actor) return;

    if (_lastTokenId === token.id) return;
    _lastTokenId = token.id;

    const actor = token.actor;
    const equippedSkillArray = _collectEquippedSkillArray(actor);
    const summary = _summarizeActor(actor);

    const itemSkillBonuses = {};
    for (const [k, arr] of equippedSkillArray.entries()) {
      itemSkillBonuses[k] = arr;
    }

    // Provide a small "sample TN" preview for common NPC professions when present.
    const tnPreview = {};
    if (actor?.type === "NPC") {
      for (const key of ["combat", "evade"]) {
        const base = Number(actor.system?.professions?.[key] ?? 0);
        if (!base) continue;
        const skillItem = { name: key.charAt(0).toUpperCase() + key.slice(1), type: "profession", system: { value: base }, _professionKey: key };
        const tn = computeSkillTN({ actor, skillItem, difficultyKey: "average", manualMod: 0, useSpecialization: false });
        tnPreview[key] = { baseTN: tn.baseTN, finalTN: tn.finalTN, breakdown: tn.breakdown };
      }
    }

    console.groupCollapsed(`[UESRPG][ActorSelect] ${summary.name} (${summary.type})`);
    console.log("Summary", summary);
    console.log("Equipped skillArray bonuses", itemSkillBonuses);
    if (Object.keys(tnPreview).length) console.log("TN preview", tnPreview);
    console.groupEnd();
  });
}
