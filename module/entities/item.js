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

    // Prepare data based on item type
    if (this.isEmbedded && this.actor.system != null) {
      if (this.system.hasOwnProperty('modPrice')) {this._prepareMerchantItem(actorData, itemData)}
      if (this.type === "armor") {this._prepareArmorItem(actorData, itemData)}
      if (this.type === 'item') {this._prepareNormalItem(actorData, itemData)}
      if (this.type === 'weapon') {this._prepareWeaponItem(actorData, itemData)}
      if (this.system.hasOwnProperty('skillArray') && actorData.type === 'Player Character') {this._prepareModSkillItems(actorData, itemData)}
      if (this.system.hasOwnProperty('baseCha')) {this._prepareCombatStyleData(actorData, itemData)}
      if (this.type == 'container') {this._prepareContainerItem(actorData, itemData)}
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
    // Only apply rank-based bonus for Player Characters, not NPCs
    if (actorData.type === 'Player Character') {
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
    }
    // For NPCs, bonus is manually set and not modified by rank

    // Combat Style Skill Calculation
    const woundPenalty = Number(actorData.system.woundPenalty)
    const fatiguePenalty = Number(actorData.system.fatigue.penalty)

    let itemChaBonus = skillHelper(actorData, itemData.baseCha)
    let itemSkillBonus = skillModHelper(actorData, this.name)
    let chaTotal = 0;
    if (itemData.baseCha !== undefined && itemData.baseCha !== "" && itemData.baseCha !== "none") {
      chaTotal = Number(actorData.system.characteristics[itemData.baseCha].total + itemData.bonus + itemData.miscValue + itemChaBonus);
    }

    if (actorData.system.wounded) {
      itemData.value = Number(woundPenalty + fatiguePenalty + chaTotal + itemSkillBonus)
    } else {
      itemData.value = Number(fatiguePenalty + chaTotal + itemSkillBonus)
    }

  }

  _prepareMerchantItem(actorData, itemData) {
    itemData.modPrice = (itemData.price + (itemData.price * (actorData.system.priceMod/100))).toFixed(0);
  }

_prepareArmorItem(actorData, itemData) {
  // Ensure location exists for actor.js bucketing.
  // Valid keys in your system: head, body, r_arm, l_arm, r_leg, l_leg, shield
  if (!itemData.category || itemData.category === "") {
    itemData.category = "body";
  }

  // Optional: normalize magic_ar to string to match actor mitigation parsing patterns
  // (only do this if you have already moved to string-based "1 Fire, 2 Magic" formats).
  if (itemData.magic_ar === 0) itemData.magic_ar = "";
}

  _prepareNormalItem(actorData, itemData) {
    // Auto Assigns as a wearable item if the Equipped Toggle is on
    if (itemData.equipped) {itemData.wearable = true}
  }

  _prepareWeaponItem(actorData, itemData) {
    itemData.weapon2H ? itemData.damage3 = itemData.damage2 : itemData.damage3 = itemData.damage
  }

  _prepareModSkillItems(actorData, itemData) {
    if (itemData.skillArray.length == 0) {return}
    for (let entry of itemData.skillArray) {
      let moddedSkill = actorData.items?.find(i => i.name === entry.name)
      if (itemData.equipped) {
        moddedSkill.updateSource({'system.value': moddedSkill.system.value + Number(entry.value)})
      }
    }
  }

  _prepareContainerItem(actorData, itemData) {
    // Need to calculate container stats like current capacity, applied ENC, and item count
    let itemCount = itemData.contained_items.length
    if (!itemData.contained_items) return

    let currentCapacity = 0
    for (let containedItem of itemData.contained_items) {
      let encProduct = containedItem?.item ? containedItem.item.system.enc * containedItem.item.system.quantity : containedItem.system.enc * containedItem.system.quantity
      currentCapacity = Math.ceil(currentCapacity + (encProduct))
    }

    // let currentCapacity = itemData.contained_items.reduce((a, b) => {a + (b.item.system.enc * b.item.system.quantity)}, 0)
    let appliedENC = (currentCapacity / 2)

    itemData.container_enc.item_count = itemCount
    itemData.container_enc.current = currentCapacity
    itemData.container_enc.applied_enc = appliedENC

  }

  async _duplicateContainedItemsOnActor(actorData, itemData) {
    let itemsToDuplicate = []
    let containedItems = []
    for (let containedItem of itemData.system.contained_items) {
      containedItem.item.system.containerStats.container_id = itemData._id
      itemsToDuplicate.push(containedItem.item)
      containedItems.push(containedItem)
    }

    if (itemsToDuplicate.length == 0 || !actorData) return
    let createdContainedItems = await actorData.createEmbeddedDocuments("Item", itemsToDuplicate)

    // Loop through newly created items and grab their new ID's to store in the container contained_items array
    this.system.contained_items = await this._assignNewlyCreatedItemDataToContainer(createdContainedItems, actorData, itemData)
  }

  async _assignNewlyCreatedItemDataToContainer(createdContainedItems, actorData, itemData) {
      // Loop through newly created items and grab their new ID's to store in the container contained_items array
      let newContainedItems = []
      for (let newItem of await createdContainedItems) {
        newContainedItems.push({_id: newItem._id, item: newItem})
      }
      return newContainedItems
  }

  /**
   * Prepare data specific to armor items
   * @param {*} itemData
   * @param {*} actorData
   */

  _untrainedException(actorData) {
    let attribute = actorData.items?.filter(item => item.system.untrainedException == true);
    const legacyUntrained = game.settings.get("uesrpg-3ev4", "legacyUntrainedPenalty");
    let x = 0;
    if (this.type === "combatStyle"){
      if (legacyUntrained === true) {
        if (attribute.length >= 1) {
          x = 10; }
      } else if (attribute.length >= 1) {
        x = 20;
    }
  }
    return x
  }

}
