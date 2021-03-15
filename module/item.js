/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
export class SimpleItem extends Item {

  prepareData() {
    super.prepareData();

    // Get the Item's data
    const itemData = this.data

    // Get the data of the actor that owns the item
    const actorData = this.actor ? this.actor.data : {}

    // Prepare data based on item type
    if (itemData.type === 'combatStyle') {
      if (this.isOwned) {
        this._prepareCombatStyleData(actorData, itemData);
      }
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

  _prepareCombatStyleData(actorData, itemData) {
    const data = itemData.data;

    //Skill Bonus Calculation
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");

    //Combat Style Skill Bonus Calculation
    if (legacyUntrained) {
        if (data.rank == "untrained") {
          data.bonus = -20 + this._untrainedException(actorData);
        } else if (data.rank == "novice") {
          data.bonus = 0;
        } else if (data.rank == "apprentice") {
          data.bonus = 10;
        } else if (data.rank == "journeyman") {
          data.bonus = 20;
        } else if (data.rank == "adept") {
          data.bonus = 30;
        } else if (data.rank == "expert") {
          data.bonus = 40;
        } else if (data.rank == "master") {
          data.bonus = 50;
      }

    } else {
          if (data.rank == "untrained") {
            data.bonus = -10 + this._untrainedException(actorData);
          } else if (data.rank == "novice") {
            data.bonus = 0;
          } else if (data.rank == "apprentice") {
            data.bonus = 10;
          } else if (data.rank == "journeyman") {
            data.bonus = 20;
          } else if (data.rank == "adept") {
            data.bonus = 30;
          } else if (data.rank == "expert") {
            data.bonus = 40;
          } else if (data.rank == "master") {
            data.bonus = 50;
      }
  }

    // Combat Style Skill Calculation
    if (actorData.data.wounded === false) {
      if (data.baseCha == "str") {
        data.value = actorData.data.characteristics.str.value + data.bonus;
      } else if (data.baseCha == "end") {
        data.value = actorData.data.characteristics.end.value + data.bonus;
      } else if (data.baseCha == "agi") {
        data.value = actorData.data.characteristics.agi.value + data.bonus;
      } else if (data.baseCha == "int") {
        data.value = actorData.data.characteristics.int.value + data.bonus;
      } else if (data.baseCha == "wp") {
        data.value = actorData.data.characteristics.wp.value + data.bonus;
      } else if (data.baseCha == "prc") {
        data.value = actorData.data.characteristics.prc.value + data.bonus;
      } else if (data.baseCha == "prs") {
        data.value = actorData.data.characteristics.prs.value + data.bonus;
      } else if (data.baseCha == "lck") {
        data.value = actorData.data.characteristics.lck.value + data.bonus;
      }
    } else if (actorData.data.wounded === true) {
      if (data.baseCha == "str") {
        data.value = actorData.data.characteristics.str.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "end") {
        data.value = actorData.data.characteristics.end.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "agi") {
        data.value = actorData.data.characteristics.agi.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "int") {
        data.value = actorData.data.characteristics.int.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "wp") {
        data.value = actorData.data.characteristics.wp.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "prc") {
        data.value = actorData.data.characteristics.prc.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "prs") {
        data.value = actorData.data.characteristics.prs.value + actorData.data.woundPenalty + data.bonus;
      } else if (data.baseCha == "lck") {
        data.value = actorData.data.characteristics.lck.value + actorData.data.woundPenalty + data.bonus;
      }
    }
  }

  /**
   * Prepare data specific to armor items
   * @param {*} itemData
   * @param {*} actorData
   */

  _untrainedException(actorData) {
    let attribute = actorData.items.filter(item => item.data.untrainedException == true);
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");
    let x = 0;
    if (legacyUntrained) {
      if (attribute.length >= 1) {
        x = 20;
      }
    } else if (attribute.length >= 1) {
      x = 10;
    }
    return x
  }

}
