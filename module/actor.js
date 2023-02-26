/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */

export class SimpleActor extends Actor {
  async _preCreate(data, options, user) {

    if (this.type === 'character') {
      // Updates token default settings for Character types
      this.prototypeToken.updateSource({
        'sight.enabled': true, 
        actorLink: true, 
        disposition: 1
      })
    }

    // Preps and adds standard skill items to Character types
    await super._preCreate(data, options, user);
    if (this.type === "character") {
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

      this.updateSource({
        _id: this._id,
        items: collection.map(i => i.toObject()),
        'system.size': 'standard'
      })
    }
  }

  prepareData() {
    super.prepareData();

    const actorData = this;
    const data = actorData.system;
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
    const data = actorData.system;

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
      data.carry_rating.label = 'Crushing'
      data.carry_rating.penalty = -40
      data.speed.value = 0;
      data.stamina.max = data.stamina.max - 5;
    } else if (data.carry_rating.current > data.carry_rating.max * 2) {
      data.carry_rating.label = 'Severe'
      data.carry_rating.penalty = -20
      data.speed.value = Math.floor(data.speed.base / 2);
      data.stamina.max = data.stamina.max - 3;
    } else if (data.carry_rating.current > data.carry_rating.max) {
      data.carry_rating.label = 'Moderate'
      data.carry_rating.penalty = -10
      data.speed.value = data.speed.value - 1;
      data.stamina.max = data.stamina.max - 1;
    } else if (data.carry_rating.current <= data.carry_rating.max) {
      data.carry_rating.label = "Minimal"
      data.carry_rating.penalty = 0
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
    if (data.wounded == true) {
      let woundPen = 0
      let woundIni = -2;
      this._painIntolerant(actorData) ? woundPen = -30 : woundPen = -20

      if (this._halfWoundPenalty(actorData) === true) {
        data.woundPenalty = woundPen / 2
        data.initiative.value = data.initiative.base + (woundIni / 2);

      } else if (this._halfWoundPenalty(actorData) === false) {
        data.initiative.value = data.initiative.base + woundIni;
        data.woundPenalty = woundPen;
      }
    }

    //Fatigue Penalties
    data.fatigue.level = data.stamina.value <= 0 ? ((data.stamina.value -1) * -1) + data.fatigue.bonus : 0 + data.fatigue.bonus

    switch (data.fatigue.level > 0) {
      case true:
        data.fatigue.penalty = this._calcFatiguePenalty(actorData)
        break

      case false:
        data.fatigue.level = 0
        data.fatigue.penalty = 0
        break
    }

  } 

