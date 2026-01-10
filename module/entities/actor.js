/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */

export class SimpleActor extends Actor {
  async _preCreate(data, options, user) {

    if (this.type === 'Player Character') {
      // Updates token default settings for Character types
      this.prototypeToken.updateSource({
        'sight.enabled': true,
        actorLink: true,
        disposition: 1
      })
    }

    if (this.type === 'Group') {
      // Updates token default settings for Group types
      this.prototypeToken.updateSource({
        'sight.enabled': false,
        actorLink: true,
        disposition: 0,
        'displayName': CONST.TOKEN_DISPLAY_MODES.ALWAYS,
        'displayBars': CONST.TOKEN_DISPLAY_MODES.NONE
      })
    }

    // Preps and adds standard skill items to Character types
    await super._preCreate(data, options, user);
    if (this.type === 'Player Character') {
      let skillPack = game.packs.get("uesrpg-3ev4.core-skills");
      let collection = await skillPack.getDocuments();
      console.log(collection);
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
    const actorSystemData = actorData.system;
    const flags = actorData.flags;

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    if (actorData.type === 'Player Character') this._prepareCharacterData(actorData);
    if (actorData.type === 'NPC') this._prepareNPCData(actorData);
    if (actorData.type === 'Group') this._prepareGroupData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const actorSystemData = actorData.system;

    //Add bonuses from items to Characteristics
    actorSystemData.characteristics.str.total = actorSystemData.characteristics.str.base + this._strBonusCalc(actorData);
    actorSystemData.characteristics.end.total = actorSystemData.characteristics.end.base + this._endBonusCalc(actorData);
    actorSystemData.characteristics.agi.total = actorSystemData.characteristics.agi.base + this._agiBonusCalc(actorData);
    actorSystemData.characteristics.int.total = actorSystemData.characteristics.int.base + this._intBonusCalc(actorData);
    actorSystemData.characteristics.wp.total = actorSystemData.characteristics.wp.base + this._wpBonusCalc(actorData);
    actorSystemData.characteristics.prc.total = actorSystemData.characteristics.prc.base + this._prcBonusCalc(actorData);
    actorSystemData.characteristics.prs.total = actorSystemData.characteristics.prs.base + this._prsBonusCalc(actorData);
    actorSystemData.characteristics.lck.total = actorSystemData.characteristics.lck.base + this._lckBonusCalc(actorData);


    //Characteristic Bonuses
    var strBonus = Math.floor(actorSystemData.characteristics.str.total / 10);
    var endBonus = Math.floor(actorSystemData.characteristics.end.total / 10);
    var agiBonus = Math.floor(actorSystemData.characteristics.agi.total / 10);
    var intBonus = Math.floor(actorSystemData.characteristics.int.total / 10);
    var wpBonus = Math.floor(actorSystemData.characteristics.wp.total / 10);
    var prcBonus = Math.floor(actorSystemData.characteristics.prc.total / 10);
    var prsBonus = Math.floor(actorSystemData.characteristics.prs.total / 10);
    var lckBonus = Math.floor(actorSystemData.characteristics.lck.total / 10);

    // Set characteristic bonus values
    actorSystemData.characteristics.str.bonus = strBonus;
    actorSystemData.characteristics.end.bonus = endBonus;
    actorSystemData.characteristics.agi.bonus = agiBonus;
    actorSystemData.characteristics.int.bonus = intBonus;
    actorSystemData.characteristics.wp.bonus = wpBonus;
    actorSystemData.characteristics.prc.bonus = prcBonus;
    actorSystemData.characteristics.prs.bonus = prsBonus;
    actorSystemData.characteristics.lck.bonus = lckBonus;

  //Set Campaign Rank
  if (actorSystemData.xpTotal >= 5000) {
    actorSystemData.campaignRank = "Master"
  } else if (actorSystemData.xpTotal >= 4000) {
    actorSystemData.campaignRank = "Expert"
  } else if (actorSystemData.xpTotal >= 3000) {
    actorSystemData.campaignRank = "Adept"
  } else if (actorSystemData.xpTotal >= 2000) {
    actorSystemData.campaignRank = "Journeyman"
  } else {
    actorSystemData.campaignRank = "Apprentice"
  }

    //Talent/Power/Trait Resource Bonuses
    actorSystemData.hp.bonus = this._hpBonus(actorData);
    actorSystemData.magicka.bonus = this._mpBonus(actorData);
    actorSystemData.stamina.bonus = this._spBonus(actorData);
    actorSystemData.luck_points.bonus = this._lpBonus(actorData);
    actorSystemData.wound_threshold.bonus = this._wtBonus(actorData);
    actorSystemData.speed.bonus = this._speedBonus(actorData);
    actorSystemData.initiative.bonus = this._iniBonus(actorData);

    //Talent/Power/Trait Resistance Bonuses
    actorSystemData.resistance.diseaseR = this._diseaseR(actorData);
    actorSystemData.resistance.fireR = this._fireR(actorData);
    actorSystemData.resistance.frostR = this._frostR(actorData);
    actorSystemData.resistance.shockR = this._shockR(actorData);
    actorSystemData.resistance.poisonR = this._poisonR(actorData);
    actorSystemData.resistance.magicR = this._magicR(actorData);
    actorSystemData.resistance.natToughness = this._natToughnessR(actorData);
    actorSystemData.resistance.silverR = this._silverR(actorData);
    actorSystemData.resistance.sunlightR = this._sunlightR(actorData);

    //Derived Calculations
    if (this._isMechanical(actorData) == true) {
      actorSystemData.wound_threshold.base = strBonus + (endBonus * 2);
    } else {
      actorSystemData.wound_threshold.base = strBonus + endBonus + wpBonus + (actorSystemData.wound_threshold.bonus);
    }
    actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.base;
    actorSystemData.wound_threshold.value = this._woundThresholdCalc(actorData);

    actorSystemData.speed.base = strBonus + (2 * agiBonus) + (actorSystemData.speed.bonus);
    actorSystemData.speed.value = this._speedCalc(actorData);
    actorSystemData.speed.swimSpeed = Math.floor(actorSystemData.speed.value/2);
    actorSystemData.speed.swimSpeed += parseFloat(this._swimCalc(actorData))
    actorSystemData.speed.flySpeed = this._flyCalc(actorData);

    actorSystemData.initiative.base = agiBonus + intBonus + prcBonus + (actorSystemData.initiative.bonus);
    actorSystemData.initiative.value = actorSystemData.initiative.base;
    actorSystemData.initiative.value = this._iniCalc(actorData);

    actorSystemData.hp.base = Math.ceil(actorSystemData.characteristics.end.total / 2);
    actorSystemData.hp.max = actorSystemData.hp.base + actorSystemData.hp.bonus;

    actorSystemData.magicka.max = actorSystemData.characteristics.int.total + actorSystemData.magicka.bonus + this._determineIbMp(actorData);

    actorSystemData.stamina.max = endBonus + actorSystemData.stamina.bonus;

    actorSystemData.luck_points.max = lckBonus + actorSystemData.luck_points.bonus;

    actorSystemData.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + actorSystemData.carry_rating.bonus;
    actorSystemData.carry_rating.current = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1);

    //Form Shift Calcs
    if (this._wereWolfForm(actorData) === true) {
      actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
      actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
      actorSystemData.hp.max = actorSystemData.hp.max + 5;
      actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
      actorSystemData.speed.base = actorSystemData.speed.base + 9;
      actorSystemData.speed.value = this._speedCalc(actorData);
      actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
      actorSystemData.resistance.natToughness = 5;
      actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
      actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
      actorData.items.find(i => i.name === 'Survival').system.miscValue = 30;
      actorData.items.find(i => i.name === 'Navigate').system.miscValue = 30;
      actorData.items.find(i => i.name === 'Observe').system.miscValue = 30;
    } else if (this._wereBatForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').system.miscValue = 30;
      actorData.items.find(i => i.name === 'Navigate').system.miscValue = 30;
      actorData.items.find(i => i.name === 'Observe').system.miscValue = 30;
    } else if (this._wereBoarForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.speed.base = actorSystemData.speed.base + 9;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 7;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').system.miscValue = 30;
    } else if (this._wereBearForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 10;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.base = actorSystemData.speed.base + 5;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').system.miscValue = 30;
    } else if (this._wereCrocodileForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = (this._addHalfSpeed(actorData)).toFixed(0);
        actorSystemData.speed.swimSpeed = parseFloat(this._speedCalc(actorData)) + 9;
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').system.miscValue = 30;
    } else if (this._wereVultureForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        actorData.items.find(i => i.name === 'Survival').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Navigate').system.miscValue = 30;
        actorData.items.find(i => i.name === 'Observe').system.miscValue = 30;
    } else if (this._vampireLordForm(actorData) === true) {
        actorSystemData.resistance.fireR = actorSystemData.resistance.fireR - 1;
        actorSystemData.resistance.sunlightR = actorSystemData.resistance.sunlightR - 1;
        actorSystemData.speed.flySpeed = 5;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.magicka.max = actorSystemData.magicka.max + 25;
        actorSystemData.resistance.natToughness = 3;
    }

    //Speed Recalculation
    actorSystemData.speed.value = this._addHalfSpeed(actorData);

    //ENC Burden Calculations
    if (game.settings.get('uesrpg-3ev4', 'pcENCPenalty')) {
      if (actorSystemData.carry_rating.current > actorSystemData.carry_rating.max * 3) {
        actorSystemData.carry_rating.label = 'Crushing'
        actorSystemData.carry_rating.penalty = -40
        actorSystemData.speed.value = 0;
        actorSystemData.stamina.max = actorSystemData.stamina.max - 5;
      } else if (actorSystemData.carry_rating.current > actorSystemData.carry_rating.max * 2) {
        actorSystemData.carry_rating.label = 'Severe'
        actorSystemData.carry_rating.penalty = -20
        actorSystemData.speed.value = Math.floor(actorSystemData.speed.base / 2);
        actorSystemData.stamina.max = actorSystemData.stamina.max - 3;
      } else if (actorSystemData.carry_rating.current > actorSystemData.carry_rating.max) {
        actorSystemData.carry_rating.label = 'Moderate'
        actorSystemData.carry_rating.penalty = -10
        actorSystemData.speed.value = actorSystemData.speed.value - 1;
        actorSystemData.stamina.max = actorSystemData.stamina.max - 1;
      } else if (actorSystemData.carry_rating.current <= actorSystemData.carry_rating.max) {
        actorSystemData.carry_rating.label = "Minimal"
        actorSystemData.carry_rating.penalty = 0
      }
    }

    //Armor Weight Class Calculations
    if (actorSystemData.armor_class == "super_heavy") {
      actorSystemData.speed.value = actorSystemData.speed.value - 3;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed - 3;
    } else if (actorSystemData.armor_class == "heavy") {
      actorSystemData.speed.value = actorSystemData.speed.value - 2;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed - 2;
    } else if (actorSystemData.armor_class == "medium") {
      actorSystemData.speed.value = actorSystemData.speed.value - 1;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed - 1;
    } else {
      actorSystemData.speed.value = actorSystemData.speed.value;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed;
    }

    //Wounded Penalties
    if (actorSystemData.wounded == true) {
      let woundPen = 0
      let woundIni = -2;
      this._painIntolerant(actorData) ? woundPen = -30 : woundPen = -20

      if (this._halfWoundPenalty(actorData) === true) {
        actorSystemData.woundPenalty = woundPen / 2
        actorSystemData.initiative.value = actorSystemData.initiative.base + (woundIni / 2);

      } else if (this._halfWoundPenalty(actorData) === false) {
        actorSystemData.initiative.value = actorSystemData.initiative.base + woundIni;
        actorSystemData.woundPenalty = woundPen;
      }
    }

    //Fatigue Penalties
    actorSystemData.fatigue.level = actorSystemData.stamina.value < 0 ? (-actorSystemData.stamina.value) + actorSystemData.fatigue.bonus : 0 + actorSystemData.fatigue.bonus

    switch (actorSystemData.fatigue.level > 0) {
      case true:
        actorSystemData.fatigue.penalty = this._calcFatiguePenalty(actorData)
        break

      case false:
        actorSystemData.fatigue.level = 0
        actorSystemData.fatigue.penalty = 0
        break
    }

  }

