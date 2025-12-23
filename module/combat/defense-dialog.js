/**
 * Defense selection dialog for opposed rolls.
 *
 * Foundry V13 note:
 * - Dialog button callback return values are NOT passed to the `close` handler.
 * - Use Dialog.wait(...) to receive the callback return value as the resolved Promise value.
 */
export class DefenseDialog extends Dialog {
  constructor(defender, options = {}) {
    // Legacy constructor kept for backwards compatibility (some code may still instantiate directly).
    // Prefer DefenseDialog.show(defender) which is V13-safe.
    const { defenseOptions, content } = DefenseDialog._build(defender);

    super({
      title: `${defender?.name ?? "Defender"} - Choose Defense`,
      content,
      buttons: {
        defend: {
          label: "Defend",
          callback: (html) => {
            const choice = html.find('input[name="defenseType"]:checked').val();
            return { defenseType: choice, label: defenseOptions[choice]?.label, skill: defenseOptions[choice]?.skill ?? 0 };
          }
        },
        noDefense: {
          label: "No Defense",
          callback: () => ({ defenseType: "none", label: "No Defense", skill: 0 })
        }
      },
      default: "defend"
    }, options);
  }

  /**
   * Build defense options and HTML content.
   * @param {Actor} defender
   */
  static _build(defender) {
    const getItemSkillValue = (name) => {
      const item = defender?.items?.find(i =>
        (i.type === "skill" || i.type === "combatStyle") &&
        i.name?.toLowerCase() === String(name).toLowerCase()
      );
      return asNumber(item?.system?.value ?? item?.system?.total ?? item?.system?.tn ?? 0);
    };

    const asNumber = (v) => {
      if (v == null) return 0;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const m = String(v).match(/-?\d+(?:\.\d+)?/);
      return m ? Number(m[0]) : 0;
    };

    const defenseOptions = {
      evade: {
        label: "Evade",
        skill: getItemSkillValue("Evade") || asNumber(defender?.system?.characteristics?.agi?.total ?? defender?.system?.characteristics?.agi?.value ?? 0),
        description: "Dodge the attack (AGI)"
      },
      block: {
        label: "Block (Shield)",
        skill: getItemSkillValue("Block") || asNumber(defender?.system?.characteristics?.str?.total ?? defender?.system?.characteristics?.str?.value ?? 0),
        description: "Block with shield (STR)",
        disabled: !defender?.items?.find(i => i.type === "shield" && i.system?.equipped)
      },
      parry: {
        label: "Parry",
        skill: getItemSkillValue("Combat Style") || asNumber(defender?.system?.combat?.value ?? defender?.system?.combat?.total ?? 0),
        description: "Parry with melee weapon (STR/AGI)"
      },
      counterAttack: {
        label: "Counter-Attack",
        skill: getItemSkillValue("Combat Style") || asNumber(defender?.system?.combat?.value ?? defender?.system?.combat?.total ?? 0),
        description: "Attack while defending"
      }
    };

    const content = `
      <form class="uesrpg-defense-dialog">
        <div class="form-group">
          <label>Choose Defense: </label>
          ${Object.entries(defenseOptions).map(([key, opt]) => `
            <div class="defense-option ${opt.disabled ? "disabled" : ""}">
              <input type="radio" name="defenseType" value="${key}"
                     ${opt.disabled ? "disabled" : ""}
                     ${key === "evade" ? "checked" : ""}>
              <label>
                <strong>${opt.label}</strong> (TN: ${opt.skill})
                <div class="defense-desc">${opt.description}</div>
              </label>
            </div>
          `).join("")}
        </div>
      </form>
    `;

    return { defenseOptions, content };
  }

  /**
   * Show the defense dialog and resolve with the selected defense object, or null if the dialog is closed.
   * @param {Actor} defender
   * @returns {Promise<{defenseType:string,label?:string,skill:number}|null>}
   */
  static async show(defender) {
    const { defenseOptions, content } = DefenseDialog._build(defender);

    const result = await Dialog.wait({
      title: `${defender?.name ?? "Defender"} - Choose Defense`,
      content,
      buttons: {
        defend: {
          label: "Defend",
          callback: (html) => {
            const choice = html.find('input[name="defenseType"]:checked').val();
            return { defenseType: choice, label: defenseOptions[choice]?.label, skill: defenseOptions[choice]?.skill ?? 0 };
          }
        },
        noDefense: {
          label: "No Defense",
          callback: () => ({ defenseType: "none", label: "No Defense", skill: 0 })
        }
      },
      default: "defend"
    }, {
      classes: ["uesrpg", "uesrpg-defense-dialog"],
      width: 680
    });

    // If closed via X/ESC, Dialog.wait resolves undefined/null.
    return result ?? null;
  }
}
