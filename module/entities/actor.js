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

    // Call specialized preparation functions only if they exist.
    // If neither exists, use a minimal safe fallback so Foundry initialization
    // doesn't crash when documents are created.
    try {
      if (actorData.type === "Player Character" && typeof this._prepareCharacterData === "function") {
        this._prepareCharacterData(actorData);
      } else if (actorData.type === "NPC" && typeof this._prepareNPCData === "function") {
        this._prepareNPCData(actorData);
      } else {
        // Minimal safe fallback to ensure required fields exist
        this._legacyPrepareFallback(actorData);
      }
    } catch (err) {
      console.error(`uesrpg-3ev4 | Error during prepareData for ${this.name || this.id}:`, err);
      // Do not rethrow — we want Foundry to continue initializing other documents.
    }
  }

  // Minimal fallback to provide safe defaults so downstream code doesn't throw.
  _legacyPrepareFallback(actorData) {
    actorData.system = actorData.system || {};
    actorData.system.containerStats = actorData.system.containerStats || {};
    actorData.system.carry_rating = actorData.system.carry_rating || { current: 0, max: 0, penalty: 0, bonus: 0 };
    actorData.system.fatigue = actorData.system.fatigue || { level: 0, penalty: 0, bonus: 0 };
    actorData.system.woundPenalty = actorData.system.woundPenalty || 0;
    actorData.system.wounded = actorData.system.wounded || false;
    // Ensure items collection exists (embedded collection); this prevents code that iterates items from failing
    if (!actorData.items) actorData.items = new foundry.data.EmbeddedCollection(foundry.documents.Item, [], { parent: actorData });
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
   * The result is cached on the actor instance for the duration of a prepare cycle.
   */
  _aggregateItemStats(actorData) {
    // Build a signature of items to detect changes
    const items = actorData.items || [];
    let sigParts = [];
    for (let it of items) {
      sigParts.push(`${it?._id||''}:${Number(it?.system?.quantity||0)}:${Number(it?.system?.enc||0)}`);
    }
    const signature = sigParts.join('|');

    if (this._aggCache && this._aggCache.signature === signature && this._aggCache.agg) {
      return this._aggCache.agg;
    }

    const stats = {
      charBonus: { str:0, end:0, agi:0, int:0, wp:0, prc:0, prs:0, lck:0 },
      hpBonus:0, mpBonus:0, spBonus:0, lpBonus:0, wtBonus:0, speedBonus:0, iniBonus:0,
      resist: { diseaseR:0, fireR:0, frostR:0, shockR:0, poisonR:0, magicR:0, natToughnessR:0, silverR:0, sunlightR:0 },
      swimBonus:0, flyBonus:0, doubleSwimSpeed:false, addHalfSpeed:false, halfSpeed:false,
      totalEnc:0, containersAppliedEnc:0, containedWeightReduction:0, armorEnc:0, excludedEnc:0,
      skillModifiers: {},
      traitsAndTalents: [],
      shiftForms: [],
      itemCount: items.length
    };

    for (let item of items) {
      const sys = item && item.system ? item.system : {};
      const enc = Number(sys.enc || 0);
      const qty = Number(sys.quantity || 0);
      const id = item?._id || '';

      // ENC - defensive guards for nested property access
      stats.totalEnc += enc * qty;
      if (item.type === 'container' && sys?.container_enc && !isNaN(Number(sys?.container_enc?.applied_enc))) {
        stats.containersAppliedEnc += Number(sys.container_enc.applied_enc);
      }
      if (sys?.containerStats?.contained) {
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

    this._aggCache = { signature, agg: stats };
    return stats;
  }

  _filterToEquippedBonusItems(items, bonusProperty) {
    return (items || []).filter(i =>
  i?.system && Object.prototype.hasOwnProperty.call(i.system, bonusProperty) &&
  (Object.prototype.hasOwnProperty.call(i.system, 'equipped') ? i.system.equipped : true)
);
  }

  _strBonusCalc(actorData) {
    const strBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + (Number(item?.system?.characteristicBonus?.strChaBonus) || 0);
    }
    return totalBonus
  }

  _endBonusCalc(actorData) {
    let endBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of endBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.endChaBonus || 0);
}
    return totalBonus
  }

  _agiBonusCalc(actorData) {
    let agiBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of agiBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.agiChaBonus || 0);
}
    return totalBonus
  }

  _intBonusCalc(actorData) {
    let intBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
   for (let item of intBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.intChaBonus || 0);
}
    return totalBonus
  }

  _wpBonusCalc(actorData) {
    let wpBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of wpBonusItems) {
      totalBonus = totalBonus + (Number(item?.system?.characteristicBonus?.wpChaBonus) || 0);
    }
    return totalBonus
  }

  _prcBonusCalc(actorData) {
    let prcBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prcBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.prcChaBonus || 0);
}
    return totalBonus
  }

  _prsBonusCalc(actorData) {
    let prsBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
   for (let item of prsBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.prsChaBonus || 0);
}
    return totalBonus
  }

  _lckBonusCalc(actorData) {
    let lckBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of lckBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.lckChaBonus || 0);
}
    return totalBonus
  }

  _calculateENC(actorData) {
    let weighted = (actorData.items || []).filter(item => item?.system && Object.prototype.hasOwnProperty.call(item.system, "enc"));
    let totalWeight = 0.0;
    for (let item of weighted) {
      const enc = Number(item?.system?.enc || 0);
      const qty = Number(item?.system?.quantity || 0);
      // Defensive guard: safe nested access to container_enc.applied_enc
      const containerAppliedENC = (item.type == 'container' && item?.system?.container_enc && !isNaN(Number(item?.system?.container_enc?.applied_enc)))
        ? Number(item?.system?.container_enc?.applied_enc)
        : 0;
      const containedItemReduction = (item?.type !== 'container' && !!item?.system?.containerStats?.contained) ? (enc * qty) : 0;
      totalWeight = totalWeight + (enc * qty) + containerAppliedENC - containedItemReduction;
    }
    return totalWeight
  }

  _armorWeight(actorData) {
    let worn = (actorData.items || []).filter(item => item?.system && item.system.equipped == true);
    let armorENC = 0.0;
    for (let item of worn) {
      const enc = Number(item?.system?.enc || 0);
      const qty = Number(item?.system?.quantity || 0);
      armorENC = armorENC + ((enc / 2) * qty);
    }
    return armorENC
  }

  _excludeENC(actorData) {
    let excluded = (actorData.items || []).filter(item => item?.system && item.system.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      const enc = Number(item?.system?.enc || 0);
      const qty = Number(item?.system?.quantity || 0);
      totalWeight = totalWeight + (enc * qty);
    }
    return totalWeight
  }

  _hpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'hpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.hpBonus || 0);
    }
    return bonus
  }

  _mpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'mpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.mpBonus || 0);
    }
    return bonus
  }

  _spBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'spBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.spBonus || 0);
    }
    return bonus
  }

  _lpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'lpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.lpBonus || 0);
    }
    return bonus
  }

  _wtBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'wtBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.wtBonus || 0);
    }
    return bonus
  }

  _speedBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'speedBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.speedBonus || 0);
    }
    return bonus
  }

  _iniBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'iniBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.iniBonus || 0);
    }
    return bonus
  }

  _diseaseR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'diseaseR');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.diseaseR || 0);
    }
    return bonus
  }

  _fireR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'fireR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.fireR || 0);
      }
      return bonus
  }

  _frostR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'frostR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.frostR || 0);
      }
      return bonus
  }

  _shockR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'shockR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.shockR || 0);
      }
      return bonus
  }

  _poisonR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'poisonR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.poisonR || 0);
      }
      return bonus
  }

  _magicR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'magicR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.magicR || 0);
      }
      return bonus
  }

  _natToughnessR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'natToughnessR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.natToughnessR || 0);
      }
      return bonus
  }

  _silverR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'silverR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.silverR || 0);
      }
      return bonus
  }

  _sunlightR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'sunlightR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.sunlightR || 0);
      }
      return bonus
  }

  _swimCalc(actorData) {
    let swimBonusItems = this._filterToEquippedBonusItems(actorData.items, 'swimBonus');
    let bonus = 0;
    for (let item of swimBonusItems) {
      bonus = bonus + Number(item?.system?.swimBonus || 0);
    }
    const shouldDoubleSwimSpeed = actorData.items?.some(i => i?.system && i.system.doubleSwimSpeed);
    // Double the swim speed and any bonuses
    if (shouldDoubleSwimSpeed) {
      bonus *= 2;
      bonus += Number(actorData?.system?.speed?.swimSpeed || 0);
    }
    return bonus;
  }

  _flyCalc(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'flyBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.flyBonus || 0);
    }
    return bonus
  }

  _speedCalc(actorData) {
    let attribute = (actorData.items || []).filter(item => item?.system && item.system.halfSpeed === true);
    let speed = Number(actorData?.system?.speed?.base || 0);
    if (attribute.length === 0) {
      speed = speed;
    } else if (attribute.length >= 1) {
      speed = Math.ceil(speed/2);
    }
    return speed;
  }

  _iniCalc(actorData) {
    let attribute = (actorData.items || []).filter(item => item && (item.type == "trait"|| item.type == "talent"));
    let init = Number(actorData?.system?.initiative?.base || 0);
      for (let item of attribute) {
        if (item?.system?.replace?.ini && item.system.replace.ini.characteristic != "none") {
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
    let attribute = (actorData.items || []).filter(item => item && (item.type === "trait"|| item.type === "talent"));
    let wound = Number(actorData?.system?.wound_threshold?.base || 0);
      for (let item of attribute) {
        if (item?.system?.replace?.wt && item.system.replace.wt.characteristic != "none") {
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
    let attribute = (actorData.items || []).filter(item => item && item?.system && item.system.halfFatiguePenalty == true);
    let penalty = 0;
    if (attribute.length >= 1) {
      penalty = Number(actorData?.system?.fatigue?.level || 0) * -5;
    } else {
      penalty = Number(actorData?.system?.fatigue?.level || 0) * -10;
    }
    return penalty
  }

  _halfWoundPenalty(actorData) {
    let attribute = (actorData.items || []).filter(item => item && item?.system && item.system.halfWoundPenalty == true);
    let woundReduction = false;
    if (attribute.length >= 1) {
      woundReduction = true;
    } else {
      woundReduction = false;
    }
    return woundReduction
  }

  _determineIbMp(actorData) {
    let addIbItems = (actorData.items || []).filter(item => item && item?.system && item.system.addIBToMP == true);

    if (addIbItems.length >= 1) {
      const actorIntBonus = Number(actorData?.system?.characteristics?.int?.bonus || 0);
      return addIbItems.reduce(
        (acc, item) => actorIntBonus * Number(item?.system?.addIntToMPMultiplier || 0) + acc,
        0
      );
    }
    return 0;
  }

  _untrainedException(actorData) {
    let attribute = (actorData.items || []).filter(item => item && item?.system && item.system.untrainedException == true);
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
    let attribute = (actorData.items || []).filter(item => item && item?.system && item.system.mechanical == true);
    let isMechanical = false;
    if (attribute.length >= 1) {
      isMechanical = true;
    } else {
      isMechanical = false;
    }
    return isMechanical
  }

  _dwemerSphere(actorData) {
    let attribute = (actorData.items || []).filter(item => item && item?.system && item.system.shiftForm == true);
    let shift = false;
    if (attribute.length >= 1) {
      for (let item of attribute) {
        if (item?.system?.dailyUse == true) {
          shift = true;
        }
      }
    } else {
      shift = false;
    }
    return shift
  }

  _vampireLordForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormVampireLord");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereWolfForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && (item.system.shiftFormStyle === "shiftFormWereWolf"||item.system.shiftFormStyle === "shiftFormWereLion"));
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBatForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormWereBat");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBoarForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormWereBoar");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBearForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormWereBear");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereCrocodileForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormWereCrocodile");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereVultureForm(actorData) {
    let form = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormWereVulture");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _painIntolerant(actorData) {
    let attribute = (actorData.items || []).filter(item => item && item?.system && item.system.painIntolerant == true);
    let pain = false;
    if (attribute.length >= 1) {
      pain = true;
    }
    return pain
  }

  _addHalfSpeed(actorData) {
    let halfSpeedItems = (actorData.items || []).filter(item => item && item?.system && item.system.addHalfSpeed === true);
    let isWereCroc = (actorData.items || []).filter(item => item && item?.system && item.system.shiftFormStyle === "shiftFormWereCrocodile");
    let speed = Number(actorData?.system?.speed?.value || 0);
    if (isWereCroc.length > 0 && halfSpeedItems.length > 0) {
      speed = Number(actorData?.system?.speed?.base || 0);
    } else if (isWereCroc.length == 0 && halfSpeedItems.length > 0) {
      speed = Math.ceil(Number(actorData?.system?.speed?.value || 0)/2) + Number(actorData?.system?.speed?.base || 0);
    } else if (isWereCroc.length > 0 && halfSpeedItems.length == 0) {
      speed = Math.ceil(Number(actorData?.system?.speed?.base || 0)/2);
    } else {
      speed = Number(actorData?.system?.speed?.value || 0);
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
    // Guard: Use Number() to ensure numeric value after toFixed for safe carry rating calculations
    actorSystemData.carry_rating.current = Number((agg.totalEnc - agg.armorEnc - agg.excludedEnc).toFixed(1));

    //Form Shift Calcs
    if (this._wereWolfForm(actorData) === true) {
      actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
      actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
      actorSystemData.hp.max = actorSystemData.hp.max + 5;
      actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
      actorSystemData.speed.base = actorSystemData.speed.base + 9;
      actorSystemData.speed.value = this._speedCalc(actorData);
      actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
      actorSystemData.resistance.natToughness = 5;
      actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
      actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
      // Safe defensive access to skill items and their system properties
      const surv = actorData.items.find(i => i.name === 'Survival'); if (surv?.system) surv.system.miscValue = 30;
      const nav = actorData.items.find(i => i.name === 'Navigate'); if (nav?.system) nav.system.miscValue = 30;
      const obs = actorData.items.find(i => i.name === 'Observe'); if (obs?.system) obs.system.miscValue = 30;
    } else if (this._wereBatForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = Math.round(this._speedCalc(actorData)/2);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        // Safe defensive access to skill items and their system properties
        const surv2 = actorData.items.find(i => i.name === 'Survival'); if (surv2?.system) surv2.system.miscValue = 30;
      const nav2 = actorData.items.find(i => i.name === 'Navigate'); if (nav2?.system) nav2.system.miscValue = 30;
      const obs2 = actorData.items.find(i => i.name === 'Observe'); if (obs2?.system) obs2.system.miscValue = 30;
    } else if (this._wereBoarForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.speed.base = actorSystemData.speed.base + 9;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
        actorSystemData.resistance.natToughness = 7;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        // Safe defensive access to skill items and their system properties
        const surv3 = actorData.items.find(i => i.name === 'Survival'); if (surv3?.system) surv3.system.miscValue = 30;
        const nav3 = actorData.items.find(i => i.name === 'Navigate'); if (nav3?.system) nav3.system.miscValue = 30;
        const obs3 = actorData.items.find(i => i.name === 'Observe'); if (obs3?.system) obs3.system.miscValue = 30;
    } else if (this._wereBearForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 10;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.base = actorSystemData.speed.base + 5;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        // Safe defensive access to skill items and their system properties
        const surv4 = actorData.items.find(i => i.name === 'Survival'); if (surv4?.system) surv4.system.miscValue = 30;
        const nav4 = actorData.items.find(i => i.name === 'Navigate'); if (nav4?.system) nav4.system.miscValue = 30;
        const obs4 = actorData.items.find(i => i.name === 'Observe'); if (obs4?.system) obs4.system.miscValue = 30;
    } else if (this._wereCrocodileForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = Math.round(this._addHalfSpeed(actorData));
        actorSystemData.speed.swimSpeed = parseFloat(this._speedCalc(actorData)) + 9;
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        // Safe defensive access to skill items and their system properties
        const surv5 = actorData.items.find(i => i.name === 'Survival'); if (surv5?.system) surv5.system.miscValue = 30;
        const nav5 = actorData.items.find(i => i.name === 'Navigate'); if (nav5?.system) nav5.system.miscValue = 30;
        const obs5 = actorData.items.find(i => i.name === 'Observe'); if (obs5?.system) obs5.system.miscValue = 30;
    } else if (this._wereVultureForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = Math.round(this._speedCalc(actorData)/2);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
        // Safe defensive access to skill items and their system properties
        const surv6 = actorData.items.find(i => i.name === 'Survival'); if (surv6?.system) surv6.system.miscValue = 30;
        const nav6 = actorData.items.find(i => i.name === 'Navigate'); if (nav6?.system) nav6.system.miscValue = 30;
        const obs6 = actorData.items.find(i => i.name === 'Observe'); if (obs6?.system) obs6.system.miscValue = 30;
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

    // Set Skill professions to regular professions (This is a fucking mess, but it's the way it's done for now...)
    for (let prof in actorSystemData.professions) {
      if (prof === 'profession1'||prof === 'profession2'||prof === 'profession3'||prof === 'commerce') {
        actorSystemData.professions[prof] === 0 ? actorSystemData.professions[prof] = actorSystemData.skills[prof].tn : actorSystemData.professions[prof] = 0
      }
    }

    // Apply aggregated item skill modifiers (one-pass)
    if (agg.skillModifiers && Object.keys(agg.skillModifiers).length > 0) {
      for (let [skillName, value] of Object.entries(agg.skillModifiers)) {
        // Guard: safe hasOwnProperty check for profession skill
        if (actorSystemData.professions && Object.prototype.hasOwnProperty.call(actorSystemData.professions, skillName)) {
          actorSystemData.professions[skillName] = Number(actorSystemData.professions[skillName] || 0) + Number(value);
          actorSystemData.professionsWound[skillName] = Number(actorSystemData.professionsWound[skillName] || 0) + Number(value);
        }
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
    // Guard: Use Math.round for safe numeric conversion instead of parseFloat(toFixed)
    actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
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
    // Guard: Use Number() to ensure numeric value after toFixed for safe carry rating calculations
    actorSystemData.carry_rating.current = Number((agg.totalEnc - agg.armorEnc - agg.excludedEnc).toFixed(1))

    //Form Shift Calcs
    if (this._wereWolfForm(actorData) === true) {
      actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
      actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
      actorSystemData.hp.max = actorSystemData.hp.max + 5;
      actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
      actorSystemData.speed.base = actorSystemData.speed.base + 9;
      actorSystemData.speed.value = this._speedCalc(actorData);
      actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
      actorSystemData.resistance.natToughness = 5;
      actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
      actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereBatForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = Math.round(this._speedCalc(actorData)/2);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 3;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereBoarForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.speed.base = actorSystemData.speed.base + 9;
        actorSystemData.speed.value = this._speedCalc(actorData);
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
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
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;
    } else if (this._wereCrocodileForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = Math.round(this._addHalfSpeed(actorData));
        actorSystemData.speed.swimSpeed = parseFloat(this._speedCalc(actorData)) + 9;
        actorSystemData.resistance.natToughness = 5;
        actorSystemData.wound_threshold.value = actorSystemData.wound_threshold.value + 5;
        actorSystemData.action_points.max = actorSystemData.action_points.max - 1;

    } else if (this._wereVultureForm(actorData) === true) {
        actorSystemData.resistance.silverR = actorSystemData.resistance.silverR - 5;
        actorSystemData.resistance.diseaseR = actorSystemData.resistance.diseaseR + 200;
        actorSystemData.hp.max = actorSystemData.hp.max + 5;
        actorSystemData.stamina.max = actorSystemData.stamina.max + 1;
        actorSystemData.speed.value = Math.round(this._speedCalc(actorData)/2);
        actorSystemData.speed.flySpeed = actorSystemData.speed.base + 9;
        actorSystemData.speed.swimSpeed = Math.round(actorSystemData.speed.value/2);
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
    // Prefer aggregated modifiers; _calculateItemSkillModifiers accepts an optional agg
    this._calculateItemSkillModifiers(actorData, agg)

    // PERF end
    // this._perfEnd('_prepareNPCData', t0);
  }

  async _calculateItemSkillModifiers(actorData, agg) {
    // If aggregator is provided, apply skillModifiers from it (fast, no item.filter)
    if (agg && agg.skillModifiers && Object.keys(agg.skillModifiers).length > 0) {
      for (let [name, value] of Object.entries(agg.skillModifiers)) {
        actorData.system.professions[name] = Number(actorData?.system?.professions?.[name] || 0) + Number(value);
        actorData.system.professionsWound[name] = Number(actorData?.system?.professionsWound?.[name] || 0) + Number(value);
      }
      return;
    }

    // Fallback: original behavior (safer)
    let modItems = (actorData.items || []).filter(i =>
      i && i?.system && Object.prototype.hasOwnProperty.call(i.system, 'skillArray')
      && Array.isArray(i.system.skillArray) && i.system.skillArray.length > 0
      && i.system.equipped
    )

    for (let item of modItems) {
      for (let entry of item?.system?.skillArray || []) {
        if (!entry?.name) continue;
        let moddedSkill = actorData?.system?.professions?.[entry.name] || 0;
        actorData.system.professions[entry.name] = Number(moddedSkill) + Number(entry?.value || 0);
        actorData.system.professionsWound[entry.name] = Number(moddedSkill) + Number(entry?.value || 0);
      }
    }
  }

  _filterToEquippedBonusItems(items, bonusProperty) {
    return (items || []).filter(i =>
  i?.system && Object.prototype.hasOwnProperty.call(i.system, bonusProperty) &&
  (Object.prototype.hasOwnProperty.call(i.system, 'equipped') ? i.system.equipped : true)
);
  }

  _strBonusCalc(actorData) {
    const strBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of strBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.strChaBonus || 0);
}
    return totalBonus
  }

  _endBonusCalc(actorData) {
    let endBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of endBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.endChaBonus || 0);
}
    return totalBonus
  }

  _agiBonusCalc(actorData) {
    let agiBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of agiBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.agiChaBonus || 0);
}
    return totalBonus
  }

  _intBonusCalc(actorData) {
    let intBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of intBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.intChaBonus || 0);
}
    return totalBonus
  }

  _wpBonusCalc(actorData) {
    let wpBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of wpBonusItems) {
      totalBonus = totalBonus + (Number(item?.system?.characteristicBonus?.wpChaBonus) || 0);
    }
    return totalBonus
  }

  _prcBonusCalc(actorData) {
    let prcBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prcBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.prcChaBonus || 0);
}
    return totalBonus
  }

  _prsBonusCalc(actorData) {
    let prsBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prsBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.prsChaBonus || 0);
}
    return totalBonus
  }

  _lckBonusCalc(actorData) {
    let lckBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of lckBonusItems) {
  totalBonus += Number(item?.system?.characteristicBonus?.lckChaBonus || 0);
}
    return totalBonus
  }

  _calculateENC(actorData) {
    let weighted = (actorData.items || []).filter(item => item?.system && Object.prototype.hasOwnProperty.call(item.system, "enc"));
    let totalWeight = 0.0;
    for (let item of weighted) {
      let containerAppliedENC = item.type == 'container' ? (item?.system?.container_enc?.applied_enc ? Number(item.system.container_enc.applied_enc) : 0) : 0
      let containedItemReduction = item.type != 'container' && item?.system?.containerStats?.contained ? (Number(item?.system?.enc || 0) * Number(item?.system?.quantity || 0)) : 0
      totalWeight = totalWeight + (Number(item?.system?.enc || 0) * Number(item?.system?.quantity || 0)) + containerAppliedENC - containedItemReduction;
    }
    return totalWeight
  }

  _armorWeight(actorData) {
    let worn = (actorData.items || []).filter(item => item?.system && item.system.equipped == true);
    let armorENC = 0.0;
    for (let item of worn) {
      armorENC = armorENC + ((Number(item?.system?.enc || 0) / 2) * Number(item?.system?.quantity || 0));
    }
    return armorENC
  }

  _excludeENC(actorData) {
    let excluded = (actorData.items || []).filter(item => item?.system && item.system.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      totalWeight = totalWeight + (Number(item?.system?.enc || 0) * Number(item?.system?.quantity || 0));
    }
    return totalWeight
  }

  _hpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'hpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.hpBonus || 0);
    }
    return bonus
  }

  _mpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'mpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.mpBonus || 0);
    }
    return bonus
  }

  _spBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'spBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.spBonus || 0);
    }
    return bonus
  }

  _lpBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'lpBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.lpBonus || 0);
    }
    return bonus
  }

  _wtBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'wtBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.wtBonus || 0);
    }
    return bonus
  }

  _speedBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'speedBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.speedBonus || 0);
    }
    return bonus
  }

  _iniBonus(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'iniBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.iniBonus || 0);
    }
    return bonus
  }

  _diseaseR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'diseaseR');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.diseaseR || 0);
    }
    return bonus
  }

  _fireR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'fireR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.fireR || 0);
      }
      return bonus
  }

  _frostR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'frostR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.frostR || 0);
      }
      return bonus
  }

  _shockR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'shockR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.shockR || 0);
      }
      return bonus
  }

  _poisonR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'poisonR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.poisonR || 0);
      }
      return bonus
  }

  _magicR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'magicR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.magicR || 0);
      }
      return bonus
  }

  _natToughnessR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'natToughnessR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.natToughnessR || 0);
      }
      return bonus
  }

  _silverR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'silverR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.silverR || 0);
      }
      return bonus
  }

  _sunlightR(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'sunlightR');
    let bonus = 0;
    for (let item of attribute) {
        bonus = bonus + Number(item?.system?.sunlightR || 0);
      }
      return bonus
  }

  _swimCalc(actorData) {
    let swimBonusItems = this._filterToEquippedBonusItems(actorData.items, 'swimBonus');
    let bonus = 0;
    for (let item of swimBonusItems) {
      bonus = bonus + Number(item?.system?.swimBonus || 0);
    }
    const shouldDoubleSwimSpeed = actorData.items?.some(i => i?.system?.doubleSwimSpeed);
    // Double the swim speed and any bonuses
    if (shouldDoubleSwimSpeed) {
      bonus *= 2;
      bonus += Number(actorData?.system?.speed?.swimSpeed || 0);
    }
    return bonus;
  }

  _flyCalc(actorData) {
    let attribute = this._filterToEquippedBonusItems(actorData.items, 'flyBonus');
    let bonus = 0;
    for (let item of attribute) {
      bonus = bonus + Number(item?.system?.flyBonus || 0);
    }
    return bonus
  }

  _speedCalc(actorData) {
    let attribute = (actorData.items || []).filter(item => item?.system?.halfSpeed === true);
    let speed = Number(actorData?.system?.speed?.base || 0);
    if (attribute.length === 0) {
      speed = speed;
    } else if (attribute.length >= 1) {
      speed = Math.ceil(speed/2);
    }
    return speed;
  }

  _iniCalc(actorData) {
    let attribute = (actorData.items || []).filter(item => item && (item.type == "trait"|| item.type == "talent"));
    let init = Number(actorData?.system?.initiative?.base || 0);
      for (let item of attribute) {
        if (item?.system?.replace?.ini && item.system.replace.ini.characteristic != "none") {
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
    let attribute = (actorData.items || []).filter(item => item && (item.type === "trait"|| item.type === "talent"));
    let wound = Number(actorData?.system?.wound_threshold?.base || 0);
      for (let item of attribute) {
        if (item?.system?.replace?.wt && item.system.replace.wt.characteristic != "none") {
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
    let attribute = (actorData.items || []).filter(item => item?.system?.halfFatiguePenalty == true);
    let penalty = 0;
    if (attribute.length >= 1) {
      penalty = Number(actorData?.system?.fatigue?.level || 0) * -5;
    } else {
      penalty = Number(actorData?.system?.fatigue?.level || 0) * -10;
    }
    return penalty
  }

  _halfWoundPenalty(actorData) {
    let attribute = (actorData.items || []).filter(item => item?.system?.halfWoundPenalty == true);
    let woundReduction = false;
    if (attribute.length >= 1) {
      woundReduction = true;
    } else {
      woundReduction = false;
    }
    return woundReduction
  }

  _determineIbMp(actorData) {
    let addIbItems = (actorData.items || []).filter(item => item?.system?.addIBToMP == true);

    if (addIbItems.length >= 1) {
      const actorIntBonus = Number(actorData?.system?.characteristics?.int?.bonus || 0);
      return addIbItems.reduce(
        (acc, item) => actorIntBonus * Number(item?.system?.addIntToMPMultiplier || 0) + acc,
        0
      );
    }
    return 0;
  }

  _untrainedException(actorData) {
    let attribute = (actorData.items || []).filter(item => item?.system?.untrainedException == true);
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
    let attribute = (actorData.items || []).filter(item => item?.system?.mechanical == true);
    let isMechanical = false;
    if (attribute.length >= 1) {
      isMechanical = true;
    } else {
      isMechanical = false;
    }
    return isMechanical
  }

  _dwemerSphere(actorData) {
    let attribute = (actorData.items || []).filter(item => item?.system?.shiftForm == true);
    let shift = false;
    if (attribute.length >= 1) {
      for (let item of attribute) {
        if (item?.system?.dailyUse == true) {
          shift = true;
        }
      }
    } else {
      shift = false;
    }
    return shift
  }

  _vampireLordForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormVampireLord");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereWolfForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereWolf"||item?.system?.shiftFormStyle === "shiftFormWereLion");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBatForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereBat");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBoarForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereBoar");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereBearForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereBear");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereCrocodileForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereCrocodile");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _wereVultureForm(actorData) {
    let form = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereVulture");
    let shift = false;
    if(form.length > 0) {
      shift = true;
    }
    return shift
  }

  _painIntolerant(actorData) {
    let attribute = (actorData.items || []).filter(item => item?.system?.painIntolerant == true);
    let pain = false;
    if (attribute.length >= 1) {
      pain = true;
    }
    return pain
  }

  _addHalfSpeed(actorData) {
    let halfSpeedItems = (actorData.items || []).filter(item => item?.system?.addHalfSpeed === true);
    let isWereCroc = (actorData.items || []).filter(item => item?.system?.shiftFormStyle === "shiftFormWereCrocodile");
    let speed = Number(actorData?.system?.speed?.value || 0);
    if (isWereCroc.length > 0 && halfSpeedItems.length > 0) {
      speed = Number(actorData?.system?.speed?.base || 0);
    } else if (isWereCroc.length == 0 && halfSpeedItems.length > 0) {
      speed = Math.ceil(Number(actorData?.system?.speed?.value || 0)/2) + Number(actorData?.system?.speed?.base || 0);
    } else if (isWereCroc.length > 0 && halfSpeedItems.length == 0) {
      speed = Math.ceil(Number(actorData?.system?.speed?.base || 0)/2);
    } else {
      speed = Number(actorData?.system?.speed?.value || 0);
    }
    return speed
  }

}
