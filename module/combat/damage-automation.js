/**
 * module/combat/damage-automation.js
 * UESRPG 3e v4 — Damage Calculation and Application System
 *
 * Handles: 
 *  - Damage type calculations (physical, fire, frost, shock, poison, magic)
 *  - Armor and resistance reduction
 *  - Toughness bonus application
 *  - Automatic HP deduction
 *  - Wound tracking
 *  - Hit location support
 *
 * Core Functions:
 *  - calculateDamage(rawDamage, damageType, target, options)
 *  - applyDamage(target, damage, damageType, options)
 *  - getDamageReduction(actor, damageType)
 */

/**
 * Damage types supported by the system
 */
export const DAMAGE_TYPES = {
  PHYSICAL: 'physical',
  FIRE: 'fire',
  FROST: 'frost',
  SHOCK: 'shock',
  POISON: 'poison',
  MAGIC:  'magic',
  SILVER: 'silver',
  SUNLIGHT: 'sunlight'
};

/**
 * Get total damage reduction for an actor based on damage type
 * @param {Actor} actor - The actor receiving damage
 * @param {string} damageType - Type of damage (fire, frost, shock, poison, magic, etc.)
 * @returns {Object} - { armor, resistance, toughness, total }
 */
export function getDamageReduction(actor, damageType = DAMAGE_TYPES.PHYSICAL, hitLocation = 'Body') {
  if (!actor?.system) {
    return { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 };
  }

  // Map display names to property names (for template.json compatibility)
  const locationMap = {
    'Head':  'Head',
    'Body': 'Body',
    'Right Arm': 'RightArm',
    'Left Arm': 'LeftArm',
    'Right Leg':  'RightLeg',
    'Left Leg': 'LeftLeg'
  };

  const propertyName = locationMap[hitLocation] || hitLocation;

  const actorData = actor.system;
  let armor = 0;
  let resistance = 0;
  let toughness = 0;

  // Physical damage:  uses armor and natural toughness
  if (damageType === DAMAGE_TYPES.PHYSICAL) {
    // Get armor for specific hit location
    const equippedArmor = actor.items?.filter(i => 
      i.type === 'armor' && i.system?.equipped === true
    ) || [];
    
    for (let item of equippedArmor) {
      // Check if armor covers this hit location
      const armorLocations = item.system?.hitLocations || {};
      if (armorLocations[propertyName] !== false) {
        armor += Number(item.system?.armor || 0);
      }
    }
    
    // Natural Toughness applies to physical damage only (no END bonus soak)
    toughness = Number(actorData.resistance?.natToughness || 0);
  } 
  // Elemental and special damage types
  else {
    switch (damageType) {
      case DAMAGE_TYPES.FIRE:
        resistance = Number(actorData.resistance?.fireR || 0);
        break;
      case DAMAGE_TYPES.FROST:
        resistance = Number(actorData.resistance?.frostR || 0);
        break;
      case DAMAGE_TYPES.SHOCK: 
        resistance = Number(actorData.resistance?.shockR || 0);
        break;
      case DAMAGE_TYPES.POISON:
        resistance = Number(actorData.resistance?.poisonR || 0);
        break;
      case DAMAGE_TYPES.MAGIC:
        resistance = Number(actorData.resistance?.magicR || 0);
        break;
      case DAMAGE_TYPES.SILVER: 
        resistance = Number(actorData.resistance?.silverR || 0);
        break;
      case DAMAGE_TYPES.SUNLIGHT:
        resistance = Number(actorData.resistance?.sunlightR || 0);
        break;
      default: 
        resistance = 0;
    }
    
    // No generic END-bonus soak for non-physical damage
    toughness = 0;
  }

  const total = armor + resistance + toughness;

  return { armor, resistance, toughness, total };
}

/**
 * Calculate final damage after reductions
 * @param {number} rawDamage - Raw damage value
 * @param {string} damageType - Type of damage
 * @param {Actor} target - Target actor
 * @param {Object} options - Additional options
 * @param {number} options.penetration - Armor penetration value
 * @param {number} options.dosBonus - Degree of Success bonus damage
 * @param {boolean} options.ignoreArmor - Ignore armor completely
 * @returns {Object} - Damage calculation details
 */
