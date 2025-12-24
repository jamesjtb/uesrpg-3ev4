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

import { skillHelper, skillModHelper } from "../helpers/skillCalcHelper.js";

function asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function getCharTotal(actor, key) {
  return asNumber(actor?.system?.characteristics?.[key]?.total ?? actor?.system?.characteristics?.[key]?.value ?? 0);
}

function hasEquippedShield(actor) {
  // UESRPG shields are implemented as Armor items with a Block field (per your item sample).
  // We treat: type === "armor" AND equipped AND (system.block > 0 OR name contains "shield")
  return (actor?.items ?? []).some(i => {
    if (i.type !== "armor") return false;
    if (!i.system?.equipped) return false;
    const block = asNumber(i.system?.block ?? 0);
    if (block > 0) return true;
    return String(i.name ?? "").toLowerCase().includes("shield");
  });
}

function listCombatStyles(actor) {
  return (actor?.items ?? [])
    .filter(i => i.type === "combatStyle")
    .map(i => ({ id: i.id, uuid: i.uuid, name: i.name, item: i }));
}

function computeCombatStyleTN(styleItem) {
  // styleItem.system.value is already computed in prepareData with wound/fatigue and bonuses.
  return asNumber(styleItem?.system?.value ?? 0);
}

function computeBlockTN(defender, styleItem) {
  // RAW: Combat Style test using Strength.
  // We rebuild TN similarly to SimpleItem._prepareCombatStyleData but force baseCha=str.
  const woundPenalty = asNumber(defender?.system?.woundPenalty ?? 0);
  const fatiguePenalty = asNumber(defender?.system?.fatigue?.penalty ?? 0);

  const strTotal = getCharTotal(defender, "str");
  const styleBonus = asNumber(styleItem?.system?.bonus ?? 0);
  const miscValue = asNumber(styleItem?.system?.miscValue ?? 0);
  const itemChaBonus = asNumber(skillHelper(defender, "str") ?? 0);
  const itemSkillBonus = asNumber(skillModHelper(defender, styleItem?.name ?? "") ?? 0);

  let tn = strTotal + styleBonus + miscValue + itemChaBonus + itemSkillBonus + fatiguePenalty;
  if (defender?.system?.wounded) tn += woundPenalty;
  return tn;
}

function computeEvadeTN(defender) {
  // Prefer an Evade skill item if present; fallback to AGI.
  const evadeItem = (defender?.items ?? []).find(i => i.type === "skill" && String(i.name ?? "").toLowerCase() === "evade");
  const evadeTN = asNumber(evadeItem?.system?.value ?? 0);
  if (evadeTN) return evadeTN;
  // If there's no explicit evade skill, use AGI plus actor's normal penalties already baked into characteristics totals.
  // (Your system applies fatigue/wound to combatStyle items; characteristics totals remain raw, which is expected.)
  return getCharTotal(defender, "agi");
}

export class DefenseDialog extends Dialog {
  constructor(defender, { attackerContext } = {}, resolveFn = null) {
    const styles = listCombatStyles(defender);
    const hasStyles = styles.length > 0;
    const defaultStyle = styles[0]?.id ?? "";
    const shieldOk = hasEquippedShield(defender);

    const content = DefenseDialog._renderContent(defender, {
      styles,
      defaultStyle,
      shieldOk,
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
      default: "ok",
      close: () => {
        // Ensure Dialog.wait-like behavior: closing via X/ESC should resolve null cleanly.
        if (!this._resolved && typeof this._resolveFn === "function") this._resolveFn(null);
      }
    }, {
      classes: ["uesrpg", "uesrpg-defense-dialog"],
      width: 700
    });

    this._defender = defender;
    this._styles = styles;
    this._defaultStyle = defaultStyle;
    this._shieldOk = shieldOk;
    this._resolveFn = resolveFn;
    this._resolved = false;
  }

