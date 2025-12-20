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
  }

  /**
   * Small perf helpers (temporary — remove or disable in production if desired)
   */
  _perfStart(label) {
    if (window && window.performance) return performance.now();
    return Date.now();
  }
  _perfEnd(label, start) {
    const dur = ((window && window.performance && performance.now ? performance.now() : Date.now()) - start).toFixed(1);
    console.warn(`PERF: ${label} took ${dur}ms`, this.name || this._id || this);
  }

  /**
   * Aggregate item stats in a single pass to avoid repeated item.filter() work.
   * Returns an object with precomputed sums and flags used by prepare functions.
   */
  _aggregateItemStats(actorData) {
    const stats = {
      charBonus: { str:0, end:0, agi:0, int:0, wp:0, prc:0, prs:0, lck:0 },
      hpBonus:0, mpBonus:0, spBonus:0, lpBonus:0, wtBonus:0, speedBonus:0, iniBonus:0,
      resist: { diseaseR:0, fireR:0, frostR:0, shockR:0, poisonR:0, magicR:0, natToughnessR:0, silverR:0, sunlightR:0 },
      swimBonus:0, flyBonus:0, doubleSwimSpeed:false, addHalfSpeed:false, halfSpeed:false,
      totalEnc:0, containersAppliedEnc:0, containedWeightReduction:0, armorEnc:0, excludedEnc:0,
      skillModifiers: {}, // { skillName: totalModifier }
      traitsAndTalents: [], shiftForms: [], itemCount:0
    };

    const items = actorData.items || [];
    for (let item of items) {
      stats.itemCount++;
      const sys = (item && item.system) ? item.system : {};
      const enc = Number(sys.enc || 0);
      const qty = Number(sys.quantity || 0);

      // ENC
      stats.totalEnc += enc * qty;
      if (item.type === 'container' && sys.container_enc && !isNaN(Number(sys.container_enc.applied_enc))) {
        stats.containersAppliedEnc += Number(sys.container_enc.applied_enc);
      }
      if (sys.containerStats && sys.containerStats.contained) {
        stats.containedWeightReduction += enc * qty;
      }
      if (sys.excludeENC === true) stats.excludedEnc += enc * qty;
      if (sys.equipped === true) stats.armorEnc += ((enc / 2) * qty);

      // Characteristic bonuses
      if (sys.characteristicBonus) {
        stats.charBonus.str += Number(sys.characteristicBonus.strChaBonus || 0);
        stats.charBonus.end += Number(sys.characteristicBonus.endChaBonus || 0);
        stats.charBonus.agi += Number(sys.characteristicBonus.agiChaBonus || 0);
        stats.charBonus.int += Number(sys.characteristicBonus.intChaBonus || 0);
        stats.charBonus.wp += Number(sys.characteristicBonus.wpChaBonus || 0);
        stats.charBonus.prc += Number(sys.characteristicBonus.prcChaBonus || 0);
        stats.charBonus.prs += Number(sys.characteristicBonus.prsChaBonus || 0);
        stats.charBonus.lck += Number(sys.characteristicBonus.lckChaBonus || 0);
      }

      // Resource/resist bonuses
      stats.hpBonus += Number(sys.hpBonus || 0);
      stats.mpBonus += Number(sys.mpBonus || 0);
      stats.spBonus += Number(sys.spBonus || 0);
      stats.lpBonus += Number(sys.lpBonus || 0);
      stats.wtBonus += Number(sys.wtBonus || 0);
      stats.speedBonus += Number(sys.speedBonus || 0);
      stats.iniBonus += Number(sys.iniBonus || 0);

      stats.resist.diseaseR += Number(sys.diseaseR || 0);
      stats.resist.fireR += Number(sys.fireR || 0);
      stats.resist.frostR += Number(sys.frostR || 0);
      stats.resist.shockR += Number(sys.shockR || 0);
      stats.resist.poisonR += Number(sys.poisonR || 0);
      stats.resist.magicR += Number(sys.magicR || 0);
      stats.resist.natToughnessR += Number(sys.natToughnessR || 0);
      stats.resist.silverR += Number(sys.silverR || 0);
      stats.resist.sunlightR += Number(sys.sunlightR || 0);

      // swim / fly / flags
      stats.swimBonus += Number(sys.swimBonus || 0);
      stats.flyBonus += Number(sys.flyBonus || 0);
      if (sys.doubleSwimSpeed) stats.doubleSwimSpeed = true;
      if (sys.addHalfSpeed) stats.addHalfSpeed = true;
      if (sys.halfSpeed) stats.halfSpeed = true;

      // skill modifiers
      if (Array.isArray(sys.skillArray)) {
        for (let entry of sys.skillArray) {
          const name = entry && entry.name;
          const value = Number(entry && entry.value || 0);
          if (!name) continue;
          stats.skillModifiers[name] = (stats.skillModifiers[name] || 0) + value;
        }
      }

      if (item.type === 'trait' || item.type === 'talent') stats.traitsAndTalents.push(item);
      if (sys.shiftFormStyle) stats.shiftForms.push(sys.shiftFormStyle);
    }

    stats.totalEnc = stats.totalEnc + stats.containersAppliedEnc - stats.containedWeightReduction;
    return stats;
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
    // Backwards-compatible safe calculation — but prefer using _aggregateItemStats for performance.
    let weighted = actorData.items.filter(item => item && item.system && item.system.hasOwnProperty("enc"));
    let totalWeight = 0.0;
    for (let item of weighted) {
      const enc = Number(item.system.enc || 0);
      const qty = Number(item.system.quantity || 0);
      const containerAppliedENC = (item.type == 'container' && item.system.container_enc && !isNaN(Number(item.system.container_enc.applied_enc)))
        ? Number(item.system.container_enc.applied_enc)
        : 0;
      const containedItemReduction = (item.type != 'container' && item.system.containerStats && item.system.containerStats.contained) ? (enc * qty) : 0;
      totalWeight = totalWeight + (enc * qty) + containerAppliedENC - containedItemReduction;
    }
    return totalWeight
  }

  _armorWeight(actorData) {
    let worn = actorData.items.filter(item => item && item.system && item.system.equipped == true);
    let armorENC = 0.0;
    for (let item of worn) {
      const enc = Number(item.system.enc || 0);
      const qty = Number(item.system.quantity || 0);
      armorENC = armorENC + ((enc / 2) * qty);
    }
    return armorENC
  }

  _excludeENC(actorData) {
    let excluded = actorData.items.filter(item => item && item.system && item.system.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      const enc = Number(item.system.enc || 0);
      const qty = Number(item.system.quantity || 0);
      totalWeight = totalWeight + (enc * qty);
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
    // Backwards-compatible safe swim calculation; aggregator provides swimBonus/doubleSwimSpeed
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

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const actorSystemData = actorData.system;

    // PERF: optional profiling (comment out in production)
    // const t0 = this._perfStart('_prepareCharacterData');

    // Aggregate items once to avoid many item.filter() passes
    const agg = this._aggregateItemStats(actorData);

    //Add bonuses from items to Characteristics (use aggregated sums)
    actorSystemData.characteristics.str.total = actorSystemData.characteristics.str.base + agg.charBonus.str;
    actorSystemData.characteristics.end.total = actorSystemData.characteristics.end.base + agg.charBonus.end;
    actorSystemData.characteristics.agi.total = actorSystemData.characteristics.agi.base + agg.charBonus.agi;
    actorSystemData.characteristics.int.total = actorSystemData.characteristics.int.base + agg.charBonus.int;
    actorSystemData.characteristics.wp.total = actorSystemData.characteristics.wp.base + agg.charBonus.wp;
    actorSystemData.characteristics.prc.total = actorSystemData.characteristics.prc.base + agg.charBonus.prc;
    actorSystemData.characteristics.prs.total = actorSystemData.characteristics.prs.base + agg.charBonus.prs;
    actorSystemData.characteristics.lck.total = actorSystemData.characteristics.lck.base + agg.charBonus.lck;


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

    //Talent/Power/Trait Resource Bonuses (use aggregated values)
    actorSystemData.hp.bonus = agg.hpBonus;
    actorSystemData.magicka.bonus = agg.mpBonus;
    actorSystemData.stamina.bonus = agg.spBonus;
    actorSystemData.luck_points.bonus = agg.lpBonus;
    actorSystemData.wound_threshold.bonus = agg.wtBonus;
    actorSystemData.speed.bonus = agg.speedBonus;
    actorSystemData.initiative.bonus = agg.iniBonus;

    //Talent/Power/Trait Resistance Bonuses (use aggregated values)
    actorSystemData.resistance.diseaseR = agg.resist.diseaseR;
    actorSystemData.resistance.fireR = agg.resist.fireR;
    actorSystemData.resistance.frostR = agg.resist.frostR;
    actorSystemData.resistance.shockR = agg.resist.shockR;
    actorSystemData.resistance.poisonR = agg.resist.poisonR;
    actorSystemData.resistance.magicR = agg.resist.magicR;
    actorSystemData.resistance.natToughness = agg.resist.natToughnessR;
    actorSystemData.resistance.silverR = agg.resist.silverR;
    actorSystemData.resistance.sunlightR = agg.resist.sunlightR;

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
    // add aggregated swim bonus (respect doubleSwimSpeed)
    actorSystemData.speed.swimSpeed += agg.doubleSwimSpeed ? (agg.swimBonus * 2) : agg.swimBonus;
    actorSystemData.speed.flySpeed = agg.flyBonus || this._flyCalc(actorData);

    actorSystemData.initiative.base = agiBonus + intBonus + prcBonus + (actorSystemData.initiative.bonus);
    actorSystemData.initiative.value = actorSystemData.initiative.base;
    actorSystemData.initiative.value = this._iniCalc(actorData);

    actorSystemData.hp.base = Math.ceil(actorSystemData.characteristics.end.total / 2);
    actorSystemData.hp.max = actorSystemData.hp.base + actorSystemData.hp.bonus;

    actorSystemData.magicka.max = actorSystemData.characteristics.int.total + actorSystemData.magicka.bonus + this._determineIbMp(actorData);

    actorSystemData.stamina.max = endBonus + actorSystemData.stamina.bonus;

    actorSystemData.luck_points.max = lckBonus + actorSystemData.luck_points.bonus;

    actorSystemData.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + actorSystemData.carry_rating.bonus;
    actorSystemData.carry_rating.current = (agg.totalEnc - agg.armorEnc - agg.excludedEnc).toFixed(1);

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

    // PERF end
    // this._perfEnd('_prepareCharacterData', t0);
  }

  async _prepareNPCData(actorData) {
    const actorSystemData = actorData.system;

    // PERF: optional profiling (comment out in production)
    // const t0 = this._perfStart('_prepareNPCData');

    // Aggregate items once
    const agg = this._aggregateItemStats(actorData);

    //Add bonuses from items to Characteristics (use aggregated sums)
    actorSystemData.characteristics.str.total = actorSystemData.characteristics.str.base + agg.charBonus.str;
    actorSystemData.characteristics.end.total = actorSystemData.characteristics.end.base + agg.charBonus.end;
    actorSystemData.characteristics.agi.total = actorSystemData.characteristics.agi.base + agg.charBonus.agi;
    actorSystemData.characteristics.int.total = actorSystemData.characteristics.int.base + agg.charBonus.int;
    actorSystemData.characteristics.wp.total = actorSystemData.characteristics.wp.base + agg.charBonus.wp;
    actorSystemData.characteristics.prc.total = actorSystemData.characteristics.prc.base + agg.charBonus.prc;
    actorSystemData.characteristics.prs.total = actorSystemData.characteristics.prs.base + agg.charBonus.prs;
    actorSystemData.characteristics.lck.total = actorSystemData.characteristics.lck.base + agg.charBonus.lck;


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

    //Talent/Power/Trait Bonuses (use aggregated values)
    actorSystemData.hp.bonus = agg.hpBonus;
    actorSystemData.magicka.bonus = agg.mpBonus;
    actorSystemData.stamina.bonus = agg.spBonus;
    actorSystemData.luck_points.bonus = agg.lpBonus;
    actorSystemData.wound_threshold.bonus = agg.wtBonus;
    actorSystemData.speed.bonus = agg.speedBonus;
    actorSystemData.initiative.bonus = agg.iniBonus;

    //Talent/Power/Trait Resistance Bonuses (use aggregated values)
    actorSystemData.resistance.diseaseR = agg.resist.diseaseR;
    actorSystemData.resistance.fireR = agg.resist.fireR;
    actorSystemData.resistance.frostR = agg.resist.frostR;
    actorSystemData.resistance.shockR = agg.resist.shockR;
    actorSystemData.resistance.poisonR = agg.resist.poisonR;
    actorSystemData.resistance.magicR = agg.resist.magicR;
    actorSystemData.resistance.natToughness = agg.resist.natToughnessR;
    actorSystemData.resistance.silverR = agg.resist.silverR;
    actorSystemData.resistance.sunlightR = agg.resist.sunlightR;

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
    // add aggregated swim bonus
    actorSystemData.speed.swimSpeed += agg.doubleSwimSpeed ? (agg.swimBonus * 2) : agg.swimBonus;
    actorSystemData.speed.flySpeed = agg.flyBonus || this._flyCalc(actorData);

    actorSystemData.initiative.base = agiBonus + intBonus + prcBonus + (actorSystemData.initiative.bonus);
    actorSystemData.initiative.value = actorSystemData.initiative.base;
    actorSystemData.initiative.value = this._iniCalc(actorData);

    actorSystemData.hp.base = Math.ceil(actorSystemData.characteristics.end.total / 2);
    actorSystemData.hp.max = actorSystemData.hp.base + actorSystemData.hp.bonus;

    actorSystemData.magicka.max = actorSystemData.characteristics.int.total + actorSystemData.magicka.bonus + this._determineIbMp(actorData);

    actorSystemData.stamina.max = endBonus + actorSystemData.stamina.bonus;

    actorSystemData.luck_points.max = lckBonus + actorSystemData.luck_points.bonus;

    actorSystemData.carry_rating.max = Math.floor((4 * strBonus) + (2 * endBonus)) + actorSystemData.carry_rating.bonus;
    actorSystemData.carry_rating.current = (agg.totalEnc - agg.armorEnc - agg.excludedEnc).toFixed(1)

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

    // Apply aggregated item skill modifiers (one-pass)
    if (agg.skillModifiers && Object.keys(agg.skillModifiers).length > 0) {
      for (let [skillName, value] of Object.entries(agg.skillModifiers)) {
        if (actorSystemData.professions?.hasOwnProperty(skillName)) {
          actorSystemData.professions[skillName] = Number(actorSystemData.professions[skillName] || 0) + Number(value);
          actorSystemData.professionsWound[skillName] = Number(actorSystemData.professionsWound[skillName] || 0) + Number(value);
        }
      }
    }

    //Calculate Item Profession Modifiers (legacy method still present but we used aggregated modifiers above)
    // this._calculateItemSkillModifiers(actorData)

    // PERF end
    // this._perfEnd('_prepareNPCData', t0);
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