  async _prepareNPCData(actorData) {
    const actorSystemData = actorData.system;

    //Add bonuses from items to Characteristics
    actorSystemData.characteristics.str.total = actorSystemData.characteristics.str.base + this._strBonusCalc(actorData);
    actorSystemData.characteristics.end.total = actorSystemData.characteristics.end.base + this._endBonusCalc(actorData);
    actorSystemData.characteristics.agi.total = actorSystemData.characteristics.agi.base + this._agiBonusCalc(actorData);
    actorSystemData.characteristics.int.total = actorSystemData.characteristics.int.base + this._intBonusCalc(actorData);
    actorSystemData.characteristics.wp.total = actorSystemData.characteristics.wp.base + this._wpBonusCalc(actorData);
    actorSystemData.characteristics.prc.total = actorSystemData.characteristics.prc.base + this._prcBonusCalc(actorData);
    actorSystemData.characteristics.prs.total = actorSystemData.characteristics.prs.base + this._prsBonusCalc(actorData);
    actorSystemData.characteristics.lck.total = actorSystemData.characteristics.lck.base + this._lckBonusCalc(actorData);


    //Characteristic Bonuses
    var strBonus = Math.floor(actorSystemData.characteristics.str.total / 10);
    var endBonus = Math.floor(actorSystemData.characteristics.end.total / 10);
    var agiBonus = Math.floor(actorSystemData.characteristics.agi.total / 10);
    var intBonus = Math.floor(actorSystemData.characteristics.int.total / 10);
    var wpBonus = Math.floor(actorSystemData.characteristics.wp.total / 10);
    var prcBonus = Math.floor(actorSystemData.characteristics.prc.total / 10);
    var prsBonus = Math.floor(actorSystemData.characteristics.prs.total / 10);
    var lckBonus = Math.floor(actorSystemData.characteristics.lck.total / 10);

    // Set characteristic bonus values
    actorSystemData.characteristics.str.bonus = strBonus;
    actorSystemData.characteristics.end.bonus = endBonus;
    actorSystemData.characteristics.agi.bonus = agiBonus;
    actorSystemData.characteristics.int.bonus = intBonus;
    actorSystemData.characteristics.wp.bonus = wpBonus;
    actorSystemData.characteristics.prc.bonus = prcBonus;
    actorSystemData.characteristics.prs.bonus = prsBonus;
    actorSystemData.characteristics.lck.bonus = lckBonus;

    //Talent/Power/Trait Bonuses
    actorSystemData.hp.bonus = this._hpBonus(actorData);
    actorSystemData.magicka.bonus = this._mpBonus(actorData);
    actorSystemData.stamina.bonus = this._spBonus(actorData);
    actorSystemData.luck_points.bonus = this._lpBonus(actorData);
    actorSystemData.wound_threshold.bonus = this._wtBonus(actorData);
    actorSystemData.speed.bonus = this._speedBonus(actorData);
    actorSystemData.initiative.bonus = this._iniBonus(actorData);

    //Talent/Power/Trait Resistance Bonuses
    actorSystemData.resistance.diseaseR = this._diseaseR(actorData);
    actorSystemData.resistance.fireR = this._fireR(actorData);
    actorSystemData.resistance.frostR = this._frostR(actorData);
    actorSystemData.resistance.shockR = this._shockR(actorData);
    actorSystemData.resistance.poisonR = this._poisonR(actorData);
    actorSystemData.resistance.magicR = this._magicR(actorData);
    actorSystemData.resistance.natToughness = this._natToughnessR(actorData);
    actorSystemData.resistance.silverR = this._silverR(actorData);
    actorSystemData.resistance.sunlightR = this._sunlightR(actorData);

    //Derived Calculations
    if (this._isMechanical(actorData) == true) {
      actorSystemData.wound_threshold.base = strBonus + (endBonus * 2);
    } else {
      actorSystemData.wound_threshold.base = strBonus + endBonus + wpBonus + (actorSystemData.wound_threshold.bonus);
    }
    actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.base;
    actorSystemData.wound_threshold.value = this._woundThresholdCalc(actorData);

    if (this._dwemerSphere(actorData) == true) {
      actorSystemData.speed.base = 16;
      actorSystemData.professions.evade = 70;
    } else {
        actorSystemData.speed.base = strBonus + (2 * agiBonus) + (actorSystemData.speed.bonus);
    }
    actorSystemData.speed.value = this._speedCalc(actorData);
    actorSystemData.speed.swimSpeed = parseFloat((actorSystemData.speed.value/2).toFixed(0));
    actorSystemData.speed.swimSpeed += parseFloat(this._swimCalc(actorData));
    actorSystemData.speed.flySpeed = this._flyCalc(actorData);

    actorSystemData.initiative.base = agiBonus + intBonus + prcBonus + (actorSystemData.initiative.bonus);
    actorSystemData.initiative.value = actorSystemData.initiative.base;
    actorSystemData.initiative.value = this._iniCalc(actorData);

    actorSystemData.hp.base = Math.ceil(actorSystemData.characteristics.end.total / 2);
    actorSystemData.hp.max = actorSystemData.hp.base + actorSystemData.hp.bonus;

    actorSystemData.magicka.max = actorSystemData.characteristics.int.total + actorSystemData.magicka.bonus + this._determineIbMp(actorData);

    actorSystemData.stamina.max = endBonus + actorSystemData.stamina.bonus;

    actorSystemData.luck_points.max = lckBonus + actorSystemData.luck_points.bonus;

    actorSystemData.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + actorSystemData.carry_rating.bonus;
    actorSystemData.carry_rating.current = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1)

