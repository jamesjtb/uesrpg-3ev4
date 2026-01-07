/**
 * module/wounds/wound-engine.js
 *
 * Wound persistence + blood loss automation (Chapter 5).
 *
 * Package 1 scope:
 *  - Record wounds as ActiveEffects (amount + hit location)
 *  - Blood Loss countdown: 5 rounds until HP drops to 0 (unless stabilized / forestalled)
 *  - First Aid / Forestall effects suppress passive wound penalties (without clearing system.wounded)
 *  - Healing while wounded:
 *      - creates/extends Forestall effect for rounds = effective HP restored
 *      - if treated wounds exist, healing progress can cure them (damage amount threshold)
 *
 * Deferred intentionally:
 *  - Shock tests + cripple/maim outcomes from shock resolution
 *  - "Treat within End bonus days" timing enforcement (rest/time framework not yet present)
 */

import { doTestRoll } from "../helpers/degree-roll-helper.js";
import { requestCreateEmbeddedDocuments, requestDeleteEmbeddedDocuments, requestUpdateDocument } from "../helpers/authority-proxy.js";

let _woundHooksRegistered = false;

const FLAG_SCOPE = "uesrpg-3ev4";
const FLAG_PATH = `flags.${FLAG_SCOPE}`;


function _isDebugEnabled() {
  try {
    return Boolean(
      game.settings?.get(FLAG_SCOPE, "opposedDebug") ||
      game.settings?.get(FLAG_SCOPE, "debugSkillTN") ||
      game.settings?.get(FLAG_SCOPE, "skillRollDebug")
    );
  } catch (_e) {
    return false;
  }
}

function _dlog(...args) {
  if (!_isDebugEnabled()) return;
  console.log("UESRPG | Wounds |", ...args);
}

function _wlog(...args) {
  if (!_isDebugEnabled()) return;
  console.warn("UESRPG | Wounds |", ...args);
}

// --- Shock Test automation (Chapter 5: Advanced Mechanics) ---

const SHOCK_MAGIC_TYPES = ["fire", "frost", "shock", "poison", "magic"];

function _normalizeDamageTypeKey(dt) {
  const k = String(dt ?? "").trim().toLowerCase();
  // Treat common aliases as canonical keys.
  if (k === "electric" || k === "lightning") return "shock";
  return k;
}

