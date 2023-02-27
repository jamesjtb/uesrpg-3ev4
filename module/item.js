/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
import { skillHelper } from "./skillCalcHelper.js";
import { skillModHelper } from "./skillCalcHelper.js";

export class SimpleItem extends Item {
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    switch (data.type) {
      case 'combatStyle':
      case 'skill':
      case 'magicSkill':
        data.rank = 'untrained'
        // await this.update({_id: this._id}, {'system.rank': 'untrained'})
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
      if (this.system.hasOwnProperty('damaged')) {this._prepareArmorItem(actorData, itemData)}
      if (this.type === 'item') {this._prepareNormalItem(actorData, itemData)}
      if (this.type === 'weapon') {this._prepareWeaponItem(actorData, itemData)}
      if (this.system.hasOwnProperty('skillArray') && actorData.type === 'character') {this._prepareModSkillItems(actorData, itemData)}
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
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");

    //Combat Style Skill Bonus Calculation
    if (legacyUntrained) {
        if (itemData.rank === "untrained") {
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

    } else {
          if (itemData.rank == "untrained") {
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
  }

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
      let moddedSkill = actorData.items.find(i => i.name === entry.name)
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
      currentCapacity = currentCapacity + (encProduct)
    }

    // let currentCapacity = itemData.contained_items.reduce((a, b) => {a + (b.item.system.enc * b.item.system.quantity)}, 0)
    let appliedENC = (currentCapacity / 2)

    itemData.container_enc.item_count = itemCount
    itemData.container_enc.current = currentCapacity
    itemData.container_enc.applied_enc = appliedENC

    // Call function to create items contained in container that are NOT in the actor's current inventory
    // Need to loop through container contents and compare _id's to that in actor's inventory and create those
    // That are not found

    let itemsToDuplicate = []
    for (let containedItem of this.system.contained_items) {
      let sourceObject = this.actor.items.find(i => i._id == containedItem._id || (i.name == containedItem.name && i.system.quantity == containedItem.system.quantity))
      if (sourceObject == null || sourceObject == undefined) {
        let itemOwner = game.actors.find(actor => actor.items.find(i => i._id == containedItem._id) != (undefined || null))
        if (!itemOwner) {
          itemsToDuplicate.push({
            name: containedItem.name,
            type: containedItem.type,
            img: containedItem.img,
            'system.enc': containedItem.enc,
            'system.quantity': containedItem.quantity,
            'system.containerStats.container_id': this._id,
            'system.containerStats.contained': true
          })
        }
        else {
          let duplicateObject = itemOwner.items.find(i => i._id == containedItem._id)
          itemsToDuplicate.push(duplicateObject)
        }
      }
    }
    console.log(itemsToDuplicate)
    // this.actor.createEmbeddedDocuments("Item", itemsToDuplicate)
    
  }

  /**
   * Prepare data specific to armor items
   * @param {*} itemData
   * @param {*} actorData
   */

  _untrainedException(actorData) {
    let attribute = actorData.items.filter(item => item.system.untrainedException == true);
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");
    let x = 0;
    if (this.type === "combatStyle"){
      if (legacyUntrained === true) {
        if (attribute.length >= 1) {
          x = 20; }
      } else if (attribute.length >= 1) {
        x = 10;
    }
  }
    return x
  }

}