    //Form Shift Calcs
    if (this._wereWolfForm(actorData) === true) {
      actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
      actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
      actorSystemData.hp.max = actorSystemData.hp.max + 5;
      actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
      actorSystemData.speed.base = actorSystemData.speed.base + 9;
      actorSystemData.speed.value = this._speedCalc(actorData);
      actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
      actorSystemData.resistance.natToughness = 5;
      actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
      actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereBatForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereBoarForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.speed.base = actorSystemData.speed.base + 9;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 7;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereBearForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 10;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.base = actorSystemData.speed.base + 5;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereCrocodileForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = (this._addHalfSpeed(actorData)).toFixed(0);
        actorSystemData.speed.swimSpeed = parseFloat(this._speedCalc(actorData)) + 9;
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;

    } else if (this._wereVultureForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = (this._speedCalc(actorData)/2).toFixed(0);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = (actorSystemData.speed.value/2).toFixed(0);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    }else if (this._vampireLordForm(actorData) === true) {
        actorSystemData.resistance.fireR = actorSystemData.resistance.fireR - 1;
        actorSystemData.resistance.sunlightR = actorSystemData.resistance.sunlightR - 1;
        actorSystemData.speed.flySpeed = 5;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.magicka.max = actorSystemData.magicka.max + 25;
        actorSystemData.resistance.natToughness = 3;
    }