function _normalizeHitLocationKey(hitLocation) {
  // Keep this local and conservative; hit location schemas can vary across sheets.
  const s = String(hitLocation ?? "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low.includes("head")) return "Head";
  if (low.includes("arm")) return low.includes("left") ? "Left Arm" : low.includes("right") ? "Right Arm" : "Arm";
  if (low.includes("leg")) return low.includes("left") ? "Left Leg" : low.includes("right") ? "Right Leg" : "Leg";
  if (low.includes("hand")) return low.includes("left") ? "Left Hand" : low.includes("right") ? "Right Hand" : "Hand";
  if (low.includes("foot") || low.includes("feet")) return low.includes("left") ? "Left Foot" : low.includes("right") ? "Right Foot" : "Foot";
  if (low.includes("torso") || low.includes("body") || low.includes("chest") || low.includes("abd")) return "Body";
  // Fall back to title-cased original string.
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function _hitRegionFromLocation(normalizedLocation) {
  const l = String(normalizedLocation ?? "").toLowerCase();
  if (!l) return "body";
  if (l.includes("head")) return "head";
  if (l.includes("arm") || l.includes("leg") || l.includes("hand") || l.includes("foot")) return "limb";
  return "body";
}

function _hitLocationKey(normalizedLocation) {
  const l = String(normalizedLocation ?? '').toLowerCase();
  if (!l) return '';
  if (l.includes('head')) return 'head';
  if (l.includes('body') || l.includes('torso') || l.includes('chest') || l.includes('abd')) return 'body';
  if (l.includes('left') && l.includes('arm')) return 'leftArm';
  if (l.includes('right') && l.includes('arm')) return 'rightArm';
  if (l.includes('left') && l.includes('hand')) return 'leftHand';
  if (l.includes('right') && l.includes('hand')) return 'rightHand';
  if (l.includes('left') && l.includes('leg')) return 'leftLeg';
  if (l.includes('right') && l.includes('leg')) return 'rightLeg';
  if (l.includes('left') && (l.includes('foot') || l.includes('feet'))) return 'leftFoot';
  if (l.includes('right') && (l.includes('foot') || l.includes('feet'))) return 'rightFoot';
  // Fallback: collapse to an identifier-ish key.
  return String(normalizedLocation ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => i === 0 ? w : (w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}


function _computeDominantMagicType(damageAppliedByType = {}) {
  const entries = Object.entries(damageAppliedByType ?? {})
    .map(([k, v]) => [ _normalizeDamageTypeKey(k), Number(v) || 0 ])
    .filter(([k, v]) => SHOCK_MAGIC_TYPES.includes(k) && v > 0);

  if (!entries.length) return { chosen: null, candidates: [] };

  let max = 0;
  for (const [, v] of entries) max = Math.max(max, v);
  const candidates = Array.from(new Set(entries.filter(([, v]) => v === max).map(([k]) => k)));
  return { chosen: candidates.length === 1 ? candidates[0] : null, candidates };
}

function _formatDamageByType(damageAppliedByType = {}) {
  const parts = [];
  for (const [k, v] of Object.entries(damageAppliedByType ?? {})) {
    const amt = Number(v) || 0;
    if (amt <= 0) continue;
    parts.push(`${k}: ${amt}`);
  }
  return parts.join(", ");
}

function _woundsFlag(effect) {
  return effect?.getFlag?.(FLAG_SCOPE, "wounds") ?? effect?.flags?.[FLAG_SCOPE]?.wounds ?? null;
}

async function _applyShockUnconditional(actor, { region, hitLocationNorm, applicationId } = {}) {
  if (!actor) return;

  // Per Chapter 5, these effects apply when the wound is inflicted (regardless of Shock test result).
  if (region === "body") {
    const cur = Number(actor.system?.action_points?.value ?? 0) || 0;
    if (cur > 0) {
      await requestUpdateDocument(actor, { "system.action_points.value": Math.max(0, cur - 1) });
    } else {
      const debtRaw = Number(actor.getFlag(FLAG_SCOPE, "wounds.apDebtNextRefresh") ?? 0);
      const debt = Number.isFinite(debtRaw) ? debtRaw : 0;
      await requestUpdateDocument(actor, { [`${FLAG_PATH}.wounds.apDebtNextRefresh`]: debt + 1 });
    }
    return;
  }

  // For limb/head we create tracking AEs. These are non-HUD, non-migrating markers.
  if (region === "limb") {
    const name = `Crippled Limb (${hitLocationNorm || "Limb"})`;
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [
      {
        name,
        icon: "icons/svg/bones.svg",
        changes: [],
        flags: {
          [FLAG_SCOPE]: {
            wounds: {
              kind: "shockCripple",
              applicationId: String(applicationId ?? ""),
              hitLocation: hitLocationNorm ?? null,
              hitLocationKey: _hitLocationKey(hitLocationNorm)
            }
          }
        }
      }
    ]);
    return;
  }

  if (region === "head") {
    const name = "Stunned (Shock)";
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [
      {
        name,
        icon: "icons/svg/daze.svg",
        changes: [],
        flags: {
          [FLAG_SCOPE]: {
            wounds: {
              kind: "shockStunned",
              applicationId: String(applicationId ?? ""),
              remainingTurns: 1
            }
          }
        }
      }
    ]);
  }
}

async function _applyShockFailConsequence(actor, { region, hitLocationNorm, applicationId } = {}) {
  if (!actor) return;

  if (region === "body") {
    const name = "Crippled Body (Shock)";
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [
      {
        name,
        icon: "icons/svg/bones.svg",
        changes: [],
        flags: {
          [FLAG_SCOPE]: {
            wounds: {
              kind: "shockCrippleBody",
              applicationId: String(applicationId ?? ""),
              hitLocation: hitLocationNorm ?? "Body",
              hitLocationKey: _hitLocationKey(hitLocationNorm ?? "Body")
            }
          }
        }
      }
    ]);
    return { note: "Crippled Body" };
  }

  if (region === "limb") {
    const name = `Lost Limb (${hitLocationNorm || "Limb"})`;
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [
      {
        name,
        icon: "icons/svg/bones.svg",
        changes: [],
        flags: {
          [FLAG_SCOPE]: {
            wounds: {
              kind: "shockLostLimb",
              applicationId: String(applicationId ?? ""),
              hitLocation: hitLocationNorm ?? null,
              hitLocationKey: _hitLocationKey(hitLocationNorm)
            }
          }
        }
      }
    ]);
    return { note: "Lost Limb" };
  }

  if (region === "head") {
    const choice = await Dialog.wait({
      title: "Shock Result (Head): Choose Injury",
      content: `<p>The target failed their Shock test from a head wound. Choose whether the injury is a lost eye or lost ear.</p>`,
      buttons: {
        eye: { label: "Lost Eye", callback: () => "eye" },
        ear: { label: "Lost Ear", callback: () => "ear" }
      },
      default: "eye"
    });

    if (choice === "ear") {
      await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [
        { name: "Lost Ear (Shock)", icon: "icons/svg/skull.svg", changes: [], flags: { [FLAG_SCOPE]: { wounds: { kind: "shockLostEar", applicationId: String(applicationId ?? "") } } } }
      ]);
      return { note: "Lost Ear" };
    }

    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [
      { name: "Lost Eye (Shock)", icon: "icons/svg/eye.svg", changes: [], flags: { [FLAG_SCOPE]: { wounds: { kind: "shockLostEye", applicationId: String(applicationId ?? "") } } } }
    ]);
    return { note: "Lost Eye" };
  }

  return { note: null };
}

async function _applyShockMagicSideEffect(actor, { chosenType, damageAppliedByType = {} } = {}) {
  if (!actor || !chosenType) return { note: null };

  const type = _normalizeDamageTypeKey(chosenType);
  if (type === "shock") {
    const loss = Number(damageAppliedByType?.shock ?? damageAppliedByType?.Shock ?? 0) || 0;
    if (loss > 0) {
      const cur = Number(actor.system?.magicka?.value ?? 0) || 0;
      await requestUpdateDocument(actor, { "system.magicka.value": Math.max(0, cur - loss) });
    }
    return { note: loss > 0 ? `Lost Magicka (${loss})` : "Lost Magicka" };
  }

  if (type === "magic" || type === "frost" || type === "poison") {
    const cur = Number(actor.system?.stamina?.value ?? 0) || 0;
    await requestUpdateDocument(actor, { "system.stamina.value": Math.max(0, cur - 1) });
    return { note: "Lost Stamina (1)" };
  }

  if (type === "fire") {
    // Chapter 5: choose STR or AGI to avoid Burning(1).
    const choose = await Dialog.wait({
      title: "Fire Wound: Avoid Burning",
      content: `<p>This wound includes fire damage. Choose a Strength or Agility test to avoid gaining Burning (1).</p>`,
      buttons: {
        str: { label: "Roll STR", callback: () => "str" },
        agi: { label: "Roll AGI", callback: () => "agi" }
      },
      default: "str"
    });

    const key = choose === "agi" ? "agi" : "str";
    const tn = Number(actor.system?.characteristics?.[key]?.total ?? 0) || 0;
    const result = await doTestRoll(actor, { target: tn, rollFormula: "1d100", allowLucky: false, allowUnlucky: false });
    const passed = !!result?.isSuccess;

    // Real roll message for Dice So Nice (blind GM).
    try {
      await result.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `Fire Wound — ${actor.name} rolls ${key.toUpperCase()} to avoid Burning (1)`,
        rollMode: "blindroll"
      });
    } catch (_e) {
      // Non-blocking.
    }

    if (!passed) {
      const api = game?.uesrpg?.conditions;
      if (api?.applyBurning) {
        await api.applyBurning(actor, 1, { hitLocation: "Body", source: "Shock (Fire)" });
      } else if (api?.setConditionValue) {
        await api.setConditionValue(actor, "burning", 1);
      }
      return { note: "Burning (1)" };
    }

    return { note: "Avoided Burning" };
  }

  return { note: null };
}



