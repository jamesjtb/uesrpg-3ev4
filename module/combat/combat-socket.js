/**
 * UESRPG Automated Combat - Socket transport (Phase 1)
 *
 * Responsibilities:
 * - Prompt defender for a reaction on the defender's owning client.
 * - If attacker cannot update defender actor (permissions), request GM to apply damage.
 */

const SOCKET_NAME = () => `system.${game.system.id}`;

/** @type {Map<string, (payload: any) => void>} */
const _pending = new Map();

function _uuid() {
  return (foundry?.utils?.randomID?.() ?? randomID());
}

function _emit(payload) {
  game.socket.emit(SOCKET_NAME(), payload);
}

function _resolvePending(requestId, payload) {
  const fn = _pending.get(requestId);
  if (fn) {
    _pending.delete(requestId);
    fn(payload);
  }
}

function _getActorById(actorId) {
  return game.actors?.get(actorId) ?? null;
}

async function _renderDefenseDialog({ requestId, attackerUserId, targetTokenUuid, targetActorUuid, targetActorId, suggestedDefense }) {
  const actor = await _resolveTargetActor({ targetTokenUuid, targetActorUuid, targetActorId });
  if (!actor) return;

  // Only the owner of the defender (or GM) should answer.
  if (!actor.isOwner && !game.user.isGM) return;

  const combatStyles = actor.items?.filter(i => i.type === "combatStyle") ?? [];
  const shields = actor.items?.filter(i => i.type === "armor" && i.system?.equipped && Number(i.system?.blockRating ?? 0) > 0) ?? [];

  const styleOptions = combatStyles.map(cs => {
    const tn = Number(cs.system?.value ?? 0) || 0;
    return `<option value="${cs.id}">${foundry.utils.escapeHTML(cs.name)} (TN ${tn})</option>`;
  }).join("");

  const shieldOptions = shields.map(sh => {
    const br = Number(sh.system?.blockRating ?? 0) || 0;
    return `<option value="${sh.id}">${foundry.utils.escapeHTML(sh.name)} (BR ${br})</option>`;
  }).join("");

  const defenseTypes = [
    { v: "none",  l: "No Reaction" },
    { v: "evade", l: "Evade" },
    { v: "parry", l: "Parry" },
    { v: "block", l: "Block (Shield)" },
    { v: "counter", l: "Counter-Attack" }
  ];

// (combat-socket.js) ~lines 45–70
async function _resolveTargetActor({ targetTokenUuid, targetActorUuid, targetActorId }) {
  // Prefer token UUID (works for synthetic/unlinked token actors)
  if (targetTokenUuid) {
    const doc = await fromUuid(targetTokenUuid);
    const actor = doc?.actor ?? doc?._object?.actor ?? null;
    if (actor) return actor;
  }

  // Fallback: actor UUID (works for linked actors)
  if (targetActorUuid) {
    const actor = await fromUuid(targetActorUuid);
    if (actor) return actor;
  }

  // Last resort: actorId (only for world actors)
  if (targetActorId) return _getActorById(targetActorId);

  return null;
}
  
  const defenseTypeOptions = defenseTypes.map(d => {
    const sel = (d.v === (suggestedDefense ?? "parry")) ? "selected" : "";
    return `<option value="${d.v}" ${sel}>${d.l}</option>`;
  }).join("");

  const content = `
    <form class="uesrpg-defense-dialog">
      <p><b>Incoming attack:</b> choose a reaction.</p>

      <div class="form-group">
        <label>Reaction</label>
        <select name="defenseType">${defenseTypeOptions}</select>
      </div>

      <div class="form-group">
        <label>Combat Style (TN)</label>
        <select name="combatStyleId">
          ${styleOptions || `<option value="">(no combat styles)</option>`}
        </select>
      </div>

      <div class="form-group">
        <label>Modifier</label>
        <input type="number" name="modifier" value="0" step="5"/>
      </div>

      <div class="form-group">
        <label>Shield (Block Rating)</label>
        <select name="shieldId">
          <option value="">(none)</option>
          ${shieldOptions}
        </select>
        <p style="font-size: 0.9em; opacity: 0.8; margin-top: 4px;">
          Only used if Reaction = Block.
        </p>
      </div>

      <div class="form-group">
        <label>Shield Arm (for Block)</label>
        <select name="shieldArm">
          <option value="l_arm" selected>Left Arm</option>
          <option value="r_arm">Right Arm</option>
        </select>
      </div>
    </form>
  `;

  const dlg = new Dialog({
    title: `Defense Reaction — ${actor.name}`,
    content,
    buttons: {
      ok: {
        label: "React",
        callback: async (html) => {
          const form = html[0].querySelector("form.uesrpg-defense-dialog");
          const defenseType = form.defenseType.value;
          const combatStyleId = form.combatStyleId.value;
          const modifier = Number(form.modifier.value ?? 0) || 0;
          const shieldId = form.shieldId.value || null;
          const shieldArm = form.shieldArm?.value || "l_arm";

          const cs = combatStyleId ? actor.items.get(combatStyleId) : null;
          const baseTN = Number(cs?.system?.value ?? 0) || 0;
          const tn = Math.max(0, baseTN + modifier);

          _emit({
            type: "uesrpgDefenseResponse",
            requestId,
            toUserId: attackerUserId,
            fromUserId: game.user.id,
            targetTokenUuid,
              targetActorUuid: actor.uuid,
            defenseType,
            tn,
            combatStyle: cs ? { id: cs.id, name: cs.name } : null,
            shieldArm,
            shield: shieldId ? (() => {
              const sh = actor.items.get(shieldId);
              return sh ? { id: sh.id, name: sh.name, br: Number(sh.system?.blockRating ?? 0) || 0 } : null;
            })() : null
          });
        }
      },
      none: {
        label: "No Reaction",
        callback: async () => {
          _emit({
            type: "uesrpgDefenseResponse",
            requestId,
            toUserId: attackerUserId,
            fromUserId: game.user.id,
            targetTokenUuid,
              targetActorUuid: actor.uuid,
            defenseType: "none",
            tn: 0,
            combatStyle: null,
            shieldArm: null,
            shield: null
          });
        }
      }
    },
    default: "ok"
  });

  dlg.render(true);
}

