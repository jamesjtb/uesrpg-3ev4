/**
 * src/core/combat/defense-dialog.js
 *
 * Defender selection dialog for opposed combat.
 *
 * Design goals:
 *  - Deterministic, no inline JS.
 *  - Provides Evade / Parry / Block / Counter-Attack selection.
 *  - Optional Combat Style selection (Parry/Block/Counter) when available.
 *  - Provides Manual Modifier and Combat Circumstance Modifiers inputs.
 *  - Live TN previews for each defense option using module/combat/tn.js computeTN().
 *
 * NOTE: This system does not use ApplicationV2.
 */

import { computeTN, listCombatStyles, hasEquippedShield } from "./tn.js";
import { hasCondition } from "../conditions/condition-engine.js";
import { computeDefenseAvailability, normalizeDefenseType } from "./defense-options.js";

function asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export class DefenseDialog extends Dialog {
  /**
   * @param {Actor} defender
   * @param {object} options
   * @param {Function} resolveFn
   */
  constructor(defender, options = {}, resolveFn) {
    const styles = listCombatStyles(defender);
    const defaultStyleUuid = options.defaultStyleUuid ?? styles?.[0]?.uuid ?? null;
    const requestedDefaultDefenseType = options.defaultDefenseType ?? "evade";
    const defaultManualMod = Number(options.defaultManualMod ?? 0) || 0;
    const defaultCircMod = Number(options.defaultCircumstanceMod ?? 0) || 0;

    const shieldOk = hasEquippedShield(defender);

    const hasBlinded = hasCondition(defender, "blinded");
    const hasDeafened = hasCondition(defender, "deafened");
    const defaultApplyBlinded = (options.defaultApplyBlinded ?? true);
    const defaultApplyDeafened = (options.defaultApplyDeafened ?? true);

    const attackerWeaponTraits = options.attackerWeaponTraits ?? null;
    const defenderHasSmallWeapon = !!(options.defenderHasSmallWeapon);
    const attackMode = String(options?.context?.attackMode ?? options?.attackMode ?? "melee");
    const allowedDefenseTypes = Array.isArray(options.allowedDefenseTypes) ? options.allowedDefenseTypes : null;

    const availability = computeDefenseAvailability({
      attackMode,
      attackerWeaponTraits,
      defenderHasSmallWeapon,
      defenderHasShield: shieldOk,
      allowedDefenseTypes
    });

    const defaultDefenseType = normalizeDefenseType(requestedDefaultDefenseType, availability, "evade");

    const content = DefenseDialog._renderContent({
      styles,
      defaultStyleUuid,
      defaultDefenseType,
      defaultManualMod,
      defaultCircMod,
      shieldOk,
      availability,
      hasBlinded,
      hasDeafened,
      defaultApplyBlinded,
      defaultApplyDeafened
    });

    super({
      title: "Defender Response",
      content,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-check"></i>',
          label: "Confirm",
          callback: (html) => resolveFn(this._readSelection(html))
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolveFn(null)
        }
      },
      default: "confirm",
      close: () => resolveFn(null)
    }, options);

    this._defender = defender;
    this._styles = styles;
    this._context = options.context ?? null;
    this._attackMode = attackMode;
    this._attackerWeaponTraits = attackerWeaponTraits;
    this._defenderHasSmallWeapon = defenderHasSmallWeapon;
    this._html = null;
  }

  static _renderContent({
    styles,
    defaultStyleUuid,
    defaultDefenseType,
    defaultManualMod,
    defaultCircMod,
    shieldOk,
    availability,
    hasBlinded,
    hasDeafened,
    defaultApplyBlinded,
    defaultApplyDeafened
  }) {
    const styleOptions = styles
      .map(s => `<option value="${s.uuid}" ${s.uuid === defaultStyleUuid ? "selected" : ""}>${Handlebars.escapeExpression(s.name)}</option>`)
      .join("");

    const showStyle = styles.length > 0;

    const allowed = availability?.allowed ?? { evade: true, parry: true, block: Boolean(shieldOk), counter: true };
    const reasons = availability?.reasons ?? { evade: [], parry: [], block: [], counter: [] };
    const gates = availability?.gates ?? {
      isRangedAttack: false,
      attackerHasFlail: false,
      attackerHasEntangling: false,
      smallVsTwoHandedGate: false,
      shieldOk: Boolean(shieldOk)
    };

    const blockDisabled = allowed.block ? "" : "disabled";
    const parryDisabled = allowed.parry ? "" : "disabled";
    const counterDisabled = allowed.counter ? "" : "disabled";

    const notes = [];
    if (gates.isRangedAttack) notes.push(`<p class="notes" style="margin:6px 0 0 0;"><b>Ranged:</b> Ranged attacks cannot be parried or counter-attacked.</p>`);
    if (gates.attackerHasFlail) notes.push(`<p class="notes" style="margin:6px 0 0 0;"><b>Flail:</b> Attacks with a flail cannot be parried or counter-attacked.</p>`);
    if (gates.attackerHasEntangling) {
      notes.push(`<p class="notes" style="margin:6px 0 0 0;"><b>Entangling:</b> Attacks with an entangling weapon cannot be parried or blocked.</p>`);
    }
    if (gates.smallVsTwoHandedGate) notes.push(`<p class="notes" style="margin:6px 0 0 0;"><b>Small:</b> A Small weapon cannot be used to Parry or Counter-Attack against a two-handed weapon.</p>`);

    const extraNotes = notes.join("");

    const sensoryRow = (hasBlinded || hasDeafened) ? `
  <div class="form-group" style="margin-top:8px;">
    <label><b>Sensory Impairment</b></label>
    <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
      ${hasBlinded ? `<label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" name="applyBlinded" ${defaultApplyBlinded ? "checked" : ""} />
        <span>Apply Blinded (-30, sight-based)</span>
      </label>` : ``}
      ${hasDeafened ? `<label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" name="applyDeafened" ${defaultApplyDeafened ? "checked" : ""} />
        <span>Apply Deafened (-30, hearing-based)</span>
      </label>` : ``}
    </div>
    <p class="notes">Check only if this defense relies primarily on the impaired sense.</p>
  </div>` : ``;


    return `
<form class="uesrpg defense-dialog">
  <div class="form-group">
    <label><b>Manual Modifier</b></label>
    <input type="number" name="manualMod" value="${asNumber(defaultManualMod)}" step="1" />
  </div>

  <div class="form-group">
    <label><b>Combat Circumstance Modifiers</b></label>
    <select name="circMod" style="width: 100%;">
      <option value="0" ${Number(defaultCircMod) === 0 ? "selected" : ""}>—</option>
      <option value="-10" ${Number(defaultCircMod) === -10 ? "selected" : ""}>Minor Disadvantage (-10)</option>
      <option value="-20" ${Number(defaultCircMod) === -20 ? "selected" : ""}>Disadvantage (-20)</option>
      <option value="-30" ${Number(defaultCircMod) === -30 ? "selected" : ""}>Major Disadvantage (-30)</option>
    </select>
  </div>

  ${sensoryRow}

  ${showStyle ? `
  <div class="form-group">
    <label><b>Combat Style</b></label>
    <select name="styleUuid" style="width: 100%;">
      ${styleOptions}
    </select>
    <p class="notes">Used for Parry, Block, and Counter-Attack.</p>
  </div>` : ``}

  <hr/>

  <div class="defense-grid" style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="evade" ${defaultDefenseType === "evade" ? "checked" : ""}/> <b>Evade</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="evade">—</span></span>
      </div>
    </label>

    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px; opacity:${parryDisabled ? "0.45" : "1"};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="parry" ${defaultDefenseType === "parry" ? "checked" : ""} ${parryDisabled}/> <b>Parry</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="parry">—</span></span>
      </div>
      ${parryDisabled ? `<p class="notes">Not available for this attack.</p>` : ``}
    </label>

    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px; opacity:${blockDisabled ? "0.45" : "1"};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="block" ${defaultDefenseType === "block" ? "checked" : ""} ${blockDisabled}/> <b>Block</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="block">—</span></span>
      </div>
      ${blockDisabled ? `<p class="notes">${Handlebars.escapeExpression(String(reasons?.block?.[0] ?? "Not available for this attack."))}</p>` : ``}
    </label>

    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px; opacity:${counterDisabled ? "0.45" : "1"};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="counter" ${defaultDefenseType === "counter" ? "checked" : ""} ${counterDisabled}/> <b>Counter-Attack</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="counter">—</span></span>
      </div>
      ${counterDisabled ? `<p class="notes">Not available for this attack.</p>` : ``}
    </label>
  </div>

  ${extraNotes}
</form>`;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._html = html;

    // If the default defense type is not allowed, force a safe fallback.
    const shieldOk = hasEquippedShield(this._defender);
    const availability = computeDefenseAvailability({
      attackMode: this._attackMode,
      attackerWeaponTraits: this._attackerWeaponTraits,
      defenderHasSmallWeapon: this._defenderHasSmallWeapon,
      defenderHasShield: shieldOk
    });
    const checked = html.find('input[name="defenseType"]:checked');
    const v = String(checked.val() ?? "evade");
    const normalized = normalizeDefenseType(v, availability, "evade");
    if (normalized !== v) {
      html.find(`input[name="defenseType"][value="${normalized}"]`).prop("checked", true);
    }

    const styleSelect = html.find('select[name="styleUuid"]');
    if (styleSelect.length) styleSelect.on("change", () => this._refreshTN(html));

    const manualInput = html.find('input[name="manualMod"]');
    if (manualInput.length) manualInput.on("change", () => this._refreshTN(html));

    const circSelect = html.find('select[name="circMod"]');
    if (circSelect.length) circSelect.on("change", () => this._refreshTN(html));

    const blindCb = html.find('input[name="applyBlinded"]');
    if (blindCb.length) blindCb.on("change", () => this._refreshTN(html));
    const deafCb = html.find('input[name="applyDeafened"]');
    if (deafCb.length) deafCb.on("change", () => this._refreshTN(html));

    const radios = html.find('input[name="defenseType"]');
    if (radios.length) radios.on("change", () => this._refreshTN(html));

    this._refreshTN(html);
  }

  _getSelectedStyleUuid(html) {
    const styleSelect = html.find('select[name="styleUuid"]');
    if (!styleSelect.length) return null;
    const val = styleSelect.val();
    return val ? String(val) : null;
  }

  _refreshTN(html) {
    const shieldOk = hasEquippedShield(this._defender);
    const availability = computeDefenseAvailability({
      attackMode: this._attackMode,
      attackerWeaponTraits: this._attackerWeaponTraits,
      defenderHasSmallWeapon: this._defenderHasSmallWeapon,
      defenderHasShield: shieldOk
    });

    const blockRadio = html.find('input[name="defenseType"][value="block"]');
    if (blockRadio.length) blockRadio.prop("disabled", !availability.allowed.block);

    const parryRadio = html.find('input[name="defenseType"][value="parry"]');
    if (parryRadio.length) parryRadio.prop("disabled", !availability.allowed.parry);

    const counterRadio = html.find('input[name="defenseType"][value="counter"]');
    if (counterRadio.length) counterRadio.prop("disabled", !availability.allowed.counter);

    // If the currently selected option becomes illegal (equipment/context change), force fallback.
    const checked = html.find('input[name="defenseType"]:checked');
    const v = String(checked.val() ?? "evade");
    const normalized = normalizeDefenseType(v, availability, "evade");
    if (normalized !== v) {
      html.find(`input[name="defenseType"][value="${normalized}"]`).prop("checked", true);
    }

    const rawMod = html.find('input[name="manualMod"]').val() ?? "0";
    const manualMod = Number.parseInt(String(rawMod), 10) || 0;

    const rawCirc = html.find('select[name="circMod"]').val() ?? "0";
    const circumstanceMod = Number.parseInt(String(rawCirc), 10) || 0;

    const applyBlinded = Boolean(html.find('input[name="applyBlinded"]').prop("checked"));
    const applyDeafened = Boolean(html.find('input[name="applyDeafened"]').prop("checked"));
    const situationalMods = [];
    if (applyBlinded && hasCondition(this._defender, "blinded")) situationalMods.push({ label: "Blinded (sight)", value: -30, source: "condition" });
    if (applyDeafened && hasCondition(this._defender, "deafened")) situationalMods.push({ label: "Deafened (hearing)", value: -30, source: "condition" });

    const styleUuid = this._getSelectedStyleUuid(html);

    const ctx = this._context ?? undefined;
    const evadeTN = computeTN({ actor: this._defender, role: "defender", defenseType: "evade", manualMod, circumstanceMod, situationalMods, context: ctx }).finalTN;
    const parryTN = computeTN({ actor: this._defender, role: "defender", defenseType: "parry", styleUuid, manualMod, circumstanceMod, situationalMods, context: ctx }).finalTN;
    const counterTN = computeTN({ actor: this._defender, role: "defender", defenseType: "counter", styleUuid, manualMod, circumstanceMod, situationalMods, context: ctx }).finalTN;
    const blockTN = availability.allowed.block
      ? computeTN({ actor: this._defender, role: "defender", defenseType: "block", styleUuid, manualMod, circumstanceMod, situationalMods, context: ctx }).finalTN
      : 0;

    const setTN = (k, v) => html.find(`[data-tn-for="${k}"]`).text(String(asNumber(v)));
    setTN("evade", evadeTN);
    setTN("parry", parryTN);
    setTN("counter", counterTN);
    setTN("block", blockTN);
  }

  _readSelection(html) {
    const rawMod = html.find('input[name="manualMod"]').val() ?? "0";
    const manualMod = Number.parseInt(String(rawMod), 10) || 0;

    const rawCirc = html.find('select[name="circMod"]').val() ?? "0";
    const circumstanceMod = Number.parseInt(String(rawCirc), 10) || 0;

    const applyBlinded = Boolean(html.find('input[name="applyBlinded"]').prop("checked"));
    const applyDeafened = Boolean(html.find('input[name="applyDeafened"]').prop("checked"));

    const rawDefenseType = String(html.find('input[name="defenseType"]:checked').val() ?? "evade");
    const shieldOk = hasEquippedShield(this._defender);
    const availability = computeDefenseAvailability({
      attackMode: this._attackMode,
      attackerWeaponTraits: this._attackerWeaponTraits,
      defenderHasSmallWeapon: this._defenderHasSmallWeapon,
      defenderHasShield: shieldOk
    });
    const defenseType = normalizeDefenseType(rawDefenseType, availability, "evade");
    const styleUuid = this._getSelectedStyleUuid(html);

    if (defenseType === "evade") return { defenseType: "evade", label: "Evade", manualMod, circumstanceMod, styleUuid: null, applyBlinded, applyDeafened };
    if (defenseType === "block") return { defenseType: "block", label: "Block", manualMod, circumstanceMod, styleUuid, applyBlinded, applyDeafened };
    if (defenseType === "parry") return { defenseType: "parry", label: "Parry", manualMod, circumstanceMod, styleUuid, applyBlinded, applyDeafened };
    if (defenseType === "counter") return { defenseType: "counter", label: "Counter-Attack", manualMod, circumstanceMod, styleUuid, applyBlinded, applyDeafened };

    return { defenseType: "evade", label: "Evade", manualMod, circumstanceMod, styleUuid: null, applyBlinded, applyDeafened };
  }

  static async show(defender, options = {}) {
    return await new Promise((resolve) => {
      const dlg = new DefenseDialog(defender, options, resolve);
      dlg.render(true);
    });
  }
}
