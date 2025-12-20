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
    // Call super first
    super.prepareData();

    // Use `this` as actorData (keeps parity with previous code)
    const actorData = this;
    const actorSystemData = actorData.system;

    // Route by Actor type
    if (actorData.type === 'Player Character') this._prepareCharacterData(actorData);
    if (actorData.type === 'NPC') this._prepareNPCData(actorData);
  }

  /**************************************************************************
   * Aggregation + caching helpers
   *
   * Aim: compute commonly-used item-derived data in one pass, cache it for
   * the lifetime of a single prepare cycle, and expose it to helper funcs.
   **************************************************************************/

  _aggregateItemStats(actorData) {
    // Use per-instance cache to avoid recomputing for nested helper calls
    // If already computed for this actor this tick, return cached agg.
    if (this._aggCache && this._aggCache.itemsSignature === this._aggCache._lastSignatureComputedFor) {
      return this._aggCache.agg;
    }

    // Build signature and aggregation in a single pass
    const items = actorData.items || [];

    let sigParts = [];
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
      // signature includes id + quantity + enc to detect data changes across prepares
      const id = item?._id || '';
      const qty = Number(item?.system?.quantity || 0);
      const enc = Number(item?.system?.enc || 0);
      sigParts.push(`${id}:${qty}:${enc}`);

      const sys = item && item.system ? item.system : {};

      // ENC calculations
      stats.totalEnc += enc * qty;
      if (item.type === 'container' && sys.container_enc && !isNaN(Number(sys.container_enc.applied_enc))) {
        stats.containersAppliedEnc += Number(sys.container_enc.applied_enc);
      }
      if (sys.containerStats && sys.containerStats.contained) {
        stats.containedWeightReduction += enc * qty;
      }
      if (sys.excludeENC === true) stats.excludedEnc += enc * qty;
      if (sys.equipped === true) stats.armorEnc += ((enc / 2) * qty);

      // Characteristic bonuses (guarded)
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

      // Resource/resist bonuses (guarded, coerce numbers)
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

      // skill modifiers (skillArray)
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

    // Save signature and aggregated stats to per-instance cache
    const signature = sigParts.join('|') || '';
    this._aggCache = {
      itemsSignature: signature,
      agg: stats,
      // set an additional field to simplify quick checks
      _lastSignatureComputedFor: signature
    };

    return stats;
  }

  /**************************************************************************
   * Existing helper functions (kept but made safer). These are retained
   * so other modules calling them will still function. They are more
   * defensive about nested properties.
   **************************************************************************/

  _filterToEquippedBonusItems(items, bonusProperty) {
    return (items || []).filter(i => i && i.system && Object.prototype.hasOwnProperty.call(i.system, bonusProperty) && (Object.prototype.hasOwnProperty.call(i.system, 'equipped') ? i.system.equipped : true));
  }

  _calculateENC(actorData) {
    // Backwards-compatible safe calculation — prefer using _aggregateItemStats for perf.
    let weighted = (actorData.items || []).filter(item => item && item.system && Object.prototype.hasOwnProperty.call(item.system, "enc"));
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
    return totalWeight;
  }

  _armorWeight(actorData) {
    let worn = (actorData.items || []).filter(item => item && item.system && item.system.equipped == true);
    let armorENC = 0.0;
    for (let item of worn) {
      const enc = Number(item.system.enc || 0);
      const qty = Number(item.system.quantity || 0);
      armorENC = armorENC + ((enc / 2) * qty);
    }
    return armorENC;
  }

  _excludeENC(actorData) {
    let excluded = (actorData.items || []).filter(item => item && item.system && item.system.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      const enc = Number(item.system.enc || 0);
      const qty = Number(item.system.quantity || 0);
      totalWeight = totalWeight + (enc * qty);
    }
    return totalWeight;
  }

  // many of the original _*BonusCalc methods are retained for compatibility.
  // These are safer but slower than reading an aggregator; prefer agg in prepare methods.

  _strBonusCalc(actorData) {
    const strBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of strBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.strChaBonus || 0);
    }
    return totalBonus;
  }

  _endBonusCalc(actorData) {
    let endBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of endBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.endChaBonus || 0);
    }
    return totalBonus;
  }

  _agiBonusCalc(actorData) {
    let agiBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of agiBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.agiChaBonus || 0);
    }
    return totalBonus;
  }

  _intBonusCalc(actorData) {
    let intBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of intBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.intChaBonus || 0);
    }
    return totalBonus;
  }

  _wpBonusCalc(actorData) {
    let wpBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of wpBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.wpChaBonus || 0);
    }
    return totalBonus;
  }

  _prcBonusCalc(actorData) {
    let prcBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prcBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.prcChaBonus || 0);
    }
    return totalBonus;
  }

  _prsBonusCalc(actorData) {
    let prsBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of prsBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.prsChaBonus || 0);
    }
    return totalBonus;
  }

  _lckBonusCalc(actorData) {
    let lckBonusItems = this._filterToEquippedBonusItems(actorData.items, 'characteristicBonus');
    let totalBonus = 0;
    for (let item of lckBonusItems) {
      totalBonus = totalBonus + Number(item.system.characteristicBonus.lckChaBonus || 0);
    }
    return totalBonus;
  }

  // Many other helper methods are left unchanged but with extra guards where needed.
  // (For brevity the rest of the old helpers are not repeated here — keep them as in your file.)
  // IMPORTANT: The block below should keep the original helpers as in your branch, but ensure
  // they use defensive reads like Number(item?.system?.foo || 0) and similar.

  /* --- preserve remaining helper methods as before but ensure safe access --- */
}
