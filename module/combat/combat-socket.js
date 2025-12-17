// combat-socket.js
// System socket utilities for opposed defense prompts + GM-applied damage

const SYS_ID = "uesrpg-3ev4";
const SOCKET = () => `system.${game.system.id ?? SYS_ID}`;

const _pending = new Map();

function _uuid() {
  return foundry.utils.randomID();
}

function _emit(payload) {
  game.socket.emit(SOCKET(), payload);
}

function _resolvePending(requestId, payload) {
  const fn = _pending.get(requestId);
  if (!fn) return;
  _pending.delete(requestId);
  try {
    fn(payload);
  } catch (e) {
    console.error("UESRPG | pending resolver threw", e);
  }
}

async function _resolveTargetActor({ targetTokenUuid = null, targetActorUuid = null, targetActorId = null } = {}) {
  // Prefer token UUID (most precise in-scene)
  if (targetTokenUuid) {
    try {
      const doc = await fromUuid(targetTokenUuid);
      const a = doc?.actor ?? doc?.object?.actor ?? null;
      if (a) return a;
    } catch (e) {
      // ignore
    }
  }

  // Then actor UUID
  if (targetActorUuid) {
    try {
      const a = await fromUuid(targetActorUuid);
      if (a) return a;
    } catch (e) {
      // ignore
    }
  }

  // Finally actor id (world id)
  if (targetActorId) {
    const a = game.actors?.get(targetActorId) ?? null;
    if (a) return a;
  }

  return null;
}

function _getCombatStyles(actor) {
  return actor?.items?.filter(i => i.type === "combatStyle") ?? [];
}

function _getShields(actor) {
  // If your system uses a different item.type for shields, adjust here.
  return actor?.items?.filter(i => i.type === "armor" && (i.system?.category === "shield" || i.system?.item_cat?.shield)) ?? [];
}

function _escape(s) {
  return foundry.utils.escapeHTML(String(s ?? ""));
}

function _makeOptions(items, { labelFn, valueFn, selectedId } = {}) {
  return (items ?? []).map(i => {
    const val = valueFn ? valueFn(i) : i.id;
    const lab = labelFn ? labelFn(i) : i.name;
    const sel = (selectedId && selectedId === i.id) ? "selected" : "";
    return `<option value="${_escape(val)}" ${sel}>${_escape(lab)}</option>`;
  }).join("");
}

