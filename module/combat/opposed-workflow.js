/**
 * module/combat/opposed-workflow.js
 * Opposed test workflow (WFRP-like) for UESRPG 3ev4.
 *
 * v3: Chat-card button wiring support
 *  - Attacker and Defender roll on their own clients (permission-gated)
 *  - Results stored on ChatMessage flags: flags["uesrpg-3ev4"].opposed
 *  - When both results are present, outcome is resolved using degree-roll-helper resolveOpposed()
 *
 * NOTE: This does NOT yet implement weapon damage workflow; that comes next.
 */

import { doTestRoll, resolveOpposed } from "../helpers/degree-roll-helper.js";

function _resolveDoc(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch (e) { return null; }
}

function _resolveTokenFromDoc(doc) {
  if (!doc) return null;
  if (doc.documentName === "Token") return doc.object ?? null;
  if (doc.actor && doc.document) return doc;
  return null;
}

function _resolveActorFromDoc(doc) {
  if (!doc) return null;
  if (doc.documentName === "Actor") return doc;
  if (doc.documentName === "Token") return doc.actor ?? null;
  if (doc.actor) return doc.actor;
  return null;
}

function _fmtDegree(res) {
  if (!res) return "—";
  return res.isSuccess ? `${res.degree} DoS` : `${res.degree} DoF`;
}

function _renderPendingCard(data) {
  const a = data.attacker;
  const d = data.defender;

  const aLine = a.result
    ? `<div><b>Target:</b> ${a.target}</div><div><b>Roll:</b> ${a.result.total} — ${_fmtDegree(a.result)}</div>`
    : `<div><b>Target:</b> ${a.target ?? "—"}</div>`;

  const dLine = d.noDefense
    ? `<div><b>Defense:</b> No Defense</div>`
    : d.result
      ? `<div><b>Target:</b> ${d.target}</div><div><b>Roll:</b> ${d.result.total} — ${_fmtDegree(d.result)}</div>`
      : `<div><b>Defense:</b> (choose)</div>`;

  const statusHtml = data.outcome
    ? `<div class="ues-opposed-status"><b>Outcome:</b> ${data.outcome.text ?? ""}</div>`
    : `<div class="ues-opposed-status"><i>Pending: waiting for rolls</i></div>`;

  return `
  <div class="ues-opposed-card" data-message-id="${data.messageId ?? ""}">
    <h2>Opposed Test</h2>
    <div class="ues-opposed-row" style="display:flex; gap:16px;">
      <div class="ues-opposed-side" style="flex:1;">
        <h3>${a.name}</h3>
        <div><b>Test:</b> ${a.label}</div>
        ${aLine}
        ${a.result ? "" : `<button type="button" data-ues-opposed-action="attacker-roll" data-side="attacker">Roll</button>`}
      </div>
      <div class="ues-opposed-side" style="flex:1;">
        <h3>${d.name}</h3>
        ${dLine}
        ${(!d.result && !d.noDefense) ? `<button type="button" data-ues-opposed-action="defender-roll" data-side="defender">Defend</button>` : ""}
        ${(!d.result && !d.noDefense) ? `<button type="button" data-ues-opposed-action="defender-nodefense" data-side="defender">No Defense</button>` : ""}
      </div>
    </div>
    ${statusHtml}
  </div>`;
}

async function _updateMessageCard(message, data) {
  await message.update({
    content: _renderPendingCard({ ...data, messageId: message.id }),
    flags: { "uesrpg-3ev4": { opposed: data } }
  });
}

function _canControlActor(actor) {
  return game.user.isGM || actor?.isOwner;
}