  static _renderContent(defender, { styles, defaultStyle, shieldOk }) {
    const styleSelect = (styles.length >= 2)
      ? `
        <div class="form-group">
          <label><b>Combat Style</b></label>
          <select name="styleId" style="width:100%;">
            ${styles.map(s => `<option value="${s.id}" ${s.id === defaultStyle ? "selected" : ""}>${s.name}</option>`).join("\n")}
          </select>
        </div>`
      : (styles.length === 1)
        ? `<input type="hidden" name="styleId" value="${defaultStyle}" />`
        : `<div class="form-group"><i>No Combat Style item found; Parry/Block/Counter-Attack will be unavailable.</i></div>`;

    // 2x2 layout; we update TN text live in activateListeners.
    return `
      <form class="uesrpg-defense-dialog-form">
        ${styleSelect}

        <div class="uesrpg-defense-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="evade" checked />
            <b>Evade</b> — TN <span class="tn" data-tn-for="evade">0</span><br/>
            <span class="hint">Dodge the attack (AGI)</span>
          </label>

          <label class="def-opt ${shieldOk ? "" : "disabled"}" style="border:1px solid #888; padding:10px; border-radius:6px; opacity:${shieldOk ? "1" : "0.5"};">
            <input type="radio" name="defenseType" value="block" ${shieldOk ? "" : "disabled"} />
            <b>Block</b> — TN <span class="tn" data-tn-for="block">0</span>${shieldOk ? "" : " (unavailable)"}<br/>
            <span class="hint">Block with shield (Combat Style using STR)</span>
          </label>

          <label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="parry" />
            <b>Parry</b> — TN <span class="tn" data-tn-for="parry">0</span><br/>
            <span class="hint">Parry (melee only)</span>
          </label>

          <label class="def-opt" style="border:1px solid #888; padding:10px; border-radius:6px;">
            <input type="radio" name="defenseType" value="counter" />
            <b>Counter-Attack</b> — TN <span class="tn" data-tn-for="counter">0</span><br/>
            <span class="hint">Strike while defending (melee only)</span>
          </label>
        </div>

        <div class="form-group" style="margin-top:12px;">
          <label><b>Manual Modifier</b> (TN adjustment, e.g. -20 / +10)</label>
          <input name="manualMod" type="number" value="0" style="width:100%;" />
          <div style="font-size:12px; opacity:0.75; margin-top:4px;">Applied to the chosen defense TN before rolling.</div>
        </div>
      </form>
    `;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._html = html;
    const styleSelect = html.find('select[name="styleId"]');
    if (styleSelect.length) {
      styleSelect.on("change", () => this._refreshTN(html));
    }
    this._refreshTN(html);
  }

  _getSelectedStyle(html) {
    const styleId = html.find('[name="styleId"]').val() ?? this._defaultStyle;
    return this._styles.find(s => s.id === styleId)?.item ?? null;
  }

  _refreshTN(html) {
    const styleItem = this._getSelectedStyle(html);

    const evadeTN = computeEvadeTN(this._defender);
    const parryTN = styleItem ? computeCombatStyleTN(styleItem) : 0;
    const counterTN = styleItem ? computeCombatStyleTN(styleItem) : 0;
    const blockTN = (styleItem && this._shieldOk) ? computeBlockTN(this._defender, styleItem) : 0;

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
    const styleItem = this._getSelectedStyle(html);

    // Compute TN based on current selection (must match what is shown).
    if (defenseType === "evade") {
      const baseTN = computeEvadeTN(this._defender);
      return { defenseType: "evade", label: "Evade", baseTN, manualMod, tn: baseTN + manualMod };
    }

    if (!styleItem) {
      ui.notifications.warn("No combat style available for this defense.");
      return null;
    }

    if (defenseType === "block") {
      if (!this._shieldOk) {
        ui.notifications.warn("Block is unavailable: no equipped shield.");
        return null;
      }
      const baseTN = computeBlockTN(this._defender, styleItem);
      return { defenseType: "block", label: "Block", baseTN, manualMod, tn: baseTN + manualMod, styleId: styleItem.id };
    }

    if (defenseType === "parry") {
      const baseTN = computeCombatStyleTN(styleItem);
      return { defenseType: "parry", label: "Parry", baseTN, manualMod, tn: baseTN + manualMod, styleId: styleItem.id };
    }

    if (defenseType === "counter") {
      const baseTN = computeCombatStyleTN(styleItem);
      return { defenseType: "counter", label: "Counter-Attack", baseTN, manualMod, tn: baseTN + manualMod, styleId: styleItem.id };
    }

    const baseTN = computeEvadeTN(this._defender);
    return { defenseType: "evade", label: "Evade", baseTN, manualMod, tn: baseTN + manualMod };
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
