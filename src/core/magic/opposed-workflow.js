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

import { doTestRoll, resolveOpposed, formatDegree } from "../../../module/helpers/degree-roll-helper.js";
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
import { safeUpdateChatMessage } from "../../../module/helpers/chat-message-socket.js";
import { canUserRollActor, requireUserCanRollActor } from "../../../module/helpers/permissions.js";
import { canTokenEscapeTemplate } from "../../../module/helpers/aoe-utils.js";
import { ActionEconomy } from "../combat/action-economy.js";
import { getHitLocationFromRoll, resolveHitLocationForTarget } from "../combat/combat-utils.js";
import {
  computeElementalDamageBonus,
  isElementalDamageType,
  canUseMasterOfMagicka
} from "./magic-modifiers.js";
import { AttackTracker } from "../combat/attack-tracker.js";
import { classifySpellForRouting } from "./spell-routing.js";
import { getBlockValue } from "../combat/mitigation.js";
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

function _extractTN(tnObj) {
  if (tnObj == null) return "—";
  if (typeof tnObj === 'object' && tnObj.finalTN != null) return tnObj.finalTN;
  if (typeof tnObj === 'number') return tnObj;
  return "—";
}

function _getMessageState(message) {
  const raw = message?.flags?.[_FLAG_NS]?.[_FLAG_KEY];
  if (!raw || typeof raw !== "object") return null;
  if (Number(raw.version) >= 1 && raw.state) return raw.state;
  if (raw.attacker && raw.defender) return raw;
  return null;
}

function _getDefenderEntries(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.defenders) && data.defenders.length) return data.defenders;
  if (data.defender && typeof data.defender === "object") return [data.defender];
  return [];
}

function _isMultiDefender(data) {
  const list = _getDefenderEntries(data);
  return list.length > 1;
}

function _resolveDefenderIndex(data, opts = {}) {
  const list = _getDefenderEntries(data);
  if (!list.length) return null;

  const idx = Number(opts.defenderIndex ?? opts.defenderIdx ?? NaN);
  if (Number.isInteger(idx) && idx >= 0 && idx < list.length) return idx;

  const tokenUuid = String(opts.defenderTokenUuid ?? "").trim();
  if (tokenUuid) {
    const tokenIndex = list.findIndex(def => String(def?.tokenUuid ?? "") === tokenUuid);
    if (tokenIndex >= 0) return tokenIndex;
  }

  const actorUuid = String(opts.defenderActorUuid ?? opts.defenderUuid ?? "").trim();
  if (actorUuid) {
    const actorIndex = list.findIndex(def => String(def?.actorUuid ?? "") === actorUuid);
    if (actorIndex >= 0) return actorIndex;
  }

  return 0;
}

function _selectDefenderEntry(data, opts = {}) {
  const defenders = _getDefenderEntries(data);
  const isMulti = _isMultiDefender(data);
  const defenderIndex = _resolveDefenderIndex(data, opts);
  const defender = (defenderIndex != null) ? defenders[defenderIndex] : null;
  if (defender) data.defender = defender;
  return { defender, defenderIndex, defenders, isMulti };
}

function _getDefenderOutcome(data, defender) {
  return _isMultiDefender(data) ? (defender?.outcome ?? null) : (data?.outcome ?? null);
}

function _setDefenderOutcome(data, defender, outcome) {
  if (_isMultiDefender(data)) {
    if (defender) defender.outcome = outcome;
  } else {
    data.outcome = outcome;
  }
}

function _markResolutionPhase(data) {
  const allResolved = _getDefenderEntries(data).every(def => Boolean(_getDefenderOutcome(data, def)));
  data.context = data.context ?? {};
  data.context.phase = allResolved ? "resolved" : "awaiting-defense";
}

/**
 * Check if a damage type is a healing type (includes temporary healing).
 * @param {string} damageType
 * @returns {boolean}
 */
function _isHealingType(damageType) {
  const dt = String(damageType || "").toLowerCase();
  return dt === "healing" || dt === "temporaryhealing" || dt === "temporary healing";
}

/**
 * Check if a damage type is temporary healing (normalized comparison).
 * Handles case variations and both "temporaryhealing" and "temporary healing" formats.
 * @param {string} damageType
 * @returns {boolean}
 */
function _isTemporaryHealingType(damageType) {
  if (!damageType) return false;
  const dt = String(damageType).toLowerCase().trim();
  return dt === "temporaryhealing" || dt === "temporary healing";
}

function _shouldShareSpellDamage(data) {
  const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
  return isAoE || _isMultiDefender(data);
}

async function _computeSpellDamageShared({ attacker, spell, spellOptions, isCritical, damageType } = {}) {
  const costInfo = computeSpellMagickaCost(attacker, spell, {
    ...(spellOptions ?? {}),
    isCritical
  });

  const wpBonus = Math.floor(Number(attacker.system?.characteristics?.wp?.total ?? 0) / 10);
  const isOverloaded = Boolean(costInfo?.isOverloaded);
  const overloadBonus = isOverloaded ? wpBonus : 0;

  const commonRollOptions = { isCritical, isOverloaded, wpBonus };

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
  const damageValue = baseDamage + overloadBonus + elementalBonus;
  const rollHTML = await damageRoll.render();

  return {
    spellUuid: spell?.uuid ?? null,
    damageType,
    baseDamage,
    damageValue,
    rollHTML,
    isOverloaded,
    overloadBonus,
    isOvercharged: wantsOvercharge,
    overchargeTotals,
    elementalBonus,
    elementalBonusLabel: elemBonusInfo?.label || ""
  };
}

async function _getOrCreateSharedSpellDamage({ data, attacker, spell, spellOptions, isCritical, damageType } = {}) {
  if (!_shouldShareSpellDamage(data)) return null;
  data.context = data.context ?? {};
  const existing = data.context.sharedSpellDamage;
  if (existing && existing.spellUuid === spell?.uuid && existing.damageType === damageType) {
    return existing;
  }
  const computed = await _computeSpellDamageShared({ attacker, spell, spellOptions, isCritical, damageType });
  data.context.sharedSpellDamage = computed;
  return computed;
}

async function _promptAoEEvadeEscape({ defenderName = "Defender", spellName = "the spell" } = {}) {
  if (typeof Dialog?.confirm !== "function") return null;
  try {
    return await Dialog.confirm({
      title: "AoE Evade",
      content: `<p>${defenderName} successfully evaded ${spellName}. Can they move 1m to exit the area?</p>`,
      yes: "Escapes AoE",
      no: "Still in AoE",
      defaultYes: true
    });
  } catch (_e) {
    return null;
  }
}

async function _maybeResolveAoEEvadeEscape({ data, defenderEntry, defenderActor } = {}) {
  if (!data || !defenderEntry) return null;
  const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
  if (!isAoE) return null;

  const defenseType = String(defenderEntry.defenseType ?? "").toLowerCase();
  if (defenseType !== "evade") return null;

  if (!defenderEntry?.result?.isSuccess) return null;
  if (defenderEntry.aoeEvadeEscaped === true) return true;
  if (defenderEntry.aoeEvadeEscaped === false) return false;

  const templateUuid = data?.context?.aoe?.templateUuid ?? null;
  const templateId = data?.context?.aoe?.templateId ?? null;
  const token = _resolveToken(defenderEntry?.tokenUuid ?? defenderActor?.uuid);

  let canEscape = canTokenEscapeTemplate({ templateUuid, templateId, token, stepMeters: 1 });
  if (canEscape == null) {
    const canPrompt = game.user?.isGM || (defenderActor && canUserRollActor(game.user, defenderActor));
    if (canPrompt) {
      canEscape = await _promptAoEEvadeEscape({
        defenderName: defenderActor?.name ?? defenderEntry?.name ?? "Defender",
        spellName: data?.attacker?.spellName ?? "the spell"
      });
    }
  }

  if (canEscape != null) {
    defenderEntry.aoeEvadeEscaped = Boolean(canEscape);
    defenderEntry.aoeEvadeFailed = !canEscape;
  }

  return canEscape;
}