async function _renderDefenseDialog({
  requestId,
  attackerUserId,
  targetTokenUuid = null,
  targetActorUuid = null,
  targetActorId = null,
  suggestedDefense = "parry"
}) {
  const actor = await _resolveTargetActor({ targetTokenUuid, targetActorUuid, targetActorId });
  if (!actor) return;

  // IMPORTANT: Only show the dialog to someone who can act for this defender.
  // This is what makes it work in multi-user: the owning player(s) will see it.
  if (!(game.user.isGM || actor.isOwner)) return;

  const combatStyles = _getCombatStyles(actor);
  if (!combatStyles.length) {
    // Defender has no combat styles; auto "no reaction"
    _emit({
      type: "uesrpgDefenseResponse",
      requestId,
      toUserId: attackerUserId,
      fromUserId: game.user.id,
      targetTokenUuid: targetTokenUuid ?? null,
      targetActorUuid: actor.uuid,
      targetActorId: actor.id,
      defenseType: "none",
      tn: 0,
      combatStyle: null,
      shieldArm: null,
      shield: null
    });
    return;
  }

  const shields = _getShields(actor);
  const defaultStyleId = combatStyles[0].id;

  const content = `
    <form class="uesrpg-defense-dialog">
      <div class="form-group">
        <label>Reaction</label>
        <select name="defenseType">
          <option value="parry" ${suggestedDefense === "parry" ? "selected" : ""}>Parry</option>
          <option value="evade" ${suggestedDefense === "evade" ? "selected" : ""}>Evade</option>
          <option value="block" ${suggestedDefense === "block" ? "selected" : ""}>Block</option>
          <option value="counter" ${suggestedDefense === "counter" ? "selected" : ""}>Counter-Attack</option>
        </select>
      </div>

      <div class="form-group">
        <label>Combat Style (TN)</label>
        <select name="combatStyleId">
          ${_makeOptions(combatStyles, {
            selectedId: defaultStyleId,
            labelFn: (cs) => `${cs.name} (TN ${Number(cs.system?.value ?? 0) || 0})`
          })}
        </select>
      </div>

      <div class="form-group">
        <label>Modifier</label>
        <input type="number" name="modifier" value="0" step="5"/>
      </div>

      <div class="form-group">
        <label>Shield (for Block)</label>
        <select name="shieldId">
          <option value="">— None —</option>
          ${shields.map(sh => `<option value="${_escape(sh.id)}">${_escape(sh.name)} (BR ${Number(sh.system?.blockRating ?? 0) || 0})</option>`).join("")}
        </select>
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

          const shield = shieldId ? (() => {
            const sh = actor.items.get(shieldId);
            return sh ? { id: sh.id, name: sh.name, br: Number(sh.system?.blockRating ?? 0) || 0 } : null;
          })() : null;

          _emit({
            type: "uesrpgDefenseResponse",
            requestId,
            toUserId: attackerUserId,
            fromUserId: game.user.id,
            targetTokenUuid: targetTokenUuid ?? null,
            targetActorUuid: actor.uuid,
            targetActorId: actor.id,
            defenseType,
            tn,
            combatStyle: cs ? { id: cs.id, name: cs.name } : null,
            shieldArm,
            shield
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
            targetTokenUuid: targetTokenUuid ?? null,
            targetActorUuid: actor.uuid,
            targetActorId: actor.id,
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

async function _gmApplyDamage({
  requestId,
  toUserId,
  targetTokenUuid = null,
  targetActorUuid = null,
  targetActorId = null,
  raw,
  type,
  locKey,
  mitigated
}) {
  if (!game.user.isGM) return;

  const actor = await _resolveTargetActor({ targetTokenUuid, targetActorUuid, targetActorId });
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
 * Must run on EVERY client (GM + all players).
 */
export function initCombatSocket() {
  console.log("UESRPG | initCombatSocket register", SOCKET());
  game.socket.on(SOCKET(), async (payload) => {
    if (!payload?.type) return;

    if (payload.type === "uesrpgDefensePrompt") {
      const {
        requestId,
        attackerUserId,
        targetTokenUuid,
        targetActorUuid,
        targetActorId,
        suggestedDefense
      } = payload;

      await _renderDefenseDialog({
        requestId,
        attackerUserId,
        targetTokenUuid,
        targetActorUuid,
        targetActorId,
        suggestedDefense
      });
      return;
    }

    if (payload.type === "uesrpgDefenseResponse") {
      if (payload.toUserId !== game.user.id) return;
      _resolvePending(payload.requestId, payload);
      return;
    }

    if (payload.type === "uesrpgApplyDamageRequest") {
      await _gmApplyDamage(payload);
      return;
    }

    if (payload.type === "uesrpgApplyDamageResponse") {
      if (payload.toUserId !== game.user.id) return;
      _resolvePending(payload.requestId, payload);
    }
  });
}

/**
 * Ask defender (their owning player) for a reaction.
 * Returns: { defenseType, tn, shield, shieldArm, ... }
 */
export function requestDefenseReaction({
  attackerUserId,
  targetTokenUuid = null,
  targetActorUuid = null,
  targetActorId = null,
  suggestedDefense = "parry"
} = {}) {
  const requestId = _uuid();

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
    targetActorUuid,
    targetActorId,
    suggestedDefense
  });

  // Safety timeout: if no response within 30s, treat as no reaction
  setTimeout(() => {
    if (!_pending.has(requestId)) return;
    _pending.delete(requestId);

    // FIX: was calling "resolve" (undefined) which crashes opposed flow.
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
export function requestGMAppliedDamage({
  targetTokenUuid = null,
  targetActorUuid = null,
  targetActorId = null,
  raw,
  type = "physical",
  locKey = "body",
  mitigated = true
} = {}) {
  const requestId = _uuid();
  const toUserId = game.user.id;

  let resolveFn;
  const p = new Promise((resolve) => {
    resolveFn = resolve;
    _pending.set(requestId, resolve);
  });

  _emit({
    type: "uesrpgApplyDamageRequest",
    requestId,
    toUserId,
    targetTokenUuid,
    targetActorUuid,
    targetActorId,
    raw,
    type,
    locKey,
    mitigated
  });

  setTimeout(() => {
    if (!_pending.has(requestId)) return;
    _pending.delete(requestId);
    resolveFn({ ok: false, error: "GM did not respond in time." });
  }, 10_000);

  return p;
}
