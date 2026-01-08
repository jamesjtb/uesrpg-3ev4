/**
 * module/magic/opposed-workflow.js
 *
 * Magic attack opposed workflow for UESRPG 3ev4.
 * Implements RAW Chapter 6 spell attack rules:
 *  - Attack spells use casting test as attack test
 *  - Only Block/Evade allowed as defense (no Parry/Counter)
 *  - No advantages with spells
 *  - Critical success: max damage OR double restraint reduction
 *  - MP consumed regardless of hit/miss
 *  - Backfire on critical failure or conditional failure
 */

import { doTestRoll, computeResultFromRollTotal, resolveOpposed, formatDegree } from "../helpers/degree-roll-helper.js";
import { computeMagicCastingTN, consumeSpellMagicka, rollSpellDamage, getMaxSpellDamage } from "./magicka-utils.js";
import { applySpellEffect } from "./spell-effects.js";
import { shouldBackfire, triggerBackfire } from "./backfire.js";
import { safeUpdateChatMessage } from "../helpers/chat-message-socket.js";
import { requireUserCanRollActor } from "../helpers/permissions.js";
import { computeSkillTN } from "../skills/skill-tn.js";

const _FLAG_NS = "uesrpg-3ev4";
const _FLAG_KEY = "magicOpposed";
const _CARD_VERSION = 1;