    //Speed Recalculation
    actorSystemData.speed.value = this._addHalfSpeed(actorData);

    //ENC Burden Calculations
    if (game.settings.get('uesrpg-3ev4', 'npcENCPenalty')) {
      if (actorSystemData.carry_rating.current > actorSystemData.carry_rating.max * 3) {
        actorSystemData.carry_rating.label = 'Crushing'
        actorSystemData.carry_rating.penalty = -40
        actorSystemData.speed.value = 0;
        actorSystemData.stamina.max = actorSystemData.stamina.max - 5;
      } else if (actorSystemData.carry_rating.current > actorSystemData.carry_rating.max * 2) {
        actorSystemData.carry_rating.label = 'Severe'
        actorSystemData.carry_rating.penalty = -20
        actorSystemData.speed.value = Math.floor(actorSystemData.speed.base / 2);
        actorSystemData.stamina.max = actorSystemData.stamina.max - 3;
      } else if (actorSystemData.carry_rating.current > actorSystemData.carry_rating.max) {
        actorSystemData.carry_rating.label = 'Moderate'
        actorSystemData.carry_rating.penalty = -10
        actorSystemData.speed.value = actorSystemData.speed.value - 1;
        actorSystemData.stamina.max = actorSystemData.stamina.max - 1;
      } else if (actorSystemData.carry_rating.current <= actorSystemData.carry_rating.max) {
        actorSystemData.carry_rating.label = "Minimal"
        actorSystemData.carry_rating.penalty = 0
      }
    }

