/**
 * module/combat/defense-dialog.js
 *
 * Defender selection dialog for opposed combat.
 *
 * Requirements satisfied:
 *  - Shows Evade / Block / Parry / Counter-Attack options.
 *  - Uses a compact 2x2 layout.
 *  - If defender has multiple combat styles, allows choosing which style to use (defaults sensibly).
 *  - Option TN values update live when the combat style selection changes.
 *  - RAW: Block is a Combat Style test using Strength (STR), not a separate Block skill.
 */

import { computeTN, listCombatStyles, hasEquippedShield } from "./tn.js";

function asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// NOTE: TN math is centralized in module/combat/tn.js (computeTN).
// This dialog only previews *base TNs* for each defense choice, and returns the user's selection.

export class DefenseDialog extends Dialog {
  constructor(defender, { attackerContext } = {}, resolveFn = null) {
    const styles = listCombatStyles(defender);
    const defaultStyleUuid = styles[0]?.uuid ?? "";

    const content = DefenseDialog._renderContent(defender, {
      styles,
      defaultStyleUuid,
      attackerContext
    });

    super({
      title: `${defender?.name ?? "Defender"} - Choose Defense`,
      content,
      buttons: {
        ok: {
          label: "Continue",
          callback: (html) => {
            const res = this._readSelection(html);
            // If invalid selection (e.g., missing style), keep dialog open.
            if (!res) return false;
            this._resolved = true;
            if (typeof this._resolveFn === "function") this._resolveFn(res);
            return true;
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => {
            this._resolved = true;
            if (typeof this._resolveFn === "function") this._resolveFn(null);
            return true;
          }
        }
      },
      default: "ok"
    }, {
      classes: ["uesrpg", "uesrpg-defense-dialog"],
      width: 520
    });

    this._defender = defender;
    this._styles = styles;
    this._defaultStyleUuid = defaultStyleUuid;
    this._resolveFn = resolveFn;
    this._resolved = false;
  }

  static _renderContent(defender, { styles, defaultStyleUuid }) {
    const styleSelect = (styles.length >= 2)
      ? `
        <div class="form-group">
          <label><b>Combat Style</b></label>
          <select name="styleUuid" style="width:100%;">
            ${styles.map(s => `<option value="${s.uuid}" ${s.uuid === defaultStyleUuid ? "selected" : ""}>${s.name}</option>`).join("\n")}
          </select>
        </div>`
      : (styles.length === 1)
        ? `<input type="hidden" name="styleUuid" value="${defaultStyleUuid}" />`
        : `<div class="form-group"><i>No Combat Style item found; Parry/Block/Counter-Attack will be unavailable.</i></div>`;

    // 2x2 layout; we update TN text live in activateListeners.
    return `
      <style>
  /* Force dialog footer buttons to be a single row, 2 columns */
  .dialog .dialog-buttons { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dialog .dialog-buttons button { width: 100%; }
</style>
      <form class="uesrpg-defense-dialog-form">
        ${styleSelect}

        <div class="uesrpg-defense-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;"><label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="parry" checked />
            <b>Parry</b> — TN <span class="tn" data-tn-for="parry">0</span><br/>
            <span class="hint">Parry (melee only)</span>
          </label>

<label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="block" />
            <b>Block</b> — TN <span class="tn" data-tn-for="block">0</span><br/>
            <span class="hint">Block with shield (Combat Style using STR)</span>
          </label>

<label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="evade" />
            <b>Evade</b> — TN <span class="tn" data-tn-for="evade">0</span><br/>
            <span class="hint">Dodge the attack (AGI)</span>
          </label>

<label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="counter" />
            <b>Counter-Attack</b> — TN <span class="tn" data-tn-for="counter">0</span><br/>
            <span class="hint">Strike while defending (melee only)</span>
          </label>
</div>

        <div class="form-group" style="margin-top:12px;">
          <label><b>Manual Modifier</b></label>
          <input name="manualMod" type="number" value="0" style="width:100%;" />
</div>
      </form>
    `;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._html = html;
    const styleSelect = html.find('select[name="styleUuid"]');
    if (styleSelect.length) {
      styleSelect.on("change", () => this._refreshTN(html));
    }
    this._refreshTN(html);
  }

  _getSelectedStyle(html) {
    const styleUuid = html.find('[name="styleUuid"]').val() ?? this._defaultStyleUuid;
    return this._styles.find(s => s.uuid === styleUuid) ?? null;
  }

  _refreshTN(html) {
    const style = this._getSelectedStyle(html);
    const styleUuid = style?.uuid ?? null;

    // Eligibility: Block requires an equipped shield.
    const shieldOk = hasEquippedShield(this._defender);
    const blockRadio = html.find('input[name="defenseType"][value="block"]');
    const blockLabel = blockRadio.closest("label.def-opt");
    if (blockRadio.length) {
      blockRadio.prop("disabled", !shieldOk);
      // Visually fade when illegal.
      blockLabel.css({ opacity: shieldOk ? 1 : 0.45, filter: shieldOk ? "" : "grayscale(0.2)" });
      // If currently selected but illegal, switch to Evade.
      if (!shieldOk && blockRadio.prop("checked")) {
        html.find('input[name="defenseType"][value="evade"]').prop("checked", true);
      }
    }

    const evadeTN = computeTN({ actor: this._defender, role: "defender", defenseType: "evade", manualMod: 0 }).finalTN;
    const parryTN = computeTN({ actor: this._defender, role: "defender", defenseType: "parry", styleUuid, manualMod: 0 }).finalTN;
    const counterTN = computeTN({ actor: this._defender, role: "defender", defenseType: "counter", styleUuid, manualMod: 0 }).finalTN;
    const blockTN = shieldOk
      ? computeTN({ actor: this._defender, role: "defender", defenseType: "block", styleUuid, manualMod: 0 }).finalTN
      : 0;

    const setTN = (k, v) => {
      html.find(`[data-tn-for="${k}"]`).text(String(asNumber(v)));
    };

    setTN("evade", evadeTN);
    setTN("parry", parryTN);
    setTN("counter", counterTN);
    setTN("block", blockTN);
  }

  _readSelection(html) {
    const rawMod = html.find('input[name="manualMod"]').val() ?? "0";
    const manualMod = Number.parseInt(String(rawMod), 10) || 0;

    const defenseType = html.find('input[name="defenseType"]:checked').val() ?? "evade";
    const style = this._getSelectedStyle(html);
    const styleUuid = style?.uuid ?? null;

    // Evade does not require a combat style.
    if (defenseType === "evade") return { defenseType: "evade", label: "Evade", manualMod };

    // Other defenses require a combat style.
    if (!styleUuid) {
      ui.notifications.warn("No combat style available for this defense.");
      return null;
    }

    // Eligibility guard: Block requires a shield.
    if (defenseType === "block" && !hasEquippedShield(this._defender)) {
      ui.notifications.warn("Block requires an equipped shield.");
      return null;
    }

    if (defenseType === "block") return { defenseType: "block", label: "Block", manualMod, styleUuid };
    if (defenseType === "parry") return { defenseType: "parry", label: "Parry", manualMod, styleUuid };
    if (defenseType === "counter") return { defenseType: "counter", label: "Counter-Attack", manualMod, styleUuid };
    return { defenseType: "evade", label: "Evade", manualMod };
  }

  static async show(defender, options = {}) {
    return await new Promise((resolve) => {
      const dlg = new DefenseDialog(defender, options, resolve);
      const _close = dlg.close.bind(dlg);
      dlg.close = async (...args) => {
        await _close(...args);
        // If user closes via X/ESC, resolve null.
        if (!dlg._resolved) resolve(null);
      };
      dlg.render(true);
    });
  }
}
