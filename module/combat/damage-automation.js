/**
 * module/combat/damage-automation.js
 * UESRPG 3e v4 — Damage Calculation and Application System
 *
 * Handles:
 *  - Damage type calculations (physical, fire, frost, shock, poison, magic, etc.)
 *  - Armor and resistance reduction
 *  - Natural Toughness (natToughness) for physical only (NO END-bonus soak)
 *  - Automatic HP deduction (supports linked/unlinked tokens)
 *  - Simple wound status: wounded @ <= 50% HP, unconscious @ 0 HP
 *  - Hit location support
 *
 * Core Functions:
 *  - calculateDamage(rawDamage, damageType, targetActor, options)
 *  - applyDamage(actor, damage, damageType, options)
 *  - getDamageReduction(actor, damageType, hitLocation)
 */

export const DAMAGE_TYPES = {
  PHYSICAL: "physical",
  FIRE: "fire",
  FROST: "frost",
  SHOCK: "shock",
  POISON: "poison",
  MAGIC: "magic",
  SILVER: "silver",
  SUNLIGHT: "sunlight",
};

/**
 * Get total damage reduction for an actor based on damage type.
 * Physical: armor (by hit location) + natToughness
 * Non-physical: resistance only (no generic END soak)
 *
 * @param {Actor} actor
 * @param {string} damageType
 * @param {string} hitLocation
 * @returns {{armor:number,resistance:number,toughness:number,total:number,penetrated:number}}
 */
export function getDamageReduction(actor, damageType = DAMAGE_TYPES.PHYSICAL, hitLocation = "Body") {
  if (!actor?.system) {
    return { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 };
  }

  // Template uses RightArm/LeftArm/RightLeg/LeftLeg keys; sheets might still pass "Right Arm" etc.
  const locationMap = {
    Head: "Head",
    Body: "Body",
    "Right Arm": "RightArm",
    "Left Arm": "LeftArm",
    "Right Leg": "RightLeg",
    "Left Leg": "LeftLeg",
    RightArm: "RightArm",
    LeftArm: "LeftArm",
    RightLeg: "RightLeg",
    LeftLeg: "LeftLeg",
  };

  const propertyName = locationMap[hitLocation] ?? hitLocation;

  const actorData = actor.system;

  let armor = 0;
  let resistance = 0;
  let toughness = 0;

  // PHYSICAL: armor by hitLocation + natToughness
  if (damageType === DAMAGE_TYPES.PHYSICAL) {
    const equippedArmor = actor.items?.filter((i) => i.type === "armor" && i.system?.equipped === true) ?? [];

    for (const item of equippedArmor) {
      const armorLocations = item.system?.hitLocations ?? {};
      // If location is explicitly false, it does not cover. Any other value counts as covered.
      if (armorLocations[propertyName] !== false) {
        armor += Number(item.system?.armor ?? 0);
      }
    }

    // RAW per your decision: natToughness only; no END-bonus soak
    toughness = Number(actorData.resistance?.natToughness ?? 0);
  } else {
    // NON-PHYSICAL: resistance only
    switch (damageType) {
      case DAMAGE_TYPES.FIRE:
        resistance = Number(actorData.resistance?.fireR ?? 0);
        break;
      case DAMAGE_TYPES.FROST:
        resistance = Number(actorData.resistance?.frostR ?? 0);
        break;
      case DAMAGE_TYPES.SHOCK:
        resistance = Number(actorData.resistance?.shockR ?? 0);
        break;
      case DAMAGE_TYPES.POISON:
        resistance = Number(actorData.resistance?.poisonR ?? 0);
        break;
      case DAMAGE_TYPES.MAGIC:
        resistance = Number(actorData.resistance?.magicR ?? 0);
        break;
      case DAMAGE_TYPES.SILVER:
        resistance = Number(actorData.resistance?.silverR ?? 0);
        break;
      case DAMAGE_TYPES.SUNLIGHT:
        resistance = Number(actorData.resistance?.sunlightR ?? 0);
        break;
      default:
        resistance = 0;
    }

    toughness = 0;
  }

  const total = armor + resistance + toughness;
  return { armor, resistance, toughness, total, penetrated: 0 };
}

