/**
 * module/combat/opposed-workflow.js
 *
 * Canonical opposed/contested workflow for UESRPG 3ev4 (Foundry v13, non-ApplicationV2).
 *
 * Design goals (per project decisions):
 *  - Clicking the combat style dice icon with a target selected ONLY creates a pending chat card.
 *  - Attacker rolls from the chat card. "Roll Attack" opens ONE dialog:
 *      - Attack variation selector (Normal / All Out / Precision / Coup de Grâce)
 *      - Manual TN modifier input
 *  - Defender rolls from the chat card via DefenseDialog (owns defense eligibility + TN calc).
 *  - Dice So Nice compatibility: each side's d100 roll is executed as a real Foundry Roll and
 *    sent as its own ChatMessage using Roll#toMessage (so DSN hooks always fire).
 *  - The opposed chat card is then updated with the numeric outcomes and final resolution.
 */

import { doTestRoll, computeResultFromRollTotal } from "../helpers/degree-roll-helper.js";
import { UESRPG } from "../constants.js";
import { hasCondition } from "../conditions/condition-engine.js";
import { DefenseDialog } from "./defense-dialog.js";
import { computeTN, listCombatStyles, hasEquippedShield, variantMod as computeVariantMod } from "./tn.js";
import { computeDefenseAvailability, normalizeDefenseType } from "./defense-options.js";
import { getDamageTypeFromWeapon, getHitLocationFromRoll, resolveHitLocationForTarget } from "./combat-utils.js";
import { getBlockValue, normalizeHitLocation } from "./mitigation.js";
import { DAMAGE_TYPES } from "./damage-automation.js";
import { ActionEconomy } from "./action-economy.js";
import { AttackTracker } from "./attack-tracker.js";
import { safeUpdateChatMessage } from "../helpers/chat-message-socket.js";
import { requestCreateActiveEffect } from "../helpers/active-effect-proxy.js";
import { buildSpecialActionsForActor, isSpecialActionUsableNow } from "./combat-style-utils.js";
import { SPECIAL_ACTIONS, getSpecialActionById } from "../config/special-actions.js";
import { getActiveStaminaEffect, consumeStaminaEffect, STAMINA_EFFECT_KEYS } from "../stamina/stamina-dialog.js";


function _collectSensorySituationalMods(decl) {
  const out = [];
  if (!decl) return out;
  if (decl.applyBlinded) out.push({ key: "blinded", label: "Blinded (sight)", value: -30 });
  if (decl.applyDeafened) out.push({ key: "deafened", label: "Deafened (hearing)", value: -30 });
  return out;
}

function _collectDefenseSensorySituationalMods(choice) {
  const out = [];
  if (!choice) return out;
  if (choice.applyBlinded) out.push({ key: "blinded", label: "Blinded (sight)", value: -30 });
  if (choice.applyDeafened) out.push({ key: "deafened", label: "Deafened (hearing)", value: -30 });
  return out;
}


