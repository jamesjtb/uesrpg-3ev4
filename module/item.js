/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Item}
 */
export class SimpleItem extends Item {

  async prepareData() {
    super.prepareData();

    // Get the Item's data
    const itemData = this.data.data

    // Prepare data based on item type
    if (this.type === 'combatStyle'||this.type === 'skill'||this.type === 'magicSkill') {
      if (this.isEmbedded) {
        // Get the data of the actor that owns the item
        const actor = await this.actor;
        const actorData = await this.actor.data;
        if (actor && actorData) {
        this._prepareCombatStyleData(actorData, itemData);
        }
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
    if (actorData.data.wounded === true) {
      if (data.baseCha === "str") {
        data.value = actorData.data.characteristics.str.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "end") {
        data.value = actorData.data.characteristics.end.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "agi") {
        data.value = actorData.data.characteristics.agi.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "int") {
        data.value = actorData.data.characteristics.int.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "wp") {
        data.value = actorData.data.characteristics.wp.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "prc") {
        data.value = actorData.data.characteristics.prc.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "prs") {
        data.value = actorData.data.characteristics.prs.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "lck") {
        data.value = actorData.data.characteristics.lck.total + actorData.data.woundPenalty + data.bonus;
        this.update({"data.value" : data.value});
      }

    } else {
      if (data.baseCha === "str") {
        data.value = actorData.data.characteristics.str.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "end") {
        data.value = actorData.data.characteristics.end.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "agi") {
        data.value = actorData.data.characteristics.agi.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "int") {
        data.value = actorData.data.characteristics.int.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "wp") {
        data.value = actorData.data.characteristics.wp.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "prc") {
        data.value = actorData.data.characteristics.prc.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "prs") {
        data.value = actorData.data.characteristics.prs.total + data.bonus;
        this.update({"data.value" : data.value});
      } else if (data.baseCha === "lck") {
        data.value = actorData.data.characteristics.lck.total + data.bonus;
        this.update({"data.value" : data.value});
      }
    }
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
