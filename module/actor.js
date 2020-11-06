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

    //Magic Skill Bonus Calculation
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

    //Combat Style Skill Bonus Calculation
    for (var skill in data.combat_styles) {
      if (data.combat_styles[skill].rank == "untrained") {
        data.combat_styles[skill].bonus = -10;
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

    //Derived Calculations
    data.wound_threshold.base = strBonus + endBonus + wpBonus + (data.wound_threshold.bonus);
    data.speed.base = strBonus + (2 * agiBonus) + (data.speed.bonus);
    data.initiative.base = agiBonus + intBonus + prcBonus + (data.initiative.bonus);

    data.hp.base = Math.ceil(data.characteristics.end.value / 2);
    data.hp.max = data.hp.base + data.hp.bonus;

    data.magicka.max = data.characteristics.int.value + data.magicka.bonus;

    data.stamina.max = endBonus + data.stamina.bonus;

    data.luck_points.max = lckBonus;

    data.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + data.carry_rating.bonus;
    this._sortCarriedItems(actorData);
    data.current_enc = (this._calculateENC(actorData) - this._armorWeight(actorData)) .toFixed(1);

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
    if (data.wounded == true) {
      for (var skill in data.skills) {
        data.skills[skill].tn = data.skills[skill].tn - 20;
      }
      for (var skill in data.magic_skills) {
        data.magic_skills[skill].tn = data.magic_skills[skill].tn -20;
      }
      for (var skill in data.combat_styles) {
        data.combat_styles[skill].tn = data.combat_styles[skill].tn -20;
      }
      data.initiative.base = data.initiative.base -2;
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

    //Derived Calculations
    data.wound_threshold.base = strBonus + endBonus + wpBonus + (data.wound_threshold.bonus);
    data.speed.base = strBonus + (2 * agiBonus) + (data.speed.bonus);
    data.initiative.base = agiBonus + intBonus + prcBonus + (data.initiative.bonus);

    data.hp.base = Math.ceil(data.characteristics.end.value / 2);
    data.hp.max = data.hp.base + data.hp.bonus;

    data.magicka.max = data.characteristics.int.value + data.magicka.bonus;

    data.stamina.max = endBonus + data.stamina.bonus;

    data.luck_points.max = lckBonus;

    data.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + data.carry_rating.bonus;
    this._sortCarriedItems(actorData);
    data.current_enc = this._calculateENC(actorData) - this._armorWeight(actorData);

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
    if (data.wounded == true) {
      for (var skill in data.professions) {
        data.professions[skill] = data.professions[skill] - 20;
      }
      data.initiative.base = data.initiative.base -2;
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
    return totalWeight .toFixed(1)
  }

  _armorWeight(actorData) {
    let worn = actorData.items.filter(item => item.data.carried == true);
    let armorENC = 0.0;
    for (let item of worn) {
      armorENC = armorENC + ((item.data.enc / 2) * item.data.quantity);
    } 
    return armorENC .toFixed (1)
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
        dam = item.data.damage;
      }
      return dam
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
        dam = item.data.damage;
      }
      return dam
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
        dam = item.data.damage;
      }
      return dam
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

}
