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

  // --- Armor coverage normalization ---
  // Legacy data (and the base template) can create armor items where all hitLocations are set to true.
  // This causes unrelated pieces (e.g. body armor) to incorrectly contribute AR to other locations.
  // We normalize coverage deterministically using the armor item's "category" when possible.
  //
  // Rules:
  // - For FULL armor pieces, category is authoritative.
  // - For PARTIAL armor pieces, if hitLocations are "all true" (legacy default), fall back to category.
  // - Otherwise, only explicit true values count as covered (undefined does not).
  const ARMOR_CATEGORY_TO_LOCATIONS = {
    head: ["Head"],
    body: ["Body"],
    l_arm: ["LeftArm"],
    r_arm: ["RightArm"],
    l_leg: ["LeftLeg"],
    r_leg: ["RightLeg"],
  };

  const ARMOR_LOCATION_KEYS = ["Head", "Body", "RightArm", "LeftArm", "RightLeg", "LeftLeg"];

  const getCoveredLocations = (item) => {
    const sys = item?.system ?? {};
    const armorClass = String(sys.armorClass || "partial").toLowerCase();
    const category = String(sys.category || "").toLowerCase();
    const hitLocs = sys.hitLocations ?? {};

    const allTrue = ARMOR_LOCATION_KEYS.every(k => hitLocs?.[k] === true);

    const catLocs = ARMOR_CATEGORY_TO_LOCATIONS[category] ?? null;
    if (catLocs && (armorClass === "full" || (armorClass === "partial" && allTrue))) {
      return new Set(catLocs);
    }

    // Only explicit true counts.
    return new Set(ARMOR_LOCATION_KEYS.filter(k => hitLocs?.[k] === true));
  };

  const actorData = actor.system;

  let armor = 0;
  let resistance = 0;
  let toughness = 0;

  // PHYSICAL: armor by hitLocation + natToughness
  if (damageType === DAMAGE_TYPES.PHYSICAL) {
    const equippedArmor = actor.items?.filter((i) => i.type === "armor" && i.system?.equipped === true) ?? [];

    for (const item of equippedArmor) {
      // Shields do not contribute AR; they are handled via Block in later steps.
      if (item.system?.isShield) continue;

      const covered = getCoveredLocations(item);
      if (!covered.has(propertyName)) continue;

      // Automation should always prefer derived effective values.
      const ar = (item.system?.armorEffective != null)
        ? Number(item.system.armorEffective)
        : Number(item.system?.armor ?? 0);

      armor += Number.isFinite(ar) ? ar : 0;
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
  const {
    penetration = 0,
    dosBonus = 0,
    hitLocation = "Body",
    ignoreArmor = false,
    // Advantage: Penetrate Armor — does not change AR, but treats armored locations as less protected
    // for the purpose of trigger-style effects (e.g., Slashing).
    penetrateArmorForTriggers = false,
    // Optional: provide weapon/attacker to enable RAW weapon-quality bonus damage
    // ("The Big Three": Crushing, Splitting, Slashing).
    weapon = null,
    attackerActor = null,
  } = options;

  /** @type {{armor:number,resistance:number,toughness:number,total:number,penetrated:number}} */
  let reductions = { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 };

  // Track the target's *pre-penetration* armor for RAW interactions (e.g., Crushing cap, Slashing trigger).
  let originalArmor = 0;

  if (!ignoreArmor) {
    reductions = getDamageReduction(targetActor, damageType, hitLocation);

    // Penetration reduces ARMOR only (not resistance/toughness)
    originalArmor = Number(reductions.armor ?? 0);
    const penetratedArmor = Math.max(0, originalArmor - Number(penetration || 0));
    reductions.penetrated = Math.max(0, originalArmor - penetratedArmor);
    reductions.armor = penetratedArmor;
    reductions.total = reductions.armor + reductions.resistance + reductions.toughness;
  }

  // Base damage = raw + DoS bonus (existing behavior)
  const baseTotalDamage = Math.max(0, Number(rawDamage || 0) + Number(dosBonus || 0));

  // --- Weapon quality bonuses (Step 1): Crushing, Splitting, Slashing
  // These bonuses are only applied for PHYSICAL damage.
  const qualBonus = computeBigThreeBonus({
    damageType,
    weapon,
    attackerActor,
    originalArmor,
    triggerArmor: penetrateArmorForTriggers ? 0 : originalArmor,
    baseTotalDamage,
    reductionsTotal: reductions.total,
  });

  const totalDamage = Math.max(0, baseTotalDamage + qualBonus);
  const finalDamage = Math.max(0, totalDamage - reductions.total);

  return {
    rawDamage: Number(rawDamage || 0),
    dosBonus: Number(dosBonus || 0),
    totalDamage,
    reductions,
    finalDamage,
    hitLocation,
    damageType,
    weaponBonus: qualBonus,
  };
}

/**
 * Compute the RAW weapon-quality bonus damage for "The Big Three":
 *  - Crushing (X): +min(STR bonus (or X), target AR at hit location)
 *  - Splitting (X): +STR bonus (or X) if the *initial* damage causes the target to lose >=1 HP
 *  - Slashing (X): +STR bonus (or X) against *unarmored* hit locations
 *
 * Notes (implementation choices):
 *  - Only applies to PHYSICAL damage.
 *  - The cap for Crushing uses the target location's armor *before* penetration.
 *  - Splitting triggers based on damage after reductions, before applying the Splitting bonus.
 */
function computeBigThreeBonus({ damageType, weapon, attackerActor, originalArmor, triggerArmor, baseTotalDamage, reductionsTotal }) {
  if (String(damageType ?? "").toLowerCase() !== "physical") return 0;
  if (!weapon || !attackerActor) return 0;

  // Resolve attacker STR bonus (schema: actor.system.characteristics.str.bonus)
  const strBonus = Number(attackerActor?.system?.characteristics?.str?.bonus ?? 0) || 0;

  // Pull structured qualities (manual + injected) if available.
  const structured = Array.isArray(weapon?.system?.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon?.system?.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];

  const getQualityValue = (key) => {
    const q = structured.find(e => String(e?.key ?? e ?? "").toLowerCase() === key);
    if (!q) return null;
    const v = q?.value;
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : null;
  };

  const hasQuality = (key) => structured.some(e => String(e?.key ?? e ?? "").toLowerCase() === key);

  let bonus = 0;

  // Crushing (X)
  if (hasQuality("crushing")) {
    const x = getQualityValue("crushing") ?? strBonus;
    const cap = Math.max(0, Number(originalArmor ?? 0));
    bonus += Math.max(0, Math.min(Math.max(0, x), cap));
  }

  // Slashing (X)
  if (hasQuality("slashing")) {
    const isUnarmored = Number(triggerArmor ?? originalArmor ?? 0) <= 0;
    if (isUnarmored) {
      const x = getQualityValue("slashing") ?? strBonus;
      bonus += Math.max(0, x);
    }
  }

  // Splitting (X)
  if (hasQuality("splitting")) {
    const initialFinal = Math.max(0, Number(baseTotalDamage ?? 0) - Number(reductionsTotal ?? 0));
    if (initialFinal >= 1) {
      const x = getQualityValue("splitting") ?? strBonus;
      bonus += Math.max(0, x);
    }
  }

  return Number.isFinite(bonus) ? bonus : 0;
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
    penetrateArmorForTriggers = false,
    // Advantage: Forceful Impact — applies/advances Damaged (1) on the armor piece protecting the hit location.
    // Current implementation: increments the Damaged quality on ONE equipped armor piece covering the location.
    forcefulImpact = false,
    // Advantage: Press Advantage — currently informational only (advantage economy is handled in opposed workflow).
    pressAdvantage = false,
    // Optional: enable RAW weapon-quality bonuses.
    weapon = null,
    attackerActor = null,
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

  // If weapon/attacker are provided, prefer the enriched calculation.
  // (calculateDamage is backwards-compatible; extra keys are ignored by older callers.)
  if (!ignoreReduction && (weapon || attackerActor)) {
    Object.assign(damageCalc, calculateDamage(rawDamage, damageType, actor, {
      penetration,
      dosBonus,
      hitLocation,
      penetrateArmorForTriggers,
      weapon,
      attackerActor,
    }));
  }

  const finalDamage = Number(damageCalc.finalDamage || 0);

  // Wound Threshold (RAW): WOUNDED is applied when a *single* instance of damage meets/exceeds
  // the target's Wound Threshold value. This is not derived from remaining HP.
  // Schema: actor.system.wound_threshold.value (PC + NPC).
  const woundThreshold = (() => {
    const wt = actor.system?.wound_threshold;
    // Preferred
    if (wt && typeof wt === "object") {
      const v = Number(wt.value ?? wt.total ?? wt.base);
      return Number.isFinite(v) ? v : 0;
    }
    // Defensive fallbacks
    const v = Number(actor.system?.woundThreshold ?? actor.system?.wounds ?? 0);
    return Number.isFinite(v) ? v : 0;
  })();

  // HP state
  const currentHP = Number(actor.system?.hp?.value ?? 0);
  const maxHP = Number(actor.system?.hp?.max ?? 1);
  const newHP = Math.max(0, currentHP - finalDamage);

  // Choose update target: unlinked token actor if applicable, else base actor
  const activeToken = actor.token ?? actor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && actor.prototypeToken && actor.prototypeToken.actorLink === false);

  const updateTarget = isUnlinkedToken ? activeToken.actor : actor;

  // Determine wound status from RAW threshold.
  // NOTE: We intentionally do not auto-clear the flag on healing.
  const isWounded = (finalDamage >= Math.max(0, woundThreshold)) && finalDamage > 0 && woundThreshold > 0;

  let woundStatus = "uninjured";
  if (newHP === 0) woundStatus = "unconscious";
  else if (isWounded) woundStatus = "wounded";

  // Persist Wounded flag if the damage exceeded the threshold.
  // Keep update minimal: only write the flag when it needs to be set.
  const updateData = { "system.hp.value": newHP };
  if (isWounded && !updateTarget.system?.wounded) updateData["system.wounded"] = true;

  await updateTarget.update(updateData);

  // Optional: Forceful Impact may damage the armor protecting the hit location.
  // This is intentionally best-effort and should never block damage resolution.
  if (forcefulImpact && String(damageType ?? "").toLowerCase() === DAMAGE_TYPES.PHYSICAL) {
    try {
      await _applyForcefulImpact(updateTarget, hitLocation);
    } catch (err) {
      console.warn("UESRPG | Forceful Impact armor update failed", err);
    }
  }

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

  // Damage chat message (GM-only, blind by default)
  const gmIds = game.users?.filter(u => u.isGM).map(u => u.id) ?? [];
  const hpDelta = Math.max(0, currentHP - newHP);

  const parts = [];
  if (!ignoreReduction) {
    const rd = Number(damageCalc.rawDamage ?? 0);
    const db = Number(damageCalc.dosBonus ?? 0);
    const wb = Number(damageCalc.weaponBonus ?? 0);
    const rawLine = [rd, db ? `+${db} DoS` : null, wb ? `+${wb} Wpn` : null].filter(Boolean).join(" ");
    parts.push(`<div class="uesrpg-da-row"><span class="k">Raw</span><span class="v">${rawLine}</span></div>`);
    parts.push(`<div class="uesrpg-da-row"><span class="k">Reduction</span><span class="v">-${damageCalc.reductions.total} <span class="muted">(AR ${damageCalc.reductions.armor} / R ${damageCalc.reductions.resistance} / T ${damageCalc.reductions.toughness}${damageCalc.reductions.penetrated ? ` / Pen ${damageCalc.reductions.penetrated}` : ""})</span></span></div>`);
  }

  const messageContent = `
    <div class="uesrpg-damage-applied-card">
      <div class="hdr">
        <div class="title">${updateTarget.name}</div>
        <div class="sub">${source}${hitLocation ? ` • ${hitLocation}` : ""}${damageType ? ` • ${damageType}` : ""}</div>
      </div>
      <div class="body">
        ${parts.join("\n")}
        <div class="uesrpg-da-row"><span class="k">Final</span><span class="v final">${finalDamage}</span></div>
        <div class="uesrpg-da-row"><span class="k">HP</span><span class="v">${newHP} / ${maxHP}${hpDelta ? ` <span class="muted">(-${hpDelta})</span>` : ""}</span></div>
        ${woundStatus === "wounded" ? `<div class="status wounded">WOUNDED <span class="muted">(WT ${woundThreshold})</span></div>` : ""}
        ${woundStatus === "unconscious" ? `<div class="status unconscious">UNCONSCIOUS</div>` : ""}
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    whisper: gmIds,
    blind: true,
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
 * Apply Forceful Impact: increment Damaged (X) on one armor item that covers the hit location.
 * Selection policy: choose the single equipped, non-shield armor item with the highest effective AR at the location.
 *
 * This does NOT attempt to handle edge cases...<snip>
 */
async function _applyForcefulImpact(targetActor, hitLocation) {
  if (!targetActor?.items) return;

  // Normalize hitLocation key variants coming from sheets/chat cards.
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

  // Coverage normalization rules (mirrors getDamageReduction):
  // - For FULL armor pieces, category is authoritative.
  // - For PARTIAL armor pieces, if hitLocations are "all true" (legacy default), fall back to category.
  // - Otherwise, only explicit true values count as covered.
  //
  // Shields:
  // - If a shield defines explicit hitLocations, respect them.
  // - Otherwise, treat shields as protecting the arm locations (LeftArm/RightArm) for Forceful Impact only.
  const ARMOR_CATEGORY_TO_LOCATIONS = {
    head: ["Head"],
    body: ["Body"],
    l_arm: ["LeftArm"],
    r_arm: ["RightArm"],
    l_leg: ["LeftLeg"],
    r_leg: ["RightLeg"],
  };
  const ARMOR_LOCATION_KEYS = ["Head", "Body", "RightArm", "LeftArm", "RightLeg", "LeftLeg"];

  const getCoveredLocations = (item) => {
    const sys = item?.system ?? {};
    const category = String(sys.category || "").toLowerCase();
    const armorClass = String(sys.armorClass || "partial").toLowerCase();
    const hitLocs = sys.hitLocations ?? {};
    const isShield = Boolean(sys.isShieldEffective ?? sys.isShield) || category === "shield" || category.startsWith("shield");

    // If explicit coverage exists, use it (works for both armor and shields).
    const anyExplicit = ARMOR_LOCATION_KEYS.some(k => hitLocs?.[k] === true);
    if (anyExplicit) return new Set(ARMOR_LOCATION_KEYS.filter(k => hitLocs?.[k] === true));

    // Shields without explicit coverage: treat as arm-protection for Forceful Impact.
    if (isShield) return new Set(["LeftArm", "RightArm"]);

    // Armor pieces: category-based fallback when legacy "all true" would otherwise misbehave.
    const allTrue = ARMOR_LOCATION_KEYS.every(k => hitLocs?.[k] === true);
    const catLocs = ARMOR_CATEGORY_TO_LOCATIONS[category] ?? null;
    if (catLocs && (armorClass === "full" || (armorClass === "partial" && allTrue))) {
      return new Set(catLocs);
    }

    return new Set();
  };

  const equippedArmor = targetActor.items?.filter((i) => i.type === "armor" && i.system?.equipped === true) ?? [];
  const candidates = [];

  for (const item of equippedArmor) {
    const sys = item.system ?? {};
    const category = String(sys.category || "").toLowerCase();
    const isShield = Boolean(sys.isShieldEffective ?? sys.isShield) || category === "shield" || category.startsWith("shield");

    const covered = getCoveredLocations(item);
    if (!covered.has(propertyName)) continue;

    // Forceful Impact selects one piece/shield. Prefer the piece that is currently most protective:
    // - Armor uses AR (effective if available)
    // - Shields use Block Rating (effective if available)
    const score = (() => {
      if (isShield) {
        const br = (sys.blockEffective != null) ? Number(sys.blockEffective) : Number(sys.block ?? 0);
        return Number.isFinite(br) ? br : 0;
      }
      const ar = (sys.armorEffective != null) ? Number(sys.armorEffective) : Number(sys.armor ?? 0);
      return Number.isFinite(ar) ? ar : 0;
    })();

    candidates.push({ item, score });
  }

  if (!candidates.length) return;

  // Choose the single most protective item on that location (deterministic).
  candidates.sort((a, b) => (b.score - a.score));
  const targetItem = candidates[0].item;

  // Stack Damaged (X) by +1 per use.
  const current = Array.isArray(targetItem.system?.qualitiesStructured)
    ? targetItem.system.qualitiesStructured
    : [];
  const next = current.map(q => ({ ...q }));

  const idx = next.findIndex(q => String(q?.key ?? "").toLowerCase() === "damaged");
  if (idx >= 0) {
    const v = Number(next[idx].value ?? 0);
    next[idx].value = Number.isFinite(v) ? v + 1 : 1;
  } else {
    next.push({ key: "damaged", value: 1 });
  }

  await targetItem.update({ "system.qualitiesStructured": next });
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
