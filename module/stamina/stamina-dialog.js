/**
 * Stamina spending dialog and effect creation.
 * Implements Chapter 1 stamina rules from documentation.
 */

import { createOrUpdateStatusEffect } from "../effects/status-effect.js";
import { requestUpdateDocument } from "../helpers/authority-proxy.js";

/**
 * Stamina effect key constants to avoid typos
 */
export const STAMINA_EFFECT_KEYS = {
  PHYSICAL_EXERTION: "stamina-physical-exertion",
  SPRINT: "stamina-sprint",
  POWER_DRAW: "stamina-power-draw",
  POWER_ATTACK: "stamina-power-attack",
  POWER_BLOCK: "stamina-power-block",
  HEROIC_USED: "stamina-heroic-used-this-round"
};

/**
 * Stamina spending options with their costs and descriptions
 */
const STAMINA_OPTIONS = [
  {
    id: "physical-exertion",
    name: "Physical Exertion",
    cost: 1,
    description: "+20 bonus on next STR/END based skill or characteristic test (not Combat Style)",
    effectKey: STAMINA_EFFECT_KEYS.PHYSICAL_EXERTION,
    consumeOn: "str-end-test"
  },
  {
    id: "sprint",
    name: "Sprint",
    cost: 1,
    description: "Next Dash action allows movement up to 2× speed",
    effectKey: STAMINA_EFFECT_KEYS.SPRINT,
    consumeOn: "dash"
  },
  {
    id: "power-draw",
    name: "Power Draw",
    cost: 1,
    description: "Reduce reload time by 1 for next ranged weapon shot",
    effectKey: STAMINA_EFFECT_KEYS.POWER_DRAW,
    consumeOn: "ranged-shot"
  },
  {
    id: "power-attack",
    name: "Power Attack",
    cost: "1-3",
    description: "+2 damage per SP spent (max +6), spend before damage roll",
    effectKey: STAMINA_EFFECT_KEYS.POWER_ATTACK,
    consumeOn: "damage-roll",
    allowAmount: true
  },
  {
    id: "power-block",
    name: "Power Block",
    cost: 1,
    description: "Double shield BR vs physical damage, spend after damage roll",
    effectKey: STAMINA_EFFECT_KEYS.POWER_BLOCK,
    consumeOn: "block"
  },
  {
    id: "heroic-action",
    name: "Heroic Action",
    cost: 1,
    description: "Immediately regain 1 AP (once per round)",
    effectKey: "stamina-heroic-action",
    consumeOn: "immediate",
    immediate: true
  }
];

/**
 * Opens the stamina spending dialog and handles the selected action
 * @param {Actor} actor - The actor spending stamina
 * @returns {Promise<void>}
 */