function _getWhisperRecipientsForActor(actor) {
  const ids = new Set();
  for (const u of (game?.users ?? [])) {
    if (!u) continue;
    if (u.isGM) {
      ids.add(u.id);
      continue;
    }
    try {
      if (actor?.testUserPermission?.(u, "OWNER")) ids.add(u.id);
    } catch (_e) {
      // ignore
    }
  }
  return Array.from(ids);
}
async function _postShockTestChatCard({ actor, woundEffect, hitLocationNorm, damageAppliedByType, applicationId } = {}) {
  if (!actor || !woundEffect) return;
  const endTN = Number(actor.system?.characteristics?.end?.total ?? 0) || 0;

  const cardHtml = `
  <div class="uesrpg-chat-card" data-card="shock">
    <header class="card-header">
      <h3>Shock Test</h3>
    </header>
    <div class="card-content">
      <p><strong>Target:</strong> ${actor.name}</p>
      <p><strong>Wound Location:</strong> ${hitLocationNorm || "(unknown)"}</p>
      <p><strong>Endurance TN:</strong> ${endTN}</p>
    </div>
    <footer class="card-footer">
      <button type="button" data-ues-shock-action="shock-roll" data-actor-uuid="${actor.uuid}" data-wound-effect-id="${woundEffect.id}">Roll Shock (END)</button>
    </footer>
  </div>`;

  const msgFlags = {
    [FLAG_SCOPE]: {
      wounds: {
        kind: "shockCard",
        actorUuid: actor.uuid,
        woundEffectId: woundEffect.id,
        applicationId: String(applicationId ?? ""),
        hitLocation: hitLocationNorm ?? null,
        damageAppliedByType: damageAppliedByType ?? null
      }
    }
  };

  const whisper = _getWhisperRecipientsForActor(actor);
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: cardHtml,
    flags: msgFlags,
    whisper: whisper,
    blind: false
  });
}