function _resolveDoc(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch (_e) { return null; }
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

function _fmtDegree(result) {
  if (!result) return "";
  const deg = Number(result.degree ?? 0);
  if (result.isSuccess) return `<span style="color: green;">${deg} DoS</span>`;
  return `<span style="color: red;">${deg} DoF</span>`;
}

function _getMessageState(message) {
  const raw = message?.flags?.[_FLAG_NS]?.[_FLAG_KEY];
  if (!raw || typeof raw !== "object") return null;
  // Support versioned structure
  if (Number(raw.version) >= 1 && raw.state) return raw.state;
  // Legacy: state stored directly
  if (raw.attacker && raw.defender) return raw;
  return null;
}

/**
 * Render the magic opposed card HTML
 */
function _renderCard(data, messageId) {
  const a = data.attacker;
  const d = data.defender;
  
  const spell = a.spellName ?? "Spell";
  const spellSchool = a.spellSchool ?? "";
  const spellLevel = a.spellLevel ?? 1;
  const spellCost = a.spellCost ?? 0;
  
  // Attacker section
  const aTNLabel = a.tn?.finalTN != null ? String(a.tn.finalTN) : "—";
  const attackerActions = !a.result
    ? `<button class="uesrpg-magic-opposed-btn" data-action="attacker-roll" style="margin-top:8px;">Roll Casting Test</button>`
    : "";
  
  // Defender section
  const dTNLabel = d.tn != null ? String(d.tn) : "—";
  const defenderActions = (a.result && !d.result && !d.noDefense)
    ? `
      <button class="uesrpg-magic-opposed-btn" data-action="defender-roll-block" style="margin-top:8px;">Block</button>
      <button class="uesrpg-magic-opposed-btn" data-action="defender-roll-evade" style="margin-top:8px; margin-left:4px;">Evade</button>
      <button class="uesrpg-magic-opposed-btn" data-action="defender-no-defense" style="margin-top:8px; margin-left:4px;">No Defense</button>
    `
    : "";
  
  // Outcome section
  let outcomeLine = "";
  if (data.outcome) {
    const winner = data.outcome.winner;
    const outcomeText = data.outcome.text ?? "";
    const color = winner === "attacker" ? "green" : (winner === "defender" ? "blue" : "gray");
    outcomeLine = `<div style="margin-top:12px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid ${color}; font-weight:600;">${outcomeText}</div>`;
  }
  
  const aTNBreakdown = a.tn?.modifiers ? a.tn.modifiers.map(m => `<div style="font-size:11px; opacity:0.8;">${m.label}: ${m.value >= 0 ? '+' : ''}${m.value}</div>`).join("") : "";
  
  return `
  <div class="ues-magic-opposed-card" data-message-id="${messageId}" style="padding:6px 6px;">
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start;">
      <div style="padding-right:10px; border-right:1px solid rgba(0,0,0,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Caster</div>
          <div style="font-size:13px;"><b>${a.tokenName ?? a.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Spell:</b> ${spell} ${spellSchool ? `(${spellSchool} ${spellLevel})` : ""}</div>
          <div><b>MP Cost:</b> ${spellCost}</div>
          <div><b>TN:</b> ${aTNLabel}</div>
          ${a.result ? `<div><b>Roll:</b> ${a.result.rollTotal} — ${_fmtDegree(a.result)}${a.result.isCriticalSuccess ? ' <span style="color:green;">CRITICAL</span>' : ''}${a.result.isCriticalFailure ? ' <span style="color:red;">CRITICAL FAIL</span>' : ''}</div>` : ""}
          ${aTNBreakdown}
        </div>
        ${attackerActions}
      </div>
      <div style="padding-left:2px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Target</div>
          <div style="font-size:13px;"><b>${d.tokenName ?? d.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Defense:</b> ${d.defenseType ?? "—"}</div>
          <div><b>TN:</b> ${dTNLabel}</div>
          ${d.result ? `<div><b>Roll:</b> ${d.result.rollTotal} — ${_fmtDegree(d.result)}</div>` : ""}
          ${d.noDefense ? '<div style="color:red; font-style:italic;">No Defense</div>' : ""}
        </div>
        ${defenderActions}
      </div>
    </div>
    ${outcomeLine}
  </div>`;
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

/**
 * Compute defense TN (Block or Evade only for spells)
 */
function _computeDefenseTN(actor, defenseType) {
  if (defenseType === "evade") {
    // Use Evade skill
    const evadeSkill = actor.items.find(i => i.type === "skill" && i.name?.toLowerCase().includes("evade"));
    const baseTN = evadeSkill ? Number(evadeSkill.system?.value ?? 0) : 0;
    
    // Apply penalties
    const fatiguePenalty = Number(actor.system?.fatigue?.penalty ?? 0);
    const carryPenalty = Number(actor.system?.carry_rating?.penalty ?? 0);
    const woundPenalty = Number(actor.system?.woundPenalty ?? 0);
    
    return baseTN + fatiguePenalty + carryPenalty + woundPenalty;
  } else if (defenseType === "block") {
    // Use Combat profession with shield bonus
    const combatProf = Number(actor.system?.professions?.combat ?? 0);
    
    // Check for equipped shield
    let shieldBonus = 0;
    const shields = actor.items.filter(i => 
      i.type === "armor" && 
      i.system?.equipped === true &&
      (i.name?.toLowerCase().includes("shield") || i.system?.armorType?.toLowerCase().includes("shield"))
    );
    if (shields.length > 0) {
      // Simple +10 bonus for shield
      shieldBonus = 10;
    }
    
    // Apply penalties
    const fatiguePenalty = Number(actor.system?.fatigue?.penalty ?? 0);
    const carryPenalty = Number(actor.system?.carry_rating?.penalty ?? 0);
    const woundPenalty = Number(actor.system?.woundPenalty ?? 0);
    
    return combatProf + shieldBonus + fatiguePenalty + carryPenalty + woundPenalty;
  }
  
  return 0;
}

/**
 * Main workflow object
 */
export const MagicOpposedWorkflow = {
  /**
   * Create a pending magic attack opposed test
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
    
    // Compute casting TN
    const tn = computeMagicCastingTN(attacker, spell, cfg.spellOptions ?? {});
    
    const data = {
      context: {
        schemaVersion: 1,
        createdAt: Date.now(),
        createdBy: game.user.id,
        updatedAt: Date.now(),
        updatedBy: game.user.id,
        phase: "pending",
        waitingSince: null
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
        spellOptions: cfg.spellOptions ?? {},
        result: null,
        tn
      },
      defender: {
        actorUuid: defender.uuid,
        tokenUuid: dToken?.document?.uuid ?? dToken?.uuid ?? null,
        tokenName: dToken?.name ?? null,
        name: defender.name,
        defenseType: null,
        result: null,
        tn: null,
        noDefense: false
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
   * Handle actions on the opposed card
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
    
    if (action === "attacker-roll") {
      if (data.attacker.result) return; // Already rolled
      if (!requireUserCanRollActor(game.user, attacker)) return;
      
      const spell = await fromUuid(data.attacker.spellUuid);
      if (!spell) {
        ui.notifications.error("Could not resolve spell.");
        return;
      }
      
      // Roll casting test
      const result = await doTestRoll(attacker, {
        target: data.attacker.tn.finalTN,
        allowLucky: true,
        allowUnlucky: true
      });
      
      // Post roll to chat with Dice So Nice
      await result.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker }),
        flavor: `<b>${spell.name}</b> — Casting Test`,
        flags: { [_FLAG_NS]: { magicOpposedMeta: { parentMessageId: message.id, stage: "attacker" } } }
      });
      
      // Check for backfire
      const needsBackfire = shouldBackfire(spell, attacker, result.isCriticalFailure, !result.isSuccess);
      if (needsBackfire) {
        await triggerBackfire(attacker, spell);
      }
      
      // Update card with result
      data.attacker.result = result;
      data.attacker.backfire = needsBackfire;
      data.context.phase = "awaiting-defense";
      await _updateCard(message, data);
      
    } else if (action === "defender-roll-block" || action === "defender-roll-evade") {
      if (data.defender.result) return; // Already rolled
      if (!requireUserCanRollActor(game.user, defender)) return;
      
      const defenseType = action === "defender-roll-block" ? "block" : "evade";
      const defenseLabel = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);
      
      // Compute defense TN
      const defenseTN = _computeDefenseTN(defender, defenseType);
      
      // Roll defense
      const result = await doTestRoll(defender, {
        target: defenseTN,
        allowLucky: true,
        allowUnlucky: true
      });
      
      // Post roll to chat with Dice So Nice
      await result.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defender }),
        flavor: `<b>${defenseLabel}</b> vs ${data.attacker.spellName}`,
        flags: { [_FLAG_NS]: { magicOpposedMeta: { parentMessageId: message.id, stage: "defender" } } }
      });
      
      // Update card with result
      data.defender.result = result;
      data.defender.defenseType = defenseLabel;
      data.defender.tn = defenseTN;
      data.context.phase = "resolved";
      
      // Resolve outcome
      await this._resolveOutcome(message, data, attacker, defender);
      
    } else if (action === "defender-no-defense") {
      if (!requireUserCanRollActor(game.user, defender)) return;
      
      data.defender.noDefense = true;
      data.defender.result = { rollTotal: 999, isSuccess: false, degree: 0 }; // Auto-fail
      data.context.phase = "resolved";
      
      // Resolve outcome
      await this._resolveOutcome(message, data, attacker, defender);
    }
  },
  
  /**
   * Resolve the outcome of the opposed test
   */
  async _resolveOutcome(message, data, attacker, defender) {
    const spell = await fromUuid(data.attacker.spellUuid);
    if (!spell) return;
    
    // Determine winner
    const aResult = data.attacker.result;
    const dResult = data.defender.result;
    
    const outcome = resolveOpposed(aResult, dResult);
    const attackerWins = outcome.winner === "attacker";
    
    const outcomeText = attackerWins
      ? `${spell.name} hits ${defender.name}!`
      : `${defender.name} defends against ${spell.name}!`;
    
    data.outcome = { ...outcome, text: outcomeText };
    
    // Apply effects if attacker wins
    if (attackerWins) {
      const isDamaging = Boolean(spell.system?.damage);
      const isCritical = Boolean(aResult.isCriticalSuccess);
      
      if (isDamaging) {
        // Roll and apply damage
        let damageRoll = await rollSpellDamage(spell, {
          isCritical,
          isOverloaded: data.attacker.spellOptions?.isOverloaded,
          wpBonus: Math.floor(Number(attacker.system?.characteristics?.wp?.total ?? 0) / 10)
        });
        
        const damageValue = Number(damageRoll.total);
        
        // Apply damage to defender's HP
        const currentHP = Number(defender.system?.resources?.hp?.value ?? 0);
        const newHP = Math.max(0, currentHP - damageValue);
        await defender.update({ "system.resources.hp.value": newHP });
        
        // Post damage to chat
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: attacker }),
          content: `<div class="uesrpg-damage"><b>${spell.name}</b> deals <b>${damageValue}</b> damage to ${defender.name}${isCritical ? " (CRITICAL - Maximum Damage!)" : ""}!</div>`
        });
      } else {
        // Apply non-damaging spell effect
        await applySpellEffect(defender, spell, {
          isCritical,
          duration: {} // TODO: parse from spell attributes
        });
      }
    }
    
    // Consume magicka (happens regardless of hit/miss per RAW p.128 line 191)
    await consumeSpellMagicka(attacker, spell, data.attacker.spellOptions);
    
    await _updateCard(message, data);
  }
};

/**
 * Hook to handle button clicks on magic opposed cards
 */
Hooks.on("renderChatMessage", (message, html) => {
  const data = _getMessageState(message);
  if (!data) return;
  
  html.find(".uesrpg-magic-opposed-btn").on("click", async (event) => {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    if (!action) return;
    
    await MagicOpposedWorkflow.handleAction(message, action);
  });
});
