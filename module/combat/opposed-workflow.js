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
import { UESRPG } from "../constants.js";
import { DefenseDialog } from "./defense-dialog.js";
import { computeTN, listCombatStyles, variantMod as computeVariantMod } from "./tn.js";
import { getDamageTypeFromWeapon, getHitLocationFromRoll } from "./combat-utils.js";
import { getBlockValue, normalizeHitLocation } from "./mitigation.js";

function _asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
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
 * Get current Action Points (AP) for an actor. Returns 0 if missing/invalid.
 * System schema uses `actor.system.action_points.value` in this repository.
 */
function _getActionPoints(actor) {
  const v = Number(actor?.system?.action_points?.value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Spend AP atomically. Returns true if spent, false if insufficient or update failed.
 * Does not mutate document directly.
 */
async function _spendActionPoints(actor, amount, { reason = "" } = {}) {
  const spend = Number(amount ?? 0);
  if (!actor || !Number.isFinite(spend) || spend <= 0) return true;

  const current = _getActionPoints(actor);
  if (current < spend) return false;

  try {
    await actor.update({ "system.action_points.value": current - spend });
    return true;
  } catch (err) {
    console.error("UESRPG | Failed to spend Action Points", { actor: actor?.uuid, spend, reason, err });
    ui.notifications?.error?.("Failed to spend Action Points. See console for details.");
    return false;
  }
}

/**
 * Prefer an equipped weapon UUID for a given actor. Used for Counter-Attack default selection.
 * Falls back to the first owned weapon if none are equipped.
 */
function _getPreferredWeaponUuid(actor, { meleeOnly = false } = {}) {
  const items = Array.from(actor?.items ?? []);
  const weapons = items.filter((it) => it?.type === "weapon");
  const filtered = meleeOnly
    ? weapons.filter((w) => (w.system?.weaponType ?? w.system?.type ?? "").toString().toLowerCase() !== "ranged")
    : weapons;

  const equipped = filtered.find((w) => w.system?.equipped === true);
  if (equipped?.uuid) return equipped.uuid;

  return filtered[0]?.uuid ?? "";
}

async function _preConsumeAttackAmmo(attacker, data) {
  // Pre-consume 1 ammunition when the attacker commits to the attack roll.
  // Assumption (per project direction): only one ranged weapon participates in an attack roll.
  try {
    const weaponUuid = _getPreferredWeaponUuid(attacker, { meleeOnly: false }) || "";
    if (!weaponUuid) return null;

    const weapon = await fromUuid(weaponUuid);
    if (!weapon || weapon.type !== "weapon") return null;

    // Only pre-consume for ranged attackMode weapons configured to consume ammo.
    if (String(weapon.system?.attackMode ?? "melee") !== "ranged") return null;
    if (weapon.system?.consumeAmmo === false) return null;

    const ammoId = String(weapon.system?.ammoId ?? "").trim();
    if (!ammoId) {
      ui.notifications.warn(`${weapon.name}: no ammunition selected.`);
      return null;
    }

    const ammo = attacker.items.get(ammoId);
    if (!ammo || ammo.type !== "ammunition") {
      ui.notifications.warn(`${weapon.name}: selected ammunition could not be resolved.`);
      return null;
    }

    const qty = Number(ammo.system?.quantity ?? 0);
    if (!(qty > 0)) {
      ui.notifications.warn(`${ammo.name}: no ammunition remaining.`);
      return null;
    }

    await ammo.update({ "system.quantity": Math.max(0, qty - 1) });

    const pre = {
      weaponUuid: weapon.uuid,
      ammoId,
      ammoUuid: ammo.uuid,
      ammoName: ammo.name,
      consumedAt: Date.now()
    };

    // Persist on workflow data so damage roll can avoid double consumption.
    data.attacker = data.attacker ?? {};
    data.attacker.preConsumedAmmo = pre;

    return pre;
  } catch (err) {
    console.error("UESRPG | Pre-consume attack ammo failed", err);
    ui.notifications.error("Failed to consume ammunition for this attack. See console for details.");
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

function _opposedFlags(parentMessageId, stage) {
  // Thread all workflow messages to the originating opposed card for easier debugging and filtering.
  return {
    "uesrpg-3ev4": {
      opposed: {
        parentMessageId,
        stage
      }
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

function _renderCard(data, messageId) {
  const a = data.attacker;
  const d = data.defender;

  const showResolutionDetails = !!(game?.settings?.get?.("uesrpg-3ev4", "opposedShowResolutionDetails"));

  const baseA = Number(a.baseTarget ?? 0);
  const modA = Number(a.totalMod ?? 0);
  const finalA = baseA + modA;
  const aTargetLabel = (a.hasDeclared === true)
    ? `${finalA}${modA ? ` (${modA >= 0 ? "+" : ""}${modA})` : ""}`
    : `${baseA}`;

  const aVariantText = a.hasDeclared
    ? (a.variantLabel ?? "Attack")
    : "—";

  const dTargetLabel = d.noDefense
    ? "0"
    : (d.targetLabel ?? (d.target ?? "—"));

  const dTestLabel = d.testLabel ?? "(choose)";
  const dDefenseLabel = d.defenseLabel ?? d.label ?? "(choose)";

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
    : `<div style="margin-top:10px;"><i>Pending</i></div>`


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
          <div><b>Test:</b> ${a.label}</div>
          <div><b>Attack:</b> ${aVariantText}</div>
          ${Number(a.circumstanceMod ?? 0) ? `` : ``}
          <div><b>TN:</b> ${aTargetLabel}</div>

          ${a.result ? `<div><b>Roll:</b> ${a.result.rollTotal} — ${_fmtDegree(a.result)}</div>` : ""}
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
          <div><b>Defense:</b> ${dDefenseLabel}</div>
          ${Number(d.circumstanceMod ?? 0) ? `` : ``}
          <div><b>TN:</b> ${dTargetLabel}</div>

          ${(d.noDefense || d.result) ? `<div><b>Roll:</b> ${d.noDefense ? 100 : d.result.rollTotal} — ${d.noDefense ? "1 DoF" : _fmtDegree(d.result)}</div>` : ""}
          ${_renderBreakdown(d.tn)}
        </div>
        ${defenderActions}
      </div>
    </div>
    ${outcomeLine}
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

  const payload = {
    content: _renderCard(data, message.id),
    flags: { "uesrpg-3ev4": { opposed: data } }
  };

  // In Foundry v13, ChatLog DOM updates can intermittently throw if the message element is not currently rendered
  // (e.g., filtered/paginated chat log). We must never allow that to abort the combat workflow (ammo consumption,
  // resolution messages, etc.). Update the document, then attempt a safe UI refresh.
  try {
    await message.update(payload);
  } catch (err) {
    console.warn("UESRPG | Chat card update failed; applying non-rendering update fallback.", { messageId: message.id, err });
    try {
      await message.update(payload, { render: false });
      // Best-effort UI refresh; do not throw if chat is not available.
      if (ui?.chat) ui.chat.render?.(true);
    } catch (err2) {
      console.error("UESRPG | Chat card update fallback failed.", { messageId: message.id, err: err2 });
      // Do not rethrow: the workflow must proceed.
    }
  }
}


async function _attackerDeclareDialog(attackerActor, attackerLabel, { styles = [], selectedStyleUuid = null, defaultVariant = "normal", defaultManual = 0, defaultCirc = 0 } = {}) {
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

  const allowedLocs = ["Head", "Body", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const safeDefaultLoc = "Body";
  const locOptions = allowedLocs.map(l => {
    const sel = l === safeDefaultLoc ? "selected" : "";
    return `<option value="${l}" ${sel}>${l}</option>`;
  }).join("\n");

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
            const variant = root.querySelector('input[name="attackVariant"]:checked')?.value ?? "normal";
            const raw = root.querySelector('input[name="manualMod"]')?.value ?? "0";
            const manualMod = Number.parseInt(String(raw), 10) || 0;
            const rawCirc = root.querySelector('select[name="circMod"]')?.value ?? "0";
            const circumstanceMod = Number.parseInt(String(rawCirc), 10) || 0;
            const precisionLocation = root.querySelector('select[name="precisionLocation"]')?.value ?? safeDefaultLoc;

            // Pre-AE: enforce AP spend for All Out Attack (+1 AP). If AP is missing, treat as 0.
            const apCost = (variant === "allOut") ? 1 : 0;
            if (apCost > 0) {
              const ap = _getActionPoints(attackerActor);
              if (ap < apCost) {
                ui.notifications?.warn?.("Not enough Action Points to perform All Out Attack.");
                return;
              }
            }

            return settle({ styleUuid, variant, manualMod, circumstanceMod, precisionLocation, apCost });
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
  if (A.degree > D.degree) return { winner: "attacker", text: `Both succeed — attacker has more DoS; resolve the attack.` };
  if (D.degree > A.degree) return { winner: "defender", text: `Both succeed — defense holds; attack is negated.` };
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

  // Critical interactions first.
  // If both crit success or both crit fail: no advantage and neither resolves (handled earlier), but be defensive.
  if ((W.isCriticalSuccess && L.isCriticalSuccess) || (W.isCriticalFailure && L.isCriticalFailure)) {
    adv = 0;
  } else if ((W.isCriticalSuccess && !L.isSuccess) || (W.isSuccess && L.isCriticalFailure)) {
    adv = 2;
  } else if (W.isCriticalSuccess) {
    adv = 1;
  } else if (W.isSuccess && !L.isSuccess) {
    adv = 1;
  } else {
    adv = 0;
  }

  return winnerKey === "attacker"
    ? { attacker: adv, defender: 0 }
    : { attacker: 0, defender: adv };
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

async function _promptWeaponAndAdvantages({ attackerActor, advantageCount = 0, defaultWeaponUuid = null, defaultHitLocation = "Body" }) {
  const weapons = _listEquippedWeapons(attackerActor);
  if (!weapons.length) {
    ui.notifications.warn("No equipped weapons found.");
    return null;
  }

  const defaultWeapon = weapons.find(w => w.uuid === defaultWeaponUuid) ?? weapons[0];

  const allowedLocs = ["Head", "Body", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const safeDefaultLoc = allowedLocs.includes(defaultHitLocation) ? defaultHitLocation : "Body";
  const locOptions = allowedLocs
    .map(l => {
      const sel = l === safeDefaultLoc ? "selected" : "";
      return `<option value="${l}" ${sel}>${l}</option>`;
    })
    .join("\n");

  // "Press Advantage" will be implemented later once Active Effects are introduced.
  // For now, keep it hidden (but ensure we never reference an undefined symbol).
  const hasPressAdvantage = false;

  // IMPORTANT: Do not use inline onchange handlers inside Dialog HTML.
  // In Foundry's Electron environment, HTML attribute handlers are not reliably parsed and
  // can throw SyntaxError, which breaks the entire opposed workflow.
  const content = `
    <form class="uesrpg-opp-dmg">
      <div class="form-group">
        <label><b>Weapon</b></label>
        <select name="weaponUuid" style="width:100%;">
          ${weapons.map(w => {
            const sel = w.uuid === defaultWeapon.uuid ? "selected" : "";
            return `<option value="${w.uuid}" ${sel}>${w.name}</option>`;
          }).join("\n")}
        </select>
      </div>

      ${advantageCount > 0 ? `
      <hr style="margin:0.5rem 0;" />
      <div style="font-size:0.95em; opacity:0.9; margin-bottom:0.25rem;">
        <b>Advantage</b>: ${advantageCount} available
      </div>
      <input type="hidden" name="defaultHitLocation" value="${safeDefaultLoc}" />

            <style>
        .uesrpg-adv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
        .uesrpg-adv-opt { border: 1px solid var(--color-border-light-tertiary); border-radius: 6px; padding: 6px 8px; }
        .uesrpg-adv-opt label { margin: 0; white-space: nowrap; }
        .uesrpg-adv-head { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: center; }
        .uesrpg-adv-body { margin-top: 6px; }
        .uesrpg-adv-opt select { width: 100%; }
      </style>

      <div class="form-group">
        <div class="uesrpg-adv-grid">
          <div class="uesrpg-adv-opt" data-adv="precisionStrike">
            <div class="uesrpg-adv-head">
              <input type="checkbox" name="precisionStrike" />
              <label>Precision Strike</label>
            </div>
            <div class="uesrpg-adv-body">
              <select name="precisionLocation" disabled>
                ${locOptions}
              </select>
            </div>
          </div>

          <div class="uesrpg-adv-opt" data-adv="penetrateArmor">
            <div class="uesrpg-adv-head">
              <input type="checkbox" name="penetrateArmor" />
              <label>Penetrate Armor</label>
            </div>
          </div>

          <div class="uesrpg-adv-opt" data-adv="forcefulImpact">
            <div class="uesrpg-adv-head">
              <input type="checkbox" name="forcefulImpact" />
              <label>Forceful Impact</label>
            </div>
          </div>

          ${hasPressAdvantage ? `
          <div class="uesrpg-adv-opt" data-adv="pressAdvantage">
            <div class="uesrpg-adv-head">
              <input type="checkbox" name="pressAdvantage" />
              <label>Press Advantage</label>
            </div>
          </div>
          ` : ``}
        </div>
      </div>
      ` : ``}
    </form>
  `;

  // Build a Dialog instance so we can attach listeners in a deterministic, CSP-safe way.
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
            const root = (html instanceof Element)
              ? html
              : (html && typeof html === "object" && "0" in html && html[0] instanceof Element)
                ? html[0]
                : null;
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

            return settle({ weaponUuid, precisionStrike, precisionLocation, penetrateArmor, forcefulImpact, pressAdvantage });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => settle(null)
        }
      },
      default: "continue",
      close: () => settle(null)
    });

    // Attach listeners after the dialog renders.
    Hooks.once("renderDialog", (app, html) => {
      if (app !== dialog) return;
      const root = html?.[0] instanceof Element ? html[0] : null;
      const form = root?.querySelector("form.uesrpg-opp-dmg");
      if (!form) return;

      const toggles = ["precisionStrike", "penetrateArmor", "forcefulImpact", "pressAdvantage"];
      const checkbox = (name) => form.querySelector(`input[type="checkbox"][name="${name}"]`);
      const precisionSelect = form.querySelector("select[name=\"precisionLocation\"]");
      const defaultLoc = String(form.querySelector("input[name=\"defaultHitLocation\"]")?.value ?? "Body");

      const setExclusive = (activeName, checked) => {
        for (const k of toggles) {
          const el = checkbox(k);
          if (!el) continue;
          if (!checked) {
            el.disabled = false;
            continue;
          }
          if (k === activeName) {
            el.disabled = false;
            continue;
          }
          el.checked = false;
          el.disabled = true;
        }

        // Precision Strike enables its hit-location selector.
        if (precisionSelect) {
          const ps = checkbox("precisionStrike");
          const psOn = Boolean(ps?.checked);
          precisionSelect.disabled = !psOn;
          if (!psOn) precisionSelect.value = defaultLoc;
        }
      };

      // Wire all checkboxes.
      for (const k of toggles) {
        const el = checkbox(k);
        if (!el) continue;
        el.addEventListener("change", (ev) => {
          const checked = Boolean(ev.currentTarget?.checked);
          setExclusive(k, checked);
        });
      }

      // Initial state.
      setExclusive("precisionStrike", Boolean(checkbox("precisionStrike")?.checked));
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
async function _promptDefenderAdvantage({ defenderActor, advantageCount = 0 } = {}) {
  if (!defenderActor) return null;
  const adv = Number(advantageCount ?? 0);
  if (!Number.isFinite(adv) || adv <= 0) {
    ui.notifications.warn("No Advantage is available to resolve.");
    return null;
  }

  // NOTE: Keep the list compact and deterministic. These are placeholders until AE-backed mechanics are introduced.
  const content = `
    <form class="uesrpg-def-adv">
      <div style="margin-bottom:0.5rem;">
        <b>Advantage</b>: ${adv} available
      </div>
      <div class="form-group" style="margin:0 0 0.5rem 0;">
        <label style="font-weight:700;">Utilize Advantage</label>
        <select name="choice" style="width:100%;">
          <option value="defer" selected>Defer (record only; no mechanical effect pre-AE)</option>
          <option value="special" disabled>Special Advantage (requires Active Effects)</option>
        </select>
        <p class="notes" style="margin:0.35rem 0 0 0; opacity:0.85;">
          Most Advantage options require Active Effects and will be enabled in a later milestone.
        </p>
      </div>
    </form>
  `;

  try {
    const choice = await Dialog.prompt({
      title: `Resolve Defender Advantage — ${defenderActor.name}`,
      content,
      label: "Resolve",
      callback: (html) => {
        const form = html?.[0]?.querySelector?.("form.uesrpg-def-adv");
        if (!form) return { choice: "defer" };
        const sel = form.querySelector("select[name='choice']");
        return { choice: String(sel?.value ?? "defer") };
      },
      rejectClose: true,
    });
    return choice ?? null;
  } catch (_e) {
    // Closed without resolving.
    return null;
  }
}

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

  // Ranged: add ammunition material/quality contribution.
  // IMPORTANT: ammunition consumption must occur only after the damage roll has been successfully posted to chat.
  // (No spend unless resolved: prevents ammo loss if the workflow errors prior to producing a real roll.)
  if (String(weapon.system?.attackMode ?? "melee") === "ranged" && weapon.actor) {
    const shouldConsume = weapon.system?.consumeAmmo !== false;
    const ammoId = String(weapon.system?.ammoId ?? "").trim();


    const preConsumedMatches = !!(preConsumedAmmo
      && preConsumedAmmo.weaponUuid
      && preConsumedAmmo.ammoId
      && preConsumedAmmo.weaponUuid === weapon.uuid
      && preConsumedAmmo.ammoId === ammoId);

    // If the weapon is configured to consume ammo, enforce that ammo exists and has quantity.
    // This gates the damage workflow pre-AE and prevents "free" ranged damage when out of ammo.
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
      // If ammo was already consumed at attack time, quantity may now be 0.
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

      // Record the consumption for later; actual update is performed by the caller.
      pendingAmmo = {
        // Store multiple resolution paths for maximum compatibility with linked and unlinked token Actors.
        // - ammoUuid is a direct document UUID (best-case).
        // - actorUuid + ammoId allow consuming by updating embedded Items on the parent Actor (fallback when UUID resolution fails).
        ammoUuid: ammo.uuid,
        actorUuid: weapon.actor?.uuid ?? null,
        ammoId,
        ammoName: ammo.name,
        qtyAfter: Math.max(0, qty - 1),
      };
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

  const structured = Array.isArray(weapon.system.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];
  const hasQ = (key) => structured.some(q => String(q?.key ?? q ?? "").toLowerCase() === key);

  const wantsProven = hasQ("proven");
  const wantsPrimitive = hasQ("primitive");
  const wantsSuperior = !!weapon.system.superior;

  const a = await safeEvaluateRoll(damageString);
  damageString = a.formula;
  let b = null;
  let total = Number(a.total);

  if (wantsSuperior || wantsProven || wantsPrimitive) {
    b = await safeEvaluateRoll(damageString);
    const alt = Number(b.total);
    if (wantsPrimitive && !wantsProven) total = Math.min(total, alt);
    else total = Math.max(total, alt);
  }

  return { damageString, rollA: a, rollB: b, finalDamage: total, pendingAmmo: null };
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

  // Return the created message so callers can enforce strict ordering when multiple
  // chat cards are posted in sequence (e.g., Resolve Block -> weapon card -> block result).
  const created = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
    content: cardHtml,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: [dmg.rollA, dmg.rollB].filter(Boolean),
    rollMode: game.settings.get("core", "rollMode"),
    flags: parentMessageId ? _opposedFlags(parentMessageId, stage) : undefined,
  });
  return created;
}

export const OpposedWorkflow = {
  async consumePendingAmmo(pendingAmmo) {
    return _consumePendingAmmo(pendingAmmo);
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

      const decl = await _attackerDeclareDialog(attacker, data.attacker.label ?? "Attack", {
        styles,
        selectedStyleUuid,
        defaultVariant: data.attacker.variant ?? "normal",
        defaultManual: data.attacker.manualMod ?? 0,
        defaultCirc: data.attacker.circumstanceMod ?? 0
      });
      if (!decl) return;

      // IMPORTANT: Do not spend AP until after we have produced a real roll message.
      // This prevents AP loss if the workflow fails before resolving the roll.
      const pendingApCost = Number(decl.apCost ?? 0) || 0;

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
      const tn = computeTN({
        actor: attacker,
        role: "attacker",
        styleUuid: data.attacker.itemUuid,
        variant: decl.variant,
        manualMod,
        circumstanceMod
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

      _logDebug("attackerDeclare", {
        attackerUuid: data.attacker.actorUuid,
        defenderUuid: data.defender.actorUuid,
        attackVariant: data.attacker.variant,
        tn
      });

      // Pre-consume ammunition at attack time (per system rules and project direction).
      // This prevents "free" ranged attacks when out of ammo.
      await _preConsumeAttackAmmo(attacker, data);

      // Perform a real Foundry roll + message so Dice So Nice triggers.
      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: finalTN, allowLucky: false, allowUnlucky: false });
      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        flavor: `${data.attacker.label} — Attacker Roll`,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "attacker-roll")
      });

      // Spend AP only after the attack roll has been successfully executed and posted.
      // This avoids losing AP on cancelled/failed workflows.
      if (pendingApCost > 0) {
        const ok = await _spendActionPoints(attacker, pendingApCost, { reason: `attackVariant:${decl.variant}` });
        if (!ok) {
          ui.notifications.warn("Insufficient Action Points to perform this attack.");
        }
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
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
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
      const tn = computeTN({
        actor: defender,
        role: "defender",
        defenseType: choice.defenseType,
        styleUuid: choice.styleUuid ?? choice.styleId ?? null,
        manualMod,
        circumstanceMod
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
        const res = await doTestRoll(defender, { rollFormula: "1d100", target: data.defender.target, allowLucky: false, allowUnlucky: false });
        await res.roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          flavor: `${data.defender.label} — Defender Roll`,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "defender-roll")
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

    // --- Damage Roll (attacker won) ---
    if (action === "damage-roll") {
      if (data.status !== "resolved" || data.outcome?.winner !== "attacker") {
        ui.notifications.warn("Damage cannot be rolled until the opposed test is resolved and the attacker wins.");
        return;
      }
      if (!_canControlActor(attacker) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to roll damage for this attacker.");
        return;
      }

      const advCount = Number(data.advantage?.attacker ?? 0);
      const baseHitLocation = getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 0);
      const selection = await _promptWeaponAndAdvantages({
        attackerActor: attacker,
        advantageCount: advCount,
        defaultWeaponUuid: data.context?.lastWeaponUuid ?? _getPreferredWeaponUuid(attacker, { meleeOnly: false }) ?? null,
        defaultHitLocation: baseHitLocation,
      });
      if (!selection) return;

      const weapon = await fromUuid(selection.weaponUuid);
      if (!weapon) {
        ui.notifications.warn("Selected weapon could not be resolved.");
        return;
      }

      // Persist last weapon for convenience within this single opposed workflow.
      data.context = data.context ?? {};
      data.context.lastWeaponUuid = weapon.uuid;
      await _updateCard(message, data);

      // Hit location RAW: ones digit of attack roll, unless Precision Strike is used.
      const hitLocation = (advCount > 0 && selection.precisionStrike)
        ? selection.precisionLocation
        : getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 0);

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
        if (!out.length) return "<span style=\"opacity:0.75;\">—</span>";
        return `<span class="uesrpg-inline-tags">${out.join("")}</span>`;
      })();

      const altTag = dmg.rollB
        ? `<div style="margin-top:0.25rem;font-size:x-small;line-height:1.2;">Roll A: ${dmg.rollA.total}<br>Roll B: ${dmg.rollB.total}</div>`
        : "";

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
      if (data.status !== "resolved" || data.outcome?.winner !== "defender" || (data.defender.defenseType ?? "none") !== "counter") {
        ui.notifications.warn("Counter-attack damage can only be rolled after the opposed test is resolved and the defender wins via Counter-Attack.");
        return;
      }
      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to roll damage for this defender.");
        return;
      }

      const advCount = Number(data.advantage?.defender ?? 0);
      const baseHitLocation = getHitLocationFromRoll(data.defender?.result?.rollTotal ?? 0);
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

      // Hit location RAW: ones digit of counter-attack roll, unless Precision Strike is used.
      const hitLocation = (advCount > 0 && selection.precisionStrike)
        ? selection.precisionLocation
        : getHitLocationFromRoll(data.defender?.result?.rollTotal ?? 0);

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
      if (data.defenderAdvantage.resolved === true) {
        ui.notifications.warn("Defender Advantage has already been resolved.");
        return;
      }

      const choice = await _promptDefenderAdvantage({ defenderActor: defender, advantageCount: advCount });
      if (!choice) return;

      data.defenderAdvantage = {
        resolved: true,
        choice: String(choice.choice ?? "defer"),
        resolvedAt: Date.now(),
        resolvedBy: game.user.id,
      };
      await _updateCard(message, data);

      const choiceLabel = (data.defenderAdvantage.choice === "defer")
        ? "Defer (record only)"
        : data.defenderAdvantage.choice;

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        content: `<div class="ues-opposed-card" style="padding:6px;">
          <b>Defender Advantage Resolved:</b> ${choiceLabel}.<br/>
          <span style="opacity:0.85;">Advantage available: ${advCount}. (Mechanical effects will be implemented with Active Effects.)</span>
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "defender-advantage"),
      });

      return;
    }

    // --- Resolve Block (defender won via block) ---
    if (action === "block-resolve") {
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
      const hitLocation = getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 100);
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
      const br = getBlockValue(shield, damageType);
      const blocked = dmg.finalDamage <= br;

      if (blocked) {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          content: `<div class="ues-opposed-card" style="padding:6px;">
            <b>Block:</b> Incoming damage <b>${dmg.finalDamage}</b> does not exceed Block Rating <b>${br}</b>. No damage taken.
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "block-result"),
        });
        return;
      }

      // RAW: if damage exceeds BR, take full damage to shield arm.
      const shieldArm = "Left Arm";

      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${defender.uuid}"
        data-attacker-actor-uuid="${attacker.uuid}"
        data-weapon-uuid="${weapon.uuid}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${shieldArm}"
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
          <div style="opacity:0.9; margin-bottom:0.5rem;">Incoming damage <b>${dmg.finalDamage}</b> exceeds Block Rating <b>${br}</b> (${shield?.name ?? "No Shield"}).</div>
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