async function _dedupeSingletonEffect(actor, kind, { pick = "first" } = {}) {
  const list = _findEffectsByKind(actor, kind);
  if (list.length <= 1) return list[0] ?? null;

  let keep = list[0];
  if (pick === "maxRemainingRounds") {
    keep = list.reduce((best, ef) => {
      const rBest = Number(best?.getFlag?.(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0) || 0;
      const rCur = Number(ef?.getFlag?.(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0) || 0;
      return rCur > rBest ? ef : best;
    }, list[0]);
  }

  const extras = list.filter(e => e?.id && e.id !== keep.id);
  if (extras.length) {
    _wlog(`Duplicate ${kind} effects detected during ${kind} invariant enforcement; keeping ${keep.id}, removing ${extras.map(e => e.id).join(", ")}`);
    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", extras.map(e => e.id));
    } catch (err) {
      console.warn("UESRPG | Failed to delete duplicate wound marker effects", err);
    }
  }

  return keep;
}

async function _enforceWoundInvariants(actor, { context = "unknown" } = {}) {
  if (!actor) return;

  // Deduplicate singleton marker effects.
  await _dedupeSingletonEffect(actor, "bloodLoss", { pick: "maxRemainingRounds" });
  await _dedupeSingletonEffect(actor, "forestall", { pick: "maxRemainingRounds" });
  await _dedupeSingletonEffect(actor, "firstAid", { pick: "first" });

  // Clamp / normalize marker counters to sane, deterministic values.
  for (const kind of ["bloodLoss", "forestall"]) {
    for (const ef of _findEffectsByKind(actor, kind)) {
      const cur = Number(ef?.getFlag?.(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0);
      const norm = Number.isFinite(cur) ? Math.max(0, Math.floor(cur)) : 0;
      if (norm != cur) {
        _dlog(`${kind} remainingRounds normalized`, { actor: actor.uuid, effect: ef.id, from: cur, to: norm, context });
        try {
          await requestUpdateDocument(ef, { [`${FLAG_PATH}.wounds.remainingRounds`]: norm, name: kind === "bloodLoss" ? `Blood Loss (${norm})` : `Wound Forestall (${norm})` });
        } catch (err) {
          console.warn("UESRPG | Failed to normalize wound marker counter", err);
        }
      }
    }
  }

  // Treated wound progress invariants.
  for (const ef of _findEffectsByKind(actor, "wound")) {
    const w = ef?.getFlag?.(FLAG_SCOPE, "wounds") ?? {};
    const treated = w.treated === true;
    if (!treated) continue;

    const damage = Number(w.damage ?? 0);
    const progress = Number(w.progress ?? 0);
    const d = Number.isFinite(damage) ? Math.max(0, damage) : 0;
    const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;

    if (d <= 0) continue;

    if (p >= d) {
      _dlog("Deleting fully healed treated wound", { actor: actor.uuid, effect: ef.id, damage: d, progress: p, context });
      try {
        await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
      } catch (err) {
        console.warn("UESRPG | Failed to delete fully healed wound effect", err);
      }
      continue;
    }

    if (p != progress || d != damage) {
      _dlog("Normalizing treated wound progress", { actor: actor.uuid, effect: ef.id, damageFrom: damage, damageTo: d, progressFrom: progress, progressTo: p, context });
      try {
        await requestUpdateDocument(ef, { [`${FLAG_PATH}.wounds.damage`]: d, [`${FLAG_PATH}.wounds.progress`]: p });
      } catch (err) {
        console.warn("UESRPG | Failed to normalize treated wound progress", err);
      }
    }
  }

    // Canonical invariant:
  // - `system.wounded` represents whether passive wound effects are currently active (Chapter 5: Passive Effects).
  // - Wound markers are represented by ActiveEffects with flags. We do NOT force `system.wounded=true` just because a wound marker exists,
  //   because passive effects begin after Shock Test resolution.
  const hasWoundEffects = _hasAnyWoundEffects(actor);
  const sysWounded = actor.system?.wounded === true;

  // If any wound has already resolved Shock, ensure passive wound state is active (even if suppressed by First Aid / Forestall).
  const hasResolvedWound = _findEffectsByKind(actor, "wound").some((ef) => {
    const wf = _woundsFlag(ef) ?? {};
    return wf.shockResolved === true;
  });

  if (hasResolvedWound && !sysWounded) {
    _dlog("Activating actor.system.wounded due to resolved Shock on an existing wound", { actor: actor.uuid, context });
    try {
      await requestUpdateDocument(actor, { "system.wounded": true });
    } catch (err) {
      console.warn("UESRPG | Failed to activate system.wounded for resolved wound", err);
    }
  }


  // If the document says we are wounded but no wound markers remain, clear it deterministically.
  if (!hasWoundEffects && sysWounded) {
    _dlog("Clearing actor.system.wounded because no wound effects remain", { actor: actor.uuid, context });
    try {
      await requestUpdateDocument(actor, { "system.wounded": false });
    } catch (err) {
      console.warn("UESRPG | Failed to clear system.wounded invariant", err);
    }
  }
}

function _effects(actor) {
  return actor?.effects?.contents ?? [];
}

function _toNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

async function _resolveActorLike(actorLike) {
  // Accept: Actor, TokenDocument/Token, UUID string, Actor ID, Actor name.
  // If omitted, use the first controlled token's actor, else the user's assigned character.
  try {
    if (!actorLike) {
      return canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character ?? null;
    }

    // Actor instance
    if (actorLike?.documentName === "Actor") return actorLike;

    // Token or TokenDocument
    if (actorLike?.actor?.documentName === "Actor") return actorLike.actor;

    // UUID / id / name
    if (typeof actorLike === "string") {
      const s = actorLike.trim();
      if (!s) return null;

      // Try UUID first (e.g. Actor.xxxxx)
      if (s.includes(".")) {
        const doc = await fromUuid(s).catch(() => null);
        if (doc?.documentName === "Actor") return doc;
      }

      // Try ID then name
      return game.actors?.get?.(s) ?? game.actors?.getName?.(s) ?? null;
    }

    return null;
  } catch (_err) {
    return null;
  }
}


function _findEffectsByKind(actor, kind) {
  return _effects(actor).filter(e => (e?.getFlag?.(FLAG_SCOPE, "wounds")?.kind === kind));
}

function _findFirstEffectByKind(actor, kind) {
  return _findEffectsByKind(actor, kind)[0] ?? null;
}

function _findFirstEffectByAppId(actor, applicationId) {
  const appId = String(applicationId ?? "").trim();
  if (!appId) return null;
  for (const ef of _effects(actor)) {
    const wounds = ef?.getFlag?.(FLAG_SCOPE, "wounds") ?? null;
    if (!wounds || typeof wounds !== "object") continue;
    if (String(wounds.applicationId ?? "") === appId) return ef;
  }
  return null;
}


function _mkEffect({ name, img, icon, flags, changes = [], origin = null }) {
  return {
    name,
    // Foundry v13 ActiveEffect data uses "img".
    // Accept a legacy "icon" arg for internal callers.
    img: img ?? icon,
    origin: origin ?? null,
    disabled: false,
    duration: {},
    changes,
    flags: { [FLAG_SCOPE]: flags }
  };
}

function _hasAnyWoundEffects(actor) {
  return _findEffectsByKind(actor, "wound").length > 0;
}

async function _cleanupWoundStateIfNoWounds(actor) {
  if (!actor) return { clearedWounded: false, removedBloodLoss: 0, removedForestall: 0 };
  if (_hasAnyWoundEffects(actor)) return { clearedWounded: false, removedBloodLoss: 0, removedForestall: 0 };

  const bloodLoss = _findEffectsByKind(actor, "bloodLoss");
  const forestall = _findEffectsByKind(actor, "forestall");

  const removedBloodLoss = bloodLoss.length;
  const removedForestall = forestall.length;

  const toDelete = [...bloodLoss, ...forestall];

  if (toDelete.length) {
    for (const ef of toDelete) {
      try {
        await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
      } catch (_err) {
        // Non-blocking.
      }
    }
  }

  let clearedWounded = false;
  try {
    if (actor.system?.wounded) {
      await requestUpdateDocument(actor, { "system.wounded": false });
      clearedWounded = true;
    }
  } catch (err) {
    console.warn("UESRPG | Failed to clear system.wounded during wound cleanup", err);
  }

  return { clearedWounded, removedBloodLoss, removedForestall };
}

function _isWoundPenaltySuppressed(actor) {
  // Suppression if:
  //  - Forestall remainingRounds > 0
  //  - First Aid present
  const forestall = _findFirstEffectByKind(actor, "forestall");
  if (forestall) {
    const r = Math.max(0, _toNumber(forestall?.getFlag?.(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0, 0));
    if (r > 0) return true;
  }
  const firstAid = _findFirstEffectByKind(actor, "firstAid");
  if (firstAid) return true;
  return false;
}

async function _ensureUnconsciousEffect(actor) {
  try {
    const has = _effects(actor).some(e => e?.statuses?.has?.("unconscious") || e?.getFlag?.("core", "statusId") === "unconscious" || e?.name === "Unconscious");
    if (has) return;
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [{
      name: "Unconscious",
      img: "icons/svg/unconscious.svg",
      duration: {},
      statuses: ["unconscious"],
      flags: { core: { statusId: "unconscious" } }
    }]);
  } catch (err) {
    console.warn("UESRPG | Failed to apply unconscious effect from blood loss", err);
  }
}

export async function createWoundFromDamage(actor, { damage = 0, hitLocation = "Body", origin = null, source = "Attack", applicationId = null } = {}) {
  if (!actor) return;

  const amt = Math.max(0, _toNumber(damage, 0));
  if (amt <= 0) return;

  const loc = String(hitLocation || "Body");
  const ts = Date.now();


  const appId = applicationId ? String(applicationId) : null;
  if (appId) {
    const existingByApp = _findFirstEffectByAppId(actor, appId);
    if (existingByApp) return existingByApp;
  }

  const woundEffect = _mkEffect({
    name: `Wound (${loc})`,
    icon: "icons/svg/skull.svg",
    origin,
    flags: {
      wounds: {
        kind: "wound",
        applicationId: appId,
        hitLocation: loc,
        damage: amt,
        treated: false,
        progress: 0,
        createdAt: ts,
        source,
        shockResolved: false,
        shockResolvedAt: null,
        shockPassed: null
      }
    }
  });

  const created = await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [woundEffect]);
  const woundDoc = Array.isArray(created) ? (created[0] ?? null) : null;

  // Passive Effects + Blood Loss begin after Shock Test resolution (see resolveShockTestFromChat).
  return woundDoc;
}

export async function upsertBloodLoss(actor, { resetTo = 5 } = {}) {
  if (!actor) return;
  const existing = _findFirstEffectByKind(actor, "bloodLoss");
  const next = Math.max(0, _toNumber(resetTo, 5));

  if (!existing) {
    const effect = _mkEffect({
      name: `Blood Loss (${next})`,
      icon: "icons/svg/blood.svg",
      flags: {
        wounds: {
          kind: "bloodLoss",
          remainingRounds: next
        }
      }
    });
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [effect]);
    return;
  }

  await requestUpdateDocument(existing, {
    name: `Blood Loss (${next})`,
    [`${FLAG_PATH}.wounds.remainingRounds`]: next
  });
}

