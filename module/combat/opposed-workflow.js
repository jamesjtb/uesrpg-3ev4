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

import { doTestRoll } from "../helpers/degree-roll-helper.js";
import { DefenseDialog } from "./defense-dialog.js";
import { computeTN, listCombatStyles, variantMod as computeVariantMod } from "./tn.js";

function _asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
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
    case "allOut": return "All Out Attack";
    case "precision": return "Precision Strike";
    case "coup": return "Coup de Grâce";
    case "normal":
    default: return "Normal Attack";
  }
}

function _btn(label, action, extraDataset = {}) {
  const ds = Object.entries(extraDataset)
    .map(([k, v]) => `data-${k}="${String(v).replace(/\"/g, "&quot;")}"`)
    .join(" ");
  return `<button type="button" data-ues-opposed-action="${action}" ${ds}>${label}</button>`;
}

function _debugEnabled() {
  return Boolean(game.settings.get("uesrpg-3ev4", "opposedDebug"));
}

function _logDebug(event, payload) {
  if (!_debugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`UESRPG Opposed | ${event}`, payload);
  } catch (_e) {}
}

function _renderBreakdown(tnObj) {
  if (!_debugEnabled()) return "";
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

function _renderCard(data, messageId) {
  const a = data.attacker;
  const d = data.defender;

  const baseA = Number(a.baseTarget ?? 0);
  const modA = Number(a.totalMod ?? 0);
  const finalA = baseA + modA;
  const aTargetLabel = (a.hasDeclared === true)
    ? `${finalA}${modA ? ` (${modA >= 0 ? "+" : ""}${modA})` : ""}`
    : `${baseA}`;

  const aVariantText = a.hasDeclared
    ? (a.variantLabel ?? "Normal Attack")
    : "—";

  const dTargetLabel = d.noDefense
    ? "0"
    : (d.targetLabel ?? (d.target ?? "—"));

  const dTestLabel = d.label ?? "(choose)";

  const attackerActions = a.result
    ? ""
    : `<div style="margin-top:6px;">${_btn("Roll Attack", "attacker-roll")}</div>`;

  const defenderActions = (d.result || d.noDefense)
    ? ""
    : `
      <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
        ${_btn("Defend", "defender-roll")}
        ${_btn("No Defense", "defender-nodefense")}
      </div>`;

  const outcomeLine = data.outcome
    ? `<div style="margin-top:10px;"><b>Outcome:</b> ${data.outcome.text ?? ""}</div>`
    : `<div style="margin-top:10px;"><i>Pending</i></div>`;

  return `
  <div class="ues-opposed-card" data-message-id="${messageId}" style="padding:6px 6px;">
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start;">
      <div style="padding-right:10px; border-right:1px solid rgba(0,0,0,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Attacker</div>
          <div style="font-size:13px;"><b>${a.tokenName ?? a.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Test:</b> ${a.label}</div>
          <div><b>Attack:</b> ${aVariantText}</div>
          <div><b>TN:</b> ${aTargetLabel}${a.result ? ` &nbsp; <b>Roll:</b> ${a.result.rollTotal} — ${_fmtDegree(a.result)}` : ""}</div>
          ${_renderBreakdown(a.tn)}
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
          <div><b>TN:</b> ${dTargetLabel}${(d.noDefense || d.result) ? ` &nbsp; <b>Roll:</b> ${d.noDefense ? 100 : d.result.rollTotal} — ${d.noDefense ? "1 DoF" : _fmtDegree(d.result)}` : ""}</div>
          ${_renderBreakdown(d.tn)}
        </div>
        ${defenderActions}
      </div>
    </div>
    ${outcomeLine}
  </div>`;
}

async function _updateCard(message, data) {
  // Touch context for diagnostics
  data.context = data.context ?? {};
  data.context.schemaVersion = data.context.schemaVersion ?? 1;
  data.context.updatedAt = Date.now();
  data.context.updatedBy = game.user.id;

  await message.update({
    content: _renderCard(data, message.id),
    flags: { "uesrpg-3ev4": { opposed: data } }
  });
}

async function _attackerDeclareDialog(attackerLabel, { styles = [], selectedStyleUuid = null, defaultVariant = "normal", defaultManual = 0 } = {}) {
  const showStyleSelect = Array.isArray(styles) && styles.length >= 2;

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

    /* Force dialog footer buttons to be a single row, 2 columns */
    .dialog .dialog-buttons { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .dialog .dialog-buttons button { width: 100%; }
  </style>

  <form class="uesrpg-attack-declare">
    ${styleSelect}

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

      <label>
        <input type="radio" name="attackVariant" value="precision" ${defaultVariant === "precision" ? "checked" : ""} />
        <b>Precision Strike</b> — -20
        <span class="hint">If successful, choose hit location.</span>
      </label>

      <label>
        <input type="radio" name="attackVariant" value="coup" ${defaultVariant === "coup" ? "checked" : ""} />
        <b>Coup de Grâce</b>
        <span class="hint">Helpless target only. Flags special resolution.</span>
      </label>
    </div>

    <div class="form-group" style="margin-top:12px;">
      <label><b>Manual Modifier</b> (TN adjustment, e.g. -20 / +10)</label>
      <input name="manualMod" type="number" value="${Number(defaultManual) || 0}" style="width:100%;" />
    </div>
  </form>
`;

  try {
    const result = await Dialog.wait({
      title: `${attackerLabel} — Attack Options`,
      content,
      buttons: {
        ok: {
          label: "Continue",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            const styleUuid = root?.querySelector('select[name="styleUuid"]')?.value
              ?? root?.querySelector('input[name="styleUuid"]')?.value
              ?? "";
            const variant = root?.querySelector('input[name="attackVariant"]:checked')?.value ?? "normal";
            const raw = root?.querySelector('input[name="manualMod"]')?.value ?? "0";
            const manualMod = Number.parseInt(String(raw), 10) || 0;
            return { styleUuid, variant, manualMod };
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => null
        }
      },
      default: "ok"
    }, { width: 460 });
    return result ?? null;
  } catch (_e) {
    // Dialog.wait rejects when closed via X/ESC without a choice.
    return null;
  }
}

function _resolveOutcomeRAW(data) {
  const a = data.attacker;
  const d = data.defender;

  const A = a.result;
  const D = d.result;
  if (!A || !D) return null;

  const defenseType = d.defenseType ?? "none";

  // Helper: both fail clause from RAW Step 3.
  const bothFail = (!A.isSuccess && !D.isSuccess);

  // No defense: attacker wins if they succeeded; otherwise nothing resolves.
  if (defenseType === "none") {
    if (A.isSuccess) return { winner: "attacker", text: `${a.name} wins — attack hits.` };
    return { winner: "tie", text: `Both fail — neither resolves.` };
  }

  // Attack vs Block: successful block wins regardless of attacker DoS.
  if (defenseType === "block") {
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
    if (A.degree > D.degree) return { winner: "attacker", text: `${a.name} hits ${d.name} (Counter-Attack).` };
    if (D.degree > A.degree) return { winner: "defender", text: `${d.name} hits ${a.name} (Counter-Attack).` };
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
  if (A.degree > D.degree) return { winner: "attacker", text: `${a.name} wins — attack hits.` };
  if (D.degree > A.degree) return { winner: "defender", text: `${d.name} wins — defense holds.` };
  return { winner: "tie", text: `Both pass — no resolution.` };
}

export const OpposedWorkflow = {
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

    const baseTarget = Number(cfg.attackerTarget ?? 0);

    const data = {
      context: {
        schemaVersion: 1,
        createdAt: Date.now(),
        createdBy: game.user.id,
        updatedAt: Date.now(),
        updatedBy: game.user.id
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
        label: null,
        target: null,
        defenseType: null,
        result: null,
        noDefense: false,
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
      attackerUuid: data.attacker.actorUuid,
      defenderUuid: data.defender.actorUuid,
      mode: data.mode
    });

    return message;
  },

  async handleAction(message, action) {
    const data = message?.flags?.["uesrpg-3ev4"]?.opposed;
    if (!data) return;

    const attacker = _resolveActor(data.attacker.actorUuid);
    const defender = _resolveActor(data.defender.actorUuid);
    const aToken = _resolveToken(data.attacker.tokenUuid);
    const dToken = _resolveToken(data.defender.tokenUuid);

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed Test: could not resolve attacker/defender.");
      return;
    }

    // --- Attacker Roll ---
    if (action === "attacker-roll") {
      if (data.attacker.result) return;
      if (!_canControlActor(attacker)) {
        ui.notifications.warn("You do not have permission to roll for the attacker.");
        return;
      }

      // One dialog only: (optional) combat style selector + attack variant + manual modifier.
      const styles = listCombatStyles(attacker);
      const selectedStyleUuid = styles.find(s => s.uuid === data.attacker.itemUuid)?.uuid ?? styles[0]?.uuid ?? data.attacker.itemUuid ?? null;

      const decl = await _attackerDeclareDialog(data.attacker.label ?? "Attack", {
        styles,
        selectedStyleUuid,
        defaultVariant: data.attacker.variant ?? "normal",
        defaultManual: data.attacker.manualMod ?? 0
      });
      if (!decl) return;

      // If the attacker selected a different combat style, switch base TN + label now.
      if (decl.styleUuid && decl.styleUuid !== data.attacker.itemUuid) {
        const chosen = styles.find(s => s.uuid === decl.styleUuid) ?? null;
        if (chosen) {
          data.attacker.itemUuid = chosen.uuid;
          data.attacker.label = chosen.name;
        }
      }

      const manualMod = Number(decl.manualMod) || 0;
      const tn = computeTN({
        actor: attacker,
        role: "attacker",
        styleUuid: data.attacker.itemUuid,
        variant: decl.variant,
        manualMod
      });

      const finalTN = tn.finalTN;
      const totalMod = tn.totalMod;
      const vMod = computeVariantMod(decl.variant);

      data.attacker.hasDeclared = true;
      data.attacker.variant = decl.variant;
      data.attacker.variantLabel = _variantLabel(decl.variant);
      data.attacker.variantMod = vMod;
      data.attacker.manualMod = manualMod;
      data.attacker.totalMod = totalMod;
      data.attacker.baseTarget = tn.baseTN;
      data.attacker.target = finalTN;
      data.attacker.tn = tn;

      _logDebug("attackerDeclare", {
        attackerUuid: data.attacker.actorUuid,
        defenderUuid: data.defender.actorUuid,
        attackVariant: data.attacker.variant,
        tn
      });

      // Perform a real Foundry roll + message so Dice So Nice triggers.
      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: finalTN, allowLucky: false, allowUnlucky: false });
      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        flavor: `${data.attacker.label} — Attacker Roll`,
        rollMode: game.settings.get("core", "rollMode")
      });

      data.attacker.result = {
        rollTotal: res.rollTotal,
        target: res.target,
        isSuccess: res.isSuccess,
        degree: res.degree,
        textual: res.textual,
        isCriticalSuccess: res.isCriticalSuccess,
        isCriticalFailure: res.isCriticalFailure
      };

      await _updateCard(message, data);
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
      data.defender.target = 0;
      data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

      _logDebug("defenderNoDefense", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid
      });
      await _updateCard(message, data);
    }

    // --- Defender Roll ---
    if (action === "defender-roll") {
      if (data.defender.result || data.defender.noDefense) return;
      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to roll for the defender.");
        return;
      }

      const choice = await DefenseDialog.show(defender, { attackerContext: data.attacker });
      if (!choice) return;

      data.defender.defenseType = choice.defenseType;
      data.defender.label = choice.label;

      const manualMod = _asNumber(choice.manualMod ?? 0);
      const tn = computeTN({
        actor: defender,
        role: "defender",
        defenseType: choice.defenseType,
        styleUuid: choice.styleUuid ?? choice.styleId ?? null,
        manualMod
      });

      data.defender.target = tn.finalTN;
      data.defender.targetLabel = manualMod
        ? `${tn.finalTN} (${manualMod >= 0 ? "+" : ""}${manualMod})`
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
        const res = await doTestRoll(defender, { rollFormula: "1d100", target: data.defender.target, allowLucky: false, allowUnlucky: false });
        await res.roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          flavor: `${data.defender.label} — Defender Roll`,
          rollMode: game.settings.get("core", "rollMode")
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
        await _updateCard(message, data);
      }
    }

    // --- Resolve ---
    if (data.attacker.result && data.defender.result && !data.outcome) {
      const outcome = _resolveOutcomeRAW(data);
      data.outcome = outcome ?? { winner: "tie", text: "" };
      data.status = "resolved";

      _logDebug("resolve", {
        attackerUuid: data.attacker.actorUuid,
        defenderUuid: data.defender.actorUuid,
        outcome: data.outcome,
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