export function calculateDamage(rawDamage, damageType, targetActor, options = {}) {
  const {
    penetration = 0,
    dosBonus = 0,
    hitLocation = 'Body',
    ignoreArmor = false
  } = options;

  let reductions = { armor: 0, resistance: 0, toughness: 0, total: 0 };
  
  if (!ignoreArmor) {
    reductions = getDamageReduction(targetActor, damageType, hitLocation);
    
    // Apply penetration (reduces armor only, not resistance/toughness)
    const penetratedArmor = Math.max(0, reductions.armor - penetration);
    reductions.penetrated = reductions.armor - penetratedArmor;
    reductions.armor = penetratedArmor;
    reductions.total = reductions.armor + reductions.resistance + reductions.toughness;
  }

  const totalDamage = Math.max(0, rawDamage + dosBonus);
  const finalDamage = Math.max(0, totalDamage - reductions.total);

  return {
    rawDamage,
    dosBonus,
    totalDamage,
    reductions,
    finalDamage,
    hitLocation,
    damageType
  };
}

/**
 * Apply damage to an actor with automatic HP reduction and wound tracking
 * @param {Actor} actor - The actor taking damage
 * @param {number} damage - Amount of damage to apply
 * @param {string} damageType - Type of damage
 * @param {Object} options - Additional options
 * @param {boolean} options.ignoreReduction - Ignore all damage reduction
 * @param {number} options.penetration - Armor penetration
 * @param {number} options.dosBonus - Degree of Success bonus damage
 * @param {string} options.source - Source of damage (for chat message)
 * @param {string} options.hitLocation - Hit location
 * @returns {Promise<Object>} - Result of damage application
 */
