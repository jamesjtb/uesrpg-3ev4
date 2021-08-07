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
    if (this.type === "magicSkill"||this.type === "skill"||this.type === "combatStyle") {
      if (this.isEmbedded) {
        // Get the data of the actor that owns the item
        const actor = this.actor;
        const actorData = this.actor.data;
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
    if (this.actor.data.data.wounded === true) {
      if (data.baseCha === "str") {
        data.value = this.actor.data.data.characteristics.str.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "end") {
        data.value = this.actor.data.data.characteristics.end.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "agi") {
        data.value = this.actor.data.data.characteristics.agi.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "int") {
        data.value = this.actor.data.data.characteristics.int.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "wp") {
        data.value = this.actor.data.data.characteristics.wp.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "prc") {
        data.value = this.actor.data.data.characteristics.prc.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "prs") {
        data.value = this.actor.data.data.characteristics.prs.total + this.actor.data.data.woundPenalty + data.bonus;
      } else if (data.baseCha === "lck") {
        data.value = this.actor.data.data.characteristics.lck.total + this.actor.data.data.woundPenalty + data.bonus;
      }

    } else {
      if (data.baseCha === "str") {
        data.value = this.actor.data.data.characteristics.str.total + data.bonus;
      } else if (data.baseCha === "end") {
        data.value = this.actor.data.data.characteristics.end.total + data.bonus;
      } else if (data.baseCha === "agi") {
        data.value = this.actor.data.data.characteristics.agi.total + data.bonus;
      } else if (data.baseCha === "int") {
        data.value = this.actor.data.data.characteristics.int.total + data.bonus;
      } else if (data.baseCha === "wp") {
        data.value = this.actor.data.data.characteristics.wp.total + data.bonus;
      } else if (data.baseCha === "prc") {
        data.value = this.actor.data.data.characteristics.prc.total + data.bonus;
      } else if (data.baseCha === "prs") {
        data.value = this.actor.data.data.characteristics.prs.total + data.bonus;
      } else if (data.baseCha === "lck") {
        data.value = this.actor.data.data.characteristics.lck.total + data.bonus;
      }
      this.actor.update({
        "data.characteristics.str.total": this.actor.data.data.characteristics.str.total,
        "data.characteristics.end.total": this.actor.data.data.characteristics.end.total,
        "data.characteristics.agi.total": this.actor.data.data.characteristics.agi.total,
        "data.characteristics.int.total": this.actor.data.data.characteristics.int.total,
        "data.characteristics.wp.total": this.actor.data.data.characteristics.wp.total,
        "data.characteristics.prc.total": this.actor.data.data.characteristics.prc.total,
        "data.characteristics.prs.total": this.actor.data.data.characteristics.prs.total,
        "data.characteristics.lck.total": this.actor.data.data.characteristics.lck.total
      });
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