export async function openStaminaDialog(actor) {
  if (!actor) {
    ui.notifications.warn("No actor available for stamina spending.");
    return;
  }

  const currentSP = actor.system?.stamina?.value ?? 0;
  const maxSP = actor.system?.stamina?.max ?? 0;

  // Build dialog content
  const content = `
    <div class="stamina-dialog">
      <div class="stamina-status" style="margin-bottom: 15px; padding: 10px; background: ${currentSP <= 0 ? '#4a1a1a' : '#1a3a1a'}; border-radius: 4px;">
        <p style="margin: 0; font-weight: bold;">Current Stamina: ${currentSP} / ${maxSP}</p>
        ${currentSP <= 0 ? '<p style="margin: 5px 0 0 0; color: #ff6b6b;">⚠️ Warning: Spending at or below 0 SP will increase fatigue!</p>' : ''}
      </div>
      <form>
        <div class="form-group">
          <label><b>Select Stamina Action:</b></label>
          <select name="stamina-action" style="width: 100%; padding: 5px; margin-top: 5px;">
            <option value="">-- Select an option --</option>
            ${STAMINA_OPTIONS.map(opt => 
              `<option value="${opt.id}">${opt.name} (${opt.cost} SP) - ${opt.description}</option>`
            ).join('')}
          </select>
        </div>
        <div id="power-attack-amount" style="display: none; margin-top: 10px;">
          <label><b>Power Attack SP Amount (1-3):</b></label>
          <input type="number" name="power-attack-sp" min="1" max="3" value="1" style="width: 100%; padding: 5px; margin-top: 5px;" />
        </div>
      </form>
    </div>
  `;

  const dialog = new Dialog({
    title: "Spend Stamina",
    content,
    buttons: {
      spend: {
        label: "Spend",
        callback: async (html) => {
          const root = html instanceof HTMLElement ? html : html?.[0];
          const selectedId = root?.querySelector('select[name="stamina-action"]')?.value;
          const powerAttackSP = parseInt(root?.querySelector('input[name="power-attack-sp"]')?.value || "1", 10);
          
          if (!selectedId) {
            ui.notifications.warn("Please select a stamina action.");
            return;
          }

          const option = STAMINA_OPTIONS.find(o => o.id === selectedId);
          if (!option) return;

          const spAmount = option.allowAmount ? Math.max(1, Math.min(3, powerAttackSP)) : 1;
          await spendStamina(actor, option, spAmount);
        }
      },
      cancel: {
        label: "Cancel"
      }
    },
    default: "spend",
    render: (html) => {
      // Show/hide Power Attack amount field
      const select = html.find('select[name="stamina-action"]');
      const amountDiv = html.find('#power-attack-amount');
      
      select.on('change', () => {
        if (select.val() === 'power-attack') {
          amountDiv.show();
        } else {
          amountDiv.hide();
        }
      });
    }
  }, { width: 500 });

  dialog.render(true);
}

/**
 * Spend stamina and create the appropriate effect
 * @param {Actor} actor - The actor spending stamina
 * @param {Object} option - The stamina option selected
 * @param {number} spAmount - Amount of SP to spend (for Power Attack)
 * @returns {Promise<void>}
 */
async function spendStamina(actor, option, spAmount = 1) {
  const cost = option.allowAmount ? spAmount : option.cost;
  const currentSP = actor.system?.stamina?.value ?? 0;

  // Handle Heroic Action immediately
  if (option.immediate) {
    const currentAP = Number(actor.system?.action_points?.value ?? 0);
    const maxAP = Number(actor.system?.action_points?.max ?? 0);
    
    // Check if in active combat
    const combat = game.combat;
    const isInCombat = combat && combat.started;
    
    if (isInCombat) {
      // Check for heroic action flag this round
      const currentRound = Number(combat.round ?? 0);
      const systemId = game.system?.id ?? "uesrpg-3ev4";
      const lastUsedRound = actor.getFlag(systemId, "heroicActionLastRound");
      
      if (lastUsedRound === currentRound) {
        ui.notifications.warn("Heroic Action can only be used once per round.");
        return;
      }
      
      // Set flag for this round
      await actor.setFlag(systemId, "heroicActionLastRound", currentRound);
    }
    
    // Update stamina
    await requestUpdateDocument(actor, {
      "system.stamina.value": currentSP - cost
    });
    
    // Update AP
    const newAP = Math.min(currentAP + 1, maxAP);
    await requestUpdateDocument(actor, {
      "system.action_points.value": newAP
    });
    
    // Post chat message
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="uesrpg-stamina-card">
        <h3>Stamina: ${option.name}</h3>
        <p><b>Cost:</b> ${cost} SP</p>
        <p><b>Effect:</b> Regained 1 Action Point (${currentAP} → ${newAP})</p>
        <p><b>Remaining SP:</b> ${currentSP - cost}</p>
        ${isInCombat ? '<p style="font-style: italic; opacity: 0.8;">Can only be used once per round in combat.</p>' : ''}
      </div>`,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
    
    ui.notifications.info(`${option.name}: Regained 1 AP`);
    return;
  }

  // Update stamina
  await requestUpdateDocument(actor, {
    "system.stamina.value": currentSP - cost
  });

  // Remove any existing effect of the same type (replacing)
  const existing = actor.effects.find(e => 
    !e.disabled && e?.flags?.uesrpg?.key === option.effectKey
  );
  if (existing) {
    await existing.delete();
  }

  // Create effect with appropriate data
  const effectData = {
    name: option.name,
    statusId: null,
    img: getStaminaIcon(option.id),
    duration: {}, // Empty duration = persists until consumed
    flags: {
      uesrpg: {
        key: option.effectKey,
        spentSP: cost,
        consumeOn: option.consumeOn,
        description: option.description
      }
    },
    changes: [] // Active Effect modifiers
  };

  // Add Power Attack specific data and Active Effect modifier
  if (option.allowAmount) {
    const damageBonus = spAmount * 2;
    effectData.flags.uesrpg.damageBonus = damageBonus;
    effectData.changes.push({
      key: "system.modifiers.combat.damage.dealt",
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: String(damageBonus),
      priority: 20
    });
  }

  await createOrUpdateStatusEffect(actor, effectData);

  // Post chat message
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="uesrpg-stamina-card">
      <h3>Stamina: ${option.name}</h3>
      <p><b>Cost:</b> ${cost} SP</p>
      <p><b>Effect:</b> ${option.description}</p>
      ${option.allowAmount ? `<p><b>Damage Bonus:</b> +${spAmount * 2}</p>` : ''}
      <p><b>Remaining SP:</b> ${currentSP - cost}</p>
      <p style="font-style: italic; opacity: 0.8;">Effect will persist until consumed by the appropriate action.</p>
    </div>`,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER
  });

  ui.notifications.info(`${option.name} effect active (${cost} SP spent)`);
}