export async function firstAid(actorLike) {
  const actor = await _resolveActorLike(actorLike);
  if (!actor) return { removedBloodLoss: 0, createdFirstAid: false };

  let removedBloodLoss = 0;

  // Remove blood loss countdown
  for (const ef of _findEffectsByKind(actor, "bloodLoss")) {
    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
      removedBloodLoss++;
    } catch (_err) {
      // Non-blocking.
    }
  }

  // Create a persistent suppression marker (passive wound penalties removed by first aid)
  const existing = _findFirstEffectByKind(actor, "firstAid");
  if (existing) return { removedBloodLoss, createdFirstAid: false };

  const effect = _mkEffect({
    name: "First Aid (Stabilized)",
    icon: "icons/svg/regen.svg",
    flags: {
      wounds: {
        kind: "firstAid",
        suppressWoundPenalty: true,
        stabilized: true,
        stabilizedAt: Date.now()
      }
    }
  });

  await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [effect]);

  return { removedBloodLoss, createdFirstAid: true };
}

export async function treatWound(actorLike, effectId) {
  const actor = await _resolveActorLike(actorLike);
  if (!actor || !effectId) return;
  const ef = actor.effects?.get?.(effectId) ?? null;
  const data = ef?.getFlag?.(FLAG_SCOPE, "wounds");
  if (!ef || data?.kind !== "wound") return;

  if (data.treated === true) return;

  await requestUpdateDocument(ef, {
    [`${FLAG_PATH}.wounds.treated`]: true,
    [`${FLAG_PATH}.wounds.treatedAt`]: Date.now(),
    [`${FLAG_PATH}.wounds.progress`]: 0
  });
}

export async function treatAllWounds(actorLike) {
  const actor = await _resolveActorLike(actorLike);
  if (!actor) return;
  for (const ef of _findEffectsByKind(actor, "wound")) {
    const data = ef.getFlag(FLAG_SCOPE, "wounds") ?? {};
    if (data.treated === true) continue;
    await treatWound(actor, ef.id);
  }
}


export async function stabilize(actorLike) {
  const actor = await _resolveActorLike(actorLike);
  if (!actor) return { stabilizedWounds: 0, firstAid: { removedBloodLoss: 0, createdFirstAid: false } };

  // Package 5: treatment staging (no roll/action enforcement).
  // For now, "stabilize" is equivalent to First Aid: stop blood loss and suppress passive wound penalties.
  const firstAidResult = await firstAid(actor);

  const now = Date.now();
  let stabilizedWounds = 0;

  for (const ef of _findEffectsByKind(actor, "wound")) {
    try {
      await requestUpdateDocument(ef, {
        [`${FLAG_PATH}.wounds.stabilized`]: true,
        [`${FLAG_PATH}.wounds.stabilizedAt`]: now
      });
      stabilizedWounds++;
    } catch (err) {
      // Best-effort, never block stabilization
      console.warn("UESRPG | Failed to mark wound stabilized", err);
    }
  }

  return { stabilizedWounds, firstAid: firstAidResult };
}

export async function clearWound(actorLike, effectId) {
  const actor = await _resolveActorLike(actorLike);
  if (!actor) return;
  const ef = actor.effects?.get?.(String(effectId)) ?? null;
  if (!ef) return;

  const w = ef.getFlag?.(FLAG_SCOPE, "wounds") ?? {};
  const kind = String(w.kind ?? "");
  if (!["wound", "bloodLoss", "forestall", "firstAid"].includes(kind)) return;

  const appId = kind === "wound" ? String(w.applicationId ?? "").trim() : "";

  await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);

  // When a wound is cleared, also clear associated Shock markers (except lost limbs/eyes/ears).
  if (kind === "wound" && appId) {
    await _removeShockMarkersForApplication(actor, appId, { removeLost: false });
  }

  // Defensive invariant: when wounds are fully healed/cleared, remove lingering blood loss / forestall.
  if (!_hasAnyWoundEffects(actor)) {
    await _cleanupWoundStateIfNoWounds(actor);
  }
}

