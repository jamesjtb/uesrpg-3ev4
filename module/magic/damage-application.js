/**
 * module/magic/damage-application.js
 *
 * Magic damage application workflow for UESRPG 3ev4.
 * Handles applying damage from spells with proper resistance calculations.
 */

/**
 * Get magic resistance based on damage type
 * @param {Actor} actor - The target actor
 * @param {string} damageType - The damage type (fire, frost, shock, poison, magic, physical)
 * @returns {number} Resistance value
 */
function getMagicResistance(actor, damageType) {
  const system = actor.system;
  switch (damageType.toLowerCase()) {
    case "fire":
      return Number(system?.resistance?.fireR ?? 0);
    case "frost":
      return Number(system?.resistance?.frostR ?? 0);
    case "shock":
      return Number(system?.resistance?.shockR ?? 0);
    case "poison":
      return Number(system?.resistance?.poisonR ?? 0);
    case "magic":
      return Number(system?.resistance?.magicR ?? 0);
    case "physical":
      return Number(system?.resistance?.natToughness ?? 0);
    default:
      return 0;
  }
}

/**
 * Apply magic damage to target with proper type tracking
 * @param {Actor} targetActor - The target actor
 * @param {number} damage - The damage amount
 * @param {string} damageType - The damage type
 * @param {Item} spell - The spell item
 * @param {Object} options - Additional options
 * @returns {Promise<void>}
 */
export async function applyMagicDamage(targetActor, damage, damageType, spell, options = {}) {
  if (!targetActor || damage <= 0) return;
  
  // Apply resistances based on damage type
  const resistance = getMagicResistance(targetActor, damageType);
  const finalDamage = Math.max(0, damage - resistance);
  
  // Deduct HP
  const currentHP = Number(targetActor.system?.resources?.hp?.value ?? 0);
  const newHP = Math.max(0, currentHP - finalDamage);
  
  await targetActor.update({ "system.resources.hp.value": newHP });
  
  // Create damage notification
  await ChatMessage.create({
    content: `
      <div class="uesrpg-damage-applied" style="padding: 10px; background: rgba(139, 0, 0, 0.1); border-left: 3px solid #8b0000;">
        <h3 style="margin-top: 0;">💥 ${spell.name} Damage Applied</h3>
        <p><b>Target:</b> ${targetActor.name}</p>
        <p><b>Damage Type:</b> ${damageType}</p>
        <p><b>Raw Damage:</b> ${damage}</p>
        ${resistance > 0 ? `<p><b>Resistance:</b> -${resistance}</p>` : ''}
        <p><b>Final Damage:</b> ${finalDamage}</p>
        <p><b>HP:</b> ${currentHP} → ${newHP}</p>
        ${options.isCritical ? '<p style="color: green; font-weight: bold;">⭐ CRITICAL HIT</p>' : ''}
      </div>
    `,
    speaker: ChatMessage.getSpeaker({ actor: targetActor })
  });
}

/**
 * Add damage application buttons to magic opposed chat cards
 * @param {Array} targets - Array of target objects with uuid and name
 * @param {number} damage - The damage amount
 * @param {string} damageType - The damage type
 * @param {Item} spell - The spell item
 * @param {Object} options - Additional options
 * @returns {string} HTML string with damage buttons
 */
export function renderMagicDamageButtons(targets, damage, damageType, spell, options = {}) {
  if (!targets || !targets.length || !damage) return "";
  
  return targets.map(t => `
    <button 
      class="apply-magic-damage-btn"
      data-target-uuid="${t.uuid}"
      data-damage="${damage}"
      data-damage-type="${damageType}"
      data-spell-uuid="${spell.uuid}"
      data-is-critical="${options.isCritical || false}"
      style="margin: 0.25rem; padding: 0.25rem 0.5rem; background: #8b0000; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">
      Apply ${damage} ${damageType} damage to ${t.name}
    </button>
  `).join("");
}

/**
 * Initialize damage application chat listeners
 */
export function initializeDamageApplication() {
  Hooks.on("renderChatMessage", (message, html) => {
    html.find(".apply-magic-damage-btn").click(async (ev) => {
      const btn = ev.currentTarget;
      const targetUuid = btn.dataset.targetUuid;
      const damage = Number(btn.dataset.damage);
      const damageType = btn.dataset.damageType;
      const spellUuid = btn.dataset.spellUuid;
      const isCritical = btn.dataset.isCritical === "true";
      
      const target = await fromUuid(targetUuid);
      const spell = await fromUuid(spellUuid);
      
      if (!target) {
        ui.notifications.warn("Target not found.");
        return;
      }
      
      if (!spell) {
        ui.notifications.warn("Spell not found.");
        return;
      }
      
      await applyMagicDamage(target, damage, damageType, spell, { isCritical });
      btn.disabled = true;
      btn.textContent = "✓ Damage Applied";
      btn.style.background = "#666";
    });
  });
}
