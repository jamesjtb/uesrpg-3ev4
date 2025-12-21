/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
import { skillHelper } from "../helpers/skillCalcHelper.js";
import { skillModHelper } from "../helpers/skillCalcHelper.js";

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
      if (this.system && Object.prototype.hasOwnProperty.call(this.system, 'damaged')) { this._prepareArmorItem(actorData, itemData) }
      if (this.type === 'item') { this._prepareNormalItem(actorData, itemData) }
      if (this.type === 'weapon') { this._prepareWeaponItem(actorData, itemData) }
      if (this.system && Object.prototype.hasOwnProperty.call(this.system, 'skillArray') && actorData.type === 'Player Character') { this._prepareModSkillItems(actorData, itemData) }
      if (this.system && Object.prototype.hasOwnProperty.call(this.system, 'baseCha')) { this._prepareCombatStyleData(actorData, itemData) }
      if (this.type == 'container') { this._prepareContainerItem(actorData, itemData) }
    }
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

  }

  _prepareNormalItem(actorData, itemData) {
    // Auto Assigns as a wearable item if the Equipped Toggle is on
    if (itemData.equipped) { itemData.wearable = true }
  }

  _prepareWeaponItem(actorData, itemData) {
    itemData.weapon2H ? itemData.damage3 = itemData.damage2 : itemData.damage3 = itemData.damage
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
    // Need to calculate container stats like current capacity, applied ENC, and item count
    // Defensive guard: ensure contained_items array exists
    if (!Array.isArray(itemData?.contained_items) || (itemData?.contained_items?.length ?? 0) === 0) {
      itemData.container_enc = itemData.container_enc || { item_count: 0, current: 0, applied_enc: 0 };
      return
    }

    let itemCount = itemData.contained_items.length

    let currentCapacity = 0
    for (let containedItem of itemData.contained_items) {
      // containedItem might be { item: Item } or a plain stored object
      // Defensive guard: safe property access with defaults
      const cItem = containedItem?.item || containedItem;
      const enc = Number(cItem?.system?.enc ?? 0);
      const qty = Number(cItem?.system?.quantity ?? 0);
      const encProduct = enc * qty;
      currentCapacity = Math.ceil(currentCapacity + (encProduct))
    }

    // let currentCapacity = itemData.contained_items.reduce((a, b) => {a + (b.item.system.enc * b.item.system.quantity)}, 0)
    let appliedENC = Math.ceil(currentCapacity / 2);

    itemData.container_enc = itemData.container_enc || {};
    itemData.container_enc.item_count = itemCount;
    itemData.container_enc.current = currentCapacity;
    itemData.container_enc.applied_enc = appliedENC;

  }

  async _duplicateContainedItemsOnActor(actorData, itemData) {
    if (!actorData || !Array.isArray(itemData?.system?.contained_items)) return;

    let itemsToDuplicate = [];
    let containedItems = [];
    for (let containedItem of itemData.system.contained_items) {
      // Guard for structure; ensure we clone an Item-like object
      const clone = containedItem?.item ? containedItem.item.toObject ? containedItem.item.toObject() : containedItem.item : containedItem;
      if (!clone) continue;
      clone.system = clone.system || {};
      clone.system.containerStats = clone.system.containerStats || {};
      clone.system.containerStats.container_id = itemData._id;
      itemsToDuplicate.push(clone);
      containedItems.push(containedItem);
    }

    if (itemsToDuplicate.length == 0 || !actorData) return;
    let createdContainedItems = await actorData.createEmbeddedDocuments("Item", itemsToDuplicate);

    // Loop through newly created items and grab their new ID's to store in the container contained_items array
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

  /**
   * Prepare data specific to armor items
   * @param {*} itemData
   * @param {*} actorData
   */

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