export async function clearAllWounds(actorLike) {
  const actor = await _resolveActorLike(actorLike);
  if (!actor) return;

  const kinds = new Set(["wound", "bloodLoss", "forestall", "firstAid"]);
  const toDelete = _effects(actor).filter(e => kinds.has(String(e?.getFlag?.(FLAG_SCOPE, "wounds")?.kind ?? "")));

  if (!toDelete.length) return;
  await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", toDelete.map(e => e.id));

  // If we removed all wound-related markers, ensure the canonical actor flag is cleared.
  if (actor.system?.wounded) {
    try {
      await requestUpdateDocument(actor, { "system.wounded": false });
    } catch (err) {
      console.warn("UESRPG | Failed to clear system.wounded during clearAllWounds", err);
    }
  }
}

async function _applyHealingForestall(actor, effectiveHealed) {
  const add = Math.max(0, _toNumber(effectiveHealed, 0));
  if (add <= 0) return;

  const existing = _findFirstEffectByKind(actor, "forestall");
  if (!existing) {
    const ef = _mkEffect({
      name: `Wound Forestall (${add})`,
      icon: "icons/svg/regen.svg",
      flags: {
        wounds: {
          kind: "forestall",
          remainingRounds: add,
          suppressWoundPenalty: true
        }
      }
    });
    await requestCreateEmbeddedDocuments(actor, "ActiveEffect", [ef]);
    return;
  }

  const cur = Math.max(0, _toNumber(existing.getFlag(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0, 0));
  const next = cur + add;
  await requestUpdateDocument(existing, {
    name: `Wound Forestall (${next})`,
    [`${FLAG_PATH}.wounds.remainingRounds`]: next
  });
}

async function _advanceTreatedWoundHealing(actor, effectiveHealed) {
  const heal = Math.max(0, _toNumber(effectiveHealed, 0));
  if (heal <= 0) return;

  const wounds = _findEffectsByKind(actor, "wound");
  for (const ef of wounds) {
    const w = ef.getFlag(FLAG_SCOPE, "wounds") ?? {};
    if (w.treated !== true) continue;

    const damage = Math.max(0, _toNumber(w.damage, 0));
    if (damage <= 0) continue;

    const progress = Math.max(0, _toNumber(w.progress, 0));
    const next = progress + heal;

    if (next >= damage) {
      const appId = String(w.applicationId ?? "").trim();
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);

      // Chapter 5: once the wound is cured, remove wound-related Shock markers (except lost limbs/eyes/ears).
      if (appId) {
        await _removeShockMarkersForApplication(actor, appId, { removeLost: false });
      }
      continue;
    }

    await requestUpdateDocument(ef, { [`${FLAG_PATH}.wounds.progress`]: next });
  }

  // If no wounds remain, clear system.wounded (safe + deterministic).
  if (actor.system?.wounded && !_hasAnyWoundEffects(actor)) {
    await requestUpdateDocument(actor, { "system.wounded": false });
  }

  // Defensive invariant: when wounds are fully healed, remove any lingering blood loss / forestall.
  if (!_hasAnyWoundEffects(actor)) {
    await _cleanupWoundStateIfNoWounds(actor);
  }
}

// NOTE: Chapter 5 includes longer-term consequences for untreated wounds (e.g. maiming/crippling),
// but those depend on the broader Conditions + Rest + Treatment workflow and are intentionally
// deferred to a later package. We do NOT auto-apply a "Maimed" marker in Package 1.

export async function tickWoundsEndTurn(actor) {
  if (!actor) return;

  await _enforceWoundInvariants(actor, { context: "tickWoundsEndTurn" });

  // Shock (Chapter 5): decrement any short-duration shock markers (e.g. head-stun for 1 round).
  // This must tick even if the underlying wounds were cleared mid-combat.
  await _tickShockMarkers(actor);

  // Defensive invariant: Blood Loss / Forestall should not persist when no wounds exist.
  if (!_hasAnyWoundEffects(actor)) {
    await _cleanupWoundStateIfNoWounds(actor);
    return;
  }

  await _tickForestall(actor);
  await _tickBloodLoss(actor);
}

async function _tickShockMarkers(actor) {
  if (!actor) return;

  // Only the 1-round Stun marker has a deterministic countdown.
  for (const ef of _findEffectsByKind(actor, "shockStunned")) {
    const data = ef.getFlag(FLAG_SCOPE, "wounds") ?? {};
    const cur = Math.max(0, _toNumber(data.remainingTurns ?? 0, 0));
    if (cur <= 1) {
      try {
        await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
      } catch (err) {
        console.warn("UESRPG | Failed to delete expired shockStunned marker", err);
      }
      continue;
    }
    const next = cur - 1;
    try {
      await requestUpdateDocument(ef, { [`${FLAG_PATH}.wounds.remainingTurns`]: next, name: "Stunned (Shock)" });
    } catch (err) {
      console.warn("UESRPG | Failed to tick shockStunned marker", err);
    }
  }
}


async function _activateWoundPassiveState(actor, { resetBloodLoss = true } = {}) {
  if (!actor) return;

  // Passive effects begin after Shock Test resolution (Chapter 5: Passive Effects).
  if (actor.system?.wounded !== true) {
    try {
      await requestUpdateDocument(actor, { "system.wounded": true });
    } catch (err) {
      console.warn("UESRPG | Failed to set system.wounded for passive wound state", err);
    }
  }

  // Blood Loss countdown begins at the same moment.
  if (resetBloodLoss) {
    try {
      await upsertBloodLoss(actor, { resetTo: 5 });
    } catch (err) {
      console.warn("UESRPG | Failed to start/reset Blood Loss after shock resolution", err);
    }
  }
}

