/**
 * module/magic/upkeep-workflow.js
 *
 * Spell upkeep system for UESRPG 3ev4.
 *
 * RAW intent (Chapter 6):
 * - The caster can, as a Free Action, refresh the effect and duration of a spell with the Upkeep
 *   attribute when it ends by paying the original cost they paid for the spell.
 * - Upkeep must use the original target(s) and requires that spell requirements (e.g., range) are still met.
 * - If a spell has no listed duration, treat it as having a 1 round duration for the purposes of upkeep.
 * - Spells with no listed duration cannot be upkept if the caster has cast a different spell since the
 *   original cast of the upkept spell.
 *
 * Implementation notes:
 * - We treat Upkeep as an effect-refresh (duration reset + cost spend). We do not perform the original
 *   casting test again.
 * - Upkeep prompts are grouped by spell instance: {casterUuid, spellUuid, originalCastWorldTime}.
 *   This prevents duplicate prompts when the same spell instance applied multiple effects/targets.
 */

import { getSpellMaxRangeMeters, getSpellRangeType } from "./spell-range.js";
import { requestDeleteEmbeddedDocuments, requestUpdateDocument } from "../helpers/authority-proxy.js";

function _roundTimeSeconds() {
  return Number(CONFIG.time?.roundTime ?? 6) || 6;
}

function _currentRound() {
  return Number(game.combat?.round ?? 0) || 0;
}

function _nowWorldTime() {
  return Number(game.time?.worldTime ?? 0) || 0;
}

function _str(v) {
  return v === null || v === undefined ? "" : String(v);
}

function _num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function _groupKeyFromFlags(flags) {
  const casterUuid = _str(flags?.casterUuid);
  const spellUuid = _str(flags?.spellUuid);
  const castTime = _num(flags?.originalCastWorldTime, 0);
  if (!casterUuid || !spellUuid) return null;
  return `${casterUuid}::${spellUuid}::${castTime}`;
}

function _parseGroupKey(key) {
  const parts = _str(key).split("::");
  return {
    casterUuid: parts[0] || "",
    spellUuid: parts[1] || "",
    originalCastWorldTime: _num(parts[2], 0)
  };
}

function _measureDistanceMeters(aToken, bToken) {
  try {
    const a = aToken?.center ?? aToken?.object?.center ?? null;
    const b = bToken?.center ?? bToken?.object?.center ?? null;
    if (!a || !b) return Number.POSITIVE_INFINITY;

    if (!canvas?.grid || !canvas?.scene) return Number.POSITIVE_INFINITY;

    // Use v13 namespaced Ray with fallback to global Ray for compatibility
    const RayClass = foundry?.canvas?.geometry?.Ray ?? Ray;
    const ray = new RayClass(a, b);

    // Use v13 measurePath API with fallback to deprecated measureDistances
    if (typeof canvas.grid.measurePath === "function") {
      const path = canvas.grid.measurePath([{ ray }], { gridSpaces: true });
      // API may return object with distance property or array of distances
      const d = path?.distance ?? (Array.isArray(path) && path.length > 0 ? path[0] : null);
      if (Number.isFinite(d)) return d;
    } else {
      // Fallback for compatibility
      const distances = canvas.grid.measureDistances([{ ray }], { gridSpaces: true });
      const d = Array.isArray(distances) ? distances[0] : null;
      if (Number.isFinite(d)) return d;
    }

    // Fallback: approximate using pixel distance and grid scale.
    const pixels = ray.distance;
    const gridSize = Number(canvas.grid.size ?? 0) || 0;
    const gridDistance = Number(canvas.scene.grid?.distance ?? 0) || 0;
    if (gridSize > 0 && gridDistance > 0) return (pixels / gridSize) * gridDistance;

    return Number.POSITIVE_INFINITY;
  } catch (_e) {
    return Number.POSITIVE_INFINITY;
  }
}

function _getTokenForActorOnScene(actor, scene) {
  if (!actor || !scene) return null;
  const tokens = actor.getActiveTokens?.(true, true) ?? actor.getActiveTokens?.() ?? [];
  for (const t of tokens) {
    const doc = t?.document ?? t;
    if (doc?.scene?.id && doc.scene.id !== scene.id) continue;
    if (doc?.parent?.id && doc.parent.id !== scene.id) continue;
    // Prefer placeable token objects
    return t?.object ?? t;
  }
  return null;
}

