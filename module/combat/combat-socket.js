/**
 * UESRPG Automated Combat - Socket transport (Phase 1)
 *
 * Fixes:
 * - Resolve defender from Token UUID (synthetic/unlinked tokens supported)
 * - Defender prompt permission: allow if user is GM OR token is owned/controlled OR actor is owner
 * - Add debug logs so we can see if socket messages arrive and why prompts may not render
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

async function _resolveTokenDoc(targetTokenUuid) {
  if (!targetTokenUuid) return null;
  try {
    const doc = await fromUuid(targetTokenUuid);
    // Expect TokenDocument
    return doc ?? null;
  } catch (e) {
    console.warn("UESRPG | fromUuid(token) failed", e);
    return null;
  }
}

async function _resolveActorDoc(targetActorUuid) {
  if (!targetActorUuid) return null;
  try {
    const a = await fromUuid(targetActorUuid);
    return a ?? null;
  } catch (e) {
    console.warn("UESRPG | fromUuid(actor) failed", e);
    return null;
  }
}

/**
 * Resolve (tokenDoc, actor) reliably across:
 * - Unlinked / synthetic token actors (prefer token UUID)
 * - Linked/world actors (actor UUID or actorId)
 */
async function _resolveTarget({ targetTokenUuid, targetActorUuid, targetActorId }) {
  const tokenDoc = await _resolveTokenDoc(targetTokenUuid);

  // Primary: tokenDoc.actor handles synthetic actors
  if (tokenDoc?.actor) return { tokenDoc, actor: tokenDoc.actor };

  // Fallback: actor UUID
  const actorFromUuid = await _resolveActorDoc(targetActorUuid);
  if (actorFromUuid) return { tokenDoc, actor: actorFromUuid };

  // Last: world actorId
  if (targetActorId) {
    const a = _getActorById(targetActorId);
    if (a) return { tokenDoc, actor: a };
  }

  return { tokenDoc, actor: null };
}

/**
 * Decide whether this client should show the defender reaction dialog.
 * We allow:
 * - GM always
 * - Token ownership (TokenDocument permissions)
 * - Token is controlled by this user (common for unlinked tokens / PCs)
 * - Actor ownership (linked actor permissions)
 */
function _shouldShowDefensePrompt({ tokenDoc, actor }) {
  if (game.user.isGM) return true;

  // Token permission (preferred for synthetic actors)
  if (tokenDoc?.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return true;
  if (tokenDoc?.isOwner) return true;

  // Token controlled (player has the token selected)
  const tokenObj = tokenDoc?._object ?? canvas.tokens?.get(tokenDoc?.id) ?? null;
  if (tokenObj?.isControlled) return true;

  // Actor permission (works for linked actors)
  if (actor?.isOwner) return true;

  return false;
}

async function _renderDefenseDialog({
  requestId,
  attackerUserId,
  targetTokenUuid,
  targetActorUuid,
  targetActorId,
  suggestedDefense
}) {
  const { tokenDoc, actor } = await _resolveTarget({ targetTokenUuid, targetActorUuid, targetActorId });

  console.log("UESRPG | DefensePrompt received", {
    requestId,
    attackerUserId,
    targetTokenUuid,
    targetActorUuid,
    targetActorId,
    resolvedActor: actor?.name ?? null,
    tokenId: tokenDoc?.id ?? null,
    isGM: game.user.isGM,
    actorIsOwner: actor?.isOwner ?? null,
    tokenIsOwner: tokenDoc?.isOwner ?? null
  });

  if (!actor) {
    console.warn("UESRPG | DefensePrompt: could not resolve actor");
    return;
  }

  if (!_shouldShowDefensePrompt({ tokenDoc, actor })) {
    console.warn("UESRPG | DefensePrompt: blocked by permission gate", {
      actor: actor.name,
      actorIsOwner: actor.isOwner,
      tokenIsOwner: tokenDoc?.isOwner,
      tokenControlled: (tokenDoc?._object?.isControlled ?? false)
    });
    return;
  }

  const combatStyles = actor.items?.filter(i => i.type === "combatStyle") ?? [];
  const shields = actor.items?.filter(i =>
    i.type === "armor" &&
    i.system?.equipped &&
    Number(i.system?.blockRating ?? 0) > 0
  ) ?? [];

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
            targetTokenUuid: targetTokenUuid ?? null,
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
            targetTokenUuid: targetTokenUuid ?? null,
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

async function _gmApplyDamage({
  requestId,
  toUserId,
  targetTokenUuid,
  targetActorUuid,
  targetActorId,
  raw,
  type,
  locKey,
  mitigated
}) {
  if (!game.user.isGM) return;

  const { actor } = await _resolveTarget({ targetTokenUuid, targetActorUuid, targetActorId });

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

export function initCombatSocket() {
  console.log("UESRPG | initCombatSocket register", SOCKET_NAME());

  game.socket.on(SOCKET_NAME(), async (payload) => {
    if (!payload?.type) return;

    if (payload.type === "uesrpgDefensePrompt") {
      await _renderDefenseDialog(payload);
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
 * Ask defender for a reaction. Returns a payload; if no response in 30s -> none.
 */
export function requestDefenseReaction({
  attackerUserId,
  targetTokenUuid,
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
    targetTokenUuid: targetTokenUuid ?? null,
    targetActorUuid,
    targetActorId,
    suggestedDefense
  });

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
