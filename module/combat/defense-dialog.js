/**
 * module/combat/defense-dialog.js
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
    const defaultDefenseType = options.defaultDefenseType ?? "evade";
    const defaultManualMod = Number(options.defaultManualMod ?? 0) || 0;
    const defaultCircMod = Number(options.defaultCircumstanceMod ?? 0) || 0;

    const shieldOk = hasEquippedShield(defender);

    const content = DefenseDialog._renderContent({
      styles,
      defaultStyleUuid,
      defaultDefenseType,
      defaultManualMod,
      defaultCircMod,
      shieldOk
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
    this._html = null;
  }

  static _renderContent({
    styles,
    defaultStyleUuid,
    defaultDefenseType,
    defaultManualMod,
    defaultCircMod,
    shieldOk
  }) {
    const styleOptions = styles
      .map(s => `<option value="${s.uuid}" ${s.uuid === defaultStyleUuid ? "selected" : ""}>${Handlebars.escapeExpression(s.name)}</option>`)
      .join("");

    const showStyle = styles.length > 0;

    const blockDisabled = shieldOk ? "" : "disabled";

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

    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="parry" ${defaultDefenseType === "parry" ? "checked" : ""}/> <b>Parry</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="parry">—</span></span>
      </div>
    </label>

    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px; opacity:${shieldOk ? "1" : "0.45"};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="block" ${defaultDefenseType === "block" ? "checked" : ""} ${blockDisabled}/> <b>Block</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="block">—</span></span>
      </div>
      ${shieldOk ? "" : `<p class="notes">Requires an equipped shield.</p>`}
    </label>

    <label class="def-opt" style="border:1px solid #9993; border-radius:8px; padding:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><input type="radio" name="defenseType" value="counter" ${defaultDefenseType === "counter" ? "checked" : ""}/> <b>Counter-Attack</b></span>
        <span class="tn-pill" style="font-variant-numeric: tabular-nums;">TN: <span data-tn-for="counter">—</span></span>
      </div>
    </label>
  </div>
</form>`;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._html = html;

    const styleSelect = html.find('select[name="styleUuid"]');
    if (styleSelect.length) styleSelect.on("change", () => this._refreshTN(html));

    const manualInput = html.find('input[name="manualMod"]');
    if (manualInput.length) manualInput.on("change", () => this._refreshTN(html));

    const circSelect = html.find('select[name="circMod"]');
    if (circSelect.length) circSelect.on("change", () => this._refreshTN(html));

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

    const blockRadio = html.find('input[name="defenseType"][value="block"]');
    if (blockRadio.length) {
      blockRadio.prop("disabled", !shieldOk);
      if (!shieldOk && blockRadio.prop("checked")) {
        html.find('input[name="defenseType"][value="evade"]').prop("checked", true);
      }
    }

    const rawMod = html.find('input[name="manualMod"]').val() ?? "0";
    const manualMod = Number.parseInt(String(rawMod), 10) || 0;

    const rawCirc = html.find('select[name="circMod"]').val() ?? "0";
    const circumstanceMod = Number.parseInt(String(rawCirc), 10) || 0;

    const styleUuid = this._getSelectedStyleUuid(html);

    const evadeTN = computeTN({ actor: this._defender, role: "defender", defenseType: "evade", manualMod, circumstanceMod }).finalTN;
    const parryTN = computeTN({ actor: this._defender, role: "defender", defenseType: "parry", styleUuid, manualMod, circumstanceMod }).finalTN;
    const counterTN = computeTN({ actor: this._defender, role: "defender", defenseType: "counter", styleUuid, manualMod, circumstanceMod }).finalTN;
    const blockTN = shieldOk
      ? computeTN({ actor: this._defender, role: "defender", defenseType: "block", styleUuid, manualMod, circumstanceMod }).finalTN
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

    const defenseType = String(html.find('input[name="defenseType"]:checked').val() ?? "evade");
    const shieldOk = hasEquippedShield(this._defender);
    const styleUuid = this._getSelectedStyleUuid(html);

    if (defenseType === "block" && !shieldOk) {
      ui.notifications.warn("Block requires an equipped shield.");
      return null;
    }

    if (defenseType === "evade") return { defenseType: "evade", label: "Evade", manualMod, circumstanceMod, styleUuid: null };
    if (defenseType === "block") return { defenseType: "block", label: "Block", manualMod, circumstanceMod, styleUuid };
    if (defenseType === "parry") return { defenseType: "parry", label: "Parry", manualMod, circumstanceMod, styleUuid };
    if (defenseType === "counter") return { defenseType: "counter", label: "Counter-Attack", manualMod, circumstanceMod, styleUuid };

    return { defenseType: "evade", label: "Evade", manualMod, circumstanceMod, styleUuid: null };
  }

  static async show(defender, options = {}) {
    return await new Promise((resolve) => {
      const dlg = new DefenseDialog(defender, options, resolve);
      dlg.render(true);
    });
  }
}