function _isBankChoicesEnabledForData(data) {
  // Magic banked choices enabled by default (same as combat)
  return true;
}

function _ensureBankedScaffold(data) {
  data.context = data.context ?? {};
  data.attacker = data.attacker ?? {};
  data.defender = data.defender ?? {};
  if (!Array.isArray(data.defenders)) {
    data.defenders = (data.defender && typeof data.defender === "object") ? [data.defender] : [];
  }

  data.attacker.banked = (data.attacker.banked && typeof data.attacker.banked === "object") 
    ? data.attacker.banked 
    : { committed: false, committedAt: null, committedBy: null };

  const defenders = _getDefenderEntries(data);
  for (const def of defenders) {
    def.banked = (def.banked && typeof def.banked === "object") 
      ? def.banked 
      : { committed: false, committedAt: null, committedBy: null };
  }

  return data;
}

function _getBankCommitState(data, defender = null) {
  _ensureBankedScaffold(data);
  
  const aCommitted = Boolean(data.attacker?.banked?.committed);
  const def = defender ?? data.defender;
  const dCommitted = Boolean(
    def?.banked?.committed ||
    def?.noDefense ||
    def?.defenseType != null
  );
  
  return {
    aCommitted,
    dCommitted,
    bothCommitted: aCommitted && dCommitted
  };
}

