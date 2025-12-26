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

import { doTestRoll, resolveOpposed, formatDegree } from "../helpers/degree-roll-helper.js";
import { computeSkillTN, SKILL_DIFFICULTIES } from "./skill-tn.js";
import { requireUserCanRollActor } from "../helpers/permissions.js";
import { buildSkillRollRequest, normalizeSkillRollOptions, skillRollDebug, validateSkillRollRequest } from "./roll-request.js";

const _SKILL_ROLL_SETTINGS_NS = "uesrpg-3ev4";
const _FLAG_NS = "uesrpg-3ev4";
const _FLAG_KEY = "skillOpposed";
const _CARD_VERSION = 1;
const _SKILL_ROLL_LAST_OPTIONS_KEY = "skillRollLastOptions";

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
    return game.settings.get(_SKILL_ROLL_SETTINGS_NS, _SKILL_ROLL_LAST_OPTIONS_KEY) ?? {};
  } catch (_e) {
    return {};
  }
}

async function _setLastSkillRollOptions(next) {
  try {
    await game.settings.set(_SKILL_ROLL_SETTINGS_NS, _SKILL_ROLL_LAST_OPTIONS_KEY, next ?? {});
  } catch (_e) {
    // client setting may not exist if init hasn't run yet; fail silently
  }
}

