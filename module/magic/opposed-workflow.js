/**
 * module/magic/opposed-workflow.js
 *
 * Magic attack opposed workflow for UESRPG 3ev4.
 * Target: Foundry VTT v13.351.
 *
 * Package 2 upgrades:
 *  - Spend AP at the moment the casting/defense test is rolled (combat-parity behavior).
 *  - Secondary Cast Magic support (Instant spells only) via castActionType carried through the pending card.
 *  - Chat card layout improvements: TN breakdown rendered as a dropdown (<details>) instead of a flat modifier list.
 *  - Hook migrated to renderChatMessageHTML (v13) to avoid deprecated renderChatMessage.
 */

import { doTestRoll, resolveOpposed, formatDegree } from "../helpers/degree-roll-helper.js";
import {
  computeMagicCastingTN,
  computeSpellMagickaCost,
  computeSpellAttemptMagickaCost,
  consumeSpellMagicka,
  applySpellRestraintRefund,
  rollSpellDamage,
  rollSpellHealing,
  getSpellDamageFormula,
  getSpellDamageType,
  isHealingSpell
} from "./magicka-utils.js";
import { applySpellEffect, applySpellEffectsToTarget } from "./spell-effects.js";
import { applyMagicDamage, applyMagicHealing } from "./damage-application.js";
import { shouldBackfire, triggerBackfire } from "./backfire.js";
import { safeUpdateChatMessage } from "../helpers/chat-message-socket.js";
import { canUserRollActor, requireUserCanRollActor } from "../helpers/permissions.js";
import { ActionEconomy } from "../combat/action-economy.js";
import { getHitLocationFromRoll } from "../combat/combat-utils.js";
import {
  computeElementalDamageBonus,
  isElementalDamageType,
  canUseMasterOfMagicka
} from "./magic-modifiers.js";
const _FLAG_NS = "uesrpg-3ev4";
const _FLAG_KEY = "magicOpposed";
const _CARD_VERSION = 2;

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
  if (doc.documentName === "Token") return doc;
  if (doc.documentName === "TokenDocument") return doc.object ?? null;
  return null;
}