async function _removeShockMarkersForApplication(actor, applicationId, { removeLost = false } = {}) {
  if (!actor) return;
  const appId = String(applicationId ?? "").trim();
  if (!appId) return;

  const toDelete = _effects(actor).filter((ef) => {
    const wf = _woundsFlag(ef) ?? {};
    if (String(wf.applicationId ?? "") !== appId) return false;
    const kind = String(wf.kind ?? "");
    if (kind === "shockCripple" || kind === "shockCrippleBody" || kind === "shockStunned") return true;
    if (removeLost && (kind === "shockLostLimb" || kind === "shockLostEar" || kind === "shockLostEye")) return true;
    return false;
  });

  if (!toDelete.length) return;

  try {
    await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", toDelete.map(e => e.id));
  } catch (err) {
    console.warn("UESRPG | Failed to remove shock markers for wound", { appId, err });
  }
}

/**
 * Resolve a Shock test from a chat card button.
 *
 * This is a deterministic integration point used by module/combat/chat-handlers.js.
 * The caller provides the actor UUID and the wound effect ID.
 */
export async function resolveShockTestFromChat(...args) {
  // Backward-compatible signature:
  //  - resolveShockTestFromChat({ actorUuid, woundEffectId, action })
  //  - resolveShockTestFromChat(message, { actorUuid, woundEffectId, action })
  const params = (args.length >= 2 && args[1] && typeof args[1] === "object")
    ? args[1]
    : (args[0] && typeof args[0] === "object" ? args[0] : {});

  const { actorUuid, woundEffectId, action } = params;
  if (String(action ?? "") !== "shock-roll") return;
  if (!actorUuid || !woundEffectId) return;

  const actor = await fromUuid(String(actorUuid));
  if (!actor) {
    ui.notifications?.warn?.("Shock: actor not found.");
    return;
  }

  const woundEf = actor.effects?.get?.(String(woundEffectId)) ?? null;
  if (!woundEf) {
    ui.notifications?.warn?.("Shock: wound effect not found.");
    return;
  }

  const w = woundEf.getFlag?.(FLAG_SCOPE, "wounds") ?? {};
  if (w.shockResolved === true) {
    ui.notifications?.info?.("Shock test already resolved for this wound.");
    return;
  }

  const hitLocationNorm = _normalizeHitLocationKey(w.hitLocation ?? "Body");
  const region = _hitRegionFromLocation(hitLocationNorm);
  const endTN = Number(actor.system?.characteristics?.end?.total ?? 0) || 0;
  if (endTN <= 0) {
    ui.notifications?.warn?.("Shock: invalid Endurance TN.");
    return;
  }

  const test = await doTestRoll(actor, { target: endTN, rollFormula: "1d100", allowLucky: false, allowUnlucky: false });
  const passed = !!test?.isSuccess;

  // Post a real roll message for Dice So Nice (blind GM).
  try {
    await test.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `Shock Test — ${actor.name} (END)`,
      rollMode: "roll",
      whisper: _getWhisperRecipientsForActor(actor)
    });
  } catch (_e) {
    // Non-blocking.
  }

  let failNote = null;
  if (!passed) {
    const r = await _applyShockFailConsequence(actor, { region, hitLocationNorm, applicationId: w.applicationId ?? null });
    failNote = r?.note ?? null;
  }

  let magicNote = null;
  const damageAppliedByType = w.damageAppliedByType ?? null;
  const dom = _computeDominantMagicType(damageAppliedByType);
  if (dom?.candidates?.length) {
    let chosen = dom.chosen;

    if (!chosen && dom.candidates.length > 1) {
      // RAW: attacker chooses; in chat-card resolution we delegate the choice to the user clicking the button
      // (typically GM). This remains deterministic and auditable.
      const buttons = {};
      for (const c of dom.candidates) {
        buttons[c] = { label: c.toUpperCase(), callback: () => c };
      }
      chosen = await Dialog.wait({
        title: "Magic Shock Side Effect (Tie)",
        content: `<p>Multiple magic types contributed equally to this wound. Choose which side effect applies.</p>`,
        buttons,
        default: dom.candidates[0]
      });
    }

    const mr = await _applyShockMagicSideEffect(actor, { chosenType: chosen, damageAppliedByType });
    magicNote = mr?.note ?? null;
  }

  // Activate passive wound effects (Chapter 5: Passive Effects) now that Shock is resolved.
  await _activateWoundPassiveState(actor, { resetBloodLoss: true });

  // Mark resolved on the wound effect to prevent double application.
  try {
    await requestUpdateDocument(woundEf, {
      [`${FLAG_PATH}.wounds.shockResolved`]: true,
      [`${FLAG_PATH}.wounds.shockResolvedAt`]: Date.now(),
      [`${FLAG_PATH}.wounds.shockPassed`]: passed
    });
  } catch (_e) {
    // Non-blocking.
  }

  // Post a deterministic result summary.
  try {
    const parts = [];
    parts.push(`<p><strong>Target:</strong> ${actor.name}</p>`);
    parts.push(`<p><strong>Wound Location:</strong> ${hitLocationNorm}</p>`);
    parts.push(`<p><strong>Shock Test (END):</strong> ${passed ? "Success" : "Failure"}</p>`);
    if (failNote) parts.push(`<p><strong>Failure Consequence:</strong> ${failNote}</p>`);
    if (magicNote) parts.push(`<p><strong>Magic Side Effect:</strong> ${magicNote}</p>`);

    const whisper = _getWhisperRecipientsForActor(actor);
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="uesrpg-chat-card" data-card="shock-result"><header class="card-header"><h3>Shock Result</h3></header><div class="card-content">${parts.join("\n")}</div></div>`,
      whisper: whisper,
      blind: false
    });
  } catch (_e) {
    // Non-blocking.
  }
}

async function _tickForestall(actor) {
  const ef = _findFirstEffectByKind(actor, "forestall");
  if (!ef) return;

  const cur = Math.max(0, _toNumber(ef.getFlag(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0, 0));
  if (cur <= 1) {
    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
    } catch (_err) {
      // Non-blocking: effect may already be gone.
    }
    return;
  }

  const next = cur - 1;
  try {
    await requestUpdateDocument(ef, {
      name: `Wound Forestall (${next})`,
      [`${FLAG_PATH}.wounds.remainingRounds`]: next
    });
  } catch (err) {
    console.warn("UESRPG | Wounds | Failed to tick Forestall", err);
  }
}

async function _tickBloodLoss(actor) {
  const ef = _findFirstEffectByKind(actor, "bloodLoss");
  if (!ef) return;

  // Defensive invariant: if Blood Loss exists without any Wound effects, delete it.
  if (!_hasAnyWoundEffects(actor)) {
    await _cleanupWoundStateIfNoWounds(actor);
    return;
  }

  // Blood loss countdown pauses while wound penalties are suppressed via forestall/first aid.
  if (_isWoundPenaltySuppressed(actor)) return;

  const cur = Math.max(0, _toNumber(ef.getFlag(FLAG_SCOPE, "wounds")?.remainingRounds ?? 0, 0));
  if (cur <= 1) {
    // Blood Loss expires: drop to 0 HP and apply Unconscious (Chapter 5).
    const hp = _toNumber(actor.system?.hp?.value ?? 0, 0);

    if (hp > 0) {
      try {
        await requestUpdateDocument(actor, { "system.hp.value": 0 });
      } catch (err) {
        console.warn("UESRPG | Wounds | Failed to set HP to 0 from Blood Loss", err);
      }
    }

    // Always ensure Unconscious is present when Blood Loss resolves at 0 rounds.
    await _ensureUnconsciousEffect(actor);

    try {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="uesrpg-chat-card"><div class="header"><b>${actor.name}</b></div><div>Blood loss: HP dropped to 0.</div></div>`
      });
    } catch (_e) {
      // Non-blocking.
    }

    // Best-effort delete (may already be removed by another cleanup path/module).
    try {
      await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", [ef.id]);
    } catch (_err) {
      // Non-blocking.
    }

    return;
  }

  const next = cur - 1;
  await requestUpdateDocument(ef, {
    name: `Blood Loss (${next})`,
    [`${FLAG_PATH}.wounds.remainingRounds`]: next
  });
}