function _readPromptedState(casterActor) {
  const st = casterActor.getFlag("uesrpg-3ev4", "upkeepPrompted") ?? {};
  return {
    turnRound: _num(st.turnRound, -1),
    turnKeys: Array.isArray(st.turnKeys) ? st.turnKeys : [],
    roundEndRound: _num(st.roundEndRound, -1),
    roundEndKeys: Array.isArray(st.roundEndKeys) ? st.roundEndKeys : [],
    realtimeAt: _num(st.realtimeAt, 0),
    realtimeKeys: Array.isArray(st.realtimeKeys) ? st.realtimeKeys : []
  };
}

async function _writePromptedState(casterActor, next) {
  try {
    await casterActor.setFlag("uesrpg-3ev4", "upkeepPrompted", next);
  } catch (_e) {
    // no-op
  }
}

function _isPromptedCombatTurn(state, nowRound, groupKey) {
  if (state.turnRound !== nowRound) return false;
  return state.turnKeys.includes(groupKey);
}

function _isPromptedCombatRoundEnd(state, nowRound, groupKey) {
  if (state.roundEndRound !== nowRound) return false;
  return state.roundEndKeys.includes(groupKey);
}

function _isPromptedRealtime(state, nowTime, groupKey) {
  // 3 second anti-spam window
  if ((nowTime - state.realtimeAt) < 3) return state.realtimeKeys.includes(groupKey);
  return false;
}

async function _markPromptedCombatTurn(casterActor, state, nowRound, groupKey, nowTime) {
  const nextKeys = (state.turnRound === nowRound)
    ? (state.turnKeys.includes(groupKey) ? state.turnKeys : state.turnKeys.concat([groupKey]))
    : [groupKey];

  await _writePromptedState(casterActor, {
    ...state,
    turnRound: nowRound,
    turnKeys: nextKeys,
    realtimeAt: nowTime
  });
}

async function _markPromptedCombatRoundEnd(casterActor, state, nowRound, groupKey, nowTime) {
  const nextKeys = (state.roundEndRound === nowRound)
    ? (state.roundEndKeys.includes(groupKey) ? state.roundEndKeys : state.roundEndKeys.concat([groupKey]))
    : [groupKey];

  await _writePromptedState(casterActor, {
    ...state,
    roundEndRound: nowRound,
    roundEndKeys: nextKeys,
    realtimeAt: nowTime
  });
}

async function _markPromptedRealtime(casterActor, state, nowTime, groupKey) {
  const nextKeys = state.realtimeKeys.includes(groupKey)
    ? state.realtimeKeys
    : state.realtimeKeys.concat([groupKey]);

  await _writePromptedState(casterActor, {
    ...state,
    realtimeAt: nowTime,
    realtimeKeys: nextKeys
  });
}

/**
 * Initialize upkeep system hooks.
 */
export function initializeUpkeepSystem() {
  // Combat cadence
  // We prompt upkeep *once* at the end of the final round for both listed-duration and no-listed-duration spells.
  // This avoids missed prompts for 1-round listed durations (cast during the caster's turn) and prevents
  // duplicate prompts (caster turn + round end).
  Hooks.on("preUpdateCombat", async (combat, changed) => {
    if (!combat) return;
    if (!game.user?.isGM) return; // single authoritative prompt source (GM always present per project rules)
    if (!Object.prototype.hasOwnProperty.call(changed ?? {}, "round")) return;

    const endingRound = _num(combat.round, 0);
    await _checkUpkeepCombatRoundTransition(combat, endingRound);
  });

  // Out of combat cadence: periodic scan (best-effort)
  Hooks.on("updateWorldTime", async () => {
    if (game.combat) return;
    if (!game.user?.isGM) return;
    await _checkUpkeepRealtime();
  });
  // Bind chat message listeners for upkeep buttons (group-based)
  const bindListeners = (message, html) => {
    const data = message?.flags?.["uesrpg-3ev4"]?.upkeepGroup;
    if (!data) return;

    // Normalize to HTMLElement (v13 provides HTMLElement directly)
    let root = null;
    if (html instanceof HTMLElement) {
      root = html;
    } else if (html?.[0] instanceof HTMLElement) {
      root = html[0];
    } else if (html?.jquery && html.length > 0) {
      root = html.get(0);
    }

    if (!root) return;

    const confirmBtn = root.querySelector(".uesrpg-upkeep-confirm");
    const cancelBtn = root.querySelector(".uesrpg-upkeep-cancel");
    if (!confirmBtn && !cancelBtn) return;

    const disableBoth = () => {
      if (confirmBtn) confirmBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;
    };

    if (confirmBtn && !confirmBtn.dataset.uesrpgUpkeepBound) {
      confirmBtn.dataset.uesrpgUpkeepBound = "1";
      confirmBtn.addEventListener(
        "click",
        async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          disableBoth();
          try {
            await handleUpkeepGroupConfirm(message);
          } catch (err) {
            console.error("UESRPG | upkeep-workflow | confirm failed", err);
            ui.notifications?.error?.("Upkeep failed. See console for details.");
          }
        },
        { once: true }
      );
    }

    if (cancelBtn && !cancelBtn.dataset.uesrpgUpkeepBound) {
      cancelBtn.dataset.uesrpgUpkeepBound = "1";
      cancelBtn.addEventListener(
        "click",
        async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          disableBoth();
          try {
            await handleUpkeepGroupCancel(message);
          } catch (err) {
            console.error("UESRPG | upkeep-workflow | cancel failed", err);
            ui.notifications?.error?.("Failed to end spell. See console for details.");
          }
        },
        { once: true }
      );
    }
  };

  // v13: renderChatMessageHTML provides an HTMLElement.
  Hooks.on("renderChatMessageHTML", bindListeners);
}