function _fmtSigned(n) {
  const v = Number(n ?? 0) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

function _fmtDegree(result) {
  if (!result) return "";
  const deg = Number(result.degree ?? 0);
  if (result.isSuccess) return `<span style="color: green;">${deg} DoS</span>`;
  return `<span style="color: red;">${deg} DoF</span>`;
}

function _getMessageState(message) {
  const raw = message?.flags?.[_FLAG_NS]?.[_FLAG_KEY];
  if (!raw || typeof raw !== "object") return null;
  if (Number(raw.version) >= 1 && raw.state) return raw.state;
  if (raw.attacker && raw.defender) return raw;
  return null;
}

function _isBankChoicesEnabledForData(data) {
  // Magic banked choices enabled by default (same as combat)
  return true;
}

function _ensureBankedScaffold(data) {
  data.context = data.context ?? {};
  data.attacker = data.attacker ?? {};
  data.defender = data.defender ?? {};

  data.attacker.banked = (data.attacker.banked && typeof data.attacker.banked === "object") 
    ? data.attacker.banked 
    : { committed: false, committedAt: null, committedBy: null };

  data.defender.banked = (data.defender.banked && typeof data.defender.banked === "object") 
    ? data.defender.banked 
    : { committed: false, committedAt: null, committedBy: null };

  return data;
}

function _getBankCommitState(data) {
  _ensureBankedScaffold(data);
  
  const aCommitted = Boolean(data.attacker?.banked?.committed);
  const dCommitted = Boolean(data.defender?.banked?.committed || data.defender?.noDefense);
  
  return {
    aCommitted,
    dCommitted,
    bothCommitted: aCommitted && dCommitted
  };
}


function _renderBreakdownDetails(title, entries) {
  const arr = Array.isArray(entries) ? entries : [];
  if (!arr.length) return "";

  // Only show modifiers that actually affect the TN (non-zero),
  // but always keep the base lane for readability.
  const filtered = arr.filter((m) => {
    const value = Number(m?.value ?? 0) || 0;
    if (m?.keepZero) return true;
    return value !== 0;
  });

  if (!filtered.length) return "";

  const rows = filtered
    .map((m) => {
      const label = String(m?.label ?? "Modifier");
      const value = Number(m?.value ?? 0) || 0;
      return `<div style="display:flex; justify-content:space-between; gap:10px; padding:2px 0;"><span>${label}</span><span style="font-variant-numeric: tabular-nums;">${_fmtSigned(value)}</span></div>`;
    })
    .join("");

  return `
    <details style="margin-top:6px;">
      <summary style="cursor:pointer; user-select:none;">${String(title ?? "Breakdown")}</summary>
      <div style="margin-top:4px; font-size:12px; opacity:0.95;">${rows}</div>
    </details>
  `;
}

function _btn({ label, action, disabled = false, title = "" } = {}) {
  const safeLabel = String(label ?? "Action");
  const safeAction = String(action ?? "");
  const safeTitle = String(title ?? "");
  return `
    <button
      type="button"
      data-ues-magic-opposed-action="${safeAction}"
      ${disabled ? "disabled=\"disabled\"" : ""}
      ${safeTitle ? `title="${safeTitle.replaceAll('"', "&quot;")}"` : ""}
      style="padding: 4px 10px; line-height: 1; min-height: 26px;"
    >${safeLabel}</button>
  `;
}

/**
 * Render the magic opposed card HTML.
 *
 * Design goal (Package 2): match the readability of opposed combat cards:
 *  - Two-column layout (Caster / Target)
 *  - TN breakdown uses <details>
 *  - No public damage numbers; GM receives blind whispered damage report
 */
function _renderCard(data, messageId) {
  const a = data.attacker;
  const d = data.defender;

  const bankMode = _isBankChoicesEnabledForData(data);
  const { aCommitted, dCommitted, bothCommitted } = _getBankCommitState(data);
  
  const phase = String(data?.context?.phase ?? data?.status ?? "pending");
  const resolved = phase === "resolved";
  
  // Hide choices until both committed
  const revealChoices = !bankMode || bothCommitted || resolved;
  
  const spellName = revealChoices ? (a.spellName ?? "Spell") : "—";
  const spellSchool = revealChoices ? (a.spellSchool ?? "") : "";
  const spellLevel = revealChoices ? Number(a.spellLevel ?? 1) : "—";
  const spellCost = revealChoices ? Number(a.spellCost ?? 0) : "—";
  const spellMpSpent = revealChoices ? (Number(a.mpSpent ?? 0) || 0) : "—";
  const spellMpRefund = revealChoices ? (Number(a.mpRefund ?? 0) || 0) : 0;

  const aTN = revealChoices && a.tn?.finalTN != null ? String(a.tn.finalTN) : "—";
  const dTN = revealChoices && d.tn?.finalTN != null ? String(d.tn.finalTN) : (revealChoices && d.tn != null ? String(d.tn) : "—");

  const aRollLine = a.result
    ? (a.result.noRoll
      ? `<div><b>Roll:</b> Automatic</div>`
      : `<div><b>Roll:</b> ${a.result.rollTotal} — ${_fmtDegree(a.result)}${a.result.isCriticalSuccess ? ' <span style="color:green; font-weight:700;">CRITICAL</span>' : ''}${a.result.isCriticalFailure ? ' <span style="color:red; font-weight:700;">CRITICAL FAIL</span>' : ''}</div>`)
    : "";

  const dRollLine = (d.result && !d.noDefense)
    ? `<div><b>Roll:</b> ${d.result.rollTotal} — ${_fmtDegree(d.result)}</div>`
    : "";

  const aBreakdown = revealChoices ? _renderBreakdownDetails("TN breakdown", a.tn?.breakdown ?? a.tn?.modifiers) : "";
  const dBreakdown = revealChoices ? _renderBreakdownDetails("TN breakdown", d.tn?.breakdown ?? d.tn?.modifiers) : "";

  const awaitingDefense = phase === "awaiting-defense";

  const canRollAttacker = Boolean(!a.result);
  const canRollDefender = Boolean(a.result && !d.result && !d.noDefense);

  // Attacker commit/roll status
  const attackerCommitLine = (() => {
    if (!bankMode) return "";
    const rolled = !!a.result;
    const statusText = resolved ? "Resolved" : rolled ? "Rolled" : (aCommitted ? "✓ Committed" : "Awaiting choice");
    return `<div style="margin-top:4px; font-size:12px; opacity:0.85;"><b>Status:</b> ${statusText}</div>`;
  })();

  // Defender commit/roll status
  const defenderCommitLine = (() => {
    if (!bankMode) return "";
    const rolled = !!d.result || !!d.noDefense;
    const statusText = resolved ? "Resolved" : rolled ? "Rolled" : (dCommitted ? "✓ Committed" : "Awaiting choice");
    return `<div style="margin-top:4px; font-size:12px; opacity:0.85;"><b>Status:</b> ${statusText}</div>`;
  })();

  const attackerControls = (() => {
    if (a.result) return "";
    
    if (bankMode) {
      if (!aCommitted) {
        return `<div style="margin-top:8px;">${_btn({ label: "Commit Casting", action: "attacker-commit" })}</div>`;
      }
      return "";
    }
    
    return `<div style="margin-top:8px;">${_btn({ label: "Roll Casting Test", action: "attacker-roll" })}</div>`;
  })();

  const defenderControls = (() => {
    if (d.result || d.noDefense) return "";
    
    if (bankMode) {
      if (!dCommitted) {
        return `
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            ${_btn({ label: "Commit Block", action: "defender-commit-block" })}
            ${_btn({ label: "Commit Evade", action: "defender-commit-evade" })}
            ${_btn({ label: "Commit No Defense", action: "defender-commit-nodefense" })}
          </div>
        `;
      }
      return "";
    }
    
    if (canRollDefender) {
      return `
        <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          ${_btn({ label: "Block", action: "defender-roll-block" })}
          ${_btn({ label: "Evade", action: "defender-roll-evade" })}
          ${_btn({ label: "No Defense", action: "defender-no-defense" })}
        </div>
      `;
    }
    return "";
  })();

  let outcomeLine = "";
  if (resolved && data.outcome) {
    const winner = String(data.outcome.winner ?? "");
    const color = winner === "attacker" ? "green" : (winner === "defender" ? "#2a5db0" : "#666");
    outcomeLine = `
      <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid ${color};">
        <div style="font-weight:700;">${String(data.outcome.text ?? "Resolved")}</div>
        ${data.outcome.attackerWins ? `<div style="margin-top:4px; font-size:12px; opacity:0.9;">Damage is applied automatically. Details are whispered to the GM.</div>` : ""}
      </div>
    `;
  } else if (bankMode && !bothCommitted) {
    const aStatus = aCommitted ? "✓ Committed" : "Awaiting choice";
    const dStatus = dCommitted ? "✓ Committed" : "Awaiting choice";
    outcomeLine = `
      <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05);">
        <div><b>Attacker:</b> ${aStatus}</div>
        <div><b>Defender:</b> ${dStatus}</div>
        ${bothCommitted ? '<div style="margin-top:6px; font-style:italic;">Both sides committed. Ready to roll.</div>' : '<div style="margin-top:6px; font-style:italic;">Waiting for both sides to commit choices...</div>'}
      </div>
    `;
  } else if (awaitingDefense) {
    outcomeLine = `
      <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid #666;">
        <div style="font-weight:700;">Awaiting defense selection</div>
        <div style="margin-top:4px; font-size:12px; opacity:0.9;">Defender may choose Block, Evade, or No Defense.</div>
      </div>
    `;
  }

  return `
    <div class="ues-opposed-card ues-magic-opposed-card" data-message-id="${String(messageId ?? "")}" data-ues-magic-opposed="1" style="padding:6px 6px;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start;">
        <div style="padding-right:10px; border-right:1px solid rgba(0,0,0,0.12);">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <div style="font-size:16px; font-weight:700;">Caster</div>
            <div style="font-size:13px;"><b>${a.tokenName ?? a.name ?? ""}</b></div>
          </div>
          <div style="margin-top:4px; font-size:13px; line-height:1.25;">
            <div><b>Spell:</b> ${spellName}${spellSchool ? ` (${spellSchool} ${spellLevel})` : ""}</div>
            <div><b>MP Cost:</b> ${spellCost}${spellMpSpent !== "—" && spellMpSpent ? ` <span class="muted" style="opacity:0.8;">(paid: ${spellMpSpent}${spellMpRefund ? `, refunded: ${spellMpRefund}` : ""})</span>` : ""}</div>
            <div><b>TN:</b> ${aTN}</div>
            ${aRollLine}
            ${aBreakdown}
            ${attackerCommitLine}
          </div>
          ${attackerControls}
        </div>

        <div style="padding-left:2px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <div style="font-size:16px; font-weight:700;">Target</div>
            <div style="font-size:13px;"><b>${d.tokenName ?? d.name ?? ""}</b></div>
          </div>
          <div style="margin-top:4px; font-size:13px; line-height:1.25;">
            <div><b>Defense:</b> ${d.noDefense ? "—" : (d.defenseType ?? "—")}</div>
            <div><b>TN:</b> ${d.noDefense ? "—" : dTN}</div>
            ${dRollLine}
            ${d.noDefense ? '<div style="color:red; font-style:italic; margin-top:2px;">No Defense</div>' : ""}
            ${d.noDefense ? "" : dBreakdown}
            ${defenderCommitLine}
          </div>
          ${defenderControls}
        </div>
      </div>
      ${outcomeLine}
    </div>
  `;
}

/**
 * Render a modern unopposed magic casting card (no target selected).
 * This is used to avoid legacy casting cards which have incorrect TN/DoS/DoF reporting.
 */
function _renderUnopposedCard(data, messageId) {
  const a = data.attacker;
  const spellName = a.spellName ?? "Spell";
  const spellSchool = a.spellSchool ?? "";
  const spellLevel = Number(a.spellLevel ?? 1);
  const spellCost = Number(a.spellCost ?? 0);

  
  const spellMpSpent = Number(a.mpSpent ?? a.spellCost ?? 0) || 0;
  const spellMpRefund = Number(a.mpRefund ?? 0) || 0;
  const aTN = a.tn?.finalTN != null ? String(a.tn.finalTN) : "—";
  const aRollLine = a.result
    ? (a.result.noRoll
      ? `<div><b>Roll:</b> Automatic</div>`
      : `<div><b>Roll:</b> ${a.result.rollTotal} — ${_fmtDegree(a.result)}${a.result.isCriticalSuccess ? ' <span style="color:green; font-weight:700;">CRITICAL</span>' : ''}${a.result.isCriticalFailure ? ' <span style="color:red; font-weight:700;">CRITICAL FAIL</span>' : ''}</div>`)
    : "";

  const aBreakdown = _renderBreakdownDetails("TN breakdown", a.tn?.breakdown ?? a.tn?.modifiers);

  const note = String(data?.context?.note ?? "");
  const noteLine = note
    ? `<div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid #666;">
         <div style="font-weight:700;">${note}</div>
       </div>`
    : "";

  return `
    <div class="ues-opposed-card ues-magic-opposed-card" data-message-id="${String(messageId ?? "")}" style="padding:6px 6px;">
      <div style="display:grid; grid-template-columns:1fr; gap:8px;">
        <div>
          <div style="font-size:18px; font-weight:800; margin-bottom:6px;">${spellName}</div>
          <div><b>School:</b> ${spellSchool || "—"}</div>
          <div><b>Level:</b> ${spellLevel}</div>
          <div><b>MP Cost:</b> ${spellCost}${spellMpSpent ? ` <span class="muted" style="opacity:0.8;">(paid: ${spellMpSpent}${spellMpRefund ? `, refunded: ${spellMpRefund}` : ""})</span>` : ""}</div>
          <div style="margin-top:6px;"><b>TN:</b> ${aTN}</div>
          ${aRollLine}
          ${aBreakdown}
        </div>
      </div>
      ${noteLine}
    </div>
  `;
}

async function _updateCard(message, data) {
  data.context = data.context ?? {};
  data.context.schemaVersion = data.context.schemaVersion ?? _CARD_VERSION;
  data.context.updatedAt = Date.now();
  data.context.updatedBy = game.user.id;
  data.context.updatedSeq = (Number(data.context.updatedSeq) || 0) + 1;

  const payload = {
    content: _renderCard(data, message.id),
    flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } }
  };

  await safeUpdateChatMessage(message, payload);
}

function _computeEvadeTNWithBreakdown(defender) {
  const sys = defender?.system ?? {};

  // NPCs use professions.evade. PCs prefer the Evade skill item, but may also
  // have an aggregated professions.evade lane in some data states.
  let baseTN = 0;
  let baseLabel = "Base TN";

  if (defender?.type === "NPC") {
    baseTN = Number(sys?.professions?.evade ?? sys?.professionsWound?.evade ?? 0) || 0;
  } else {
    const evadeSkill = defender?.items?.find((i) => i.type === "skill" && String(i.name ?? "").toLowerCase() === "evade")
      ?? defender?.items?.find((i) => i.type === "skill" && String(i.name ?? "").toLowerCase().includes("evade"))
      ?? null;
    baseTN = Number(evadeSkill?.system?.value ?? 0) || 0;
    if (!baseTN) {
      baseTN = Number(sys?.professions?.evade ?? sys?.professionsWound?.evade ?? 0) || 0;
    }
    if (!baseTN) {
      baseTN = Number(defender?.system?.characteristics?.agi?.total ?? defender?.system?.characteristics?.agi?.value ?? 0) || 0;
      baseLabel = "Agility";
    }
  }

  const fatiguePenalty = Number(defender?.system?.fatigue?.penalty ?? 0) || 0;
  const carryPenalty = Number(defender?.system?.carry_rating?.penalty ?? 0) || 0;
  const woundPenalty = Number(defender?.system?.woundPenalty ?? 0) || 0;

  const breakdown = [
    { label: baseLabel, value: baseTN, keepZero: true },
    { label: "Fatigue Penalty", value: fatiguePenalty },
    { label: "Carry Penalty", value: carryPenalty },
    { label: "Wound Penalty", value: woundPenalty }
  ];

  const finalTN = Math.max(0, baseTN + fatiguePenalty + carryPenalty + woundPenalty);
  return { finalTN, breakdown, modifiers: breakdown };
}

function _computeBlockTNWithBreakdown(defender) {
  const sys = defender?.system ?? {};

  // Preferred: Combat Profession lane (NPCs always; PCs when present).
  // Fallback (PC data state): use the highest combatStyle.system.value.
  let baseTN = Number(sys?.professions?.combat ?? sys?.professionsWound?.combat ?? 0) || 0;
  let baseLabel = "Combat Profession";
  if (!baseTN && defender?.type !== "NPC") {
    const styles = (defender?.items ?? []).filter((i) => i.type === "combatStyle");
    const best = styles.sort((a, b) => (Number(b?.system?.value ?? 0) || 0) - (Number(a?.system?.value ?? 0) || 0))[0] ?? null;
    const v = Number(best?.system?.value ?? 0) || 0;
    if (v) {
      baseTN = v;
      baseLabel = "Combat Style";
    }
  }

  const fatiguePenalty = Number(defender?.system?.fatigue?.penalty ?? 0) || 0;
  const carryPenalty = Number(defender?.system?.carry_rating?.penalty ?? 0) || 0;
  const woundPenalty = Number(defender?.system?.woundPenalty ?? 0) || 0;

  const breakdown = [
    { label: baseLabel, value: baseTN, keepZero: true },
    { label: "Fatigue Penalty", value: fatiguePenalty },
    { label: "Carry Penalty", value: carryPenalty },
    { label: "Wound Penalty", value: woundPenalty }
  ];

  const finalTN = Math.max(0, baseTN + fatiguePenalty + carryPenalty + woundPenalty);
  return { finalTN, breakdown, modifiers: breakdown };
}

export const MagicOpposedWorkflow = {
  /**
   * Create a pending magic attack opposed test.
   */
  async createPending(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid) ?? _resolveDoc(cfg.attackerUuid);
    const dDoc = _resolveDoc(cfg.defenderTokenUuid) ?? _resolveDoc(cfg.defenderActorUuid) ?? _resolveDoc(cfg.defenderUuid);

    const aToken = _resolveToken(aDoc);
    const dToken = _resolveToken(dDoc);
    const attacker = _resolveActor(aDoc);
    const defender = _resolveActor(dDoc);

    if (!attacker || !defender) {
      ui.notifications.warn("Magic attack requires both a caster and a target.");
      return null;
    }

    const spell = await fromUuid(cfg.spellUuid);
    if (!spell) {
      ui.notifications.error("Could not resolve spell.");
      return null;
    }

    // Direct spells resolve immediately (no casting/defense tests).
    if (Boolean(spell?.system?.isDirect)) {
      await this.castDirectTargeted({
        attackerTokenUuid: cfg.attackerTokenUuid,
        attackerActorUuid: cfg.attackerActorUuid,
        attackerUuid: cfg.attackerUuid,
        defenderTokenUuid: cfg.defenderTokenUuid,
        defenderActorUuid: cfg.defenderActorUuid,
        defenderUuid: cfg.defenderUuid,
        spellUuid: cfg.spellUuid,
        spellOptions: cfg.spellOptions,
        castActionType: cfg.castActionType
      });
      return null;
    }

    const spellOptions = cfg.spellOptions ?? {};
    const tn = computeMagicCastingTN(attacker, spell, spellOptions);
    const healingDirect = isHealingSpell(spell);

    const data = {
      context: {
        schemaVersion: _CARD_VERSION,
        createdAt: Date.now(),
        createdBy: game.user.id,
        originalCastWorldTime: Number(game.time?.worldTime ?? 0) || 0,
        updatedAt: Date.now(),
        updatedBy: game.user.id,
        phase: "pending",
        healingDirect,
        bankChoicesEnabled: (() => {
          try {
            return Boolean(game.settings.get("uesrpg-3ev4", "opposedBankChoices"));
          } catch (_e) {
            return false;
          }
        })()
      },
      status: "pending",
      mode: "magic",
      attacker: {
        actorUuid: attacker.uuid,
        tokenUuid: aToken?.document?.uuid ?? aToken?.uuid ?? null,
        tokenName: aToken?.name ?? null,
        name: attacker.name,
        spellUuid: spell.uuid,
        spellName: spell.name,
        spellSchool: spell.system?.school ?? "",
        spellLevel: Number(spell.system?.level ?? 1),
        spellCost: Number(spell.system?.cost ?? 0),
        spellOptions,
        castActionType: String(cfg.castActionType ?? "primary"),
        apCost: 1,
        result: null,
        tn,
        mpSpent: null,
        mpRemaining: null,
        backfire: false
      },
      defender: {
        actorUuid: defender.uuid,
        tokenUuid: dToken?.document?.uuid ?? dToken?.uuid ?? null,
        tokenName: dToken?.name ?? null,
        name: defender.name,
        defenseType: null,
        result: null,
        tn: null,
        noDefense: false,
        apCost: 1
      },
      outcome: null
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? aToken ?? null }),
      content: _renderCard(data, ""),
      flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } },
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });

    await message.update({ content: _renderCard(data, message.id) });
    return message;
  },

  /**
   * Resolve a targeted Direct spell immediately (no casting/defense tests).
   *
   * This uses the same downstream resolution as the opposed workflow, but
   * forces an automatic hit and suppresses test rolls.
   */
  async castDirectTargeted(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid) ?? _resolveDoc(cfg.attackerUuid);
    const dDoc = _resolveDoc(cfg.defenderTokenUuid) ?? _resolveDoc(cfg.defenderActorUuid) ?? _resolveDoc(cfg.defenderUuid);

    const aToken = _resolveToken(aDoc);
    const dToken = _resolveToken(dDoc);
    const attacker = _resolveActor(aDoc);
    const defender = _resolveActor(dDoc);

    if (!attacker || !defender) {
      ui.notifications.warn("Direct spell requires both a caster and a target.");
      return null;
    }

    const spell = await fromUuid(cfg.spellUuid);
    if (!spell) {
      ui.notifications.error("Could not resolve spell.");
      return null;
    }

    if (!Boolean(spell?.system?.isDirect)) {
      ui.notifications.warn("This spell is not marked as Direct.");
      return null;
    }

    if (!canUserRollActor(game.user, attacker)) {
      ui.notifications.warn("You do not have permission to cast with this caster.");
      return null;
    }

    const spellOptions = cfg.spellOptions ?? {};

    // Spend AP (casting always costs 1 AP in the current action economy).
    const apCost = 1;
    const currentAP = Number(attacker?.system?.action_points?.value ?? 0) || 0;
    if (currentAP < apCost) {
      ui.notifications.warn(`${attacker.name} does not have enough Action Points to cast.`);
      return null;
    }

    const apReason = `Cast (Direct): ${spell.name}`;
    const apSpentOk = await ActionEconomy.spendAP(attacker, apCost, { reason: apReason, silent: false });
    if (!apSpentOk) return null;

    // Spend MP (attempt cost). Restraint refund is treated as an automatic success.
    const currentMagicka = Number(attacker?.system?.magicka?.value ?? 0) || 0;
    const magickaInfo = computeSpellAttemptMagickaCost(attacker, spell, spellOptions);
    const attemptCost = Number(magickaInfo?.attemptCost ?? 0) || 0;
    if (currentMagicka < attemptCost) {
      ui.notifications.warn(`${attacker.name} does not have enough Magicka (${currentMagicka}/${attemptCost}) to cast.`);
      return null;
    }

    const magickaSpend = await consumeSpellMagicka(attacker, spell, spellOptions);
    if (!magickaSpend?.ok) {
      // consumeSpellMagicka already toasts a reason on failure.
      return null;
    }

    const pseudoResult = {
      noRoll: true,
      rollTotal: 0,
      isSuccess: true,
      success: true,
      degree: 1,
      isCriticalSuccess: false,
      isCriticalFailure: false
    };

    const refundInfo = await applySpellRestraintRefund(attacker, spell, spellOptions, pseudoResult, magickaSpend);

    const data = {
      context: {
        schemaVersion: _CARD_VERSION,
        createdAt: Date.now(),
        createdBy: game.user.id,
        originalCastWorldTime: Number(game.time?.worldTime ?? 0) || 0,
        phase: "resolved",
        directNoTest: true
      },
      attacker: {
        uuid: attacker.uuid,
        name: attacker.name,
        tokenUuid: aToken?.document?.uuid ?? aToken?.uuid ?? cfg.attackerTokenUuid ?? null,
        tokenName: aToken?.name ?? aToken?.document?.name ?? attacker.name,
        spellUuid: spell.uuid,
        spellName: spell.name,
        spellSchool: spell.system?.school ?? "",
        spellLevel: Number(spell.system?.level ?? 1),
        spellCost: Number(spell.system?.cost ?? 0),
        actionType: cfg.castActionType ?? "primary",
        apCost,
        tn: null,
        result: pseudoResult,
        spellOptions,
        mpSpent: Number(magickaSpend?.spent ?? 0) || 0,
        mpRefund: Number(refundInfo?.refund ?? 0) || 0
      },
      defender: {
        uuid: defender.uuid,
        name: defender.name,
        tokenUuid: dToken?.document?.uuid ?? dToken?.uuid ?? cfg.defenderTokenUuid ?? null,
        tokenName: dToken?.name ?? dToken?.document?.name ?? defender.name,
        defenseType: "—",
        tn: null,
        result: null,
        noDefense: true,
        spellOptions: {}
      },
      outcome: null
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? aToken ?? null }),
      content: _renderCard(data, ""),
      flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } },
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });

    await message.update({ content: _renderCard(data, message.id) });
    await this._resolveOutcome(message, data, attacker, defender);
    return message;
  },

  /**
   * Resolve a spell cast with no target selected using the modern TN/DoS pipeline.
   * This does not apply damage/healing/effects without a target; it only reports the casting test.
   */
  async castUnopposed(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid) ?? _resolveDoc(cfg.attackerUuid);
    const aToken = _resolveToken(aDoc);
    const attacker = _resolveActor(aDoc);
    if (!attacker) {
      ui.notifications.warn("Could not resolve caster.");
      return null;
    }

    const spell = await fromUuid(cfg.spellUuid);
    if (!spell) {
      ui.notifications.error("Could not resolve spell.");
      return null;
    }

    if (!canUserRollActor(game.user, attacker)) {
      ui.notifications.warn("You do not have permission to roll for this caster.");
      return null;
    }

    const spellOptions = cfg.spellOptions ?? {};
    const tn = computeMagicCastingTN(attacker, spell, spellOptions);

    const apCost = 1;
    const currentAP = Number(attacker?.system?.action_points?.value ?? 0) || 0;
    if (currentAP < apCost) {
      ui.notifications.warn("Not enough Action Points to cast the spell.");
      return null;
    }

    const magickaInfo = computeSpellAttemptMagickaCost(attacker, spell, spellOptions);
    const currentMagicka = Number(attacker?.system?.magicka?.value ?? 0) || 0;
    if (currentMagicka < magickaInfo.cost) {
      ui.notifications.warn(`Not enough Magicka to cast ${spell?.name ?? "spell"}. Required: ${magickaInfo.cost}, Available: ${currentMagicka}.`);
      return null;
    }

    const castActionType = String(cfg.castActionType ?? "primary");
    const apReason = (castActionType === "secondary") ? "Cast Magic (Instant)" : "Cast Magic";
    const apSpentOk = await ActionEconomy.spendAP(attacker, apCost, { reason: apReason, silent: false });
    if (!apSpentOk) return null;

    const magickaSpend = await consumeSpellMagicka(attacker, spell, spellOptions);
    if (!magickaSpend?.ok) {
      try {
        await attacker.update({ "system.action_points.value": currentAP });
      } catch (_e) {
        // best-effort
      }
      return null;
    }

    const result = await doTestRoll(attacker, {
      target: tn.finalTN,
      allowLucky: true,
      allowUnlucky: true
    });

    // RAW: Spell Restraint reduces Magicka cost only on a successful spellcast.
    // We paid the attempt cost up-front; apply refund now that we know success/crit.
    try {
      const refundInfo = await applySpellRestraintRefund(attacker, spell, spellOptions, result, magickaSpend);
      if (refundInfo?.refund > 0) {
        // Mutate only our local spend record for reporting.
        magickaSpend.consumed = refundInfo.finalCost;
        magickaSpend.remaining = Number(attacker.system?.magicka?.value ?? magickaSpend.remaining);
        magickaSpend.refund = refundInfo.refund;
        magickaSpend.restraintBreakdown = refundInfo.breakdown;
      }
    } catch (err) {
      console.warn("UESRPG | Spell restraint refund failed", err);
    }

    await result.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      flavor: `<b>${spell.name}</b> — Casting Test`,
      flags: { [_FLAG_NS]: { magicOpposedMeta: { stage: "unopposed" } } }
    });

    const needsBackfire = shouldBackfire(spell, attacker, result.isCriticalFailure, !result.isSuccess);
    if (needsBackfire) {
      await triggerBackfire(attacker, spell);
    }

    const note = "No target selected — casting test resolved (no defense).";

    const data = {
      context: {
        schemaVersion: _CARD_VERSION,
        createdAt: Date.now(),
        createdBy: game.user.id,
        originalCastWorldTime: Number(game.time?.worldTime ?? 0) || 0,
        updatedAt: Date.now(),
        updatedBy: game.user.id,
        phase: "resolved",
        unopposed: true,
        note
      },
      status: "resolved",
      mode: "magic",
      attacker: {
        actorUuid: attacker.uuid,
        tokenUuid: aToken?.document?.uuid ?? aToken?.uuid ?? null,
        tokenName: aToken?.name ?? null,
        name: attacker.name,
        spellUuid: spell.uuid,
        spellName: spell.name,
        spellSchool: spell.system?.school ?? "",
        spellLevel: Number(spell.system?.level ?? 1),
        spellCost: Number(spell.system?.cost ?? 0),
        spellOptions,
        castActionType,
        apCost: 1,
        result,
        tn,
        mpSpent: magickaSpend.consumed,
        mpRemaining: magickaSpend.remaining,
        mpRefund: Number(magickaSpend.refund ?? 0) || 0,
        mpRestraintBreakdown: magickaSpend.restraintBreakdown ?? [],
        backfire: needsBackfire
      }
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? aToken ?? null }),
      content: _renderUnopposedCard(data, ""),
      flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } },
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });

    await message.update({ content: _renderUnopposedCard(data, message.id) });
    return message;
  },

  /**
   * Handle actions on the opposed card.
   */
  async handleAction(message, action) {
    const data = _getMessageState(message);
    if (!data) return;

    const attacker = _resolveActor(data.attacker.actorUuid);
    const defender = _resolveActor(data.defender.actorUuid);

    if (!attacker || !defender) {
      ui.notifications.warn("Could not resolve actors.");
      return;
    }

    const bankMode = _isBankChoicesEnabledForData(data);

    // Handle attacker commit
    if (action === "attacker-commit") {
      if (!bankMode) return;
      if (data.attacker.result) return;
      if (!requireUserCanRollActor(game.user, attacker)) return;

      _ensureBankedScaffold(data);
      data.attacker.banked.committed = true;
      data.attacker.banked.committedAt = Date.now();
      data.attacker.banked.committedBy = game.user.id;

      await _updateCard(message, data);

      // Check if both committed -> auto-roll
      const bank = _getBankCommitState(data);
      if (bank.bothCommitted) {
        await this._autoRollBanked(message);
      }
      return;
    }

    // Handle defender commit
    if (action === "defender-commit-block" || action === "defender-commit-evade" || action === "defender-commit-nodefense") {
      if (!bankMode) return;
      if (data.defender.result || data.defender.noDefense) return;
      if (!requireUserCanRollActor(game.user, defender)) return;

      _ensureBankedScaffold(data);
      
      // Store defense choice
      if (action === "defender-commit-nodefense") {
        data.defender.defenseType = "none";
        data.defender.noDefense = true;
      } else {
        data.defender.defenseType = (action === "defender-commit-block") ? "block" : "evade";
        data.defender.noDefense = false;
      }

      data.defender.banked.committed = true;
      data.defender.banked.committedAt = Date.now();
      data.defender.banked.committedBy = game.user.id;

      await _updateCard(message, data);

      // Check if both committed -> auto-roll
      const bank = _getBankCommitState(data);
      if (bank.bothCommitted) {
        await this._autoRollBanked(message);
      }
      return;
    }

    if (action === "attacker-roll") {
      if (data.attacker.result) return;
      if (!requireUserCanRollActor(game.user, attacker)) return;

      const spell = await fromUuid(data.attacker.spellUuid);
      if (!spell) {
        ui.notifications.error("Could not resolve spell.");
        return;
      }

      // Preflight resources (AP + Magicka) before spending.
      const apCost = Number(data.attacker.apCost ?? 1) || 1;
      const currentAP = Number(attacker?.system?.action_points?.value ?? 0) || 0;
      if (currentAP < apCost) {
        ui.notifications.warn("Not enough Action Points to cast a spell.");
        return;
      }

      const magickaInfo = computeSpellAttemptMagickaCost(attacker, spell, data.attacker.spellOptions ?? {});
      const currentMagicka = Number(attacker?.system?.magicka?.value ?? 0) || 0;
      if (currentMagicka < magickaInfo.cost) {
        ui.notifications.warn(`Not enough Magicka to cast ${spell?.name ?? "spell"}. Required: ${magickaInfo.cost}, Available: ${currentMagicka}.`);
        return;
      }

      const apReason = (String(data.attacker.castActionType ?? "primary") === "secondary") ? "Cast Magic (Instant)" : "Cast Magic";
      const apSpentOk = await ActionEconomy.spendAP(attacker, apCost, { reason: apReason, silent: false });
      if (!apSpentOk) return;

      // Consume Magicka at cast time. If this fails due to a race, we attempt to refund AP.
      const magickaSpend = await consumeSpellMagicka(attacker, spell, data.attacker.spellOptions ?? {});
      if (!magickaSpend?.ok) {
        try {
          await attacker.update({ "system.action_points.value": currentAP });
        } catch (_e) {
          // best-effort
        }
        return;
      }

      data.attacker.mpSpent = magickaSpend.consumed;
      data.attacker.mpRemaining = magickaSpend.remaining;

      // Roll casting test
      const result = await doTestRoll(attacker, {
        target: data.attacker.tn.finalTN,
        allowLucky: true,
        allowUnlucky: true
      });

      await result.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        flavor: `<b>${spell.name}</b> — Casting Test`,
        flags: { [_FLAG_NS]: { magicOpposedMeta: { parentMessageId: message.id, stage: "attacker" } } }
      });

      // Backfire (RAW / system rules)
      const needsBackfire = shouldBackfire(spell, attacker, result.isCriticalFailure, !result.isSuccess);
      if (needsBackfire) {
        await triggerBackfire(attacker, spell);
      }

      // RAW: Spell Restraint reduces Magicka cost only on a successful spellcast.
      // We paid the attempt cost up-front; apply refund now that we know success/crit.
      try {
        const refundInfo = await applySpellRestraintRefund(attacker, spell, data.attacker.spellOptions ?? {}, result, magickaSpend);
        if (refundInfo?.refund > 0) {
          data.attacker.mpSpent = refundInfo.finalCost;
          data.attacker.mpRemaining = Number(attacker.system?.magicka?.value ?? data.attacker.mpRemaining);
          data.attacker.mpRefund = refundInfo.refund;
          data.attacker.mpRestraintBreakdown = refundInfo.breakdown;
        }
      } catch (err) {
        console.warn("UESRPG | Spell restraint refund failed", err);
      }

      data.attacker.result = result;
      data.attacker.backfire = needsBackfire;

      // Healing spells are not opposed when a target is selected.
      // Resolve immediately based on casting success.
      if (Boolean(data.context?.healingDirect)) {
        data.defender.noDefense = true;
        data.defender.defenseType = "—";
        data.defender.tn = null;
        data.defender.result = { rollTotal: 0, isSuccess: false, degree: 0, isCriticalSuccess: false, isCriticalFailure: false };
        data.context.phase = "resolved";
        await this._resolveOutcome(message, data, attacker, defender);
        return;
      }

      data.context.phase = "awaiting-defense";
      await _updateCard(message, data);
      return;
    }

    if (action === "defender-roll-block" || action === "defender-roll-evade") {
      if (data.defender.result || data.defender.noDefense) return;
      if (!requireUserCanRollActor(game.user, defender)) return;

      const apCost = Number(data.defender.apCost ?? 1) || 1;
      const currentAP = Number(defender?.system?.action_points?.value ?? 0) || 0;
      if (currentAP < apCost) {
        ui.notifications.warn("Not enough Action Points to defend against the spell.");
        return;
      }

      const defenseType = (action === "defender-roll-block") ? "block" : "evade";
      const defenseLabel = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);

      const apSpentOk = await ActionEconomy.spendAP(defender, apCost, { reason: `Defense (${defenseLabel})`, silent: false });
      if (!apSpentOk) return;

      const tnObj = (defenseType === "block") ? _computeBlockTNWithBreakdown(defender) : _computeEvadeTNWithBreakdown(defender);
      const defenseTN = Number(tnObj.finalTN ?? 0) || 0;

      const result = await doTestRoll(defender, {
        target: defenseTN,
        allowLucky: true,
        allowUnlucky: true
      });

      await result.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defender }),
        flavor: `<b>${defenseLabel}</b> vs ${data.attacker.spellName}`,
        flags: { [_FLAG_NS]: { magicOpposedMeta: { parentMessageId: message.id, stage: "defender" } } }
      });

      data.defender.result = result;
      data.defender.defenseType = defenseLabel;
      data.defender.tn = tnObj;
      data.context.phase = "resolved";

      await this._resolveOutcome(message, data, attacker, defender);
      return;
    }

    if (action === "defender-no-defense") {
      // No defense does not cost AP.
      if (data.defender.result || data.defender.noDefense) return;
      if (!requireUserCanRollActor(game.user, defender)) return;

      data.defender.noDefense = true;
      data.defender.defenseType = "—";
      data.defender.tn = null;
      data.defender.result = { rollTotal: 0, isSuccess: false, degree: 0, isCriticalSuccess: false, isCriticalFailure: false };
      data.context.phase = "resolved";

      await this._resolveOutcome(message, data, attacker, defender);
    }
  },

  /**
   * Auto-roll when both sides have committed (banked mode).
   */
  async _autoRollBanked(message) {
    const data = _getMessageState(message);
    if (!data) return;

    const bank = _getBankCommitState(data);
    if (!bank.bothCommitted) return;

    const attacker = _resolveActor(data.attacker.actorUuid);
    const defender = _resolveActor(data.defender.actorUuid);

    if (!attacker || !defender) return;

    // Roll attacker if not yet rolled
    if (!data.attacker.result) {
      await this.handleAction(message, "attacker-roll");
      // Reload data after attacker roll
      const updatedData = _getMessageState(message);
      if (updatedData) Object.assign(data, updatedData);
    }

    // Roll defender if not yet rolled and not No Defense
    if (!data.defender.result && !data.defender.noDefense) {
      const defenseAction = data.defender.defenseType === "block" 
        ? "defender-roll-block" 
        : "defender-roll-evade";
      await this.handleAction(message, defenseAction);
    } else if (data.defender.noDefense) {
      // Handle no-defense case
      await this.handleAction(message, "defender-no-defense");
    }
  },

  /**
   * Resolve the outcome of the opposed test.
   */
  async _resolveOutcome(message, data, attacker, defender) {
    const spell = await fromUuid(data.attacker.spellUuid);
    if (!spell) return;

    const aResult = data.attacker.result;
    const dResult = data.defender.result;

    // Track last spell cast time/uuid for RAW upkeep restriction (no-duration spells).
    if (aResult?.success) {
      try {
        await attacker.setFlag("uesrpg-3ev4", "lastSpellCastWorldTime", game.time.worldTime);
        await attacker.setFlag("uesrpg-3ev4", "lastSpellCastSpellUuid", spell.uuid);
      } catch (err) {
        console.warn("UESRPG | Failed to set last spell cast flags", err);
      }
    }

    // Direct spells: resolve immediately without any casting/defense tests.
    if (Boolean(data.context?.directNoTest)) {
      const isCritical = false;
      const castOk = true;

      data.outcome = {
        winner: "attacker",
        attackerDegree: 0,
        defenderDegree: 0,
        attackerWins: true,
        text: `${attacker.name} casts ${spell.name} directly on ${defender.name}.`
      };

      const damageType = getSpellDamageType(spell);

      // Healing: roll and apply immediately.
      if (damageType === "healing") {
        const healRoll = await rollSpellHealing(spell, { isCritical });
        const healValue = Number(healRoll.total) || 0;
        const rollHTML = await healRoll.render();
        await applyMagicHealing(defender, healValue, spell, {
          isCritical,
          rollHTML,
          source: spell.name
        });

        await _updateCard(message, data);
        return;
      }

      const damageFormula = getSpellDamageFormula(spell);
      const isDamaging = Boolean(damageFormula && damageFormula !== "0");

      if (isDamaging) {
        const spellOptions = data.attacker.spellOptions ?? {};

        // Determine overload/overcharge effective state for reporting.
        const costInfo = computeSpellMagickaCost(attacker, spell, {
          ...spellOptions,
          isCritical
        });

        const wpBonus = Math.floor(Number(attacker.system?.characteristics?.wp?.total ?? 0) / 10);
        const isOverloaded = Boolean(costInfo?.isOverloaded);
        const overloadBonus = isOverloaded ? wpBonus : 0;

        const commonRollOptions = { isCritical, isOverloaded, wpBonus };

        // Master of Magicka: if the caster chose to overcharge, roll twice and keep the highest.
        const wantsOvercharge = Boolean(costInfo?.isOvercharged);
        let damageRoll = null;
        let overchargeTotals = null;
        if (wantsOvercharge) {
          const r1 = await rollSpellDamage(spell, commonRollOptions);
          const r2 = await rollSpellDamage(spell, commonRollOptions);
          const t1 = Number(r1.total) || 0;
          const t2 = Number(r2.total) || 0;
          damageRoll = (t2 > t1) ? r2 : r1;
          overchargeTotals = [t1, t2];
        } else {
          damageRoll = await rollSpellDamage(spell, commonRollOptions);
        }

        const baseDamage = Number(damageRoll.total) || 0;
        const elemBonusInfo = computeElementalDamageBonus(attacker, damageType);
        const elementalBonus = Number(elemBonusInfo?.bonus ?? 0) || 0;
        const damageValue = baseDamage + elementalBonus;
        const rollHTML = await damageRoll.render();

        await applyMagicDamage(defender, damageValue, damageType, spell, {
          isCritical,
          hitLocation: "Body",
          rollHTML,
          isOverloaded,
          overloadBonus,
          isOvercharged: wantsOvercharge,
          overchargeTotals,
          elementalBonus,
          elementalBonusLabel: elemBonusInfo?.label || "",
          source: spell.name
        });

        if (Boolean(spell.system?.hasUpkeep) || (spell.effects?.size ?? 0) > 0) {
          await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
        }

        await _updateCard(message, data);
        return;
      }

      // Non-damaging direct spell: apply effects immediately.
      if ((spell.effects?.size ?? 0) > 0) {
        await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
      } else {
        await applySpellEffect(defender, spell, {
          isCritical,
          duration: {}
        });
      }

      await _updateCard(message, data);
      return;
    }

    // Healing spells: not opposed. Only casting success matters.
    if (Boolean(data.context?.healingDirect)) {
      const isCritical = Boolean(aResult?.isCriticalSuccess);
      const castOk = Boolean(aResult?.isSuccess);

      data.outcome = {
        winner: castOk ? "attacker" : "defender",
        attackerDegree: aResult?.degree ?? 0,
        defenderDegree: 0,
        attackerWins: castOk,
        text: castOk
          ? `${attacker.name} successfully casts ${spell.name} on ${defender.name}.`
          : `${attacker.name} fails to cast ${spell.name}.`
      };

      if (castOk) {
        const healRoll = await rollSpellHealing(spell, { isCritical });
        const healValue = Number(healRoll.total) || 0;
        const rollHTML = await healRoll.render();
        await applyMagicHealing(defender, healValue, spell, {
          isCritical,
          rollHTML,
          source: spell.name
        });
      }

      await _updateCard(message, data);
      return;
    }

    const outcome = resolveOpposed(aResult, dResult);
    const attackerWins = outcome.winner === "attacker";

    data.outcome = {
      ...outcome,
      attackerWins,
      text: attackerWins
        ? `${spell.name} hits ${defender.name}.`
        : `${defender.name} defends against ${spell.name}.`
    };

    if (attackerWins) {
      const isCritical = Boolean(aResult?.isCriticalSuccess);
      const hitLocation = getHitLocationFromRoll(Number(aResult?.rollTotal ?? 0));

      const damageFormula = getSpellDamageFormula(spell);
      const isDamaging = Boolean(damageFormula && damageFormula !== "0");

      if (isDamaging) {
        const spellOptions = data.attacker.spellOptions ?? {};
        const damageType = getSpellDamageType(spell);

        // Determine overload/overcharge effective state for reporting.
        const costInfo = computeSpellMagickaCost(attacker, spell, {
          ...spellOptions,
          isCritical
        });

        const wpBonus = Math.floor(Number(attacker.system?.characteristics?.wp?.total ?? 0) / 10);
        const isOverloaded = Boolean(costInfo?.isOverloaded);
        const overloadBonus = isOverloaded ? wpBonus : 0;

        // Roll damage (critical handling + overload bonus included in total).
        const commonRollOptions = { isCritical, isOverloaded, wpBonus };

        // Master of Magicka: if the caster chose to overcharge, roll twice and keep the highest.
        const wantsOvercharge = Boolean(costInfo?.isOvercharged);
        let damageRoll = null;
        let overchargeTotals = null;
        if (wantsOvercharge) {
          const r1 = await rollSpellDamage(spell, commonRollOptions);
          const r2 = await rollSpellDamage(spell, commonRollOptions);
          const t1 = Number(r1.total) || 0;
          const t2 = Number(r2.total) || 0;
          damageRoll = (t2 > t1) ? r2 : r1;
          overchargeTotals = [t1, t2];
        } else {
          damageRoll = await rollSpellDamage(spell, commonRollOptions);
        }

        const baseDamage = Number(damageRoll.total) || 0;
        const elemBonusInfo = computeElementalDamageBonus(attacker, damageType);
        const elementalBonus = Number(elemBonusInfo?.bonus ?? 0) || 0;
        const damageValue = baseDamage + elementalBonus;
        const rollHTML = await damageRoll.render();

        await applyMagicDamage(defender, damageValue, damageType, spell, {
          isCritical,
          hitLocation,
          rollHTML,
          isOverloaded,
          overloadBonus,
          isOvercharged: wantsOvercharge,
          overchargeTotals,
          elementalBonus,
          elementalBonusLabel: elemBonusInfo?.label || "",
          source: spell.name
        });

        // If the spell defines Active Effects or has Upkeep, apply a spell effect marker on hit.
        // This is required for:
        //  - duration tracking (including Upkeep prompt windows)
        //  - non-damaging secondary effects that accompany a damaging spell
        // Damage resolution remains authoritative; the marker/effects are additive.
        if (Boolean(spell.system?.hasUpkeep) || (spell.effects?.size ?? 0) > 0) {
          await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
        }
      } else {
        if ((spell.effects?.size ?? 0) > 0) {
        await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
      } else {
        await applySpellEffect(defender, spell, {
          isCritical,
          duration: {}
        });
      }
      }
    }

    await _updateCard(message, data);
  },

  /**
   * Banked-choice auto-roll helper for GM-online scenarios (magic opposed).
   * Placeholder for future implementation of banked choices for spell casting.
   * Currently, magic opposed spells do not use banked choices infrastructure.
   */
  async maybeAutoRollBanked(message) {
    // TODO: Implement banked choices for magic opposed workflow if needed
    // For now, magic opposed spells resolve immediately without banking
    return;
  },

  /**
   * Banked-choice auto-roll helper for no-GM scenarios (magic opposed).
   * Placeholder for future implementation of banked choices for spell casting.
   * Currently, magic opposed spells do not use banked choices infrastructure.
   */
  async maybeAutoRollBankedNoGM(message) {
    // TODO: Implement banked choices for magic opposed workflow if needed
    // For now, magic opposed spells resolve immediately without banking
    return;
  }
};

// Chat hook: bind button clicks (v13).
Hooks.on("renderChatMessageHTML", (message, html) => {
  const data = _getMessageState(message);
  if (!data) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  root.querySelectorAll("[data-ues-magic-opposed-action]").forEach((el) => {
    const action = el.dataset.uesMagicOpposedAction;

    // Permission-aware button state
    try {
      const attackerUuid = data?.attacker?.actorUuid;
      const defenderUuid = data?.defender?.actorUuid;
      const actorUuid = (action === "attacker-roll") ? attackerUuid : (action?.startsWith?.("defender-") ? defenderUuid : null);
      const actor = actorUuid ? _resolveActor(actorUuid) : null;
      if (actor && !canUserRollActor(game.user, actor)) {
        el.setAttribute("disabled", "disabled");
        el.setAttribute("title", "You do not have permission to roll for this actor.");
      }
    } catch (_e) {
      // no-op
    }

    el.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const act = ev.currentTarget?.dataset?.uesMagicOpposedAction;
      if (!act) return;
      await MagicOpposedWorkflow.handleAction(message, act);
    });
  });
});
