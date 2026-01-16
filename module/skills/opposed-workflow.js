/**
 * module/skills/opposed-workflow.js
 *
 * Skill opposed workflow, modeled after module/combat/opposed-workflow.js.
 *
 * Requirements:
 *  - If a target is selected: create a pending opposed skill card.
 *  - Attacker rolls from card with: difficulty dropdown, manual modifier, specialization toggle.
 *  - Defender rolls from card with: choose same/different skill, difficulty dropdown, manual modifier, specialization toggle.
 *  - Uses DoS/DoF results for both targeted and untargeted skill rolls.
 */

import { doTestRoll, resolveOpposed, formatDegree, computeResultFromRollTotal } from "../helpers/degree-roll-helper.js";
import { computeSkillTN, SKILL_DIFFICULTIES } from "./skill-tn.js";
import { requireUserCanRollActor } from "../helpers/permissions.js";
import { hasCondition } from "../conditions/condition-engine.js";
import { buildSkillRollRequest, normalizeSkillRollOptions, skillRollDebug, validateSkillRollRequest } from "./roll-request.js";
import { safeUpdateChatMessage } from "../helpers/chat-message-socket.js";
import { buildResistanceBonusSection, readResistanceBonusSelections, buildResistanceBonusMods } from "../traits/trait-resistance-ui.js";

const _SKILL_ROLL_SETTINGS_NS = "uesrpg-3ev4";
const _FLAG_NS = "uesrpg-3ev4";
const _FLAG_KEY = "skillOpposed";
const _CARD_VERSION = 1;
const _SKILL_ROLL_LAST_OPTIONS_KEY = "skillRollLastOptions";
const _DEFAULT_COMBAT_STYLE_DEFENSE_TYPE = "parry";

// Banked-choice (meta-limiting) automation locks.
// Prevents duplicate auto-roll starts from multiple hook triggers.
const _bankedAutoRollLocalLocks = new Set();

function _bothSidesCommitted(data) {
  return Boolean(data?.attacker?.committedAt) && Boolean(data?.defender?.committedAt);
}

function _normalizeCardFlag(raw) {
  // v1+ contract: { version, state }
  if (raw && typeof raw === "object" && Number(raw.version) >= 1 && raw.state) {
    return { version: Number(raw.version), state: raw.state };
  }
  // legacy shape: the state was stored directly in flags
  if (raw && typeof raw === "object" && raw.attacker && raw.defender) {
    return { version: 0, state: raw };
  }
  return { version: 0, state: null };
}

function _getMessageState(message) {
  const raw = message?.flags?.[_FLAG_NS]?.[_FLAG_KEY];
  return _normalizeCardFlag(raw).state;
}

function _getLastSkillRollOptions() {
  try {
    const saved = game.settings.get(_SKILL_ROLL_SETTINGS_NS, _SKILL_ROLL_LAST_OPTIONS_KEY) ?? {};
    // Always exclude difficulty from saved options - force default to "average"
    delete saved.difficulty;
    delete saved.difficultyKey;
    return saved;
  } catch (_e) {
    return {};
  }
}

async function _setLastSkillRollOptions(next) {
  try {
    // Do not persist difficulty choice - always default to "average"
    const sanitized = { ...next };
    delete sanitized.difficulty;
    delete sanitized.difficultyKey;
    await game.settings.set(_SKILL_ROLL_SETTINGS_NS, _SKILL_ROLL_LAST_OPTIONS_KEY, sanitized);
  } catch (_e) {
    // client setting may not exist if init hasn't run yet; fail silently
  }
}

function _mergeLastSkillRollOptions(patch={}) {
  const prev=_getLastSkillRollOptions();
  const next={...prev, ...patch};
  next.lastSkillUuidByActor = {...(prev.lastSkillUuidByActor||{}), ...(patch.lastSkillUuidByActor||{})};
  // Always force difficulty to "average" (do not persist)
  delete next.difficulty;
  delete next.difficultyKey;
  return next;
}

function _skillOpposedMetaFlag(parentMessageId, stage, extra = null) {
  const base = { parentMessageId, stage };
  const skillOpposedMeta = (extra && typeof extra === "object")
    ? foundry.utils.mergeObject(base, extra, { inplace: false })
    : base;
  return { skillOpposedMeta };
}


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
  // TokenDocument
  if (doc.documentName === "Token") return doc.object ?? null;
  // Token
  if (doc.actor && doc.document) return doc;
  return null;
}

function _canControlActor(actor) {
  return game.user.isGM || actor?.isOwner;
}


function _userHasActorOwnership(user, actor) {
  try {
    if (!user || !actor) return false;
    if (user.isGM) return true;
    if (typeof actor.testUserPermission === 'function') {
      return actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    }
    const level = Number(actor?.ownership?.[user.id] ?? 0);
    return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  } catch (_e) {
    return false;
  }
}

function _fmtDegree(res) {
  return formatDegree(res);
}

function _renderDeclared(declared, tnObj) {
  if (!declared) return "";
  const parts = [];
  const diff = tnObj?.difficulty;
  if (diff?.label) {
    const sign = Number(diff.mod || 0) >= 0 ? "+" : "";
    parts.push(`${diff.label} (${sign}${Number(diff.mod || 0)})`);
  }
  const manual = Number(declared.manualMod || 0);
  if (manual) parts.push(`Manual ${manual >= 0 ? "+" : ""}${manual}`);
  if (declared.useSpec) parts.push("Spec +10");
  if (!parts.length) return "";
  return `<div style="margin-top:2px; font-size:12px; opacity:0.85;"><b>Options:</b> ${parts.join("; ")}</div>`;
}