async function _chooseDefense(defenderActor) {
  // Minimal v1: defender chooses among combat styles and skills
  const items = defenderActor.items ?? [];
  const options = [];
  for (const it of items) {
    if (it.type === "combatStyle" || it.type === "skill") {
      const tn = Number(String(it.system?.value ?? it.system?.total ?? "").match(/-?\d+(?:\.\d+)?/)?.[0] ?? 0);
      options.push({ uuid: it.uuid, label: `${it.name} (${tn})`, tn, name: it.name });
    }
  }

  // Fallback to AGI for evade if no skills exist
  if (options.length === 0) {
    const agi = Number(defenderActor.system?.characteristics?.agi?.total ?? defenderActor.system?.characteristics?.agi?.value ?? 0);
    options.push({ uuid: null, label: `Evade (AGI ${agi})`, tn: agi, name: "Evade" });
  }

  const select = options.map((o, i) => `<option value="${i}">${o.label}</option>`).join("");

  const content = `
    <form>
      <div class="form-group">
        <label>Defense</label>
        <select name="defIndex">${select}</select>
      </div>
    </form>`;

  const result = await Dialog.wait({
    title: `${defenderActor.name}: Choose Defense`,
    content,
    buttons: {
      ok: {
        label: "Defend",
        callback: (html) => {
          const i = Number((html instanceof HTMLElement ? html : html?.[0])?.querySelector('select[name="defIndex"]').value);
          return options[i];
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "ok"
  });

  return result ?? null;
}

export const OpposedWorkflow = {
  /**
   * Create a pending opposed test chat card.
   * Expected cfg fields:
   *  - attackerTokenUuid, defenderTokenUuid (preferred)
   *  - attackerActorUuid, defenderActorUuid (fallback)
   *  - attackerItemUuid, attackerLabel, attackerTarget
   */
  async createPending(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid);
    const dDoc = _resolveDoc(cfg.defenderTokenUuid) ?? _resolveDoc(cfg.defenderActorUuid);

    const aToken = _resolveTokenFromDoc(aDoc);
    const dToken = _resolveTokenFromDoc(dDoc);

    const attacker = _resolveActorFromDoc(aDoc);
    const defender = _resolveActorFromDoc(dDoc);

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed test requires both an attacker and a defender (token or actor).");
      return null;
    }

    const data = {
      status: "pending",
      attacker: {
        tokenUuid: aToken?.document?.uuid ?? null,
        actorUuid: attacker.uuid,
        name: attacker.name,
        label: cfg.attackerLabel ?? "Opposed Test",
        target: Number(cfg.attackerTarget) || 0,
        itemUuid: cfg.attackerItemUuid ?? null,
        result: null
      },
      defender: {
        tokenUuid: dToken?.document?.uuid ?? null,
        actorUuid: defender.uuid,
        name: defender.name,
        label: null,
        target: null,
        result: null,
        noDefense: false
      },
      outcome: null
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
      content: _renderPendingCard({ ...data, messageId: "" }),
      flags: { "uesrpg-3ev4": { opposed: data } }
    });

    await message.update({ content: _renderPendingCard({ ...data, messageId: message.id }) });
    return message;
  },

  /**
   * Handle a chat-card action click.
   * @param {ChatMessage} message
   * @param {string} action
   */
  async handleAction(message, action) {
    const data = message?.flags?.["uesrpg-3ev4"]?.opposed;
    if (!data) return;

    const attacker = _resolveActorFromDoc(_resolveDoc(data.attacker.actorUuid));
    const defender = _resolveActorFromDoc(_resolveDoc(data.defender.actorUuid));

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed test actors could not be resolved.");
      return;
    }

    if (action === "attacker-roll") {
      if (!_canControlActor(attacker)) {
        ui.notifications.warn("You do not have permission to roll for the attacker.");
        return;
      }
      if (data.attacker.result) return;

      const tn = Number(data.attacker.target) || 0;
      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: tn, allowLucky: false, allowUnlucky: false });
      data.attacker.result = { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, textual: res.textual };
      await _updateMessageCard(message, data);
    }

    if (action === "defender-nodefense") {
      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to choose defender actions.");
        return;
      }
      if (data.defender.result || data.defender.noDefense) return;

      data.defender.noDefense = true;
      data.defender.target = 0;
      // Defender has no roll; treat as automatic failure in resolution step
      data.defender.result = { total: 100, isSuccess: false, degree: 1 };
      await _updateMessageCard(message, data);
    }

    if (action === "defender-roll") {
      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to roll for the defender.");
        return;
      }
      if (data.defender.result || data.defender.noDefense) return;

      const choice = await _chooseDefense(defender);
      if (!choice) return;

      data.defender.label = choice.name;
      data.defender.target = Number(choice.tn) || 0;

      const res = await doTestRoll(defender, { rollFormula: "1d100", target: data.defender.target, allowLucky: false, allowUnlucky: false });
      data.defender.result = { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, textual: res.textual };
      await _updateMessageCard(message, data);
    }

    // Resolve if both are present
    if (data.attacker.result && data.defender.result && !data.outcome) {
      const aRes = { ...data.attacker.result, target: data.attacker.target, label: data.attacker.label };
      const dRes = { ...data.defender.result, target: data.defender.target, label: data.defender.label ?? "Defense" };
      const outcome = resolveOpposed(aRes, dRes);

      // Produce a readable outcome line
      let text = "";
      if (outcome?.winner === "attacker") text = `${data.attacker.name} wins`;
      else if (outcome?.winner === "defender") text = `${data.defender.name} wins`;
      else text = `Draw`;

      if (outcome?.reason) text += ` — ${outcome.reason}`;

      data.outcome = { winner: outcome?.winner ?? null, reason: outcome?.reason ?? null, text };
      data.status = "resolved";
      await _updateMessageCard(message, data);
    }
  }
};
