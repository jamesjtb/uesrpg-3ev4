/**
 * src/ui/apps/hp-temp-hp-dialog.js
 * 
 * Dialog for managing HP and Temporary HP for actors.
 * Temporary HP acts as a damage buffer and does not stack.
 */

export class HPTempHPDialog {
  /**
   * Show the HP/Temp HP management dialog for an actor.
   * 
   * @param {Actor} actor - The actor to manage HP for
   * @returns {Promise<boolean>} - True if changes were applied, false if cancelled
   */
  static async show(actor) {
    if (!actor?.system) {
      ui.notifications.error("Invalid actor for HP management");
      return false;
    }

    const currentHP = Number(actor.system?.hp?.value ?? 0);
    const maxHP = Number(actor.system?.hp?.max ?? 0);
    const currentTempHP = Number(actor.system?.tempHP ?? 0);
    const isWounded = Boolean(actor.system?.wounded);
    
    const content = `
      <form class="uesrpg-hp-dialog">
        <div class="form-group">
          <label>Current HP</label>
          <input type="number" name="hp" value="${currentHP}" min="0" max="${maxHP}" />
          <span class="hint">Max: ${maxHP}</span>
        </div>
        <div class="form-group">
          <label>Temporary HP</label>
          <input type="number" name="tempHP" value="${currentTempHP}" min="0" />
          <span class="hint">Extra HP buffer, does not stack</span>
        </div>
      </form>
    `;
    
    return new Promise((resolve) => {
      const buttons = {
        firstAid: {
          icon: '<i class="fas fa-medkit"></i>',
          label: "First Aid",
          condition: isWounded,
          callback: async (html) => {
            // Apply HP/Temp HP changes first if any were made
            const newHP = Number(html.find('[name="hp"]').val());
            const newTempHP = Number(html.find('[name="tempHP"]').val());
            
            if (newHP !== currentHP || newTempHP !== currentTempHP) {
              await actor.update({
                "system.hp.value": Math.max(0, Math.min(maxHP, newHP)),
                "system.tempHP": Math.max(0, newTempHP)
              });
            }
            
            // Call First Aid
            if (game.uesrpg?.wounds?.firstAid) {
              await game.uesrpg.wounds.firstAid(actor);
              ui.notifications.info(`First Aid applied to ${actor.name}`);
            } else {
              ui.notifications.error("First Aid system not available");
            }
            
            resolve(true);
          }
        },
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: "Apply",
          callback: async (html) => {
            const newHP = Number(html.find('[name="hp"]').val());
            const newTempHP = Number(html.find('[name="tempHP"]').val());
            
            await actor.update({
              "system.hp.value": Math.max(0, Math.min(maxHP, newHP)),
              "system.tempHP": Math.max(0, newTempHP)
            });
            
            ui.notifications.info(`HP updated for ${actor.name}`);
            resolve(true);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(false)
        }
      };
      
      // Remove firstAid button if actor is not wounded
      if (!isWounded) {
        delete buttons.firstAid;
      }
      
      new Dialog({
        title: `Manage HP - ${actor.name}`,
        content,
        buttons,
        default: "apply"
      }).render(true);
    });
  }
}