function _btn(label, action, extraDataset = {}) {
  const ds = Object.entries(extraDataset)
    .map(([k, v]) => `data-${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
  return `<button type="button" data-ues-skill-opposed-action="${action}" ${ds}>${label}</button>`;
}

function _renderBreakdown(tnObj) {
  const rows = (tnObj?.breakdown ?? []).map(b => {
    const v = Number(b.value ?? 0);
    const sign = v >= 0 ? "+" : "";
    // Keep numeric modifiers from wrapping (e.g. "-10" should not split into "-1" and "0").
    return `<div style="display:flex; justify-content:space-between; gap:10px;">
      <span>${b.label}</span>
      <span style="white-space:nowrap; flex:0 0 auto;">${sign}${v}</span>
    </div>`;
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

  // Banked-choice mode: do not reveal TN/choice details until both sides have committed.
  const bankMode = true;
  const bothCommitted = Boolean(a?.committedAt) && Boolean(d?.committedAt);
  const revealDetails = !bankMode || bothCommitted || data.status === "resolved" || !!data.outcome;

  const aTNLabel = (revealDetails && a.tn) ? `${a.tn.finalTN}` : "—";
  const dTNLabel = (revealDetails && d.tn) ? `${d.tn.finalTN}` : "—";

  const attackerActions = (() => {
    if (a.result) return "";
    if (!a.committedAt) return `<div style="margin-top:6px;">${_btn("Commit Choices", "attacker-roll")}</div>`;
    // Committed; awaiting GM auto-roll or resolution.
    return `<div style="margin-top:6px; opacity:0.85;"><i>Choices committed</i></div>`;
  })();

  const defenderActions = (() => {
    if (d.result) return "";
    if (!d.committedAt) return `<div style="margin-top:6px;">${_btn("Commit Choices", "defender-roll")}</div>`;
    return `<div style="margin-top:6px; opacity:0.85;"><i>Choices committed</i></div>`;
  })();

  const beginRollActions = (bankMode && bothCommitted && !data.outcome && !data.status && !a.result && !d.result && game.user.isGM)
    ? `<div style="margin-top:8px;">${_btn("Begin Opposed Roll", "begin-banked-roll")}</div>`
    : "";

  const outcomeLine = data.outcome
    ? `<div style="margin-top:10px;"><b>Outcome:</b> ${data.outcome.text ?? ""}</div>`
    : (() => {
        const phase = String(data?.context?.phase ?? "pending");
        const waitingSince = Number(data?.context?.waitingSince ?? 0);
        const ageMs = waitingSince ? (Date.now() - waitingSince) : 0;
        const isWaiting = (phase === "waitingdefender" || phase === "waitingDefender");
        const isStale = isWaiting && ageMs > 60_000;
        const note = isStale
          ? `<div style="margin-top:6px; font-size:12px; opacity:0.85;">
               Still waiting on the defender result. If this persists, ensure the defender roll message was posted, and have the attacker refresh the page to re-render the card.
             </div>`
          : "";
        return `<div style="margin-top:10px;"><i>Pending</i></div>${note}`;
      })();

  return `
  <div class="ues-skill-opposed-card" data-message-id="${messageId}" style="padding:6px 6px;">
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start;">
      <div style="padding-right:10px; border-right:1px solid rgba(0,0,0,0.12);">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Actor</div>
          <div style="font-size:13px;"><b>${a.tokenName ?? a.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Skill:</b> ${a.skillLabel}</div>${_renderDeclared(a.declared, a.tn)}
          <div><b>TN:</b> ${aTNLabel}</div>
          ${a.result ? `<div><b>Roll:</b> ${a.result.rollTotal} — ${_fmtDegree(a.result)}${a.result.isCriticalSuccess ? ' <span style="color:green">CRITICAL</span>' : ''}${a.result.isCriticalFailure ? ' <span style="color:red">CRITICAL FAIL</span>' : ''}</div>` : ""}
          ${_renderBreakdown(a.tn)}
        </div>
        ${attackerActions}
      </div>
      <div style="padding-left:2px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:16px; font-weight:700;">Target</div>
          <div style="font-size:13px;"><b>${d.tokenName ?? d.name}</b></div>
        </div>
        <div style="margin-top:4px; font-size:13px; line-height:1.25;">
          <div><b>Skill:</b> ${d.skillLabel ?? "(choose)"}</div>${_renderDeclared(d.declared, d.tn)}
          <div><b>TN:</b> ${dTNLabel}</div>
          ${d.result ? `<div><b>Roll:</b> ${d.result.rollTotal} — ${_fmtDegree(d.result)}${d.result.isCriticalSuccess ? ' <span style="color:green">CRITICAL</span>' : ''}${d.result.isCriticalFailure ? ' <span style="color:red">CRITICAL FAIL</span>' : ''}</div>` : ""}
          ${_renderBreakdown(d.tn)}
        </div>
        ${defenderActions}
      </div>
    </div>    ${beginRollActions}
    ${outcomeLine}
  </div>`;
}

async function _updateCard(message, data) {
  data.context = data.context ?? {};
  data.context.schemaVersion = data.context.schemaVersion ?? _CARD_VERSION;
  data.context.updatedAt = Date.now();
  data.context.updatedBy = game.user.id;
  // Ensure strict ordering for rapid successive updates where Date.now() can collide.
  data.context.updatedSeq = (Number(data.context.updatedSeq) || 0) + 1;

  const payload = {
    content: _renderCard(data, message.id),
    flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } }
  };

  await safeUpdateChatMessage(message, payload);
}

function _hasSpecializations(skillItem) {
  const raw = String(skillItem?.system?.trainedItems ?? "").trim();
  return raw.length > 0;
}

async function _skillRollDialog({
  title,
  actor = null,
  showSkillSelect = false,
  skills = [],
  selectedSkillUuid = null,
  allowSpecialization = false,
  defaultUseSpec = false,
  defaultDifficultyKey = "average",
  defaultManualMod = 0,
  defaultApplyBlinded = true,
  defaultApplyDeafened = true
} = {}) {
  const skillSelect = showSkillSelect
    ? `
      <div class="form-group">
        <label><b>Skill</b></label>
        <select name="skillUuid" style="width:100%;">
          ${skills.map(s => {
            const sel = (s.uuid === selectedSkillUuid) ? "selected" : "";
            const hasSpec = s.hasSpec ? "1" : "0";
            return `<option value="${s.uuid}" data-has-spec="${hasSpec}" ${sel}>${s.name}</option>`;
          }).join("\n")}
        </select>
      </div>`
    : `<input type="hidden" name="skillUuid" value="${selectedSkillUuid ?? ""}" />`;

  const difficultyOptions = SKILL_DIFFICULTIES.map(d => {
    const sel = d.key === defaultDifficultyKey ? "selected" : "";
    const sign = d.mod >= 0 ? "+" : "";
    return `<option value="${d.key}" ${sel}>${d.label} (${sign}${d.mod})</option>`;
  }).join("\n");

  const specDisabled = !allowSpecialization;
  const specChecked = (!specDisabled && defaultUseSpec) ? "checked" : "";
  const specRow = `
      <div class="form-group" style="margin-top:8px;">
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" name="useSpec" ${specChecked} ${specDisabled ? "disabled" : ""} />
          <span><b>Use Specialization</b> (+10)${specDisabled ? ' <span style="opacity:0.75;">(none on this skill)</span>' : ""}</span>
        </label>
      </div>`;
  const resistanceSection = buildResistanceBonusSection(actor);
  const hasBlinded = actor ? hasCondition(actor, "blinded") : false;
  const hasDeafened = actor ? hasCondition(actor, "deafened") : false;

  const sensoryRow = (hasBlinded || hasDeafened) ? `
      <div class="form-group" style="margin-top:8px;">
        <label><b>Sensory Impairment</b></label>
        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
          ${hasBlinded ? '<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" name="applyBlinded" ' + (defaultApplyBlinded ? 'checked' : '') + '/> <span>Apply Blinded (-30, sight-based)</span></label>' : ''}
          ${hasDeafened ? '<label style="display:flex; gap:8px; align-items:center;"><input type="checkbox" name="applyDeafened" ' + (defaultApplyDeafened ? 'checked' : '') + '/> <span>Apply Deafened (-30, hearing-based)</span></label>' : ''}
        </div>
        <p style="opacity:0.8; font-size:12px; margin-top:6px;">RAW: apply only if the test benefits from the relevant sense.</p>
      </div>` : "";


  const content = `
    <form class="uesrpg-skill-declare">
      ${skillSelect}

      <div class="form-group">
        <label><b>Difficulty</b></label>
        <select name="difficultyKey" style="width:100%;">${difficultyOptions}</select>
      </div>

      ${specRow}

      ${sensoryRow}

      ${resistanceSection.html}

      <div class="form-group" style="margin-top:8px;">
        <label><b>Manual Modifier</b></label>
        <input name="manualMod" type="number" value="${Number(defaultManualMod) || 0}" style="width:100%;" />
      </div>
    </form>`;

  // Inline helper: toggle specialization checkbox availability when choosing a different skill.
  const withScript = showSkillSelect ? `${content}
    <script>
      (function(){
        const dialog = document.currentScript?.closest('.dialog') || document;
        const form = dialog.querySelector('form.uesrpg-skill-declare');
        const sel = form?.querySelector('select[name="skillUuid"]');
        const cb = form?.querySelector('input[name="useSpec"]');
        const label = cb?.closest('label');
        function sync(){
          if (!sel || !cb) return;
          const opt = sel.options[sel.selectedIndex];
          const has = (opt?.dataset?.hasSpec === '1');
          cb.disabled = !has;
          if (!has) cb.checked = false;
          if (label) {
            label.querySelectorAll('span[data-spec-none]').forEach(n => n.remove());
            if (!has) {
              const s = document.createElement('span');
              s.dataset.specNone = '1';
              s.style.opacity = '0.75';
              s.textContent = ' (none on this skill)';
              label.appendChild(s);
            }
          }
        }
        sel?.addEventListener('change', sync);
        sync();
      })();
    </script>` : content;

  try {
    const result = await Dialog.wait({
      title,
      content: withScript,
      buttons: {
        ok: {
          label: "Roll",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            const skillUuid = root?.querySelector('select[name="skillUuid"]')?.value
              ?? root?.querySelector('input[name="skillUuid"]')?.value
              ?? "";
            const difficultyKey = root?.querySelector('select[name="difficultyKey"]')?.value ?? "average";
            const useSpec = Boolean(root?.querySelector('input[name="useSpec"]')?.checked);
            const applyBlinded = Boolean(root?.querySelector('input[name="applyBlinded"]')?.checked);
            const applyDeafened = Boolean(root?.querySelector('input[name="applyDeafened"]')?.checked);
            const selectedRes = readResistanceBonusSelections(root, resistanceSection.options);

            const rawManual = root?.querySelector('input[name="manualMod"]')?.value ?? "0";
            const manualMod = Number.parseInt(String(rawManual), 10) || 0;
            return { skillUuid, difficultyKey, useSpec, manualMod, applyBlinded, applyDeafened, resistanceSelected: selectedRes };
          }
        },
        cancel: { label: "Cancel", callback: () => null }
      },
      default: "ok"
    }, { width: 420 });
    return result ?? null;
  } catch (_e) {
    return null;
  }
}

function _listSkills(actor, { allowCombatStyle = false } = {}) {
  const out = [];
  
  // Add ALL Combat Styles if allowed (not just active one)
  if (allowCombatStyle && actor?.type !== "NPC") {
    const combatStyles = actor?.itemTypes?.combatStyle ?? actor?.items?.filter(i => i.type === "combatStyle") ?? [];
    for (const cs of combatStyles) {
      out.push({ 
        uuid: cs.uuid, 
        name: `${cs.name} (Combat Style)`, 
        hasSpec: false, 
        isCombatStyle: true
      });
    }
  }
  
  const items = actor?.itemTypes?.skill ?? actor?.items?.filter(i => i.type === "skill") ?? [];
  for (const i of items) out.push({ uuid: i.uuid, name: i.name, item: i, hasSpec: _hasSpecializations(i) });

  if (actor?.type === "NPC") {
    const professions = _listProfessions(actor);
    
    // For NPCs with Combat Style allowed, add Combat profession at the top
    if (allowCombatStyle) {
      const combatProf = professions.find(p => p._professionKey === "combat");
      if (combatProf) {
        out.unshift({ 
          uuid: combatProf.uuid, 
          name: combatProf.name, 
          hasSpec: false, 
          isProfession: true,
          isCombatProfession: true
        });
      }
    }
    
    // Add remaining professions
    for (const p of professions) {
      if (p._professionKey !== "combat" || !allowCombatStyle) {
        out.push({ uuid: p.uuid, name: p.name, item: p, hasSpec: false, isProfession: true });
      }
    }
  }
  return out;
}

function _listProfessions(actor) {
  const out = [];
  const sys = actor?.system ?? {};
  const prof = sys?.professions ?? {};

  const labelFor = (key) => {
    if (key === "profession1" || key === "profession2" || key === "profession3") {
      const spec = String(sys?.skills?.[key]?.specialization ?? "").trim();
      return spec || key.replace("profession", "Profession ");
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
  };

  for (const key of Object.keys(prof)) {
    out.push({
      uuid: `prof:${key}`,
      id: `prof:${key}`,
      type: "profession",
      name: labelFor(key),
      system: { value: Number(prof[key] ?? 0) },
      _professionKey: key
    });
  }
  return out;
}


function _findSkillByUuid(actor, uuid) {
  if (!uuid) return null;

  if (typeof uuid === "string" && uuid.startsWith("prof:")) {
    const key = uuid.slice(5);
    const sys = actor?.system ?? {};
    const val = Number(sys?.professions?.[key] ?? 0);

    const labelFor = (k) => {
      if (k === "profession1" || k === "profession2" || k === "profession3") {
        const spec = String(sys?.skills?.[k]?.specialization ?? "").trim();
        return spec || k.replace("profession", "Profession ");
      }
      return k.charAt(0).toUpperCase() + k.slice(1);
    };

    return { uuid, id: uuid, type: "profession", name: labelFor(key), system: { value: val }, _professionKey: key };
  }

  // Try to resolve as an item UUID
  const item = actor?.items?.find(i => i.uuid === uuid) ?? null;
  if (item) return item;

  return null;
}

/**
 * Helper to resolve Combat Style or Skill item from UUID.
 * Returns: { type: "combatStyle"|"skill"|"profession", item, name, value }
 */
function _resolveCombatStyleOrSkill(actor, skillUuid) {
  if (!skillUuid) return null;
  
  // Try to resolve the item
  const item = _findSkillByUuid(actor, skillUuid);
  
  if (!item) return null;
  
  // Combat Style item
  if (item.type === "combatStyle") {
    return {
      type: "combatStyle",
      item,
      name: item.name,
      value: item.system?.value ?? 0
    };
  }
  
  // Profession (NPC combat profession or other professions)
  if (item.type === "profession" || item._professionKey) {
    return {
      type: "profession",
      item,
      name: item.name,
      value: item.system?.value ?? 0,
      professionKey: item._professionKey
    };
  }
  
  // Regular skill item
  if (item.type === "skill") {
    return {
      type: "skill",
      item,
      name: item.name,
      value: item.system?.value ?? 0
    };
  }
  
  return null;
}


function _resolveOutcome(data) {
  if (!data?.attacker?.result || !data?.defender?.result) return null;
  const out = resolveOpposed(data.attacker.result, data.defender.result);
  const aName = data.attacker.name;
  const dName = data.defender.name;
  const text = out.winner === "attacker"
    ? `${aName} wins — ${data.attacker.skillLabel} beats ${data.defender.skillLabel}.`
    : (out.winner === "defender"
      ? `${dName} wins — ${data.defender.skillLabel} beats ${data.attacker.skillLabel}.`
      : `Tie — no one gains advantage.`);
  return { ...out, text };
}

async function _executeSpecialActionIfWinner(data) {
  // Issue 2: Special Action automation on opposed test win
  if (data.outcome?.winner === "attacker" && data.specialActionId) {
    try {
      const { executeSpecialAction } = await import("../combat/special-actions-helper.js");
      const attackerActor = _resolveActor(data.attacker.actorUuid);
      const defenderActor = _resolveActor(data.defender.actorUuid);
      
      if (attackerActor && defenderActor) {
        const result = await executeSpecialAction({
          specialActionId: data.specialActionId,
          actor: attackerActor,
          target: defenderActor,
          isAutoWin: false, // Was opposed test, not auto-win
          opposedResult: { 
            winner: "attacker", 
            degrees: data.outcome?.degrees ?? 0 
          }
        });
        
        if (result.success) {
          // Post automation result to chat
          await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
            content: `<div class="uesrpg-special-action-outcome"><b>Special Action:</b><p>${result.message}</p></div>`,
            style: CONST.CHAT_MESSAGE_STYLES.OTHER
          });
        }
      }
    } catch (err) {
      console.error("UESRPG | Failed to execute Special Action automation", err);
    }
  }
}

export const SkillOpposedWorkflow = {
  /**
   * Banked-choice auto roll hook helper (GM-present).
   * Called from the global updateChatMessage hook when the parent card updates.
   */
  async maybeAutoRollBanked(message) {
    try {
      const activeGM = game.users.activeGM ?? null;
      if (!activeGM) return;
      if (game.user.id !== activeGM.id) return;

      const data = _getMessageState(message);
      if (!data) return;

      // Only proceed once both sides have committed and no roll results exist yet.
      if (!_bothSidesCommitted(data)) return;
      if (data.attacker?.result || data.defender?.result || data.outcome || data.status === "resolved") return;

      await this._autoRollBanked(message.id, { trigger: "hook" });
    } catch (err) {
      console.error("UESRPG | Skill opposed banked GM auto-roll hook failed", err);
    }
  },

  /**
   * Banked-choice auto roll hook helper (no active GM).
   * Uses the parent message author as the authority runner.
   */
  async maybeAutoRollBankedNoGM(message) {
    try {
      const activeGM = game.users.activeGM ?? null;
      if (activeGM) return;

      // Only the message author should attempt auto-roll to avoid concurrent updates.
      if (!message.isAuthor) return;

      const data = _getMessageState(message);
      if (!data) return;

      if (!_bothSidesCommitted(data)) return;
      if (data.attacker?.result || data.defender?.result || data.outcome || data.status === "resolved") return;

      await this._autoRollBanked(message.id, { trigger: "hook-no-gm" });
    } catch (err) {
      console.error("UESRPG | Skill opposed banked no-GM auto-roll hook failed", err);
    }
  },

  /**
   * Begin rolling a banked-choice opposed skill test once both sides have committed.
   * Rolls any unresolved lanes without prompting for additional choices.
   */
  async _autoRollBanked(parentMessageId, { trigger = "unknown" } = {}) {
    if (!parentMessageId) return;
    if (_bankedAutoRollLocalLocks.has(parentMessageId)) return;
    _bankedAutoRollLocalLocks.add(parentMessageId);

    try {
      const message = game.messages.get(parentMessageId) ?? null;
      if (!message) return;

      const data = _getMessageState(message);
      if (!data) return;

      if (!_bothSidesCommitted(data)) return;

      // If already resolved, do nothing.
      if (data.outcome || data.status === "resolved" || (data.attacker?.result && data.defender?.result)) return;

      // Roll attacker lane first if needed.
      if (!data.attacker?.result) {
        await this.handleAction(message, "attacker-roll-committed");
      }

      // Refresh after potential updates.
      const fresh = game.messages.get(parentMessageId) ?? null;
      if (!fresh) return;
      const freshData = _getMessageState(fresh);
      if (!freshData) return;

      // Roll defender lane if needed.
      if (!freshData.defender?.result) {
        await this.handleAction(fresh, "defender-roll-committed");
      }
    } finally {
      _bankedAutoRollLocalLocks.delete(parentMessageId);
    }
  },
  /**
   * Bank an externally-created roll message (attacker-roll / defender-roll) into
   * the parent opposed skill card.
   *
   * This is intended to be executed by the active GM (when present) or by the
   * parent message author (when no GM is active) from a createChatMessage hook.
   *
   * @param {ChatMessage} rollMessage
   */
  async applyExternalRollMessage(rollMessage) {
    const meta = rollMessage?.flags?.["uesrpg-3ev4"]?.skillOpposedMeta ?? null;
    const parentId = meta?.parentMessageId ?? null;
    const stage = meta?.stage ?? null;

    const rollId = rollMessage?.id ?? rollMessage?._id ?? null;
    if (!parentId || !stage) return;

    const parent = game.messages.get(parentId) ?? null;
    if (!parent) return;

    const raw = parent?.flags?.[_FLAG_NS]?.[_FLAG_KEY];
    const normalized = _normalizeCardFlag(raw);
    const current = normalized.state;
    if (!current || typeof current !== "object") return;



    // Anti-spoof + consistency checks: only bank roll messages that match the expected side.
    const expectedSide = (stage === "attacker-roll")
      ? current.attacker
      : (stage === "defender-roll" ? current.defender : null);

    if (!expectedSide?.actorUuid) return;

    const expectedActor = _resolveActor(expectedSide.actorUuid);
    if (!expectedActor) return;

    const speakerActorId = rollMessage?.speaker?.actor ?? null;
    if (speakerActorId && speakerActorId !== expectedActor.id) return;

    const authorId =
  rollMessage?.author?.id ??
  rollMessage?.user?.id ??
  (typeof rollMessage?.user === "string" ? rollMessage.user : null) ??
  rollMessage?._source?.user ??
  rollMessage?.data?.user ??
  null;
const authorUser = authorId ? (game.users.get(authorId) ?? null) : null;
if (!authorUser) return;

    if (!authorUser.isGM && !_userHasActorOwnership(authorUser, expectedActor)) return;

    const data = foundry.utils.deepClone(current);

    let dirty = false;

    const applyResult = async (side) => {
      if (!side?.actorUuid) return null;

      let actor = null;
      try {
        const doc = fromUuidSync(side.actorUuid);
        actor = (doc?.documentName === "Actor") ? doc : (doc?.actor ?? null);
      } catch (_e) {
        actor = null;
      }
      if (!actor) return null;

      const roll = rollMessage?.rolls?.[0] ?? null;
      const rollTotal = Number(roll?.total ?? NaN);
      if (!Number.isFinite(rollTotal)) return null;

      const target = Number(side?.tn?.finalTN ?? 0);
      const res = computeResultFromRollTotal(actor, {
        rollTotal,
        target,
        allowLucky: true,
        allowUnlucky: true
      });

      return {
        rollTotal: res.rollTotal,
        target: res.target,
        isSuccess: res.isSuccess,
        degree: res.degree,
        textual: res.textual,
        isCriticalSuccess: res.isCriticalSuccess,
        isCriticalFailure: res.isCriticalFailure
      };
    };

    // Apply commit payload (TN, labels, etc.) before evaluating DoS/DoF.
    // This is required when the roller cannot update the parent card directly.
    if (stage === "defender-roll") {
      const c = meta?.commit?.defender ?? null;
      if (c && typeof c === "object") {
        data.defender = data.defender ?? {};
        if (c.skillUuid != null) data.defender.skillUuid = String(c.skillUuid);
        if (c.skillLabel != null) data.defender.skillLabel = String(c.skillLabel);
        if (c.declared && typeof c.declared === "object") data.defender.declared = foundry.utils.deepClone(c.declared);
        if (c.tn && typeof c.tn === "object") data.defender.tn = foundry.utils.deepClone(c.tn);
      }
    }

    if (stage === "attacker-roll") {
      if (data.attacker?.result) {
        if (!data.attacker.rollMessageId && rollId) {
          data.attacker.rollMessageId = rollId;
          data.attacker.rolledAt = Date.now();
          dirty = true;
        } else {
          return;
        }
      } else {
        const r = await applyResult(data.attacker);
        if (!r) return;
        data.attacker.result = r;
        if (rollId) {
          data.attacker.rollMessageId = rollId;
          data.attacker.rolledAt = Date.now();
        }
        dirty = true;
      }
    } else if (stage === "defender-roll") {
      if (data.defender?.result) {
        if (!data.defender.rollMessageId && rollId) {
          data.defender.rollMessageId = rollId;
          data.defender.rolledAt = Date.now();
          dirty = true;
        } else {
          return;
        }
      } else {
        const r = await applyResult(data.defender);
        if (!r) return;
        data.defender.result = r;
        if (rollId) {
          data.defender.rollMessageId = rollId;
          data.defender.rolledAt = Date.now();
        }
        dirty = true;
      }
    } else {
      return;
    }

    // Phase tracking (non-breaking; used for diagnostics).
    data.context = data.context ?? {};
    if (stage === "attacker-roll") {
      data.context.phase = "waitingDefender";
      if (!data.context.waitingSince) data.context.waitingSince = Date.now();
    }
    if (stage === "defender-roll") {
      if (!data.context.phase || data.context.phase === "pending") data.context.phase = "resolving";
    }

    if (data.attacker?.result && data.defender?.result && !data.outcome) {
      data.outcome = _resolveOutcome(data);
      data.status = "resolved";
      data.context = data.context ?? {};
      data.context.phase = "resolved";
      if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
    }

    await _updateCard(parent, data);
  },

  async createPending(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid) ?? _resolveDoc(cfg.attackerUuid);
    const dDoc = _resolveDoc(cfg.defenderTokenUuid) ?? _resolveDoc(cfg.defenderActorUuid) ?? _resolveDoc(cfg.defenderUuid);

    const aToken = _resolveToken(aDoc);
    const dToken = _resolveToken(dDoc);
    const attacker = _resolveActor(aDoc);
    const defender = _resolveActor(dDoc);

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed skill test requires both an actor and a target (token or actor).");
      return null;
    }

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
      mode: "skill",
      attacker: {
        actorUuid: attacker.uuid,
        tokenUuid: aToken?.document?.uuid ?? null,
        tokenName: aToken?.name ?? null,
        name: attacker.name,
        skillUuid: cfg.attackerSkillUuid ?? null,
        skillLabel: cfg.attackerSkillLabel ?? "Skill",
        result: null,
        tn: null,
        declared: null
      },
      defender: {
        actorUuid: defender.uuid,
        tokenUuid: dToken?.document?.uuid ?? null,
        tokenName: dToken?.name ?? null,
        name: defender.name,
        skillUuid: null,
        skillLabel: null,
        result: null,
        tn: null,
        declared: null
      },
      outcome: null
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
      content: _renderCard(data, ""),
      flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } }, uesrpg: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } },
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });

    await message.update({ content: _renderCard(data, message.id) });
    return message;
  },

  async handleAction(message, action, { event } = {}) {
    const data = _getMessageState(message);
    if (!data) return;

    const attacker = _resolveActor(data.attacker.actorUuid);
    const defender = _resolveActor(data.defender.actorUuid);
    const aToken = _resolveToken(data.attacker.tokenUuid);
    const dToken = _resolveToken(data.defender.tokenUuid);

    // Hard bind the roll to the original token identities (prevents "replacement target" responses).
    if (data.attacker.tokenUuid && !aToken) {
      ui.notifications.warn("Opposed Skill Test: attacker token is no longer present.");
      return;
    }
    if (data.defender.tokenUuid && !dToken) {
      ui.notifications.warn("Opposed Skill Test: target token is no longer present.");
      return;
    }
    if (aToken && attacker.uuid && aToken.actor?.uuid && aToken.actor.uuid !== attacker.uuid) {
      ui.notifications.warn("Opposed Skill Test: attacker token no longer matches the original actor.");
      return;
    }
    if (dToken && defender.uuid && dToken.actor?.uuid && dToken.actor.uuid !== defender.uuid) {
      ui.notifications.warn("Opposed Skill Test: target token no longer matches the original actor.");
      return;
    }

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed Skill Test: could not resolve actors.");
      return;
    }

    // Manual begin: GM-only when a GM is active; otherwise the parent author may begin.
    if (action === "begin-banked-roll") {
      const activeGM = game.users.activeGM ?? null;
      if (activeGM) {
        if (!game.user.isGM) {
          ui.notifications.info("Requested GM to begin the opposed roll.");
          return;
        }
      } else {
        if (!message.isAuthor && !game.user.isGM) {
          ui.notifications.warn("Only the message author may begin the opposed roll (no GM active).");
          return;
        }
      }

      await this._autoRollBanked(message.id, { trigger: "manual" });
      return;
    }

    if (action === "attacker-roll" || action === "attacker-roll-committed") {
      if (data.attacker.result) return;

      const isCommittedRoll = (action === "attacker-roll-committed");

      // Committing choices requires roll permission for this actor.
      if (!requireUserCanRollActor(game.user, attacker)) return;
      
      // Always respect allowCombatStyle from state (default to true for universal access)
      const allowCombatStyle = Boolean(data?.allowCombatStyle ?? true);
      
      const skills = _listSkills(attacker, { allowCombatStyle });
      if (!skills.length) {
        ui.notifications.warn("Actor has no skills to roll.");
        return;
      }

      const last = _getLastSkillRollOptions();
      const perActorLastSkill = last?.lastSkillUuidByActor?.[attacker.uuid] ?? null;
      const selectedSkillUuid = data.attacker.skillUuid ?? perActorLastSkill ?? skills[0].uuid;

      const defaults = normalizeSkillRollOptions(last, { difficultyKey: "average", manualMod: 0, useSpec: false });

      let decl = null;
      const quick = Boolean(event?.shiftKey) && game.settings.get("uesrpg-3ev4", "skillRollQuickShift");

      if (isCommittedRoll) {
        decl = data.attacker?.declaration ?? null;
        if (!decl) {
          ui.notifications.warn("Attacker has not committed choices yet.");
          return;
        }
      } else {
        if (quick) {
          decl = { skillUuid: selectedSkillUuid,
            applyBlinded: (defaults.applyBlinded ?? true),
            applyDeafened: (defaults.applyDeafened ?? true),
            ...defaults };
        } else {
          decl = await _skillRollDialog({
            title: "Opposed Skill Test — Attacker",
            actor: attacker,
            target: defender,
            skills,
            selectedSkillUuid,
            canUseSpec: true,
            defaultDifficultyKey: defaults.difficultyKey,
            defaultManualMod: defaults.manualMod,
            defaultApplyBlinded: (defaults.applyBlinded ?? true),
            defaultApplyDeafened: (defaults.applyDeafened ?? true)
          });
        }
        if (!decl) return;

        // Normalize + clamp UI inputs.
        decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

        // Bank choices into the parent card; do not roll until both sides have committed.
        data.attacker.declaration = decl;
        data.attacker.skillUuid = decl.skillUuid;
        data.attacker.committedAt = data.attacker.committedAt ?? Date.now();

        data.context = data.context ?? {};
        if (!data.context.phase || data.context.phase === "pending") data.context.phase = "waitingDefender";
        if (!data.context.waitingSince) data.context.waitingSince = Date.now();

        await _updateCard(message, data);
        return;
      }

      // Normalize + clamp UI inputs.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

      // Normalize + clamp UI inputs.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

      // Normalize+clamp options from UI.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

      const resMods = buildResistanceBonusMods(decl?.resistanceSelected ?? []);

      // Handle Combat Style or Combat profession separately
      let tn;
      let skillLabel;
      let skillItem = null;
      
      const resolved = _resolveCombatStyleOrSkill(attacker, decl.skillUuid);
      if (!resolved) {
        ui.notifications.warn("Selected actor skill or combat style could not be found.");
        return;
      }
      
      if (resolved.type === "combatStyle") {
        // Combat Style roll
        const { computeTN } = await import("../combat/tn.js");
        const situationalMods = [];
        if (decl?.applyBlinded) situationalMods.push({ label: "Blinded (sight)", value: -30 });
        if (decl?.applyDeafened) situationalMods.push({ label: "Deafened (hearing)", value: -30 });
        if (resMods.length) situationalMods.push(...resMods);
        if (resMods.length) situationalMods.push(...resMods);
        if (resMods.length) situationalMods.push(...resMods);
        
        tn = computeTN({
          actor: attacker,
          role: "attacker",
          styleUuid: decl.skillUuid,
          manualMod: decl.manualMod,
          situationalMods
        });
        skillLabel = resolved.name;
        skillItem = null; // Combat Style doesn't use skillItem
      } else if (resolved.type === "profession" && resolved.professionKey === "combat") {
        // NPC Combat profession
        const { computeTN } = await import("../combat/tn.js");
        const situationalMods = [];
        if (decl?.applyBlinded) situationalMods.push({ label: "Blinded (sight)", value: -30 });
        if (decl?.applyDeafened) situationalMods.push({ label: "Deafened (hearing)", value: -30 });
        if (resMods.length) situationalMods.push(...resMods);
        
        tn = computeTN({
          actor: attacker,
          role: "attacker",
          styleUuid: decl.skillUuid,
          manualMod: decl.manualMod,
          situationalMods
        });
        skillLabel = resolved.name;
        skillItem = null; // Combat profession doesn't use skillItem
      } else if (resolved.type === "profession") {
        // Regular profession (Athletics, etc.)
        const baseValue = resolved.value;
        const diffMod = SKILL_DIFFICULTIES.find(d => d.key === decl.difficultyKey)?.mod ?? 0;
        const manualMod = Number(decl.manualMod ?? 0);
        let totalMod = diffMod + manualMod;
        
        const breakdown = [
          { key: "base", label: "Base", value: baseValue, source: "base" },
          { key: "difficulty", label: SKILL_DIFFICULTIES.find(d => d.key === decl.difficultyKey)?.label ?? "Average", value: diffMod, source: "difficulty" }
        ];
        
        if (manualMod) {
          breakdown.push({ key: "manual", label: "Manual Modifier", value: manualMod, source: "manual" });
        }
        
        if (decl?.applyBlinded) {
          totalMod += -30;
          breakdown.push({ key: "blinded", label: "Blinded (sight)", value: -30, source: "condition" });
        }
        if (decl?.applyDeafened) {
          totalMod += -30;
          breakdown.push({ key: "deafened", label: "Deafened (hearing)", value: -30, source: "condition" });
        }

        if (resMods.length) {
          for (const mod of resMods) {
            const value = Number(mod?.value ?? 0) || 0;
            if (!value) continue;
            totalMod += value;
            breakdown.push({ key: mod.key ?? "resistance", label: mod.label ?? "Resistance Bonus", value, source: mod.source ?? "resistanceTrait" });
          }
        }

        if (resMods.length) {
          for (const mod of resMods) {
            const value = Number(mod?.value ?? 0) || 0;
            if (!value) continue;
            totalMod += value;
            breakdown.push({ key: mod.key ?? "resistance", label: mod.label ?? "Resistance Bonus", value, source: mod.source ?? "resistanceTrait" });
          }
        }
        
        const finalTN = baseValue + totalMod;
        tn = { finalTN, baseTN: baseValue, totalMod, breakdown };
        skillLabel = resolved.name;
        skillItem = null; // Profession doesn't use skillItem
      } else {
        // Regular skill roll
        skillItem = resolved.item;
        const allowSpec = _hasSpecializations(skillItem);
        const situationalMods = [];
        if (decl?.applyBlinded) situationalMods.push({ label: "Blinded (sight)", value: -30 });
        if (decl?.applyDeafened) situationalMods.push({ label: "Deafened (hearing)", value: -30 });
        if (resMods.length) situationalMods.push(...resMods);
        tn = computeSkillTN({
          actor: attacker,
          skillItem,
          difficultyKey: decl.difficultyKey,
          manualMod: decl.manualMod,
          useSpecialization: allowSpec && decl.useSpec,
          situationalMods
        });
        skillLabel = skillItem.name;
      }

      const request = skillItem ? buildSkillRollRequest({
        actor: attacker,
        skillItem,
        targetToken: dToken,
        options: { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec), applyBlinded: Boolean(decl.applyBlinded), applyDeafened: Boolean(decl.applyDeafened) },
        context: { source: "chat", quick, messageId: message.id, groupId: data.context?.groupId ?? null }
      }) : null;
      
      if (request) {
        const v = validateSkillRollRequest(request);
        if (!v.ok) {
          ui.notifications.warn(v.error || "Invalid skill roll request.");
          return;
        }
        skillRollDebug("opposed attacker request", request);
        data.attacker.request = request;
      }

      data.attacker.skillUuid = decl.skillUuid;
      data.attacker.skillLabel = skillLabel;
      data.attacker.declared = { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec) };
      
      await _setLastSkillRollOptions(_mergeLastSkillRollOptions({
        difficultyKey: decl.difficultyKey,
        manualMod: decl.manualMod,
        useSpec: Boolean(decl.useSpec),
        lastSkillUuidByActor: { [attacker.uuid]: decl.skillUuid }
      }));

      data.attacker.tn = tn;
      skillRollDebug("opposed attacker TN", { finalTN: tn.finalTN, breakdown: tn.breakdown });

      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: tn.finalTN, allowLucky: true, allowUnlucky: true });

      skillRollDebug("opposed attacker result", { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, critS: res.isCriticalSuccess, critF: res.isCriticalFailure });

      const rollFlags = request ? {
        uesrpg: { rollRequest: request },
        "uesrpg-3ev4": {
          rollRequest: request,
          ..._skillOpposedMetaFlag(message.id, "attacker-roll")
        }
      } : {
        "uesrpg-3ev4": {
          ..._skillOpposedMetaFlag(message.id, "attacker-roll")
        }
      };

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        flavor: `${data.attacker.skillLabel} — Opposed Skill (Actor)`,
        flags: rollFlags,
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

      if (data.defender.result) {
        data.outcome = _resolveOutcome(data);
        await _executeSpecialActionIfWinner(data);
      }

      await _updateCard(message, data);
      return;
    }

    if (action === "defender-roll" || action === "defender-roll-committed") {
      if (data.defender.result) return;

      const isCommittedRoll = (action === "defender-roll-committed");

      // Committing choices requires roll permission for this actor.
      if (!requireUserCanRollActor(game.user, defender, { message: "You do not have permission to roll for the target actor." })) return;
      
      // Always respect allowCombatStyle from state (default to true for universal access)
      const allowCombatStyle = Boolean(data?.allowCombatStyle ?? true);
      
      const skills = _listSkills(defender, { allowCombatStyle });
      if (!skills.length) {
        ui.notifications.warn("Target actor has no skills to roll.");
        return;
      }

      const last = _getLastSkillRollOptions();
      const perActorLastSkill = last?.lastSkillUuidByActor?.[defender.uuid] ?? null;

      // Default selection: use locked-in skill if available, else same-named skill if present, else last-used on this actor, else first.
      const lockedSkillUuid = data.defender.skillUuid;
      const wantedName = String(data.attacker.skillLabel ?? "").trim().toLowerCase();
      const sameName = skills.find(s => String(s.name).trim().toLowerCase() === wantedName) ?? null;
      const selectedSkillUuid = lockedSkillUuid ?? sameName?.uuid ?? perActorLastSkill ?? skills[0].uuid;

      const defaults = normalizeSkillRollOptions(last, { difficultyKey: "average", manualMod: 0, useSpec: false });

      let decl = null;
      const quick = Boolean(event?.shiftKey) && game.settings.get("uesrpg-3ev4", "skillRollQuickShift");

      if (isCommittedRoll) {
        decl = data.defender?.declaration ?? null;
        if (!decl) {
          ui.notifications.warn("Defender has not committed choices yet.");
          return;
        }
      } else {
        if (quick) {
          decl = { skillUuid: selectedSkillUuid, difficultyKey: defaults.difficultyKey, manualMod: defaults.manualMod, useSpec: defaults.useSpec, applyBlinded: (defaults.applyBlinded ?? true), applyDeafened: (defaults.applyDeafened ?? true) };
        } else {
          // Always show skill selection dropdown (removed pre-choice dialog dependency)
          decl = await _skillRollDialog({
            title: `Oppose — Choose Skill`,
            actor: defender,
            showSkillSelect: true,
            skills,
            selectedSkillUuid,
            allowSpecialization: true,
            defaultUseSpec: defaults.useSpec,
            defaultDifficultyKey: defaults.difficultyKey,
            defaultManualMod: defaults.manualMod,
            defaultApplyBlinded: (defaults.applyBlinded ?? true),
            defaultApplyDeafened: (defaults.applyDeafened ?? true)
          });
        }
        if (!decl) return;

        // Normalize + clamp UI inputs.
        decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

        // Bank choices into the parent card; do not roll until both sides have committed.
        data.defender.declaration = decl;
        data.defender.skillUuid = decl.skillUuid;
        data.defender.committedAt = data.defender.committedAt ?? Date.now();

        data.context = data.context ?? {};
        if (!data.context.phase || data.context.phase === "pending") data.context.phase = "waitingAttacker";
        if (!data.context.waitingSince) data.context.waitingSince = Date.now();

        await _updateCard(message, data);
        return;
      }

      // Normalize + clamp UI inputs.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

      const resMods = buildResistanceBonusMods(decl?.resistanceSelected ?? []);

      // Handle Combat Style or Combat profession separately
      let tn;
      let skillLabel;
      let defSkill = null;
      
      const resolved = _resolveCombatStyleOrSkill(defender, decl.skillUuid);
      if (!resolved) {
        ui.notifications.warn("Selected defender skill or combat style could not be found.");
        return;
      }
      
      if (resolved.type === "combatStyle") {
        // Combat Style roll
        const { computeTN } = await import("../combat/tn.js");
        const situationalMods = [];
        if (decl?.applyBlinded) situationalMods.push({ label: "Blinded (sight)", value: -30 });
        if (decl?.applyDeafened) situationalMods.push({ label: "Deafened (hearing)", value: -30 });
        
        tn = computeTN({
          actor: defender,
          role: "defender",
          defenseType: _DEFAULT_COMBAT_STYLE_DEFENSE_TYPE,
          styleUuid: decl.skillUuid,
          manualMod: decl.manualMod,
          situationalMods
        });
        skillLabel = resolved.name;
        defSkill = null; // Combat Style doesn't use skillItem
      } else if (resolved.type === "profession" && resolved.professionKey === "combat") {
        // NPC Combat profession
        const { computeTN } = await import("../combat/tn.js");
        const situationalMods = [];
        if (decl?.applyBlinded) situationalMods.push({ label: "Blinded (sight)", value: -30 });
        if (decl?.applyDeafened) situationalMods.push({ label: "Deafened (hearing)", value: -30 });
        
        tn = computeTN({
          actor: defender,
          role: "defender",
          defenseType: _DEFAULT_COMBAT_STYLE_DEFENSE_TYPE,
          styleUuid: decl.skillUuid,
          manualMod: decl.manualMod,
          situationalMods
        });
        skillLabel = resolved.name;
        defSkill = null; // Combat profession doesn't use skillItem
      } else if (resolved.type === "profession") {
        // Regular profession (Athletics, etc.)
        const baseValue = resolved.value;
        const diffMod = SKILL_DIFFICULTIES.find(d => d.key === decl.difficultyKey)?.mod ?? 0;
        const manualMod = Number(decl.manualMod ?? 0);
        let totalMod = diffMod + manualMod;
        
        const breakdown = [
          { key: "base", label: "Base", value: baseValue, source: "base" },
          { key: "difficulty", label: SKILL_DIFFICULTIES.find(d => d.key === decl.difficultyKey)?.label ?? "Average", value: diffMod, source: "difficulty" }
        ];
        
        if (manualMod) {
          breakdown.push({ key: "manual", label: "Manual Modifier", value: manualMod, source: "manual" });
        }
        
        if (decl?.applyBlinded) {
          totalMod += -30;
          breakdown.push({ key: "blinded", label: "Blinded (sight)", value: -30, source: "condition" });
        }
        if (decl?.applyDeafened) {
          totalMod += -30;
          breakdown.push({ key: "deafened", label: "Deafened (hearing)", value: -30, source: "condition" });
        }
        
        const finalTN = baseValue + totalMod;
        tn = { finalTN, baseTN: baseValue, totalMod, breakdown };
        skillLabel = resolved.name;
        defSkill = null; // Profession doesn't use skillItem
      } else {
        // Regular skill roll
        defSkill = resolved.item;
        const allowSpec = _hasSpecializations(defSkill);
        const situationalMods = [];
        if (decl?.applyBlinded) situationalMods.push({ label: "Blinded (sight)", value: -30 });
        if (decl?.applyDeafened) situationalMods.push({ label: "Deafened (hearing)", value: -30 });
        if (resMods.length) situationalMods.push(...resMods);
        tn = computeSkillTN({
          actor: defender,
          skillItem: defSkill,
          difficultyKey: decl.difficultyKey,
          manualMod: decl.manualMod,
          useSpecialization: allowSpec && decl.useSpec,
          situationalMods
        });
        skillLabel = defSkill.name;
      }

      const request = defSkill ? buildSkillRollRequest({
        actor: defender,
        skillItem: defSkill,
        targetToken: aToken,
        options: { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec), applyBlinded: Boolean(decl.applyBlinded), applyDeafened: Boolean(decl.applyDeafened) },
        context: { source: "chat", quick, messageId: message.id, groupId: data.context?.groupId ?? null }
      }) : null;
      
      if (request) {
        const v = validateSkillRollRequest(request);
        if (!v.ok) {
          ui.notifications.warn(v.error || "Invalid skill roll request.");
          return;
        }
        skillRollDebug("opposed defender request", request);
        data.defender.request = request;
      }

      data.defender.skillUuid = decl.skillUuid;
      data.defender.skillLabel = skillLabel;
      data.defender.declared = { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec) };
      
      await _setLastSkillRollOptions(_mergeLastSkillRollOptions({
        difficultyKey: decl.difficultyKey,
        manualMod: decl.manualMod,
        useSpec: Boolean(decl.useSpec),
        lastSkillUuidByActor: { [defender.uuid]: decl.skillUuid }
      }));

      data.defender.tn = tn;
      skillRollDebug("opposed defender TN", { finalTN: tn.finalTN, breakdown: tn.breakdown });

      const res = await doTestRoll(defender, { rollFormula: "1d100", target: tn.finalTN, allowLucky: true, allowUnlucky: true });

      skillRollDebug("opposed defender result", { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, critS: res.isCriticalSuccess, critF: res.isCriticalFailure });

      const rollFlags = request ? {
        uesrpg: { rollRequest: request },
        "uesrpg-3ev4": {
          rollRequest: request,
          ..._skillOpposedMetaFlag(message.id, "defender-roll", {
            commit: {
              defender: {
                skillUuid: data.defender.skillUuid,
                skillLabel: data.defender.skillLabel,
                declared: data.defender.declared,
                tn
              }
            }
          })
        }
      } : {
        "uesrpg-3ev4": {
          ..._skillOpposedMetaFlag(message.id, "defender-roll", {
            commit: {
              defender: {
                skillUuid: data.defender.skillUuid,
                skillLabel: data.defender.skillLabel,
                declared: data.defender.declared,
                tn
              }
            }
          })
        }
      };

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        flavor: `${data.defender.skillLabel} — Opposed Skill (Target)`,
        flags: rollFlags,
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

      if (data.attacker.result) {
        data.outcome = _resolveOutcome(data);
        await _executeSpecialActionIfWinner(data);
      }

      await _updateCard(message, data);
      return;
    }
  }
};

// Helpful global for macros
window.UesrpgSkillOpposed = window.UesrpgSkillOpposed || {};
window.UesrpgSkillOpposed.createPending = window.UesrpgSkillOpposed.createPending || SkillOpposedWorkflow.createPending;
window.UesrpgSkillOpposed.handleAction = window.UesrpgSkillOpposed.handleAction || SkillOpposedWorkflow.handleAction;