async function _gmApplyDamage({ requestId, toUserId, targetActorId, raw, type, locKey, mitigated }) {
  if (!game.user.isGM) return;

  const actor = _getActorById(targetActorId);
  if (!actor) {
    _emit({ type: "uesrpgApplyDamageResponse", requestId, toUserId, ok: false, error: "Target actor not found" });
    return;
  }

  try {
    const result = await actor.applyLocationDamage({ raw, type, locKey, mitigated });
    _emit({ type: "uesrpgApplyDamageResponse", requestId, toUserId, ok: true, result });
  } catch (err) {
    console.error("UESRPG | GM apply damage failed", err);
    _emit({ type: "uesrpgApplyDamageResponse", requestId, toUserId, ok: false, error: String(err?.message ?? err) });
  }
}

/**
 * Initialize socket listeners.
 */
export function initCombatSocket() {
  game.socket.on(SOCKET_NAME(), async (payload) => {
    if (!payload?.type) return;

    // Defender prompt: show only on defender's owning client(s)
    if (payload.type === "uesrpgDefensePrompt") {
      const { requestId, attackerUserId, targetTokenUuid, targetActorUuid, targetActorId, suggestedDefense } = payload;
      await _renderDefenseDialog({ requestId, attackerUserId, targetTokenUuid, targetActorUuid, targetActorId, suggestedDefense });
      return;
    }

    // Defender response: deliver only to intended attacker user
    if (payload.type === "uesrpgDefenseResponse") {
      if (payload.toUserId !== game.user.id) return;
      _resolvePending(payload.requestId, payload);
      return;
    }

    // GM apply damage request: GM only
    if (payload.type === "uesrpgApplyDamageRequest") {
      await _gmApplyDamage(payload);
      return;
    }

    // GM apply damage response: deliver only to requester
    if (payload.type === "uesrpgApplyDamageResponse") {
      if (payload.toUserId !== game.user.id) return;
      _resolvePending(payload.requestId, payload);
    }
  });
}

// (combat-socket.js) around lines ~220–260
export function requestDefenseReaction({ attackerUserId, targetTokenUuid, suggestedDefense = "parry" } = {}) {
  const requestId = _uuid();

  /** @type {(payload: any) => void} */
  let resolveFn;
  const p = new Promise((resolve) => {
    resolveFn = resolve;
    _pending.set(requestId, resolve);
  });

  _emit({
    type: "uesrpgDefensePrompt",
    requestId,
    attackerUserId,
    targetTokenUuid,
    suggestedDefense
  });

  // Safety timeout: if no response within 30s, treat as no reaction
  setTimeout(() => {
    if (!_pending.has(requestId)) return;
    _pending.delete(requestId);
    resolveFn({
      defenseType: "none",
      tn: 0,
      combatStyle: null,
      shield: null,
      shieldArm: null,
      timeout: true
    });
  }, 30_000);

  return p;
}

/**
 * Request GM to apply damage if current user does not have update permission.
 */
export function requestGMAppliedDamage({ targetActorId, raw, type = "physical", locKey = "body", mitigated = true } = {}) {
  const requestId = _uuid();
  const toUserId = game.user.id;

  const p = new Promise((resolve) => _pending.set(requestId, resolve));

  _emit({
    type: "uesrpgApplyDamageRequest",
    requestId,
    toUserId,
    targetActorId,
    raw,
    type,
    locKey,
    mitigated
  });

  // Safety timeout: if no GM response within 10s, fail gracefully
  setTimeout(() => {
    if (!_pending.has(requestId)) return;
    _pending.delete(requestId);
    resolve({ ok: false, error: "GM did not respond in time." });
  }, 10_000);

  return p;
}