function _mergeLastSkillRollOptions(patch={}) {
  const prev=_getLastSkillRollOptions();
  const next={...prev, ...patch};
  next.lastSkillUuidByActor = {...(prev.lastSkillUuidByActor||{}), ...(patch.lastSkillUuidByActor||{})};
  return next;
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
    .map(([k, v]) => `data-${k}="${String(v).replace(/\"/g, "&quot;")}"`)
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

  const aTNLabel = a.tn ? `${a.tn.finalTN}` : "—";
  const dTNLabel = d.tn ? `${d.tn.finalTN}` : "—";

  const attackerActions = a.result ? "" : `<div style="margin-top:6px;">${_btn("Roll Test", "attacker-roll")}</div>`;
  const defenderActions = d.result ? "" : `<div style="margin-top:6px;">${_btn("Roll Opposed", "defender-roll")}</div>`;

  const outcomeLine = data.outcome
    ? `<div style="margin-top:10px;"><b>Outcome:</b> ${data.outcome.text ?? ""}</div>`
    : `<div style="margin-top:10px;"><i>Pending</i></div>`;

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
    </div>
    ${outcomeLine}
  </div>`;
}

async function _updateCard(message, data) {
  data.context = data.context ?? {};
  data.context.schemaVersion = data.context.schemaVersion ?? _CARD_VERSION;
  data.context.updatedAt = Date.now();
  data.context.updatedBy = game.user.id;

  await message.update({
    content: _renderCard(data, message.id),
    flags: { [_FLAG_NS]: { [_FLAG_KEY]: { version: _CARD_VERSION, state: data } } }
  });
}

function _hasSpecializations(skillItem) {
  const raw = String(skillItem?.system?.trainedItems ?? "").trim();
  return raw.length > 0;
}

async function _skillRollDialog({
  title,
  showSkillSelect = false,
  skills = [],
  selectedSkillUuid = null,
  allowSpecialization = false,
  defaultUseSpec = false,
  defaultDifficultyKey = "average",
  defaultManualMod = 0
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
          <span><b>Use Specialization</b> (+10)${specDisabled ? " <span style=\"opacity:0.75;\">(none on this skill)</span>" : ""}</span>
        </label>
      </div>`;

  const content = `
    <form class="uesrpg-skill-declare">
      ${skillSelect}

      <div class="form-group">
        <label><b>Difficulty</b></label>
        <select name="difficultyKey" style="width:100%;">${difficultyOptions}</select>
      </div>

      ${specRow}

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
            const rawManual = root?.querySelector('input[name="manualMod"]')?.value ?? "0";
            const manualMod = Number.parseInt(String(rawManual), 10) || 0;
            return { skillUuid, difficultyKey, useSpec, manualMod };
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

function _listSkills(actor) {
  const items = actor?.itemTypes?.skill ?? actor?.items?.filter(i => i.type === "skill") ?? [];
  return items.map(i => ({ uuid: i.uuid, name: i.name, item: i, hasSpec: _hasSpecializations(i) }));
}

function _findSkillByUuid(actor, uuid) {
  if (!uuid) return null;
  return actor?.items?.find(i => i.uuid === uuid) ?? null;
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

export const SkillOpposedWorkflow = {
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
        updatedBy: game.user.id
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

    if (action === "attacker-roll") {
      if (data.attacker.result) return;
      if (!requireUserCanRollActor(game.user, attacker)) return;
      const skills = _listSkills(attacker);
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
      if (quick) {
        decl = { skillUuid: selectedSkillUuid, ...defaults };
      } else {
        decl = await _skillRollDialog({
          title: `Opposed — Choose Skill`,
          showSkillSelect: true,
          skills,
          selectedSkillUuid,
          allowSpecialization: true,
          defaultUseSpec: defaults.useSpec,
          defaultDifficultyKey: defaults.difficultyKey,
          defaultManualMod: defaults.manualMod
        });
      }
      if (!decl) return;

      // Normalize + clamp UI inputs.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

      // Normalize + clamp UI inputs.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };

      // Normalize+clamp options from UI.
      decl = { ...decl, ...normalizeSkillRollOptions(decl, defaults) };


      const skillItem = _findSkillByUuid(attacker, decl.skillUuid);
      if (!skillItem) {
        ui.notifications.warn("Selected actor skill could not be found.");
        return;
      }

      const request = buildSkillRollRequest({
        actor: attacker,
        skillItem,
        targetToken: dToken,
        options: { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec) },
        context: { source: "chat", quick, messageId: message.id, groupId: data.context?.groupId ?? null }
      });
      const v = validateSkillRollRequest(request);
      if (!v.ok) {
        ui.notifications.warn(v.error || "Invalid skill roll request.");
        return;
      }
      skillRollDebug("opposed attacker request", request);

      data.attacker.skillUuid = skillItem.uuid;
      data.attacker.skillLabel = skillItem.name;
      data.attacker.declared = { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec) };
      data.attacker.request = request;
      await _setLastSkillRollOptions(_mergeLastSkillRollOptions({
        difficultyKey: decl.difficultyKey,
        manualMod: decl.manualMod,
        useSpec: Boolean(decl.useSpec),
        lastSkillUuidByActor: { [attacker.uuid]: skillItem.uuid }
      }));

      const allowSpec = _hasSpecializations(skillItem);
      const tn = computeSkillTN({
        actor: attacker,
        skillItem,
        difficultyKey: decl.difficultyKey,
        manualMod: decl.manualMod,
        useSpecialization: allowSpec && decl.useSpec
      });
      data.attacker.tn = tn;
      skillRollDebug("opposed attacker TN", { finalTN: tn.finalTN, breakdown: tn.breakdown });

      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: tn.finalTN, allowLucky: true, allowUnlucky: true });

      skillRollDebug("opposed attacker result", { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, critS: res.isCriticalSuccess, critF: res.isCriticalFailure });

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        flavor: `${data.attacker.skillLabel} — Opposed Skill (Actor)`,
        flags: { uesrpg: { rollRequest: request }, "uesrpg-3ev4": { rollRequest: request } },
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
      }

      await _updateCard(message, data);
      return;
    }

    if (action === "defender-roll") {
      if (data.defender.result) return;
      if (!requireUserCanRollActor(game.user, defender, { message: "You do not have permission to roll for the target actor." })) return;
      const skills = _listSkills(defender);
      if (!skills.length) {
        ui.notifications.warn("Target actor has no skills to roll.");
        return;
      }

      const last = _getLastSkillRollOptions();
      const perActorLastSkill = last?.lastSkillUuidByActor?.[defender.uuid] ?? null;

      // Default selection: same-named skill if present, else last-used on this actor, else first.
      const wantedName = String(data.attacker.skillLabel ?? "").trim().toLowerCase();
      const sameName = skills.find(s => String(s.name).trim().toLowerCase() === wantedName) ?? null;
      const selectedSkillUuid = sameName?.uuid ?? perActorLastSkill ?? skills[0].uuid;

      const defaults = normalizeSkillRollOptions(last, { difficultyKey: "average", manualMod: 0, useSpec: false });

      let decl = null;
      const quick = Boolean(event?.shiftKey) && game.settings.get("uesrpg-3ev4", "skillRollQuickShift");
      if (quick) {
        decl = { skillUuid: selectedSkillUuid, difficultyKey: defaults.difficultyKey, manualMod: defaults.manualMod, useSpec: defaults.useSpec };
      } else {
        decl = await _skillRollDialog({
          title: `Oppose — Choose Skill`,
          showSkillSelect: true,
          skills,
          selectedSkillUuid,
          allowSpecialization: true,
          defaultUseSpec: defaults.useSpec,
          defaultDifficultyKey: defaults.difficultyKey,
          defaultManualMod: defaults.manualMod
        });
      }
      if (!decl) return;


      const defSkill = _findSkillByUuid(defender, decl.skillUuid);
      if (!defSkill) {
        ui.notifications.warn("Selected target skill could not be found.");
        return;
      }

      const request = buildSkillRollRequest({
        actor: defender,
        skillItem: defSkill,
        targetToken: aToken,
        options: { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec) },
        context: { source: "chat", quick, messageId: message.id, groupId: data.context?.groupId ?? null }
      });
      const v = validateSkillRollRequest(request);
      if (!v.ok) {
        ui.notifications.warn(v.error || "Invalid skill roll request.");
        return;
      }
      skillRollDebug("opposed defender request", request);

      data.defender.skillUuid = defSkill.uuid;
      data.defender.skillLabel = defSkill.name;
      data.defender.declared = { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod, useSpec: Boolean(decl.useSpec) };
      data.defender.request = request;
      await _setLastSkillRollOptions(_mergeLastSkillRollOptions({
        difficultyKey: decl.difficultyKey,
        manualMod: decl.manualMod,
        useSpec: Boolean(decl.useSpec),
        lastSkillUuidByActor: { [defender.uuid]: defSkill.uuid }
      }));

      const allowSpec = _hasSpecializations(defSkill);
      const tn = computeSkillTN({
        actor: defender,
        skillItem: defSkill,
        difficultyKey: decl.difficultyKey,
        manualMod: decl.manualMod,
        useSpecialization: allowSpec && decl.useSpec
      });
      data.defender.tn = tn;
      skillRollDebug("opposed defender TN", { finalTN: tn.finalTN, breakdown: tn.breakdown });

      const res = await doTestRoll(defender, { rollFormula: "1d100", target: tn.finalTN, allowLucky: true, allowUnlucky: true });

      skillRollDebug("opposed defender result", { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, critS: res.isCriticalSuccess, critF: res.isCriticalFailure });

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        flavor: `${data.defender.skillLabel} — Opposed Skill (Target)`,
        flags: { uesrpg: { rollRequest: request }, "uesrpg-3ev4": { rollRequest: request } },
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