/**
 * Get appropriate icon for stamina effect
 * @param {string} optionId - The stamina option ID
 * @returns {string} Path to icon
 */
function getStaminaIcon(optionId) {
  const icons = {
    "physical-exertion": "icons/magic/control/buff-strength-muscle-damage-orange.webp",
    "sprint": "icons/magic/movement/trail-streak-zigzag-yellow.webp",
    "power-draw": "icons/weapons/ammunition/arrow-head-war-grey.webp",
    "power-attack": "icons/skills/melee/strike-sword-steel-yellow.webp",
    "power-block": "icons/equipment/shield/heater-steel-Boss-red.webp",
    "heroic-action": "icons/magic/control/buff-flight-wings-runes-purple.webp"
  };
  return icons[optionId] || "icons/svg/aura.svg";
}

/**
 * Check if actor has a specific stamina effect active
 * @param {Actor} actor - The actor to check
 * @param {string} effectKey - The effect key to look for
 * @returns {ActiveEffect|null} The active effect or null
 */
export function getActiveStaminaEffect(actor, effectKey) {
  if (!actor) return null;
  return actor.effects.find(e => 
    !e.disabled && e?.flags?.uesrpg?.key === effectKey
  ) || null;
}

/**
 * Consume a stamina effect and post chat message
 * @param {Actor} actor - The actor whose effect to consume
 * @param {string} effectKey - The effect key to consume
 * @param {Object} context - Additional context for the consumption message
 * @returns {Promise<Object|null>} The effect's data before deletion, or null
 */
export async function consumeStaminaEffect(actor, effectKey, context = {}) {
  const effect = getActiveStaminaEffect(actor, effectKey);
  if (!effect) return null;

  const effectFlags = effect.flags?.uesrpg || {};
  const effectName = effect.name || "Stamina Effect";
  const bonus = effectFlags.damageBonus || 0;
  const description = effectFlags.description || "";

  // Delete the effect
  await effect.delete();

  // Post consumption message
  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="uesrpg-stamina-consumed">
      <h3>Stamina Effect Consumed: ${effectName}</h3>
      <p><b>Effect:</b> ${description}</p>
      ${bonus > 0 ? `<p><b>Bonus Applied:</b> +${bonus} damage</p>` : ''}
      ${context.bonus ? `<p><b>Bonus Applied:</b> ${context.bonus}</p>` : ''}
      ${context.message ? `<p>${context.message}</p>` : ''}
    </div>`,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER
  });

  return {
    name: effectName,
    bonus,
    description,
    flags: effectFlags
  };
}
