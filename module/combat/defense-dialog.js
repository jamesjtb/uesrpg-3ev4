/**
 * module/combat/defense-dialog.js
 * Defense selection dialog for opposed rolls.
 *
 * Second-order pass:
 * - Dynamic defense option generation (equipped shield/weapon, combat style, evade)
 * - Basic filtering for ranged vs melee contexts
 * - Returns a stable payload: { defenseType, label, skill, itemUuid }
 *
 * Foundry V13 note:
 * - Use Dialog.wait(...) for async result.
 */

export class DefenseDialog extends Dialog {
  /**
   * Show a defense selection dialog and resolve with chosen defense info.
   * @param {Actor} defender
   * @param {object} context
   * @param {boolean} [context.isRanged=false] - Whether the incoming attack is ranged.
   * @param {boolean} [context.allowParryVsRanged=false]
   * @param {boolean} [context.allowBlockVsRanged=true]
   * @param {boolean} [context.allowCounterAttackVsRanged=false]
   */
  static async show(defender, context = {}) {
    const { defenseOptions, content } = DefenseDialog._build(defender, context);

    const result = await Dialog.wait({
      title: `${defender?.name ?? "Defender"} - Choose Defense`,
      content,
      buttons: {
        defend: {
          label: "Defend",
          callback: (html) => {
            const choice = html.find('input[name="defenseType"]:checked').val();
            const opt = defenseOptions[choice];
            return {
              defenseType: choice,
              label: opt?.label ?? "Defense",
              skill: Number(opt?.skill ?? 0),
              itemUuid: opt?.itemUuid ?? null
            };
          }
        },
        none: {
          label: "No Defense",
          callback: () => ({ defenseType: "none", label: "No Defense", skill: 0, itemUuid: null })
        }
      },
      default: "defend"
    });

    return result ?? { defenseType: "none", label: "No Defense", skill: 0, itemUuid: null };
  }

  static _build(defender, context = {}) {
    const isRanged = Boolean(context.isRanged);
    const allowParryVsRanged = Boolean(context.allowParryVsRanged);
    const allowBlockVsRanged = context.allowBlockVsRanged !== false; // default true
    const allowCounterAttackVsRanged = Boolean(context.allowCounterAttackVsRanged);

    const asNumber = (v) => {
      if (v == null) return 0;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const m = String(v).match(/-?\d+(?:\.\d+)?/);
      return m ? Number(m[0]) : 0;
    };

    const getItemByName = (name) => defender?.items?.find(i => (i?.name ?? "").trim().toLowerCase() === name.trim().toLowerCase()) ?? null;

    const getItemSkillValue = (name) => {
      const item = getItemByName(name);
      return asNumber(item?.system?.value ?? item?.system?.total ?? item?.system?.tn ?? 0);
    };

    const agi = asNumber(defender?.system?.characteristics?.agi?.total ?? defender?.system?.characteristics?.agi?.value ?? 0);
    const str = asNumber(defender?.system?.characteristics?.str?.total ?? defender?.system?.characteristics?.str?.value ?? 0);

    // Equipped shield?
    const shield = defender?.items?.find(i => i.type === "shield" && (i.system?.equipped || i.system?.equippped)) ?? null; // 'equippped' typo exists in template.json
    const hasShield = Boolean(shield);

    // Equipped melee weapon for parry?
    const equippedWeapons = defender?.items?.filter(i => i.type === "weapon" && (i.system?.equipped || i.system?.equippped)) ?? [];
    const parryWeapon = equippedWeapons[0] ?? null;

    // Combat Style item (if your system stores it as an item)
    const combatStyle = defender?.items?.find(i => i.type === "combatStyle" && (i.system?.equipped || i.system?.equippped || true)) ?? null;
    const combatStyleValue = asNumber(combatStyle?.system?.value ?? combatStyle?.system?.total ?? defender?.system?.combat?.total ?? defender?.system?.combat?.value ?? 0);

    // Talent gating example for Counter-Attack
    const hasCounterAttackTalent = Boolean(defender?.items?.find(i => (i.type === "talent" || i.type === "trait") && (i.name ?? "").toLowerCase().includes("counter")));

    const options = {};

    // Evade is always available.
    options.evade = {
      label: "Evade",
      skill: getItemSkillValue("Evade") || agi,
      description: "Dodge the attack (AGI)",
      itemUuid: getItemByName("Evade")?.uuid ?? null,
      disabled: false
    };

    // Block requires a shield; allow vs ranged depending on context.
    options.block = {
      label: "Block (Shield)",
      skill: (getItemSkillValue("Block") || str),
      description: "Block with a shield (STR)",
      itemUuid: shield?.uuid ?? null,
      disabled: !hasShield || (isRanged && !allowBlockVsRanged)
    };

    // Parry requires a melee weapon or combat style; disallow vs ranged by default.
    options.parry = {
      label: "Parry",
      skill: (getItemSkillValue("Combat Style") || combatStyleValue || Math.max(str, agi)),
      description: "Parry with melee weapon (STR/AGI)",
      itemUuid: (getItemByName("Combat Style")?.uuid ?? combatStyle?.uuid ?? parryWeapon?.uuid ?? null),
      disabled: (isRanged && !allowParryVsRanged)
    };

    // Counter-Attack (optional gating by talent); disallow vs ranged by default.
    options.counterAttack = {
      label: "Counter-Attack",
      skill: (getItemSkillValue("Combat Style") || combatStyleValue || Math.max(str, agi)),
      description: "Counter-attack (if allowed by rules/talent)",
      itemUuid: (getItemByName("Combat Style")?.uuid ?? combatStyle?.uuid ?? null),
      disabled: (!hasCounterAttackTalent) || (isRanged && !allowCounterAttackVsRanged)
    };

    const optionListHtml = Object.entries(options).map(([key, opt]) => {
      const disabled = opt.disabled ? "disabled" : "";
      const checked = key === "evade" ? "checked" : "";
      return `
        <label style="display:block; margin: 6px 0; opacity:${opt.disabled ? 0.5 : 1}">
          <input type="radio" name="defenseType" value="${key}" ${checked} ${disabled}/>
          <b>${opt.label}</b> — TN: ${Number(opt.skill ?? 0)}
          <div style="font-size: 0.9em; opacity: 0.85; margin-left: 18px;">${opt.description ?? ""}</div>
        </label>
      `;
    }).join("");

    const content = `
      <form>
        <p>Select a defense option for <b>${defender?.name ?? "Defender"}</b>.</p>
        ${optionListHtml}
      </form>
    `;

    return { defenseOptions: options, content };
  }
}