    //Armor Weight Class Calculations
    if (actorSystemData.armor_class == "super_heavy") {
      actorSystemData.speed.value = actorSystemData.speed.value - 3;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed - 3;
    } else if (actorSystemData.armor_class == "heavy") {
      actorSystemData.speed.value = actorSystemData.speed.value - 2;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed - 2;
    } else if (actorSystemData.armor_class == "medium") {
      actorSystemData.speed.value = actorSystemData.speed.value - 1;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed - 1;
    } else {
      actorSystemData.speed.value = actorSystemData.speed.value;
      actorSystemData.speed.swimSpeed = actorSystemData.speed.swimSpeed;
    }


    // Set Skill professions to regular professions (This is a fucking mess, but it's the way it's done for now...)
    for (let prof in actorSystemData.professions) {
      if (prof === 'profession1'||prof === 'profession2'||prof === 'profession3'||prof === 'commerce') {
        actorSystemData.professions[prof] === 0 ? actorSystemData.professions[prof] = actorSystemData.skills[prof].tn : actorSystemData.professions[prof] = 0
      }
    }


    // Wound Penalties
    if (actorSystemData.wounded === true) {
      let woundPen = 0
      let woundIni = -2;
      this._painIntolerant(actorData) ? woundPen = -30 : woundPen = -20

      if (this._halfWoundPenalty(actorData) === true) {
        for (var skill in actorSystemData.professionsWound) {
          actorSystemData.professionsWound[skill] = actorSystemData.professions[skill] + (woundPen / 2);
        }

        actorSystemData.woundPenalty = woundPen / 2
        actorSystemData.initiative.value = actorSystemData.initiative.base + (woundIni / 2);

      }

      else if (this._halfWoundPenalty(actorData) === false) {
        for (var skill in actorSystemData.professionsWound) {
          actorSystemData.professionsWound[skill] = actorSystemData.professions[skill] + woundPen;
        }

        actorSystemData.initiative.value = actorSystemData.initiative.base + woundIni;
        actorSystemData.woundPenalty = woundPen;

        }
      }

