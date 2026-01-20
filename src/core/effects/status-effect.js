/**
 * Create or update a "status-like" ActiveEffect in a consistent way so token icon/HUD behavior
 * remains deterministic (statusId + statuses + core.statusId + icon).
 *
 * Foundry VTT v13 compatible.
 */

import { requestCreateEmbeddedDocuments, requestUpdateDocument } from "../../utils/authority-proxy.js";

export async function createOrUpdateStatusEffect(actor, { statusId, name, img, duration = null, flags = {}, changes = [] } = {}) {
  if (!actor) return null;

  const sid = typeof statusId === "string" && statusId.trim().length ? statusId.trim() : null;
  const key = flags?.uesrpg?.key ? String(flags.uesrpg.key) : null;

  const isEnabled = (e) => e && !e.disabled;
  const hasStatus = (e) => {
    try {
      if (!sid) return false;
      if (e.statuses && typeof e.statuses.has === "function" && e.statuses.has(sid)) return true;
      const coreSid = e?.flags?.core?.statusId;
      return coreSid ? String(coreSid) === sid : false;
    } catch (_e) {
      return false;
    }
  };

  // Prefer canonical uesrpg key matching, then statusId matching.
  let existing = null;
  if (key) existing = actor.effects.find((e) => isEnabled(e) && e?.flags?.uesrpg?.key === key) ?? null;
  if (!existing && sid) existing = actor.effects.find((e) => isEnabled(e) && hasStatus(e)) ?? null;

  const nextIcon = img || existing?.icon || existing?.img || "icons/svg/aura.svg";
  const nextDuration = duration ?? existing?.duration ?? {};
  const nextOrigin = existing?.origin ?? actor.uuid;

  const mergedFlags = {
    ...(existing?.flags ?? {}),
    ...(flags ?? {}),
    uesrpg: {
      ...(existing?.flags?.uesrpg ?? {}),
      ...(flags?.uesrpg ?? {}),
      ...(key ? { key } : {})
    }
  };

  // Add standardized metadata for combat action effects (identified by flags.uesrpg.key)
  if (key && !mergedFlags["uesrpg-3ev4"]?.effectGroup) {
    // Combat action effects: defensiveStance, aim, powerAttack, etc.
    const combatActionKeys = new Set(["defensiveStance", "aim", "powerAttack", "powerBlock", "powerDraw"]);
    // Stamina effects: stamina-power-attack, stamina-power-block, etc.
    const isStaminaEffect = key.startsWith("stamina-");
    
    if (combatActionKeys.has(key) || isStaminaEffect) {
      if (!mergedFlags["uesrpg-3ev4"]) mergedFlags["uesrpg-3ev4"] = {};
      mergedFlags["uesrpg-3ev4"].owner = "system";
      mergedFlags["uesrpg-3ev4"].effectGroup = `combat.${key}`;
      mergedFlags["uesrpg-3ev4"].stackRule = "override";
      mergedFlags["uesrpg-3ev4"].source = "combat";
    }
  }

  if (sid) {
    mergedFlags.core = { ...(existing?.flags?.core ?? {}), ...(flags?.core ?? {}), statusId: sid };
  }

  const effectData = {
    name: name ?? existing?.name ?? "",
    icon: nextIcon,
    img: nextIcon,
    origin: nextOrigin,
    disabled: false,
    duration: nextDuration,
    changes: Array.isArray(changes) ? changes : [],
    flags: mergedFlags,
    transfer: false
  };

  if (sid) effectData.statuses = [sid];

  if (existing) {
    await requestUpdateDocument(existing, effectData);
    return existing;
  }

  const createdArr = await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [effectData]);
  const created = Array.isArray(createdArr) ? createdArr[0] : null;
  return created ?? null;
}
