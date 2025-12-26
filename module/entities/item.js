/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
import { skillHelper } from "../helpers/skillCalcHelper.js";
import { skillModHelper } from "../helpers/skillCalcHelper.js";
import { UESRPG } from "../constants.js";

/**
 * Add a flat bonus to a dice string.
 * - Accepts numeric values or strings (e.g. "1d8", "1d10+2").
 * - Returns a string suitable for Foundry dice rolling.
 */
function addDiceBonus(dice, bonus) {
  const b = Number(bonus || 0);
  if (!b) return String(dice ?? "");
  const d = String(dice ?? "").trim();
  if (!d) return String(b);

  // If the value is a plain number, just add.
  if (/^-?\d+(?:\.\d+)?$/.test(d)) return String(Number(d) + b);

  // Normalize existing trailing bonus.
  const m = d.match(/^(.*?)([+-])\s*(\d+(?:\.\d+)?)\s*$/);
  if (m) {
    const base = m[1].trim();
    const sign = m[2] === "-" ? -1 : 1;
    const existing = sign * Number(m[3]);
    const total = existing + b;
    if (total === 0) return base;
    return `${base}${total >= 0 ? "+" : ""}${total}`;
  }
  return `${d}${b >= 0 ? "+" : ""}${b}`;
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hasLegacyQuality(qualitiesText, needle) {
  const q = String(qualitiesText ?? "").toLowerCase();
  return q.includes(String(needle).toLowerCase());
}

function hasStructuredQuality(qualitiesStructured, key) {
  if (!Array.isArray(qualitiesStructured)) return false;
  return qualitiesStructured.some(q => (q?.key ?? q) === key);
}

export class SimpleItem extends Item {
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    switch (data.type) {
      case 'combatStyle':
      case 'skill':
      case 'magicSkill':
        data.rank = 'untrained'
        break;
    }
  }

  async _onCreate(data, options, user) {
    await super._onCreate(data, options, user)
    switch (data.type) {
      case 'container':
        this._duplicateContainedItemsOnActor(this.actor, data)
        break;
    }
  }

  async prepareData() {
    super.prepareData();

    // Get the Item's data & Actor's Data
    const itemData = this.system
    const actorData = this.actor ? this.actor : {}

    // Prepare data based on item type - defensive guards for hasOwnProperty
    if (this.isEmbedded && this.actor?.system != null) {
      if (this.system && Object.prototype.hasOwnProperty.call(this.system, 'modPrice')) { this._prepareMerchantItem(actorData, itemData) }
      if (this.type === 'armor') { this._prepareArmorItem(actorData, itemData) }
      if (this.type === 'item') { this._prepareNormalItem(actorData, itemData) }
      if (this.type === 'weapon') { this._prepareWeaponItem(actorData, itemData) }
      if (this.type === 'ammunition') { this._prepareAmmunitionItem(actorData, itemData) }
      if (this.system && Object.prototype.hasOwnProperty.call(this.system, 'skillArray') && actorData.type === 'Player Character') { this._prepareModSkillItems(actorData, itemData) }
      if (this.system && Object.prototype.hasOwnProperty.call(this.system, 'baseCha')) { this._prepareCombatStyleData(actorData, itemData) }
      if (this.type == 'container') { this._prepareContainerItem(actorData, itemData) }}
    // Step 7: Inject auto-granted qualities into a computed structured list for automation.
    // This must run for world items as well as embedded items so automation helpers can rely on it.
    if (['weapon','armor','ammunition'].includes(this.type)) {
      this._injectAutoQualities(itemData);
    }

  }

  /**
   * Build a computed structured qualities array that includes both manual qualitiesStructured
   * and autoQualitiesStructured (material/quality-derived). This is NOT persisted.
   *
   * Contract:
   * - Manual qualities take precedence over auto qualities for the same key.
   * - Output is stable and de-duplicated by key.
   * - Stored on `system.qualitiesStructuredInjected` for automation consumers.
   */
  _injectAutoQualities(itemData) {
    const manual = Array.isArray(itemData.qualitiesStructured) ? itemData.qualitiesStructured : [];
    const autoQ = Array.isArray(itemData.autoQualitiesStructured) ? itemData.autoQualitiesStructured : [];

    const byKey = new Map();

    // Manual first (authoritative for values)
    for (const q of manual) {
      if (!q) continue;
      const key = String(q.key ?? "").trim();
      if (!key) continue;
      const entry = { key };
      if (q.value !== undefined && q.value !== null && q.value !== "") entry.value = Number(q.value);
      byKey.set(key, entry);
    }

    // Auto second (only if not already present)
    for (const q of autoQ) {
      if (!q) continue;
      const key = String(q.key ?? q ?? "").trim();
      if (!key) continue;
      if (byKey.has(key)) continue;
      const entry = { key };
      if (q.value !== undefined && q.value !== null && q.value !== "") entry.value = Number(q.value);
      byKey.set(key, entry);
    }

    itemData.qualitiesStructuredInjected = Array.from(byKey.values());
  }


  /**
   * Prepare Character type specific data
   */

  /**
   * Prepare data specific to armor items
   * @param {*} itemData
   * @param {*} actorData
   */

  async _prepareCombatStyleData(actorData, itemData) {

    //Skill Bonus Calculation
    const legacyUntrained = game.settings.get("uesrpg-3ev4", "legacyUntrainedPenalty");

    //Combat Style Skill Bonus Calculation
    if (legacyUntrained) {
      if (itemData.rank === "untrained") {
        itemData.bonus = -10 + this._untrainedException(actorData);
      } else if (itemData.rank === "novice") {
        itemData.bonus = 0;
      } else if (itemData.rank === "apprentice") {
        itemData.bonus = 10;
      } else if (itemData.rank === "journeyman") {
        itemData.bonus = 20;
      } else if (itemData.rank === "adept") {
        itemData.bonus = 30;
      } else if (itemData.rank === "expert") {
        itemData.bonus = 40;
      } else if (itemData.rank === "master") {
        itemData.bonus = 50;
      }

    } else {
      if (itemData.rank == "untrained") {
        itemData.bonus = -20 + this._untrainedException(actorData);
      } else if (itemData.rank === "novice") {
        itemData.bonus = 0;
      } else if (itemData.rank === "apprentice") {
        itemData.bonus = 10;
      } else if (itemData.rank === "journeyman") {
        itemData.bonus = 20;
      } else if (itemData.rank === "adept") {
        itemData.bonus = 30;
      } else if (itemData.rank === "expert") {
        itemData.bonus = 40;
      } else if (itemData.rank === "master") {
        itemData.bonus = 50;
      }
    }

    // Combat Style Skill Calculation
    const woundPenalty = Number(actorData.system?.woundPenalty || 0)
    const fatiguePenalty = Number(actorData.system?.fatigue?.penalty || 0)

    let itemChaBonus = skillHelper(actorData, itemData.baseCha)
    let itemSkillBonus = skillModHelper(actorData, this.name)
    let chaTotal = 0;
    // Defensive guard: verify nested characteristics structure
    if (itemData.baseCha !== undefined && itemData.baseCha !== "" && itemData.baseCha !== "none") {
      const characteristics = actorData?.system?.characteristics?.[itemData.baseCha];
      chaTotal = Number((characteristics?.total || 0) + itemData.bonus + (itemData.miscValue || 0) + itemChaBonus);
    }

    if (actorData.system?.wounded) {
      itemData.value = Number(woundPenalty + fatiguePenalty + chaTotal + itemSkillBonus)
    } else {
      itemData.value = Number(fatiguePenalty + chaTotal + itemSkillBonus)
    }

  }

  _prepareMerchantItem(actorData, itemData) {
    // Guard priceMod access and use Math.round for safe numeric conversion
    const priceMod = Number(actorData?.system?.priceMod ?? 0);
    itemData.modPrice = Math.round(itemData.price + (itemData.price * (priceMod / 100)));
  }

  _prepareArmorItem(actorData, itemData) {
    // --- Derived (non-persisted) effective stats ---
    const baseEnc = safeNumber(itemData.enc, 0);
    const basePrice = safeNumber(itemData.price, 0);

    // Armor quality affects effective weight class (already implemented elsewhere),
    // but price is also generally driven by craftsmanship in the same way as weapons.
    const qualityKey = String(itemData.qualityLevel || "common").toLowerCase();
    const qRule = UESRPG.WEAPON_QUALITY_RULES?.[qualityKey] ?? UESRPG.WEAPON_QUALITY_RULES.common;
    const priceMult = safeNumber(qRule?.priceMult, 1.0);

    itemData.encEffective = baseEnc;
    itemData.priceEffective = Math.round(basePrice * priceMult);

    // Keep a computed list of auto-qualities for later automation (not persisted).
    itemData.autoQualitiesStructured = Array.isArray(qRule?.autoQualities) ? qRule.autoQualities : [];
  }

  _prepareNormalItem(actorData, itemData) {
    // Auto Assigns as a wearable item if the Equipped Toggle is on
    if (itemData.equipped) { itemData.wearable = true }
  }

  _prepareWeaponItem(actorData, itemData) {
    // 2H fallback
    itemData.weapon2H ? itemData.damage3 = itemData.damage2 : itemData.damage3 = itemData.damage

    // --- Derived (non-persisted) effective stats ---
    const baseDamage = itemData.damage;
    const baseDamage2 = itemData.damage2;
    const baseEnc = safeNumber(itemData.enc, 0);
    const basePrice = safeNumber(itemData.price, 0);

    const qualityKey = String(itemData.qualityLevel || "common").toLowerCase();
    const qRule = UESRPG.WEAPON_QUALITY_RULES?.[qualityKey] ?? UESRPG.WEAPON_QUALITY_RULES.common;

    // Determine which material rule table applies.
    const matKey = String(itemData.material || "iron").toLowerCase();
    const attackMode = String(itemData.attackMode || "melee").toLowerCase();

    // RAW: thrown ranged weapons count as melee for materials.
    const isThrown = hasStructuredQuality(itemData.qualitiesStructured, "thrown") || hasLegacyQuality(itemData.qualities, "thrown");
    const useMeleeMaterial = (attackMode === "melee") || (attackMode === "ranged" && isThrown);

    const mRule = useMeleeMaterial
      ? (UESRPG.WEAPON_MATERIAL_RULES_MELEE?.[matKey] ?? null)
      : (UESRPG.WEAPON_MATERIAL_RULES_RANGED?.[matKey] ?? null);

    const damageMod = safeNumber(mRule?.damageMod, 0);
    const encDelta = safeNumber(mRule?.encDelta, 0);
    const matPriceMult = safeNumber(mRule?.priceMult, 1.0);
    const qualityPriceMult = safeNumber(qRule?.priceMult, 1.0);

    // Special melee-only materials: wood/bone halve damage (with exceptions in RAW).
    // We implement a conservative derived presentation:
    // - Bone: halved damage
    // - Wood: halved damage unless the weapon is a Quarterstaff or Mace (detected by name)
    let special = null;
    if (useMeleeMaterial && mRule?.autoQualities?.some(q => q?.key === "specialDamageRule")) {
      special = mRule.autoQualities.find(q => q?.key === "specialDamageRule")?.value;
    }

    const nameLower = String(this.name ?? "").toLowerCase();
    const woodException = nameLower.includes("quarterstaff") || nameLower.includes("mace");

    const applyHalfDamage = (special === "bone") || (special === "wood" && !woodException);

    // NOTE: We avoid rewriting base fields; these are used by sheets & future automation.
    itemData.damageEffective = applyHalfDamage ? String(baseDamage) : addDiceBonus(baseDamage, damageMod);
    itemData.damage2Effective = applyHalfDamage ? String(baseDamage2) : addDiceBonus(baseDamage2, damageMod);
    itemData.damage3Effective = itemData.weapon2H ? itemData.damage2Effective : itemData.damageEffective;

    itemData.encEffective = baseEnc + encDelta;
    itemData.priceEffective = Math.round(basePrice * matPriceMult * qualityPriceMult);

    // Enchant level is defined by material.
    if (mRule?.enchantLevel != null) itemData.enchant_levelEffective = safeNumber(mRule.enchantLevel, 0);

    // Store auto-qualities (material + quality), without mutating the user's toggle list.
    const materialAuto = Array.isArray(mRule?.autoQualities) ? mRule.autoQualities : [];
    const qualityAuto = Array.isArray(qRule?.autoQualities) ? qRule.autoQualities : [];
    itemData.autoQualitiesStructured = [...qualityAuto, ...materialAuto]
      .filter(q => q?.key && q.key !== "specialDamageRule")
      .map(q => ({ key: q.key, value: q.value }));
  }

  _prepareAmmunitionItem(actorData, itemData) {
    const baseDamage = itemData.damage;
    const basePricePer10 = safeNumber(itemData.pricePer10, 0);
    const matKey = String(itemData.ammoMaterial || "iron").toLowerCase();
    const mRule = UESRPG.AMMO_MATERIAL_RULES?.[matKey] ?? null;

    const damageMod = safeNumber(mRule?.damageMod, 0);

    // Derived effective values; we do not overwrite stored user inputs.
    itemData.damageEffective = addDiceBonus(baseDamage, damageMod);
    itemData.enchant_levelEffective = safeNumber(mRule?.enchantLevel, 0);
    itemData.pricePer10Effective = (mRule?.pricePer10 != null) ? safeNumber(mRule.pricePer10, 0) : basePricePer10;
    itemData.pricePerShotEffective = Math.round((itemData.pricePer10Effective / 10) * 100) / 100;

    const materialAuto = Array.isArray(mRule?.autoQualities) ? mRule.autoQualities : [];
    itemData.autoQualitiesStructured = materialAuto
      .filter(q => q?.key)
      .map(q => ({ key: q.key, value: q.value }));
  }

  /**
   * PrepareModSkillItems - Safer, non-mutating approach
   * Previously this updated other embedded documents (updateSource) during item prepare,
   * which can cause expensive document updates during large prepares/draws. Instead:
   * - If the item is equipped, apply the modifier in-memory to actorData.system.professions
   * - Do not perform document writes here (no updateSource / updateEmbeddedDocuments)
   */
  _prepareModSkillItems(actorData, itemData) {
    if (!Array.isArray(itemData.skillArray) || itemData.skillArray.length === 0) { return }

    // If actorData is present and has professions structure, update in-memory
    const professions = actorData?.system?.professions;
    const professionsWound = actorData?.system?.professionsWound;

    for (let entry of itemData.skillArray) {
      // Avoid expensive .find() and avoid document updates
      if (!entry || !entry.name) continue;
      const value = Number(entry.value || 0);

      if (itemData.equipped && professions) {
        professions[entry.name] = Number(professions[entry.name] || 0) + value;
        if (professionsWound) {
          professionsWound[entry.name] = Number(professionsWound[entry.name] || 0) + value;
        }
      }
      // Keep a lightweight reference for UI use if needed
      // itemData._appliedSkillMods = itemData._appliedSkillMods || {};
      // itemData._appliedSkillMods[entry.name] = (itemData._appliedSkillMods[entry.name] || 0) + value;
    }
  }

_prepareContainerItem(actorData, itemData) {
  const contained = Array.isArray(itemData?.contained_items) ? itemData.contained_items : [];
  if (contained.length === 0) {
    itemData.container_enc = itemData.container_enc || { item_count: 0, current: 0, applied_enc: 0 };
    return;
  }

  const itemCount = contained.length;
  let currentCapacity = 0;
  for (const containedItem of contained) {
    const cItem = containedItem?.item || containedItem || {};
    const enc = Number(cItem?.system?.enc ?? 0);
    const qty = Number(cItem?.system?.quantity ?? 0);
    currentCapacity += enc * qty;
  }

  const appliedENC = Math.ceil(currentCapacity / 2);
  itemData.container_enc = itemData.container_enc || {};
  itemData.container_enc.item_count = itemCount;
  itemData.container_enc.current = currentCapacity;
  itemData.container_enc.applied_enc = appliedENC;
}

async _duplicateContainedItemsOnActor(actorData, itemData) {
  if (!actorData || !Array.isArray(itemData?.system?.contained_items)) return;

  const itemsToDuplicate = [];
  for (const containedItem of itemData.system.contained_items) {
    const clone = containedItem?.item ? (containedItem.item.toObject ? containedItem.item.toObject() : containedItem.item) : containedItem;
    if (!clone) continue;
    clone.system = clone.system || {};
    clone.system.containerStats = clone.system.containerStats || {};
    clone.system.containerStats.container_id = itemData._id;
    itemsToDuplicate.push(clone);
  }

  if (itemsToDuplicate.length === 0) return;
  const createdContainedItems = await actorData.createEmbeddedDocuments("Item", itemsToDuplicate);
  this.system.contained_items = await this._assignNewlyCreatedItemDataToContainer(createdContainedItems, actorData, itemData);
}

  async _assignNewlyCreatedItemDataToContainer(createdContainedItems, actorData, itemData) {
    // Loop through newly created items and grab their new ID's to store in the container contained_items array
    let newContainedItems = []
    for (let newItem of await createdContainedItems) {
      newContainedItems.push({ _id: newItem._id, item: newItem })
    }
    return newContainedItems
  }

  _untrainedException(actorData) {
    // Defensive guard: safe property access and array filtering
    let attribute = actorData.items?.filter(item => item?.system?.untrainedException == true) || [];
    const legacyUntrained = game.settings.get("uesrpg-3ev4", "legacyUntrainedPenalty");
    let x = 0;
    if (this.type === "combatStyle") {
      if (legacyUntrained === true) {
        if (attribute.length >= 1) {
          x = 10;
        }
      } else if (attribute.length >= 1) {
        x = 20;
      }
    }
    return x
  }

}
