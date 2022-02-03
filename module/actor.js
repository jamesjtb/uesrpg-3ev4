/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class SimpleActor extends Actor {
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    if (data.type === "character") {
      this.data.token.update({vision: true, actorLink: true, disposition: 1})
      let skillPack = game.packs.get("uesrpg-d100.standard-skills");
      let collection = await skillPack.getDocuments();
      collection.sort(function (a, b) {
        let nameA = a.name.toUpperCase();
        let nameB = b.name.toUpperCase();
        if (nameA < nameB) {
          return -1;
        } if (nameA > nameB) {
          return 1;
        }
        return 0
      });
      this.data.update({
        items: collection.map(i => i.toObject())
      });
    }
  }

  prepareData() {
    super.prepareData();

    const actorData = this.data;
    const data = actorData.data;
    const flags = actorData.flags;

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    if (actorData.type === 'character') this._prepareCharacterData(actorData);
    if (actorData.type === 'npc') this._prepareNPCData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const data = actorData.data;

    //Add bonuses from items to Characteristics
    data.characteristics.str.total = data.characteristics.str.base + this._strBonusCalc(actorData);
    data.characteristics.end.total = data.characteristics.end.base + this._endBonusCalc(actorData);
    data.characteristics.agi.total = data.characteristics.agi.base + this._agiBonusCalc(actorData);
    data.characteristics.int.total = data.characteristics.int.base + this._intBonusCalc(actorData);
    data.characteristics.wp.total = data.characteristics.wp.base + this._wpBonusCalc(actorData);
    data.characteristics.prc.total = data.characteristics.prc.base + this._prcBonusCalc(actorData);
    data.characteristics.prs.total = data.characteristics.prs.base + this._prsBonusCalc(actorData);
    data.characteristics.lck.total = data.characteristics.lck.base + this._lckBonusCalc(actorData);


    //Characteristic Bonuses
    var strBonus = Math.floor(data.characteristics.str.total / 10);
    var endBonus = Math.floor(data.characteristics.end.total / 10);
    var agiBonus = Math.floor(data.characteristics.agi.total / 10);
    var intBonus = Math.floor(data.characteristics.int.total / 10);
    var wpBonus = Math.floor(data.characteristics.wp.total / 10);
    var prcBonus = Math.floor(data.characteristics.prc.total / 10);
    var prsBonus = Math.floor(data.characteristics.prs.total / 10);
    var lckBonus = Math.floor(data.characteristics.lck.total / 10);

  //Set Campaign Rank
  if (data.xpTotal >= 5000) {
    data.campaignRank = "Master"
  } else if (data.xpTotal >= 4000) {
    data.campaignRank = "Expert"
  } else if (data.xpTotal >= 3000) {
    data.campaignRank = "Adept"
  } else if (data.xpTotal >= 2000) {
    data.campaignRank = "Journeyman"
  } else {
    data.campaignRank = "Apprentice"
  }

    //Talent/Power/Trait Resource Bonuses
    data.hp.bonus = this._hpBonus(actorData);
    data.magicka.bonus = this._mpBonus(actorData);
    data.stamina.bonus = this._spBonus(actorData);
    data.luck_points.bonus = this._lpBonus(actorData);
    data.wound_threshold.bonus = this._wtBonus(actorData);
    data.speed.bonus = this._speedBonus(actorData);
    data.initiative.bonus = this._iniBonus(actorData);

    //Talent/Power/Trait Resistance Bonuses
    data.resistance.diseaseR = this._diseaseR(actorData);
    data.resistance.fireR = this._fireR(actorData);
    data.resistance.frostR = this._frostR(actorData);
    data.resistance.shockR = this._shockR(actorData);
    data.resistance.poisonR = this._poisonR(actorData);
    data.resistance.magicR = this._magicR(actorData);
    data.resistance.natToughness = this._natToughnessR(actorData);
    data.resistance.silverR = this._silverR(actorData);
    data.resistance.sunlightR = this._sunlightR(actorData);

    //Derived Calculations
    if (this._isMechanical(actorData) == true) {
      data.wound_threshold.base = strBonus + (endBonus * 2);
    } else {
      data.wound_threshold.base = strBonus + endBonus + wpBonus + (data.wound_threshold.bonus);
    }
    data.wound_threshold.value = data.wound_threshold.base;
    data.wound_threshold.value = this._woundThresholdCalc(actorData);
    
    data.speed.base = strBonus + (2 * agiBonus) + (data.speed.bonus);
    data.speed.value = this._speedCalc(actorData);
    data.speed.swimSpeed = parseFloat(this._swimCalc(actorData)) + parseFloat((data.speed.value/2).toFixed(0));
    data.speed.flySpeed = this._flyCalc(actorData);

    data.initiative.base = agiBonus + intBonus + prcBonus + (data.initiative.bonus);
    data.initiative.value = data.initiative.base;
    data.initiative.value = this._iniCalc(actorData);

    data.hp.base = Math.ceil(data.characteristics.end.total / 2);
    data.hp.max = data.hp.base + data.hp.bonus;

    data.magicka.max = data.characteristics.int.total + data.magicka.bonus + this._addIntToMP(actorData);

    data.stamina.max = endBonus + data.stamina.bonus;

    data.luck_points.max = lckBonus + data.luck_points.bonus;

    data.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + data.carry_rating.bonus;
    data.carry_rating.current = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1);

    //Form Shift Calcs
    if (this._wereWolfForm(actorData) === true) {
      data.resistance.silverR = data.resistance.silverR - 5;
      data.resistance.diseaseR = data.resistance.diseaseR + 200;
      data.hp.max = data.hp.max + 5;
      data.stamina.max = data.stamina.max + 1;
      data.speed.base = data.speed.base + 9;
      data.speed.value = this._speedCalc(actorData);
      data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
      data.resistance.natToughness = 5;
      data.wound_threshold.value = data.wound_threshold.value + 5;
      data.action_points.max = data.action_points.max - 1;
      actorData.items.find(i => i.name === 'Survival').data.data.miscValue = 30;
      actorData.items.find(i => i.name === 'Navigate').data.data.miscValue = 30;
      actorData.items.find(i => i.name === 'Observe').data.data.miscValue = 30;
    } else if (this._wereBatForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.stamina.max = data.stamina.max + 1;
        data.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        data.speed.flySpeed = data.speed.base + 9;
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 3;
        data.action_points.max = data.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').data.data.miscValue = 30;
      actorData.items.find(i => i.name === 'Navigate').data.data.miscValue = 30;
      actorData.items.find(i => i.name === 'Observe').data.data.miscValue = 30;
    } else if (this._wereBoarForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.speed.base = data.speed.base + 9;
        data.speed.value = this._speedCalc(actorData);
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 7;
        data.wound_threshold.value = data.wound_threshold.value + 5;
        data.action_points.max = data.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').data.data.miscValue = 30;
    } else if (this._wereBearForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 10;
        data.stamina.max = data.stamina.max + 1;
        data.speed.base = data.speed.base + 5;
        data.speed.value = this._speedCalc(actorData);
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 5;
        data.action_points.max = data.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').data.data.miscValue = 30;
    } else if (this._wereCrocodileForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.stamina.max = data.stamina.max + 1;
        data.speed.value = (this._addHalfSpeed(actorData)).toFixed(0);
        data.speed.swimSpeed = parseFloat(this._speedCalc(actorData)) + 9;
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 5;
        data.action_points.max = data.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').data.data.miscValue = 30;
    } else if (this._wereVultureForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.stamina.max = data.stamina.max + 1;
        data.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        data.speed.flySpeed = data.speed.base + 9;
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 3;
        data.action_points.max = data.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').data.data.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').data.data.miscValue = 30;
    } else if (this._vampireLordForm(actorData) === true) {
        data.resistance.fireR = data.resistance.fireR - 1;
        data.resistance.sunlightR = data.resistance.sunlightR - 1;
        data.speed.flySpeed = 5;
        data.hp.max = data.hp.max + 5;
        data.magicka.max = data.magicka.max + 25;
        data.resistance.natToughness = 3;
    }

    //Speed Recalculation
    data.speed.value = this._addHalfSpeed(actorData);

    //ENC Burden Calculations
    if (data.carry_rating.current > data.carry_rating.max * 3) {
      data.speed.value = 0;
      data.stamina.max = data.stamina.max - 5;
    } else if (data.carry_rating.current > data.carry_rating.max * 2) {
      data.speed.value = Math.floor(data.speed.base / 2);
      data.stamina.max = data.stamina.max - 3;
    } else if (data.carry_rating.current > data.carry_rating.max) {
      data.speed.value = data.speed.value - 1;
      data.stamina.max = data.stamina.max - 1;
    }

    //Armor Weight Class Calculations
    if (data.armor_class == "super_heavy") {
      data.speed.value = data.speed.value - 3;
      data.speed.swimSpeed = data.speed.swimSpeed - 3;
    } else if (data.armor_class == "heavy") {
      data.speed.value = data.speed.value - 2;
      data.speed.swimSpeed = data.speed.swimSpeed - 2;
    } else if (data.armor_class == "medium") {
      data.speed.value = data.speed.value - 1;
      data.speed.swimSpeed = data.speed.swimSpeed - 1;
    } else {
      data.speed.value = data.speed.value;
      data.speed.swimSpeed = data.speed.swimSpeed;
    }

    //Wounded Penalties
    let woundPen = -20;
    data.woundPenalty = woundPen;

    if (this._painIntolerant(actorData) === true) {
      woundPen = -30;
      data.woundPenalty = woundPen;
    }

    let halfWound = woundPen / 2;
    let woundIni = -2;
    let halfWoundIni = woundIni / 2;

    if (data.wounded == true) {
      if (this._halfWoundPenalty(actorData) === true) {
        for (var skill in data.skills) {
          data.skills[skill].tn = data.skills[skill].tn + halfWound;
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = data.magic_skills[skill].tn + halfWound;
        }
        for (var skill in data.combat_styles) {
          data.combat_styles[skill].tn = data.combat_styles[skill].tn + halfWound;
        }
        data.initiative.value = data.initiative.base + halfWoundIni;
        data.woundPenalty = halfWound;

      } else if (this._halfWoundPenalty(actorData) === false) {
        for (var skill in data.skills) {
          data.skills[skill].tn = data.skills[skill].tn + woundPen;
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = data.magic_skills[skill].tn + woundPen;
        }
        for (var skill in data.combat_styles) {
          data.combat_styles[skill].tn = data.combat_styles[skill].tn + woundPen;
        }
        data.initiative.value = data.initiative.base + woundIni;
        data.woundPenalty = woundPen;
      }
    }

    //Fatigue Penalties
    if (data.stamina.value == -1) {
      for (var skill in data.skills) {
        data.fatigueLevel = -10;
        data.skills[skill].tn = data.skills[skill].tn + this._halfFatiguePenalty(actorData);
      }
      for (var skill in data.magic_skills) {
        data.fatigueLevel = -10;
        data.magic_skills[skill].tn = data.magic_skills[skill].tn + this._halfFatiguePenalty(actorData);
      }
      for (var skill in data.combat_styles) {
        data.fatigueLevel = -10;
        data.combat_styles[skill].tn = data.combat_styles[skill].tn + this._halfFatiguePenalty(actorData);
      }

    } else if (data.stamina.value == -2) {
        for (var skill in data.skills) {
        data.fatigueLevel = -20;
        data.skills[skill].tn = data.skills[skill].tn + this._halfFatiguePenalty(actorData);
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = data.magic_skills[skill].tn -20 + this._halfFatiguePenalty(actorData);
          data.fatigueLevel = -20;
        }
        for (var skill in data.combat_styles) {
          data.fatigueLevel = -20;
          data.combat_styles[skill].tn = data.combat_styles[skill].tn + this._halfFatiguePenalty(actorData);
        }

    } else if (data.stamina.value == -3) {
        for (var skill in data.skills) {
        data.fatigueLevel = -30;
        data.skills[skill].tn = data.skills[skill].tn + this._halfFatiguePenalty(actorData);
        }
        for (var skill in data.magic_skills) {
          data.fatigueLevel = -30;
          data.magic_skills[skill].tn = data.magic_skills[skill].tn + this._halfFatiguePenalty(actorData);
        }
        for (var skill in data.combat_styles) {
          data.fatigueLevel = -30;
          data.combat_styles[skill].tn = data.combat_styles[skill].tn + this._halfFatiguePenalty(actorData);
        }

    } else if (data.stamina.value == -4) {
        for (var skill in data.skills) {
        data.skills[skill].tn = 0;
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = 0;
        }
        for (var skill in data.combat_styles) {
          data.combat_styles[skill].tn = 0;
        }

    } else if (data.stamina.value <= -5) {
        for (var skill in data.skills) {
        data.skills[skill].tn = 0;
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = 0;
        }
        for (var skill in data.combat_styles) {
          data.combat_styles[skill].tn = 0;
        }
      }

  } 

  _prepareNPCData(actorData) {
    const data = actorData.data;

    //Add bonuses from items to Characteristics
    data.characteristics.str.total = data.characteristics.str.base + this._strBonusCalc(actorData);
    data.characteristics.end.total = data.characteristics.end.base + this._endBonusCalc(actorData);
    data.characteristics.agi.total = data.characteristics.agi.base + this._agiBonusCalc(actorData);
    data.characteristics.int.total = data.characteristics.int.base + this._intBonusCalc(actorData);
    data.characteristics.wp.total = data.characteristics.wp.base + this._wpBonusCalc(actorData);
    data.characteristics.prc.total = data.characteristics.prc.base + this._prcBonusCalc(actorData);
    data.characteristics.prs.total = data.characteristics.prs.base + this._prsBonusCalc(actorData);
    data.characteristics.lck.total = data.characteristics.lck.base + this._lckBonusCalc(actorData);


    //Characteristic Bonuses
    var strBonus = Math.floor(data.characteristics.str.total / 10);
    var endBonus = Math.floor(data.characteristics.end.total / 10);
    var agiBonus = Math.floor(data.characteristics.agi.total / 10);
    var intBonus = Math.floor(data.characteristics.int.total / 10);
    var wpBonus = Math.floor(data.characteristics.wp.total / 10);
    var prcBonus = Math.floor(data.characteristics.prc.total / 10);
    var prsBonus = Math.floor(data.characteristics.prs.total / 10);
    var lckBonus = Math.floor(data.characteristics.lck.total / 10);

    //Talent/Power/Trait Bonuses
    data.hp.bonus = this._hpBonus(actorData);
    data.magicka.bonus = this._mpBonus(actorData);
    data.stamina.bonus = this._spBonus(actorData);
    data.luck_points.bonus = this._lpBonus(actorData);
    data.wound_threshold.bonus = this._wtBonus(actorData);
    data.speed.bonus = this._speedBonus(actorData);
    data.initiative.bonus = this._iniBonus(actorData);

    //Talent/Power/Trait Resistance Bonuses
    data.resistance.diseaseR = this._diseaseR(actorData);
    data.resistance.fireR = this._fireR(actorData);
    data.resistance.frostR = this._frostR(actorData);
    data.resistance.shockR = this._shockR(actorData);
    data.resistance.poisonR = this._poisonR(actorData);
    data.resistance.magicR = this._magicR(actorData);
    data.resistance.natToughness = this._natToughnessR(actorData);
    data.resistance.silverR = this._silverR(actorData);
    data.resistance.sunlightR = this._sunlightR(actorData);

    //Derived Calculations
    if (this._isMechanical(actorData) == true) {
      data.wound_threshold.base = strBonus + (endBonus * 2);
    } else {
      data.wound_threshold.base = strBonus + endBonus + wpBonus + (data.wound_threshold.bonus);
    }
    data.wound_threshold.value = data.wound_threshold.base;
    data.wound_threshold.value = this._woundThresholdCalc(actorData);

    if (this._dwemerSphere(actorData) == true) {
      data.speed.base = 16;
      data.professions.evade = 70;
    } else {
        data.speed.base = strBonus + (2 * agiBonus) + (data.speed.bonus);
    }
    data.speed.value = this._speedCalc(actorData);
    data.speed.swimSpeed = parseFloat(this._swimCalc(actorData)) + parseFloat((data.speed.value/2).toFixed(0));
    data.speed.flySpeed = this._flyCalc(actorData);

    data.initiative.base = agiBonus + intBonus + prcBonus + (data.initiative.bonus);
    data.initiative.value = data.initiative.base;
    data.initiative.value = this._iniCalc(actorData);

    data.hp.base = Math.ceil(data.characteristics.end.total / 2);
    data.hp.max = data.hp.base + data.hp.bonus;

    data.magicka.max = data.characteristics.int.total + data.magicka.bonus + this._addIntToMP(actorData);

    data.stamina.max = endBonus + data.stamina.bonus;

    data.luck_points.max = lckBonus + data.luck_points.bonus;

    data.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + data.carry_rating.bonus;
    data.carry_rating.current = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1);

    //Form Shift Calcs
    if (this._wereWolfForm(actorData) === true) {
      data.resistance.silverR = data.resistance.silverR - 5;
      data.resistance.diseaseR = data.resistance.diseaseR + 200;
      data.hp.max = data.hp.max + 5;
      data.stamina.max = data.stamina.max + 1;
      data.speed.base = data.speed.base + 9;
      data.speed.value = this._speedCalc(actorData);
      data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
      data.resistance.natToughness = 5;
      data.wound_threshold.value = data.wound_threshold.value + 5;
      data.action_points.max = data.action_points.max - 1;
    } else if (this._wereBatForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.stamina.max = data.stamina.max + 1;
        data.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        data.speed.flySpeed = data.speed.base + 9;
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 3;
        data.action_points.max = data.action_points.max - 1;
    } else if (this._wereBoarForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.speed.base = data.speed.base + 9;
        data.speed.value = this._speedCalc(actorData);
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 7;
        data.wound_threshold.value = data.wound_threshold.value + 5;
        data.action_points.max = data.action_points.max - 1;
    } else if (this._wereBearForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 10;
        data.stamina.max = data.stamina.max + 1;
        data.speed.base = data.speed.base + 5;
        data.speed.value = this._speedCalc(actorData);
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 5;
        data.action_points.max = data.action_points.max - 1;
    } else if (this._wereCrocodileForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.stamina.max = data.stamina.max + 1;
        data.speed.value = (this._addHalfSpeed(actorData)).toFixed(0);
        data.speed.swimSpeed = parseFloat(this._speedCalc(actorData)) + 9;
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 5;
        data.action_points.max = data.action_points.max - 1;

    } else if (this._wereVultureForm(actorData) === true) {
        data.resistance.silverR = data.resistance.silverR - 5;
        data.resistance.diseaseR = data.resistance.diseaseR + 200;
        data.hp.max = data.hp.max + 5;
        data.stamina.max = data.stamina.max + 1;
        data.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        data.speed.flySpeed = data.speed.base + 9;
        data.speed.swimSpeed = (data.speed.value/2).toFixed(0);
        data.resistance.natToughness = 5;
        data.wound_threshold.value = data.wound_threshold.value + 3;
        data.action_points.max = data.action_points.max - 1;
    }else if (this._vampireLordForm(actorData) === true) {
        data.resistance.fireR = data.resistance.fireR - 1;
        data.resistance.sunlightR = data.resistance.sunlightR - 1;
        data.speed.flySpeed = 5;
        data.hp.max = data.hp.max + 5;
        data.magicka.max = data.magicka.max + 25;
        data.resistance.natToughness = 3;
    }

    //Speed Recalculation
    data.speed.value = this._addHalfSpeed(actorData);

    //ENC Burden Calculations
    if (data.carry_rating.current > data.carry_rating.max * 3) {
      data.speed.base = 0;
      data.stamina.max = data.stamina.max - 5;
    } else if (data.carry_rating.current > data.carry_rating.max * 2) {
      data.speed.base = Math.floor(data.speed.base / 2);
      data.stamina.max = data.stamina.max - 3;
    } else if (data.carry_rating.current > data.carry_rating.max) {
      data.speed.base = data.speed.base - 1;
      data.stamina.max = data.stamina.max - 1;
    }

    //Armor Weight Class Calculations
    if (data.armor_class == "super_heavy") {
      data.speed.value = data.speed.value - 3;
      data.speed.swimSpeed = data.speed.swimSpeed - 3;
    } else if (data.armor_class == "heavy") {
      data.speed.value = data.speed.value - 2;
      data.speed.swimSpeed = data.speed.swimSpeed - 2;
    } else if (data.armor_class == "medium") {
      data.speed.value = data.speed.value - 1;
      data.speed.swimSpeed = data.speed.swimSpeed - 1;
    } else {
      data.speed.value = data.speed.value;
      data.speed.swimSpeed = data.speed.swimSpeed;
    }

    //Wounded Penalties
    let woundPen = -20;
    let halfWound = woundPen / 2;
    let woundIni = -2;
    let halfWoundIni = woundIni / 2;

    if (this._painIntolerant(actorData) == true) {
      woundPen = -30;
    } else {
      woundPen = -20;
    }

    data.woundPenalty = woundPen

    // Set Skill professions to regular professions (This is a fucking mess, but it's the way it's done for now...)
    for (let prof in data.professions) {
      if (prof === 'profession1'||prof === 'profession2'||prof === 'profession3'||prof === 'commerce') {
        data.professions[prof] === 0 ? data.professions[prof] = data.skills[prof].tn : data.professions[prof] = 0
      }
    }


    if (data.wounded === true) {
      if (this._halfWoundPenalty(actorData) === true) {
        for (var skill in data.professionsWound) {
          data.professionsWound[skill] = data.professions[skill] + halfWound;
        }
        data.initiative.value = data.initiative.base + halfWoundIni;
      } else if (this._halfWoundPenalty(actorData) === false) {
        for (var skill in data.professionsWound) {
          data.professionsWound[skill] = data.professions[skill] + woundPen;
        }
        data.initiative.value = data.initiative.base + woundIni;
        }
      } else if (data.wounded === false) {
          for (var skill in data.professionsWound) {
           data.professionsWound[skill] = data.professions[skill];
        }
      }

    //Fatigue Penalties
    if (data.stamina.value == -1) {
      for (var skill in data.professions) {
        data.fatigueLevel = -10;
        data.professions[skill] = data.professions[skill] + this._halfFatiguePenalty(actorData);
      }
      for (var skill in data.skills) {
        data.fatigueLevel = -10;
        data.skills[skill].bonus = data.skills[skill].tn + this._halfFatiguePenalty(actorData);
      }
      
    } else if (data.stamina.value == -2) {
        for (var skill in data.professions) {
          data.fatigueLevel = -20;
          data.professions[skill] = data.professions[skill] + this._halfFatiguePenalty(actorData);
      }
      for (var skill in data.skills) {
        data.fatigueLevel = -20;
        data.skills[skill].bonus = data.skills[skill].tn + this._halfFatiguePenalty(actorData);
      }

    } else if (data.stamina.value == -3) {
        for (var skill in data.professions) {
          data.fatigueLevel = -30;
          data.professions[skill] = data.professions[skill] + this._halfFatiguePenalty(actorData);
      }
      for (var skill in data.skills) {
        data.fatigueLevel = -30;
        data.skills[skill].bonus = data.skills[skill].tn + this._halfFatiguePenalty(actorData);
      }

    } else if (data.stamina.value == -4) {
        for (var skill in data.professions) {
        data.professions[skill] = 0;
      }
      for (var skill in data.skills) {
        data.skills[skill].bonus = 0;
      }

    } else if (data.stamina.value <= -5) {
        for (var skill in data.professions) {
          data.professions[skill] = 0;
      }
      for (var skill in data.skills) {
        data.skills[skill].bonus = 0;
      }
    }

    // Set Lucky/Unlucky Numbers based on Threat Category
    if (data.threat == "minorSolo") {
      data.unlucky_numbers.ul1 = 95;
      data.unlucky_numbers.ul2 = 96;
      data.unlucky_numbers.ul3 = 97;
      data.unlucky_numbers.ul4 = 98;
      data.unlucky_numbers.ul5 = 99;
      data.unlucky_numbers.ul6 = 100;
      data.lucky_numbers.ln1 = 0;
      data.lucky_numbers.ln2 = 0;
      data.lucky_numbers.ln3 = 0;
      data.lucky_numbers.ln4 = 0;
      data.lucky_numbers.ln5 = 0;
      data.lucky_numbers.ln6 = 0;
      data.lucky_numbers.ln7 = 0;
      data.lucky_numbers.ln8 = 0;
      data.lucky_numbers.ln9 = 0;
      data.lucky_numbers.ln10 = 0;
    } else if (data.threat == "minorGroup") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 96;
      data.unlucky_numbers.ul3 = 97;
      data.unlucky_numbers.ul4 = 98;
      data.unlucky_numbers.ul5 = 99;
      data.unlucky_numbers.ul6 = 100;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 0;
      data.lucky_numbers.ln3 = 0;
      data.lucky_numbers.ln4 = 0;
      data.lucky_numbers.ln5 = 0;
      data.lucky_numbers.ln6 = 0;
      data.lucky_numbers.ln7 = 0;
      data.lucky_numbers.ln8 = 0;
      data.lucky_numbers.ln9 = 0;
      data.lucky_numbers.ln10 = 0;
    } else if (data.threat == "majorSolo") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 0;
      data.unlucky_numbers.ul3 = 97;
      data.unlucky_numbers.ul4 = 98;
      data.unlucky_numbers.ul5 = 99;
      data.unlucky_numbers.ul6 = 100;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 2;
      data.lucky_numbers.ln3 = 0;
      data.lucky_numbers.ln4 = 0;
      data.lucky_numbers.ln5 = 0;
      data.lucky_numbers.ln6 = 0;
      data.lucky_numbers.ln7 = 0;
      data.lucky_numbers.ln8 = 0;
      data.lucky_numbers.ln9 = 0;
      data.lucky_numbers.ln10 = 0;
    } else if (data.threat == "majorGroup") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 0;
      data.unlucky_numbers.ul3 = 0;
      data.unlucky_numbers.ul4 = 98;
      data.unlucky_numbers.ul5 = 99;
      data.unlucky_numbers.ul6 = 100;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 2;
      data.lucky_numbers.ln3 = 3;
      data.lucky_numbers.ln4 = 0;
      data.lucky_numbers.ln5 = 0;
      data.lucky_numbers.ln6 = 0;
      data.lucky_numbers.ln7 = 0;
      data.lucky_numbers.ln8 = 0;
      data.lucky_numbers.ln9 = 0;
      data.lucky_numbers.ln10 = 0;
    } else if (data.threat == "deadlySolo") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 0;
      data.unlucky_numbers.ul3 = 0;
      data.unlucky_numbers.ul4 = 0;
      data.unlucky_numbers.ul5 = 99;
      data.unlucky_numbers.ul6 = 100;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 2;
      data.lucky_numbers.ln3 = 3;
      data.lucky_numbers.ln4 = 4;
      data.lucky_numbers.ln5 = 0;
      data.lucky_numbers.ln6 = 0;
      data.lucky_numbers.ln7 = 0;
      data.lucky_numbers.ln8 = 0;
      data.lucky_numbers.ln9 = 0;
      data.lucky_numbers.ln10 = 0;
    } else if (data.threat == "deadlyGroup") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 0;
      data.unlucky_numbers.ul3 = 0;
      data.unlucky_numbers.ul4 = 0;
      data.unlucky_numbers.ul5 = 0;
      data.unlucky_numbers.ul6 = 100;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 2;
      data.lucky_numbers.ln3 = 3;
      data.lucky_numbers.ln4 = 4;
      data.lucky_numbers.ln5 = 5;
      data.lucky_numbers.ln6 = 0;
      data.lucky_numbers.ln7 = 0;
      data.lucky_numbers.ln8 = 0;
      data.lucky_numbers.ln9 = 0;
      data.lucky_numbers.ln10 = 0;
    } else if (data.threat == "legendarySolo") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 0;
      data.unlucky_numbers.ul3 = 0;
      data.unlucky_numbers.ul4 = 0;
      data.unlucky_numbers.ul5 = 0;
      data.unlucky_numbers.ul6 = 0;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 2;
      data.lucky_numbers.ln3 = 3;
      data.lucky_numbers.ln4 = 4;
      data.lucky_numbers.ln5 = 5;
      data.lucky_numbers.ln6 = 6;
      data.lucky_numbers.ln7 = 7;
      data.lucky_numbers.ln8 = 8;
      data.lucky_numbers.ln9 = 9;
      data.lucky_numbers.ln10 = 10;
    } else if (data.threat == "legendaryGroup") {
      data.unlucky_numbers.ul1 = 0;
      data.unlucky_numbers.ul2 = 0;
      data.unlucky_numbers.ul3 = 0;
      data.unlucky_numbers.ul4 = 0;
      data.unlucky_numbers.ul5 = 0;
      data.unlucky_numbers.ul6 = 0;
      data.lucky_numbers.ln1 = 1;
      data.lucky_numbers.ln2 = 2;
      data.lucky_numbers.ln3 = 3;
      data.lucky_numbers.ln4 = 4;
      data.lucky_numbers.ln5 = 5;
      data.lucky_numbers.ln6 = 6;
      data.lucky_numbers.ln7 = 7;
      data.lucky_numbers.ln8 = 8;
      data.lucky_numbers.ln9 = 9;
      data.lucky_numbers.ln10 = 10;
    }

  }

  _strBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.strChaBonus;
    }
    return totalBonus
  }

  _endBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.endChaBonus;
    }
    return totalBonus
  }

  _agiBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.agiChaBonus;
    }
    return totalBonus
  }

  _intBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.intChaBonus;
    }
    return totalBonus
  }

  _wpBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.wpChaBonus;
    }
    return totalBonus
  }

  _prcBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.prcChaBonus;
    }
    return totalBonus
  }

  _prsBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.prsChaBonus;
    }
    return totalBonus
  }

  _lckBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.data.data.characteristicBonus.lckChaBonus;
    }
    return totalBonus
  }

  _calculateENC(actorData) {
    let weighted = actorData.items.filter(item => item.data.data.hasOwnProperty("enc"));
    let totalWeight = 0.0;
    for (let item of weighted) {
      totalWeight = totalWeight + (item.data.data.enc * item.data.data.quantity);
    }
    return totalWeight
  }

  _armorWeight(actorData) {
    let worn = actorData.items.filter(item => item.data.data.equipped == true);
    let armorENC = 0.0;
    for (let item of worn) {
      armorENC = armorENC + ((item.data.data.enc / 2) * item.data.data.quantity);
    } 
    return armorENC
  }

  _excludeENC(actorData) {
    let excluded = actorData.items.filter(item => item.data.data.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      totalWeight = totalWeight + (item.data.data.enc * item.data.data.quantity);
    }
    return totalWeight
  }

  _hpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("hpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.hpBonus;
    }
    return bonus
  }

  _mpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("mpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.mpBonus;
    }
    return bonus
  }

  _spBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("spBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.spBonus;
    }
    return bonus
  }

  _lpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("lpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.lpBonus;
    }
    return bonus
  }

  _wtBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("wtBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.wtBonus;
    }
    return bonus
  }

  _speedBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("speedBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.speedBonus;
    }
    return bonus
  }

  _iniBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("iniBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.iniBonus;
    }
    return bonus
  }

  _diseaseR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("diseaseR"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.diseaseR;
    }
    return bonus
  }

  _fireR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("fireR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.fireR;
      }
      return bonus
  }

  _frostR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("frostR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.frostR;
      }
      return bonus
  }

  _shockR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("shockR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.shockR;
      }
      return bonus
  }

  _poisonR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("poisonR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.poisonR;
      }
      return bonus
  }

  _magicR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("magicR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.magicR;
      }
      return bonus
  }

  _natToughnessR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("natToughnessR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.natToughnessR;
      }
      return bonus
  }

  _silverR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("silverR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.silverR;
      }
      return bonus
  }

  _sunlightR(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("sunlightR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.data.sunlightR;
      }
      return bonus
  }

  _swimCalc(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("swimBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.swimBonus;
    }
    return bonus
  }

  _flyCalc(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.hasOwnProperty("flyBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.data.flyBonus;
    }
    return bonus
  }

  _speedCalc(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.halfSpeed === true);
    let speed = actorData.data.speed.base;
    if (attribute.length === 0) {
      speed = speed;
    } else if (attribute.length >= 1) {
      speed = Math.ceil(speed/2);
    }
    return speed;
  }

  _iniCalc(actorData) {
    let attribute = actorData.items.filter(item => item.type == "trait"|| item.type == "talent");
    let init = actorData.data.initiative.base;
      for (let item of attribute) {
        if (item.data.data.replace.ini.iniToggle == true) {
          if (item.data.data.replace.ini.characteristic == "str") {
            init = Math.floor(actorData.data.characteristics.str.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "end") {
            init = Math.floor(actorData.data.characteristics.end.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "agi") {
            init = Math.floor(actorData.data.characteristics.agi.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "int") {
            init = Math.floor(actorData.data.characteristics.int.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "wp") {
            init = Math.floor(actorData.data.characteristics.wp.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "prc") {
            init = Math.floor(actorData.data.characteristics.prc.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "prs") {
            init = Math.floor(actorData.data.characteristics.prs.total / 10) * 3;
          } else if (item.data.data.replace.ini.characteristic == "lck") {
            init = Math.floor(actorData.data.characteristics.lck.total / 10) * 3;
          }
        }
      }
    return init;
  }

  _woundThresholdCalc(actorData) {
    let attribute = actorData.items.filter(item => item.type === "trait"|| item.type === "talent");
    let wound = actorData.data.wound_threshold.base;
      for (let item of attribute) {
        if (item.data.data.replace.wt.wtToggle === true) {
          if (item.data.data.replace.wt.characteristic === "str") {
            wound = Math.floor(actorData.data.characteristics.str.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "end") {
            wound = Math.floor(actorData.data.characteristics.end.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "agi") {
            wound = Math.floor(actorData.data.characteristics.agi.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "int") {
            wound = Math.floor(actorData.data.characteristics.int.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "wp") {
            wound = Math.floor(actorData.data.characteristics.wp.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "prc") {
            wound = Math.floor(actorData.data.characteristics.prc.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "prs") {
            wound = Math.floor(actorData.data.characteristics.prs.total / 10) * 3;
          } else if (item.data.data.replace.wt.characteristic === "lck") {
            wound = Math.floor(actorData.data.characteristics.lck.total / 10) * 3;
          }
        }
      }
    return wound;
  }

  _halfFatiguePenalty(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.halfFatiguePenalty == true);
    let fatigueReduction = 0;
    if (attribute.length >= 1) {
      fatigueReduction = actorData.data.fatigueLevel / 2;
    } else {
      fatigueReduction = actorData.data.fatigueLevel;
    }
    return fatigueReduction
  }

  _halfWoundPenalty(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.halfWoundPenalty == true);
    let woundReduction = false;
    if (attribute.length >= 1) {
      woundReduction = true;
    } else {
      woundReduction = false;
    }
    return woundReduction
  }

  _addIntToMP(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.addIntToMP == true);
    let mp = 0;
    if (attribute.length >= 1) {
      mp = actorData.data.characteristics.int.total;
    } else {
      mp = 0;
    }
    return mp
  }

  _untrainedException(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.untrainedException == true);
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

  _isMechanical(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.mechanical == true);
    let isMechanical = false;
    if (attribute.length >= 1) {
      isMechanical = true;
    } else {
      isMechanical = false;
    }
    return isMechanical
  }

  _dwemerSphere(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.shiftForm == true);
    let shift = false;
    if (attribute.length >= 1) {
      for (let item of attribute) {
        if (item.data.data.dailyUse == true) {
          shift = true;
        }
      }
    } else {
      shift = false;
    }
    return shift
  }

  _vampireLordForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormVampireLord");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereWolfForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereWolf"||item.data.data.shiftFormStyle === "shiftFormWereLion");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBatForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereBat");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBoarForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereBoar");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBearForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereBear");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereCrocodileForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereCrocodile");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereVultureForm(actorData) {
    let form = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereVulture");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _painIntolerant(actorData) {
    let attribute = actorData.items.filter(item => item.data.data.painIntolerant == true);
    let pain = false;
    if (attribute.length >= 1) {
      pain = true;
    } 
    return pain
  }

  _addHalfSpeed(actorData) {
    let halfSpeedItems = actorData.items.filter(item => item.data.data.addHalfSpeed === true);
    let isWereCroc = actorData.items.filter(item => item.data.data.shiftFormStyle === "shiftFormWereCrocodile");
    let speed = actorData.data.speed.value;
    if (isWereCroc.length > 0 && halfSpeedItems.length > 0) {
      speed = actorData.data.speed.base;
    } else if (isWereCroc.length == 0 && halfSpeedItems.length > 0) {
      speed = Math.ceil(actorData.data.speed.value/2) + actorData.data.speed.base;
    } else if (isWereCroc.length > 0 && halfSpeedItems.length == 0) {
      speed = Math.ceil(actorData.data.speed.base/2);
    } else {
      speed = actorData.data.speed.value;
    }
    return speed
  }

}