/**
 * Calculate final damage after reductions.
 *
 * @param {number} rawDamage
 * @param {string} damageType
 * @param {Actor} targetActor
 * @param {object} options
 * @param {number} options.penetration
 * @param {number} options.dosBonus
 * @param {string} options.hitLocation
 * @param {boolean} options.ignoreArmor
 * @returns {{
 *   rawDamage:number,
 *   dosBonus:number,
 *   totalDamage:number,
 *   reductions:{armor:number,resistance:number,toughness:number,total:number,penetrated:number},
 *   finalDamage:number,
 *   hitLocation:string,
 *   damageType:string
 * }}
 */
export function calculateDamage(rawDamage, damageType, targetActor, options = {}) {
  const { penetration = 0, dosBonus = 0, hitLocation = "Body", ignoreArmor = false } = options;

  /** @type {{armor:number,resistance:number,toughness:number,total:number,penetrated:number}} */
  let reductions = { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 };

  if (!ignoreArmor) {
    reductions = getDamageReduction(targetActor, damageType, hitLocation);

    // Penetration reduces ARMOR only (not resistance/toughness)
    const originalArmor = Number(reductions.armor ?? 0);
    const penetratedArmor = Math.max(0, originalArmor - Number(penetration || 0));
    reductions.penetrated = Math.max(0, originalArmor - penetratedArmor);
    reductions.armor = penetratedArmor;
    reductions.total = reductions.armor + reductions.resistance + reductions.toughness;
  }

  const totalDamage = Math.max(0, Number(rawDamage || 0) + Number(dosBonus || 0));
  const finalDamage = Math.max(0, totalDamage - reductions.total);

  return {
    rawDamage: Number(rawDamage || 0),
    dosBonus: Number(dosBonus || 0),
    totalDamage,
    reductions,
    finalDamage,
    hitLocation,
    damageType,
  };
}

/**
 * Apply damage to an actor with automatic HP reduction and wound tracking.
 *
 * @param {Actor} actor
 * @param {number} damage
 * @param {string} damageType
 * @param {object} options
 * @param {boolean} options.ignoreReduction
 * @param {number} options.penetration
 * @param {number} options.dosBonus
 * @param {string} options.source
 * @param {string} options.hitLocation
 * @returns {Promise<{
 *   actor:Actor,
 *   damage:number,
 *   reductions:{armor:number,resistance:number,toughness:number,total:number,penetrated:number},
 *   oldHP:number,
 *   newHP:number,
 *   woundStatus:string,
 *   prevented:number
 * }|null>}
 */
