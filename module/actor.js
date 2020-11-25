/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class SimpleActor extends Actor {

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

    //Characteristic Bonuses
    var strBonus = Math.floor(data.characteristics.str.value / 10);
    var endBonus = Math.floor(data.characteristics.end.value / 10);
    var agiBonus = Math.floor(data.characteristics.agi.value / 10);
    var intBonus = Math.floor(data.characteristics.int.value / 10);
    var wpBonus = Math.floor(data.characteristics.wp.value / 10);
    var prcBonus = Math.floor(data.characteristics.prc.value / 10);
    var prsBonus = Math.floor(data.characteristics.prs.value / 10);
    var lckBonus = Math.floor(data.characteristics.lck.value / 10);

    //Skill Bonus Calculation
    const legacyUntrained = game.settings.get("uesrpg-d100", "legacyUntrainedPenalty");

    if (legacyUntrained) {
      for (var skill in data.skills) {
        if (data.skills[skill].rank == "untrained") {
          data.skills[skill].bonus = -20;
        } else if (data.skills[skill].rank == "novice") {
          data.skills[skill].bonus = 0;
        } else if (data.skills[skill].rank == "apprentice") {
          data.skills[skill].bonus = 10;
        } else if (data.skills[skill].rank == "journeyman") {
          data.skills[skill].bonus = 20;
        } else if (data.skills[skill].rank == "adept") {
          data.skills[skill].bonus = 30;
        } else if (data.skills[skill].rank == "expert") {
          data.skills[skill].bonus = 40;
        } else if (data.skills[skill].rank == "master") {
          data.skills[skill].bonus = 50;
        }
      }

    } else {
    for (var skill in data.skills) {
      if (data.skills[skill].rank == "untrained") {
        data.skills[skill].bonus = -10;
      } else if (data.skills[skill].rank == "novice") {
        data.skills[skill].bonus = 0;
      } else if (data.skills[skill].rank == "apprentice") {
        data.skills[skill].bonus = 10;
      } else if (data.skills[skill].rank == "journeyman") {
        data.skills[skill].bonus = 20;
      } else if (data.skills[skill].rank == "adept") {
        data.skills[skill].bonus = 30;
      } else if (data.skills[skill].rank == "expert") {
        data.skills[skill].bonus = 40;
      } else if (data.skills[skill].rank == "master") {
        data.skills[skill].bonus = 50;
      }
    }
  }

    //Magic Skill Bonus Calculation
    if (legacyUntrained) {
      for (var skill in data.magic_skills) {
        if (data.magic_skills[skill].rank == "untrained") {
          data.magic_skills[skill].bonus = -20;
        } else if (data.magic_skills[skill].rank == "novice") {
          data.magic_skills[skill].bonus = 0;
        } else if (data.magic_skills[skill].rank == "apprentice") {
          data.magic_skills[skill].bonus = 10;
        } else if (data.magic_skills[skill].rank == "journeyman") {
          data.magic_skills[skill].bonus = 20;
        } else if (data.magic_skills[skill].rank == "adept") {
          data.magic_skills[skill].bonus = 30;
        } else if (data.magic_skills[skill].rank == "expert") {
          data.magic_skills[skill].bonus = 40;
        } else if (data.magic_skills[skill].rank == "master") {
          data.magic_skills[skill].bonus = 50;
      }
    }
  } else {
      for (var skill in data.magic_skills) {
        if (data.magic_skills[skill].rank == "untrained") {
          data.magic_skills[skill].bonus = -10;
        } else if (data.magic_skills[skill].rank == "novice") {
          data.magic_skills[skill].bonus = 0;
        } else if (data.magic_skills[skill].rank == "apprentice") {
          data.magic_skills[skill].bonus = 10;
        } else if (data.magic_skills[skill].rank == "journeyman") {
          data.magic_skills[skill].bonus = 20;
        } else if (data.magic_skills[skill].rank == "adept") {
          data.magic_skills[skill].bonus = 30;
        } else if (data.magic_skills[skill].rank == "expert") {
          data.magic_skills[skill].bonus = 40;
        } else if (data.magic_skills[skill].rank == "master") {
          data.magic_skills[skill].bonus = 50;
      }
    }
  }

    //Combat Style Skill Bonus Calculation
    if (legacyUntrained) {
      for (var skill in data.combat_styles) {
        if (data.combat_styles[skill].rank == "untrained") {
          data.combat_styles[skill].bonus = -20 + this._untrainedException(actorData);
        } else if (data.combat_styles[skill].rank == "novice") {
          data.combat_styles[skill].bonus = 0;
        } else if (data.combat_styles[skill].rank == "apprentice") {
          data.combat_styles[skill].bonus = 10;
        } else if (data.combat_styles[skill].rank == "journeyman") {
          data.combat_styles[skill].bonus = 20;
        } else if (data.combat_styles[skill].rank == "adept") {
          data.combat_styles[skill].bonus = 30;
        } else if (data.combat_styles[skill].rank == "expert") {
          data.combat_styles[skill].bonus = 40;
        } else if (data.combat_styles[skill].rank == "master") {
          data.combat_styles[skill].bonus = 50;
      }
    }
    } else {
        for (var skill in data.combat_styles) {
          if (data.combat_styles[skill].rank == "untrained") {
            data.combat_styles[skill].bonus = -10 + this._untrainedException(actorData);
          } else if (data.combat_styles[skill].rank == "novice") {
            data.combat_styles[skill].bonus = 0;
          } else if (data.combat_styles[skill].rank == "apprentice") {
            data.combat_styles[skill].bonus = 10;
          } else if (data.combat_styles[skill].rank == "journeyman") {
            data.combat_styles[skill].bonus = 20;
          } else if (data.combat_styles[skill].rank == "adept") {
            data.combat_styles[skill].bonus = 30;
          } else if (data.combat_styles[skill].rank == "expert") {
            data.combat_styles[skill].bonus = 40;
          } else if (data.combat_styles[skill].rank == "master") {
            data.combat_styles[skill].bonus = 50;
      }
    }
  }

    // Skill TN Calculation
    for (var skill in data.skills) {
      if (data.skills[skill].characteristic == "str") {
        data.skills[skill].tn = data.characteristics.str.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "end") {
        data.skills[skill].tn = data.characteristics.end.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "agi") {
        data.skills[skill].tn = data.characteristics.agi.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "int") {
        data.skills[skill].tn = data.characteristics.int.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "wp") {
        data.skills[skill].tn = data.characteristics.wp.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "prc") {
        data.skills[skill].tn = data.characteristics.prc.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "prs") {
        data.skills[skill].tn = data.characteristics.prs.value + data.skills[skill].bonus;
      } else if (data.skills[skill].characteristic == "lck") {
        data.skills[skill].tn = data.characteristics.lck.value + data.skills[skill].bonus;
      }
    }

    //Magic Skill TN Calculation
    for (var skill in data.magic_skills) {
      if (data.magic_skills[skill].characteristic == "str") {
        data.magic_skills[skill].tn = data.characteristics.str.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "end") {
        data.magic_skills[skill].tn = data.characteristics.end.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "agi") {
        data.magic_skills[skill].tn = data.characteristics.agi.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "int") {
        data.magic_skills[skill].tn = data.characteristics.int.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "wp") {
        data.magic_skills[skill].tn = data.characteristics.wp.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "prc") {
        data.magic_skills[skill].tn = data.characteristics.prc.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "prs") {
        data.magic_skills[skill].tn = data.characteristics.prs.value + data.magic_skills[skill].bonus;
      } else if (data.magic_skills[skill].characteristic == "lck") {
        data.magic_skills[skill].tn = data.characteristics.lck.value + data.magic_skills[skill].bonus;
      }
    }

    // Combat Style Skill Calculation
    for (var skill in data.combat_styles) {
      if (data.combat_styles[skill].characteristic == "str") {
        data.combat_styles[skill].tn = data.characteristics.str.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "end") {
        data.combat_styles[skill].tn = data.characteristics.end.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "agi") {
        data.combat_styles[skill].tn = data.characteristics.agi.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "int") {
        data.combat_styles[skill].tn = data.characteristics.int.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "wp") {
        data.combat_styles[skill].tn = data.characteristics.wp.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "prc") {
        data.combat_styles[skill].tn = data.characteristics.prc.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "prs") {
        data.combat_styles[skill].tn = data.characteristics.prs.value + data.combat_styles[skill].bonus;
      } else if (data.combat_styles[skill].characteristic == "lck") {
        data.combat_styles[skill].tn = data.characteristics.lck.value + data.combat_styles[skill].bonus;
      }
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

    data.initiative.base = agiBonus + intBonus + prcBonus + (data.initiative.bonus);
    data.initiative.value = data.initiative.base;
    data.initiative.value = this._iniCalc(actorData);

    data.hp.base = Math.ceil(data.characteristics.end.value / 2);
    data.hp.max = data.hp.base + data.hp.bonus;

    data.magicka.max = data.characteristics.int.value + data.magicka.bonus + this._addIntToMP(actorData);

    data.stamina.max = endBonus + data.stamina.bonus;

    data.luck_points.max = lckBonus + data.luck_points.bonus;

    data.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + data.carry_rating.bonus;
    this._sortCarriedItems(actorData);
    data.current_enc = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1);

    //ENC Burden Calculations
    if (data.current_enc > data.carry_rating.max * 3) {
      data.speed.base = 0;
      data.stamina.max = data.stamina.max - 5;
    } else if (data.current_enc > data.carry_rating.max * 2) {
      data.speed.base = Math.floor(data.speed.base / 2);
      data.stamina.max = data.stamina.max - 3;
    } else if (data.current_enc > data.carry_rating.max) {
      data.speed.base = data.speed.base - 1;
      data.stamina.max = data.stamina.max - 1;
    }

    //Armor Weight Class Calculations
    if (data.armor_class == "super_heavy") {
      data.speed.value = data.speed.value - 3;
    } else if (data.armor_class == "heavy") {
      data.speed.value = data.speed.value - 2;
    } else if (data.armor_class == "medium") {
      data.speed.value = data.speed.value - 1;
    } else {
      data.speed.value = data.speed.value;
    }

    //Wounded Penalties
    let woundPen = -20;

    if (this._painIntolerant(actorData) == true) {
      woundPen = -30;
    }

    let halfWound = woundPen / 2;
    let woundIni = -2;
    let halfWoundIni = woundIni / 2;

    if (data.wounded == true) {
      if (this._halfWoundPenalty(actorData) == true) {
        for (var skill in data.skills) {
          data.skills[skill].tn = data.skills[skill].tn + halfWound;
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = data.magic_skills[skill].tn + halfWound;
        }
        for (var skill in data.combat_styles) {
          data.combat_styles[skill].tn = data.combat_styles[skill].tn + halfWound;
        }
        data.initiative.base = data.initiative.base + halfWoundIni;
      } else if (this._halfWoundPenalty(actorData) == false) {
        for (var skill in data.skills) {
          data.skills[skill].tn = data.skills[skill].tn + woundPen;
        }
        for (var skill in data.magic_skills) {
          data.magic_skills[skill].tn = data.magic_skills[skill].tn + woundPen;
        }
        for (var skill in data.combat_styles) {
          data.combat_styles[skill].tn = data.combat_styles[skill].tn + woundPen;
        }
        data.initiative.base = data.initiative.base + woundIni;
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


    //Worn Armor/Weapons to Actor Sheet
    data.armor.head.ar = this._helmetArmor(actorData);
    data.armor.head.magic_ar = this._helmetMagicArmor(actorData);

    data.armor.l_arm.ar = this._larmArmor(actorData);
    data.armor.l_arm.magic_ar = this._larmMagicArmor(actorData);

    data.armor.r_arm.ar = this._rarmArmor(actorData);
    data.armor.r_arm.magic_ar = this._rarmMagicArmor(actorData);

    data.armor.l_leg.ar = this._llegArmor(actorData);
    data.armor.l_leg.magic_ar = this._llegMagicArmor(actorData);

    data.armor.r_leg.ar = this._rlegArmor(actorData);
    data.armor.r_leg.magic_ar = this._rlegMagicArmor(actorData);

    data.armor.body.ar = this._bodyArmor(actorData);
    data.armor.body.magic_ar = this._bodyMagicArmor(actorData);

    data.shield.br = this._shieldBR(actorData);
    data.shield.magic_br = this._shieldMR(actorData);

    data.weapons.w1.name = this._w1Name(actorData);
    data.weapons.w1.dmg = this._w1Dam(actorData);
    data.weapons.w1.reach = this._w1Reach(actorData);
    data.weapons.w1.qualities = this._w1Qualities(actorData);

    data.weapons.w2.name = this._w2Name(actorData);
    data.weapons.w2.dmg = this._w2Dam(actorData);
    data.weapons.w2.reach = this._w2Reach(actorData);
    data.weapons.w2.qualities = this._w2Qualities(actorData);

    data.weapons.w3.name = this._w3Name(actorData);
    data.weapons.w3.dmg = this._w3Dam(actorData);
    data.weapons.w3.reach = this._w3Reach(actorData);
    data.weapons.w3.qualities = this._w3Qualities(actorData);

    data.prep_spells.s1.name = this._s1Name(actorData);
    data.prep_spells.s1.dmg = this._s1Dam(actorData);
    data.prep_spells.s1.cost = this._s1Cost(actorData);
    data.prep_spells.s1.attributes = this._s1Attributes(actorData);

    data.prep_spells.s2.name = this._s2Name(actorData);
    data.prep_spells.s2.dmg = this._s2Dam(actorData);
    data.prep_spells.s2.cost = this._s2Cost(actorData);
    data.prep_spells.s2.attributes = this._s2Attributes(actorData);

    data.prep_spells.s3.name = this._s3Name(actorData);
    data.prep_spells.s3.dmg = this._s3Dam(actorData);
    data.prep_spells.s3.cost = this._s3Cost(actorData);
    data.prep_spells.s3.attributes = this._s3Attributes(actorData);

    data.prep_spells.s4.name = this._s4Name(actorData);
    data.prep_spells.s4.dmg = this._s4Dam(actorData);
    data.prep_spells.s4.cost = this._s4Cost(actorData);
    data.prep_spells.s4.attributes = this._s4Attributes(actorData);

    data.prep_spells.s5.name = this._s5Name(actorData);
    data.prep_spells.s5.dmg = this._s5Dam(actorData);
    data.prep_spells.s5.cost = this._s5Cost(actorData);
    data.prep_spells.s5.attributes = this._s5Attributes(actorData);

    data.prep_spells.s6.name = this._s6Name(actorData);
    data.prep_spells.s6.dmg = this._s6Dam(actorData);
    data.prep_spells.s6.cost = this._s6Cost(actorData);
    data.prep_spells.s6.attributes = this._s6Attributes(actorData);

    data.prep_spells.s7.name = this._s7Name(actorData);
    data.prep_spells.s7.dmg = this._s7Dam(actorData);
    data.prep_spells.s7.cost = this._s7Cost(actorData);
    data.prep_spells.s7.attributes = this._s7Attributes(actorData);

  } 

  _prepareNPCData(actorData) {
    const data = actorData.data;

    //Characteristic Bonuses
    var strBonus = Math.floor(data.characteristics.str.value / 10);
    var endBonus = Math.floor(data.characteristics.end.value / 10);
    var agiBonus = Math.floor(data.characteristics.agi.value / 10);
    var intBonus = Math.floor(data.characteristics.int.value / 10);
    var wpBonus = Math.floor(data.characteristics.wp.value / 10);
    var prcBonus = Math.floor(data.characteristics.prc.value / 10);
    var prsBonus = Math.floor(data.characteristics.prs.value / 10);
    var lckBonus = Math.floor(data.characteristics.lck.value / 10);

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

    data.initiative.base = agiBonus + intBonus + prcBonus + (data.initiative.bonus);
    data.initiative.value = data.initiative.base;
    data.initiative.value = this._iniCalc(actorData);

    data.hp.base = Math.ceil(data.characteristics.end.value / 2);
    data.hp.max = data.hp.base + data.hp.bonus;

    data.magicka.max = data.characteristics.int.value + data.magicka.bonus + this._addIntToMP(actorData);

    data.stamina.max = endBonus + data.stamina.bonus;

    data.luck_points.max = lckBonus + data.luck_points.bonus;

    data.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + data.carry_rating.bonus;
    this._sortCarriedItems(actorData);
    data.current_enc = (this._calculateENC(actorData) - this._armorWeight(actorData) - this._excludeENC(actorData)).toFixed(1);

    //ENC Burden Calculations
    if (data.current_enc > data.carry_rating.max * 3) {
      data.speed.base = 0;
      data.stamina.max = data.stamina.max - 5;
    } else if (data.current_enc > data.carry_rating.max * 2) {
      data.speed.base = Math.floor(data.speed.base / 2);
      data.stamina.max = data.stamina.max - 3;
    } else if (data.current_enc > data.carry_rating.max) {
      data.speed.base = data.speed.base - 1;
      data.stamina.max = data.stamina.max - 1;
    }

    //Armor Weight Class Calculations
    if (data.armor_class == "super_heavy") {
      data.speed.base = data.speed.base - 3;
    } else if (data.armor_class == "heavy") {
      data.speed.base = data.speed.base - 2;
    } else if (data.armor_class == "medium") {
      data.speed.base = data.speed.base - 1;
    } else {
      data.speed.base = data.speed.base;
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

    if (data.wounded == true) {
      if (this._halfWoundPenalty(actorData) == true) {
        for (var skill in data.professions) {
          data.professions[skill] = data.professions[skill] + halfWound;
        }
        for (var skill in data.skills) {
          data.skills[skill].tn = data.skills[skill].tn + halfWound;
        }
        data.initiative.base = data.initiative.base + halfWoundIni;
      } else if (this._halfWoundPenalty(actorData) == false) {
        for (var skill in data.professions) {
          data.professions[skill] = data.professions[skill] + woundPen;
        }
        for (var skill in data.skills) {
          data.skills[skill].tn = data.skills[skill].tn + woundPen;
        }
        data.initiative.base = data.initiative.base + woundIni;
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

    //Worn Armor/Weapons to Actor Sheet
    data.armor.head.ar = this._helmetArmor(actorData);
    data.armor.head.magic_ar = this._helmetMagicArmor(actorData);

    data.armor.l_arm.ar = this._larmArmor(actorData);
    data.armor.l_arm.magic_ar = this._larmMagicArmor(actorData);

    data.armor.r_arm.ar = this._rarmArmor(actorData);
    data.armor.r_arm.magic_ar = this._rarmMagicArmor(actorData);

    data.armor.l_leg.ar = this._llegArmor(actorData);
    data.armor.l_leg.magic_ar = this._llegMagicArmor(actorData);

    data.armor.r_leg.ar = this._rlegArmor(actorData);
    data.armor.r_leg.magic_ar = this._rlegMagicArmor(actorData);

    data.armor.body.ar = this._bodyArmor(actorData);
    data.armor.body.magic_ar = this._bodyMagicArmor(actorData);

    data.shield.br = this._shieldBR(actorData);
    data.shield.magic_br = this._shieldMR(actorData);

    data.weapons.w1.name = this._w1Name(actorData);
    data.weapons.w1.dmg = this._w1Dam(actorData);
    data.weapons.w1.reach = this._w1Reach(actorData);
    data.weapons.w1.qualities = this._w1Qualities(actorData);

    data.weapons.w2.name = this._w2Name(actorData);
    data.weapons.w2.dmg = this._w2Dam(actorData);
    data.weapons.w2.reach = this._w2Reach(actorData);
    data.weapons.w2.qualities = this._w2Qualities(actorData);

    data.weapons.w3.name = this._w3Name(actorData);
    data.weapons.w3.dmg = this._w3Dam(actorData);
    data.weapons.w3.reach = this._w3Reach(actorData);
    data.weapons.w3.qualities = this._w3Qualities(actorData);

    data.prep_spells.s1.name = this._s1Name(actorData);
    data.prep_spells.s1.dmg = this._s1Dam(actorData);
    data.prep_spells.s1.cost = this._s1Cost(actorData);
    data.prep_spells.s1.attributes = this._s1Attributes(actorData);

    data.prep_spells.s2.name = this._s2Name(actorData);
    data.prep_spells.s2.dmg = this._s2Dam(actorData);
    data.prep_spells.s2.cost = this._s2Cost(actorData);
    data.prep_spells.s2.attributes = this._s2Attributes(actorData);

    data.prep_spells.s3.name = this._s3Name(actorData);
    data.prep_spells.s3.dmg = this._s3Dam(actorData);
    data.prep_spells.s3.cost = this._s3Cost(actorData);
    data.prep_spells.s3.attributes = this._s3Attributes(actorData);

    data.prep_spells.s4.name = this._s4Name(actorData);
    data.prep_spells.s4.dmg = this._s4Dam(actorData);
    data.prep_spells.s4.cost = this._s4Cost(actorData);
    data.prep_spells.s4.attributes = this._s4Attributes(actorData);

    data.prep_spells.s5.name = this._s5Name(actorData);
    data.prep_spells.s5.dmg = this._s5Dam(actorData);
    data.prep_spells.s5.cost = this._s5Cost(actorData);
    data.prep_spells.s5.attributes = this._s5Attributes(actorData);

    data.prep_spells.s6.name = this._s6Name(actorData);
    data.prep_spells.s6.dmg = this._s6Dam(actorData);
    data.prep_spells.s6.cost = this._s6Cost(actorData);
    data.prep_spells.s6.attributes = this._s6Attributes(actorData);

    data.prep_spells.s7.name = this._s7Name(actorData);
    data.prep_spells.s7.dmg = this._s7Dam(actorData);
    data.prep_spells.s7.cost = this._s7Cost(actorData);
    data.prep_spells.s7.attributes = this._s7Attributes(actorData);

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

  _sortCarriedItems(actorData) {
    let carried = actorData.items.filter(item => item.data.hasOwnProperty("category"));
    for (let item of carried) {
      if (item.data.category == "none") {
        item.data.carried = false;
      } else if (item.data.category == "") {
        item.data.carried = false;
      } else if (item.data.category == "shield") {
        item.data.carried = false;
      } else if (item.data.category == "weapon1") {
        item.data.carried = false;
      } else if (item.data.category == "weapon2") {
        item.data.carried = false;
      } else if (item.data.category == "weapon3") {
        item.data.carried = false;
      } else if (item.data.category == "spell1") {
        item.data.carried = false;
      } else if (item.data.category == "spell2") {
        item.data.carried = false;
      } else if (item.data.category == "spell3") {
        item.data.carried = false;
      } else if (item.data.category == "spell4") {
        item.data.carried = false;
      } else if (item.data.category == "spell5") {
        item.data.carried = false;
      } else if (item.data.category == "spell6") {
        item.data.carried = false;
      } else if (item.data.category == "spell7") {
        item.data.carried = false;
      } else {
        item.data.carried = true;
      }
    }
  }

  _calculateENC(actorData) {
    let weighted = actorData.items.filter(item => item.data.hasOwnProperty("enc"));
    let totalWeight = 0.0;
    for (let item of weighted) {
      totalWeight = totalWeight + (item.data.enc * item.data.quantity);
    }
    return totalWeight
  }

  _armorWeight(actorData) {
    let worn = actorData.items.filter(item => item.data.carried == true);
    let armorENC = 0.0;
    for (let item of worn) {
      armorENC = armorENC + ((item.data.enc / 2) * item.data.quantity);
    } 
    return armorENC
  }

  _excludeENC(actorData) {
    let excluded = actorData.items.filter(item => item.data.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      totalWeight = totalWeight + (item.data.enc * item.data.quantity);
    }
    return totalWeight
  }

  _hpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("hpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.hpBonus;
    }
    return bonus
  }

  _mpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("mpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.mpBonus;
    }
    return bonus
  }

  _spBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("spBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.spBonus;
    }
    return bonus
  }

  _lpBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("lpBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.lpBonus;
    }
    return bonus
  }

  _wtBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("wtBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.wtBonus;
    }
    return bonus
  }

  _speedBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("speedBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.speedBonus;
    }
    return bonus
  }

  _iniBonus(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("iniBonus"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.iniBonus;
    }
    return bonus
  }

  _diseaseR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("diseaseR"));
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + item.data.diseaseR;
    }
    return bonus
  }

  _fireR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("fireR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.fireR;
      }
      return bonus
  }

  _frostR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("frostR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.frostR;
      }
      return bonus
  }

  _shockR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("shockR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.shockR;
      }
      return bonus
  }

  _poisonR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("poisonR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.poisonR;
      }
      return bonus
  }

  _magicR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("magicR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.magicR;
      }
      return bonus
  }

  _natToughnessR(actorData) {
    let attribute = actorData.items.filter(item => item.data.hasOwnProperty("natToughnessR"));
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + item.data.natToughnessR;
      }
      return bonus
  }

  _speedCalc(actorData) {
    let attribute = actorData.items.filter(item => item.data.halfSpeed == true);
    let speed = actorData.data.speed.base;
    if (attribute.length == 0) {
      speed = speed;
    } else if (attribute.length >= 1) {
      speed = Math.ceil(speed/2);
    }
    return speed .toFixed(0);
  }

  _iniCalc(actorData) {
    let attribute = actorData.items.filter(item => item.type == "trait"|| item.type == "talent");
    let init = actorData.data.initiative.base;
      for (let item of attribute) {
        if (item.data.replace.ini.iniToggle == true) {
          if (item.data.replace.ini.characteristic == "str") {
            init = Math.floor(actorData.data.characteristics.str.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "end") {
            init = Math.floor(actorData.data.characteristics.end.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "agi") {
            init = Math.floor(actorData.data.characteristics.agi.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "int") {
            init = Math.floor(actorData.data.characteristics.int.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "wp") {
            init = Math.floor(actorData.data.characteristics.wp.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "prc") {
            init = Math.floor(actorData.data.characteristics.prc.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "prs") {
            init = Math.floor(actorData.data.characteristics.prs.value / 10) * 3;
          } else if (item.data.replace.ini.characteristic == "lck") {
            init = Math.floor(actorData.data.characteristics.lck.value / 10) * 3;
          }
        }
      }
    return init .toFixed(0);
  }

  _woundThresholdCalc(actorData) {
    let attribute = actorData.items.filter(item => item.type == "trait"|| item.type == "talent");
    let wound = actorData.data.wound_threshold.base;
      for (let item of attribute) {
        if (item.data.replace.wt.wtToggle == true) {
          if (item.data.replace.wt.characteristic == "str") {
            wound = Math.floor(actorData.data.characteristics.str.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "end") {
            wound = Math.floor(actorData.data.characteristics.end.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "agi") {
            wound = Math.floor(actorData.data.characteristics.agi.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "int") {
            wound = Math.floor(actorData.data.characteristics.int.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "wp") {
            wound = Math.floor(actorData.data.characteristics.wp.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "prc") {
            wound = Math.floor(actorData.data.characteristics.prc.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "prs") {
            wound = Math.floor(actorData.data.characteristics.prs.value / 10) * 3;
          } else if (item.data.replace.wt.characteristic == "lck") {
            wound = Math.floor(actorData.data.characteristics.lck.value / 10) * 3;
          }
        }
      }
    return wound .toFixed(0);
  }

  _halfFatiguePenalty(actorData) {
    let attribute = actorData.items.filter(item => item.data.halfFatiguePenalty == true);
    let fatigueReduction = 0;
    if (attribute.length >= 1) {
      fatigueReduction = actorData.data.fatigueLevel / 2;
    } else {
      fatigueReduction = actorData.data.fatigueLevel;
    }
    return fatigueReduction
  }

  _halfWoundPenalty(actorData) {
    let attribute = actorData.items.filter(item => item.data.halfWoundPenalty == true);
    let woundReduction = false;
    if (attribute.length >= 1) {
      woundReduction = true;
    } else {
      woundReduction = false;
    }
    return woundReduction
  }

  _addIntToMP(actorData) {
    let attribute = actorData.items.filter(item => item.data.addIntToMP == true);
    let mp = 0;
    if (attribute.length >= 1) {
      mp = actorData.data.characteristics.int.value;
    } else {
      mp = 0;
    }
    return mp
  }

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

  _isMechanical(actorData) {
    let attribute = actorData.items.filter(item => item.data.mechanical == true);
    let isMechanical = false;
    if (attribute.length >= 1) {
      isMechanical = true;
    } else {
      isMechanical = false;
    }
    return isMechanical
  }

  _dwemerSphere(actorData) {
    let attribute = actorData.items.filter(item => item.data.shiftForm == true);
    let shift = false;
    if (attribute.length >= 1) {
      for (let item of attribute) {
        if (item.data.dailyUse == true) {
          shift = true;
        }
      }
    } else {
      shift = false;
    }
    return shift
  }

  _painIntolerant(actorData) {
    let attribute = actorData.items.filter(item => item.data.painIntolerant == true);
    let pain = false;
    if (attribute.length >= 1) {
      pain = true;
    } 
    return pain
  }

  _helmetArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "head");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _helmetMagicArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "head");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _larmArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "l_arm");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _larmMagicArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "l_arm");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _rarmArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "r_arm");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _rarmMagicArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "r_arm");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _llegArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "l_leg");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _llegMagicArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "l_leg");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _rlegArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "r_leg");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _rlegMagicArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "r_leg");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _bodyArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "body");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _bodyMagicArmor(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "body");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _shieldBR(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "shield");
    let ar = "";
      for (let item of armor) {
        ar = item.data.armor;
      }
      return ar
  }

  _shieldMR(actorData) {
    let armor = actorData.items.filter(item => item.data.category == "shield");
    let mr = "";
      for (let item of armor) {
        mr = item.data.magic_ar;
      }
      return mr
  }

  _w1Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon1");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _w1Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon1");
    let dam = "";
      for (let item of primary) {
        if (item.data.weapon2H == true) {
          dam = item.data.damage2;
        } else {
        dam = item.data.damage;
      }
      return dam
    }
  }

  _w1Reach(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon1");
    let reach = "";
      for (let item of primary) {
        reach = item.data.reach;
      }
      return reach
  }

  _w1Qualities(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon1");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.qualities;
      }
      return qualities
  }

  _w2Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon2");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _w2Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon2");
    let dam = "";
    for (let item of primary) {
      if (item.data.weapon2H == true) {
        dam = item.data.damage2;
      } else {
      dam = item.data.damage;
    }
    return dam
  }
}

  _w2Reach(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon2");
    let reach = "";
      for (let item of primary) {
        reach = item.data.reach;
      }
      return reach
  }

  _w2Qualities(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon2");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.qualities;
      }
      return qualities
  }

  _w3Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon3");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _w3Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon3");
    let dam = "";
    for (let item of primary) {
      if (item.data.weapon2H == true) {
        dam = item.data.damage2;
      } else {
      dam = item.data.damage;
    }
    return dam
  }
}

  _w3Reach(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon3");
    let reach = "";
      for (let item of primary) {
        reach = item.data.reach;
      }
      return reach
  }

  _w3Qualities(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "weapon3");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.qualities;
      }
      return qualities
  }

  _s1Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell1");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s1Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell1");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s1Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell1");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s1Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell1");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

  _s2Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell2");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s2Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell2");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s2Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell2");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s2Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell2");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

  _s3Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell3");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s3Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell3");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s3Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell3");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s3Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell3");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

  _s4Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell4");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s4Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell4");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s4Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell4");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s4Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell4");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

  _s5Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell5");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s5Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell5");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s5Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell5");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s5Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell5");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

  _s6Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell6");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s6Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell6");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s6Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell6");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s6Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell6");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

  _s7Name(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell7");
    let name = "";
      for (let item of primary) {
        name = item.name;
      }
      return name
  }

  _s7Dam(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell7");
    let dam = "";
      for (let item of primary) {
        dam = item.data.damage;
      }
      return dam
  }

  _s7Cost(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell7");
    let reach = "";
      for (let item of primary) {
        reach = item.data.cost;
      }
      return reach
  }

  _s7Attributes(actorData) {
    let primary = actorData.items.filter(item => item.data.category == "spell7");
    let qualities = "";
      for (let item of primary) {
        qualities = item.data.attributes;
      }
      return qualities
  }

}
