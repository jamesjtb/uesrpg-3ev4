/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
export class SimpleItem extends Item {
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    switch (data.type) {
      case 'combatStyle':
      case 'skill':
      case 'magicSkill':
        this.data.update({'data.rank': 'untrained'})
    }
  }

  async prepareData() {
    super.prepareData();

    // Get the Item's data & Actor's Data
    const itemData = this.data.data
    const actorData = this.actor ? this.actor.data : {}

    // Prepare data based on item type

    if (this.isEmbedded && actorData) {
      if (this.data.data.hasOwnProperty('baseCha')) {this._prepareCombatStyleData(actorData, itemData)}
      if (this.data.data.hasOwnProperty('modPrice')) {this._prepareMerchantItem(actorData, itemData)}
      if (this.data.data.hasOwnProperty('damaged')) {this._prepareArmorItem(actorData, itemData)}
      if (this.data.type === 'weapon') {this._prepareWeaponItem(actorData, itemData)}
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
    const data = itemData;

    //Skill Bonus Calculation
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");

    //Combat Style Skill Bonus Calculation
    if (legacyUntrained) {
        if (data.rank === "untrained") {
          data.bonus = -20 + this._untrainedException(actorData);
        } else if (data.rank === "novice") {
          data.bonus = 0;
        } else if (data.rank === "apprentice") {
          data.bonus = 10;
        } else if (data.rank === "journeyman") {
          data.bonus = 20;
        } else if (data.rank === "adept") {
          data.bonus = 30;
        } else if (data.rank === "expert") {
          data.bonus = 40;
        } else if (data.rank === "master") {
          data.bonus = 50;
      }

    } else {
          if (data.rank == "untrained") {
            data.bonus = -10 + this._untrainedException(actorData);
          } else if (data.rank === "novice") {
            data.bonus = 0;
          } else if (data.rank === "apprentice") {
            data.bonus = 10;
          } else if (data.rank === "journeyman") {
            data.bonus = 20;
          } else if (data.rank === "adept") {
            data.bonus = 30;
          } else if (data.rank === "expert") {
            data.bonus = 40;
          } else if (data.rank === "master") {
            data.bonus = 50;
      }
  }

    // Combat Style Skill Calculation
    const woundPenalty = Number(this.actor.data.data.woundPenalty)
    const fatiguePenalty = Number(this.actor.data.data.fatigue.penalty)

    let chaTotal = 0;
    if (data.baseCha !== undefined && data.baseCha !== "" && data.baseCha !== "none") {
      chaTotal = Number(actorData.data.characteristics[data.baseCha].total + data.bonus + data.miscValue);
    }

    if (this.actor.data.data.wounded) {
      data.value = Number(woundPenalty + fatiguePenalty + chaTotal)
    } else {
      data.value = Number(fatiguePenalty + chaTotal)
    }

  }

  _prepareMerchantItem(actorData, itemData) {
    const data = itemData
    data.modPrice = (data.price + (data.price * (this.actor.data.data.priceMod/100))).toFixed(0);
  }

  _prepareArmorItem(actorData, itemData) {
      
  }

  _prepareWeaponItem(actorData, itemData) {
    itemData.weapon2H ? itemData.damage3 = itemData.damage2 : itemData.damage3 = itemData.damage
  }

  /**
   * Prepare data specific to armor items
   * @param {*} itemData
   * @param {*} actorData
   */

  _untrainedException(actorData) {
    let attribute = this.actor.items.filter(item => item.data.data.untrainedException == true);
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");
    let x = 0;
    if (this.data.type === "combatStyle"){
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