function _isWithinCombatRoundTransitionWindow(effect, flags, endedRound) {
  if (!effect?.duration) return false;

  const sr = effect.duration.startRound;
  const startRound = (sr === null || sr === undefined) ? endedRound : _num(sr, endedRound);

  const roundsRaw = _num(effect.duration.rounds, 0);
  const roundsForUpkeep = Boolean(flags?.noListedDuration) ? 1 : roundsRaw;
  if (!(roundsForUpkeep > 0)) return false;

  const endRound = startRound + roundsForUpkeep;
  const promptAtEndOfRound = endRound - 1;
  return endedRound === promptAtEndOfRound;
}

function _isWithinRealtimeWindow(effect, flags, nowTime) {
  if (!effect?.duration) return false;

  const seconds = _num(effect.duration.seconds, 0);
  const startTime = _num(effect.duration.startTime, 0);
  if (!(seconds > 0) || !(startTime > 0)) return false;

  const rt = _roundTimeSeconds();
  const remaining = (startTime + seconds) - nowTime;
  return (remaining > 0 && remaining <= rt);
}

async function _collectExpiringGroups({ mode, combat, cadence, endedRound } = {}) {
  const groups = new Map();
  const nowTime = _nowWorldTime();

  const ended = (mode === "combat") ? _num(endedRound, _currentRound()) : null;

  for (const targetActor of (game.actors ?? [])) {
    for (const effect of (targetActor.effects ?? [])) {
      const flags = effect.flags?.["uesrpg-3ev4"];
      if (!flags?.spellEffect || !flags?.hasUpkeep) continue;

      let within = false;
      if (mode === "combat") {
        if (cadence === "roundTransition") within = _isWithinCombatRoundTransitionWindow(effect, flags, ended);
      } else {
        within = _isWithinRealtimeWindow(effect, flags, nowTime);
      }
      if (!within) continue;

      const gk = _groupKeyFromFlags(flags);
      if (!gk) continue;

      const entry = groups.get(gk) ?? {
        groupKey: gk,
        casterUuid: _str(flags.casterUuid),
        spellUuid: _str(flags.spellUuid),
        originalCastWorldTime: _num(flags.originalCastWorldTime, 0),
        spellName: _str(flags.spellName || effect.name),
        upkeepCosts: new Set(),
        effectRefs: []
      };

      entry.upkeepCosts.add(_num(flags.upkeepCost, 0));
      entry.effectRefs.push({ targetActorId: targetActor.id, effectId: effect.id });
      groups.set(gk, entry);
    }
  }

  return { groups, nowTime };
}

async function _checkUpkeepCombatRoundTransition(combat, endedRound) {
  const { groups, nowTime } = await _collectExpiringGroups({ mode: "combat", combat, cadence: "roundTransition", endedRound });

  for (const group of groups.values()) {
    const casterDoc = await fromUuid(group.casterUuid);
    const casterActor = casterDoc?.documentName === "Actor" ? casterDoc : casterDoc?.actor;
    if (!casterActor) continue;

    // GM prompts on behalf of the table; whisper to owners.
    // If no explicit owners exist, also whisper to active GMs (at least the current GM).

    const state = _readPromptedState(casterActor);
    if (_isPromptedCombatRoundEnd(state, endedRound, group.groupKey)) continue;

    await _markPromptedCombatRoundEnd(casterActor, state, endedRound, group.groupKey, nowTime);
    await _createUpkeepPrompt(group, casterActor);
  }
}