function _allDefendersCommitted(data) {
  if (!_isMultiDefender(data)) {
    // Single defender: use standard bothCommitted check
    const state = _getBankCommitState(data);
    return state.bothCommitted;
  }
  
  // Multi-defender: attacker must be committed AND all defenders must be committed
  const aCommitted = Boolean(data.attacker?.banked?.committed);
  if (!aCommitted) return false;
  
  const defenders = _getDefenderEntries(data);
  return defenders.every(def => {
    if (!def) return true; // Skip null entries
    return Boolean(
      def?.banked?.committed ||
      def?.noDefense ||
      def?.defenseType != null
    );
  });
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

function _btn({ label, action, disabled = false, title = "", dataset = null } = {}) {
  const safeLabel = String(label ?? "Action");
  const safeAction = String(action ?? "");
  const safeTitle = String(title ?? "");
  const dataAttrs = dataset && typeof dataset === "object"
    ? Object.entries(dataset)
      .map(([key, val]) => `data-${String(key)}="${String(val).replaceAll('"', "&quot;")}"`)
      .join(" ")
    : "";
  return `
    <button
      type="button"
      data-ues-magic-opposed-action="${safeAction}"
      ${disabled ? "disabled=\"disabled\"" : ""}
      ${safeTitle ? `title="${safeTitle.replaceAll('"', "&quot;")}"` : ""}
      ${dataAttrs}
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
  const defenders = _getDefenderEntries(data);
  const isMulti = _isMultiDefender(data);

  if (isMulti) {
    const a = data.attacker ?? {};
    const bankMode = _isBankChoicesEnabledForData(data);
    const anyOutcome = defenders.some(d => _getDefenderOutcome(data, d));
    const { aCommitted } = _getBankCommitState(data, defenders[0] ?? null);
    const revealAttacker = !bankMode || aCommitted || anyOutcome;
    const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
    const defenseNote = isAoE
      ? "AoE: Block or Evade if aware. Choose No Defense if unable to defend."
      : "Defender may choose Block, Evade, or No Defense.";

    const spellName = revealAttacker ? (a.spellName ?? "Spell") : "-";
    const spellSchool = revealAttacker ? (a.spellSchool ?? "") : "";
    const spellLevel = revealAttacker ? Number(a.spellLevel ?? 1) : "-";
    const spellCost = revealAttacker ? Number(a.spellCost ?? 0) : "-";
    const spellMpSpent = revealAttacker ? (Number(a.mpSpent ?? 0) || 0) : "-";
    const spellMpRefund = revealAttacker ? (Number(a.mpRefund ?? 0) || 0) : 0;

    const aTN = revealAttacker ? String(_extractTN(a.tn)) : "-";
    const aRollLine = a.result
      ? (a.result.noRoll
        ? `<div><b>Roll:</b> Automatic</div>`
        : `<div><b>Roll:</b> ${a.result.rollTotal} - ${_fmtDegree(a.result)}${a.result.isCriticalSuccess ? ' <span style="color:green; font-weight:700;">CRITICAL</span>' : ''}${a.result.isCriticalFailure ? ' <span style="color:red; font-weight:700;">CRITICAL FAIL</span>' : ''}</div>`)
      : "";

    const aBreakdown = revealAttacker ? _renderBreakdownDetails("TN breakdown", a.tn?.breakdown ?? a.tn?.modifiers) : "";

    const attackerCommitLine = (() => {
      if (!bankMode) return "";
      const resolved = anyOutcome;
      const rolled = !!a.result;
      const statusText = resolved ? "Resolved" : rolled ? "Rolled" : (aCommitted ? "Committed" : "Awaiting choice");
      return `<div style="margin-top:4px; font-size:12px; opacity:0.85;"><b>Status:</b> ${statusText}</div>`;
    })();

    const attackerControls = (() => {
      if (a.result) return "";
      if (bankMode) {
        if (!aCommitted) return `<div style="margin-top:8px;">${_btn({ label: "Commit Casting", action: "attacker-commit" })}</div>`;
        return "";
      }
      return `<div style="margin-top:8px;">${_btn({ label: "Roll Casting Test", action: "attacker-roll" })}</div>`;
    })();

    const defenderBlocks = defenders.map((d, idx) => {
      const { dCommitted, bothCommitted } = _getBankCommitState(data, d);
      const outcome = _getDefenderOutcome(data, d);
      const revealDefender = !bankMode || bothCommitted || Boolean(outcome);

      const dTN = revealDefender ? String(_extractTN(d.tn)) : "-";
      const dRollLine = (d.result && !d.noDefense)
        ? `<div><b>Roll:</b> ${d.result.rollTotal} - ${_fmtDegree(d.result)}</div>`
        : "";

      const defenderCommitLine = (() => {
        if (!bankMode) return "";
        const resolved = Boolean(outcome);
        const rolled = !!d.result || !!d.noDefense;
        const statusText = resolved ? "Resolved" : rolled ? "Rolled" : (dCommitted ? "Committed" : "Awaiting choice");
        return `<div style="margin-top:4px; font-size:12px; opacity:0.85;"><b>Status:</b> ${statusText}</div>`;
      })();

      const canRollDefender = Boolean(a.result && !d.result && !d.noDefense);
      const defenderControls = (() => {
        if (d.result || d.noDefense) return "";
        if (bankMode) {
          if (!dCommitted) {
            return `
              <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
                ${_btn({ label: "Commit Block", action: "defender-commit-block", dataset: { "defender-index": idx } })}
                ${_btn({ label: "Commit Evade", action: "defender-commit-evade", dataset: { "defender-index": idx } })}
                ${_btn({ label: "Commit No Defense", action: "defender-commit-nodefense", dataset: { "defender-index": idx } })}
              </div>
            `;
          }
          return "";
        }

        if (canRollDefender) {
          return `
            <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
              ${_btn({ label: "Block", action: "defender-roll-block", dataset: { "defender-index": idx } })}
              ${_btn({ label: "Evade", action: "defender-roll-evade", dataset: { "defender-index": idx } })}
              ${_btn({ label: "No Defense", action: "defender-no-defense", dataset: { "defender-index": idx } })}
            </div>
          `;
        }
        return "";
      })();

      let outcomeLine = "";
      if (outcome) {
        const winner = String(outcome.winner ?? "");
        const color = winner === "attacker" ? "green" : (winner === "defender" ? "#2a5db0" : "#666");

        const aResult = data.attacker?.result;
        const dResult = d?.result;
        const aTN = _extractTN(data.attacker?.tn);
        const dTN = _extractTN(d?.tn);

        let resultsHtml = "";
        if (Boolean(data.context?.healingDirect)) {
          if (aResult) {
            const aRoll = aResult.rollTotal ?? "-";
            const aDeg = Math.abs(aResult.degree ?? 0);
            const aDoSLabel = (aResult.isSuccess || false) ? "DoS" : "DoF";
            const healingApplied = outcome?.healingApplied;
            const tempHealingApplied = outcome?.tempHealingApplied;
            const healingHTML = outcome?.healingRollHTML ?? outcome?.tempHealingRollHTML ?? "";

            resultsHtml = `
              <div style="margin-top:6px; font-size:12px; line-height:1.5;">
                <div><b>Casting Test:</b> ${aRoll} vs TN ${aTN} - ${aDeg} ${aDoSLabel}</div>
                ${healingApplied != null ? `<div><b>Healing:</b> <span style="color:#388e3c;font-weight:bold;">+${healingApplied} HP</span></div>` : ""}
                ${tempHealingApplied != null ? `<div><b>Temporary HP:</b> <span style="color:#2196f3;font-weight:bold;">+${tempHealingApplied} Temp HP</span></div>` : ""}
                ${healingHTML ? `<div style="margin-top:4px;">${healingHTML}</div>` : ""}
              </div>
            `;
          }
        } else if (aResult && dResult) {
          const aRoll = aResult.rollTotal ?? "-";
          const dRoll = dResult.rollTotal ?? "-";
          const aDeg = Math.abs(aResult.degree ?? 0);
          const dDeg = Math.abs(dResult.degree ?? 0);
          const aDoSLabel = (aResult.isSuccess || false) ? "DoS" : "DoF";
          const dDoSLabel = (dResult.isSuccess || false) ? "DoS" : "DoF";

          resultsHtml = `
            <div style="margin-top:6px; font-size:12px; line-height:1.5;">
              <div><b>Caster:</b> ${aRoll} vs TN ${aTN} (${aDeg} ${aDoSLabel})</div>
              <div><b>Defender:</b> ${dRoll} vs TN ${dTN} (${dDeg} ${dDoSLabel})</div>
            </div>
          `;
        }

        const blockNote = (isAoE && String(d?.defenseType ?? "").toLowerCase() === "block" && outcome.winner === "defender")
          ? `<div style="margin-top:4px; font-size:12px; opacity:0.9;">AoE block halves damage (round up).</div>`
          : "";
        
        const blockResolveButton = (outcome?.needsBlockResolution && !isAoE)
          ? `<div style="margin-top:8px;">${_btn({ label: "Resolve Block", action: "block-resolve", dataset: { "defender-index": idx } })}</div>`
          : "";

        outcomeLine = `
          <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid ${color};">
            <div style="font-weight:700;">${String(outcome.text ?? "Resolved")}</div>
            ${resultsHtml}
            ${(outcome.damageApplied ?? outcome.attackerWins) && !Boolean(data.context?.healingDirect) ? `<div style="margin-top:4px; font-size:12px; opacity:0.9;">Damage is applied automatically. Details are whispered to the GM.</div>` : ""}
            ${blockNote}
            ${blockResolveButton}
          </div>
        `;
      } else if (bankMode && !bothCommitted) {
        const aStatus = aCommitted ? "Committed" : "Awaiting choice";
        const dStatus = dCommitted ? "Committed" : "Awaiting choice";
        outcomeLine = `
          <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05);">
            <div><b>Attacker:</b> ${aStatus}</div>
            <div><b>Defender:</b> ${dStatus}</div>
            ${_allDefendersCommitted(data) ? '<div style="margin-top:6px; font-style:italic;">All participants committed. Ready to roll.</div>' : (() => {
              const aCommitted = Boolean(data.attacker?.banked?.committed);
              const allDefendersCommitted = _isMultiDefender(data) 
                ? _getDefenderEntries(data).every(def => {
                    if (!def) return true;
                    return Boolean(
                      def?.banked?.committed ||
                      def?.noDefense ||
                      def?.defenseType != null
                    );
                  })
                : _getBankCommitState(data, d).dCommitted;
              if (!aCommitted) {
                return '<div style="margin-top:6px; font-style:italic;">Waiting for caster to commit choice...</div>';
              }
              if (!allDefendersCommitted) {
                return '<div style="margin-top:6px; font-style:italic;">Waiting for all defenders to commit choices...</div>';
              }
              return '<div style="margin-top:6px; font-style:italic;">Waiting for both sides to commit choices...</div>';
            })()}
          </div>
        `;
      } else if (a.result && !d.result && !d.noDefense) {
        outcomeLine = `
          <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid #666;">
            <div style="font-weight:700;">Awaiting defense selection</div>
            <div style="margin-top:4px; font-size:12px; opacity:0.9;">${defenseNote}</div>
          </div>
        `;
      }

      return `
        <div style="padding:6px; border:1px solid rgba(0,0,0,0.12); border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline;">
            <div style="font-size:14px; font-weight:700;">Target</div>
            <div style="font-size:12px;"><b>${d.tokenName ?? d.name ?? ""}</b></div>
          </div>
          <div style="margin-top:4px; font-size:13px; line-height:1.25;">
            <div><b>Defense:</b> ${d.noDefense ? "-" : (d.defenseType ?? "-")}</div>
            <div><b>TN:</b> ${d.noDefense ? "-" : dTN}</div>
            ${dRollLine}
            ${d.noDefense ? '<div style="color:red; font-style:italic; margin-top:2px;">No Defense</div>' : ""}
            ${d.noDefense ? "" : (revealDefender ? _renderBreakdownDetails("TN breakdown", d.tn?.breakdown ?? d.tn?.modifiers) : "")}
            ${defenderCommitLine}
          </div>
          ${defenderControls}
          ${outcomeLine}
        </div>
      `;
    }).join("");

    return `
      <div class="ues-opposed-card ues-magic-opposed-card" data-message-id="${String(messageId ?? "")}" data-ues-magic-opposed="1" style="padding:6px 6px;">
        <div style="display:grid; grid-template-columns: 1fr; gap:12px;">
          <div style="padding-bottom:8px; border-bottom:1px solid rgba(0,0,0,0.12);">
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <div style="font-size:16px; font-weight:700;">Caster</div>
              <div style="font-size:13px;"><b>${a.tokenName ?? a.name ?? ""}</b></div>
            </div>
            <div style="margin-top:4px; font-size:13px; line-height:1.25;">
              <div><b>Spell:</b> ${spellName}${spellSchool ? ` (${spellSchool} ${spellLevel})` : ""}</div>
              <div><b>MP Cost:</b> ${spellCost}${spellMpSpent !== "-" && spellMpSpent ? ` <span class="muted" style="opacity:0.8;">(paid: ${spellMpSpent}${spellMpRefund ? `, refunded: ${spellMpRefund}` : ""})</span>` : ""}</div>
              <div><b>TN:</b> ${aTN}</div>
              ${aRollLine}
              ${aBreakdown}
              ${attackerCommitLine}
            </div>
            ${attackerControls}
          </div>
          <div style="display:grid; grid-template-columns: 1fr; gap:10px;">
            ${defenderBlocks}
          </div>
        </div>
      </div>
    `;
  }

  const a = data.attacker;
  const d = data.defender;

  const bankMode = _isBankChoicesEnabledForData(data);
  const { aCommitted, dCommitted, bothCommitted } = _getBankCommitState(data);
  const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
  const defenseNote = isAoE
    ? "AoE: Block or Evade if aware. Choose No Defense if unable to defend."
    : "Defender may choose Block, Evade, or No Defense.";
  
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

  const aTN = revealChoices ? String(_extractTN(a.tn)) : "—";
  const dTN = revealChoices ? String(_extractTN(d.tn)) : "—";

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
    
    // Build detailed result line
    const aResult = data.attacker?.result;
    const dResult = data.defender?.result;
    const aTN = _extractTN(data.attacker?.tn);
    const dTN = _extractTN(data.defender?.tn);
    
    let resultsHtml = "";
    // For healing spells (healingDirect), only show caster's result and healing amount
    if (Boolean(data.context?.healingDirect)) {
      if (aResult) {
        const aRoll = aResult.rollTotal ?? "—";
        const aDeg = Math.abs(aResult.degree ?? 0);
        const aDoSLabel = (aResult.isSuccess || false) ? "DoS" : "DoF";
        const healingApplied = data.outcome?.healingApplied;
        const tempHealingApplied = data.outcome?.tempHealingApplied;
        const healingHTML = data.outcome?.healingRollHTML ?? data.outcome?.tempHealingRollHTML ?? "";
        
        resultsHtml = `
          <div style="margin-top:6px; font-size:12px; line-height:1.5;">
            <div><b>Casting Test:</b> ${aRoll} vs TN ${aTN} — ${aDeg} ${aDoSLabel}</div>
            ${healingApplied != null ? `<div><b>Healing:</b> <span style="color:#388e3c;font-weight:bold;">+${healingApplied} HP</span></div>` : ""}
            ${tempHealingApplied != null ? `<div><b>Temporary HP:</b> <span style="color:#2196f3;font-weight:bold;">+${tempHealingApplied} Temp HP</span></div>` : ""}
            ${healingHTML ? `<div style="margin-top:4px;">${healingHTML}</div>` : ""}
          </div>
        `;
      }
    } else if (aResult && dResult) {
      const aRoll = aResult.rollTotal ?? "—";
      const dRoll = dResult.rollTotal ?? "—";
      const aDeg = Math.abs(aResult.degree ?? 0);
      const dDeg = Math.abs(dResult.degree ?? 0);
      const aDoSLabel = (aResult.isSuccess || false) ? "DoS" : "DoF";
      const dDoSLabel = (dResult.isSuccess || false) ? "DoS" : "DoF";
      
      resultsHtml = `
        <div style="margin-top:6px; font-size:12px; line-height:1.5;">
          <div><b>Caster:</b> ${aRoll} vs TN ${aTN} (${aDeg} ${aDoSLabel})</div>
          <div><b>Defender:</b> ${dRoll} vs TN ${dTN} (${dDeg} ${dDoSLabel})</div>
        </div>
      `;
    }
    
    const blockNote = (isAoE && String(data.defender?.defenseType ?? "").toLowerCase() === "block" && winner === "defender")
      ? `<div style="margin-top:4px; font-size:12px; opacity:0.9;">AoE block halves damage (round up).</div>`
      : "";

    outcomeLine = `
      <div style="margin-top:10px; padding:8px; background:rgba(0,0,0,0.05); border-left:3px solid ${color};">
        <div style="font-weight:700;">${String(data.outcome.text ?? "Resolved")}</div>
        ${resultsHtml}
        ${(data.outcome.damageApplied ?? data.outcome.attackerWins) && !Boolean(data.context?.healingDirect) ? `<div style="margin-top:4px; font-size:12px; opacity:0.9;">Damage is applied automatically. Details are whispered to the GM.</div>` : ""}
        ${blockNote}
        ${(data.outcome?.needsBlockResolution && !isAoE) ? `<div style="margin-top:8px;">${_btn({ label: "Resolve Block", action: "block-resolve" })}</div>` : ""}
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
        <div style="margin-top:4px; font-size:12px; opacity:0.9;">${defenseNote}</div>
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

    const aToken = _resolveToken(aDoc);
    const attacker = _resolveActor(aDoc);

    const defenderRefs = [];
    const addDefenderRef = (ref) => {
      if (!ref) return;
      if (typeof ref === "string") defenderRefs.push(ref);
      else if (ref?.uuid) defenderRefs.push(ref.uuid);
    };

    if (Array.isArray(cfg.defenders)) {
      for (const def of cfg.defenders) {
        addDefenderRef(def?.tokenUuid ?? def?.actorUuid ?? def?.uuid ?? def);
      }
    }
    if (Array.isArray(cfg.defenderTokenUuids)) {
      for (const ref of cfg.defenderTokenUuids) addDefenderRef(ref);
    }
    if (Array.isArray(cfg.defenderActorUuids)) {
      for (const ref of cfg.defenderActorUuids) addDefenderRef(ref);
    }
    addDefenderRef(cfg.defenderTokenUuid ?? cfg.defenderActorUuid ?? cfg.defenderUuid);

    const defenderEntries = [];
    const seen = new Set();
    for (const ref of defenderRefs) {
      const dDoc = _resolveDoc(ref);
      const dToken = _resolveToken(dDoc);
      const dActor = _resolveActor(dDoc);
      if (!dActor) continue;
      const key = dToken?.document?.uuid ?? dToken?.uuid ?? dActor.uuid;
      if (seen.has(key)) continue;
      seen.add(key);

      defenderEntries.push({
        actorUuid: dActor.uuid,
        tokenUuid: dToken?.document?.uuid ?? dToken?.uuid ?? null,
        tokenName: dToken?.name ?? dToken?.document?.name ?? null,
        name: dActor.name,
        defenseType: null,
        result: null,
        tn: null,
        noDefense: false,
        apCost: 1,
        banked: { committed: false, committedAt: null, committedBy: null }
      });
    }

    if (!attacker || defenderEntries.length === 0) {
      ui.notifications.warn("Magic attack requires both a caster and at least one target.");
      return null;
    }

    const spell = await fromUuid(cfg.spellUuid);
    if (!spell) {
      ui.notifications.error("Could not resolve spell.");
      return null;
    }

    // Direct spells resolve immediately (no casting/defense tests).
    if (Boolean(spell?.system?.isDirect)) {
      for (const def of defenderEntries) {
        await this.castDirectTargeted({
          attackerTokenUuid: cfg.attackerTokenUuid,
          attackerActorUuid: cfg.attackerActorUuid,
          attackerUuid: cfg.attackerUuid,
          defenderTokenUuid: def.tokenUuid ?? null,
          defenderActorUuid: def.actorUuid ?? null,
          defenderUuid: def.actorUuid ?? null,
          spellUuid: cfg.spellUuid,
          spellOptions: cfg.spellOptions,
          castActionType: cfg.castActionType
        });
      }
      return null;
    }

    const spellOptions = cfg.spellOptions ?? {};
    const tn = computeMagicCastingTN(attacker, spell, spellOptions);
    const healingDirect = isHealingSpell(spell);

    const isAoE = Boolean(cfg?.aoe?.isAoE || cfg?.context?.aoe?.isAoE || cfg?.isAoE);
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
        bankChoicesEnabled: true,
        aoe: cfg?.aoe ? foundry.utils.deepClone(cfg.aoe) : undefined,
        isAoE: cfg?.isAoE ?? undefined,
        forcedHitLocation: isAoE ? "Body" : null
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
      defenders: defenderEntries,
      defender: defenderEntries[0] ?? null,
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
   * Resolve a targeted Direct spell with casting test but no defense.
   *
   * RAW: "This spell has a target or targets but is not an attack and cannot be defended against by normal means."
   * This means: Direct spells still require a casting test, but defenders cannot use Block/Evade/No Defense.
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
    
    // Compute casting TN
    const tn = computeMagicCastingTN(attacker, spell, spellOptions);

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

    // Spend MP (attempt cost)
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

    // RAW: Direct spells still require a casting test
    const result = await doTestRoll(attacker, {
      target: tn.finalTN,
      allowLucky: true,
      allowUnlucky: true
    });

    await result.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      flavor: `<b>${spell.name}</b> — Casting Test (Direct)`,
      flags: { [_FLAG_NS]: { magicOpposedMeta: { stage: "direct-casting" } } }
    });

    // Check for backfire
    const needsBackfire = shouldBackfire(spell, attacker, result.isCriticalFailure, !result.isSuccess);
    if (needsBackfire) {
      await triggerBackfire(attacker, spell);
    }

    // Apply spell restraint refund on successful cast
    const refundInfo = await applySpellRestraintRefund(attacker, spell, spellOptions, result, magickaSpend);

    const data = {
      context: {
        schemaVersion: _CARD_VERSION,
        createdAt: Date.now(),
        createdBy: game.user.id,
        originalCastWorldTime: Number(game.time?.worldTime ?? 0) || 0,
        phase: "resolved",
        directUndefendable: true
      },
      attacker: {
        actorUuid: attacker.uuid,
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
        tn,
        result,
        spellOptions,
        mpSpent: Number(refundInfo?.finalCost ?? magickaSpend?.consumed ?? 0) || 0,
        mpRefund: Number(refundInfo?.refund ?? 0) || 0,
        backfire: needsBackfire
      },
      defender: {
        actorUuid: defender.uuid,
        name: defender.name,
        tokenUuid: dToken?.document?.uuid ?? dToken?.uuid ?? cfg.defenderTokenUuid ?? null,
        tokenName: dToken?.name ?? dToken?.document?.name ?? defender.name,
        defenseType: "Cannot Defend",
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
    
    // Only apply effects if casting was successful
    if (result.isSuccess) {
      await this._resolveOutcome(message, data, attacker, defender);
    }
    
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

    // Increment attack counter for attack spells (after AP is spent successfully)
    const spellClassification = classifySpellForRouting(spell);
    if (spellClassification.isAttack) {
      try {
        await AttackTracker.incrementAttacks(attacker);
      } catch (err) {
        console.error("UESRPG | Failed to increment attack counter", { actor: attacker?.uuid, err });
        // Don't break the workflow if attack tracking fails
      }
    }

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
  async handleAction(message, action, opts = {}) {
    const data = _getMessageState(message);
    if (!data) return;

    const attacker = _resolveActor(data.attacker.actorUuid);
    const { defender, defenderIndex, defenders } = _selectDefenderEntry(data, opts);
    const defenderActor = _resolveActor(defender?.actorUuid);

    if (!attacker || !defenderActor) {
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

      // For banking: only trigger auto-roll when ALL defenders have committed
      // This prevents metagaming by ensuring all choices are locked before any rolls
      if (_allDefendersCommitted(data)) {
        await this._autoRollBanked(message);
      }
      return;
    }

    // Handle defender commit
    if (action === "defender-commit-block" || action === "defender-commit-evade" || action === "defender-commit-nodefense") {
      if (!bankMode) return;
      if (defender?.result || defender?.noDefense) return;
      if (!requireUserCanRollActor(game.user, defenderActor)) return;

      _ensureBankedScaffold(data);
      
      // Store defense choice
      if (action === "defender-commit-nodefense") {
        defender.defenseType = "none";
        defender.noDefense = true;
        
        // CRITICAL FIX: Set result immediately so _autoRollBanked doesn't call defender-no-defense again
        // This matches the pattern used in combat opposed workflow
        defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
        defender.result = { rollTotal: 0, isSuccess: false, degree: 0, isCriticalSuccess: false, isCriticalFailure: false };
      } else {
        defender.defenseType = (action === "defender-commit-block") ? "block" : "evade";
        defender.noDefense = false;
      }

      defender.banked.committed = true;
      defender.banked.committedAt = Date.now();
      defender.banked.committedBy = game.user.id;

      await _updateCard(message, data);

      // For banking: only trigger auto-roll when ALL defenders have committed
      // This prevents metagaming by ensuring all choices are locked before any rolls
      if (_allDefendersCommitted(data)) {
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

      // Increment attack counter for attack spells (after AP is spent successfully)
      const spellClassification = classifySpellForRouting(spell);
      if (spellClassification.isAttack) {
        try {
          await AttackTracker.incrementAttacks(attacker);
        } catch (err) {
          console.error("UESRPG | Failed to increment attack counter", { actor: attacker?.uuid, err });
          // Don't break the workflow if attack tracking fails
        }
      }

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
        for (const def of defenders) {
          def.noDefense = true;
          def.defenseType = "-";
          def.tn = null;
          def.result = { rollTotal: 0, isSuccess: false, degree: 0, isCriticalSuccess: false, isCriticalFailure: false };
        }
        data.context.phase = "resolved";
        for (let i = 0; i < defenders.length; i += 1) {
          const defActor = _resolveActor(defenders[i]?.actorUuid);
          if (!defActor) continue;
          await this._resolveOutcome(message, data, attacker, defActor, { defenderIndex: i });
        }
        return;
      }

      data.context.phase = "awaiting-defense";
      _markResolutionPhase(data);
      await _updateCard(message, data);
      return;
    }

    if (action === "defender-roll-block" || action === "defender-roll-evade") {
      if (defender?.result || defender?.noDefense) return;
      if (!requireUserCanRollActor(game.user, defenderActor)) return;

      const apCost = Number(defender?.apCost ?? 1) || 1;
      const currentAP = Number(defenderActor?.system?.action_points?.value ?? 0) || 0;
      if (currentAP < apCost) {
        ui.notifications.warn("Not enough Action Points to defend against the spell.");
        return;
      }

      const defenseType = (action === "defender-roll-block") ? "block" : "evade";
      const defenseLabel = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);

      const apSpentOk = await ActionEconomy.spendAP(defenderActor, apCost, { reason: `Defense (${defenseLabel})`, silent: false });
      if (!apSpentOk) return;

      const tnObj = (defenseType === "block") ? _computeBlockTNWithBreakdown(defenderActor) : _computeEvadeTNWithBreakdown(defenderActor);
      const defenseTN = Number(tnObj.finalTN ?? 0) || 0;

      const result = await doTestRoll(defenderActor, {
        target: defenseTN,
        allowLucky: true,
        allowUnlucky: true
      });

      await result.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defenderActor }),
        flavor: `<b>${defenseLabel}</b> vs ${data.attacker.spellName}`,
        flags: { [_FLAG_NS]: { magicOpposedMeta: { parentMessageId: message.id, stage: "defender", defenderIndex } } }
      });

      defender.result = result;
      defender.defenseType = defenseLabel;
      defender.tn = tnObj;

      await this._resolveOutcome(message, data, attacker, defenderActor, { defenderIndex });
      return;
    }

    if (action === "defender-no-defense") {
      // This action should only be called in NON-banked mode
      // In banked mode, No Defense is committed and result is set immediately
      if (bankMode) {
        console.warn("UESRPG | defender-no-defense called in banked mode - this should not happen");
        return;
      }
      
      // No defense does not cost AP.
      if (defender?.result || defender?.noDefense) return;
      if (!requireUserCanRollActor(game.user, defenderActor)) return;

      defender.noDefense = true;
      defender.defenseType = "-";
      defender.tn = null;
      defender.result = { rollTotal: 0, isSuccess: false, degree: 0, isCriticalSuccess: false, isCriticalFailure: false };

      await this._resolveOutcome(message, data, attacker, defenderActor, { defenderIndex });
    }

    if (action === "block-resolve") {
      const outcome = _getDefenderOutcome(data, defender);
      if (!outcome || !outcome.needsBlockResolution) {
        ui.notifications.warn("Block resolution is only available when the defender wins by blocking (both passed).");
        return;
      }
      if (!requireUserCanRollActor(game.user, defenderActor)) return;

      const spell = await fromUuid(data.attacker.spellUuid);
      if (!spell) {
        ui.notifications.warn("Could not resolve spell.");
        return;
      }

      // Get equipped shield
      const shields = defenderActor.items?.filter(i => {
        if (!(i.type === "armor" || i.type === "item")) return false;
        if (i.system?.equipped !== true) return false;
        if (!Boolean(i.system?.isShieldEffective ?? i.system?.isShield)) return false;
        const shieldType = String(i.system?.shieldType || "normal").toLowerCase();
        if (shieldType === "buckler") return false;
        return true;
      }) ?? [];
      const shield = shields[0] ?? null;
      if (!shield) {
        ui.notifications.warn("No equipped shield found on the defender.");
        return;
      }

      // Roll spell damage
      const spellOptions = data.attacker.spellOptions ?? {};
      const damageType = getSpellDamageType(spell);
      const isCritical = Boolean(data.attacker.result?.isCriticalSuccess);
      const sharedDamage = await _getOrCreateSharedSpellDamage({ data, attacker, spell, spellOptions, isCritical, damageType });
      const damageInfo = sharedDamage ?? await _computeSpellDamageShared({ attacker, spell, spellOptions, isCritical, damageType });
      const damageValue = Number(damageInfo?.damageValue ?? 0) || 0;
      const rollHTML = damageInfo?.rollHTML ?? "";

      // Get Block Rating (magic damage treats BR as half, round up, unless magic BR exists)
      const br = getBlockValue(shield, damageType);
      const blocked = damageValue <= br;

      const dToken = _resolveToken(defenderEntry?.tokenUuid);

      if (blocked) {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defenderActor, token: dToken?.document ?? null }),
          content: `<div class="ues-opposed-card" style="padding:6px;">
            <h3>Block: ${spell.name}</h3>
            <div><b>Damage Roll:</b> ${rollHTML || damageValue}</div>
            <div><b>Block Rating:</b> ${br}</div>
            <div style="margin-top:4px;"><b>Result:</b> Incoming damage <b>${damageValue}</b> does not exceed Block Rating <b>${br}</b>. No damage taken.</div>
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          flags: { [_FLAG_NS]: { magicOpposedMeta: { stage: "block-result", parentMessageId: message.id } } }
        });
        return;
      }

      // Damage exceeds BR: apply full damage to shield arm
      const shieldArm = "Left Arm";
      const resolvedShieldArm = resolveHitLocationForTarget(defenderActor, shieldArm);

      const damageResult = await applyMagicDamage(defenderActor, damageValue, damageType, spell, {
        isCritical,
        hitLocation: resolvedShieldArm,
        rollHTML,
        isOverloaded: Boolean(damageInfo?.isOverloaded),
        overloadBonus: Number(damageInfo?.overloadBonus ?? 0) || 0,
        isOvercharged: Boolean(damageInfo?.isOvercharged),
        overchargeTotals: Array.isArray(damageInfo?.overchargeTotals) ? damageInfo.overchargeTotals : null,
        elementalBonus: Number(damageInfo?.elementalBonus ?? 0) || 0,
        elementalBonusLabel: String(damageInfo?.elementalBonusLabel ?? ""),
        source: spell.name,
        casterActor: attacker,
        magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
      });

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: defenderActor, token: dToken?.document ?? null }),
        content: `<div class="ues-opposed-card" style="padding:6px;">
          <h3>Block Penetrated: ${spell.name}</h3>
          <div><b>Damage Roll:</b> ${rollHTML || damageValue}</div>
          <div><b>Block Rating:</b> ${br}</div>
          <div style="margin-top:4px;"><b>Result:</b> Incoming damage <b>${damageValue}</b> exceeds Block Rating <b>${br}</b> (${shield?.name ?? "Shield"}). Full damage applied to ${shieldArm}.</div>
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        flags: { [_FLAG_NS]: { magicOpposedMeta: { stage: "block-penetrated", parentMessageId: message.id } } }
      });

      // Apply spell effects if applicable
      if (!damageResult?.spellAbsorbed) {
        if (Boolean(spell.system?.hasUpkeep) || (spell.effects?.size ?? 0) > 0) {
          await applySpellEffectsToTarget(attacker, defenderActor, spell, { 
            actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), 
            originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 
          });
        }
      }
    }
  },

  /**
   * Auto-roll when both sides have committed (banked mode).
   */
  async _autoRollBanked(message) {
    const data = _getMessageState(message);
    if (!data) return;

    // For banking: require ALL defenders to be committed before rolling
    if (!_allDefendersCommitted(data)) return;

    const defenders = _getDefenderEntries(data);
    const readyDefenders = defenders.map((def, idx) => ({ def, idx }));

    const attacker = _resolveActor(data.attacker.actorUuid);
    if (!attacker) return;

    // Roll attacker if not yet rolled
    if (!data.attacker.result) {
      await this.handleAction(message, "attacker-roll");
      // Reload data after attacker roll
      const updatedData = _getMessageState(message);
      if (updatedData) Object.assign(data, updatedData);
    }

    for (const { def, idx } of readyDefenders) {
      const defActor = _resolveActor(def?.actorUuid);
      if (!defActor) continue;

      if (def?.noDefense && def?.result && !_getDefenderOutcome(data, def)) {
        await this._resolveOutcome(message, data, attacker, defActor, { defenderIndex: idx });
        continue;
      }

      if (!def?.result && !def?.noDefense) {
        const defenseAction = def?.defenseType === "block"
          ? "defender-roll-block"
          : "defender-roll-evade";
        await this.handleAction(message, defenseAction, { defenderIndex: idx });
      }
    }
  },

  /**
   * Resolve the outcome of the opposed test.
   */
  async _resolveOutcome(message, data, attacker, defender, opts = {}) {
    const spell = await fromUuid(data.attacker.spellUuid);
    if (!spell) return;

    const { defender: defenderEntry } = _selectDefenderEntry(data, opts);
    if (!defenderEntry || !defender) return;

    const aResult = data.attacker.result;
    const dResult = defenderEntry.result;
    const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
    const forcedHitLocation = String(data?.context?.forcedHitLocation ?? "").trim();

    // Track last spell cast time/uuid for RAW upkeep restriction (no-duration spells).
    if (aResult?.success) {
      try {
        await attacker.setFlag("uesrpg-3ev4", "lastSpellCastWorldTime", game.time.worldTime);
        await attacker.setFlag("uesrpg-3ev4", "lastSpellCastSpellUuid", spell.uuid);
      } catch (err) {
        console.warn("UESRPG | Failed to set last spell cast flags", err);
      }
    }

    // Direct spells with casting test: resolve based on casting success/failure.
    if (Boolean(data.context?.directUndefendable)) {
      const isCritical = Boolean(aResult?.isCriticalSuccess);
      const castOk = Boolean(aResult?.isSuccess);

      const outcome = {
        winner: castOk ? "attacker" : "defender",
        attackerDegree: aResult?.degree ?? 0,
        defenderDegree: 0,
        attackerWins: castOk,
        damageApplied: castOk,
        text: castOk
          ? `${attacker.name} casts ${spell.name} directly on ${defender.name}.`
          : `${attacker.name} fails to cast ${spell.name}.`
      };
      _setDefenderOutcome(data, defenderEntry, outcome);

      // Only apply effects if casting was successful
      if (!castOk) {
        _markResolutionPhase(data);
        await _updateCard(message, data);
        return;
      }

      const damageType = getSpellDamageType(spell);
      const rawDamageType = spell?.system?.damageType;

      console.log("UESRPG | _resolveOutcome: directUndefendable spell", {
        spellName: spell.name,
        rawDamageType,
        damageType,
        isHealingType: _isHealingType(damageType),
        defender: defender.name
      });

      // Healing: roll and apply immediately (includes temporary healing).
      if (_isHealingType(damageType)) {
        const healRoll = await rollSpellHealing(spell, { isCritical });
        const healValue = Number(healRoll.total) || 0;
        const rollHTML = await healRoll.render();
        
        // Normalized check for temporary healing (handles case and spacing variations)
        const isTemporaryHealing = _isTemporaryHealingType(damageType);
        
        console.log("UESRPG | _resolveOutcome: Healing spell details", {
          spellName: spell.name,
          damageType,
          normalizedDamageType: String(damageType || "").toLowerCase().trim(),
          isTemporaryHealing,
          healValue,
          defender: defender.name
        });
        
        // Store healing info in data for chat card display
        if (isTemporaryHealing) {
          outcome.tempHealingApplied = healValue;
          outcome.tempHealingRollHTML = rollHTML;
        } else {
          outcome.healingApplied = healValue;
          outcome.healingRollHTML = rollHTML;
        }
        
        console.log("UESRPG | _resolveOutcome: Calling applyMagicHealing", {
          defender: defender.name,
          healValue,
          isTemporary: isTemporaryHealing,
          source: spell.name
        });
        
        const healResult = await applyMagicHealing(defender, healValue, spell, {
          isTemporary: isTemporaryHealing,
          isCritical,
          rollHTML,
          source: spell.name,
          casterActor: attacker,
          magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
        });

        if (healResult?.spellAbsorbed) {
          if (isTemporaryHealing) outcome.tempHealingApplied = null;
          else outcome.healingApplied = null;
          outcome.spellAbsorbed = true;
        }

        console.log("UESRPG | _resolveOutcome: applyMagicHealing completed");

        _markResolutionPhase(data);
        await _updateCard(message, data);
        return;
      }

      const damageFormula = getSpellDamageFormula(spell);
      const isDamaging = Boolean(damageFormula && damageFormula !== "0");

      if (isDamaging) {
        const spellOptions = data.attacker.spellOptions ?? {};
        const sharedDamage = await _getOrCreateSharedSpellDamage({ data, attacker, spell, spellOptions, isCritical, damageType });
        const damageInfo = sharedDamage ?? await _computeSpellDamageShared({ attacker, spell, spellOptions, isCritical, damageType });
        const damageValue = Number(damageInfo?.damageValue ?? 0) || 0;
        const rollHTML = damageInfo?.rollHTML ?? "";

        const damageResult = await applyMagicDamage(defender, damageValue, damageType, spell, {
          isCritical,
          hitLocation: "Body",
          rollHTML,
          isOverloaded: Boolean(damageInfo?.isOverloaded),
          overloadBonus: Number(damageInfo?.overloadBonus ?? 0) || 0,
          isOvercharged: Boolean(damageInfo?.isOvercharged),
          overchargeTotals: Array.isArray(damageInfo?.overchargeTotals) ? damageInfo.overchargeTotals : null,
          elementalBonus: Number(damageInfo?.elementalBonus ?? 0) || 0,
          elementalBonusLabel: String(damageInfo?.elementalBonusLabel ?? ""),
          source: spell.name,
          casterActor: attacker,
          magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
        });

        if (!damageResult?.spellAbsorbed) {
          if (Boolean(spell.system?.hasUpkeep) || (spell.effects?.size ?? 0) > 0) {
            await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
          }
        } else {
          outcome.spellAbsorbed = true;
        }

        _markResolutionPhase(data);
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

      _markResolutionPhase(data);
      await _updateCard(message, data);
      return;
    }

    // Legacy direct spells (no test, auto-success): for backwards compatibility
    if (Boolean(data.context?.directNoTest)) {
      const isCritical = false;
      const castOk = true;

      const outcome = {
        winner: "attacker",
        attackerDegree: 0,
        defenderDegree: 0,
        attackerWins: true,
        damageApplied: true,
        text: `${attacker.name} casts ${spell.name} directly on ${defender.name}.`
      };
      _setDefenderOutcome(data, defenderEntry, outcome);

      const damageType = getSpellDamageType(spell);
      const rawDamageType = spell?.system?.damageType;

      // Healing: roll and apply immediately (includes temporary healing).
      if (_isHealingType(damageType)) {
        const healRoll = await rollSpellHealing(spell, { isCritical });
        const healValue = Number(healRoll.total) || 0;
        const rollHTML = await healRoll.render();
        
        // Normalized check for temporary healing (handles case and spacing variations)
        const isTemporaryHealing = _isTemporaryHealingType(damageType);
        
        console.log("UESRPG | _resolveOutcome: Healing spell details (opposed)", {
          spellName: spell.name,
          rawDamageType,
          damageType,
          normalizedDamageType: String(damageType || "").toLowerCase().trim(),
          isTemporaryHealing,
          healValue,
          defender: defender.name
        });
        
        // Store healing info in data for chat card display
        if (isTemporaryHealing) {
          outcome.tempHealingApplied = healValue;
          outcome.tempHealingRollHTML = rollHTML;
        } else {
          outcome.healingApplied = healValue;
          outcome.healingRollHTML = rollHTML;
        }
        
        console.log("UESRPG | _resolveOutcome: Calling applyMagicHealing (opposed)", {
          defender: defender.name,
          healValue,
          isTemporary: isTemporaryHealing,
          source: spell.name
        });
        
        const healResult = await applyMagicHealing(defender, healValue, spell, {
          isTemporary: isTemporaryHealing,
          isCritical,
          rollHTML,
          source: spell.name,
          casterActor: attacker,
          magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
        });

        if (healResult?.spellAbsorbed) {
          if (isTemporaryHealing) outcome.tempHealingApplied = null;
          else outcome.healingApplied = null;
          outcome.spellAbsorbed = true;
        }

        _markResolutionPhase(data);
        await _updateCard(message, data);
        return;
      }

      const damageFormula = getSpellDamageFormula(spell);
      const isDamaging = Boolean(damageFormula && damageFormula !== "0");

      if (isDamaging) {
        const spellOptions = data.attacker.spellOptions ?? {};
        const sharedDamage = await _getOrCreateSharedSpellDamage({ data, attacker, spell, spellOptions, isCritical, damageType });
        const damageInfo = sharedDamage ?? await _computeSpellDamageShared({ attacker, spell, spellOptions, isCritical, damageType });
        const damageValue = Number(damageInfo?.damageValue ?? 0) || 0;
        const rollHTML = damageInfo?.rollHTML ?? "";

        const damageResult = await applyMagicDamage(defender, damageValue, damageType, spell, {
          isCritical,
          hitLocation: "Body",
          rollHTML,
          isOverloaded: Boolean(damageInfo?.isOverloaded),
          overloadBonus: Number(damageInfo?.overloadBonus ?? 0) || 0,
          isOvercharged: Boolean(damageInfo?.isOvercharged),
          overchargeTotals: Array.isArray(damageInfo?.overchargeTotals) ? damageInfo.overchargeTotals : null,
          elementalBonus: Number(damageInfo?.elementalBonus ?? 0) || 0,
          elementalBonusLabel: String(damageInfo?.elementalBonusLabel ?? ""),
          source: spell.name,
          casterActor: attacker,
          magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
        });

        if (!damageResult?.spellAbsorbed) {
          if (Boolean(spell.system?.hasUpkeep) || (spell.effects?.size ?? 0) > 0) {
            await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
          }
        } else {
          outcome.spellAbsorbed = true;
        }

        _markResolutionPhase(data);
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

      _markResolutionPhase(data);
      await _updateCard(message, data);
      return;
    }

    // Healing spells: not opposed. Only casting success matters.
    if (Boolean(data.context?.healingDirect)) {
      const isCritical = Boolean(aResult?.isCriticalSuccess);
      const castOk = Boolean(aResult?.isSuccess);

      const outcome = {
        winner: castOk ? "attacker" : "defender",
        attackerDegree: aResult?.degree ?? 0,
        defenderDegree: 0,
        attackerWins: castOk,
        damageApplied: castOk,
        text: castOk
          ? `${attacker.name} successfully casts ${spell.name} on ${defender.name}.`
          : `${attacker.name} fails to cast ${spell.name}.`
      };
      _setDefenderOutcome(data, defenderEntry, outcome);

      if (castOk) {
        const healRoll = await rollSpellHealing(spell, { isCritical });
        const healValue = Number(healRoll.total) || 0;
        const rollHTML = await healRoll.render();
        
        // Check for temporary healing
        const damageType = getSpellDamageType(spell);
        const rawDamageType = spell?.system?.damageType;
        const isTemporaryHealing = _isTemporaryHealingType(damageType);
        
        console.log("UESRPG | _resolveOutcome: Healing direct spell details", {
          spellName: spell.name,
          rawDamageType,
          damageType,
          normalizedDamageType: String(damageType || "").toLowerCase().trim(),
          isTemporaryHealing,
          healValue,
          defender: defender.name
        });
        
        // Store healing info in data for chat card display
        if (isTemporaryHealing) {
          outcome.tempHealingApplied = healValue;
          outcome.tempHealingRollHTML = rollHTML;
        } else {
          outcome.healingApplied = healValue;
          outcome.healingRollHTML = rollHTML;
        }
        
        console.log("UESRPG | _resolveOutcome: Calling applyMagicHealing (healingDirect)", {
          defender: defender.name,
          healValue,
          isTemporary: isTemporaryHealing,
          source: spell.name
        });
        
        const healResult = await applyMagicHealing(defender, healValue, spell, {
          isTemporary: isTemporaryHealing,
          isCritical,
          rollHTML,
          source: spell.name,
          casterActor: attacker,
          magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
        });

        if (healResult?.spellAbsorbed) {
          if (isTemporaryHealing) outcome.tempHealingApplied = null;
          else outcome.healingApplied = null;
          outcome.spellAbsorbed = true;
        }
      }

      await _updateCard(message, data);
      return;
    }

    const outcome = resolveOpposed(aResult, dResult);
    const defenseType = String(defenderEntry.defenseType ?? "").toLowerCase();
    const isBlock = defenseType === "block";
    const isEvade = defenseType === "evade";
    
    // RAW: When both pass and defender blocks, defender wins regardless of DoS
    // Attack vs Block: The defender blocks the attack regardless of attacker degrees of success
    const bothPassed = Boolean(aResult?.isSuccess && dResult?.isSuccess);
    const defenderWinsByBlock = bothPassed && isBlock;
    
    // Override outcome if both passed and defender blocked
    const finalOutcomeWinner = defenderWinsByBlock ? "defender" : outcome.winner;
    
    const defenderBlock = (isAoE && finalOutcomeWinner === "defender" && isBlock) || defenderWinsByBlock;
    const defenderEvade = isAoE && finalOutcomeWinner === "defender" && isEvade;
    let aoeEvadeEscaped = null;

    if (defenderEvade && Boolean(aResult?.isSuccess)) {
      aoeEvadeEscaped = await _maybeResolveAoEEvadeEscape({ data, defenderEntry, defenderActor: defender });
    }

    const attackerWins = finalOutcomeWinner === "attacker";
    // For AoE blocks when both pass: apply half damage
    // For non-AoE blocks when both pass: need to resolve block with BR check (handled by block-resolve action)
    const applyOnBlock = isAoE && defenderBlock && Boolean(aResult?.isSuccess);
    const applyOnEvadeFail = defenderEvade && aoeEvadeEscaped === false && Boolean(aResult?.isSuccess);
    const damageApplied = attackerWins || applyOnBlock || applyOnEvadeFail;

    const resultText = attackerWins
      ? `${spell.name} hits ${defender.name}.`
      : (defenderBlock
        ? (isAoE && applyOnBlock
          ? `${defender.name} blocks ${spell.name}, taking half damage.`
          : `${defender.name} blocks ${spell.name}.`)
        : (defenderEvade
          ? (aoeEvadeEscaped === true
            ? `${defender.name} evades ${spell.name} and escapes the area.`
            : (aoeEvadeEscaped === false
              ? `${defender.name} evades ${spell.name} but remains in the area, taking full damage.`
              : `${defender.name} evades ${spell.name}.`))
          : `${defender.name} defends against ${spell.name}.`));

    const finalOutcome = {
      ...outcome,
      winner: finalOutcomeWinner,
      attackerWins,
      damageApplied,
      blockHalfDamage: applyOnBlock,
      defenderWinsByBlock: defenderWinsByBlock,
      needsBlockResolution: defenderWinsByBlock && !isAoE,
      aoeEvadeEscaped: aoeEvadeEscaped === true,
      aoeEvadeFailed: aoeEvadeEscaped === false,
      text: resultText
    };
    _setDefenderOutcome(data, defenderEntry, finalOutcome);

    if (damageApplied) {
      const isCritical = Boolean(aResult?.isCriticalSuccess);
      const hitLocation = forcedHitLocation || (isAoE ? "Body" : getHitLocationFromRoll(Number(aResult?.rollTotal ?? 0)));

      const damageFormula = getSpellDamageFormula(spell);
      const isDamaging = Boolean(damageFormula && damageFormula !== "0");

      if (isDamaging) {
        const spellOptions = data.attacker.spellOptions ?? {};
        const damageType = getSpellDamageType(spell);
        const sharedDamage = await _getOrCreateSharedSpellDamage({ data, attacker, spell, spellOptions, isCritical, damageType });
        const damageInfo = sharedDamage ?? await _computeSpellDamageShared({ attacker, spell, spellOptions, isCritical, damageType });
        const damageValue = Number(damageInfo?.damageValue ?? 0) || 0;
        const appliedDamage = applyOnBlock ? Math.ceil(damageValue / 2) : damageValue;
        const rollHTML = damageInfo?.rollHTML ?? "";

        const damageResult = await applyMagicDamage(defender, appliedDamage, damageType, spell, {
          isCritical,
          hitLocation,
          rollHTML,
          isOverloaded: Boolean(damageInfo?.isOverloaded),
          overloadBonus: Number(damageInfo?.overloadBonus ?? 0) || 0,
          isOvercharged: Boolean(damageInfo?.isOvercharged),
          overchargeTotals: Array.isArray(damageInfo?.overchargeTotals) ? damageInfo.overchargeTotals : null,
          elementalBonus: Number(damageInfo?.elementalBonus ?? 0) || 0,
          elementalBonusLabel: String(damageInfo?.elementalBonusLabel ?? ""),
          source: spell.name,
          casterActor: attacker,
          magicCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0)
        });

        // If the spell defines Active Effects or has Upkeep, apply a spell effect marker on hit.
        // This is required for:
        //  - duration tracking (including Upkeep prompt windows)
        //  - non-damaging secondary effects that accompany a damaging spell
        // Damage resolution remains authoritative; the marker/effects are additive.
        if (!damageResult?.spellAbsorbed) {
          if (Boolean(spell.system?.hasUpkeep) || (spell.effects?.size ?? 0) > 0) {
            await applySpellEffectsToTarget(attacker, defender, spell, { actualCost: Number(data.attacker?.mpSpent ?? data.context?.mpSpent ?? spell.system?.cost ?? 0), originalCastTime: Number(data.context?.originalCastWorldTime ?? game.time?.worldTime ?? 0) || 0 });
          }
        } else {
          finalOutcome.spellAbsorbed = true;
        }
      } else if (attackerWins) {
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

    _markResolutionPhase(data);
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
    const defenderIndex = Number.isFinite(Number(el.dataset?.defenderIndex)) ? Number(el.dataset.defenderIndex) : null;

    // Permission-aware button state
    try {
      const attackerUuid = data?.attacker?.actorUuid;
      const defenders = _getDefenderEntries(data);
      const defEntry = (defenderIndex != null && defenders[defenderIndex]) ? defenders[defenderIndex] : data?.defender;
      const defenderUuid = defEntry?.actorUuid;
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
      await MagicOpposedWorkflow.handleAction(message, act, { defenderIndex });
    });
  });
});

