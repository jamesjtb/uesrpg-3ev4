/**
 * combat-socket.js
 * Deterministic opposed-defense prompt routing (v13-safe):
 * - attacker selects the intended defender userId and sends the prompt only to them
 * - defender client shows dialog and replies to attacker
 * - no more broadcast + heuristic gating
 */

const SOCKET = () => `system.${game.system.id}`;

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
  try { fn(payload); } catch (e) { console.error("UESRPG | pending resolver threw", e); }
}

async function _resolveTargetActor({ targetTokenUuid = null, targetActorUuid = null, targetActorId = null } = {}) {
  // Prefer token UUID (synthetic token actors)
  if (targetTokenUuid) {
    try {
      const doc = await fromUuid(targetTokenUuid);
      const a = doc?.actor ?? doc?.object?.actor ?? null;
      if (a) return a;
    } catch (_) {}
  }

  // Actor UUID
  if (targetActorUuid) {
    try {
      const a = await fromUuid(targetActorUuid);
      if (a) return a;
    } catch (_) {}
  }

  // World actorId
  if (targetActorId) return game.actors?.get(targetActorId) ?? null;

  return null;
}

function _getCombatStyles(actor) {
  return actor?.items?.filter(i => i.type === "combatStyle") ?? [];
}

function _escape(s) {
  return foundry.utils.escapeHTML(String(s ?? ""));
}

function _makeOptions(items, { labelFn, selectedId } = {}) {
  return (items ?? []).map(i => {
    const lab = labelFn ? labelFn(i) : i.name;
    const sel = (selectedId && selectedId === i.id) ? "selected" : "";
    return `<option value="${_escape(i.id)}" ${sel}>${_escape(lab)}</option>`;
  }).join("");
}

async function _renderDefenseDialog(payload) {
  const {
    requestId,
    toUserId,
    attackerUserId,
    targetTokenUuid,
    targetActorUuid,
    targetActorId,
    suggestedDefense = "parry"
  } = payload;

  // Hard routing: only the addressed user may handle this prompt.
  if (toUserId && toUserId !== game.user.id) return;

  const actor = await _resolveTargetActor({ targetTokenUuid, targetActorUuid, targetActorId });
  if (!actor) {
    // If we cannot resolve actor on defender side, respond "none" so attacker can proceed.
    _emit({
      type: "uesrpgDefenseResponse",
      requestId,
      toUserId: attackerUserId,
      fromUserId: game.user.id,
      defenseType: "none",
      tn: 0,
      timeout: false,
      error: "Defender could not resolve target actor"
    });
    return;
  }

  const combatStyles = _getCombatStyles(actor);
  const defaultStyleId = combatStyles[0]?.id ?? "";

  const defenseTypes = [
    { v: "parry",  l: "Parry" },
    { v: "evade",  l: "Evade" },
    { v: "block",  l: "Block" },
    { v: "counter", l: "Counter-Attack" }
  ];

  const defenseTypeOptions = defenseTypes.map(d => {
    const sel = (d.v === suggestedDefense) ? "selected" : "";
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
          ${combatStyles.length ? _makeOptions(combatStyles, {
            selectedId: defaultStyleId,
            labelFn: (cs) => `${cs.name} (TN ${Number(cs.system?.value ?? 0) || 0})`
          }) : `<option value="">(no combat styles)</option>`}
        </select>
      </div>

      <div class="form-group">
        <label>Modifier</label>
        <input type="number" name="modifier" value="0" step="5"/>
      </div>

      <div class="form-group">
        <label>Shield Arm (Block)</label>
        <select name="shieldArm">
          <option value="l_arm" selected>Left Arm</option>
          <option value="r_arm">Right Arm</option>
        </select>
      </div>
    </form>
  `;

  new Dialog({
    title: `Defense Reaction — ${actor.name}`,
    content,
    buttons: {
      ok: {
        label: "React",
        callback: (html) => {
          const form = html[0].querySelector("form.uesrpg-defense-dialog");
          const defenseType = form.defenseType.value;
          const combatStyleId = form.combatStyleId.value;
          const modifier = Number(form.modifier.value ?? 0) || 0;
          const shieldArm = form.shieldArm?.value || "l_arm";

          const cs = combatStyleId ? actor.items.get(combatStyleId) : null;
          const baseTN = Number(cs?.system?.value ?? 0) || 0;
          const tn = Math.max(0, baseTN + modifier);

          _emit({
            type: "uesrpgDefenseResponse",
            requestId,
            toUserId: attackerUserId,
            fromUserId: game.user.id,
            defenseType,
            tn,
            combatStyle: cs ? { id: cs.id, name: cs.name } : null,
            shieldArm
          });
        }
      },
      none: {
        label: "No Reaction",
        callback: () => {
          _emit({
            type: "uesrpgDefenseResponse",
            requestId,
            toUserId: attackerUserId,
            fromUserId: game.user.id,
            defenseType: "none",
            tn: 0,
            combatStyle: null,
            shieldArm: null
          });
        }
      }
    },
    default: "ok"
  }).render(true);
}

/**
 * Initialize socket listeners (runs on every client via initAutomatedCombat()).
 */
export function initCombatSocket() {
  console.log("UESRPG | initCombatSocket register", SOCKET());

  game.socket.on(SOCKET(), async (payload) => {
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

    if (payload.type === "uesrpgApplyDamageResponse") {
      if (payload.toUserId !== game.user.id) return;
      _resolvePending(payload.requestId, payload);
    }
  });
}

/**
 * Ask the addressed defender user for a reaction.
 * NOTE: If defenderUserId is null, caller should treat as "none" immediately.
 */
export function requestDefenseReaction({
  attackerUserId,
  defenderUserId,
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
    toUserId: defenderUserId,          // ROUTED
    attackerUserId,
    targetTokenUuid,
    targetActorUuid,
    targetActorId,
    suggestedDefense
  });

  setTimeout(() => {
    if (!_pending.has(requestId)) return;
    _pending.delete(requestId);
    resolveFn({ defenseType: "none", tn: 0, timeout: true });
  }, 30_000);

  return p;
}

/**
 * GM applied damage request/response removed here for brevity.
 * Keep your existing requestGMAppliedDamage implementation if needed.
 */
export async function requestGMAppliedDamage(_) {
  throw new Error("requestGMAppliedDamage not included in this routed-opposed patch. Keep your existing version.");
}