export function canNaturalHeal(actor) {
  // Natural healing (long rest) is only allowed when there are no untreated wounds.
  // Rest mechanics are deferred; this helper is the future integration point.
  if (!actor) return false;
  const wounds = _findEffectsByKind(actor, "wound");
  if (!wounds.length) return true;
  const untreated = wounds.some(ef => (ef.getFlag(FLAG_SCOPE, "wounds")?.treated !== true));
  return !untreated;
}

export function registerWoundHooks() {
  if (_woundHooksRegistered) return;
  _woundHooksRegistered = true;
  Hooks.on("uesrpgDamageApplied", async (actor, data) => {
    try {
      if (!actor) return;
      if (data?.woundTriggered !== true) return;
      const woundDoc = await createWoundFromDamage(actor, {
        damage: data?.amountApplied ?? 0,
        hitLocation: data?.hitLocation ?? "Body",
        origin: data?.origin ?? null,
        source: data?.source ?? "Attack",
        applicationId: data?.applicationId ?? null
      });

      if (!woundDoc) return;

      const w = woundDoc.getFlag?.(FLAG_SCOPE, "wounds") ?? {};
      // Guard: post at most one shock card per wound application.
      if (w.shockPosted === true) return;

      // Ensure every wound has a stable applicationId for linking Shock markers + cleanup.
      let appId = String(w.applicationId ?? data?.applicationId ?? "").trim();
      if (!appId) appId = String(woundDoc.id ?? "");
      if (appId && !String(w.applicationId ?? "").trim()) {
        try {
          await requestUpdateDocument(woundDoc, { [`${FLAG_PATH}.wounds.applicationId`]: appId });
        } catch (_e) {
          // Non-blocking; proceed with local appId.
        }
      }

      const hitLocationNorm = _normalizeHitLocationKey(w.hitLocation ?? data?.hitLocation ?? "Body");
      const region = _hitRegionFromLocation(hitLocationNorm);
      const damageAppliedByType = data?.damageAppliedByType ?? null;

      // Persist details for later resolution (button click). This also provides idempotency.
      try {
        await requestUpdateDocument(woundDoc, {
          [`${FLAG_PATH}.wounds.shockPosted`]: true,
          [`${FLAG_PATH}.wounds.shockPostedAt`]: Date.now(),
          [`${FLAG_PATH}.wounds.damageAppliedByType`]: damageAppliedByType
        });
      } catch (_e) {
        // Non-blocking; idempotency is best-effort.
      }

      // Apply immediate (non-conditional) shock effects at wound time.
      await _applyShockUnconditional(actor, {
        region,
        hitLocationNorm,
        applicationId: appId || null
      });

      // Post the shock test card to allow the target to roll END and apply conditional consequences.
      await _postShockTestChatCard({
        actor,
        woundEffect: woundDoc,
        hitLocationNorm,
        damageAppliedByType,
        applicationId: appId || null
      });
    } catch (err) {
      console.warn("UESRPG | Wound creation failed", err);
    }
  });

  Hooks.on("uesrpgHealingApplied", async (actor, data) => {
    try {
      if (!actor) return;

      await _enforceWoundInvariants(actor, { context: "uesrpgHealingApplied" });

      // Only apply wound healing interactions when the actor is currently wounded or has wound effects.
      const hasWound = actor.system?.wounded === true || _hasAnyWoundEffects(actor);
      if (!hasWound) return;

      const effectiveHealed = Math.max(0, _toNumber(data?.effectiveHealed ?? 0, 0));
      if (effectiveHealed > 0) {
        await _applyHealingForestall(actor, effectiveHealed);
        await _advanceTreatedWoundHealing(actor, effectiveHealed);
      }
    } catch (err) {
      console.warn("UESRPG | Wound healing interaction failed", err);
    }
  });
}

export const WoundsAPI = {
  createWoundFromDamage,
  upsertBloodLoss,
  firstAid,
  stabilize,
  treatWound,
  treatAllWounds,
  clearWound,
  clearAllWounds,
  canNaturalHeal
};