export async function applyDamage(actor, damage, damageType = DAMAGE_TYPES.PHYSICAL, options = {}) {
  const {
    ignoreReduction = false,
    penetration = 0,
    dosBonus = 0,
    source = "Unknown",
    hitLocation = "Body"
  } = options;

  if (!actor?.system) {
    ui.notifications.error("Invalid actor for damage application");
    return null;
  }

  // Calculate damage with reductions
  const damageCalc = ignoreReduction 
    ? { finalDamage: damage, rawDamage: damage, reductions: { total: 0, armor: 0, resistance: 0, toughness: 0 }, damageType }
    : calculateDamage(damage, damageType, actor, { penetration, dosBonus, hitLocation });

  const finalDamage = damageCalc.finalDamage;

  // Get current HP
  const currentHP = Number(actor?.system?.hp?.value || 0);
  const maxHP = Number(actor?.system?.hp?.max || 1);
  const newHP = Math.max(0, currentHP - finalDamage);

  // ========== FIX: Update token actor if it exists ==========
  // Check if this actor is linked to a token
  const token = actor.token || actor.getActiveTokens()[0];
  
  if (token && !actor.prototypeToken.actorLink) {
    // Unlinked token:  update the token's actor data
    await token.actor.update({
      "system.hp.value": newHP
    });
  } else {
    // Linked actor or no token: update the base actor
    await actor.update({
      "system.hp.value": newHP
    });
  }
  // ==========================================================

  // Check for wounds (when HP drops below half, quarter, etc.)
  const hpPercentage = (newHP / maxHP) * 100;
  let woundStatus = "uninjured";
  
    if (newHP === 0) {
    woundStatus = "unconscious";
    
    // ========== IMPROVED:  Apply unconscious effect ==========
    try {
      const targetActor = (token && !actor.prototypeToken.actorLink) ? token.actor : actor;
      
      // Check if unconscious effect already exists
      const hasUnconsciousEffect = targetActor.effects.some(e => 
        e.statuses.has("unconscious") || e.name === "Unconscious"
      );
      
      if (!hasUnconsciousEffect) {
        const unconsciousEffect = {
          name: "Unconscious",
          icon: "icons/svg/unconscious.svg",
          duration: {
            rounds: undefined  // Permanent until removed
          },
          statuses:  ["unconscious"],  // Foundry v13 uses array for statuses
          changes: [
            {
              key: "system.attributes.movement.all",
              mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
              value: "0"
            }
          ],
          flags: {
            core: {
              statusId: "unconscious"
            }
          }
        };
        
        await targetActor.createEmbeddedDocuments("ActiveEffect", [unconsciousEffect]);
        console.log(`Applied unconscious effect to ${targetActor.name}`);
      }
    } catch (err) {
      console.error("Failed to apply unconscious effect:", err);
      ui.notifications.warn(`${actor.name} is unconscious but effect could not be applied`);
    }
    // ====================================================
    
  } else if (hpPercentage <= 50) {
    woundStatus = "wounded";
  }

  // Create chat message about damage
  const messageContent = `
    <div class="uesrpg-damage-applied">
      <h3>${actor.name} takes damage!</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap:  0.5rem; margin: 0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Hit Location: </strong></div><div>${hitLocation}</div>
        <div><strong>Damage Type:</strong></div><div>${damageType}</div>
        ${! ignoreReduction ? `
          <div><strong>Raw Damage:</strong></div><div>${damageCalc.rawDamage}${dosBonus > 0 ? ` + ${dosBonus} (DoS)` : ''}</div>
          <div><strong>Reduction:</strong></div><div>-${damageCalc.reductions.total} (Armor: ${damageCalc.reductions.armor}, Resist: ${damageCalc.reductions.resistance}, Tough: ${damageCalc.reductions.toughness})</div>
        ` : ''}
        <div><strong>Final Damage:</strong></div><div style="color: #d32f2f; font-weight: bold;">${finalDamage}</div>
        <div><strong>HP: </strong></div><div>${newHP} / ${maxHP} ${currentHP > newHP ? `(-${currentHP - newHP})` : ''}</div>
        ${woundStatus !== "uninjured" ? `<div style="grid-column: 1 / -1; color: #f57c00; font-weight: bold; text-align: center; margin-top: 0.5rem;">Status: ${woundStatus.toUpperCase()}</div>` : ''}
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER  // FIX: Use STYLES instead of TYPES
  });

  const prevented = Math.max(0, (damageCalc.totalDamage ?? damage) - finalDamage);

  return {
    actor,
    damage: finalDamage,
    reductions: damageCalc.reductions,
    oldHP: currentHP,
    newHP,
    woundStatus,
    prevented
  };
}

/**
 * Apply healing to an actor
 * @param {Actor} actor - The actor receiving healing
 * @param {number} healing - Amount of HP to restore
 * @param {Object} options - Additional options
 * @param {string} options.source - Source of healing
 * @returns {Promise<Object>} - Result of healing
 */
export async function applyHealing(actor, healing, options = {}) {
  const { source = "Healing" } = options;

  if (! actor?.system) {
    ui.notifications.error("Invalid actor for healing");
    return null;
  }

  const currentHP = Number(actor?.system?.hp?.value || 0);
  const maxHP = Number(actor?.system?.hp?.max || 1);
  const healAmount = Number(healing);
  const newHP = Math.min(maxHP, currentHP + healAmount);
  const actualHealing = newHP - currentHP;

  if (actualHealing <= 0) {
    ui.notifications.info(`${actor.name} is already at full health`);
    return null;
  }

  // ========== FIX: Update token actor if it exists ==========
  const token = actor.token || actor.getActiveTokens()[0];
  
  if (token && ! actor.prototypeToken.actorLink) {
    await token.actor.update({
      "system.hp.value": newHP
    });
  } else {
    await actor.update({
      "system.hp.value": newHP
    });
  }
  // ==========================================================

  const messageContent = `
    <div class="uesrpg-healing-applied">
      <h3>${actor.name} receives healing!</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin: 0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Healing: </strong></div><div style="color: #388e3c; font-weight:  bold;">+${actualHealing}</div>
        <div><strong>HP:</strong></div><div>${newHP} / ${maxHP}</div>
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER  // FIX: Use STYLES instead of TYPES
  });

  return {
    actor,
    healing: actualHealing,
    oldHP: currentHP,
    newHP
  };
}

// Global exposure for macros and console
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.damage = {
  DAMAGE_TYPES,
  getDamageReduction,
  calculateDamage,
  applyDamage,
  applyHealing
};