  async _prepareNPCData(actorData) {
    const data = actorData.system;

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
    data.carry_rating.current = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1)

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
    if (game.settings.get('uesrpg-d100', 'npcENCPenalty')) {
      if (data.carry_rating.current > data.carry_rating.max * 3) {
        data.carry_rating.label = 'Crushing'
        data.carry_rating.penalty = -40
        data.speed.value = 0;
        data.stamina.max = data.stamina.max - 5;
      } else if (data.carry_rating.current > data.carry_rating.max * 2) {
        data.carry_rating.label = 'Severe'
        data.carry_rating.penalty = -20
        data.speed.value = Math.floor(data.speed.base / 2);
        data.stamina.max = data.stamina.max - 3;
      } else if (data.carry_rating.current > data.carry_rating.max) {
        data.carry_rating.label = 'Moderate'
        data.carry_rating.penalty = -10
        data.speed.value = data.speed.value - 1;
        data.stamina.max = data.stamina.max - 1;
      } else if (data.carry_rating.current <= data.carry_rating.max) {
        data.carry_rating.label = "Minimal"
        data.carry_rating.penalty = 0
      }
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


    // Set Skill professions to regular professions (This is a fucking mess, but it's the way it's done for now...)
    for (let prof in data.professions) {
      if (prof === 'profession1'||prof === 'profession2'||prof === 'profession3'||prof === 'commerce') {
        data.professions[prof] === 0 ? data.professions[prof] = data.skills[prof].tn : data.professions[prof] = 0
      }
    }


    // Wound Penalties
    if (data.wounded === true) {
      let woundPen = 0
      let woundIni = -2;
      this._painIntolerant(actorData) ? woundPen = -30 : woundPen = -20

      if (this._halfWoundPenalty(actorData) === true) {
        for (var skill in data.professionsWound) {
          data.professionsWound[skill] = data.professions[skill] + (woundPen / 2);
        }

        data.woundPenalty = woundPen / 2
        data.initiative.value = data.initiative.base + (woundIni / 2);

      } 

      else if (this._halfWoundPenalty(actorData) === false) {
        for (var skill in data.professionsWound) {
          data.professionsWound[skill] = data.professions[skill] + woundPen;
        }

        data.initiative.value = data.initiative.base + woundIni;
        data.woundPenalty = woundPen;

        }
      } 
      
      else if (data.wounded === false) {
          for (var skill in data.professionsWound) {
           data.professionsWound[skill] = data.professions[skill];
        }
      }

    //Fatigue Penalties
    data.fatigue.level = data.stamina.value <= 0 ? ((data.stamina.value -1) * -1) + data.fatigue.bonus : 0 + data.fatigue.bonus

    switch (data.fatigue.level > 0) {
      case true:
        data.fatigue.penalty = this._calcFatiguePenalty(actorData)
        break

      case false:
        data.fatigue.level = 0
        data.fatigue.penalty = 0
        break
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

    // Calculate Item Profession Modifiers
    this._calculateItemSkillModifiers(actorData)

  }

  async _calculateItemSkillModifiers(actorData) {
    let modItems = actorData.items.filter(i => 
      i.system.hasOwnProperty('skillArray')
      && i.system.skillArray.length > 0
      && i.system.equipped
    )

    for (let item of modItems) {
      for (let entry of item.system.skillArray) {
        let moddedSkill = actorData.system.professions[entry.name]
        actorData.system.professions[entry.name] = Number(moddedSkill) + Number(entry.value)
        actorData.system.professionsWound[entry.name] = Number(moddedSkill) + Number(entry.value)
      }
    }
  }

  _strBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.strChaBonus;
    }
    return totalBonus
  }

  _endBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.endChaBonus;
    }
    return totalBonus
  }

  _agiBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.agiChaBonus;
    }
    return totalBonus
  }

  _intBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.intChaBonus;
    }
    return totalBonus
  }

  _wpBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.wpChaBonus;
    }
    return totalBonus
  }

  _prcBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.prcChaBonus;
    }
    return totalBonus
  }

  _prsBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.prsChaBonus;
    }
    return totalBonus
  }

  _lckBonusCalc(actorData) {
    let strBonusItems = actorData.items.filter(item => item.system.hasOwnProperty("characteristicBonus"));
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.lckChaBonus;
    }
    return totalBonus
  }

  _calculateENC(actorData) {
    let weighted = actorData.items.filter(item => item.system.hasOwnProperty("enc"));
    let totalWeight = 0.0;
    for (let item of weighted) {
      let containerAppliedENC = item.type == 'container' ? item.system.container_enc.applied_enc : 0
      let containedItemReduction = item.type != 'container' && item.system.containerStats.contained ? (item.system.enc * item.system.quantity) : 0
      totalWeight = totalWeight + (item.system.enc * item.system.quantity) + containerAppliedENC - containedItemReduction;
    }
    return totalWeight
  }

  _armorWeight(actorData) {
    let worn = actorData.items.filter(item => item.system.equipped == true);
    let armorENC = 0.0;
    for (let item of worn) {
      armorENC = armorENC + ((item.system.enc / 2) * item.system.quantity);
    } 
    return armorENC
  }

  _excludeENC(actorData) {
    let excluded = actorData.items.filter(item => item.system.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      totalWeight = totalWeight + (item.system.enc * item.system.quantity);
    }
    return totalWeight
  }

  _hpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("hpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.hpBonus;
    }
    return bonus
  }

  _mpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("mpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.mpBonus;
    }
    return bonus
  }

  _spBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("spBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.spBonus;
    }
    return bonus
  }

  _lpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("lpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.lpBonus;
    }
    return bonus
  }

  _wtBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("wtBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.wtBonus;
    }
    return bonus
  }

  _speedBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("speedBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.speedBonus;
    }
    return bonus
  }

  _iniBonus(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("iniBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.iniBonus;
    }
    return bonus
  }

  _diseaseR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("diseaseR"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.diseaseR;
    }
    return bonus
  }

  _fireR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("fireR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.fireR;
      }
      return bonus
  }

  _frostR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("frostR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.frostR;
      }
      return bonus
  }

  _shockR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("shockR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.shockR;
      }
      return bonus
  }

  _poisonR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("poisonR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.poisonR;
      }
      return bonus
  }

  _magicR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("magicR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.magicR;
      }
      return bonus
  }

  _natToughnessR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("natToughnessR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.natToughnessR;
      }
      return bonus
  }

  _silverR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("silverR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.silverR;
      }
      return bonus
  }

  _sunlightR(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("sunlightR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.sunlightR;
      }
      return bonus
  }

  _swimCalc(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("swimBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.swimBonus;
    }
    return bonus
  }

  _flyCalc(actorData) {
    let attribute = actorData.items.filter(item => item.system.hasOwnProperty("flyBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.flyBonus;
    }
    return bonus
  }

  _speedCalc(actorData) {
    let attribute = actorData.items.filter(item => item.system.halfSpeed === true);
    let speed = actorData.system.speed.base;
    if (attribute.length === 0) {
      speed = speed;
    } else if (attribute.length >= 1) {
      speed = Math.ceil(speed/2);
    }
    return speed;
  }

  _iniCalc(actorData) {
    let attribute = actorData.items.filter(item => item.type == "trait"|| item.type == "talent");
    let init = actorData.system.initiative.base;
      for (let item of attribute) {
        if (item.system.replace.ini.characteristic != "none") {
          if (item.system.replace.ini.characteristic == "str") {
            init = Math.floor(actorData.system.characteristics.str.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "end") {
            init = Math.floor(actorData.system.characteristics.end.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "agi") {
            init = Math.floor(actorData.system.characteristics.agi.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "int") {
            init = Math.floor(actorData.system.characteristics.int.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "wp") {
            init = Math.floor(actorData.system.characteristics.wp.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "prc") {
            init = Math.floor(actorData.system.characteristics.prc.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "prs") {
            init = Math.floor(actorData.system.characteristics.prs.total / 10) * 3;
          } else if (item.system.replace.ini.characteristic == "lck") {
            init = Math.floor(actorData.system.characteristics.lck.total / 10) * 3;
          }
        }
      }
    return init;
  }

  _woundThresholdCalc(actorData) {
    let attribute = actorData.items.filter(item => item.type === "trait"|| item.type === "talent");
    let wound = actorData.system.wound_threshold.base;
      for (let item of attribute) {
        if (item.system.replace.wt.characteristic != "none") {
          if (item.system.replace.wt.characteristic === "str") {
            wound = Math.floor(actorData.system.characteristics.str.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "end") {
            wound = Math.floor(actorData.system.characteristics.end.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "agi") {
            wound = Math.floor(actorData.system.characteristics.agi.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "int") {
            wound = Math.floor(actorData.system.characteristics.int.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "wp") {
            wound = Math.floor(actorData.system.characteristics.wp.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "prc") {
            wound = Math.floor(actorData.system.characteristics.prc.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "prs") {
            wound = Math.floor(actorData.system.characteristics.prs.total / 10) * 3;
          } else if (item.system.replace.wt.characteristic === "lck") {
            wound = Math.floor(actorData.system.characteristics.lck.total / 10) * 3;
          }
        }
      }
    return wound;
  }

  _calcFatiguePenalty(actorData) {
    let attribute = actorData.items.filter(item => item.system.halfFatiguePenalty == true);
    let penalty = 0;
    if (attribute.length >= 1) {
      penalty = actorData.system.fatigue.level * -5;
    } else {
      penalty = actorData.system.fatigue.level * -10;
    }
    return penalty
  }

  _halfWoundPenalty(actorData) {
    let attribute = actorData.items.filter(item => item.system.halfWoundPenalty == true);
    let woundReduction = false;
    if (attribute.length >= 1) {
      woundReduction = true;
    } else {
      woundReduction = false;
    }
    return woundReduction
  }

  _addIntToMP(actorData) {
    let attribute = actorData.items.filter(item => item.system.addIntToMP == true);
    let mp = 0;
    if (attribute.length >= 1) {
      mp = actorData.system.characteristics.int.total;
    } else {
      mp = 0;
    }
    return mp
  }

  _untrainedException(actorData) {
    let attribute = actorData.items.filter(item => item.system.untrainedException == true);
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
    let attribute = actorData.items.filter(item => item.system.mechanical == true);
    let isMechanical = false;
    if (attribute.length >= 1) {
      isMechanical = true;
    } else {
      isMechanical = false;
    }
    return isMechanical
  }

  _dwemerSphere(actorData) {
    let attribute = actorData.items.filter(item => item.system.shiftForm == true);
    let shift = false;
    if (attribute.length >= 1) {
      for (let item of attribute) {
        if (item.system.dailyUse == true) {
          shift = true;
        }
      }
    } else {
      shift = false;
    }
    return shift
  }

  _vampireLordForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormVampireLord");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereWolfForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereWolf"||item.system.shiftFormStyle === "shiftFormWereLion");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBatForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereBat");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBoarForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereBoar");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBearForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereBear");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereCrocodileForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereCrocodile");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereVultureForm(actorData) {
    let form = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereVulture");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _painIntolerant(actorData) {
    let attribute = actorData.items.filter(item => item.system.painIntolerant == true);
    let pain = false;
    if (attribute.length >= 1) {
      pain = true;
    } 
    return pain
  }

  _addHalfSpeed(actorData) {
    let halfSpeedItems = actorData.items.filter(item => item.system.addHalfSpeed === true);
    let isWereCroc = actorData.items.filter(item => item.system.shiftFormStyle === "shiftFormWereCrocodile");
    let speed = actorData.system.speed.value;
    if (isWereCroc.length > 0 && halfSpeedItems.length > 0) {
      speed = actorData.system.speed.base;
    } else if (isWereCroc.length == 0 && halfSpeedItems.length > 0) {
      speed = Math.ceil(actorData.system.speed.value/2) + actorData.system.speed.base;
    } else if (isWereCroc.length > 0 && halfSpeedItems.length == 0) {
      speed = Math.ceil(actorData.system.speed.base/2);
    } else {
      speed = actorData.system.speed.value;
    }
    return speed
  }

}
