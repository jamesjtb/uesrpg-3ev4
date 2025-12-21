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
  MAGIC: 'magic',
  SILVER: 'silver',
  SUNLIGHT: 'sunlight'
};

/**
 * Get total damage reduction for an actor based on damage type
 * @param {Actor} actor - The actor receiving damage
 * @param {string} damageType - Type of damage (fire, frost, shock, poison, magic, etc.)
 * @returns {Object} - { armor, resistance, toughness, total }
 */
export function getDamageReduction(actor, damageType = DAMAGE_TYPES.PHYSICAL) {
  if (!actor?.system) {
    return { armor: 0, resistance: 0, toughness: 0, total: 0 };
  }

  const actorData = actor.system;
  let armor = 0;
  let resistance = 0;
  let toughness = 0;

  // Physical damage: uses armor and natural toughness
  if (damageType === DAMAGE_TYPES.PHYSICAL) {
    // Calculate total armor from equipped items
    const equippedArmor = actor.items?.filter(i => 
      i.type === 'armor' && i.system?.equipped === true
    ) || [];
    
    for (let item of equippedArmor) {
      armor += Number(item.system?.armor_rating || 0);
    }

    // Natural toughness resistance
    resistance = Number(actorData.resist?.natToughnessR || 0);
    
    // Toughness bonus (END bonus acts as damage reduction)
    const endBonus = Math.floor(Number(actorData.characteristics?.end?.total || 0) / 10);
    toughness = Number(endBonus || 0);
  }
  // Elemental and special damage types
  else {
    switch (damageType) {
      case DAMAGE_TYPES.FIRE:
        resistance = Number(actorData.resist?.fireR || 0);
        break;
      case DAMAGE_TYPES.FROST:
        resistance = Number(actorData.resist?.frostR || 0);
        break;
      case DAMAGE_TYPES.SHOCK:
        resistance = Number(actorData.resist?.shockR || 0);
        break;
      case DAMAGE_TYPES.POISON:
        resistance = Number(actorData.resist?.poisonR || 0);
        break;
      case DAMAGE_TYPES.MAGIC:
        resistance = Number(actorData.resist?.magicR || 0);
        break;
      case DAMAGE_TYPES.SILVER:
        resistance = Number(actorData.resist?.silverR || 0);
        break;
      case DAMAGE_TYPES.SUNLIGHT:
        resistance = Number(actorData.resist?.sunlightR || 0);
        break;
      default:
        resistance = 0;
    }
  }

  const total = armor + resistance + toughness;

  return {
    armor,
    resistance,
    toughness,
    total
  };
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
export function calculateDamage(rawDamage, damageType, target, options = {}) {
  const {
    penetration = 0,
    dosBonus = 0,
    ignoreArmor = false
  } = options;

  // Get damage reduction
  const reduction = getDamageReduction(target, damageType);
  
  // Calculate effective armor (can be penetrated)
  let effectiveArmor = ignoreArmor ? 0 : Math.max(0, reduction.armor - penetration);
  
  // Resistance and toughness cannot be penetrated (unless specified otherwise)
  const effectiveReduction = effectiveArmor + reduction.resistance + reduction.toughness;

  // Apply DoS bonus
  const totalRawDamage = Number(rawDamage) + Number(dosBonus);

  // Calculate final damage (minimum 0)
  const finalDamage = Math.max(0, totalRawDamage - effectiveReduction);

  return {
    rawDamage: Number(rawDamage),
    dosBonus: Number(dosBonus),
    totalRawDamage,
    reduction: {
      armor: effectiveArmor,
      resistance: reduction.resistance,
      toughness: reduction.toughness,
      total: effectiveReduction
    },
    finalDamage,
    damageType,
    prevented: totalRawDamage - finalDamage
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
    ? { finalDamage: damage, rawDamage: damage, reduction: { total: 0 }, damageType }
    : calculateDamage(damage, damageType, actor, { penetration, dosBonus });

  const finalDamage = damageCalc.finalDamage;

  // Get current HP
  const currentHP = Number(actor.system.health?.value || 0);
  const maxHP = Number(actor.system.health?.max || 1);
  const newHP = Math.max(0, currentHP - finalDamage);

  // Update actor HP
  await actor.update({
    "system.health.value": newHP
  });

  // Check for wounds (when HP drops below half, quarter, etc.)
  const hpPercentage = (newHP / maxHP) * 100;
  let woundStatus = "uninjured";
  
  if (newHP === 0) {
    woundStatus = "unconscious";
  } else if (hpPercentage <= 25) {
    woundStatus = "critically wounded";
  } else if (hpPercentage <= 50) {
    woundStatus = "wounded";
  }

  // Create chat message about damage
  const messageContent = `
    <div class="uesrpg-damage-applied">
      <h3>${actor.name} takes damage!</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin: 0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Hit Location:</strong></div><div>${hitLocation}</div>
        <div><strong>Damage Type:</strong></div><div>${damageType}</div>
        ${!ignoreReduction ? `
          <div><strong>Raw Damage:</strong></div><div>${damageCalc.rawDamage}${dosBonus > 0 ? ` + ${dosBonus} (DoS)` : ''}</div>
          <div><strong>Reduction:</strong></div><div>-${damageCalc.reduction.total} (Armor: ${damageCalc.reduction.armor}, Resist: ${damageCalc.reduction.resistance}, Tough: ${damageCalc.reduction.toughness})</div>
        ` : ''}
        <div><strong>Final Damage:</strong></div><div style="color: #d32f2f; font-weight: bold;">${finalDamage}</div>
        <div><strong>HP:</strong></div><div>${newHP} / ${maxHP} ${currentHP > newHP ? `(-${currentHP - newHP})` : ''}</div>
        ${woundStatus !== "uninjured" ? `<div style="grid-column: 1 / -1; color: #f57c00; font-weight: bold; text-align: center; margin-top: 0.5rem;">Status: ${woundStatus.toUpperCase()}</div>` : ''}
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER
  });

  return {
    actor,
    damage: finalDamage,
    reduction: damageCalc.reduction,
    oldHP: currentHP,
    newHP,
    woundStatus,
    prevented: damageCalc.prevented || 0
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

  if (!actor?.system) {
    ui.notifications.error("Invalid actor for healing");
    return null;
  }

  const currentHP = Number(actor.system.health?.value || 0);
  const maxHP = Number(actor.system.health?.max || 1);
  const healAmount = Number(healing);
  const newHP = Math.min(maxHP, currentHP + healAmount);
  const actualHealing = newHP - currentHP;

  if (actualHealing <= 0) {
    ui.notifications.info(`${actor.name} is already at full health`);
    return null;
  }

  await actor.update({
    "system.health.value": newHP
  });

  const messageContent = `
    <div class="uesrpg-healing-applied">
      <h3>${actor.name} receives healing!</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin: 0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Healing:</strong></div><div style="color: #388e3c; font-weight: bold;">+${actualHealing}</div>
        <div><strong>HP:</strong></div><div>${newHP} / ${maxHP}</div>
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER
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