export async function applyDamage(actor, damage, damageType = DAMAGE_TYPES.PHYSICAL, options = {}) {
  const {
    ignoreReduction = false,
    penetration = 0,
    dosBonus = 0,
    source = "Unknown",
    hitLocation = "Body",
  } = options;

  if (!actor?.system) {
    ui.notifications.error("Invalid actor for damage application");
    return null;
  }

  const rawDamage = Number(damage || 0);

  // Compute damage breakdown
  const damageCalc = ignoreReduction
    ? {
        rawDamage,
        dosBonus: Number(dosBonus || 0),
        totalDamage: Math.max(0, rawDamage + Number(dosBonus || 0)),
        reductions: { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 },
        finalDamage: Math.max(0, rawDamage + Number(dosBonus || 0)),
        hitLocation,
        damageType,
      }
    : calculateDamage(rawDamage, damageType, actor, { penetration, dosBonus, hitLocation });

  const finalDamage = Number(damageCalc.finalDamage || 0);

  // HP state
  const currentHP = Number(actor.system?.hp?.value ?? 0);
  const maxHP = Number(actor.system?.hp?.max ?? 1);
  const newHP = Math.max(0, currentHP - finalDamage);

  // Choose update target: unlinked token actor if applicable, else base actor
  const activeToken = actor.token ?? actor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && actor.prototypeToken && actor.prototypeToken.actorLink === false);

  const updateTarget = isUnlinkedToken ? activeToken.actor : actor;

  await updateTarget.update({ "system.hp.value": newHP });

  // Simple wound status
  let woundStatus = "uninjured";
  if (newHP === 0) woundStatus = "unconscious";
  else if (maxHP > 0 && newHP / maxHP <= 0.5) woundStatus = "wounded";

  // Optional: apply unconscious effect (safe + idempotent)
  if (woundStatus === "unconscious") {
    try {
      const targetActor = updateTarget;

      const hasUnconsciousEffect = targetActor.effects?.some(
        (e) => e?.statuses?.has?.("unconscious") || e?.name === "Unconscious"
      );

      if (!hasUnconsciousEffect) {
        const unconsciousEffect = {
          name: "Unconscious",
          icon: "icons/svg/unconscious.svg",
          duration: {},
          statuses: ["unconscious"],
          flags: { core: { statusId: "unconscious" } },
        };

        await targetActor.createEmbeddedDocuments("ActiveEffect", [unconsciousEffect]);
      }
    } catch (err) {
      console.error("UESRPG | Failed to apply unconscious effect:", err);
    }
  }

  // Damage chat message
  const messageContent = `
    <div class="uesrpg-damage-applied">
      <h3>${updateTarget.name} takes damage!</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Hit Location:</strong></div><div>${hitLocation}</div>
        <div><strong>Damage Type:</strong></div><div>${damageType}</div>
        ${
          !ignoreReduction
            ? `
          <div><strong>Raw Damage:</strong></div><div>${damageCalc.rawDamage}${damageCalc.dosBonus > 0 ? ` + ${damageCalc.dosBonus} (DoS)` : ""}</div>
          <div><strong>Reduction:</strong></div>
          <div>
            -${damageCalc.reductions.total}
            (Armor: ${damageCalc.reductions.armor}, Resist: ${damageCalc.reductions.resistance}, Tough: ${damageCalc.reductions.toughness}${damageCalc.reductions.penetrated ? `, Pen: ${damageCalc.reductions.penetrated}` : ""})
          </div>
        `
            : ""
        }
        <div><strong>Final Damage:</strong></div><div style="color:#d32f2f;font-weight:bold;">${finalDamage}</div>
        <div><strong>HP:</strong></div><div>${newHP} / ${maxHP} ${currentHP > newHP ? `(-${currentHP - newHP})` : ""}</div>
        ${
          woundStatus !== "uninjured"
            ? `<div style="grid-column:1 / -1;color:#f57c00;font-weight:bold;text-align:center;margin-top:0.5rem;">Status: ${woundStatus.toUpperCase()}</div>`
            : ""
        }
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
  });

  const prevented = Math.max(0, Number(damageCalc.totalDamage ?? rawDamage) - finalDamage);

  return {
    actor: updateTarget,
    damage: finalDamage,
    reductions: damageCalc.reductions,
    oldHP: currentHP,
    newHP,
    woundStatus,
    prevented,
  };
}

/**
 * Apply healing to an actor.
 *
 * @param {Actor} actor
 * @param {number} healing
 * @param {object} options
 * @param {string} options.source
 */
export async function applyHealing(actor, healing, options = {}) {
  const { source = "Healing" } = options;

  if (!actor?.system) {
    ui.notifications.error("Invalid actor for healing");
    return null;
  }

  const currentHP = Number(actor.system?.hp?.value ?? 0);
  const maxHP = Number(actor.system?.hp?.max ?? 1);

  const healAmount = Number(healing || 0);
  const newHP = Math.min(maxHP, currentHP + healAmount);
  const actualHealing = newHP - currentHP;

  if (actualHealing <= 0) {
    ui.notifications.info(`${actor.name} is already at full health`);
    return null;
  }

  const activeToken = actor.token ?? actor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && actor.prototypeToken && actor.prototypeToken.actorLink === false);
  const updateTarget = isUnlinkedToken ? activeToken.actor : actor;

  await updateTarget.update({ "system.hp.value": newHP });

  const messageContent = `
    <div class="uesrpg-healing-applied">
      <h3>${updateTarget.name} receives healing!</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:0.5rem 0;">
        <div><strong>Source:</strong></div><div>${source}</div>
        <div><strong>Healing:</strong></div><div style="color:#388e3c;font-weight:bold;">+${actualHealing}</div>
        <div><strong>HP:</strong></div><div>${newHP} / ${maxHP}</div>
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
  });

  return {
    actor: updateTarget,
    healing: actualHealing,
    oldHP: currentHP,
    newHP,
  };
}

// Global exposure for macros and console
window.Uesrpg3e = window.Uesrpg3e || {};
window.Uesrpg3e.damage = {
  DAMAGE_TYPES,
  getDamageReduction,
  calculateDamage,
  applyDamage,
  applyHealing,
};