      else if (actorSystemData.wounded === false) {
          for (var skill in actorSystemData.professionsWound) {
           actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
        }
      }

    //Fatigue Penalties
    actorSystemData.fatigue.level = actorSystemData.stamina.value <= 0 ? ((actorSystemData.stamina.value -1) * -1) + actorSystemData.fatigue.bonus : 0 + actorSystemData.fatigue.bonus

    switch (actorSystemData.fatigue.level > 0) {
      case true:
        actorSystemData.fatigue.penalty = this._calcFatiguePenalty(actorData)
        break

      case false:
        actorSystemData.fatigue.level = 0
        actorSystemData.fatigue.penalty = 0
        break
    }

    // Set Lucky/Unlucky Numbers based on Threat Category
    if (actorSystemData.threat == "minorSolo") {
      actorSystemData.unlucky_numbers.ul1 = 95;
      actorSystemData.unlucky_numbers.ul2 = 96;
      actorSystemData.unlucky_numbers.ul3 = 97;
      actorSystemData.unlucky_numbers.ul4 = 98;
      actorSystemData.unlucky_numbers.ul5 = 99;
      actorSystemData.unlucky_numbers.ul6 = 100;
      actorSystemData.lucky_numbers.ln1 = 0;
      actorSystemData.lucky_numbers.ln2 = 0;
      actorSystemData.lucky_numbers.ln3 = 0;
      actorSystemData.lucky_numbers.ln4 = 0;
      actorSystemData.lucky_numbers.ln5 = 0;
      actorSystemData.lucky_numbers.ln6 = 0;
      actorSystemData.lucky_numbers.ln7 = 0;
      actorSystemData.lucky_numbers.ln8 = 0;
      actorSystemData.lucky_numbers.ln9 = 0;
      actorSystemData.lucky_numbers.ln10 = 0;
    } else if (actorSystemData.threat == "minorGroup") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 96;
      actorSystemData.unlucky_numbers.ul3 = 97;
      actorSystemData.unlucky_numbers.ul4 = 98;
      actorSystemData.unlucky_numbers.ul5 = 99;
      actorSystemData.unlucky_numbers.ul6 = 100;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 0;
      actorSystemData.lucky_numbers.ln3 = 0;
      actorSystemData.lucky_numbers.ln4 = 0;
      actorSystemData.lucky_numbers.ln5 = 0;
      actorSystemData.lucky_numbers.ln6 = 0;
      actorSystemData.lucky_numbers.ln7 = 0;
      actorSystemData.lucky_numbers.ln8 = 0;
      actorSystemData.lucky_numbers.ln9 = 0;
      actorSystemData.lucky_numbers.ln10 = 0;
    } else if (actorSystemData.threat == "majorSolo") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 0;
      actorSystemData.unlucky_numbers.ul3 = 97;
      actorSystemData.unlucky_numbers.ul4 = 98;
      actorSystemData.unlucky_numbers.ul5 = 99;
      actorSystemData.unlucky_numbers.ul6 = 100;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 2;
      actorSystemData.lucky_numbers.ln3 = 0;
      actorSystemData.lucky_numbers.ln4 = 0;
      actorSystemData.lucky_numbers.ln5 = 0;
      actorSystemData.lucky_numbers.ln6 = 0;
      actorSystemData.lucky_numbers.ln7 = 0;
      actorSystemData.lucky_numbers.ln8 = 0;
      actorSystemData.lucky_numbers.ln9 = 0;
      actorSystemData.lucky_numbers.ln10 = 0;
    } else if (actorSystemData.threat == "majorGroup") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 0;
      actorSystemData.unlucky_numbers.ul3 = 0;
      actorSystemData.unlucky_numbers.ul4 = 98;
      actorSystemData.unlucky_numbers.ul5 = 99;
      actorSystemData.unlucky_numbers.ul6 = 100;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 2;
      actorSystemData.lucky_numbers.ln3 = 3;
      actorSystemData.lucky_numbers.ln4 = 0;
      actorSystemData.lucky_numbers.ln5 = 0;
      actorSystemData.lucky_numbers.ln6 = 0;
      actorSystemData.lucky_numbers.ln7 = 0;
      actorSystemData.lucky_numbers.ln8 = 0;
      actorSystemData.lucky_numbers.ln9 = 0;
      actorSystemData.lucky_numbers.ln10 = 0;
    } else if (actorSystemData.threat == "deadlySolo") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 0;
      actorSystemData.unlucky_numbers.ul3 = 0;
      actorSystemData.unlucky_numbers.ul4 = 0;
      actorSystemData.unlucky_numbers.ul5 = 99;
      actorSystemData.unlucky_numbers.ul6 = 100;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 2;
      actorSystemData.lucky_numbers.ln3 = 3;
      actorSystemData.lucky_numbers.ln4 = 4;
      actorSystemData.lucky_numbers.ln5 = 0;
      actorSystemData.lucky_numbers.ln6 = 0;
      actorSystemData.lucky_numbers.ln7 = 0;
      actorSystemData.lucky_numbers.ln8 = 0;
      actorSystemData.lucky_numbers.ln9 = 0;
      actorSystemData.lucky_numbers.ln10 = 0;
    } else if (actorSystemData.threat == "deadlyGroup") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 0;
      actorSystemData.unlucky_numbers.ul3 = 0;
      actorSystemData.unlucky_numbers.ul4 = 0;
      actorSystemData.unlucky_numbers.ul5 = 0;
      actorSystemData.unlucky_numbers.ul6 = 100;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 2;
      actorSystemData.lucky_numbers.ln3 = 3;
      actorSystemData.lucky_numbers.ln4 = 4;
      actorSystemData.lucky_numbers.ln5 = 5;
      actorSystemData.lucky_numbers.ln6 = 0;
      actorSystemData.lucky_numbers.ln7 = 0;
      actorSystemData.lucky_numbers.ln8 = 0;
      actorSystemData.lucky_numbers.ln9 = 0;
      actorSystemData.lucky_numbers.ln10 = 0;
    } else if (actorSystemData.threat == "legendarySolo") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 0;
      actorSystemData.unlucky_numbers.ul3 = 0;
      actorSystemData.unlucky_numbers.ul4 = 0;
      actorSystemData.unlucky_numbers.ul5 = 0;
      actorSystemData.unlucky_numbers.ul6 = 0;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 2;
      actorSystemData.lucky_numbers.ln3 = 3;
      actorSystemData.lucky_numbers.ln4 = 4;
      actorSystemData.lucky_numbers.ln5 = 5;
      actorSystemData.lucky_numbers.ln6 = 6;
      actorSystemData.lucky_numbers.ln7 = 7;
      actorSystemData.lucky_numbers.ln8 = 8;
      actorSystemData.lucky_numbers.ln9 = 9;
      actorSystemData.lucky_numbers.ln10 = 10;
    } else if (actorSystemData.threat == "legendaryGroup") {
      actorSystemData.unlucky_numbers.ul1 = 0;
      actorSystemData.unlucky_numbers.ul2 = 0;
      actorSystemData.unlucky_numbers.ul3 = 0;
      actorSystemData.unlucky_numbers.ul4 = 0;
      actorSystemData.unlucky_numbers.ul5 = 0;
      actorSystemData.unlucky_numbers.ul6 = 0;
      actorSystemData.lucky_numbers.ln1 = 1;
      actorSystemData.lucky_numbers.ln2 = 2;
      actorSystemData.lucky_numbers.ln3 = 3;
      actorSystemData.lucky_numbers.ln4 = 4;
      actorSystemData.lucky_numbers.ln5 = 5;
      actorSystemData.lucky_numbers.ln6 = 6;
      actorSystemData.lucky_numbers.ln7 = 7;
      actorSystemData.lucky_numbers.ln8 = 8;
      actorSystemData.lucky_numbers.ln9 = 9;
      actorSystemData.lucky_numbers.ln10 = 10;
    }

    // Calculate Item Profession Modifiers
    this._calculateItemSkillModifiers(actorData)

  }

  /**
   * Prepare Group type specific data
   * Groups are simple containers with no calculations needed
   */
  _prepareGroupData(actorData) {
    const actorSystemData = actorData.system;

    // Initialize members array if missing
    if (!actorSystemData.members) {
      actorSystemData.members = [];
    }

    // Sort members by sortOrder
    actorSystemData.members.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // No calculations needed - Groups are simple containers
  }

  /**
   * Check if adding an actor would create a circular reference
   * @param {String} actorUuid - UUID of actor to potentially add
   * @returns {Promise<Boolean>} - True if circular, false if safe
   */
  async _wouldCreateCircularReference(actorUuid) {
    // Can't add self
    if (actorUuid === this.uuid) return true;

    // Recursively check if actorUuid contains this group
    const checkActor = async (uuid, visited = new Set()) => {
      if (visited.has(uuid)) return false;
      visited.add(uuid);

      const actor = await fromUuid(uuid);
      if (!actor || actor.type !== 'Group') return false;

      for (const member of actor.system.members || []) {
        if (member.id === this.uuid) return true;
        if (await checkActor(member.id, visited)) return true;
      }

      return false;
    };

    return checkActor(actorUuid);
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

  _filterToEquippedBonusItems(items, bonusProperty) {
    return items.filter(i => i.system.hasOwnProperty(bonusProperty) && (i.system.hasOwnProperty('equipped') ? i.system.equipped : true));
  }

  _strBonusCalc(actorData) {
    const strBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.strChaBonus;
    }
    return totalBonus
  }

  _endBonusCalc(actorData) {
    let endBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of endBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.endChaBonus;
    }
    return totalBonus
  }

  _agiBonusCalc(actorData) {
    let agiBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of agiBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.agiChaBonus;
    }
    return totalBonus
  }

  _intBonusCalc(actorData) {
    let intBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of intBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.intChaBonus;
    }
    return totalBonus
  }

  _wpBonusCalc(actorData) {
    let wpBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of wpBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.wpChaBonus;
    }
    return totalBonus
  }

  _prcBonusCalc(actorData) {
    let prcBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prcBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.prcChaBonus;
    }
    return totalBonus
  }

  _prsBonusCalc(actorData) {
    let prsBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prsBonusItems) {
      totalBonus = totalBonus + item.system.characteristicBonus.prsChaBonus;
    }
    return totalBonus
  }

  _lckBonusCalc(actorData) {
    let lckBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of lckBonusItems) {
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
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'hpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.hpBonus;
    }
    return bonus
  }

  _mpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'mpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.mpBonus;
    }
    return bonus
  }

  _spBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'spBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.spBonus;
    }
    return bonus
  }

  _lpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'lpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.lpBonus;
    }
    return bonus
  }

  _wtBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'wtBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.wtBonus;
    }
    return bonus
  }

  _speedBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'speedBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.speedBonus;
    }
    return bonus
  }

  _iniBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'iniBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.iniBonus;
    }
    return bonus
  }

  _diseaseR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'diseaseR');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.system.diseaseR;
    }
    return bonus
  }

  _fireR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'fireR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.fireR;
      }
      return bonus
  }

  _frostR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'frostR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.frostR;
      }
      return bonus
  }

  _shockR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'shockR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.shockR;
      }
      return bonus
  }

  _poisonR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'poisonR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.poisonR;
      }
      return bonus
  }

  _magicR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'magicR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.magicR;
      }
      return bonus
  }

  _natToughnessR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'natToughnessR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.natToughnessR;
      }
      return bonus
  }

  _silverR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'silverR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.silverR;
      }
      return bonus
  }

  _sunlightR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'sunlightR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.system.sunlightR;
      }
      return bonus
  }

  _swimCalc(actorData) {
    let swimBonusItems = this._filterToEquippedBonusItems(actorData.items, 'swimBonus');
    let bonus = 0;
    for (let item of swimBonusItems) {
      bonus = bonus + item.system.swimBonus;
    }
    const shouldDoubleSwimSpeed = actorData.items?.some(i => i.system.doubleSwimSpeed);
    // Double the swim speed and any bonuses
    if (shouldDoubleSwimSpeed) {
      bonus *= 2;
      bonus += actorData.system.speed.swimSpeed;
    }
    return bonus;
  }

  _flyCalc(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'flyBonus');
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

  _determineIbMp(actorData) {
    let addIbItems = actorData.items.filter(item => item.system.addIBToMP == true);

    if (addIbItems.length >= 1) {
      const actorIntBonus = actorData.system.characteristics.int.bonus;
      return addIbItems.reduce(
        (acc, item) => actorIntBonus * item.system.addIntToMPMultiplier + acc,
        0
      );
    }
    return 0;
  }

  _untrainedException(actorData) {
    let attribute = actorData.items.filter(item => item.system.untrainedException == true);
    const legacyUntrained = game.settings.get("uesrpg-3ev4", "legacyUntrainedPenalty");
    let x = 0;
    if (legacyUntrained) {
      if (attribute.length >= 1) {
        x = 10;
      }
    } else if (attribute.length >= 1) {
      x = 20;
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
