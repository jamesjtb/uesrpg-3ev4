/**
 * Defense selection dialog for opposed rolls
 */
export class DefenseDialog extends Dialog {
  constructor(defender, options = {}) {
    const defenseOptions = {
      evade: {
        label: "Evade",
        skill: defender.system?. skills?.evade?. value || 0,
        description:  "Dodge the attack (AGI)"
      },
      block: {
        label: "Block (Shield)",
        skill: defender.system?.skills?.block?.value || 0,
        description: "Block with shield (STR)",
        disabled: !defender.items. find(i => i.type === 'shield' && i.system?.equipped)
      },
      parry:  {
        label: "Parry",
        skill: defender. system?.combat?.value || 0,
        description:  "Parry with melee weapon (STR/AGI)"
      },
      counterAttack: {
        label:  "Counter-Attack",
        skill: defender.system?.combat?.value || 0,
        description:  "Attack while defending"
      }
    };

    const content = `
      <form class="uesrpg-defense-dialog">
        <div class="form-group">
          <label>Choose Defense: </label>
          ${Object.entries(defenseOptions).map(([key, opt]) => `
            <div class="defense-option ${opt.disabled ? 'disabled' : ''}">
              <input type="radio" name="defenseType" value="${key}" 
                     ${opt.disabled ?  'disabled' : ''} 
                     ${key === 'evade' ? 'checked' : ''}>
              <label>
                <strong>${opt.label}</strong> (TN:  ${opt.skill})
                <div class="defense-desc">${opt.description}</div>
              </label>
            </div>
          `).join('')}
        </div>
      </form>
    `;

    super({
      title: `${defender.name} - Choose Defense`,
      content,
      buttons: {
        defend: {
          label: "Defend",
          callback: (html) => {
            const choice = html.find('input[name="defenseType"]:checked').val();
            return { defenseType: choice, skill: defenseOptions[choice].skill };
          }
        },
        noDefense: {
          label: "No Defense",
          callback: () => ({ defenseType: 'none', skill: 0 })
        }
      },
      default: 'defend',
      close: () => ({ defenseType: 'evade', skill: defenseOptions.evade.skill })
    }, options);
  }

  static async show(defender) {
    return new Promise((resolve) => {
      new DefenseDialog(defender, {
        close: (result) => resolve(result || { defenseType: 'evade', skill: 0 })
      }).render(true);
    });
  }
}