function _asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function _normalizeKey(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function _weaponHasQuality(weapon, qualityKey, { allowLegacy = true } = {}) {
  if (!weapon?.system) return false;
  const target = _normalizeKey(qualityKey);
  if (!target) return false;

  const structured = Array.isArray(weapon.system.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : null;

  if (structured) {
    for (const q of structured) {
      const k = _normalizeKey(q?.key ?? q);
      if (k && k === target) return true;
    }
  }

  const traits = Array.isArray(weapon.system.qualitiesTraitsInjected)
    ? weapon.system.qualitiesTraitsInjected
    : Array.isArray(weapon.system.qualitiesTraits)
      ? weapon.system.qualitiesTraits
      : null;

  if (traits) {
    for (const t of traits) {
      const k = _normalizeKey(t);
      if (k && k === target) return true;
    }
  }

  if (!allowLegacy) return false;

  const raw = String(weapon.system.qualities ?? "");
  if (!raw) return false;

  const plain = raw
    .replace(/@Compendium\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = plain
    .split(/[^A-Za-z0-9]+/)
    .map(t => _normalizeKey(t))
    .filter(Boolean);
  if (tokens.includes(target)) return true;

  // Last resort: substring match for legacy concatenations.
  const legacy = _normalizeKey(plain);
  if (legacy && legacy.includes(target)) return true;

  return false;
}

function _weaponHasTraitText(weapon, traitKey) {
  // Fallback for legacy weapons where traits are stored as free-text in system.qualities.
  const target = _normalizeKey(traitKey);
  if (!target) return false;
  const raw = String(weapon?.system?.qualities ?? "");
  if (!raw) return false;

  const text = raw
    .replace(/@Compendium\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = text
    .split(/[^A-Za-z0-9]+/)
    .map(t => _normalizeKey(t))
    .filter(Boolean);

  if (tokens.includes(target)) return true;

  // Last resort substring for edge-case legacy exports.
  const legacy = _normalizeKey(text);
  return !!(legacy && legacy.includes(target));
}

function _parseRangeBandsFromWeapon(weapon) {
  // Chapter 7 formatting in compendium exports commonly embeds:
  //   "Ranged (7/27/52)" or "Thrown (3/8/16)" inside system.qualities as rich text.
  const raw = String(weapon?.system?.qualities ?? "");
  if (!raw) return null;

  const text = raw
    .replace(/@Compendium\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const mRanged = text.match(/\bRanged\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
  const mThrown = text.match(/\bThrown\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\)/i);

  const ranged = mRanged
    ? { close: Number(mRanged[1]), effective: Number(mRanged[2]), long: Number(mRanged[3]) }
    : null;
  const thrown = mThrown
    ? { close: Number(mThrown[1]), effective: Number(mThrown[2]), long: Number(mThrown[3]) }
    : null;

  return { ranged, thrown };
}

function _parseRangeTriplet(text) {
  // Accept "2/3/4" or "2 / 3 / 4".
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  return { close: Number(m[1]), effective: Number(m[2]), long: Number(m[3]) };
}

function _measureTokenDistance(tokenA, tokenB) {
  try {
    const a = tokenA?.center ?? tokenA?.object?.center ?? null;
    const b = tokenB?.center ?? tokenB?.object?.center ?? null;
    if (!a || !b) return null;

    // v13: Use namespaced Ray from foundry.canvas.geometry
    const ray = new foundry.canvas.geometry.Ray(a, b);

    // Preferred: BaseGrid.measurePath (v13+)
    const grid = canvas?.grid?.grid;
    if (grid && typeof grid.measurePath === "function") {
      const result = grid.measurePath([a, b], { gridSpaces: true });
      const dist = result?.distance ?? result?.totalDistance ?? null;
      if (Number.isFinite(dist)) return dist;
    }

    // Fallback: manual calculation (deprecated measureDistances removed)
    const gridSize = Number(canvas?.scene?.grid?.size ?? 0);
    const gridDistance = Number(canvas?.scene?.grid?.distance ?? 0);
    if (gridSize > 0 && gridDistance > 0) {
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      const spaces = px / gridSize;
      return spaces * gridDistance;
    }

    return null;
  } catch (err) {
    console.warn("UESRPG | Failed to measure token distance", err);
    return null;
  }
}



function _getWeaponRangeBands(weapon) {
  const sys = weapon?.system ?? {};

  // Preferred: derived range bands (effective first), as computed in module/entities/item.js.
  // That lane uses close/effective/long keys; this workflow uses close/medium/long.
  const src = sys.rangeBandsDerivedEffective ?? sys.rangeBandsDerived ?? null;
  if (src && Number.isFinite(Number(src.long))) {
    return {
      kind: src.kind ?? null,
      source: src.source ?? null,
      close: Number(src.close) || 0,
      medium: Number(src.medium ?? src.effective) || 0,
      long: Number(src.long) || 0,
      rangeMod: Number(src.rangeMod) || 0,
      display: src.display ?? null
    };
  }

  // Secondary: explicit system.range (common on legacy items) in "S/M/L" format.
  // NOTE: This is distinct from Reach; ranged weapons should populate system.range.
  const fromRangeField = _parseRangeTriplet(sys.range);
  if (fromRangeField && Number.isFinite(Number(fromRangeField.long))) {
    return {
      kind: "ranged",
      source: "rangeField",
      close: Number(fromRangeField.close) || 0,
      medium: Number(fromRangeField.effective) || 0,
      long: Number(fromRangeField.long) || 0,
      rangeMod: 0,
      display: `${Number(fromRangeField.close)}/${Number(fromRangeField.effective)}/${Number(fromRangeField.long)}`
    };
  }

  // Legacy fallback: parse bands from free-text qualities for weapons that were not migrated.
  const parsed = _parseRangeBandsFromWeapon(weapon);
  if (!parsed) return null;

  const isThrown = weapon ? (_weaponHasQuality(weapon, "thrown") || _weaponHasTraitText(weapon, "thrown")) : false;
  const b = isThrown ? (parsed.thrown ?? null) : (parsed.ranged ?? null);
  if (!b || !Number.isFinite(Number(b.long))) return null;

  return {
    kind: isThrown ? "thrown" : "ranged",
    source: "qualities",
    close: Number(b.close) || 0,
    medium: Number(b.effective) || 0,
    long: Number(b.long) || 0
  };
}


function _computeRangedRangeContext({ attackerToken, defenderToken, weapon }) {
  const bands = _getWeaponRangeBands(weapon);
  if (!bands) return null;

  const distance = _measureTokenDistance(attackerToken, defenderToken);
  if (distance == null) return {
    distance: null,
    band: null,
    tnMod: 0,
    close: Number(bands.close) || 0,
    medium: Number(bands.medium) || 0,
    long: Number(bands.long) || 0,
    outOfRange: false,
    reason: "no-distance"
  };

  const close = Number(bands.close) || 0;
  const medium = Number(bands.medium) || 0;
  const long = Number(bands.long) || 0;

  if (long > 0 && distance > long) {
    return { distance, band: "out", tnMod: 0, close, medium, long, outOfRange: true, reason: "out-of-range" };
  }

  if (close > 0 && distance <= close) {
    return { distance, band: "close", tnMod: +10, close, medium, long, outOfRange: false };
  }
  if (medium > 0 && distance <= medium) {
    return { distance, band: "medium", tnMod: 0, close, medium, long, outOfRange: false };
  }
  // Long band includes any distance up to (and including) long.
  return { distance, band: "long", tnMod: -20, close, medium, long, outOfRange: false };
}


/**
 * Canonical attack-type lane for all combat contexts.
 *
 * This system uses `context.attackMode` as the source of truth.
 * A legacy `context.attackType` may exist on older chat cards; we normalize it once.
 *
 * @param {any} ctx
 * @returns {"melee"|"ranged"}
 */
function getContextAttackMode(ctx) {
  const raw = String(ctx?.attackMode ?? ctx?.attackType ?? "melee").toLowerCase().trim();
  if (raw === "ranged" || raw === "melee") return raw;
  // Defensive normalization for previously-used labels.
  if (raw.includes("rang") || raw.includes("missile") || raw.includes("projectile") || raw.includes("shoot") || raw.includes("bow") || raw.includes("crossbow") || raw.includes("throw")) return "ranged";
  return "melee";
}

/**
 * Normalize a user/system-provided dice expression into something safe to hand to Foundry's Roll parser.
 * This is defensive: it strips annotations/import artefacts that can break Roll evaluation.
 */
function normalizeDiceExpression(expr) {
  const raw = String(expr ?? "").trim();
  if (!raw) return "0";

  // Legacy annotation / import artefact.
  if (/uses\s+nat\.?\s*weapon/i.test(raw)) return "0";

  // Handle alternate damage formats like: "1d8 (1d10)" -> prefer the base.
  const paren = raw.match(/^(.+?)\s*\((.+?)\)\s*$/);
  const base = paren ? String(paren[1]).trim() : raw;

  // Normalize unicode minus/en-dash to ASCII hyphen.
  const ascii = base.replace(/[\u2012\u2013\u2014\u2212]/g, "-");

  // Remove non-roll characters, keep basic math, dice letters, parentheses and whitespace.
  let cleaned = ascii.replace(/[^0-9dDkKfFhHlL+\-*/().,\s@]/g, " ").trim();

  // Normalize decimal comma to dot (common in some locales).
  cleaned = cleaned.replace(/(\d),(\d)/g, "$1.$2");

  // Collapse whitespace.
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Strip trailing operators or punctuation that would invalidate a Roll formula.
  cleaned = cleaned.replace(/[+\-*/.,\s]+$/g, "").trim();

  // Strip leading operators.
  cleaned = cleaned.replace(/^[+\-*/.,\s]+/g, "").trim();

  return cleaned || "0";
}

async function safeEvaluateRoll(formula, { allowUnvalidated = false } = {}) {
  const f = normalizeDiceExpression(formula);
  if (game?.settings?.get("uesrpg-3ev4", "opposedDebugFormula") && String(formula ?? "").trim() !== f) {
    // eslint-disable-next-line no-console
    console.log("UESRPG Opposed | Formula normalized", { original: String(formula ?? ""), normalized: f });
  }
  const ok = (typeof Roll?.validate === "function") ? Roll.validate(f) : true;
  if (!ok && !allowUnvalidated) {
    console.warn(`UESRPG Opposed | Invalid roll formula "${String(formula)}" -> normalized "${f}". Falling back to 0.`);
    const r = new Roll("0");
    await r.evaluate();
    return r;
  }
  try {
    const r = new Roll(f);
    await r.evaluate();
    return r;
  } catch (err) {
    console.warn(`UESRPG Opposed | Failed to evaluate roll "${String(formula)}" -> normalized "${f}". Falling back to 0.`, err);
    const r = new Roll("0");
    await r.evaluate();
    return r;
  }
}

// Combat style listing is centralized in module/combat/tn.js

function _resolveDoc(uuid) {
  if (!uuid) return null;
  try {
    return fromUuidSync(uuid);
  } catch (_e) {
    return null;
  }
}


/**
 * Prefer an equipped weapon UUID for a given actor. Used for Counter-Attack default selection.
 * Falls back to the first owned weapon if none are equipped.
 */
function _getPreferredWeaponUuid(actor, { meleeOnly = false } = {}) {
  const items = Array.from(actor?.items ?? []);
  const weapons = items.filter((it) => it?.type === "weapon");

  const isRangedWeapon = (w) => {
    const mode = String(w?.system?.attackMode ?? w?.system?.weaponType ?? w?.system?.type ?? "").toLowerCase();
    // Thrown weapons are commonly melee-capable (e.g., throwing knife) and should remain eligible for
    // melee-only contexts (parry/counter defaults). Treat them as NOT purely ranged.
    const isThrown = _weaponHasQuality(w, "thrown") ||
      (String(w?.system?.rangeBandsDerivedEffective?.kind ?? w?.system?.rangeBandsDerived?.kind ?? "") === "thrown");
    if (isThrown) return false;
    return mode.includes("ranged");
  };

  const filtered = meleeOnly ? weapons.filter((w) => !isRangedWeapon(w)) : weapons;

  // Prefer the system's equipped weapon binding if present (primary -> secondary).
  // This system commonly tracks equipped weapons via Actor.system.equippedWeapons.{primaryWeapon,secondaryWeapon}.id
  // (legacy nested variants may exist).
  const ew = actor?.system?.equippedWeapons;
  const boundIds = [
    ew?.primaryWeapon?.id,
    ew?.secondaryWeapon?.id,
    ew?.equippedWeapons?.primaryWeapon?.id,
    ew?.equippedWeapons?.secondaryWeapon?.id
  ].filter(Boolean);

  for (const id of boundIds) {
    const bound = actor?.items?.get?.(id);
    if (!bound || bound.type !== "weapon") continue;
    if (meleeOnly && isRangedWeapon(bound)) continue;
    // Ensure it is in the filtered set if we filtered.
    if (filtered.some((w) => w.id === bound.id)) return bound.uuid;
  }

  // Fall back to per-item equipped flag if present.
  const equipped = filtered.find((w) => w.system?.equipped === true);
  if (equipped?.uuid) return equipped.uuid;

  // Final fallback: first available weapon of the requested category.
  return filtered[0]?.uuid ?? "";
}


async function _preConsumeAttackAmmo(attacker, data) {
  // Consume 1 ammunition at the moment the attacker commits to the attack roll.
  // Project rule: ranged attacks (non-thrown) require ammunition even if no damage card is ever produced.
  // This function enforces ammo gating and will return false to abort the attack roll when ammo is missing.

  const attackMode = getContextAttackMode(data?.context);
  if (attackMode !== "ranged") return true;

  try {
    // Choose the weapon used for this attack. Prefer explicit selection from the declaration dialog.
    const weaponUuid = String(data?.context?.weaponUuid ?? "") || _getPreferredWeaponUuid(attacker, { meleeOnly: false }) || "";
    if (!weaponUuid) return true;

    const weapon = await fromUuid(weaponUuid);
    if (!weapon || weapon.type !== "weapon") return true;

    // Do not consume ammunition for thrown attacks.
    const isThrown = _weaponHasQuality(weapon, "thrown") ||
      (String(weapon.system?.rangeBandsDerivedEffective?.kind ?? weapon.system?.rangeBandsDerived?.kind ?? "") === "thrown");
    if (isThrown) return true;

    // Only enforce on ranged weapons.
    if (String(weapon.system?.attackMode ?? "melee") !== "ranged") return true;

    const ammoId = String(weapon.system?.ammoId ?? "").trim();
    if (!ammoId) {
      ui.notifications.warn(`${weapon.name}: no ammunition selected.`);
      return false;
    }

    const ammo = attacker.items.get(ammoId);
    if (!ammo || ammo.type !== "ammunition") {
      ui.notifications.warn(`${weapon.name}: selected ammunition could not be resolved.`);
      return false;
    }

    const qty = Number(ammo.system?.quantity ?? 0);
    if (!(qty > 0)) {
      ui.notifications.warn(`${ammo.name}: no ammunition remaining.`);
      return false;
    }

    await ammo.update({ "system.quantity": Math.max(0, qty - 1) });

    const pre = {
      weaponUuid: weapon.uuid,
      ammoId,
      ammoUuid: ammo.uuid,
      ammoName: ammo.name,
      consumedAt: Date.now()
    };

    // Persist on workflow data so damage roll can avoid any legacy/double-consumption paths.
    data.attacker = data.attacker ?? {};
    data.attacker.preConsumedAmmo = pre;

    return true;
  } catch (err) {
    console.error("UESRPG | Pre-consume attack ammo failed", err);
    ui.notifications.error("Failed to consume ammunition for this attack. See console for details.");
    return false;
  }
}


/**
 * Mark a ranged weapon as needing reload after it's fired.
 * This is called after a successful ranged attack.
 * NON-BLOCKING: Does not prevent attacks, just tracks state.
 * 
 * @param {Item} weapon - The ranged weapon that was fired
 * @returns {Promise<void>}
 */
async function _markWeaponNeedsReload(weapon) {
  if (!weapon || weapon.type !== "weapon") return;
  if (weapon.system?.attackMode !== "ranged") return;
  
  const reloadState = weapon.system?.reloadState ?? {};
  if (!reloadState.requiresReload) return;
  
  // Mark as needing reload (non-blocking)
  try {
    await weapon.update({
      "system.reloadState.isLoaded": false
    });
    
    const reloadCost = Number(reloadState.reloadAPCost ?? 0);
    if (reloadCost > 0) {
      ui.notifications.info(`${weapon.name} needs reloading (${reloadCost} AP required).`);
    }
  } catch (err) {
    console.warn("UESRPG | Failed to mark weapon as needing reload:", err);
  }
}


function _resolveActor(docOrUuid) {
  const doc = typeof docOrUuid === "string" ? _resolveDoc(docOrUuid) : docOrUuid;
  if (!doc) return null;
  if (doc.documentName === "Actor") return doc;
  if (doc.documentName === "Token") return doc.actor ?? null;
  if (doc.actor) return doc.actor;
  return null;
}

function _resolveToken(docOrUuid) {
  const doc = typeof docOrUuid === "string" ? _resolveDoc(docOrUuid) : docOrUuid;
  if (!doc) return null;
  // TokenDocument
  if (doc.documentName === "Token") return doc.object ?? null;
  // Token
  if (doc.actor && doc.document) return doc;
  return null;
}

function _canControlActor(actor) {
  return game.user.isGM || actor?.isOwner;
}

function _fmtDegree(res) {
  if (!res) return "—";
  return res.isSuccess ? `${res.degree} DoS` : `${res.degree} DoF`;
}

function _variantLabel(variant) {
  switch (variant) {
    // Chat-card display should be concise (dialog retains full text).
    case "allOut": return "All Out";
    case "precision": return "Precision";
    case "coup": return "Coup";
    case "normal":
    default: return "Attack";
  }
}


function _circumstanceLabel(mod) {
  const v = Number(mod ?? 0) || 0;
  switch (v) {
    case -10: return "Minor Disadvantage (-10)";
    case -20: return "Disadvantage (-20)";
    case -30: return "Major Disadvantage (-30)";
    default: return "—";
  }
}

function _btn(label, action, extraDataset = {}) {
  const ds = Object.entries(extraDataset)
    .map(([k, v]) => `data-${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<button type="button" data-ues-opposed-action="${action}" ${ds}>${label}</button>`;
}

// --- Banked choice (meta-limiting) helpers ---

function _isBankChoicesEnabledForData(data) {
  // Prefer a per-card snapshot if present; otherwise fall back to the world setting.
  try {
    const snap = data?.context?.bankChoicesEnabled;
    if (typeof snap === "boolean") return snap;
  } catch (_e) {
    // ignore
  }

  try {
    const getter = game?.settings?.get;
    if (typeof getter === "function") {
      const v = getter.call(game.settings, "uesrpg-3ev4", "opposedBankChoices");
      return Boolean(v);
    }
  } catch (_e) {
    // ignore
  }

  return false;
}

function _ensureBankedScaffold(data) {
  data.context = data.context ?? {};
  data.attacker = data.attacker ?? {};
  data.defender = data.defender ?? {};

  data.attacker.banked = (data.attacker.banked && typeof data.attacker.banked === "object") ? data.attacker.banked : {
    committed: false,
    committedAt: null,
    committedBy: null
  };

  data.defender.banked = (data.defender.banked && typeof data.defender.banked === "object") ? data.defender.banked : {
    committed: false,
    committedAt: null,
    committedBy: null
  };


  // Optional: auto-roll lane flags (non-breaking; used to reduce duplicate auto-roll attempts).
  if (typeof data.attacker.banked.rollStarted !== "boolean") data.attacker.banked.rollStarted = false;
  if (data.attacker.banked.rollStartedAt === undefined) data.attacker.banked.rollStartedAt = null;
  if (data.attacker.banked.rollStartedBy === undefined) data.attacker.banked.rollStartedBy = null;

  if (typeof data.defender.banked.rollStarted !== "boolean") data.defender.banked.rollStarted = false;
  if (data.defender.banked.rollStartedAt === undefined) data.defender.banked.rollStartedAt = null;
  if (data.defender.banked.rollStartedBy === undefined) data.defender.banked.rollStartedBy = null;

  // Back-compat: legacy cards use hasDeclared/defenseType/noDefense as the implicit commit state.
  if (data.attacker.hasDeclared === true && data.attacker.banked.committed !== true) {
    data.attacker.banked.committed = true;
  }

  const defenderImplicitCommitted = Boolean(data.defender.noDefense === true || data.defender.defenseType || data.defender.testLabel || data.defender.label);
  if (defenderImplicitCommitted && data.defender.banked.committed !== true) {
    data.defender.banked.committed = true;
  }

  return data;
}

function _getBankCommitState(data) {
  data = _ensureBankedScaffold(data);

  const aCommitted = Boolean(data.attacker?.banked?.committed === true || data.attacker?.hasDeclared === true);
  const dCommitted = Boolean(
    data.defender?.banked?.committed === true ||
    data.defender?.noDefense === true ||
    data.defender?.defenseType != null ||
    data.defender?.testLabel != null
  );

  const bothCommitted = aCommitted && dCommitted;

  return { aCommitted, dCommitted, bothCommitted };
}

function _anyActiveGMOnline() {
  try {
    const users = game?.users ? Array.from(game.users.values()) : [];
    return users.some(u => u?.active && u.isGM);
  } catch (_e) {
    return false;
  }
}

async function _getDefenseGatingContext({ attacker, defender, data }) {
  // Attacker weapon traits can restrict eligible defense options (e.g., Flail cannot be parried/countered).
  // Keep this deterministic and schema-safe.
  const attackerWeaponTraits = { flail: false, entangling: false, isTwoHanded: false };
  let defenderHasSmallWeapon = false;

  try {
    const wUuid = String(data?.context?.weaponUuid ?? '').trim() || _getPreferredWeaponUuid(attacker, { meleeOnly: false });
    if (wUuid) {
      const w = await fromUuid(wUuid);
      if (w?.type === 'weapon') {
        attackerWeaponTraits.flail = _weaponHasQuality(w, 'flail', { allowLegacy: false });
        attackerWeaponTraits.entangling = _weaponHasQuality(w, 'entangling');

        const handsRaw = Number(w.system?.hands ?? 0);
        const hands = Number.isFinite(handsRaw) ? handsRaw : 0;
        const traitTwoHanded = _weaponHasQuality(w, 'twoHanded', { allowLegacy: true });
        const wield2H = Boolean(w.system?.weapon2H);
        attackerWeaponTraits.isTwoHanded = Boolean(traitTwoHanded || wield2H || hands >= 2);
      }
    }

    try {
      const weaponMap = new Map();
      const addWeapon = (it) => {
        if (!it || it.type !== 'weapon') return;
        if (!it.id) return;
        weaponMap.set(it.id, it);
      };

      const ew = defender?.system?.equippedWeapons;
      const boundIds = [
        ew?.primaryWeapon?.id,
        ew?.secondaryWeapon?.id,
        ew?.equippedWeapons?.primaryWeapon?.id,
        ew?.equippedWeapons?.secondaryWeapon?.id
      ].filter(Boolean);

      for (const id of boundIds) {
        const bound = defender?.items?.get?.(id);
        if (bound) addWeapon(bound);
      }

      for (const it of (defender?.items ?? [])) {
        if (!it || it.type !== 'weapon') continue;
        if (!it.system || !Object.prototype.hasOwnProperty.call(it.system, 'equipped')) continue;
        if (it.system.equipped === true) addWeapon(it);
      }

      const equippedWeapons = Array.from(weaponMap.values());
      defenderHasSmallWeapon = equippedWeapons.some(w => _weaponHasQuality(w, 'small', { allowLegacy: true }));
    } catch (_innerErr) {
      defenderHasSmallWeapon = false;
    }
  } catch (err) {
    console.warn('UESRPG | opposed-workflow | defense gating context lookup failed', err);
  }

  return { attackerWeaponTraits, defenderHasSmallWeapon };
}

function _getTokenMovementAction(token) {
  // Prefer TokenDocument.movementAction when available. Fall back to common schema shapes.
  const doc = token?.document ?? null;
  const raw = doc?.movementAction ?? doc?.movement?.action ?? doc?.movement?.mode ?? "";
  return String(raw ?? "").toLowerCase();
}

async function _inferAttackModeFromPreferredWeapon(actor) {
  try {
    const weaponUuid = _getPreferredWeaponUuid(actor, { meleeOnly: false }) || "";
    if (!weaponUuid) return "melee";

    const weapon = await fromUuid(weaponUuid);
    if (!weapon || weapon.type !== "weapon") return "melee";

    // Repository conventions: weapon.system.attackMode is the primary lane ("melee" | "ranged").
    // Defensive fallback: weaponType is used on many weapons; thrown weapons are treated as ranged for attack-mode purposes.
    const mode = String(weapon.system?.attackMode ?? weapon.system?.weaponType ?? weapon.system?.type ?? "").toLowerCase();
    if (mode.includes("ranged")) return "ranged";
    if (_weaponHasQuality(weapon, "thrown")) return "ranged";
    return "melee";
  } catch (_err) {
    return "melee";
  }
}

function _debugEnabled() {
  return Boolean(game.settings.get("uesrpg-3ev4", "opposedDebug"));
}

function _logDebug(event, payload) {
  if (!_debugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`UESRPG Opposed | ${event}`, payload);
    try {
      const id = payload?.messageId ?? payload?.parentMessageId ?? null;
      game.uesrpg?.debug?.recordOpposedEvent?.(id, event, payload);
    } catch (_e2) {
      /* no-op */
    }
  } catch (_e) {}
}


function _userHasActorOwnership(user, actor) {
  try {
    if (!user || !actor) return false;
    if (user.isGM) return true;
    if (typeof actor.testUserPermission === 'function') {
      return actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    }
    const level = Number(actor?.ownership?.[user.id] ?? 0);
    return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  } catch (_e) {
    return false;
  }
}

function _opposedFlags(parentMessageId, stage, extra = null) {
  // Thread all workflow messages to the originating opposed card for easier debugging and filtering.
  // Optionally include additional metadata under the same flag lane.
  const base = {
    parentMessageId,
    stage
  };
  const opposed = (extra && typeof extra === "object") ? foundry.utils.mergeObject(base, extra, { inplace: false }) : base;
  return {
    "uesrpg-3ev4": {
      opposed
    }
  };
}

function _renderBreakdown(tnObj) {
  const rows = (tnObj?.breakdown ?? []).map(b => {
    const v = Number(b.value ?? 0);
    const sign = v >= 0 ? "+" : "";
    return `<div style="display:flex; justify-content:space-between; gap:10px;"><span>${b.label}</span><span>${sign}${v}</span></div>`;
  }).join("");
  if (!rows) return "";
  return `
    <details style="margin-top:4px;">
      <summary style="cursor:pointer; user-select:none;">TN breakdown</summary>
      <div style="margin-top:4px; font-size:12px; opacity:0.9;">${rows}</div>
    </details>`;
}



function _extractRollTotal(res) {
  const n = Number(res?.rollTotal ?? res?.total ?? res?.roll?.total ?? res?.roll?._total ?? res?.roll?.result ?? NaN);
  return Number.isFinite(n) ? n : null;
}

function _renderRollLine({ result = null, noDefense = false } = {}) {
  if (noDefense) {
    // Keep output consistent with normal failures: represent No Defense as a deterministic 1 DoF failure.
    const stub = { rollTotal: 100, isSuccess: false, degree: 1 };
    return `<div><b>Roll:</b> 100 — ${_fmtDegree(stub)}</div>`;
  }
  if (!result) return "";
  const total = _extractRollTotal(result);
  const totalText = (total == null) ? "—" : String(total);
  return `<div><b>Roll:</b> ${totalText} — ${_fmtDegree(result)}</div>`;
}

function _cleanupAutoRollContext(ctx) {
  if (!ctx || typeof ctx !== "object") return;
  ctx.autoRollRequested = false;
  ctx.autoRollRequestedAt = null;
  ctx.autoRollRequestedBy = null;
  ctx.autoRollStarted = false;
  ctx.autoRollStartedAt = null;
  ctx.autoRollStartedBy = null;
  ctx.autoRollStartedTrigger = null;
  ctx.autoRollClaimId = null;
  ctx.waitingSince = null;
}

function _renderCard(data, messageId) {
  const a = data.attacker ?? {};
  const d = data.defender ?? {};

  const showResolutionDetails = !!(game?.settings?.get?.("uesrpg-3ev4", "opposedShowResolutionDetails"));

  const bankMode = _isBankChoicesEnabledForData(data);
  const { aCommitted, dCommitted, bothCommitted } = _getBankCommitState(data);

  const anyGMOnline = _anyActiveGMOnline();

  // When bankMode is enabled, suppress choice/tn details until both sides have committed.
  const revealChoices = !bankMode || bothCommitted || data.status === "resolved" || !!data.outcome;

  const baseA = Number(a.baseTarget ?? 0);
  const modA = Number(a.totalMod ?? 0);
  const finalA = baseA + modA;
  const aTargetLabel = (revealChoices && a.hasDeclared === true)
    ? `${finalA}${modA ? ` (${modA >= 0 ? "+" : ""}${modA})` : ""}`
    : (revealChoices ? `${baseA}` : "—");

  const aVariantText = (revealChoices && a.hasDeclared)
    ? (a.variantLabel ?? "Attack")
    : "—";

  const dTargetLabel = (!revealChoices)
    ? "—"
    : (d.noDefense ? "0" : (d.targetLabel ?? (d.target ?? "—")));

  const dTestLabel = (!revealChoices)
    ? "—"
    : (d.testLabel ?? "(choose)");

  const dDefenseLabel = (!revealChoices)
    ? "—"
    : (d.defenseLabel ?? d.label ?? "(choose)");

  // Roll summaries: use a single formatter for parity across banked and non-banked modes.
  const aRollLine = _renderRollLine({ result: a.result, noDefense: false });
  const dRollLine = _renderRollLine({ result: d.result, noDefense: (d.noDefense === true) });
  const attackerCommitLine = (() => {
    if (!bankMode) return "";
    const resolved = (data.status === "resolved") || !!data.outcome;
    const rolled = !!a.result;
    const statusText = resolved ? "Resolved" : rolled ? "Rolled" : (aCommitted ? "Committed" : "Awaiting choice");
    return `<div style="margin-top:4px; font-size:12px; opacity:0.85;"><b>Status:</b> ${statusText}</div>`;
  })();

  const defenderCommitLine = (() => {
    if (!bankMode) return "";
    const resolved = (data.status === "resolved") || !!data.outcome;
    const rolled = !!d.result || !!d.noDefense;
    const statusText = resolved ? "Resolved" : rolled ? "Rolled" : (dCommitted ? "Committed" : "Awaiting choice");
    return `<div style="margin-top:4px; font-size:12px; opacity:0.85;"><b>Status:</b> ${statusText}</div>`;
  })();

  const attackerActions = (() => {
    if (a.result) return "";

    if (bankMode) {
      if (!aCommitted) {
        return `<div style="margin-top:6px;">${_btn("Commit Attack", "attacker-commit")}</div>`;
      }

      return "";
    }

    return `<div style="margin-top:6px;">${_btn("Roll Attack", "attacker-roll")}</div>`;
  })();

  const defenderActions = (() => {
    if (d.result || d.noDefense) return "";

    if (bankMode) {
      if (!dCommitted) {
        return `
          <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
            ${_btn("Commit Defense", "defender-commit")}
            ${_btn("Commit No Defense", "defender-commit-nodefense")}
          </div>`;
      }

      return "";
    }

    return `
      <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
        ${_btn("Defend", "defender-roll")}
        ${_btn("No Defense", "defender-nodefense")}
      </div>`;
  })();

  const bankedRollActions = "";

  const outcomeLine = (() => {
    if (data.outcome) {
      return `<div style="margin-top:10px;"><b>Outcome:</b> ${data.outcome.text ?? ""}</div>`;
    }

    if (bankMode) {
      if (!bothCommitted) {
        return `<div style="margin-top:10px;"><i>Waiting for both sides to commit choices…</i></div>`;
      }

      if (anyGMOnline) {
        return `<div style="margin-top:10px;"><i>Rolling…</i></div>`;
      }

      return `<div style="margin-top:10px;"><i>Rolling…</i></div>`;
    }

    // Legacy/non-banked pending hint
    const phase = String(data?.context?.phase ?? "pending");
    const waitingSince = Number(data?.context?.waitingSince ?? 0);
    const ageMs = waitingSince ? (Date.now() - waitingSince) : 0;
    const isWaiting = (phase === "waitingdefender" || phase === "waitingDefender");
    const isStale = isWaiting && ageMs > 60_000;
    const note = isStale
      ? `<div style="margin-top:6px; font-size:12px; opacity:0.85;">
           Still waiting on the defender result. If this persists, ensure the defender roll message was posted, and have the attacker refresh the page to re-render the card.
         </div>`
      : "";
    return `<div style="margin-top:10px;"><i>Pending</i></div>${note}`;
  })();

  const resolutionDetails = (() => {
    if (!showResolutionDetails) return "";
    if (!data.outcome) return "";
    const aVariant = a.variantLabel ?? a.variant ?? "—";
    const dDefense = d.defenseLabel ?? d.defenseType ?? "—";
    const advA = Number(data.advantage?.attacker ?? 0);
    const advD = Number(data.advantage?.defender ?? 0);
    const aManual = Number(a.manualMod ?? 0);
    const aHL = (a.precisionLocation ?? a.hitLocation ?? "").toString();
    const dHL = (d.precisionLocation ?? d.hitLocation ?? "").toString();

    const lines = [];
    lines.push(`<div><b>Attack variation:</b> ${aVariant}</div>`);
    lines.push(`<div><b>Manual modifier:</b> ${aManual >= 0 ? "+" : ""}${aManual}</div>`);
    if (aHL) lines.push(`<div><b>Attacker hit location:</b> ${aHL}</div>`);
    if (dHL) lines.push(`<div><b>Defender hit location:</b> ${dHL}</div>`);
    lines.push(`<div><b>Advantage:</b> Attacker ${advA} / Defender ${advD}</div>`);
    lines.push(`<div><b>Defense:</b> ${dDefense}</div>`);
    if (Number(d?.result?.duelingBonus ?? 0) > 0) {
      lines.push(`<div><b>Dueling Weapon:</b> +${Number(d.result.duelingBonus)} DoS</div>`);
    }

    return `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer;">Resolution details</summary>
        <div style="margin-top:6px; font-size:12px; opacity:0.9;">
          ${lines.join("")}
        </div>
      </details>`;
  })();

  const resolvedActions = (() => {
    if (!data.outcome || data.status !== "resolved") return "";

    // Gate damage resolution based on RAW outcome.
    // Attacker wins => damage can be rolled/applied to defender.
    // Defender wins via Block => special case: resolve block damage vs BR.
    const advA = Number(data.advantage?.attacker ?? 0);
    const advD = Number(data.advantage?.defender ?? 0);

    if (data.outcome.winner === "attacker") {
      return `
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${_btn("Roll Damage", "damage-roll")}
          ${advA > 0 ? `<span style="opacity:0.85; font-size:12px;">Advantage: ${advA}</span>` : ``}
        </div>
      `;
    }

    // Defender wins via Counter-Attack => defender becomes the damage roller (attacker for this strike).
    if (data.outcome.winner === "defender" && (d.defenseType ?? "none") === "counter") {
      return `
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${_btn("Roll Damage", "counter-damage-roll")}
          ${advD > 0 ? `<span style="opacity:0.85; font-size:12px;">Advantage: ${advD}</span>` : ``}
        </div>
      `;
    }

    if (data.outcome.winner === "defender" && (d.defenseType ?? "none") === "block") {
      return `
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${_btn("Resolve Block", "block-resolve")}
          ${advD > 0 ? `<span style="opacity:0.85; font-size:12px;">Advantage: ${advD}</span>` : ``}
        </div>
      `;
    }

    // Defender wins by defending (Parry / Evade / other non-block, non-counter defense).
    // RAW Step 3: "Defender wins: The defense is successful, the defender chooses how to utilize their advantage and resolves it."
    // NOTE: If the defender chose "No Defense", the defender is treated as having automatically failed and cannot gain advantage.
    const defenderCanUseAdvantage = (data.outcome.winner === "defender")
      && (d.noDefense !== true)
      && !["block", "counter", "none"].includes(String(d.defenseType ?? "none"))
      && (advD > 0)
      && (data.defenderAdvantage?.resolved !== true);

    if (defenderCanUseAdvantage) {
      return `
        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${_btn("Resolve Advantage", "defender-advantage")}
          <span style="opacity:0.85; font-size:12px;">Advantage: ${advD}</span>
        </div>
      `;
    }

    return "";
  })();

  return `
  <div class="ues-opposed-card" data-message-id="${messageId}" style="padding:6px 6px;">
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start;">
      <div style="padding-right:10px; border-right:1px solid rgba(0,0,0,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Attacker</div>
          <div style="font-size:13px;"><b>${a.tokenName ?? a.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Test:</b> ${revealChoices ? (a.label ?? "Attack") : "—"}</div>
          <div><b>Attack:</b> ${aVariantText}</div>
          <div><b>TN:</b> ${aTargetLabel}</div>

          ${aRollLine}
          ${revealChoices ? _renderBreakdown(a.tn) : ""}
          ${attackerCommitLine}
        </div>
        ${attackerActions}
      </div>
      <div style="padding-left:2px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Defender</div>
          <div style="font-size:13px;"><b>${d.tokenName ?? d.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Test:</b> ${dTestLabel}</div>
          <div><b>Defense:</b> ${dDefenseLabel}</div>
          <div><b>TN:</b> ${dTargetLabel}</div>

          ${dRollLine}
          ${revealChoices ? _renderBreakdown(d.tn) : ""}
          ${defenderCommitLine}
        </div>
        ${defenderActions}
      </div>
    </div>
    ${outcomeLine}
    ${bankedRollActions}
    ${resolutionDetails}
    ${resolvedActions}
  </div>`;
}
async function _updateCard(message, data) {
  // Touch context for diagnostics
  data.context = data.context ?? {};
  data.context.schemaVersion = data.context.schemaVersion ?? 1;
  data.context.updatedAt = Date.now();
  data.context.updatedBy = game.user.id;
  // Ensure strict ordering for rapid successive updates (e.g. defender roll then resolution)
  // where Date.now() can collide within the same millisecond.
  data.context.updatedSeq = (Number(data.context.updatedSeq) || 0) + 1;

  const payload = {
    content: _renderCard(data, message.id),
    flags: { "uesrpg-3ev4": { opposed: data } }
  };

  // Permission-safe update: defenders (non-message-authors) cannot update ChatMessage directly.
  // If lacking permission, ask the active GM to apply the update via socket.
  await safeUpdateChatMessage(message, payload);
}



function _getChatMessageAuthorUser(msg) {
  const authorId =
    msg?.author?.id ??
    msg?._source?.author ??
    msg?._source?.user ??
    msg?.data?.author ??
    msg?.data?.user ??
    null;
  return authorId ? (game.users.get(String(authorId)) ?? null) : null;
}

function _applyDefenderCommitToData(data, commit) {
  if (!commit || typeof commit !== "object") return false;
  data.defender = data.defender ?? {};
  let dirty = false;
  if (commit.defenseType != null) {
    data.defender.defenseType = String(commit.defenseType);
    dirty = true;
  }
  if (commit.label != null) {
    data.defender.label = String(commit.label);
    dirty = true;
  }
  if (commit.defenseLabel != null) {
    data.defender.defenseLabel = String(commit.defenseLabel);
    dirty = true;
  }
  if (commit.testLabel != null) {
    data.defender.testLabel = String(commit.testLabel);
    dirty = true;
  }
  if (commit.target != null && Number.isFinite(Number(commit.target))) {
    data.defender.target = Number(commit.target);
    dirty = true;
  }
  if (commit.targetLabel != null) {
    data.defender.targetLabel = String(commit.targetLabel);
    dirty = true;
  }
  if (commit.tn && typeof commit.tn === "object") {
    data.defender.tn = foundry.utils.deepClone(commit.tn);
    dirty = true;
  }
  return dirty;
}

function _applyAttackerCommitToData(data, commit) {
  if (!commit || typeof commit !== "object") return false;
  data.attacker = data.attacker ?? {};
  let dirty = false;
  if (commit.hasDeclared != null) {
    data.attacker.hasDeclared = Boolean(commit.hasDeclared);
    dirty = true;
  }
  if (commit.itemUuid != null) {
    data.attacker.itemUuid = String(commit.itemUuid);
    dirty = true;
  }
  if (commit.label != null) {
    data.attacker.label = String(commit.label);
    dirty = true;
  }
  if (commit.variant != null) {
    data.attacker.variant = String(commit.variant);
    dirty = true;
  }
  if (commit.variantLabel != null) {
    data.attacker.variantLabel = String(commit.variantLabel);
    dirty = true;
  }
  if (commit.variantMod != null && Number.isFinite(Number(commit.variantMod))) {
    data.attacker.variantMod = Number(commit.variantMod);
    dirty = true;
  }
  if (commit.manualMod != null && Number.isFinite(Number(commit.manualMod))) {
    data.attacker.manualMod = Number(commit.manualMod);
    dirty = true;
  }
  if (commit.circumstanceMod != null && Number.isFinite(Number(commit.circumstanceMod))) {
    data.attacker.circumstanceMod = Number(commit.circumstanceMod);
    dirty = true;
  }
  if (commit.circumstanceLabel != null) {
    data.attacker.circumstanceLabel = String(commit.circumstanceLabel);
    dirty = true;
  }
  if (commit.totalMod != null && Number.isFinite(Number(commit.totalMod))) {
    data.attacker.totalMod = Number(commit.totalMod);
    dirty = true;
  }
  if (commit.baseTarget != null && Number.isFinite(Number(commit.baseTarget))) {
    data.attacker.baseTarget = Number(commit.baseTarget);
    dirty = true;
  }
  if (commit.target != null && Number.isFinite(Number(commit.target))) {
    data.attacker.target = Number(commit.target);
    dirty = true;
  }
  if (commit.tn && typeof commit.tn === "object") {
    data.attacker.tn = foundry.utils.deepClone(commit.tn);
    dirty = true;
  }
  if (commit.pendingApCost != null && Number.isFinite(Number(commit.pendingApCost))) {
    data.attacker.pendingApCost = Number(commit.pendingApCost);
    dirty = true;
  }
  return dirty;
}


function _isValidOpposedRollMessageForHeal({ rollMessage, parentMessageId, expectedStage, expectedActor }) {
  if (!rollMessage || !parentMessageId || !expectedStage || !expectedActor) return false;

  const meta = rollMessage?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
  if (!meta) return false;
  if (meta.parentMessageId !== parentMessageId) return false;
  if (meta.stage !== expectedStage) return false;

  const speakerActorId = rollMessage?.speaker?.actor ?? null;
  if (speakerActorId && speakerActorId !== expectedActor.id) return false;

  const authorUser = _getChatMessageAuthorUser(rollMessage);
  if (!authorUser) return false;
  if (!authorUser.isGM && !_userHasActorOwnership(authorUser, expectedActor)) return false;

  return true;
}

function _extractFirstRollTotal(rollMessage) {
  const roll = rollMessage?.rolls?.[0] ?? null;
  const total = Number(roll?.total ?? NaN);
  return Number.isFinite(total) ? total : null;
}

async function _hydrateSideResultFromRollMessageId({ message, data, sideKey, expectedStage, expectedActor }) {
  if (!message || !data || !sideKey || !expectedStage || !expectedActor) return { dirty: false };

  const side = data?.[sideKey] ?? null;
  const rollMessageId = side?.rollMessageId ?? null;
  if (!rollMessageId) return { dirty: false };
  if (side?.result) return { dirty: false };

  const rollMessage = game.messages.get(rollMessageId) ?? null;
  if (!rollMessage) return { dirty: false };

  if (!_isValidOpposedRollMessageForHeal({
    rollMessage,
    parentMessageId: message.id,
    expectedStage,
    expectedActor
  })) {
    return { dirty: false };
  }

  const rollTotal = _extractFirstRollTotal(rollMessage);
  if (rollTotal == null) return { dirty: false };

  // Defender roll messages can carry the computed TN + labels to support cross-user banking.
  // Use that commit payload to heal partial states where the defender lane is incomplete.
  if (sideKey === "defender") {
    const commit = rollMessage?.flags?.["uesrpg-3ev4"]?.opposed?.commit?.defender ?? null;
    _applyDefenderCommitToData(data, commit);
  }

  const target = Number(side?.target ?? side?.tn?.finalTN ?? NaN);
  if (!Number.isFinite(target)) return { dirty: false };

  const res = computeResultFromRollTotal(expectedActor, {
    rollTotal,
    target,
    allowLucky: true,
    allowUnlucky: true
  });

  side.result = {
    rollTotal: res.rollTotal,
    target: res.target,
    isSuccess: res.isSuccess,
    degree: res.degree,
    textual: res.textual,
    isCriticalSuccess: res.isCriticalSuccess,
    isCriticalFailure: res.isCriticalFailure
  };

  if (!side.rolledAt) side.rolledAt = Date.now();

  return { dirty: true };
}

async function _selfHealOpposedCardFromStoredRolls(message, data, { reason = "" } = {}) {
  if (!message || !data) return { dirty: false, resolved: Boolean(data?.status === "resolved" && data?.outcome) };

  let dirty = false;
  const fixes = [];

  data.context = data.context ?? {};

  const attacker = _resolveActor(data.attacker?.actorUuid);
  const defender = _resolveActor(data.defender?.actorUuid);

  // Heal attacker lane if the rollMessageId exists but result is missing.
  if (attacker && data.attacker?.rollMessageId && !data.attacker?.result) {
    const r = await _hydrateSideResultFromRollMessageId({
      message,
      data,
      sideKey: "attacker",
      expectedStage: "attacker-roll",
      expectedActor: attacker
    });
    if (r.dirty) {
      dirty = true;
      fixes.push("attacker.result");
    }
  }

  // Heal defender lane: No Defense is a deterministic failure state.
  if (data.defender?.noDefense === true && !data.defender?.result) {
    data.defender = data.defender ?? {};
    data.defender.defenseType = data.defender.defenseType ?? "none";
    data.defender.label = data.defender.label ?? "No Defense";
    data.defender.testLabel = data.defender.testLabel ?? "No Defense";
    data.defender.defenseLabel = data.defender.defenseLabel ?? "No Defense";
    data.defender.target = Number.isFinite(Number(data.defender.target)) ? Number(data.defender.target) : 0;
    data.defender.tn = data.defender.tn ?? { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
    data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1, textual: "1 DoF", isCriticalSuccess: false, isCriticalFailure: false };
    dirty = true;
    fixes.push("defender.result(noDefense)");
  }

  // Heal defender lane from roll message (includes TN commit).
  if (defender && data.defender?.rollMessageId && !data.defender?.result && data.defender?.noDefense !== true) {
    const r = await _hydrateSideResultFromRollMessageId({
      message,
      data,
      sideKey: "defender",
      expectedStage: "defender-roll",
      expectedActor: defender
    });
    if (r.dirty) {
      dirty = true;
      fixes.push("defender.result");
    }
  }

  // Normalize resolved state: if both sides exist, ensure outcome/advantage/status are present.
  const hasAttacker = Boolean(data.attacker?.result);
  const hasDefender = Boolean(data.defender?.result) || Boolean(data.defender?.noDefense);

  if (hasAttacker && hasDefender) {
    const needsOutcome = !data.outcome || typeof data.outcome !== "object";
    const needsResolved = data.status !== "resolved";

    if (needsOutcome || needsResolved) {
      const outcome = data.outcome ?? _resolveOutcomeRAW(data);
      if (outcome) {
        data.outcome = outcome;
        data.advantage = _computeAdvantageRAW(data, outcome);
        data.status = "resolved";
        data.context.phase = "resolved";
        if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
        _cleanupAutoRollContext(data.context);
        dirty = true;
        fixes.push("outcome/status");
      }
    }
  }

  if (dirty) {
    data.context = data.context ?? {};
    data.context.selfHeal = {
      at: Date.now(),
      by: game.user.id,
      reason: String(reason ?? ""),
      fixes
    };

    _logDebug("selfHeal", {
      messageId: message.id,
      reason,
      fixes,
      attackerRollMessageId: data.attacker?.rollMessageId ?? null,
      defenderRollMessageId: data.defender?.rollMessageId ?? null
    });

    await _updateCard(message, data);
  }

  return { dirty, resolved: Boolean(data?.status === "resolved" && data?.outcome) };
}
//
// Ensure the opposed card is in a resolved state before running post-resolution actions
// (e.g. Roll Damage). Some edge cases can display resolved HTML while the stored
// flags are still missing outcome/status due to out-of-order or partial updates.
// This helper is a safe, deterministic self-heal: if both roll results exist, it
// computes outcome + advantage and persists them to the card.
async function _ensureResolvedForPostActions(message, data) {
  try {
    if (!message || !data) return false;
    if (data.status === "resolved" && data.outcome) return true;

    // Self-heal: if rollMessageIds exist but card flags are incomplete, rehydrate from the roll messages
    // and recompute outcome deterministically.
    await _selfHealOpposedCardFromStoredRolls(message, data, { reason: "ensureResolvedForPostActions" });

    if (data.status === "resolved" && data.outcome) return true;

    // Fallback: if both results exist in-memory but outcome is still missing, compute it once.
    const hasAttacker = Boolean(data.attacker?.result);
    const hasDefender = Boolean(data.defender?.result) || Boolean(data.defender?.noDefense);
    if (!hasAttacker || !hasDefender) return false;

    const outcome = data.outcome ?? _resolveOutcomeRAW(data);
    if (!outcome) return false;

    data.outcome = outcome;
    data.advantage = _computeAdvantageRAW(data, outcome);
    data.status = "resolved";

    data.context = data.context ?? {};
    data.context.phase = "resolved";
    if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();

    await _updateCard(message, data);
    return true;
  } catch (err) {
    console.error("UESRPG | opposed-workflow | ensureResolvedForPostActions failed", err);
    return false;
  }
}

async function _attackerDeclareDialog(attackerActor, attackerLabel, { styles = [], selectedStyleUuid = null, defaultWeaponUuid = null,
    defaultVariant = "normal", defaultManual = 0, defaultCirc = 0 } = {}) {
  const showStyleSelect = Array.isArray(styles) && styles.length >= 2;

  // Weapon selection is required for deterministic weapon-quality automation (range bands, flail gating, etc.).
  const equippedWeapons = _listEquippedWeapons(attackerActor);
  const preferredWeaponUuid = String(defaultWeaponUuid ?? "").trim()
    || _getPreferredWeaponUuid(attackerActor, { meleeOnly: false })
    || (equippedWeapons[0]?.uuid ?? "");

  const weaponSelect = (equippedWeapons.length >= 2)
    ? `
      <div class="form-group">
        <label><b>Weapon</b></label>
        <select name="weaponUuid" style="width:100%;">
          ${equippedWeapons.map(w => {
            const sel = (w.uuid === preferredWeaponUuid) ? "selected" : "";
            return `<option value="${w.uuid}" ${sel}>${w.name}</option>`;
          }).join("\n")}
        </select>
      </div>
    `
    : `<input type="hidden" name="weaponUuid" value="${preferredWeaponUuid}" />`;

  const styleSelect = showStyleSelect
    ? `
      <div class="form-group">
        <label><b>Combat Style</b></label>
        <select name="styleUuid" style="width:100%;">
          ${styles.map(s => {
            const sel = (s.uuid === selectedStyleUuid) ? "selected" : "";
            return `<option value="${s.uuid}" ${sel}>${s.name}</option>`;
          }).join("\n")}
        </select>
      </div>
    `
    : `<input type="hidden" name="styleUuid" value="${selectedStyleUuid ?? ""}" />`;

  const allowedLocs = ["Head", "Body", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const safeDefaultLoc = "Body";
  const locOptions = allowedLocs.map(l => {
    const sel = l === safeDefaultLoc ? "selected" : "";
    return `<option value="${l}" ${sel}>${l}</option>`;
  }).join("\n");

  
  const hasBlinded = hasCondition(attackerActor, "blinded");
  const hasDeafened = hasCondition(attackerActor, "deafened");
  const sensoryControls = (hasBlinded || hasDeafened) ? `
    <div class="form-group" style="margin-top:8px;">
      <label><b>Sensory Impairment</b></label>
      <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
        ${hasBlinded ? '<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" name="applyBlinded" checked/> <span>Apply Blinded (-30, sight-based)</span></label>' : ''}
        ${hasDeafened ? '<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" name="applyDeafened" checked/> <span>Apply Deafened (-30, hearing-based)</span></label>' : ''}
      </div>
      <p style="opacity:0.8; font-size:12px; margin-top:6px;">
        RAW: these penalties apply only to tests benefiting from the relevant sense.
      </p>
    </div>` : "";

  const content = `
  <style>
    /* Match defender dialog feel + enforce 2-col button row */
    .uesrpg-attack-declare .form-row { display:flex; align-items:center; gap:12px; }
    .uesrpg-attack-declare .form-row label { flex:0 0 140px; }
    .uesrpg-attack-declare .form-row select,
    .uesrpg-attack-declare .form-row input { flex:1 1 auto; width:100%; }

    .uesrpg-attack-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
	    .uesrpg-attack-grid label { border:1px solid #888; padding:10px; border-radius:6px; display:block; }
    .uesrpg-attack-grid .hint { font-size: 12px; opacity: 0.8; display:block; margin-top:4px; }
	    .uesrpg-attack-grid .ps-location { margin-top:6px; }
	    .uesrpg-attack-grid .ps-location select { width:100%; }
	    .uesrpg-attack-grid .ps-location.disabled { opacity:0.65; }

    /* Force dialog footer buttons to be a single row, 2 columns */
    .dialog .dialog-buttons { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dialog .dialog-buttons button { width: 100%; }
  </style>

  <form class="uesrpg-attack-declare">
    ${styleSelect}

    ${weaponSelect}

    <div style="margin-top:12px;"><b>Attack Variation</b></div>
    <div class="uesrpg-attack-grid">
      <label>
        <input type="radio" name="attackVariant" value="normal" ${defaultVariant === "normal" ? "checked" : ""} />
        <b>Normal Attack</b>
        <span class="hint">Standard attack action.</span>
      </label>

      <label>
        <input type="radio" name="attackVariant" value="allOut" ${defaultVariant === "allOut" ? "checked" : ""} />
        <b>All Out Attack</b> — +20
        <span class="hint">Melee only. Spend +1 AP to gain +20.</span>
      </label>

	      <label class="uesrpg-precision-option">
        <input type="radio" name="attackVariant" value="precision" ${defaultVariant === "precision" ? "checked" : ""} />
        <b>Precision Strike</b> — -20
        <span class="hint">If successful, choose hit location.</span>
	        <div class="ps-location ${defaultVariant === "precision" ? "" : "disabled"}">
	          <select name="precisionLocation" ${defaultVariant === "precision" ? "" : "disabled"}>
	            ${locOptions}
	          </select>
	        </div>
      </label>

      <label>
        <input type="radio" name="attackVariant" value="coup" ${defaultVariant === "coup" ? "checked" : ""} />
        <b>Coup de Grâce</b>
        <span class="hint">Helpless target only. Flags special resolution.</span>
      </label>
    </div>

	
    <div class="form-group" style="margin-top:12px;">
      <label><b>Combat Circumstance Modifiers</b></label>
      <select name="circMod" style="width:100%;">
        <option value="0" ${Number(defaultCirc) === 0 ? "selected" : ""}>—</option>
        <option value="-10" ${Number(defaultCirc) === -10 ? "selected" : ""}>Minor Disadvantage (-10)</option>
        <option value="-20" ${Number(defaultCirc) === -20 ? "selected" : ""}>Disadvantage (-20)</option>
        <option value="-30" ${Number(defaultCirc) === -30 ? "selected" : ""}>Major Disadvantage (-30)</option>
      </select>
    </div>

    <div class="form-group" style="margin-top:12px;">
      <label><b>Manual Modifier</b></label>
      <input name="manualMod" type="number" value="${Number(defaultManual) || 0}" style="width:100%;" />
    </div>
  
    ${sensoryControls}
</form>
`;

  // Use an explicit Dialog instance so we can wire listeners without inline JS.
  return await new Promise((resolve) => {
    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    const dialog = new Dialog({
      title: `${attackerLabel} — Attack Options`,
      content,
      buttons: {
        ok: {
          label: "Continue",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            if (!root) return settle(null);
            const styleUuid = root.querySelector('select[name="styleUuid"]')?.value
              ?? root.querySelector('input[name="styleUuid"]')?.value
              ?? "";
            const weaponUuid = root.querySelector('select[name="weaponUuid"]')?.value
              ?? root.querySelector('input[name="weaponUuid"]')?.value
              ?? "";
            const variant = root.querySelector('input[name="attackVariant"]:checked')?.value ?? "normal";
            const raw = root.querySelector('input[name="manualMod"]')?.value ?? "0";
            const manualMod = Number.parseInt(String(raw), 10) || 0;
            const rawCirc = root.querySelector('select[name="circMod"]')?.value ?? "0";
            const circumstanceMod = Number.parseInt(String(rawCirc), 10) || 0;
            const precisionLocation = root.querySelector('select[name="precisionLocation"]')?.value ?? safeDefaultLoc;

            // AP: Attacking costs 1 AP. All Out Attack costs +1 AP (total 2 AP).
            const applyBlinded = Boolean(root.querySelector('input[name="applyBlinded"]')?.checked);
            const applyDeafened = Boolean(root.querySelector('input[name="applyDeafened"]')?.checked);

            const baseApCost = 1;
            // `apCost` is the *additional* AP cost for the chosen variant (RAW: All Out Attack is +1 AP).
            const apCost = (variant === "allOut") ? 1 : 0;
            const totalApCost = baseApCost + apCost;

            const ap = Number(foundry.utils.getProperty(attackerActor, "system.action_points.value") ?? 0);
            if (!Number.isFinite(ap) || ap < totalApCost) {
              ui.notifications?.warn?.(`Not enough Action Points to perform this attack (requires ${totalApCost} AP).`);
              return;
            }

            return settle({ styleUuid, weaponUuid, variant, manualMod, circumstanceMod, precisionLocation, apCost, applyBlinded, applyDeafened });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => settle(null)
        }
      },
      default: "ok",
      close: () => settle(null)
    }, { width: 460 });

    Hooks.once("renderDialog", (app, html) => {
      if (app !== dialog) return;
      const root = html?.[0] instanceof Element ? html[0] : null;
      const form = root?.querySelector("form.uesrpg-attack-declare");
      if (!form) return;

      const psSelect = form.querySelector('select[name="precisionLocation"]');
      const psWrap = form.querySelector('.uesrpg-precision-option .ps-location');

      const sync = () => {
        const variant = form.querySelector('input[name="attackVariant"]:checked')?.value ?? "normal";
        const on = variant === "precision";
        if (psSelect) psSelect.disabled = !on;
        if (psWrap) {
          psWrap.classList.toggle("disabled", !on);
        }
      };

      for (const r of form.querySelectorAll('input[name="attackVariant"]')) {
        r.addEventListener("change", sync);
      }
      sync();
    });

    dialog.render(true);
  });
}

function _resolveOutcomeRAW(data) {
  const a = data.attacker;
  const d = data.defender;

  const A = a.result;
  const D = d.result;
  if (!A || !D) return null;

  const defenseType = d.defenseType ?? "none";

  // RAW (Critical outcomes):
  // If both sides roll any critical (success or failure), neither attack nor defense resolves.
  const aCrit = Boolean(A.isCriticalSuccess || A.isCriticalFailure);
  const dCrit = Boolean(D.isCriticalSuccess || D.isCriticalFailure);
  if (aCrit && dCrit) {
    return { winner: "tie", text: `Both sides roll a critical — neither attack nor defense resolves.` };
  }

  // For resolution purposes, treat a single critical success as "more DoS" than the other side if they succeeded.
  // Critical failure does not auto-grant success; it may promote the opponent to an effective critical success
  // for downstream Advantage logic when the opponent passed.
  const aEff = {
    ...A,
    _effectiveCriticalSuccess: Boolean(A.isCriticalSuccess)
  };
  const dEff = {
    ...D,
    _effectiveCriticalSuccess: Boolean(D.isCriticalSuccess)
  };

  if (A.isCriticalFailure && D.isSuccess) dEff._effectiveCriticalSuccess = true;
  if (D.isCriticalFailure && A.isSuccess) aEff._effectiveCriticalSuccess = true;

  const aDoS = aEff.isSuccess ? Number(aEff.degree ?? 0) : 0;
  const dDoS = dEff.isSuccess ? Number(dEff.degree ?? 0) : 0;
  const aDoSEff = aEff._effectiveCriticalSuccess && dEff.isSuccess ? (dDoS + 1) : aDoS;
  const dDoSEff = dEff._effectiveCriticalSuccess && aEff.isSuccess ? (aDoS + 1) : dDoS;

  // Helper: both fail clause from RAW Step 3.
  const bothFail = (!A.isSuccess && !D.isSuccess);

  // No defense: attacker wins if they succeeded; otherwise nothing resolves.
  if (defenseType === "none") {
    if (A.isSuccess) return { winner: "attacker", text: `${a.name} wins — attack hits.` };
    return { winner: "tie", text: `Both fail — neither resolves.` };
  }

  // Attack vs Block: successful block wins regardless of attacker DoS.
  if (defenseType === "block") {
    // Critical success: treat as higher DoS than the other side if they also succeeded.
    if (A.isSuccess && D.isSuccess) {
      if (aEff._effectiveCriticalSuccess && !dEff._effectiveCriticalSuccess) return { winner: "attacker", text: `${a.name} wins — critical success overwhelms the block.` };
      if (dEff._effectiveCriticalSuccess && !aEff._effectiveCriticalSuccess) return { winner: "defender", text: `${d.name} wins — critical block holds.` };
      // No critical edge: block wins (RAW).
      return { winner: "defender", text: `${d.name} wins — blocks the attack.` };
    }
    if (D.isSuccess) return { winner: "defender", text: `${d.name} wins — blocks the attack.` };
    // Defender failed block
    if (A.isSuccess) return { winner: "attacker", text: `${a.name} wins — attack hits.` };
    return { winner: "tie", text: `Both fail — neither resolves.` };
  }

  // Counter-Attack special RAW:
  // - Both fail: neither resolves.
  // - Higher DoS hits the other.
  // - Equal DoS: neither resolves.
  if (defenseType === "counter") {
    if (bothFail) return { winner: "tie", text: `Both fail — neither resolves.` };
    if (A.isSuccess && !D.isSuccess) return { winner: "attacker", text: `${a.name} wins — counter fails; attack hits.` };
    if (D.isSuccess && !A.isSuccess) return { winner: "defender", text: `${d.name} wins — counter-attack hits ${a.name}.` };
    // both succeed
    if (aDoSEff > dDoSEff) return { winner: "attacker", text: `${a.name} hits ${d.name} (Counter-Attack).` };
    if (dDoSEff > aDoSEff) return { winner: "defender", text: `${d.name} hits ${a.name} (Counter-Attack).` };
    return { winner: "tie", text: `Tie — neither attack resolves.` };
  }

  // Parry/Evade generic rules:
  // - Both fail: neither resolves.
  // - One fails: the other wins.
  // - Both succeed: higher DoS wins; tie => defense holds (no one gains advantage here).
  if (bothFail) return { winner: "tie", text: `Both fail — neither resolves.` };
  if (A.isSuccess && !D.isSuccess) return { winner: "attacker", text: `${a.name} wins — attack hits.` };
  if (D.isSuccess && !A.isSuccess) return { winner: "defender", text: `${d.name} wins — defends successfully.` };

  // both succeed
  if (aDoSEff > dDoSEff) return { winner: "attacker", text: `Both succeed — attacker has more DoS; resolve the attack.` };
  if (dDoSEff > aDoSEff) return { winner: "defender", text: `Both succeed — defense holds; attack is negated.` };
  return { winner: "defender", text: `Both succeed — no advantage; defense holds.` };
}

function _computeAdvantageRAW(data, outcome) {
  // RAW: advantage is only gained in melee when:
  //  - exactly one character fails (winner gains 1 advantage)
  //  - a critical success occurs (winner gains 1 advantage)
  //  - critical success vs fail OR success vs critical fail (winner gains 2 advantages)
  // No advantage is gained when both pass (even if attacker wins on higher DoS).
  const A = data?.attacker?.result;
  const D = data?.defender?.result;
  if (!A || !D || !outcome) return { attacker: 0, defender: 0 };

  // If neither side resolves, no advantage.
  if (outcome.winner !== "attacker" && outcome.winner !== "defender") {
    return { attacker: 0, defender: 0 };
  }

  const winnerKey = outcome.winner;
  const loserKey = winnerKey === "attacker" ? "defender" : "attacker";
  const W = winnerKey === "attacker" ? A : D;
  const L = loserKey === "attacker" ? A : D;

  // Attack vs Block special: block can win even when both succeed.
  // RAW Step 3 states successful block resolves as if defender won; advantage is only gained when
  // the other character fails OR via critical success rules.

  let adv = 0;

  // RAW (Critical outcomes): if both sides rolled any critical, no advantage.
  const wCrit = Boolean(W.isCriticalSuccess || W.isCriticalFailure);
  const lCrit = Boolean(L.isCriticalSuccess || L.isCriticalFailure);
  if (wCrit && lCrit) {
    adv = 0;
  } else if ((W.isCriticalSuccess && !L.isSuccess) || (W.isSuccess && L.isCriticalFailure)) {
    // Critical success vs failure OR success vs critical fail: winner gains 2 Advantage.
    adv = 2;
  } else if (W.isCriticalSuccess && L.isSuccess) {
    // Critical success vs success: winner gains 1 Advantage.
    adv = 1;
  } else if (W.isSuccess && !L.isSuccess) {
    // Success vs failure: winner gains 1 Advantage.
    adv = 1;
  } else {
    adv = 0;
  }

  // RAW: Ranged attackers and spells cannot gain or utilize Advantage.
  // Defender Advantage is still permitted (e.g., against ranged attacks).
  const attackMode = getContextAttackMode(data?.context);
  if (winnerKey === "attacker" && attackMode !== "melee") adv = 0;

  return winnerKey === "attacker"
    ? { attacker: adv, defender: 0 }
    : { attacker: 0, defender: adv };
}


function _combatClock() {
  const c = game.combat;
  if (c && Number.isFinite(c.round) && Number.isFinite(c.turn)) {
    return { inCombat: true, round: c.round, turn: c.turn };
  }
  return { inCombat: false, round: null, turn: null };
}

async function _createTemporaryEffect(actor, effectData) {
  if (!actor || !effectData) return null;
  try {
    // Permission-safe: proxy through active GM (preferred) or a single active OWNER of the target Actor.
    return await requestCreateActiveEffect(actor, effectData);
  } catch (err) {
    console.error("UESRPG | Failed to create temporary Active Effect.", { actor: actor?.uuid, effectData, err });
    return null;
  }
}

function _advantageDurationData(rounds = 1) {
  const clock = _combatClock();
  if (clock.inCombat) {
    return { rounds, startRound: clock.round, startTurn: clock.turn };
  }
  // Fallback: 6-second rounds (best-effort). Duration enforcement is still handled by Foundry.
  return { seconds: Math.max(1, rounds) * 6, startTime: game.time?.worldTime ?? 0 };
}

// --- Aim (Chapter 5 Action) helpers ----------------------------------------

function _findEnabledEffectByUesrpgKey(actor, key) {
  if (!actor || !key) return null;
  return actor.effects?.find?.((e) => !e.disabled && e?.flags?.uesrpg?.key === key) ?? null;
}

async function _deleteActorEffectSafe(actor, effect) {
  if (!actor || !effect) return;
  try {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  } catch (err) {
    console.warn("UESRPG | opposed-workflow | failed to delete effect", { actor: actor?.uuid, effectId: effect?.id, err });
  }
}

function _getAimStateFromEffect(effect) {
  if (!effect) return { stacks: 0, itemUuid: null };

  // Preferred: flags.uesrpg.aim
  const fa = effect?.flags?.uesrpg?.aim;
  const stacks = Number(fa?.stacks ?? 0) || 0;
  const itemUuid = String(fa?.itemUuid ?? effect?.flags?.uesrpg?.conditions?.itemUuid ?? "").trim() || null;

  // Fallback: infer from change value (+10/+20/+30)
  if (!stacks) {
    try {
      const c = (effect.changes ?? []).find((ch) => ch?.key === "system.modifiers.combat.attackTN");
      const v = Number(c?.value ?? 0) || 0;
      const inferredStacks = Math.max(0, Math.min(3, Math.round(v / 10)));
      return { stacks: inferredStacks, itemUuid };
    } catch (_e) {
      // no-op
    }
  }

  return { stacks: Math.max(0, Math.min(3, stacks)), itemUuid };
}

/**
 * RAW: Aim chain is broken if the character takes any action or reaction other
 * than continuing to Aim or firing the aimed weapon/spell.
 */
async function _breakAimChainIfPresent(actor) {
  const ef = _findEnabledEffectByUesrpgKey(actor, "aim");
  if (!ef) return;
  await _deleteActorEffectSafe(actor, ef);
}

/**
 * Consume Aim after an attack action resolves.
 * - If the attack is a ranged attack with the aimed item: consume (delete) Aim.
 * - If the actor made any other attack: chain is broken (delete) Aim.
 */
async function _consumeOrBreakAimAfterAttack(actor, { attackMode, itemUuid } = {}) {
  const ef = _findEnabledEffectByUesrpgKey(actor, "aim");
  if (!ef) return;

  const state = _getAimStateFromEffect(ef);
  const aimedItemUuid = String(state.itemUuid ?? "").trim();
  const actualMode = String(attackMode ?? "").toLowerCase();
  const actualItemUuid = String(itemUuid ?? "").trim();

  // Any non-ranged attack breaks the chain.
  if (actualMode !== "ranged") {
    await _deleteActorEffectSafe(actor, ef);
    return;
  }

  // If we cannot determine either UUID, we conservatively keep Aim.
  if (!aimedItemUuid || !actualItemUuid) return;

  // Different weapon/spell breaks the chain.
  if (actualItemUuid !== aimedItemUuid) {
    await _deleteActorEffectSafe(actor, ef);
    return;
  }

  // Aimed item was fired: consume Aim.
  await _deleteActorEffectSafe(actor, ef);
}


async function _applyPressAdvantageEffect(attacker, defender, { attackerTokenUuid = null, defenderTokenUuid = null } = {}) {
  if (!attacker) return null;
  const opponentUuid = defender?.uuid ?? null;
  const duration = _advantageDurationData(1);

  const effectData = {
    name: "Press Advantage",
    img: "icons/svg/upgrade.svg",
    origin: attacker.uuid,
    disabled: false,
    duration,
    changes: [
      {
        key: "system.modifiers.combat.opposed.attackTN",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 10,
        priority: 20
      }
    ],
    flags: {
  uesrpg: {
    category: "advantage",
    key: "pressAdvantage",
    source: {
      actorUuid: attacker?.uuid ?? null,
      tokenUuid: attackerTokenUuid ?? null
    },
    target: {
      actorUuid: defender?.uuid ?? opponentUuid ?? null,
      tokenUuid: defenderTokenUuid ?? null
    },
    // Opponent-scoped: only applies against this opponent and only for melee attacks
    conditions: {
      ...(opponentUuid ? { opponentUuid } : {}),
      attackMode: "melee"
    }
  }
}};

  return await _createTemporaryEffect(attacker, effectData);
}

async function _applyOverextendEffect(opponent, { defenderUuid = null, defenderTokenUuid = null, opponentTokenUuid = null } = {}) {
  if (!opponent) return null;
  const duration = _advantageDurationData(1);

  const effectData = {
    name: "Overextended",
    img: "icons/svg/downgrade.svg",
    origin: opponent.uuid,
    disabled: false,
    duration,
    changes: [
      {
        key: "system.modifiers.combat.opposed.attackTN",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: -10,
        priority: 20
      }
    ],
    flags: {
  uesrpg: {
    category: "advantage",
    key: "overextend",
    source: {
      actorUuid: defenderUuid ?? null,
      tokenUuid: defenderTokenUuid ?? null
    },
    target: {
      actorUuid: opponent?.uuid ?? null,
      tokenUuid: opponentTokenUuid ?? null
    },
    // Opponent-scoped: affects the target's next attack test (any attack type) against this defender.
    // RAW: "The opponent’s next attack test within 1 round is made at a -10 penalty."
    conditions: {
      ...(defenderUuid ? { opponentUuid: defenderUuid } : {})
    }
  }
}};

  return await _createTemporaryEffect(opponent, effectData);
}

async function _applyOverwhelmEffect(opponent, { defenderUuid = null } = {}) {
  if (!opponent) return null;
  const duration = _advantageDurationData(1);

  // Marker effect: AoO suppression is enforced elsewhere (action pipeline milestone).
  const effectData = {
    name: "Overwhelmed",
    img: "icons/svg/daze.svg",
    origin: opponent.uuid,
    disabled: false,
    duration,
    changes: [
      {
        key: "flags.uesrpg.combat.noAoO",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: true,
        priority: 20
      }
    ],
    flags: {
      uesrpg: {
        category: "advantage",
        key: "overwhelm",
        meta: defenderUuid ? { defenderUuid } : {}
      }
    }
  };

  return await _createTemporaryEffect(opponent, effectData);
}

async function _consumeOneShotAdvantageEffects(actor, { opponentUuid = null, attackMode = "melee" } = {}) {
  // RAW:
  // - Press Advantage: next MELEE attack test against the specified opponent within 1 round.
  // - Overextend: opponent's next attack test within 1 round at -10 (NOT target-scoped).
  // Therefore, opponentUuid is only required to consume Press Advantage, not Overextend.
  if (!actor) return;
  try {
    const aMode = getContextAttackMode({ attackMode });
    const toDelete = [];

    for (const ef of (actor.effects ?? [])) {
      if (!ef || ef.disabled) continue;
      const f = ef.flags?.uesrpg;
      if (!f || f.category !== "advantage") continue;
      const key = String(f.key ?? "");
      if (key !== "pressAdvantage" && key !== "overextend") continue;

      const cond = f.conditions ?? {};
      // Press Advantage is opponent-scoped; Overextend is not.
      if (key === "pressAdvantage") {
        if (!opponentUuid) continue;
        if (cond.opponentUuid && String(cond.opponentUuid) !== String(opponentUuid)) continue;
      }

      // Press Advantage is melee-only; Overextend applies to the next attack test of any type.
      if (key === "pressAdvantage") {
        const condMode = getContextAttackMode({ attackMode: cond.attackMode ?? cond.attackType ?? "melee" });
        if (condMode !== "melee") continue;
        if (aMode !== "melee") continue;
      }

      toDelete.push(ef.id);
    }

    if (!toDelete.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  } catch (err) {
    console.error("UESRPG | Failed to consume one-shot Advantage effects.", { actorUuid: actor?.uuid, opponentUuid, err });
  }
}


async function _consumeHiddenAfterAttack(actor) {
  try {
    if (!actor) return;
    if (!hasCondition(actor, "hidden")) return;

    const effects = actor.effects?.contents ?? [];
    const toDelete = [];

    for (const ef of effects) {
      if (!ef?.id) continue;
      const k = String(ef.getFlag?.("uesrpg-3ev4", "condition")?.key ?? ef.flags?.["uesrpg-3ev4"]?.condition?.key ?? "").trim().toLowerCase();
      const coreId = String(ef.getFlag?.("core", "statusId") ?? ef.flags?.core?.statusId ?? "").trim().toLowerCase();
      const hasStatus = typeof ef.statuses?.has === "function" ? ef.statuses.has("hidden") : false;

      if (k === "hidden" || coreId === "hidden" || hasStatus) {
        toDelete.push(ef.id);
      }
    }

    if (!toDelete.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  } catch (err) {
    console.warn("UESRPG | opposed-workflow | failed to consume Hidden after attack", err);
  }
}

async function _promptDefenderAdvantage({ defenderActor, attackerActor, advantageCount = 0 } = {}) {
  if (!defenderActor || advantageCount <= 0) return null;

  const max = Number(advantageCount || 0);

  // Known Special Actions are derived ONLY from the actor's active combat style.
  // Defender advantage usage is reaction context: only Secondary actions are offered.
  const knownSecondary = (() => {
    try {
      const all = buildSpecialActionsForActor(defenderActor);
      return all.filter(a => a.known && String(a.actionType).toLowerCase() === "secondary");
    } catch (_e) {
      return [];
    }
  })();

  const renderSpecialOpt = (sa) => {
    const id = String(sa?.id ?? "").trim();
    if (!id) return "";
    const label = String(sa?.name ?? id);
    return `
      <label class="uesrpg-adv-choice">
        <input type="checkbox" name="sa_${id}" />
        <span class="uesrpg-adv-choice__label">
          <span class="uesrpg-adv-choice__title">${label}</span>
        </span>
        <span class="uesrpg-adv-chip uesrpg-adv-chip--secondary">Secondary</span>
      </label>
    `;
  };

  const content = `
    <form class="uesrpg-adv-dialog uesrpg-adv-dialog--defender">
      <div class="uesrpg-adv-summary">
        <div><b>Advantage</b>: ${max} available</div>
        <div class="uesrpg-adv-count" aria-live="polite"></div>
      </div>

      <div class="uesrpg-adv-grid">
        <label class="uesrpg-adv-choice">
          <input type="checkbox" name="overextend" />
          <span class="uesrpg-adv-choice__label">
            <span class="uesrpg-adv-choice__title">Overextend</span>
            <span class="uesrpg-adv-choice__desc">Opponent’s next attack within 1 round suffers -10.</span>
          </span>
        </label>

        <label class="uesrpg-adv-choice">
          <input type="checkbox" name="overwhelm" />
          <span class="uesrpg-adv-choice__label">
            <span class="uesrpg-adv-choice__title">Overwhelm</span>
            <span class="uesrpg-adv-choice__desc">Opponent cannot make Attacks of Opportunity until your next turn.</span>
          </span>
        </label>

        ${knownSecondary.length ? `
          <div class="uesrpg-adv-section">
            <div class="uesrpg-adv-section__title"><b>Known Special Actions</b></div>
          </div>
          ${knownSecondary.map(renderSpecialOpt).join("\n")}
        ` : ``}
      </div>

      <p class="hint">Select up to ${max} option(s).</p>
    </form>
  `;

  return await new Promise((resolve) => {
    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    const dialog = new Dialog({
      title: "Use Defender Advantage",
      content,
      buttons: {
        apply: {
          label: "Apply",
          callback: (html) => {
            const root = (html && "0" in html && html[0] instanceof Element) ? html[0] : (html instanceof Element ? html : null);
            const form = root?.querySelector("form.uesrpg-adv-dialog--defender");
            if (!form) return settle(null);

            const q = (name) => form.querySelector(`[name="${name}"]`);
            const overextend = Boolean(q("overextend")?.checked);
            const overwhelm = Boolean(q("overwhelm")?.checked);

            const selectedSpecial = [];
            for (const sa of knownSecondary) {
              const id = String(sa?.id ?? "").trim();
              if (!id) continue;
              if (Boolean(q(`sa_${id}`)?.checked)) selectedSpecial.push(id);
            }

            const selectedCount = [overextend, overwhelm].filter(Boolean).length + selectedSpecial.length;
            if (selectedCount > max) {
              ui.notifications.warn(`You only have ${max} Advantage to spend.`);
              return false;
            }

            return settle({ overextend, overwhelm, specialActionsSelected: selectedSpecial });
          }
        },
        skip: { label: "Skip", callback: () => settle({ overextend: false, overwhelm: false, specialActionsSelected: [] }) }
      },
      default: "apply",
      close: () => settle(null)
    });

    Hooks.once("renderDialog", (app, html) => {
      if (app !== dialog) return;
      const root = html?.[0] instanceof Element ? html[0] : null;
      const form = root?.querySelector("form.uesrpg-adv-dialog--defender");
      if (!form) return;

      const listAllCheckboxes = () => [...form.querySelectorAll('input[type="checkbox"]')];
      const computeSelectedCount = () => listAllCheckboxes().filter(el => Boolean(el.checked)).length;

      const updateUi = () => {
        const count = computeSelectedCount();
        const c = form.querySelector(".uesrpg-adv-count");
        if (c) c.textContent = `${count} / ${max} selected`;

        for (const el of listAllCheckboxes()) {
          if (Boolean(el.checked)) {
            el.disabled = false;
            continue;
          }
          el.disabled = (count >= max);
        }
      };

      for (const el of listAllCheckboxes()) {
        el.addEventListener("change", (ev) => {
          const count = computeSelectedCount();
          if (count > max) {
            ev.currentTarget.checked = false;
            ui.notifications.warn(`You only have ${max} Advantage to spend.`);
          }
          updateUi();
        });
      }

      updateUi();
    });

    dialog.render(true);
  });
}

async function _maybeResolveDefenderAdvantage(message, data) {
  try {
    const adv = Number(data?.advantage?.defender ?? 0);
    if (!Number.isFinite(adv) || adv <= 0) return;

    data.advantageSpent = data.advantageSpent ?? {};
    if (data.advantageSpent.defender === true) return;

    // RAW focus: defender advantage options are melee-centric.
    const attackMode = getContextAttackMode(data?.context);
    if (attackMode !== "melee") return;

    const defender = _resolveDoc(data?.defender?.actorUuid);
    const attacker = _resolveDoc(data?.attacker?.actorUuid);
    if (!defender || !attacker) return;

    if (!_canControlActor(defender) && !game.user.isGM) return;

    const choice = await _promptDefenderAdvantage({
      defenderActor: defender,
      attackerActor: attacker,
      advantageCount: adv
    });

    data.advantageSpent.defender = true;
    data.advantageResolution = data.advantageResolution ?? {};
    data.advantageResolution.defender = choice ?? { overextend: false, overwhelm: false };

    await _updateCard(message, data);

    if (!choice) return;

    if (choice.overextend) await _applyOverextendEffect(attacker, { defenderUuid: defender.uuid, defenderTokenUuid: data.defender?.tokenUuid ?? null, opponentTokenUuid: data.attacker?.tokenUuid ?? null });
    if (choice.overwhelm) await _applyOverwhelmEffect(attacker, { defenderUuid: defender.uuid });
  } catch (err) {
    console.error("UESRPG | Defender Advantage resolution failed.", { messageId: message?.id, err });
  }
}

function _listEquippedWeapons(actor) {
  if (!actor?.items) return [];
  return actor.items.filter(i => i.type === "weapon" && i.system?.equipped === true);
}

function _listEquippedShields(actor) {
  if (!actor?.items) return [];
  // Shields are modeled as Armor items with the "Is Shield" toggle enabled.
  // Do not infer shield-ness from blockRating, since BR is now derived (effective) and may not be persisted.
  return actor.items.filter(i => {
    if (!(i.type === "armor" || i.type === "item")) return false;
    if (i.system?.equipped !== true) return false;
    if (!Boolean(i.system?.isShieldEffective ?? i.system?.isShield)) return false;

    // RAW: bucklers cannot be used to Block.
    const shieldType = String(i.system?.shieldType || "normal").toLowerCase();
    if (shieldType === "buckler") return false;

    return true;
  });
}

// Block Rating resolver is centralized in module/combat/mitigation.js

async function _promptWeaponAndAdvantages({ attackerActor, advantageCount = 0, attackMode = "melee", defaultWeaponUuid = null, defaultHitLocation = "Body" }) {
  const weapons = _listEquippedWeapons(attackerActor);
  if (!weapons.length) {
    ui.notifications.warn("No equipped weapons found.");
    return null;
  }

  const max = Number(advantageCount || 0);
  const defaultWeapon = weapons.find(w => w.uuid === defaultWeaponUuid) ?? weapons[0];

  const allowedLocs = ["Head", "Body", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const safeDefaultLoc = allowedLocs.includes(defaultHitLocation) ? defaultHitLocation : "Body";

  const locOptions = allowedLocs
    .map(l => `<option value="${l}" ${l === safeDefaultLoc ? "selected" : ""}>${l}</option>`)
    .join("\n");

  const hasPressAdvantage = (getContextAttackMode({ attackMode }) === "melee");

  // Known Special Actions are derived ONLY from the actor's active combat style.
  // For attacker spend: Primary must be usable now; Secondary is always usable.
  const knownSpecial = (() => {
    try {
      const all = buildSpecialActionsForActor(attackerActor);
      return all.filter(a => a.known && isSpecialActionUsableNow(attackerActor, a.actionType));
    } catch (_e) {
      return [];
    }
  })();

  const renderSpecialOpt = (sa) => {
    const id = String(sa?.id ?? "").trim();
    if (!id) return "";
    const label = String(sa?.name ?? id);
    const typ = String(sa?.actionType ?? "").toLowerCase();
    const chipClass = typ === "primary" ? "uesrpg-adv-chip--primary" : "uesrpg-adv-chip--secondary";
    const chipLabel = typ === "primary" ? "Primary" : "Secondary";
    return `
      <label class="uesrpg-adv-choice">
        <input type="checkbox" name="sa_${id}" />
        <span class="uesrpg-adv-choice__label">
          <span class="uesrpg-adv-choice__title">${label}</span>
        </span>
        <span class="uesrpg-adv-chip ${chipClass}">${chipLabel}</span>
      </label>
    `;
  };

  const weaponOptions = weapons
    .map(w => `<option value="${w.uuid}" ${w.uuid === defaultWeapon.uuid ? "selected" : ""}>${w.name}</option>`)
    .join("\n");

  const content = `
    <form class="uesrpg-opp-dmg uesrpg-adv-dialog uesrpg-adv-dialog--attacker">
      <div class="form-group uesrpg-adv-weapon">
        <label><b>Weapon</b></label>
        <select name="weaponUuid">${weaponOptions}</select>
      </div>

      ${max > 0 ? `
        <hr style="margin:0.5rem 0;" />
        <div class="uesrpg-adv-summary">
          <b>Advantage</b>: ${max} available
          <div class="uesrpg-adv-count" aria-live="polite"></div>
        </div>

        <input type="hidden" name="defaultHitLocation" value="${safeDefaultLoc}" />

        <div class="uesrpg-adv-grid">
          <div class="uesrpg-adv-block">
            <label class="uesrpg-adv-choice">
              <input type="checkbox" name="precisionStrike" />
              <span class="uesrpg-adv-choice__label">
                <span class="uesrpg-adv-choice__title">Precision Strike</span>
                <span class="uesrpg-adv-choice__desc">Choose a hit location.</span>
              </span>
            </label>
            <div class="uesrpg-adv-inline">
              <select name="precisionLocation" disabled>${locOptions}</select>
            </div>
          </div>

          <label class="uesrpg-adv-choice">
            <input type="checkbox" name="penetrateArmor" />
            <span class="uesrpg-adv-choice__label">
              <span class="uesrpg-adv-choice__title">Penetrate Armor</span>
            </span>
          </label>

          <label class="uesrpg-adv-choice">
            <input type="checkbox" name="forcefulImpact" />
            <span class="uesrpg-adv-choice__label">
              <span class="uesrpg-adv-choice__title">Forceful Impact</span>
            </span>
          </label>

          ${hasPressAdvantage ? `
          <label class="uesrpg-adv-choice">
            <input type="checkbox" name="pressAdvantage" />
            <span class="uesrpg-adv-choice__label">
              <span class="uesrpg-adv-choice__title">Press Advantage</span>
            </span>
          </label>
          ` : ``}

          ${knownSpecial.length ? `
            <div class="uesrpg-adv-section">
              <div class="uesrpg-adv-section__title"><b>Known Special Actions</b></div>
            </div>
            ${knownSpecial.map(renderSpecialOpt).join("\n")}
          ` : ``}
        </div>

        <p class="hint">Select up to ${max} option(s).</p>
      ` : ``}
    </form>
  `;

  return await new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dialog = new Dialog({
      title: "Resolve Damage",
      content,
      buttons: {
        continue: {
          label: "Continue",
          callback: (html) => {
            const root = (html && "0" in html && html[0] instanceof Element) ? html[0] : (html instanceof Element ? html : null);
            const form = root?.querySelector("form.uesrpg-opp-dmg");
            if (!form) return settle(null);

            const q = (name) => form.querySelector(`[name="${name}"]`);
            const weaponUuid = String(q("weaponUuid")?.value ?? "");

            const precisionStrike = Boolean(q("precisionStrike")?.checked);
            const defaultLoc = String(q("defaultHitLocation")?.value ?? "Body");
            const precisionLocation = precisionStrike
              ? String(q("precisionLocation")?.value ?? defaultLoc)
              : defaultLoc;

            const penetrateArmor = Boolean(q("penetrateArmor")?.checked);
            const forcefulImpact = Boolean(q("forcefulImpact")?.checked);
            const pressAdvantage = Boolean(q("pressAdvantage")?.checked);

            const selectedSpecial = [];
            for (const sa of knownSpecial) {
              const id = String(sa?.id ?? "").trim();
              if (!id) continue;
              if (Boolean(q(`sa_${id}`)?.checked)) selectedSpecial.push(id);
            }

            const selectedCount = [precisionStrike, penetrateArmor, forcefulImpact, pressAdvantage].filter(Boolean).length + selectedSpecial.length;
            if (max > 0 && selectedCount > max) {
              ui.notifications.warn(`You only have ${max} Advantage to spend.`);
              return false;
            }

            return settle({
              weaponUuid,
              precisionStrike,
              precisionLocation,
              penetrateArmor,
              forcefulImpact,
              pressAdvantage,
              specialActionsSelected: selectedSpecial
            });
          }
        },
        cancel: { label: "Cancel", callback: () => settle(null) }
      },
      default: "continue",
      close: () => settle(null)
    });

    Hooks.once("renderDialog", (app, html) => {
      if (app !== dialog) return;
      const root = html?.[0] instanceof Element ? html[0] : null;
      const form = root?.querySelector("form.uesrpg-opp-dmg");
      if (!form) return;

      const precisionSelect = form.querySelector('select[name="precisionLocation"]');
      const defaultLoc = String(form.querySelector('input[name="defaultHitLocation"]')?.value ?? "Body");

      const listAllCheckboxes = () => [...form.querySelectorAll('input[type="checkbox"]')];
      const computeSelectedCount = () => listAllCheckboxes().filter(el => Boolean(el.checked)).length;

      const updateUi = () => {
        if (precisionSelect) {
          const ps = form.querySelector('input[type="checkbox"][name="precisionStrike"]');
          const psOn = Boolean(ps?.checked);
          precisionSelect.disabled = !psOn;
          if (!psOn) precisionSelect.value = defaultLoc;
        }

        const count = computeSelectedCount();
        const c = form.querySelector(".uesrpg-adv-count");
        if (c) c.textContent = `${count} / ${max} selected`;

        for (const el of listAllCheckboxes()) {
          if (Boolean(el.checked)) {
            el.disabled = false;
            continue;
          }
          el.disabled = (count >= max);
        }
      };

      for (const el of listAllCheckboxes()) {
        el.addEventListener("change", (ev) => {
          const count = computeSelectedCount();
          if (count > max) {
            ev.currentTarget.checked = false;
            ui.notifications.warn(`You only have ${max} Advantage to spend.`);
          }
          updateUi();
        });
      }

      updateUi();
    });

    dialog.render(true);
  });
}
/**
 * Prompt the defender to utilize their Advantage after a successful defense.
 *
 * RAW (Chapter 5, Attacking & Defending, Step 3):
 * "Defender wins: The defense is successful, the defender chooses how to utilize their advantage and resolves it."
 *
 * Pre–Active Effects scope: we provide a pipeline to select/record an advantage utilization choice,
 * and post a chat audit message. Most mechanical outcomes will be implemented later via Active Effects.
 */


// NOTE: Duplicate _promptDefenderAdvantage removed (boot-time SyntaxError fix)



async function _rollWeaponDamage({ weapon, preConsumedAmmo = null }) {
  const addFlatBonus = (expr, bonus) => {
    const b = Number(bonus || 0);
    if (!Number.isFinite(b) || b === 0) return String(expr ?? "0");
    const e = String(expr ?? "0").trim();
    // Keep the expression readable; do not attempt to parse dice groups.
    return b > 0 ? `${e}+${b}` : `${e}${b}`;
  };

  let damageString =
    (weapon.system.damage3Effective ?? weapon.system.damage3 ?? weapon.system.damage2Effective ?? weapon.system.damage2 ?? weapon.system.damageEffective ?? weapon.system.damage) || "0";

  /** @type {{ammoUuid:string, qtyAfter:number, ammoName:string}|null} */
  let pendingAmmo = null;

  // Ranged: add ammunition contribution (damage bonus) from the selected ammunition item.
  // Ammunition quantity is consumed at ATTACK TIME (before the attack roll), not here.
  // This function only reads ammo data for damage expression enrichment and gates legacy/stale cards defensively.
  if (String(weapon.system?.attackMode ?? "melee") === "ranged" && weapon.actor) {
    // Do not involve ammunition for thrown attacks.
    const injected = Array.isArray(weapon.system?.qualitiesStructuredInjected)
      ? weapon.system.qualitiesStructuredInjected
      : Array.isArray(weapon.system?.qualitiesStructured)
        ? weapon.system.qualitiesStructured
        : [];
    const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
    const hasThrown = injected.some(q => String(q?.key ?? q ?? "").toLowerCase() === "thrown")
      || traits.some(t => String(t ?? "").toLowerCase() === "thrown")
      || (String(weapon.system?.rangeBandsDerivedEffective?.kind ?? weapon.system?.rangeBandsDerived?.kind ?? "") === "thrown");
    if (hasThrown) {
      // Leave pendingAmmo null and do not gate on ammo.
    } else {
    const shouldConsume = weapon.system?.consumeAmmo !== false;
    const ammoId = String(weapon.system?.ammoId ?? "").trim();


    const preConsumedMatches = !!(preConsumedAmmo
      && preConsumedAmmo.weaponUuid
      && preConsumedAmmo.ammoId
      && preConsumedAmmo.weaponUuid === weapon.uuid
      && preConsumedAmmo.ammoId === ammoId);

    // If the weapon is configured to consume ammo, enforce that ammo exists.
    // Quantity can be 0 here if the last shot was consumed at attack time.
    if (shouldConsume) {
      if (!ammoId) {
        ui.notifications.warn(`${weapon.name}: no ammunition selected.`);
        return null;
      }
      const ammo = weapon.actor.items.get(ammoId);
      if (!ammo || ammo.type !== "ammunition") {
        ui.notifications.warn(`${weapon.name}: selected ammunition could not be resolved.`);
        return null;
      }
      const qty = Number(ammo.system?.quantity ?? 0);
      // Defensive gating for legacy/stale cards: if we did not see a pre-consumption record, require qty > 0.
      // In the normal opposed flow, ammo is always pre-consumed at attack time.
      if (!preConsumedMatches && !(qty > 0)) {
        ui.notifications.warn(`${ammo.name}: no ammunition remaining.`);
        return null;
      }

      const ammoExpr = normalizeDiceExpression(ammo.system?.damageEffective ?? ammo.system?.damage ?? "0");
      let ammoBonus = 0;
      try {
        const r = await safeEvaluateRoll(ammoExpr);
        ammoBonus = Number(r.total) || 0;
      } catch (err) {
        console.warn("UESRPG | Failed to evaluate ammunition damage expression", { ammoId, ammoExpr, err });
      }
      damageString = addFlatBonus(damageString, ammoBonus);

      // Ammo is already consumed earlier; do not schedule consumption here.
      pendingAmmo = null;
    } else if (ammoId) {
      // Ammo is configured but consumption is disabled; treat ammo as optional damage modifier.
      const ammo = weapon.actor.items.get(ammoId);
      if (ammo?.type === "ammunition") {
        const ammoExpr = normalizeDiceExpression(ammo.system?.damageEffective ?? ammo.system?.damage ?? "0");
        let ammoBonus = 0;
        try {
          const r = await safeEvaluateRoll(ammoExpr);
          ammoBonus = Number(r.total) || 0;
        } catch (err) {
          console.warn("UESRPG | Failed to evaluate ammunition damage expression", { ammoId, ammoExpr, err });
        }
        damageString = addFlatBonus(damageString, ammoBonus);
      }
    }
    }
  }

  const structured = Array.isArray(weapon.system.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];
  const hasQ = (key) => structured.some(q => String(q?.key ?? q ?? "").toLowerCase() === key);

  const wantsProven = hasQ("proven");
  const wantsPrimitive = hasQ("primitive");
  const wantsSuperior = !!weapon.system.superior;

  // Damaged (X): reduces weapon damage. Apply as a flat modifier to the damage expression.
  const damagedValue = (() => {
    const q = structured.find(e => String(e?.key ?? e ?? "").toLowerCase() === "damaged");
    const v = Number(q?.value ?? 0);
    return Number.isFinite(v) ? v : 0;
  })();
  if (damagedValue > 0) {
    damageString = addFlatBonus(damageString, -damagedValue);
  }

  const a = await safeEvaluateRoll(damageString);
  damageString = a.formula;
  let b = null;
  let total = Number(a.total);

  let rerollMode = null;
  if (wantsSuperior || wantsProven || wantsPrimitive) {
    b = await safeEvaluateRoll(damageString);
    const alt = Number(b.total);
    if (wantsPrimitive && !wantsProven) {
      total = Math.min(total, alt);
      rerollMode = "primitive";
    } else {
      total = Math.max(total, alt);
      rerollMode = (wantsSuperior || wantsProven) ? "proven" : null;
    }
  }

  return { damageString, rollA: a, rollB: b, finalDamage: total, pendingAmmo, rerollMode, damagedValue };
}

async function _consumePendingAmmo(pendingAmmo) {
  if (!pendingAmmo) return true;

  const { ammoUuid, actorUuid, ammoId, qtyAfter, ammoName } = pendingAmmo;

  // Prefer consuming by updating the embedded Item on the parent Actor.
  // This is more reliable than updating the embedded Item directly by UUID in cases where
  // the workflow involves a synthetic (unlinked) token Actor or other UUID resolution edge cases.
  const _resolveActor = async (uuid) => {
    if (!uuid) return null;
    const doc = await fromUuid(uuid);
    if (!doc) return null;

    // Actor document
    if (doc.documentName === "Actor") return doc;

    // TokenDocument (synthetic Actor lives here)
    if (doc.documentName === "Token" && doc.actor) return doc.actor;

    // TokenDocument in some contexts may resolve as a Scene or other parent; fall through
    return doc.actor ?? null;
  };

  try {
    // Attempt 1: consume via Actor + embedded Item id
    if (actorUuid && ammoId) {
      const actor = await _resolveActor(actorUuid);
      const ammo = actor?.items?.get?.(ammoId) ?? null;

      if (ammo && ammo.type === "ammunition") {
        const qty = Number(ammo.system?.quantity ?? 0);
        const next = Math.min(qty, Math.max(0, Number(qtyAfter ?? 0)));
        if (next !== qty) {
          await actor.updateEmbeddedDocuments("Item", [{ _id: ammoId, "system.quantity": next }]);
        }
        return true;
      }
    }

    // Attempt 2: consume by resolving the embedded Item UUID directly
    if (ammoUuid) {
      const doc = await fromUuid(ammoUuid);
      if (!doc) {
        ui.notifications.warn(`${ammoName || "Ammunition"}: could not be resolved for consumption.`);
        return false;
      }
      const qty = Number(doc.system?.quantity ?? 0);
      const next = Math.min(qty, Math.max(0, Number(qtyAfter ?? 0)));
      if (next !== qty) await doc.update({ "system.quantity": next });
      return true;
    }

    ui.notifications.warn(`${ammoName || "Ammunition"}: could not be resolved for consumption.`);
    return false;
  } catch (err) {
    console.error("UESRPG | Failed to consume ammo", { pendingAmmo, err });
    ui.notifications.error(`${ammoName || "Ammunition"}: failed to consume. See console for details.`);
    return false;
  }
}

/**
 * Post a weapon damage chat card.
 *
 * This mirrors the standard "Roll Damage" output so that block-resolution flows
 * still provide a clear record of hit location and rolled damage.
 *
 * Non-invasive: chat-only; does not mutate documents.
 */
async function _postWeaponDamageChatCard({
  attacker,
  aToken,
  weapon,
  dmg,
  hitLocation,
  applyButtonHtml = "",
  extraNoteHtml = "",
  parentMessageId = null,
  stage = "damage",
} = {}) {
  if (!attacker || !weapon || !dmg) return;

  const injected = Array.isArray(weapon.system?.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system?.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];

  const structured = injected
    .filter(q => q?.active)
    .map(q => q?.name)
    .filter(Boolean);

  const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
  const pills = [...structured, ...traits].filter(Boolean);
  const pillsInline = pills
    .map(p => `<span class="uesrpg-pill">${p}</span>`)
    .join(" ");

  const altTag = dmg?.usedAltDamage ? ` <span style="opacity:0.85; font-size:12px;">(2H)</span>` : "";

  const cardHtml = `
    <div class="uesrpg-weapon-damage-card">
      <h2 style="display:flex;gap:0.5rem;align-items:center;">
        <img src="${weapon.img}" style="height:32px;width:32px;">
        <div>${weapon.name}</div>
      </h2>

      <table class="uesrpg-weapon-damage-table">
        <thead>
          <tr>
            <th>Damage</th>
            <th class="tableCenterText">Result</th>
            <th class="tableCenterText">Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="tableAttribute">Damage</td>
            <td class="tableCenterText">${dmg.finalDamage}${altTag}</td>
            <td class="tableCenterText">
              <div>${dmg.damageString}</div>
              <div style="margin-top:0.35rem;">${pillsInline}</div>
            </td>
          </tr>
          <tr>
            <td class="tableAttribute">Hit Location</td>
            <td class="tableCenterText">${hitLocation}</td>
            <td class="tableCenterText">from attack roll</td>
          </tr>
        </tbody>
      </table>
      ${extraNoteHtml ? `<div style="margin-top:0.5rem; opacity:0.9;">${extraNoteHtml}</div>` : ""}
      ${applyButtonHtml ? `<div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">${applyButtonHtml}</div>` : ""}
    </div>
  `;

  const msgFlags = parentMessageId ? _opposedFlags(parentMessageId, stage) : undefined;
  // Ammunition is consumed at attack time (prior to the attack roll), not when the damage card is posted.
  // Keep flags lane clean: do not schedule post-hoc consumption here.

  // Return the created message so callers can enforce strict ordering when multiple
  // chat cards are posted in sequence (e.g., Resolve Block -> weapon card -> block result).
  const created = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
    content: cardHtml,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: [dmg.rollA, dmg.rollB].filter(Boolean),
    rollMode: game.settings.get("core", "rollMode"),
    flags: msgFlags,
  });
  return created;
}

const _bankedAutoRollLocalLocks = new Set();

export const OpposedWorkflow = {
  async consumePendingAmmo(pendingAmmo) {
    return _consumePendingAmmo(pendingAmmo);
  },

  /**
   * Bank an externally-created roll message (attacker-roll / defender-roll / defender-nodefense)
   * into the originating opposed chat card.
   *
   * Rationale: players can always create their own roll messages, but Foundry's ChatMessage
   * update permissions can prevent that player from updating the *parent* opposed card (which
   * is authored by another user). When an active GM is present, this method is intended to be
   * executed on the active GM client from a createChatMessage hook.
   *
   * @param {ChatMessage} rollMessage
   */
  async applyExternalRollMessage(rollMessage) {
    const meta = rollMessage?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
    const parentId = meta?.parentMessageId ?? null;
    const stage = meta?.stage ?? null;

    const rollId = rollMessage?.id ?? rollMessage?._id ?? null;
    if (!parentId || !stage) return;

    const parent = game.messages.get(parentId) ?? null;
    if (!parent) return;

    const current = parent?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
    if (!current || typeof current !== "object") return;



    // Anti-spoof + consistency checks: only bank roll messages that match the expected side.
    // This prevents other users from posting a roll message that is incorrectly attributed.
    const expectedSide = (stage === "attacker-roll")
      ? current.attacker
      : ((stage === "defender-roll" || stage === "defender-nodefense") ? current.defender : null);

    if (!expectedSide?.actorUuid) return;

    const expectedActor = _resolveActor(expectedSide.actorUuid);
    if (!expectedActor) return;

    const speakerActorId = rollMessage?.speaker?.actor ?? null;
    if (speakerActorId && speakerActorId !== expectedActor.id) return;

    const authorId =
      rollMessage?.author?.id ??
      rollMessage?._source?.author ??
      rollMessage?._source?.user ??
      rollMessage?.data?.author ??
      rollMessage?.data?.user ??
      null;
    const authorUser = authorId ? (game.users.get(String(authorId)) ?? null) : null;
    if (!authorUser) return;

    if (!authorUser.isGM && !_userHasActorOwnership(authorUser, expectedActor)) return;

    // Clone so we never mutate message.flags directly.
    const data = foundry.utils.deepClone(current);

    let dirty = false;

    const applyResult = async (side) => {
      if (!side?.actorUuid) return null;
      let actor = null;
      try {
        const doc = fromUuidSync(side.actorUuid);
        actor = (doc?.documentName === "Actor") ? doc : (doc?.actor ?? null);
      } catch (_e) {
        actor = null;
      }
      if (!actor) return null;

      const roll = rollMessage?.rolls?.[0] ?? null;
      const rollTotal = Number(roll?.total ?? NaN);
      if (!Number.isFinite(rollTotal)) return null;

      const res = computeResultFromRollTotal(actor, {
        rollTotal,
        target: Number(side.target ?? side?.tn?.finalTN ?? 0),
        allowLucky: true,
        allowUnlucky: true
      });

      return {
        rollTotal: res.rollTotal,
        target: res.target,
        isSuccess: res.isSuccess,
        degree: res.degree,
        textual: res.textual,
        isCriticalSuccess: res.isCriticalSuccess,
        isCriticalFailure: res.isCriticalFailure
      };
    };

    // If the roll message includes a commit payload (computed TN, labels, etc.),
    // apply it to the parent card before computing success/DoS/DoF.
    // This is required when the roller lacks permission to update the parent chat card.
    if (stage === "defender-roll") {
      const c = meta?.commit?.defender ?? null;
      if (c && typeof c === "object") {
        data.defender = data.defender ?? {};
        if (c.defenseType != null) data.defender.defenseType = String(c.defenseType);
        if (c.label != null) data.defender.label = String(c.label);
        if (c.defenseLabel != null) data.defender.defenseLabel = String(c.defenseLabel);
        if (c.testLabel != null) data.defender.testLabel = String(c.testLabel);
        if (c.target != null && Number.isFinite(Number(c.target))) data.defender.target = Number(c.target);
        if (c.targetLabel != null) data.defender.targetLabel = String(c.targetLabel);
        if (c.tn && typeof c.tn === "object") data.defender.tn = foundry.utils.deepClone(c.tn);
      }
    }

    if (stage === "attacker-roll") {
      const c = meta?.commit?.attacker ?? null;
      if (c && typeof c === "object") {
        _applyAttackerCommitToData(data, c);
      }
    }

if (stage === "attacker-roll") {
      if (data.attacker?.result) {
        if (!data.attacker.rollMessageId && rollId) {
          data.attacker.rollMessageId = rollId;
          data.attacker.rolledAt = Date.now();
          dirty = true;
        } else {
          return;
        }
      } else {
        const r = await applyResult(data.attacker);
        if (!r) return;
        data.attacker.result = r;
        if (rollId) {
          data.attacker.rollMessageId = rollId;
          data.attacker.rolledAt = Date.now();
        }
        dirty = true;
      }
    } else if (stage === "defender-roll") {
      if (data.defender?.noDefense) return;
      if (data.defender?.result) {
        if (!data.defender.rollMessageId && rollId) {
          data.defender.rollMessageId = rollId;
          data.defender.rolledAt = Date.now();
          dirty = true;
        } else {
          return;
        }
      } else {
        const r = await applyResult(data.defender);
        if (!r) return;
        data.defender.result = r;
        if (rollId) {
          data.defender.rollMessageId = rollId;
          data.defender.rolledAt = Date.now();
        }
        dirty = true;
      }
    } else if (stage === "defender-nodefense") {
      if (data.defender?.result || data.defender?.noDefense) return;
      if (rollId) {
        data.defender.noDefenseMessageId = rollId;
        data.defender.noDefenseAt = Date.now();
      }
      dirty = true;
      data.defender.noDefense = true;
      data.defender.defenseType = "none";
      data.defender.label = data.defender.label || "No Defense";
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
      data.defender.target = 0;
      data.defender.tn = data.defender.tn || { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1, textual: "1 DoF", isCriticalSuccess: false, isCriticalFailure: false };
    } else {
      return;
    }


    // Post-roll adjustments (schema-safe).
    // Dueling Weapon: grants +1 Degree of Success on successful Parry or Counter-Attack.
    if (stage === "defender-roll" && data.defender?.result?.isSuccess && !Number(data.defender.result.duelingBonus)) {
      const dt = String(data.defender?.defenseType ?? "");
      if (dt === "parry" || dt === "counter") {
        try {
          const defWUuid = _getPreferredWeaponUuid(expectedActor, { meleeOnly: true }) || "";
          if (defWUuid) {
            const defW = fromUuidSync(defWUuid);
            if (defW?.type === "weapon" && _weaponHasQuality(defW, "dueling")) {
              data.defender.result.degree = Math.max(1, (Number(data.defender.result.degree) || 1) + 1);
              data.defender.result.duelingBonus = 1;
              data.defender.result.textual = data.defender.result.isSuccess
                ? `${data.defender.result.degree} DoS`
                : `${data.defender.result.degree} DoF`;
              dirty = true;
            }
          }
        } catch (err) {
          console.warn("UESRPG | opposed-workflow | dueling weapon bonus lookup failed", err);
        }
      }
    }
    // Phase tracking (non-breaking; used for diagnostics).
    data.context = data.context ?? {};
    if (stage === "attacker-roll") {
      data.context.phase = "waitingDefender";
      if (!data.context.waitingSince) data.context.waitingSince = Date.now();
    }
    if (stage === "defender-roll" || stage === "defender-nodefense") {
      if (!data.context.phase || data.context.phase === "pending") data.context.phase = "resolving";
    }

    // Resolve if ready.
    if (data.attacker?.result && data.defender?.result && !data.outcome) {
      const outcome = _resolveOutcomeRAW(data);
      data.outcome = outcome ?? { winner: "tie", text: "" };
      data.advantage = _computeAdvantageRAW(data, data.outcome);
      data.status = "resolved";
      data.context = data.context ?? {};
      data.context.phase = "resolved";
      if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
      _cleanupAutoRollContext(data.context);
    }

    await _updateCard(parent, data);
  },

  /**
   * Banked-choice auto roll hook helper.
   * Called from updateChatMessage (GM) to begin rolling once both sides have committed.
   */
  async maybeAutoRollBanked(message) {
    try {
      if (!message) return;

      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isBankChoicesEnabledForData(opposed)) return;

      const data = foundry.utils.deepClone(opposed);
      _ensureBankedScaffold(data);

      // Only proceed when a roll has been requested and has not started.
      if (!data?.context?.autoRollRequested) return;
      if (data?.context?.autoRollStarted) return;

      const bank = _getBankCommitState(data);
      if (!bank.bothCommitted) return;

      // Only the active GM should run the auto-roll.
      if (!_anyActiveGMOnline()) return;
      const activeGM = game.users.activeGM ?? null;
      if (activeGM && game.user.id !== activeGM.id) return;
      if (!game.user.isGM) return;

      await this._autoRollBanked(message.id, { trigger: "hook" });
    } catch (err) {
      console.error("UESRPG | maybeAutoRollBanked failed", err);
    }
  },

  /**
   * Banked-choice auto roll helper for non-GM scenarios.
   *
   * If no active GM is online, each participant auto-rolls their own committed lane once
   * both sides have committed. Parent-card updates are still applied by the message author
   * (via Authority Proxy), so the workflow completes deterministically without a manual
   * “Roll (GM)” confirmation.
   */
  async maybeAutoRollBankedNoGM(message) {
    try {
      if (!message) return;

      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isBankChoicesEnabledForData(opposed)) return;

      // If any active GM is online, the GM is the canonical runner.
      if (_anyActiveGMOnline()) return;

      const data = foundry.utils.deepClone(opposed);
      _ensureBankedScaffold(data);

      const bank = _getBankCommitState(data);
      if (!bank.bothCommitted) return;

      data.context = data.context ?? {};
      if (!data.context.autoRollRequested) {
        // Compatibility: older cards may not set this in commit handlers.
        data.context.autoRollRequested = true;
        data.context.autoRollRequestedAt = Date.now();
        data.context.autoRollRequestedBy = game.user.id;
        await _updateCard(message, data);
      }

      const userId = game.user?.id ?? null;
      if (!userId) return;

      // Attacker lane: only the committing user should auto-roll.
      if (!data.attacker?.result && data.attacker?.banked?.committed === true && data.attacker?.banked?.committedBy === userId) {
        // Only attempt if a declaration exists.
        const t = Number(data.attacker?.target ?? data.attacker?.tn?.finalTN ?? NaN);
        if (Number.isFinite(t)) {
          await this.handleAction(message, "attacker-roll-committed");
        }
      }

      // Defender lane: only the committing user should auto-roll, and only if this is not No Defense.
      if (!data.defender?.result && data.defender?.noDefense !== true && data.defender?.banked?.committed === true && data.defender?.banked?.committedBy === userId) {
        const dt = String(data.defender?.defenseType ?? "");
        if (dt && dt !== "none") {
          const t = Number(data.defender?.target ?? data.defender?.tn?.finalTN ?? NaN);
          if (Number.isFinite(t)) {
            await this.handleAction(message, "defender-roll-committed");
          }
        }
      }
    } catch (err) {
      console.error("UESRPG | maybeAutoRollBankedNoGM failed", err);
    }
  },
  /**
   * Begin rolling a banked-choice opposed test once both sides have committed.
   * This will roll any unresolved lanes without prompting for additional choices.
   *
   * Safeguards:
   *  - Local lock prevents same-client re-entrancy (e.g. commit-path + update hook).
   *  - Claim-id prevents cross-caller duplication if two runners attempt to start simultaneously.
   */
  async _autoRollBanked(parentMessageId, { trigger = "auto" } = {}) {
    const message = game.messages.get(parentMessageId) ?? null;
    if (!message) return;

    // Same-client re-entrancy guard.
    if (_bankedAutoRollLocalLocks.has(parentMessageId)) return;
    _bankedAutoRollLocalLocks.add(parentMessageId);

    try {
      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isBankChoicesEnabledForData(opposed)) return;

      const data = foundry.utils.deepClone(opposed);
      _ensureBankedScaffold(data);

      const bank = _getBankCommitState(data);
      if (!bank.bothCommitted) return;

      data.context = data.context ?? {};
      if (data.context.autoRollStarted) return;

      // Claim this auto-roll run. If another caller claims after us, we will abort.
      const claimId = foundry.utils.randomID();
      data.context.autoRollClaimId = claimId;
      data.context.autoRollStarted = true;
      data.context.autoRollStartedAt = Date.now();
      data.context.autoRollStartedBy = game.user.id;
      data.context.autoRollStartedTrigger = String(trigger ?? "auto");

      if (!data.context.autoRollRequested) {
        data.context.autoRollRequested = true;
        data.context.autoRollRequestedAt = Date.now();
        data.context.autoRollRequestedBy = game.user.id;
      }

      await _updateCard(message, data);

      // Verify we still own the claim after the persisted update.
      // (If another runner wrote a different claimId, they are the canonical runner.)
      const fresh = game.messages.get(parentMessageId) ?? message;
      const freshOpposed = fresh?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      const freshClaimId = freshOpposed?.context?.autoRollClaimId ?? null;
      if (freshClaimId && freshClaimId !== claimId) return;

      // Roll unresolved lanes (committed).
      if (!freshOpposed?.attacker?.result) {
        await this.handleAction(fresh, "attacker-roll-committed");
      }

      // Defender lane rolls only if not already resolved and not No Defense.
      if (!freshOpposed?.defender?.result && freshOpposed?.defender?.noDefense !== true) {
        await this.handleAction(fresh, "defender-roll-committed");
      }
    } finally {
      _bankedAutoRollLocalLocks.delete(parentMessageId);
    }
  },


  /**
   * Create a pending opposed test card.
   * Compatible with legacy callers.
   */
  async createPending(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid) ?? _resolveDoc(cfg.attackerUuid);
    const dDoc = _resolveDoc(cfg.defenderTokenUuid) ?? _resolveDoc(cfg.defenderActorUuid) ?? _resolveDoc(cfg.defenderUuid);

    const aToken = _resolveToken(aDoc);
    const dToken = _resolveToken(dDoc);
    const attacker = _resolveActor(aDoc);
    const defender = _resolveActor(dDoc);

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed test requires both an attacker and a defender (token or actor).");
      return null;
    }

    // Chapter 5 (Defensive Stance): Attack limit reduced to 0 until next Turn.
    // Prevent creating a pending attack when Defensive Stance is active.
    if (String(cfg.mode ?? "attack") === "attack" && _findEnabledEffectByUesrpgKey(attacker, "defensiveStance")) {
      ui.notifications.warn("Defensive Stance is active: you cannot attack until your next Turn.");
      return null;
    }

    const baseTarget = Number(cfg.attackerTarget ?? 0);

    // Seed the opposed context with a weapon UUID.
    //
    // Default behavior: use the attacker's preferred equipped weapon.
    // Override behavior (cfg.weaponUuid): used by sheet quick-actions to ensure
    // the pending card reflects the clicked weapon and that the Declare dialog
    // preselects the correct weapon.
    //
    // This is required for deterministic range band TN modifiers and weapon-quality gating
    // (e.g., Flail) during DefenseDialog, before any damage-resolution step.
    let seededWeaponUuid = "";
    if (cfg.weaponUuid) {
      try {
        const w = fromUuidSync(String(cfg.weaponUuid));
        if (w && w.documentName === "Item" && w.type === "weapon" && w.parent?.uuid === attacker.uuid) {
          seededWeaponUuid = w.uuid;
        }
      } catch (_e) {
        seededWeaponUuid = "";
      }
    }
    if (!seededWeaponUuid) seededWeaponUuid = _getPreferredWeaponUuid(attacker, { meleeOnly: false }) || "";
    const seededAttackMode = cfg.attackMode ? String(cfg.attackMode) : await _inferAttackModeFromPreferredWeapon(attacker);

    const data = {
      context: {
        schemaVersion: 1,
        createdAt: Date.now(),
        createdBy: game.user.id,
        updatedAt: Date.now(),
        updatedBy: game.user.id,
        phase: 'pending',
        waitingSince: null,
        weaponUuid: seededWeaponUuid || null,
        attackMode: seededAttackMode || "melee",
        skipAttackerAPDeduction: Boolean(cfg.skipAttackerAPDeduction),
        bankChoicesEnabled: (() => {
          try {
            return Boolean(game.settings.get("uesrpg-3ev4", "opposedBankChoices"));
          } catch (_e) {
            return false;
          }
        })(),
        autoRollRequested: false,
        autoRollRequestedAt: null,
        autoRollRequestedBy: null,
        autoRollStarted: false,
        autoRollStartedAt: null,
        autoRollStartedBy: null
      },
      status: "pending",
      mode: cfg.mode ?? "attack",
      attacker: {
        actorUuid: attacker.uuid,
        tokenUuid: aToken?.document?.uuid ?? null,
        tokenName: aToken?.name ?? null,
        name: attacker.name,
        label: cfg.attackerLabel ?? "Attack",
        itemUuid: cfg.attackerItemUuid ?? cfg.itemUuid ?? null,
        baseTarget,
        hasDeclared: false,
        banked: { committed: false, committedAt: null, committedBy: null },
        variant: "normal",
        variantMod: 0,
        manualMod: 0,
        totalMod: 0,
        target: baseTarget,
        tn: null,
        result: null
      },
      defender: {
        actorUuid: defender.uuid,
        tokenUuid: dToken?.document?.uuid ?? null,
        tokenName: dToken?.name ?? null,
        name: defender.name,
        // label: the chosen defense option label (e.g. Parry/Evade/Block/Counter-Attack)
        label: null,
        // testLabel: the actual test used for the roll (Combat Style/Profession name or Evade)
        testLabel: null,
        // defenseLabel: the chosen defensive action (Parry/Evade/Block/Counter-Attack/No Defense)
        defenseLabel: null,
        target: null,
        defenseType: null,
        result: null,
        noDefense: false,
        banked: { committed: false, committedAt: null, committedBy: null },
        tn: null
      },
      outcome: null
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
      content: _renderCard(data, ""),
      flags: { "uesrpg-3ev4": { opposed: data } }
    });

    await message.update({ content: _renderCard(data, message.id) });

    _logDebug("createPending", {
      messageId: message.id,
      attackerUuid: data.attacker.actorUuid,
      defenderUuid: data.defender.actorUuid,
      mode: data.mode
    });

    return message;
  },

  async handleAction(message, action) {
    const messageId = message?.id ?? message?._id ?? null;
    const liveMessage = messageId ? (game.messages.get(messageId) ?? message) : message;
    const raw = liveMessage?.flags?.["uesrpg-3ev4"]?.opposed;
    if (!raw) return;

    // Clone so we never mutate ChatMessage flags directly (prevents stale-snapshot regressions).
    const data = foundry.utils.deepClone(raw);

    // From here on, operate on the live ChatMessage document.
    message = liveMessage;

    // Normalize combat context once per interaction to avoid legacy field regressions.
    data.context = data.context ?? {};
    if (!data.context.attackMode) data.context.attackMode = getContextAttackMode(data.context);

    const attacker = _resolveActor(data.attacker.actorUuid);
    const defender = _resolveActor(data.defender.actorUuid);
    const aToken = _resolveToken(data.attacker.tokenUuid);
    const dToken = _resolveToken(data.defender.tokenUuid);

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed Test: could not resolve attacker/defender.");
      return;
    }

    // Banked choice mode (meta-limiting): snapshot and state scaffold
    const bankMode = _isBankChoicesEnabledForData(data);
    _ensureBankedScaffold(data);

    // Back-compat: treat legacy actions as banked commits when bankMode is enabled.
    if (bankMode) {
      if (action === "attacker-roll") action = "attacker-commit";
      if (action === "defender-roll") action = "defender-commit";
      if (action === "defender-nodefense") action = "defender-commit-nodefense";
    }
    // Banked roll trigger (meta-limiting): begin rolling once both sides have committed.
    if (action === "banked-roll") {
      if (!bankMode) return;
      const bank = _getBankCommitState(data);
      if (!bank.bothCommitted) {
        ui.notifications.warn("Both sides must commit their choices before rolling.");
        return;
      }

      data.context = data.context ?? {};
      if (!data.context.autoRollRequested) {
        data.context.autoRollRequested = true;
        data.context.autoRollRequestedAt = Date.now();
        data.context.autoRollRequestedBy = game.user.id;
      }

      await _updateCard(message, data);

      if (!_anyActiveGMOnline()) {
        ui.notifications.info("No active GM is online; rolling will proceed automatically for each participant.");
        return;
      }

      const activeGM = game.users.activeGM ?? null;
      if (activeGM && game.user.id !== activeGM.id) {
        ui.notifications.info("Requested GM to begin the opposed roll.");
        return;
      }

      if (!game.user.isGM) {
        ui.notifications.warn("Only the active GM may begin the opposed roll.");
        return;
      }

      await this._autoRollBanked(message.id, { trigger: "manual" });
      return;
    }

    // --- Attacker Actions ---
    if (action === "attacker-roll" || action === "attacker-commit" || action === "attacker-roll-committed") {
      const isCommit = action === "attacker-commit";
      const isRollCommitted = action === "attacker-roll-committed";

      if (data.attacker.result) return;

      if (isCommit && !bankMode) {
        ui.notifications.warn("Banked choices are not enabled for this opposed test.");
        return;
      }

      if (!_canControlActor(attacker)) {
        ui.notifications.warn("You do not have permission to roll for the attacker.");
        return;
      }

      const bank = bankMode ? _getBankCommitState(data) : null;
      if (isRollCommitted) {
        if (!bankMode) {
          ui.notifications.warn("Banked choices are not enabled for this opposed test.");
          return;
        }
        if (!bank?.bothCommitted) {
          ui.notifications.warn("Both sides must commit their choices before rolling.");
          return;
        }
        if (!data.attacker.hasDeclared || !Number.isFinite(Number(data.attacker.target))) {
          ui.notifications.warn("Attacker has not committed an attack declaration yet.");
          return;
        }
      }

      // Chapter 5 (Restrained): cannot attack.
      if (hasCondition(attacker, "restrained")) {
        ui.notifications.warn(`${attacker.name} is Restrained and cannot attack.`);
        return;
      }

      // Chapter 5 (Defensive Stance): Attack limit reduced to 0 until next Turn.
      if (_findEnabledEffectByUesrpgKey(attacker, "defensiveStance")) {
        ui.notifications.warn("Defensive Stance is active: you cannot attack until your next Turn.");
        return;
      }

      let decl = null;
      let pendingApCost = Number(data.attacker?.pendingApCost ?? 0) || 0;

      if (!isRollCommitted) {
        // One dialog only: (optional) combat style selector + attack variant + manual modifier.
        const styles = listCombatStyles(attacker);
        const selectedStyleUuid = styles.find(s => s.uuid === data.attacker.itemUuid)?.uuid ?? styles[0]?.uuid ?? data.attacker.itemUuid ?? null;

        // Attack type is inferred from the currently preferred weapon (automatic; no manual override).
        data.context = data.context ?? {};
        data.context.attackMode = await _inferAttackModeFromPreferredWeapon(attacker);
        data.context.attackFromHidden = hasCondition(attacker, "hidden");

        // RAW: Hard gate for unloaded ranged weapons (Issue 1)
        // Before allowing attack declaration, check if the weapon is loaded
        if (data.context.attackMode === "ranged") {
          const weaponUuid = data.context?.weaponUuid || _getPreferredWeaponUuid(attacker, { meleeOnly: false });
          if (weaponUuid) {
            const weapon = await fromUuid(weaponUuid);
            if (weapon?.type === "weapon") {
              const reloadState = weapon.system?.reloadState;
              if (reloadState?.requiresReload && !reloadState?.isLoaded) {
                ui.notifications.warn(`${weapon.name} must be reloaded before attacking.`);
                return; // Hard stop - prevent attack
              }
            }
          }
        }

        decl = await _attackerDeclareDialog(attacker, data.attacker.label ?? "Attack", {
          styles,
          selectedStyleUuid,
          defaultWeaponUuid: data.context?.weaponUuid ?? null,
          defaultVariant: data.attacker.variant ?? "normal",
          defaultManual: data.attacker.manualMod ?? 0,
          defaultCirc: data.attacker.circumstanceMod ?? 0
        });
        if (!decl) return;

        // Persist the declared weapon selection into the opposed context for downstream automation
        // (range, traits, damage previews, etc.). This is a non-schema-breaking addition.
        data.context.weaponUuid = decl.weaponUuid || data.context.weaponUuid || null;

        // Normalize attackMode from the explicitly selected weapon (covers thrown weapons where weaponType may be melee).
        if (data.context.weaponUuid) {
          try {
            const w = await fromUuid(String(data.context.weaponUuid));
            if (w?.type === "weapon") {
              const wt = String(w.system?.attackMode ?? w.system?.weaponType ?? w.system?.type ?? "").toLowerCase();
              data.context.attackMode = (wt.includes("ranged") || _weaponHasQuality(w, "thrown")) ? "ranged" : "melee";
            }
          } catch (_e) {
            // No-op; keep previously inferred mode.
          }
        }

        const attackerMovementAction = _getTokenMovementAction(aToken);

        // IMPORTANT: Do not spend AP until after we have produced a real roll message.
        // This prevents AP loss if the workflow fails before resolving the roll.
        // AP: any attack costs 1 AP; variant AP cost is additive (e.g., All Out Attack is +1 AP).
        const baseApCost = (String(data.mode ?? "attack") === "attack") ? 1 : 0;
        const extraApCost = Number(decl.apCost ?? 0) || 0;
        pendingApCost = baseApCost + extraApCost;

        // If the attacker selected a different combat style, switch base TN + label now.
        if (decl.styleUuid && decl.styleUuid !== data.attacker.itemUuid) {
          const chosen = styles.find(s => s.uuid === decl.styleUuid) ?? null;
          if (chosen) {
            data.attacker.itemUuid = chosen.uuid;
            data.attacker.label = chosen.name;
          }
        }

        const manualMod = Number(decl.manualMod) || 0;
        const circumstanceMod = Number(decl.circumstanceMod) || 0;
        const situationalMods = _collectSensorySituationalMods(decl);

        // Range computation for ranged attacks.
        // Rules (Chapter 7): Close = +10, Medium = +0, Long = -20, beyond Long = cannot attack.
        if (String(data.context?.attackMode ?? "melee") === "ranged") {
          let weapon = null;
          try {
            if (data.context.weaponUuid) weapon = await fromUuid(String(data.context.weaponUuid));
          } catch (_e) {
            weapon = null;
          }

          const rangeCtx = _computeRangedRangeContext({ attackerToken: aToken, defenderToken: dToken, weapon });
          if (rangeCtx) {
            data.context.range = rangeCtx;
            if (rangeCtx.outOfRange) {
              const wName = weapon?.name ? ` (${weapon.name})` : "";
              ui.notifications.warn(`Target is out of range${wName}. Distance ${Math.round(rangeCtx.distance)} > Long ${rangeCtx.long}.`);
              return;
            }
            if (rangeCtx.band) {
              const bandLabel = rangeCtx.band === "close" ? "Close" : rangeCtx.band === "medium" ? "Medium" : "Long";
              // Only add when it actually modifies TN (Close/Long). Medium has no modifier.
              if (Number(rangeCtx.tnMod) !== 0) {
                situationalMods.push({ key: "range", label: `Range (${bandLabel})`, value: Number(rangeCtx.tnMod) });
              }
            }
          }
        }
        const tn = computeTN({
          actor: attacker,
          role: "attacker",
          styleUuid: data.attacker.itemUuid,
          variant: decl.variant,
          manualMod,
          circumstanceMod,
          situationalMods,
          context: {
            opponentUuid: defender?.uuid ?? null,
            opponentSize: defender?.system?.size ?? null,
            attackMode: data.context?.attackMode ?? "melee",
            itemUuid: data.context?.weaponUuid ?? null,
            selfSize: attacker?.system?.size ?? null,
            movementAction: attackerMovementAction
          }
        });

        const finalTN = tn.finalTN;
        const totalMod = tn.totalMod;
        const vMod = computeVariantMod(decl.variant);

        data.attacker.hasDeclared = true;
        data.attacker.variant = decl.variant;
        data.attacker.variantLabel = _variantLabel(decl.variant);
        data.attacker.variantMod = vMod;
        data.attacker.manualMod = manualMod;
        data.attacker.circumstanceMod = circumstanceMod;
        data.attacker.circumstanceLabel = _circumstanceLabel(circumstanceMod);
        data.attacker.totalMod = totalMod;
        data.attacker.baseTarget = tn.baseTN;
        data.attacker.target = finalTN;
        data.attacker.tn = tn;
        data.attacker.pendingApCost = pendingApCost;
        data.attacker.pendingApVariant = decl.variant;

        _logDebug("attackerDeclare", {
          attackerUuid: data.attacker.actorUuid,
          defenderUuid: data.defender.actorUuid,
          attackVariant: data.attacker.variant,
          tn
        });

        // Banked-choice mode: stop after declaration; do not roll until both sides have committed.
        if (isCommit) {
          data.attacker.banked = data.attacker.banked ?? {};
          data.attacker.banked.committed = true;
          data.attacker.banked.committedAt = Date.now();
          data.attacker.banked.committedBy = game.user.id;

          // Chapter 5 (Hidden): enemies cannot defend against attacks made by hidden characters.
          // To avoid deadlocks in banked mode, force the defender lane to No Defense immediately.
          if (data.context?.attackFromHidden === true && !data.defender?.result && data.defender?.noDefense !== true) {
            data.defender.banked = data.defender.banked ?? {};
            data.defender.banked.committed = true;
            data.defender.banked.committedAt = Date.now();
            data.defender.banked.committedBy = "system";
            data.defender.banked.forced = true;
            data.defender.banked.reason = "hidden";

            data.defender.noDefense = true;
            data.defender.defenseType = "none";
            data.defender.label = "No Defense (Hidden)";
            data.defender.testLabel = "No Defense";
            data.defender.defenseLabel = "No Defense";
            data.defender.target = 0;
            data.defender.tn = {
              finalTN: 0,
              baseTN: 0,
              totalMod: 0,
              breakdown: [{ key: "base", label: "No Defense (Hidden)", value: 0, source: "base" }]
            };
            data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
          }

          // Auto-request GM roll when both sides are committed and a GM is online.
          const b = _getBankCommitState(data);
          if (b.bothCommitted) {
            data.context = data.context ?? {};
            if (!data.context.autoRollRequested) {
              data.context.autoRollRequested = true;
              data.context.autoRollRequestedAt = Date.now();
              data.context.autoRollRequestedBy = game.user.id;
            }
          }

          await _updateCard(message, data);

          return;
        }
      }

      // At this point we are rolling (either standard workflow or banked roll).
      const finalTN = Number(data.attacker.target ?? 0) || 0;

      // Consume ammunition at attack time (per system rules and project direction).
      // Hard requirement: ranged (non-thrown) attacks must have ammo even if no damage card is ever produced.
      const ammoOk = await _preConsumeAttackAmmo(attacker, data);
      if (!ammoOk) return;

      // Mark weapon as needing reload immediately after successful ammunition consumption (ranged attacks only).
      // This ensures reload state is properly tracked before the attack roll executes.
      const attackMode = getContextAttackMode(data?.context);
      if (attackMode === "ranged") {
        try {
          // Weapon UUID priority: preConsumedAmmo (cached) > context (declared) > preferred (equipped)
          const weaponUuid = (data.attacker?.preConsumedAmmo?.weaponUuid 
            ?? String(data?.context?.weaponUuid ?? "")) 
            || _getPreferredWeaponUuid(attacker, { meleeOnly: false }) 
            || "";
          if (weaponUuid) {
            const weapon = await fromUuid(weaponUuid);
            if (weapon && weapon.type === "weapon") {
              await _markWeaponNeedsReload(weapon);
            }
          }
        } catch (err) {
          console.warn("UESRPG | Failed to mark weapon as needing reload after attack", err);
        }
      }

      // Perform a real Foundry roll + message so Dice So Nice triggers.
      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: finalTN, allowLucky: true, allowUnlucky: true });
      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        flavor: `${data.attacker.label} — Attacker Roll`,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "attacker-roll", {
          commit: {
            attacker: {
              hasDeclared: true,
              variant: data.attacker.variant,
              variantLabel: data.attacker.variantLabel,
              variantMod: data.attacker.variantMod,
              manualMod: data.attacker.manualMod,
              circumstanceMod: data.attacker.circumstanceMod,
              circumstanceLabel: data.attacker.circumstanceLabel,
              totalMod: data.attacker.totalMod,
              baseTarget: data.attacker.baseTarget,
              target: data.attacker.target,
              tn: data.attacker.tn,
              itemUuid: data.attacker.itemUuid,
              label: data.attacker.label
            }
          }
        })
      });

      // Consume one-shot Advantage-derived effects after they have been applied to this attack test.
      // RAW: Press Advantage / Overextend apply to the next attack test within 1 round.
      await _consumeOneShotAdvantageEffects(attacker, {
        opponentUuid: defender?.uuid ?? null,
        attackMode: String(data?.context?.attackMode ?? "melee")
      });

      // RAW: Aim bonus applies to the next ranged attack with the aimed weapon/spell.
      // Taking any other action breaks the chain; firing the aimed item consumes it.
      await _consumeOrBreakAimAfterAttack(attacker, {
        attackMode: String(data?.context?.attackMode ?? "melee"),
        itemUuid: data.context?.weaponUuid ?? null
      });

      // Spend AP only after the attack roll has been successfully executed and posted.
      // This avoids losing AP on cancelled/failed workflows.
      // Skip AP deduction if it was already consumed (e.g., Attack of Opportunity).
      const skipAP = Boolean(data.context?.skipAttackerAPDeduction);
      pendingApCost = Number(data.attacker?.pendingApCost ?? pendingApCost) || 0;
      const apVariant = String(data.attacker?.pendingApVariant ?? data.attacker.variant ?? "normal");
      if (pendingApCost > 0 && !skipAP) {
        const ok = await ActionEconomy.spendAP(attacker, pendingApCost, { reason: `attackVariant:${apVariant}`, silent: true });
        if (!ok) {
          ui.notifications.warn("Insufficient Action Points to perform this attack.");
        }
      }
      
      // Increment attack counter after AP is spent successfully
      await AttackTracker.incrementAttacks(attacker);
      
      if (isRollCommitted) {
        // Banked-choice auto-roll: do not write roll results directly into the parent card.
        // The roll chat message will be banked into the parent card by the createChatMessage hook.
        // Still apply post-attack side-effects that do not depend on the parent card state.
        if (data.context?.attackFromHidden === true) {
          await _consumeHiddenAfterAttack(attacker);
        }
        return;
      }

      data.attacker.result = {
        rollTotal: res.rollTotal,
        target: res.target,
        isSuccess: res.isSuccess,
        degree: res.degree,
        textual: res.textual,
        isCriticalSuccess: res.isCriticalSuccess,
        isCriticalFailure: res.isCriticalFailure
      };

      // Chapter 5 (Hidden): enemies cannot defend against attacks made by hidden characters.
      if (data.context?.attackFromHidden === true && !data.defender?.result && data.defender?.noDefense !== true) {
        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = "No Defense (Hidden)";
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: "No Defense (Hidden)", value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
      }

      // RAW: attacking causes the Hidden condition to be lost immediately after the attack.
      if (data.context?.attackFromHidden === true) {
        await _consumeHiddenAfterAttack(attacker);
      }

      await _updateCard(message, data);
    }



    // --- Defender Actions (banked choices) ---
    if (action === "defender-commit-nodefense") {
      if (!bankMode) {
        ui.notifications.warn("Banked choices are not enabled for this opposed test.");
        return;
      }

      if (data.defender.result || data.defender.noDefense) return;

      if (data.defender?.banked?.committed === true) {
        ui.notifications.warn("Defender has already committed a defense choice.");
        return;
      }

      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to choose defender actions.");
        return;
      }

      data.defender.banked = data.defender.banked ?? {};
      data.defender.banked.committed = true;
      data.defender.banked.committedAt = Date.now();
      data.defender.banked.committedBy = game.user.id;

      data.defender.noDefense = true;
      data.defender.defenseType = "none";
      data.defender.label = "No Defense";
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
      data.defender.target = 0;
      data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

      _logDebug("defenderCommitNoDefense", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid
      });

      // Auto-request GM roll when both sides are committed and a GM is online.
      const b = _getBankCommitState(data);
      if (b.bothCommitted) {
        data.context = data.context ?? {};
        if (!data.context.autoRollRequested) {
          data.context.autoRollRequested = true;
          data.context.autoRollRequestedAt = Date.now();
          data.context.autoRollRequestedBy = game.user.id;
        }
      }

      await _updateCard(message, data);

      return;
    }

    if (action === "defender-commit" || action === "defender-roll-committed") {
      const isCommit = action === "defender-commit";
      const isRollCommitted = action === "defender-roll-committed";

      // CORRECTED: Feint gating - force No Defense if Feinted by this specific attacker
      const feintedEffect = defender.effects.find(e => 
        !e.disabled && 
        (e?.flags?.uesrpg?.key === "feinted" || e?.flags?.["uesrpg-3ev4"]?.condition?.key === "feinted")
      );

      if (feintedEffect) {
        const feintedByUuid = feintedEffect?.flags?.uesrpg?.attackerUuid ?? 
                              feintedEffect?.flags?.["uesrpg-3ev4"]?.condition?.attackerUuid;
        
        if (feintedByUuid && feintedByUuid === attacker.uuid) {
          // RAW: treat next melee attack as if attacker were Hidden
          // Implementation: force No Defense
          data.defender.banked = data.defender.banked ?? {};
          data.defender.banked.committed = true;
          data.defender.banked.committedAt = Date.now();
          data.defender.banked.committedBy = "system";
          data.defender.banked.forced = true;
          data.defender.banked.reason = "feinted";

          data.defender.noDefense = true;
          data.defender.defenseType = "none";
          data.defender.label = "No Defense (Feinted)";
          data.defender.testLabel = "No Defense";
          data.defender.defenseLabel = "No Defense";
          data.defender.target = 0;
          data.defender.tn = {
            finalTN: 0,
            baseTN: 0,
            totalMod: 0,
            breakdown: [{ key: "base", label: "No Defense (Feinted)", value: 0, source: "base" }]
          };
          data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

          await _updateCard(message, data);

          // Remove Feinted after it's been used
          const { removeCondition } = await import("../conditions/condition-engine.js");
          await removeCondition(defender, "feinted");

          ui.notifications.info(`${defender.name} is Feinted and cannot defend against ${attacker.name}!`);
          return;
        }
      }

      if (!bankMode) {
        ui.notifications.warn("Banked choices are not enabled for this opposed test.");
        return;
      }

      if (data.defender.result || data.defender.noDefense) return;

      if (isCommit && data.defender?.banked?.committed === true) {
        ui.notifications.warn("Defender has already committed a defense choice.");
        return;
      }

      if (!_canControlActor(defender)) {
        ui.notifications.warn(isCommit ? "You do not have permission to choose defender actions." : "You do not have permission to roll for the defender.");
        return;
      }

      const bank = _getBankCommitState(data);

      if (isRollCommitted) {
        if (!bank.bothCommitted) {
          ui.notifications.warn("Both sides must commit their choices before rolling.");
          return;
        }

        const t = Number(data.defender?.target ?? data.defender?.tn?.finalTN ?? NaN);
        if (!Number.isFinite(t)) {
          ui.notifications.warn("Defender has not committed a defense declaration yet.");
          return;
        }

        const dt = String(data.defender?.defenseType ?? "");
        if (!dt || dt === "none") {
          ui.notifications.warn("Defender has committed No Defense (or no defense type). No roll is required.");
          return;
        }
      }

      // Chapter 5 (Restrained): cannot defend.
      // Chapter 5 (Hidden): if the attacker struck from Hidden, the defender cannot attempt defense.
      if (hasCondition(defender, "restrained") || data.context?.attackFromHidden === true) {
        const reason = hasCondition(defender, "restrained") ? "Restrained" : "Hidden";

        data.defender.banked = data.defender.banked ?? {};
        data.defender.banked.committed = true;
        data.defender.banked.committedAt = Date.now();
        data.defender.banked.committedBy = "system";
        data.defender.banked.forced = true;
        data.defender.banked.reason = String(reason).toLowerCase();

        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = `No Defense (${reason})`;
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: `No Defense (${reason})`, value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

        // Auto-request GM roll when both sides are committed and a GM is online.
        const b = _getBankCommitState(data);
        if (b.bothCommitted) {
          data.context = data.context ?? {};
          if (!data.context.autoRollRequested) {
            data.context.autoRollRequested = true;
            data.context.autoRollRequestedAt = Date.now();
            data.context.autoRollRequestedBy = game.user.id;
          }
        }

        await _updateCard(message, data);

        return;
      }

      const defenderMovementAction = _getTokenMovementAction(dToken);

      if (isCommit) {
        const { attackerWeaponTraits, defenderHasSmallWeapon } = await _getDefenseGatingContext({ attacker, defender, data });

        const choice = await DefenseDialog.show(defender, {
          attackerContext: data.attacker,
          attackerWeaponTraits,
          defenderHasSmallWeapon,
          context: {
            opponentUuid: attacker?.uuid ?? null,
            attackMode: data.context?.attackMode ?? "melee",
            movementAction: defenderMovementAction
          }
        });
        if (!choice) return;

        // Defense option availability normalization (single canonical rules-layer).
        // This is a defensive server-side validation: UI already prevents illegal selection,
        // but we do not trust client-side input.
        try {
          const availability = computeDefenseAvailability({
            attackMode: data.context?.attackMode ?? "melee",
            attackerWeaponTraits,
            defenderHasSmallWeapon,
            defenderHasShield: hasEquippedShield(defender)
          });
          const requested = String(choice.defenseType ?? "evade");
          const normalized = normalizeDefenseType(requested, availability, "evade");
          if (normalized !== requested) {
            ui.notifications.warn("Selected defense option is not available for this attack. Defaulting to Evade.");
            choice.defenseType = "evade";
            choice.label = "Evade";
            choice.styleUuid = null;
            choice.styleId = null;
          }
        } catch (err) {
          console.warn("UESRPG | opposed-workflow | defense option normalization failed", err);
        }

        // RAW: Defensive reactions cost Action Points unless an explicit feature states otherwise.

        // Default: any defense choice other than No Defense costs 1 AP.

        // Spend immediately upon selecting the defense choice to prevent later desync.

        if (choice.defenseType && choice.defenseType !== "none") {

          const ok = await ActionEconomy.spendAP(defender, 1, { reason: `reaction:${choice.defenseType}`, silent: true });

          if (!ok) {

            ui.notifications.warn(`${defender.name} does not have enough Action Points to perform a defensive reaction. Choose No Defense instead.`);

            return;

          }

        }


        if (choice.defenseType && choice.defenseType !== "none") {

          // RAW: Any reaction other than continuing to Aim or firing breaks the Aim chain.

          await _breakAimChainIfPresent(defender);

        }
        data.defender.defenseType = choice.defenseType;
        data.defender.label = choice.label;
        data.defender.defenseLabel = choice.label;

        if (choice.defenseType === "evade") {
          data.defender.testLabel = "Evade";
        } else if (choice.styleUuid || choice.styleId) {
          const styleUuid = choice.styleUuid ?? choice.styleId;
          const styles = listCombatStyles(defender);
          const style = styles.find(s => s.uuid === styleUuid) ?? null;
          data.defender.testLabel = style?.name ?? "(Combat Style)";
        } else {
          data.defender.testLabel = "(Combat Style)";
        }

        const manualMod = _asNumber(choice.manualMod ?? 0);
        const circumstanceMod = _asNumber(choice.circumstanceMod ?? 0);
        const situationalMods = _collectDefenseSensorySituationalMods(choice);
        const tn = computeTN({
          actor: defender,
          role: "defender",
          defenseType: choice.defenseType,
          styleUuid: choice.styleUuid ?? choice.styleId ?? null,
          manualMod,
          circumstanceMod,
          situationalMods,
          context: {
            opponentUuid: attacker?.uuid ?? null,
            attackMode: data.context?.attackMode ?? "melee",
            movementAction: defenderMovementAction
          }
        });

        data.defender.target = tn.finalTN;
        const declaredMod = (Number(manualMod) || 0) + (Number(circumstanceMod) || 0);
        data.defender.targetLabel = declaredMod
          ? `${tn.finalTN} (${declaredMod >= 0 ? "+" : ""}${declaredMod})`
          : `${tn.finalTN}`;
        data.defender.tn = tn;

        _logDebug("defenderCommit", {
          defenderUuid: data.defender.actorUuid,
          attackerUuid: data.attacker.actorUuid,
          defenseType: data.defender.defenseType,
          tn
        });

        // Defender "none" is not expected via the dialog, but keep deterministic.
        if (choice.defenseType === "none") {
          data.defender.noDefense = true;
          data.defender.defenseType = "none";
          data.defender.label = "No Defense";
          data.defender.testLabel = "No Defense";
          data.defender.defenseLabel = "No Defense";
          data.defender.target = 0;
          data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
          data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        }

        data.defender.banked = data.defender.banked ?? {};
        data.defender.banked.committed = true;
        data.defender.banked.committedAt = Date.now();
        data.defender.banked.committedBy = game.user.id;

        // Auto-request GM roll when both sides are committed and a GM is online.
        const b = _getBankCommitState(data);
        if (b.bothCommitted) {
          data.context = data.context ?? {};
          if (!data.context.autoRollRequested) {
            data.context.autoRollRequested = true;
            data.context.autoRollRequestedAt = Date.now();
            data.context.autoRollRequestedBy = game.user.id;
          }
        }

        await _updateCard(message, data);

        return;
      }

      // Roll committed defense lane.
      const res = await doTestRoll(defender, { rollFormula: "1d100", target: Number(data.defender.target), allowLucky: true, allowUnlucky: true });

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        flavor: `${data.defender.label} — Defender Roll`,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "defender-roll", {
          commit: {
            defender: {
              defenseType: data.defender.defenseType,
              label: data.defender.label,
              defenseLabel: data.defender.defenseLabel,
              testLabel: data.defender.testLabel,
              target: data.defender.target,
              targetLabel: data.defender.targetLabel,
              tn: data.defender.tn
            }
          }
        })
      });

      // Banked-choice auto-roll: do not write roll results directly into the parent card.
      // The roll chat message will be banked into the parent card by the createChatMessage hook.
      return;
    }
    // --- Defender: No Defense ---
    if (action === "defender-nodefense") {
      if (data.defender.result || data.defender.noDefense) return;
      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to choose defender actions.");
        return;
      }

      data.defender.noDefense = true;
      data.defender.defenseType = "none";
      data.defender.label = "No Defense";
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
      data.defender.target = 0;
      data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

      _logDebug("defenderNoDefense", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid
      });

      // Create a lightweight workflow marker message so an active GM (or the card author
      // if no GM is present) can reliably bank the defender choice into the parent card.
      // This is required because ChatMessage update permissions are restrictive for
      // non-GM users editing another user's message.
      try {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          content: `<div class="ues-opposed-card" style="padding:6px;"><b>No Defense</b> declared.</div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "defender-nodefense")
        });
      } catch (err) {
        console.warn("UESRPG | opposed-workflow | failed to create defender-nodefense marker", err);
      }

      await _updateCard(message, data);
    }

    // --- Defender Roll ---
    if (action === "defender-roll") {
      if (data.defender.result || data.defender.noDefense) return;

      // CORRECTED: Feint gating - force No Defense if Feinted by this specific attacker
      const feintedEffect = defender.effects.find(e => 
        !e.disabled && 
        (e?.flags?.uesrpg?.key === "feinted" || e?.flags?.["uesrpg-3ev4"]?.condition?.key === "feinted")
      );

      if (feintedEffect) {
        const feintedByUuid = feintedEffect?.flags?.uesrpg?.attackerUuid ?? 
                              feintedEffect?.flags?.["uesrpg-3ev4"]?.condition?.attackerUuid;
        
        if (feintedByUuid && feintedByUuid === attacker.uuid) {
          // RAW: treat next melee attack as if attacker were Hidden
          // Implementation: force No Defense
          data.defender.noDefense = true;
          data.defender.defenseType = "none";
          data.defender.label = "No Defense (Feinted)";
          data.defender.testLabel = "No Defense";
          data.defender.defenseLabel = "No Defense";
          data.defender.target = 0;
          data.defender.tn = {
            finalTN: 0,
            baseTN: 0,
            totalMod: 0,
            breakdown: [{ key: "base", label: "No Defense (Feinted)", value: 0, source: "base" }]
          };
          data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

          await _updateCard(message, data);

          // Remove Feinted after it's been used
          const { removeCondition } = await import("../conditions/condition-engine.js");
          await removeCondition(defender, "feinted");

          ui.notifications.info(`${defender.name} is Feinted and cannot defend against ${attacker.name}!`);
          return;
        }
      }

      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to roll for the defender.");
        return;
      }

      // Chapter 5 (Restrained): cannot defend.
      if (hasCondition(defender, "restrained")) {
        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = "No Defense (Restrained)";
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: "No Defense (Restrained)", value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        await _updateCard(message, data);
        return;
      }

      // Chapter 5 (Hidden): if the attacker struck from Hidden, the defender cannot attempt defense.
      if (data.context?.attackFromHidden === true) {
        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = "No Defense (Hidden)";
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: "No Defense (Hidden)", value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        await _updateCard(message, data);
        return;
      }



      const defenderMovementAction = _getTokenMovementAction(dToken);


      // Attacker weapon traits can restrict eligible defense options (e.g., Flail cannot be parried/countered).
      // Keep this deterministic and schema-safe.
      const { attackerWeaponTraits, defenderHasSmallWeapon } = await _getDefenseGatingContext({ attacker, defender, data });

      const choice = await DefenseDialog.show(defender, {
        attackerContext: data.attacker,
        attackerWeaponTraits,
        defenderHasSmallWeapon,
        context: {
          opponentUuid: attacker?.uuid ?? null,
          attackMode: data.context?.attackMode ?? "melee",
          movementAction: defenderMovementAction
        }
      });
      if (!choice) return;

      // Defense option availability normalization (single canonical rules-layer).
      // This is a defensive server-side validation: UI already prevents illegal selection,
      // but we do not trust client-side input.
      try {
        const availability = computeDefenseAvailability({
          attackMode: data.context?.attackMode ?? "melee",
          attackerWeaponTraits,
          defenderHasSmallWeapon,
          defenderHasShield: hasEquippedShield(defender)
        });
        const requested = String(choice.defenseType ?? "evade");
        const normalized = normalizeDefenseType(requested, availability, "evade");
        if (normalized !== requested) {
          ui.notifications.warn("Selected defense option is not available for this attack. Defaulting to Evade.");
          choice.defenseType = "evade";
          choice.label = "Evade";
          choice.styleUuid = null;
          choice.styleId = null;
        }
      } catch (err) {
        console.warn("UESRPG | opposed-workflow | defense option normalization failed", err);
      }

      // RAW: Defensive reactions cost Action Points unless an explicit feature states otherwise.

      // Default: any defense choice other than No Defense costs 1 AP.

      // Spend immediately upon selecting the defense choice to prevent later desync.

      if (choice.defenseType && choice.defenseType !== "none") {

        const ok = await ActionEconomy.spendAP(defender, 1, { reason: `reaction:${choice.defenseType}`, silent: true });

        if (!ok) {

          ui.notifications.warn(`${defender.name} does not have enough Action Points to perform a defensive reaction. Choose No Defense instead.`);

          return;

        }

      }


      if (choice.defenseType && choice.defenseType !== "none") {

        // RAW: Any reaction other than continuing to Aim or firing breaks the Aim chain.

        await _breakAimChainIfPresent(defender);

      }
      data.defender.defenseType = choice.defenseType;
      // label is used for roll flavor (e.g. "Parry — Defender Roll")
      data.defender.label = choice.label;
      data.defender.defenseLabel = choice.label;

      // For the chat card, "Test" must reflect the *actual test rolled*:
      //  - Evade: Evade
      //  - Parry/Block/Counter: the chosen Combat Style/Profession item name
      if (choice.defenseType === "evade") {
        data.defender.testLabel = "Evade";
      } else if (choice.styleUuid || choice.styleId) {
        const styleUuid = choice.styleUuid ?? choice.styleId;
        const styles = listCombatStyles(defender);
        const style = styles.find(s => s.uuid === styleUuid) ?? null;
        data.defender.testLabel = style?.name ?? "(Combat Style)";
      } else {
        // Fallback: keep something readable rather than repeating the defense label.
        data.defender.testLabel = "(Combat Style)";
      }

      const manualMod = _asNumber(choice.manualMod ?? 0);
      const circumstanceMod = _asNumber(choice.circumstanceMod ?? 0);
      const situationalMods = _collectDefenseSensorySituationalMods(choice);
      const tn = computeTN({
        actor: defender,
        role: "defender",
        defenseType: choice.defenseType,
        styleUuid: choice.styleUuid ?? choice.styleId ?? null,
        manualMod,
        circumstanceMod,
	        situationalMods,
        context: {
          opponentUuid: attacker?.uuid ?? null,
          attackMode: data.context?.attackMode ?? "melee",
          movementAction: defenderMovementAction
        }
      });

      data.defender.target = tn.finalTN;
      const declaredMod = (Number(manualMod) || 0) + (Number(circumstanceMod) || 0);
      data.defender.targetLabel = declaredMod
        ? `${tn.finalTN} (${declaredMod >= 0 ? "+" : ""}${declaredMod})`
        : `${tn.finalTN}`;
      data.defender.tn = tn;

      _logDebug("defenderDeclare", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid,
        defenseType: data.defender.defenseType,
        tn
      });

      // Defender "none" is handled by the separate button, but keep safe.
      if (choice.defenseType === "none") {
        data.defender.noDefense = true;
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        await _updateCard(message, data);
      } else {
        const res = await doTestRoll(defender, { rollFormula: "1d100", target: data.defender.target, allowLucky: true, allowUnlucky: true });
        // IMPORTANT: The defender may not have permission to update the parent opposed card
        // (ChatMessage authored by the attacker). We therefore include the computed TN and
        // defense choice metadata in the roll message flags so the GM/author banking hook can
        // accurately commit the defender lane into the parent card.
        await res.roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          flavor: `${data.defender.label} — Defender Roll`,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "defender-roll", {
            commit: {
              defender: {
                defenseType: data.defender.defenseType,
                label: data.defender.label,
                defenseLabel: data.defender.defenseLabel,
                testLabel: data.defender.testLabel,
                target: data.defender.target,
                targetLabel: data.defender.targetLabel,
                tn: data.defender.tn
              }
            }
          })
        });

        data.defender.result = {
          rollTotal: res.rollTotal,
          target: res.target,
          isSuccess: res.isSuccess,
          degree: res.degree,
          textual: res.textual,
          isCriticalSuccess: res.isCriticalSuccess,
          isCriticalFailure: res.isCriticalFailure
        };

        // Dueling Weapon: grants +1 Degree of Success on successful Parry or Counter-Attack.
        if (res.isSuccess && (choice.defenseType === "parry" || choice.defenseType === "counter")) {
          try {
            const defWUuid = _getPreferredWeaponUuid(defender, { meleeOnly: true }) || "";
            if (defWUuid) {
              const defW = await fromUuid(defWUuid);
              if (defW?.type === "weapon" && _weaponHasQuality(defW, "dueling")) {
                data.defender.result.degree = Math.max(1, (Number(data.defender.result.degree) || 1) + 1);
                data.defender.result.duelingBonus = 1;
                // Keep the displayed DoS/DoF string consistent with the modified degree.
                data.defender.result.textual = data.defender.result.isSuccess
                  ? `${data.defender.result.degree} DoS`
                  : `${data.defender.result.degree} DoF`;
              }
            }
          } catch (err) {
            console.warn("UESRPG | opposed-workflow | dueling weapon bonus lookup failed", err);
          }
        }
        await _updateCard(message, data);
      }
    }

    // --- Damage Roll (attacker won) ---
    if (action === "damage-roll") {
      const ok = await _ensureResolvedForPostActions(message, data);
      if (!ok) {
        ui.notifications.warn("Damage cannot be rolled until the opposed test is resolved.");
        return;
      }
      if (data.outcome?.winner !== "attacker") {
        ui.notifications.warn("Damage can only be rolled when the attacker wins the opposed test.");
        return;
      }
      if (!_canControlActor(attacker) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to roll damage for this attacker.");
        return;
      }

      const attackMode = getContextAttackMode(data.context);
      const advCount = (attackMode === "melee") ? Number(data.advantage?.attacker ?? 0) : 0;
      const defenderActor = _resolveDoc(data?.defender?.actorUuid);
      const baseHitLocation = resolveHitLocationForTarget(defenderActor, getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 0));
      const selection = await _promptWeaponAndAdvantages({
        attackerActor: attacker,
        attackMode,
        advantageCount: advCount,
        defaultWeaponUuid: data.context?.lastWeaponUuid ?? _getPreferredWeaponUuid(attacker, { meleeOnly: false }) ?? null,
        defaultHitLocation: baseHitLocation,
      });
      if (!selection) return;

      // Record Advantage spend selections (including Special Actions) for downstream automation/rendering.
      data.advantageResolution = data.advantageResolution ?? {};
      data.advantageResolution.attacker = {
        precisionStrike: Boolean(selection.precisionStrike),
        precisionLocation: String(selection.precisionLocation ?? ""),
        penetrateArmor: Boolean(selection.penetrateArmor),
        forcefulImpact: Boolean(selection.forcefulImpact),
        pressAdvantage: Boolean(selection.pressAdvantage),
        specialActionsSelected: Array.isArray(selection.specialActionsSelected) ? selection.specialActionsSelected.slice() : []
      };
      await _updateCard(message, data);

      const weapon = await fromUuid(selection.weaponUuid);
      if (!weapon) {
        ui.notifications.warn("Selected weapon could not be resolved.");
        return;
      }

      // Persist last weapon for convenience within this single opposed workflow.
      data.context = data.context ?? {};
      data.context.lastWeaponUuid = weapon.uuid;
      await _updateCard(message, data);

      if (selection.pressAdvantage && attackMode === "melee") {
        const defenderActor = _resolveDoc(data?.defender?.actorUuid);
        await _applyPressAdvantageEffect(attacker, defenderActor, { attackerTokenUuid: data.attacker?.tokenUuid ?? null, defenderTokenUuid: data.defender?.tokenUuid ?? null });
      }

      // Execute Special Advantage automation (free + auto-win)
      if (Array.isArray(selection.specialActionsSelected) && selection.specialActionsSelected.length > 0) {
        try {
          const { showSpecialAdvantageDialog, executeSpecialAction } = await import("./special-actions-helper.js");
          const defenderActor = _resolveDoc(data?.defender?.actorUuid);
          
          for (const saId of selection.specialActionsSelected) {
            const choice = await showSpecialAdvantageDialog(saId);
            if (!choice) continue;

            if (choice.mode === "autowin") {
              // Auto-Win: consume 1 AP, skip test, auto-succeed
              const { ActionEconomy } = await import("./action-economy.js");
              const def = getSpecialActionById(saId);
              await ActionEconomy.spendAP(attacker, 1, { 
                reason: `Special Advantage: ${def?.name} (Auto-Win)`, 
                silent: false 
              });

              const result = await executeSpecialAction({
                specialActionId: saId,
                actor: attacker,
                target: defenderActor ?? null,
                isAutoWin: true,
                opposedResult: { winner: "attacker" }
              });

              if (result.success) {
                await ChatMessage.create({
                  user: game.user.id,
                  speaker: ChatMessage.getSpeaker({ actor: attacker }),
                  content: `<div class="uesrpg-special-action-advantage"><b>Special Advantage (Auto-Win):</b><p>${result.message}</p></div>`,
                  style: CONST.CHAT_MESSAGE_STYLES.OTHER
                });
              }
            } else if (choice.mode === "free") {
              // Free Action: 0 AP, initiate test with dropdown selection
              const attackerTokenUuid = data.attacker?.tokenUuid ?? null;
              const defenderTokenUuid = data.defender?.tokenUuid ?? null;
              const attackerToken = attackerTokenUuid ? fromUuidSync(attackerTokenUuid)?.object : null;
              const defenderToken = defenderTokenUuid ? fromUuidSync(defenderTokenUuid)?.object : null;

              if (attackerToken && defenderToken) {
                const { SkillOpposedWorkflow } = await import("../skills/opposed-workflow.js");
                const def = getSpecialActionById(saId);
                
                const message = await SkillOpposedWorkflow.createPending({
                  attackerTokenUuid: attackerToken?.document?.uuid ?? attackerToken?.uuid,
                  defenderTokenUuid: defenderToken?.document?.uuid ?? defenderToken?.uuid,
                  attackerSkillUuid: null,  // Let user choose from dropdown in card
                  attackerSkillLabel: `${def?.name} (Special Action)`
                });

                const state = message?.flags?.["uesrpg-3ev4"]?.skillOpposed?.state;
                if (state) {
                  state.specialActionId = saId;
                  state.allowCombatStyle = true;
                  state.isFreeAction = true;

                  await message.update({
                    flags: {
                      "uesrpg-3ev4": {
                        skillOpposed: {
                          version: state.version ?? 1,
                          state
                        }
                      }
                    }
                  });
                }

                ui.notifications.info(`Special Advantage: ${def?.name} used as free action.`);
              }
            }
          }
        } catch (err) {
          console.error("UESRPG | Failed to execute Special Advantage automation", err);
        }
      }

      // Hit location RAW: ones digit of attack roll, unless Precision Strike is used.
      const hitLocationRaw = (advCount > 0 && selection.precisionStrike)
        ? selection.precisionLocation
        : getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 0);
      const hitLocation = resolveHitLocationForTarget(defenderActor, hitLocationRaw);

      const dmg = await _rollWeaponDamage({ weapon, preConsumedAmmo: data.attacker?.preConsumedAmmo ?? null });
      if (!dmg) return;
      const damageType = getDamageTypeFromWeapon(weapon);

      // Render a weapon damage chat card, gated by the opposed result.
      const pillsInline = (() => {
        const injected = Array.isArray(weapon.system?.qualitiesStructuredInjected)
          ? weapon.system.qualitiesStructuredInjected
          : Array.isArray(weapon.system?.qualitiesStructured)
            ? weapon.system.qualitiesStructured
            : [];

        const labelIndex = (() => {
          const core = UESRPG?.QUALITIES_CORE_BY_TYPE?.weapon ?? UESRPG?.QUALITIES_CATALOG ?? [];
          const traits = UESRPG?.TRAITS_BY_TYPE?.weapon ?? [];
          const idx = new Map();
          for (const q of [...core, ...traits, ...(UESRPG?.QUALITIES_CATALOG ?? [])]) {
            if (!q?.key) continue;
            idx.set(String(q.key).toLowerCase(), String(q.label ?? q.key));
          }
          return idx;
        })();

        const out = [];
        for (const q of injected) {
          const key = String(q?.key ?? q ?? "").toLowerCase().trim();
          if (!key) continue;
          const label = labelIndex.get(key) ?? key;
          const v = (q?.value !== undefined && q?.value !== null && q?.value !== "") ? Number(q.value) : null;
          out.push(`<span class="tag">${v != null && !Number.isNaN(v) ? `${label} (${v})` : label}</span>`);
        }
        const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
        for (const t of traits) {
          const key = String(t ?? "").toLowerCase().trim();
          if (!key) continue;
          const label = labelIndex.get(key) ?? key;
          out.push(`<span class="tag">${label}</span>`);
        }
        if (!out.length) return '<span style="opacity:0.75;">—</span>';
        return `<span class="uesrpg-inline-tags">${out.join("")}</span>`;
      })();

      const extraNotes = (() => {
        const notes = [];
        if (dmg?.damagedValue && Number(dmg.damagedValue) > 0) notes.push(`Damaged: -${Number(dmg.damagedValue)}`);
        if (dmg?.rerollMode === "primitive") notes.push("Primitive: take lower");
        else if (dmg?.rerollMode === "proven") notes.push("Proven: take higher");
        return notes.length ? `<div style="margin-top:0.15rem;">${notes.join('<br>')}</div>` : "";
      })();

      const altTag = dmg.rollB
        ? `<div style="margin-top:0.25rem;font-size:x-small;line-height:1.2;">Roll A: ${dmg.rollA.total}<br>Roll B: ${dmg.rollB.total}${extraNotes}</div>`
        : (extraNotes ? `<div style="margin-top:0.25rem;font-size:x-small;line-height:1.2;">${extraNotes}</div>` : "");

      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${defender.uuid}"
        data-attacker-actor-uuid="${attacker.uuid}"
        data-weapon-uuid="${weapon.uuid}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${hitLocation}"
        data-dos-bonus="0"
        data-penetration="0"
        data-penetrate-armor="${selection.penetrateArmor ? "1" : "0"}"
	        data-forceful-impact="${selection.forcefulImpact ? "1" : "0"}"
	        data-press-advantage="${selection.pressAdvantage ? "1" : "0"}"
        data-source="${weapon.name}">
        Apply Damage → ${dToken?.name ?? defender.name}
      </button>`;

      const cardHtml = `
        <div class="uesrpg-weapon-damage-card">
          <h2 style="display:flex;gap:0.5rem;align-items:center;">
            <img src="${weapon.img}" style="height:32px;width:32px;">
            <div>${weapon.name}</div>
          </h2>

          <table class="uesrpg-weapon-damage-table">
            <thead>
              <tr>
                <th>Damage</th>
                <th class="tableCenterText">Result</th>
                <th class="tableCenterText">Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="tableAttribute">Damage</td>
                <td class="tableCenterText">${dmg.finalDamage}${altTag}</td>
                <td class="tableCenterText">
                  <div>${dmg.damageString}</div>
                  <div style="margin-top:0.35rem;">${pillsInline}</div>
                </td>
              </tr>
              <tr>
                <td class="tableAttribute">Hit Location</td>
                <td class="tableCenterText">${hitLocation}</td>
                <td class="tableCenterText">from attack roll</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
            ${applyBtn}
          </div>
        </div>
      `;

      const damageFlags = _opposedFlags(message.id, "damage-card");
const dmgMsg = await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        content: cardHtml,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rolls: [dmg.rollA, dmg.rollB].filter(Boolean),
        rollMode: game.settings.get("core", "rollMode"),
        flags: damageFlags,
      });
      return;
    }

    // --- Damage Roll (defender won via counter-attack) ---
    if (action === "counter-damage-roll") {
      const ok = await _ensureResolvedForPostActions(message, data);
      if (!ok) {
        ui.notifications.warn("Counter-attack damage cannot be rolled until the opposed test is resolved.");
        return;
      }

      let defenseType = String(data.defender?.defenseType ?? "").toLowerCase();
      if (defenseType !== "counter") {
        const lbl = String(data.defender?.defenseLabel ?? data.defender?.label ?? "").toLowerCase();
        if (lbl.includes("counter")) {
          data.defender = data.defender ?? {};
          data.defender.defenseType = "counter";
          defenseType = "counter";
          await _updateCard(message, data);
        }
      }

      if (data.outcome?.winner !== "defender" || defenseType !== "counter") {
        ui.notifications.warn("Counter-attack damage can only be rolled when the defender wins via Counter-Attack.");
        return;
      }
      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to roll damage for this defender.");
        return;
      }

      const advCount = Number(data.advantage?.defender ?? 0);
      const targetActor = _resolveDoc(data?.attacker?.actorUuid) ?? attacker;
      const baseHitLocation = resolveHitLocationForTarget(targetActor, getHitLocationFromRoll(data.defender?.result?.rollTotal ?? 0));
      const selection = await _promptWeaponAndAdvantages({
        attackerActor: defender,
        advantageCount: advCount,
        defaultWeaponUuid: data.context?.lastDefenderWeaponUuid ?? _getPreferredWeaponUuid(defender, { meleeOnly: true }) ?? null,
        defaultHitLocation: baseHitLocation,
      });
      if (!selection) return;

      const weapon = await fromUuid(selection.weaponUuid);
      if (!weapon) {
        ui.notifications.warn("Selected weapon could not be resolved.");
        return;
      }

      // Persist last defender weapon for convenience within this single opposed workflow.
      data.context = data.context ?? {};
      data.context.lastDefenderWeaponUuid = weapon.uuid;
      await _updateCard(message, data);

      // Press Advantage: if the counter-attacker spends Advantage here, the benefit belongs to the defender
      // (the striker in this counter-damage roll) against the original attacker.
      // This mirrors the attacker-win damage flow, which applies Press Advantage immediately upon selection.
      const attackMode = getContextAttackMode(data.context);
      if (selection.pressAdvantage && attackMode === "melee") {
        try {
          // Counter-attack is only legal against melee attacks; still guard defensively.
          await _applyPressAdvantageEffect(
            defender,
            targetActor,
            {
              attackerTokenUuid: data.defender?.tokenUuid ?? null,
              defenderTokenUuid: data.attacker?.tokenUuid ?? null
            }
          );
        } catch (err) {
          console.warn("UESRPG | Failed to apply Press Advantage on counter-attack damage selection", err);
        }
      }

      // Hit location RAW: ones digit of counter-attack roll, unless Precision Strike is used.
      const hitLocationRaw = (advCount > 0 && selection.precisionStrike)
        ? selection.precisionLocation
        : getHitLocationFromRoll(data.defender?.result?.rollTotal ?? 0);
      const hitLocation = resolveHitLocationForTarget(targetActor, hitLocationRaw);

      const dmg = await _rollWeaponDamage({ weapon, preConsumedAmmo: data.attacker?.preConsumedAmmo ?? null });
      if (!dmg) return;
      const damageType = getDamageTypeFromWeapon(weapon);

      // Counter-attack: defender is the striker, original attacker is the target.
      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${attacker.uuid}"
        data-attacker-actor-uuid="${defender.uuid}"
        data-weapon-uuid="${weapon.uuid}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${hitLocation}"
        data-dos-bonus="0"
        data-penetration="0"
        data-penetrate-armor="${selection.penetrateArmor ? "1" : "0"}"
        data-forceful-impact="${selection.forcefulImpact ? "1" : "0"}"
        data-press-advantage="${selection.pressAdvantage ? "1" : "0"}"
        data-source="${weapon.name}">
        Apply Damage → ${aToken?.name ?? attacker.name}
      </button>`;

      await _postWeaponDamageChatCard({
        attacker: defender,
        aToken: dToken,
        weapon,
        dmg,
        hitLocation,
        applyButtonHtml: applyBtn,
        extraNoteHtml: `<b>Strike:</b> Counter-Attack against ${aToken?.name ?? attacker.name}`,
        parentMessageId: message.id,
        stage: "counter-damage-card",
      });

      return;
    }

    // --- Resolve Advantage (defender won via successful defense) ---
    if (action === "defender-advantage") {
      const resolvedOk = await _ensureResolvedForPostActions(message, data);
      if (!resolvedOk) {
        ui.notifications.warn("Defender Advantage can only be resolved after the opposed test is resolved and the defender wins.");
        return;
      }

      if (!data.outcome || data.status !== "resolved" || data.outcome?.winner !== "defender") {
        ui.notifications.warn("Defender Advantage can only be resolved after the opposed test is resolved and the defender wins.");
        return;
      }
      // If the defender chose No Defense, they are treated as having failed and cannot utilize Advantage.
      if (data.defender?.noDefense === true || String(data.defender?.defenseType ?? "none") === "none") {
        ui.notifications.warn("No Defense was chosen; defender cannot resolve Advantage.");
        return;
      }
      // Counter-Attack and Block have their own dedicated resolution actions.
      const dt = String(data.defender?.defenseType ?? "none");
      if (dt === "counter" || dt === "block") {
        ui.notifications.warn("This defense type has a dedicated resolution action.");
        return;
      }

      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to resolve Advantage for this defender.");
        return;
      }

      const advCount = Number(data.advantage?.defender ?? 0);
      if (!Number.isFinite(advCount) || advCount <= 0) {
        ui.notifications.warn("No Advantage is available to resolve for the defender.");
        return;
      }

      // Prevent double-resolution.
      data.defenderAdvantage = data.defenderAdvantage ?? {};
      if (data.defenderAdvantage.resolved === true || data.advantageSpent?.defender === true) {
        ui.notifications.warn("Defender Advantage has already been resolved.");
        return;
      }

      const attacker = _resolveDoc(data?.attacker?.actorUuid);
      if (!attacker) {
        ui.notifications.warn("Attacker could not be resolved.");
        return;
      }

      const choice = await _promptDefenderAdvantage({
        defenderActor: defender,
        attackerActor: attacker,
        advantageCount: advCount
      });

      // If the dialog was closed, do not mark as spent.
      if (!choice) return;

      data.advantageSpent = data.advantageSpent ?? {};
      data.advantageResolution = data.advantageResolution ?? {};
      data.advantageSpent.defender = true;
      data.advantageResolution.defender = { 
        overextend: Boolean(choice.overextend), 
        overwhelm: Boolean(choice.overwhelm),
        specialActionsSelected: Array.isArray(choice.specialActionsSelected) ? choice.specialActionsSelected.slice() : []
      };

      data.defenderAdvantage = {
        resolved: true,
        choice: { 
          overextend: Boolean(choice.overextend), 
          overwhelm: Boolean(choice.overwhelm),
          specialActionsSelected: Array.isArray(choice.specialActionsSelected) ? choice.specialActionsSelected.slice() : []
        },
        resolvedAt: Date.now(),
        resolvedBy: game.user.id,
      };

      await _updateCard(message, data);

      // Apply mechanical effects now (only when Resolve Advantage is clicked).
      if (choice.overextend) {
        await _applyOverextendEffect(attacker, {
          defenderUuid: defender.uuid,
          defenderTokenUuid: data.defender?.tokenUuid ?? null,
          opponentTokenUuid: data.attacker?.tokenUuid ?? null
        });
      }
      if (choice.overwhelm) {
        await _applyOverwhelmEffect(attacker, { defenderUuid: defender.uuid });
      }

      // Execute Special Advantage automation for defender (free + auto-win)
      if (Array.isArray(choice.specialActionsSelected) && choice.specialActionsSelected.length > 0) {
        try {
          const { showSpecialAdvantageDialog, executeSpecialAction } = await import("./special-actions-helper.js");
          
          for (const saId of choice.specialActionsSelected) {
            const advChoice = await showSpecialAdvantageDialog(saId);
            if (!advChoice) continue;

            if (advChoice.mode === "autowin") {
              // Auto-Win: consume 1 AP, skip test, auto-succeed
              const { ActionEconomy } = await import("./action-economy.js");
              const def = getSpecialActionById(saId);
              await ActionEconomy.spendAP(defender, 1, { 
                reason: `Special Advantage: ${def?.name} (Auto-Win)`, 
                silent: false 
              });

              const result = await executeSpecialAction({
                specialActionId: saId,
                actor: defender,
                target: attacker ?? null,
                isAutoWin: true,
                opposedResult: { winner: "defender" }
              });

              if (result.success) {
                await ChatMessage.create({
                  user: game.user.id,
                  speaker: ChatMessage.getSpeaker({ actor: defender }),
                  content: `<div class="uesrpg-special-action-advantage"><b>Special Advantage (Auto-Win):</b><p>${result.message}</p></div>`,
                  style: CONST.CHAT_MESSAGE_STYLES.OTHER
                });
              }
            } else if (advChoice.mode === "free") {
              // Free Action: 0 AP, initiate test with dropdown selection
              const attackerTokenUuid = data.attacker?.tokenUuid ?? null;
              const defenderTokenUuid = data.defender?.tokenUuid ?? null;
              const attackerToken = attackerTokenUuid ? fromUuidSync(attackerTokenUuid)?.object : null;
              const defenderToken = defenderTokenUuid ? fromUuidSync(defenderTokenUuid)?.object : null;

              // Defender initiates, so swap attacker/defender roles
              if (attackerToken && defenderToken) {
                const { SkillOpposedWorkflow } = await import("../skills/opposed-workflow.js");
                const def = getSpecialActionById(saId);
                
                const message = await SkillOpposedWorkflow.createPending({
                  attackerTokenUuid: defenderToken?.document?.uuid ?? defenderToken?.uuid,
                  defenderTokenUuid: attackerToken?.document?.uuid ?? attackerToken?.uuid,
                  attackerSkillUuid: null,  // Let user choose from dropdown in card
                  attackerSkillLabel: `${def?.name} (Special Action)`
                });

                const state = message?.flags?.["uesrpg-3ev4"]?.skillOpposed?.state;
                if (state) {
                  state.specialActionId = saId;
                  state.allowCombatStyle = true;
                  state.isFreeAction = true;

                  await message.update({
                    flags: {
                      "uesrpg-3ev4": {
                        skillOpposed: {
                          version: state.version ?? 1,
                          state
                        }
                      }
                    }
                  });
                }

                ui.notifications.info(`Special Advantage: ${def?.name} used as free action.`);
              }
            }
          }
        } catch (err) {
          console.error("UESRPG | Failed to execute Special Advantage automation", err);
        }
      }

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        content: `<div class="ues-opposed-card" style="padding:6px;">
          <b>Defender Advantage Resolved.</b>
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "defender-advantage"),
      });

      return;
    }

    // --- Resolve Block (defender won via block) ---
    if (action === "block-resolve") {
      const resolvedOk = await _ensureResolvedForPostActions(message, data);
      if (!resolvedOk) {
        ui.notifications.warn("Block resolution is only available when the opposed test is resolved.");
        return;
      }

      if (data.status !== "resolved" || data.outcome?.winner !== "defender" || (data.defender.defenseType ?? "none") !== "block") {
        ui.notifications.warn("Block resolution is only available when the defender wins by blocking.");
        return;
      }
      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to resolve this block.");
        return;
      }

      const shields = _listEquippedShields(defender);
      const shield = shields[0] ?? null;
      if (!shield) {
        ui.notifications.warn("No equipped shield found on the defender.");
        return;
      }

      // Roll the incoming attack damage (attacker weapon selection).
      const selection = await _promptWeaponAndAdvantages({
        attackerActor: attacker,
        attackMode: data.context?.attackMode ?? "melee",
        advantageCount: 0,
        defaultWeaponUuid: data.context?.lastWeaponUuid ?? _getPreferredWeaponUuid(attacker, { meleeOnly: false }) ?? null,
      });
      if (!selection) return;

      const weapon = await fromUuid(selection.weaponUuid);
      if (!weapon) {
        ui.notifications.warn("Selected weapon could not be resolved.");
        return;
      }

      const dmg = await _rollWeaponDamage({ weapon, preConsumedAmmo: data.attacker?.preConsumedAmmo ?? null });
      if (!dmg) return;
      const damageType = getDamageTypeFromWeapon(weapon);
      // Always post the weapon damage card so the chat log retains hit-location context,
      // even when the defender wins by blocking.
      const hitLocation = resolveHitLocationForTarget(defender, getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 100));
      await _postWeaponDamageChatCard({
        attacker,
        aToken,
        weapon,
        dmg,
        hitLocation,
        extraNoteHtml: `<b>Defense:</b> Block (${shield?.name ?? "Shield"})`,
        parentMessageId: message.id,
        stage: "block-damage-card",
      });
      let br = getBlockValue(shield, damageType);
      
      // Check for Power Block stamina effect (only for physical damage)
      const powerBlockEffect = getActiveStaminaEffect(defender, STAMINA_EFFECT_KEYS.POWER_BLOCK);
      const isPowerBlockActive = powerBlockEffect && String(damageType).toLowerCase() === DAMAGE_TYPES.PHYSICAL;
      if (isPowerBlockActive) {
        const originalBR = br;
        br = br * 2;
        await consumeStaminaEffect(defender, STAMINA_EFFECT_KEYS.POWER_BLOCK, {
          message: `Shield BR doubled: ${originalBR} → ${br} (physical damage only)`
        });
      }
      
      const shieldSplitter = _weaponHasQuality(weapon, "shieldSplitter");
      if (shieldSplitter) br = Math.max(0, Math.ceil(_asNumber(br) / 2));
      const blocked = dmg.finalDamage <= br;

      if (blocked) {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          content: `<div class="ues-opposed-card" style="padding:6px;">
            <b>Block:</b> Incoming damage <b>${dmg.finalDamage}</b> does not exceed Block Rating <b>${br}</b>${shieldSplitter ? ' (Shield Splitter applied)' : ''}. No damage taken.
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "block-result"),
        });
        return;
      }

      // RAW: if damage exceeds BR, take full damage to shield arm.
      const shieldArm = "Left Arm";

      const resolvedShieldArm = resolveHitLocationForTarget(defender, shieldArm);

      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${defender.uuid}"
        data-attacker-actor-uuid="${attacker.uuid}"
        data-weapon-uuid="${weapon.uuid}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${resolvedShieldArm}"
        data-dos-bonus="0"
        data-penetration="0"
        data-source="${weapon.name}">
        Apply Block Damage → ${dToken?.name ?? defender.name}
      </button>`;

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        content: `<div class="uesrpg-weapon-damage-card">
          <h2 style="margin:0 0 0.25rem 0;">Block Penetrated</h2>
          <div style="opacity:0.9; margin-bottom:0.5rem;">Incoming damage <b>${dmg.finalDamage}</b> exceeds Block Rating <b>${br}</b>${shieldSplitter ? ' (Shield Splitter applied)' : ''} (${shield?.name ?? "No Shield"}).</div>
          ${applyBtn}
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "block-penetrated"),
      });
      return;
    }

    // --- Resolve ---
    if (data.attacker.result && data.defender.result && !data.outcome) {
      const outcome = _resolveOutcomeRAW(data);
      data.outcome = outcome ?? { winner: "tie", text: "" };
      data.advantage = _computeAdvantageRAW(data, data.outcome);
      data.status = "resolved";
      data.context = data.context ?? {};
      data.context.phase = "resolved";
      if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
      _cleanupAutoRollContext(data.context);

      _logDebug("resolve", {
        attackerUuid: data.attacker.actorUuid,
        defenderUuid: data.defender.actorUuid,
        outcome: data.outcome,
        advantage: data.advantage,
        attackerResult: data.attacker
          ? { rollTotal: data.attacker.result?.rollTotal, isSuccess: data.attacker.result?.isSuccess, degree: data.attacker.result?.degree }
          : null,
        defenderResult: data.defender
          ? { rollTotal: data.defender.result?.rollTotal, isSuccess: data.defender.result?.isSuccess, degree: data.defender.result?.degree, noDefense: data.defender.noDefense }
          : null
      });

      await _updateCard(message, data);
    }
  }
};