async function _checkUpkeepRealtime() {
  const { groups, nowTime } = await _collectExpiringGroups({ mode: "realtime", cadence: "realtime" });

  for (const group of groups.values()) {
    const casterDoc = await fromUuid(group.casterUuid);
    const casterActor = casterDoc?.documentName === "Actor" ? casterDoc : casterDoc?.actor;
    if (!casterActor) continue;

    const state = _readPromptedState(casterActor);
    if (_isPromptedRealtime(state, nowTime, group.groupKey)) continue;

    await _markPromptedRealtime(casterActor, state, nowTime, group.groupKey);
    await _createUpkeepPrompt(group, casterActor);
  }
}

function _formatTargetNames(effectRefs) {
  const names = [];
  for (const ref of effectRefs ?? []) {
    const a = game.actors.get(ref.targetActorId);
    if (!a) continue;
    names.push(a.name);
  }
  const unique = Array.from(new Set(names));
  if (!unique.length) return "(no targets)";
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} (+${unique.length - 3} more)`;
}

async function _createUpkeepPrompt(group, casterActor) {
  const targetSummary = _formatTargetNames(group.effectRefs);

  const upkeepCosts = Array.from(group.upkeepCosts ?? []).filter(n => Number.isFinite(n));
  const upkeepCost = upkeepCosts.length ? Math.max(...upkeepCosts) : 0;

  const content = `
  <div class="uesrpg-upkeep-card">
    <h3>Spell Upkeep</h3>
    <p><strong>${group.spellName}</strong> is about to end.</p>
    <p><strong>Targets:</strong> ${targetSummary}</p>
    <p>Pay <strong>${upkeepCost}</strong> Magicka to refresh the effect?</p>
    <div class="uesrpg-upkeep-buttons">
      <button type="button" class="uesrpg-upkeep-confirm"><i class="fas fa-sync-alt"></i> Upkeep</button>
      <button type="button" class="uesrpg-upkeep-cancel"><i class="fas fa-times"></i> End</button>
    </div>
  </div>`;

  const whisperIds = (game.users ?? [])
    .filter(u => u.active && (u.isGM || casterActor.testUserPermission(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)))
    .map(u => u.id);

  const msgData = {
    content,
    speaker: ChatMessage.getSpeaker({ actor: casterActor }),
    flags: {
      "uesrpg-3ev4": {
        upkeepGroup: {
          groupKey: group.groupKey,
          casterActorId: casterActor.id,
          casterUuid: group.casterUuid,
          spellUuid: group.spellUuid,
          originalCastWorldTime: group.originalCastWorldTime,
          upkeepCost,
          spellName: group.spellName,
          effectRefs: group.effectRefs
        }
      }
    }
  };

  // Important: Do not set whisper: [] (invisible to everyone). Only set whisper when there are recipients.
  if (whisperIds.length) msgData.whisper = whisperIds;

  await ChatMessage.create(msgData);
}

async function _collectCurrentEffectsForGroup(groupKey) {
  const { casterUuid, spellUuid, originalCastWorldTime } = _parseGroupKey(groupKey);
  const matches = [];

  for (const targetActor of (game.actors ?? [])) {
    for (const effect of (targetActor.effects ?? [])) {
      const flags = effect.flags?.["uesrpg-3ev4"];
      if (!flags?.spellEffect || !flags?.hasUpkeep) continue;
      if (_str(flags.casterUuid) !== casterUuid) continue;
      if (_str(flags.spellUuid) !== spellUuid) continue;
      if (_num(flags.originalCastWorldTime, 0) !== originalCastWorldTime) continue;
      matches.push({ targetActor, effect, flags });
    }
  }

  return matches;
}

async function _validateUpkeepRange({ casterActor, spell, matches }) {
  const rangeType = getSpellRangeType(spell);
  if (rangeType === "none") return { ok: true, failures: [] };

  const maxRange = getSpellMaxRangeMeters(spell);
  if (!Number.isFinite(maxRange) || maxRange <= 0) return { ok: true, failures: [] };

  // Best-effort: require tokens on the active scene for measurement.
  const scene = canvas?.scene ?? null;
  if (!scene) return { ok: true, failures: [] };

  const casterToken = _getTokenForActorOnScene(casterActor, scene);
  if (!casterToken) return { ok: true, failures: [] };

  const failures = [];
  for (const m of matches) {
    const targetToken = _getTokenForActorOnScene(m.targetActor, scene);
    if (!targetToken) continue; // cannot verify

    const d = _measureDistanceMeters(casterToken, targetToken);
    if (Number.isFinite(d) && d > maxRange) {
      failures.push({ actorName: m.targetActor.name, distance: d, maxRange });
    }
  }

  if (failures.length) return { ok: false, failures };
  return { ok: true, failures: [] };
}

/**
 * Confirm upkeep from a grouped upkeep prompt message.
 * @param {ChatMessage} message
 */
export async function handleUpkeepGroupConfirm(message) {
  const data = message?.flags?.["uesrpg-3ev4"]?.upkeepGroup;
  if (!data) return;

  const casterActor = game.actors.get(data.casterActorId);
  if (!casterActor) return;

  const matches = await _collectCurrentEffectsForGroup(data.groupKey);
  if (!matches.length) {
    ui.notifications?.info?.("Nothing to upkeep: the effect(s) already ended.");
    return;
  }

  // Best-effort resolve spell
  const spellDoc = await fromUuid(_str(data.spellUuid));
  const spell = spellDoc?.documentName === "Item" ? spellDoc : null;

  // RAW: if no listed duration, cannot upkeep if a different spell was cast since original cast
  const anyNoListed = matches.some(m => Boolean(m.flags?.noListedDuration));
  if (anyNoListed) {
    const originalCast = _num(data.originalCastWorldTime, 0);
    const lastCast = _num(casterActor.getFlag("uesrpg-3ev4", "lastSpellCastWorldTime"), 0);
    const lastSpellUuid = casterActor.getFlag("uesrpg-3ev4", "lastSpellCastSpellUuid");
    const spellUuid = _str(data.spellUuid);

    if (lastCast > originalCast && lastSpellUuid && _str(lastSpellUuid) !== spellUuid) {
      ui.notifications?.warn?.("Cannot upkeep this spell: you have cast a different spell since the original cast.");
      return;
    }
  }

  // RAW: requirements (range) must still be met.
  if (spell) {
    const rangeCheck = await _validateUpkeepRange({ casterActor, spell, matches });
    if (!rangeCheck.ok) {
      const parts = rangeCheck.failures
        .map(f => `${f.actorName} (${Math.round(f.distance * 10) / 10}m > ${f.maxRange}m)`) 
        .join(", ");
      ui.notifications?.warn?.(`Cannot upkeep: out of range: ${parts}.`);
      return;
    }
  }

  // Spend Magicka once
  const upkeepCost = _num(data.upkeepCost, 0);
  const currentMP = _num(casterActor.system?.magicka?.value, 0);
  if (upkeepCost > currentMP) {
    ui.notifications?.warn?.("Not enough Magicka to upkeep this spell.");
    return;
  }

  await requestUpdateDocument(casterActor, { "system.magicka.value": currentMP - upkeepCost });

  // Refresh duration by resetting start markers on all currently-matched effects
  const nowRound = _currentRound();
  const nowTime = _nowWorldTime();

  for (const m of matches) {
    const duration = m.effect.duration ?? {};
    const rounds = _num(duration.rounds, 0);

    const updates = {
      "duration.startTime": nowTime
    };

    // If this effect uses combat rounds, refresh the round marker too.
    if (game.combat) {
      updates["duration.startRound"] = nowRound;

      // Defensive: if no-listed-duration spell drifted to 0 rounds, keep it as 1.
      if (Boolean(m.flags?.noListedDuration) && rounds <= 0) {
        updates["duration.rounds"] = 1;
      }
    }

    await requestUpdateDocument(m.effect, updates);
  }

  ui.notifications?.info?.(`${data.spellName} upkept.`);
}

/**
 * Cancel upkeep from a grouped upkeep prompt message (end the effect(s) now).
 * @param {ChatMessage} message
 */
export async function handleUpkeepGroupCancel(message) {
  const data = message?.flags?.["uesrpg-3ev4"]?.upkeepGroup;
  if (!data) return;

  const matches = await _collectCurrentEffectsForGroup(data.groupKey);
  if (!matches.length) return;
  // Permission-safe delete: group by target actor.
  const byActor = new Map();
  for (const m of matches) {
    const actor = m.targetActor;
    if (!actor) continue;
    const arr = byActor.get(actor) ?? [];
    arr.push(m.effect.id);
    byActor.set(actor, arr);
  }

  for (const [actor, ids] of byActor.entries()) {
    await requestDeleteEmbeddedDocuments(actor, "ActiveEffect", ids);
  }

  ui.notifications?.info?.(`${data.spellName} ended.`);
}
