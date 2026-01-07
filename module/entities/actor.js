/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */


import { isTransferEffectActive } from "../ae/transfer.js";

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

    // Ensure required data structures exist so downstream derived-data logic is resilient,
    // even when actors are partially migrated or have inconsistent embedded item data.
    this._ensureSystemData();
    
    // Apply legacy characteristic bonuses from talents/traits/powers
    this._applyLegacyCharacteristicBonuses();

    try {
      if (this.type === "Player Character" && typeof this._prepareCharacterData === "function") {
        this._prepareCharacterData(this);
      } else if (this.type === "NPC" && typeof this._prepareNPCData === "function") {
        this._prepareNPCData(this);
      }
    } catch (err) {
      console.error(`uesrpg-3ev4 | Error during prepareData for ${this.name || this.id}:`, err);
      // Re-ensure minimum safe defaults after a failure to prevent cascading errors in rendering.
      this._ensureSystemData();
    }
  }

  /**
   * Ensure required system data objects exist with safe defaults.
   *
   * IMPORTANT:
   *  - This only initializes missing objects/fields; it should not perform computations.
   *  - It must not replace embedded collections (e.g. this.items, this.effects).
   *  - This is derived-data scaffolding only; schema changes must occur in migrations.
   */
  _ensureSystemData() {
    const system = (this.system ??= {});

    // Characteristics
    system.characteristics ??= {};
    const chars = ["str", "end", "agi", "int", "wp", "prc", "prs", "lck"];
    for (const c of chars) {
      system.characteristics[c] ??= { base: 0, total: 0, bonus: 0 };
    }

    // Core resources
    system.hp ??= { value: 0, max: 0, base: 0, bonus: 0 };
    system.stamina ??= { value: 0, max: 0, bonus: 0 };
    system.magicka ??= { value: 0, max: 0, bonus: 0 };
    system.luck_points ??= { value: 0, max: 0, bonus: 0 };

    // Modifier lanes (Active Effects)
    system.modifiers ??= {};
    system.modifiers.characteristics ??= {};
    system.modifiers.skills ??= {};
    system.modifiers.hp ??= { base: 0, bonus: 0, max: 0, value: 0 };
    system.modifiers.magicka ??= { base: 0, bonus: 0, max: 0, value: 0 };
    system.modifiers.stamina ??= { base: 0, bonus: 0, max: 0, value: 0 };
    system.modifiers.luck_points ??= { base: 0, bonus: 0, max: 0, value: 0 };

    // Derived stats containers
    system.initiative ??= { base: 0, value: 0, bonus: 0 };
    system.wound_threshold ??= { base: 0, value: 0, bonus: 0 };
    system.speed ??= { base: 0, value: 0, bonus: 0, swimSpeed: 0, flySpeed: 0 };
    system.carry_rating ??= { current: 0, max: 0, penalty: 0, bonus: 0, label: "Minimal" };

    // Armor mobility penalties (derived) - neutral defaults
    system.mobility ??= {
      armorWeightClass: "none",
      agilityTestPenalty: 0,
      agilityPenaltyExemptSkills: ["combatstyle", "combat_style", "combat style"],
      speedPenalty: 0,
      sources: []
    };

    // Combat state containers
    system.fatigue ??= { level: 0, penalty: 0, bonus: 0 };
    system.woundPenalty ??= 0;
    system.wounded ??= false;

    // Luck numbers (PCs may use lucky/unlucky numbers; NPCs use fixed critical bands)
    system.lucky_numbers ??= {
      ln1: 0, ln2: 0, ln3: 0, ln4: 0, ln5: 0, ln6: 0, ln7: 0, ln8: 0, ln9: 0, ln10: 0
    };
    system.unlucky_numbers ??= { ul1: 0, ul2: 0, ul3: 0, ul4: 0, ul5: 0, ul6: 0 };

    // Resistances
    system.resistance ??= {
      diseaseR: 0,
      fireR: 0,
      frostR: 0,
      shockR: 0,
      poisonR: 0,
      magicR: 0,
      natToughness: 0,
      silverR: 0,
      sunlightR: 0
    };

    // Professions / Skills containers
    system.professions ??= {};
    system.professionsWound ??= {};
    system.skills ??= {};
    
    // Combat tracking
    system.combat_tracking ??= {
      attacks_this_round: 0,
      attacks_this_turn: 0,
      last_reset_round: 0,
      last_reset_turn: 0
    };
  }

  /**
   * Apply legacy characteristic bonuses from talents/traits/powers.
   * This ensures items with characteristicBonus fields apply their effects.
   */
  _applyLegacyCharacteristicBonuses() {
    const relevantItems = this.items.filter(i => 
      i.type === "talent" || i.type === "trait" || i.type === "power"
    );
    
    const bonuses = {
      str: 0, end: 0, agi: 0, int: 0,
      wp: 0, prc: 0, prs: 0, lck: 0
    };
    
    for (const item of relevantItems) {
      const charBonuses = item.system?.characteristicBonus ?? {};
      
      bonuses.str += Number(charBonuses.strChaBonus ?? 0) || 0;
      bonuses.end += Number(charBonuses.endChaBonus ?? 0) || 0;
      bonuses.agi += Number(charBonuses.agiChaBonus ?? 0) || 0;
      bonuses.int += Number(charBonuses.intChaBonus ?? 0) || 0;
      bonuses.wp += Number(charBonuses.wpChaBonus ?? 0) || 0;
      bonuses.prc += Number(charBonuses.prcChaBonus ?? 0) || 0;
      bonuses.prs += Number(charBonuses.prsChaBonus ?? 0) || 0;
      bonuses.lck += Number(charBonuses.lckChaBonus ?? 0) || 0;
    }
    
    // Apply to characteristic totals (additive to base)
    const chars = this.system.characteristics;
    if (chars) {
      for (const [key, bonus] of Object.entries(bonuses)) {
        if (chars[key]) {
          chars[key].bonus = (chars[key].bonus ?? 0) + bonus;
        }
      }
    }
  }

  /**
   * Get the total value of a characteristic by name.
   * @param {object} actorData - Actor data object
   * @param {string} name - Characteristic key (str, end, agi, int, wp, prc, prs, lck)
   * @returns {number} The total value, or 0 if not found
   */
  _getCharacteristicTotal(actorData, name) {
    return Number(actorData?.system?.characteristics?.[name]?.total ?? 0);
  }

  /**
   * Aggregate item stats in a single pass to avoid repeated item.filter() work.
   * The result is cached on the actor instance for the duration of a prepare cycle.
   */
  _aggregateItemStats(actorData) {
    // Build a signature of items to detect changes
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);
    let sigParts = [];
    for (let it of items) {
            const sys = it?.system ?? {};
      const isShield = (it?.type === 'armor') && Boolean(sys?.isShieldEffective ?? sys?.isShield);
      sigParts.push(`${it?._id||''}:${Number(sys?.quantity||0)}:${Number(sys?.enc||0)}:${sys?.equipped?1:0}:${sys?.excludeENC?1:0}:${sys?.containerStats?.contained?1:0}:${isShield?1:0}`);
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
      totalEnc:0, armorEnc:0, excludedEnc:0,
      skillModifiers: {},
      traitsAndTalents: [],
      shiftForms: [],
      itemCount: items.length
    };

    for (let item of items) {
      const sys = item && item.system ? item.system : {};
      const enc = Number(sys.enc || 0);
      const qty = Number(sys.quantity || 0);
      const itemWeight = enc * qty;
      const id = item?._id || '';
      
      // Check equipped status: if 'equipped' property exists, use its value; otherwise default to true
      const isEquipped = Object.prototype.hasOwnProperty.call(sys, 'equipped') ? sys.equipped : true;

      // RAW Chapter 7: Check if this is armor (for special ENC handling)
      const isShield = (item?.type === 'armor') && Boolean(sys?.isShieldEffective ?? sys?.isShield);
      const isEquippedArmor = (item?.type === 'armor' && isEquipped && !isShield);

      // Is this item contained in a container?
      // Note: Equipped armor cannot be contained (it's being worn)
      const isContained = (sys?.containerStats?.contained === true) && !isEquippedArmor;

      // RAW: Items contribute their weight; containers halve contents
      let contributedWeight = 0;
      if (isContained) {
        // Item is inside a container: contributes half its weight
        contributedWeight = itemWeight / 2;
      } else {
        // Item is loose in inventory: contributes full weight
        contributedWeight = itemWeight;
      }
      
      stats.totalEnc += contributedWeight;

      // Special exclusions - track the actual contributed weight
      if (sys.excludeENC === true) {
        stats.excludedEnc += contributedWeight;
      }

      // RAW Chapter 7: "ENC is halved when armor is worn (but not for carried shields)"
      if (isEquippedArmor) {
        // Store the full weight; we'll halve it when calculating carry_rating.current
        stats.armorEnc += itemWeight;
      }

      // Characteristic bonuses (only if equipped)
      if (isEquipped && sys.characteristicBonus) {
        stats.charBonus.str += Number(sys.characteristicBonus.strChaBonus || 0);
        stats.charBonus.end += Number(sys.characteristicBonus.endChaBonus || 0);
        stats.charBonus.agi += Number(sys.characteristicBonus.agiChaBonus || 0);
        stats.charBonus.int += Number(sys.characteristicBonus.intChaBonus || 0);
        stats.charBonus.wp += Number(sys.characteristicBonus.wpChaBonus || 0);
        stats.charBonus.prc += Number(sys.characteristicBonus.prcChaBonus || 0);
        stats.charBonus.prs += Number(sys.characteristicBonus.prsChaBonus || 0);
        stats.charBonus.lck += Number(sys.characteristicBonus.lckChaBonus || 0);
      }

      // Resource/resist bonuses (only if equipped)
      if (isEquipped) {
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
      }

      if (item.type === 'trait' || item.type === 'talent') stats.traitsAndTalents.push(item);
      if (sys.shiftFormStyle) stats.shiftForms.push(sys.shiftFormStyle);
    }

    this._aggCache = { signature, agg: stats };
    return stats;
  }

  /**
   * Determine the heaviest *effective* armor weight class currently worn.
   *
   * Rules contract:
   * - Automation uses effective values.
   * - Armor quality modifies effective weight class (Inferior => +1 step, Superior => -1 step).
   * - Shields are armor-type items but do NOT participate in worn-armor mobility penalties.
   *
   * This returns an object describing the result and derived penalties.
   * We intentionally avoid guessing penalties for classes other than Heavy,
   * because only Heavy is currently specified in the provided RAW excerpt.
   */
  _getArmorMobilityPenalties(actorData) {
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);

    const order = ["none", "light", "medium", "heavy", "superheavy", "crippling"]; // must match constants
    const clampIndex = (i) => Math.max(0, Math.min(order.length - 1, i));

    // Normalize generic free-text fields
    const norm = (v) => String(v ?? "").trim().toLowerCase();

    // Normalize armor weight class values.
    // We must be resilient to historic / UI-facing variants such as:
    // - "Super Heavy"
    // - "super_heavy"
    // - "super-heavy"
    // While still matching our canonical keys used throughout the system.
    const normWeightClass = (v) => norm(v).replace(/[\s_-]+/g, "");

    let maxIdx = 0; // none
    let sources = [];

    for (const it of items) {
      if (!it || it.type !== "armor") continue;
      const sys = it.system ?? {};
      const isEquipped = Object.prototype.hasOwnProperty.call(sys, "equipped") ? !!sys.equipped : true;
      if (!isEquipped) continue;

      const isShield = Boolean(sys?.isShieldEffective ?? sys?.isShield);
      if (isShield) continue;

      // Weight class can exist in a few places depending on item version and sheet usage.
      // Canonical persisted field: system.weightClass (values like "light", "superheavy").
      // Some legacy data or user-edited items may contain "super_heavy" or "Super Heavy".
      // Some sheets compute an unpersisted derived field: system.effectiveWeightClass.
      // As a last resort, if the item has no usable class, we *do not* guess here; we
      // handle actor-level fallback after iterating items.
      const baseWC = normWeightClass(
        sys.weightClass ??
        sys.effectiveWeightClass ??
        sys.armorWeightClass ??
        sys.armor_class ??
        sys.armorClass
      ) || "none";
      const q = norm(sys.qualityLevel) || "common";
      let idx = order.indexOf(baseWC);
      if (idx < 0) idx = 0;

      // Quality adjustment: Inferior => heavier; Superior => lighter
      if (q === "inferior") idx = clampIndex(idx + 1);
      else if (q === "superior") idx = clampIndex(idx - 1);

      if (idx > maxIdx) {
        maxIdx = idx;
        sources = [it];
      } else if (idx === maxIdx && idx > 0) {
        sources.push(it);
      }
    }

    // Actor-level fallback: some worlds historically tracked armor class on the actor (Status AC dropdown)
    // rather than on each armor item. If no equipped armor item provided a usable weight class,
    // fall back to actor.system.armor_class.
    if (maxIdx === 0) {
      const actorWC = normWeightClass(actorData?.system?.armor_class);
      const actorIdx = order.indexOf(actorWC);
      if (actorIdx > 0) maxIdx = actorIdx;
    }

    const effectiveWeightClass = order[maxIdx] ?? "none";

    // Mobility penalties by effective armor weight class (RAW).
    // Data contract consumed by skill TN logic:
    // - armorWeightClass: string
    // - agilityTestPenalty: number (applies to Agility-based skill tests, except Combat Style)
    // - skillTestPenalties: { [lowerSkillName]: number } (skill-specific penalties, e.g. Acrobatics in Light)
    // - allTestPenalty: number (applies to all tests; used for Crippling)
    // - speedPenalty: number (applied elsewhere for movement)
    const penalties = {
      armorWeightClass: effectiveWeightClass,
      agilityTestPenalty: 0,
      agilityPenaltyExemptSkills: ["combatstyle", "combat_style", "combat style"],
      skillTestPenalties: {},
      allTestPenalty: 0,
      speedPenalty: 0,
      sources: sources.map(s => ({ id: s._id, name: s.name }))
    };

    // RAW table (Chapter 1, Weight Classes):
    // - Light: -10 Acrobatics
    // - Medium: -10 Agility-based (except Combat Style), Speed -1
    // - Heavy: -20 Agility-based (except Combat Style), Speed -2
    // - Super-Heavy: -30 Agility-based (except Combat Style), Speed -3
    // - Crippling: -40 all tests, cannot move (speed handling elsewhere)
    switch (effectiveWeightClass) {
      case "light":
        penalties.skillTestPenalties["acrobatics"] = -10;
        break;
      case "medium":
        penalties.agilityTestPenalty = -10;
        penalties.speedPenalty = -1;
        break;
      case "heavy":
        penalties.agilityTestPenalty = -20;
        penalties.speedPenalty = -2;
        break;
      case "superheavy":
        penalties.agilityTestPenalty = -30;
        penalties.speedPenalty = -3;
        break;
      case "crippling":
        penalties.allTestPenalty = -40;
        // Speed/movement restriction is handled in the actor's speed calculation pipeline.
        break;
      default:
        break;
    }

    return penalties;
  }


  _flyCalc(actorData) {
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);
    const equipped = items.filter(i =>
      i?.system && Object.prototype.hasOwnProperty.call(i.system, 'flyBonus') &&
      (Object.prototype.hasOwnProperty.call(i.system, 'equipped') ? i.system.equipped : true)
    );
    let bonus = 0;
    for (let item of equipped) {
      bonus = bonus + Number(item?.system?.flyBonus || 0);
    }
    return bonus
  }



  /**
   * Collect numeric Active Effect modifiers for a set of target keys.
   *
   * Deterministic resolution rules:
   *  - We consider Actor embedded effects and active transfer Item effects.
   *  - ADD values are summed.
   *  - If any OVERRIDE exists for a key, it wins and ADDs for that key are ignored.
   *  - Other modes are ignored.
   *
   * This is used for derived-stat pipelines where the system recomputes values each prepare cycle.
   *
   * @param {Array<string>} targetKeys
   * @returns {Record<string, { add: number, override: number|null }>} map by key
   */
  _collectAEModifiersForKeys(targetKeys = []) {
    const keys = Array.isArray(targetKeys) ? targetKeys.filter(Boolean) : [];
    const out = {};
    for (const k of keys) out[k] = { add: 0, override: null };
    if (!keys.length) return out;
  
    const asNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
  
    const ADD = CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
    const OVERRIDE = CONST?.ACTIVE_EFFECT_MODES?.OVERRIDE ?? 5;
  
    /** @type {{effect: any, priority: number, sortId: string}[]} */
    const sources = [];
  
    // Actor embedded effects
    for (const ef of (this?.effects ?? [])) {
      sources.push({
        effect: ef,
        priority: Number(ef?.priority ?? 0),
        sortId: String(ef?.id ?? ef?._id ?? '')
      });
    }
  
    // Transfer item effects (type/equipped gating handled by isTransferEffectActive)
    for (const item of (this?.items ?? [])) {
      for (const ef of (item?.effects ?? [])) {
        if (!isTransferEffectActive(this, item, ef)) continue;
        sources.push({
          effect: ef,
          priority: Number(ef?.priority ?? 0),
          sortId: String(ef?.id ?? ef?._id ?? '')
        });
      }
    }
  
    // Deterministic ordering: ascending priority, then ascending id.
    sources.sort((a, b) => (a.priority - b.priority) || a.sortId.localeCompare(b.sortId));
  
    for (const { effect } of sources) {
      if (!effect || effect.disabled) continue;
      const changes = Array.isArray(effect.changes) ? effect.changes : [];
      for (const ch of changes) {
        if (!ch) continue;
        const key = ch.key;
        if (!out[key]) continue;
        const mode = ch.mode;
        const value = asNum(ch.value);
        if (!value && mode !== OVERRIDE) continue;
  
        if (mode === OVERRIDE) {
          out[key].override = value;
          out[key].add = 0;
        } else if (mode === ADD) {
          // Ignore ADDs if an OVERRIDE exists (final-wins semantics for the pipeline).
          if (out[key].override == null) out[key].add += value;
        }
      }
    }
  
    return out;
  }
  
  
  
  /**
   * Collect deterministic AE modifiers where multiple keys should be treated as a single semantic lane.
   * This is used for aliasing (e.g., fatigue vs exhaustion) while preserving deterministic OVERRIDE behavior.
   *
   * Deterministic resolution rules:
   *  - We consider Actor embedded effects and active transfer Item effects.
   *  - ADD values across the key-set are summed.
   *  - If any OVERRIDE exists across the key-set, the last encountered OVERRIDE (highest priority, stable ordering)
   *    wins and ADDs are ignored.
   *
   * @param {string[]} keySet
   * @returns {{ add: number, override: number|null }}
   */
  _collectAEModifiersForKeySetMerged(keySet = []) {
    const keys = Array.isArray(keySet) ? keySet.filter(Boolean) : [];
    if (!keys.length) return { add: 0, override: null };
  
    const keyLookup = new Set(keys);
  
    const asNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
  
    const ADD = CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
    const OVERRIDE = CONST?.ACTIVE_EFFECT_MODES?.OVERRIDE ?? 5;
  
    /** @type {{effect: any, priority: number, sortId: string}[]} */
    const sources = [];
  
    for (const ef of (this?.effects ?? [])) {
      sources.push({
        effect: ef,
        priority: Number(ef?.priority ?? 0),
        sortId: String(ef?.id ?? ef?._id ?? '')
      });
    }
  
    for (const item of (this?.items ?? [])) {
      for (const ef of (item?.effects ?? [])) {
        if (!isTransferEffectActive(this, item, ef)) continue;
        sources.push({
          effect: ef,
          priority: Number(ef?.priority ?? 0),
          sortId: String(ef?.id ?? ef?._id ?? '')
        });
      }
    }
  
    sources.sort((a, b) => (a.priority - b.priority) || a.sortId.localeCompare(b.sortId));
  
    const out = { add: 0, override: null };
  
    for (const { effect } of sources) {
      if (!effect || effect.disabled) continue;
      const changes = Array.isArray(effect.changes) ? effect.changes : [];
      for (const ch of changes) {
        if (!ch) continue;
        const key = ch.key;
        if (!keyLookup.has(key)) continue;
        const mode = ch.mode;
        const value = asNum(ch.value);
        if (!value && mode !== OVERRIDE) continue;
  
        if (mode === OVERRIDE) {
          out.override = value;
          out.add = 0;
        } else if (mode === ADD) {
          if (out.override == null) out.add += value;
        }
      }
    }
  
    return out;
  }
  
  /**
   * Read deterministic AE modifiers for a resource modifier namespace.
   * Supported keys:
   *  - system.modifiers.<resource>.base
   *  - system.modifiers.<resource>.bonus
   *  - system.modifiers.<resource>.max
   *  - system.modifiers.<resource>.value
   *
   * @param {string} resourceKey
   * @returns {{ base: {add:number, override:number|null}, bonus:{add:number, override:number|null}, max:{add:number, override:number|null}, value:{add:number, override:number|null} }}
   */
  _getResourceAEModifiers(resourceKey) {
    const rk = String(resourceKey ?? '').trim();
    const keys = [
      `system.modifiers.${rk}.base`,
      `system.modifiers.${rk}.bonus`,
      `system.modifiers.${rk}.max`,
      `system.modifiers.${rk}.value`
    ];
    const map = this._collectAEModifiersForKeys(keys);
    return {
      base: map[keys[0]] ?? { add: 0, override: null },
      bonus: map[keys[1]] ?? { add: 0, override: null },
      max: map[keys[2]] ?? { add: 0, override: null },
      value: map[keys[3]] ?? { add: 0, override: null }
    };
  }
  
  
  /**
   * Read deterministic AE modifiers for Carry/Encumbrance.
   *
   * Supported keys:
   *  - system.modifiers.carry.base (ADD / OVERRIDE)   : adds to the base carry formula (4*STR + 2*END).
   *  - system.modifiers.carry.bonus (ADD / OVERRIDE)  : adds to system.carry_rating.bonus.
   *  - system.modifiers.carry.override (ADD / OVERRIDE): adds to final max; OVERRIDE hard-sets system.carry_rating.max.
   *  - system.modifiers.encumbrance.penalty (ADD / OVERRIDE): applied after burden bracket computation.
   *
   * Notes:
   *  - We do not rename or repurpose existing schema fields (carry_rating.max/current/bonus/penalty).
   *  - OVERRIDE wins over ADD per key.
   *
   * @returns {{ base:{add:number, override:number|null}, bonus:{add:number, override:number|null}, override:{add:number, override:number|null}, encPenalty:{add:number, override:number|null} }}
   */
  _getCarryAEModifiers() {
    const keys = {
      carryBase: "system.modifiers.carry.base",
      carryBonus: "system.modifiers.carry.bonus",
      carryOverride: "system.modifiers.carry.override",
  
      // Encumbrance lanes (RAW): test penalty, speed penalty, stamina penalty.
      // Keep legacy key "system.modifiers.encumbrance.penalty" as an alias for testPenalty.
      encPenaltyLegacy: "system.modifiers.encumbrance.penalty",
      encTestPenalty: "system.modifiers.encumbrance.testPenalty",
      encSpeedPenalty: "system.modifiers.encumbrance.speedPenalty",
      encStaminaPenalty: "system.modifiers.encumbrance.staminaPenalty"
    };
  
    const map = this._collectAEModifiersForKeys(Object.values(keys));
  
    // Prefer the explicit RAW-aligned key if present; otherwise fall back to the legacy alias.
    const testPenalty = map[keys.encTestPenalty] ?? map[keys.encPenaltyLegacy] ?? { add: 0, override: null };
  
    return {
      base: map[keys.carryBase] ?? { add: 0, override: null },
      bonus: map[keys.carryBonus] ?? { add: 0, override: null },
      override: map[keys.carryOverride] ?? { add: 0, override: null },
  
      // Keep old property name working, but also expose the clearer name.
      encPenalty: testPenalty,
      encTestPenalty: testPenalty,
      encSpeedPenalty: map[keys.encSpeedPenalty] ?? { add: 0, override: null },
      encStaminaPenalty: map[keys.encStaminaPenalty] ?? { add: 0, override: null }
    };
  }
  
  
  
  /**
   * Read deterministic AE modifiers for Fatigue / Exhaustion.
   *
   * Supported keys:
   *  - system.modifiers.fatigue.bonus (ADD / OVERRIDE)
   *  - system.modifiers.fatigue.penalty (ADD / OVERRIDE)
   *
   * Aliases supported (treated as the same semantic lanes):
   *  - system.modifiers.exhaustion.bonus
   *  - system.modifiers.exhaustion.penalty
   *
   * Notes:
   *  - We do not mutate document data here; we only affect derived values.
   *  - OVERRIDE across a lane wins over ADD across that lane.
   *
   * @returns {{ bonus:{add:number, override:number|null}, penalty:{add:number, override:number|null} }}
   */
  _getFatigueAEModifiers() {
    const bonusLane = this._collectAEModifiersForKeySetMerged([
      "system.modifiers.fatigue.bonus",
      "system.modifiers.exhaustion.bonus"
    ]);
    const penaltyLane = this._collectAEModifiersForKeySetMerged([
      "system.modifiers.fatigue.penalty",
      "system.modifiers.exhaustion.penalty"
    ]);
    return { bonus: bonusLane, penalty: penaltyLane };
  }
  
  
  
  
  
  
    /**
     * Chapter 5: magical healing / first aid can temporarily remove passive wound penalties
     * while the actor remains wounded.
     *
     * Implemented as AE-backed suppression markers.
     */
  
    _hasWoundPenaltySuppression(actorData) {
      const scope = game.system?.id ?? "uesrpg-3ev4";
      const effectsRaw = actorData?.effects;
      const effects = Array.isArray(effectsRaw) ? effectsRaw : (effectsRaw ? Array.from(effectsRaw) : []);
  
      return effects.some(e => {
        const flags = e?.flags?.[scope] ?? e?.flags?.["uesrpg-3ev4"] ?? null;
        const wounds = flags?.wounds ?? null;
        if (!wounds || typeof wounds !== "object") return false;
  
        // Explicit suppression marker
        if (wounds.suppressWoundPenalty === true) return true;
  
        const kind = String(wounds.kind ?? "");
        if (kind === "forestall") {
          const r = Number(wounds.remainingRounds ?? 0);
          return Number.isFinite(r) && r > 0;
        }
        if (kind === "firstAid") return true;
  
  
  
        return false;
      });
    }
  /**
   * Apply deterministic Active Effect modifiers to Wound Threshold after all other system adjustments.
   *
   * Supported keys:
   *  - system.modifiers.wound_threshold.bonus (ADD / OVERRIDE) -> adjusts system.wound_threshold.bonus
   *  - system.modifiers.wound_threshold.value (ADD / OVERRIDE) -> adjusts final system.wound_threshold.value
   *
   * Notes:
   *  - Wound Threshold is a derived stat. We never rely on Foundry applying changes directly to derived fields.
   *  - OVERRIDE wins over ADD for each key.
   *
   * @param {any} actorSystemData
   */
  _applyWoundThresholdAEs(actorSystemData) {
    if (!actorSystemData) return;
  
    const keys = [
      "system.modifiers.wound_threshold.bonus",
      "system.modifiers.wound_threshold.value"
    ];
  
    const map = this._collectAEModifiersForKeys(keys);
  
    // Bonus lane
    {
      const m = map[keys[0]] ?? { add: 0, override: null };
      if (m.override != null) actorSystemData.wound_threshold.bonus = Number(m.override);
      else if (m.add) actorSystemData.wound_threshold.bonus = Number(actorSystemData.wound_threshold.bonus ?? 0) + Number(m.add);
    }
  
    // Value lane (final)
    {
      const m = map[keys[1]] ?? { add: 0, override: null };
      if (m.override != null) actorSystemData.wound_threshold.value = Number(m.override);
      else if (m.add) actorSystemData.wound_threshold.value = Number(actorSystemData.wound_threshold.value ?? 0) + Number(m.add);
    }
  
    // Safety: wound threshold cannot be negative
    actorSystemData.wound_threshold.value = Math.max(0, Number(actorSystemData.wound_threshold.value ?? 0));
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

    // --- Mobility penalties from effective armor weight class (Step 9 scaffold) ---
    // Compute once per prepare, store for later automation consumption.
    // Note: We apply only speed penalties directly here; the Agility test penalty is
    // stored on actor.system.mobility for skill-roll logic to consume later.
    const mobility = this._getArmorMobilityPenalties(actorData);
    actorSystemData.mobility = mobility;

    // Normalize legacy armor_class field (used later in this file) to reflect *effective* class.
    // This maintains backward compatibility with existing speed adjustment code paths.
    // Mapping: superheavy -> super_heavy
    const wc = String(mobility?.armorWeightClass ?? "none").toLowerCase();
    actorSystemData.armor_class = (wc === "superheavy") ? "super_heavy" : wc;

    //Add bonuses from items to Characteristics (use aggregated sums)
    actorSystemData.characteristics.str.total = actorSystemData.characteristics.str.base + agg.charBonus.str;
    actorSystemData.characteristics.end.total = actorSystemData.characteristics.end.base + agg.charBonus.end;
    actorSystemData.characteristics.agi.total = actorSystemData.characteristics.agi.base + agg.charBonus.agi;
    actorSystemData.characteristics.int.total = actorSystemData.characteristics.int.base + agg.charBonus.int;
    actorSystemData.characteristics.wp.total = actorSystemData.characteristics.wp.base + agg.charBonus.wp;
    actorSystemData.characteristics.prc.total = actorSystemData.characteristics.prc.base + agg.charBonus.prc;
    actorSystemData.characteristics.prs.total = actorSystemData.characteristics.prs.base + agg.charBonus.prs;
    actorSystemData.characteristics.lck.total = actorSystemData.characteristics.lck.base + agg.charBonus.lck;


    // Active Effects: apply characteristic additive modifiers
    {
      const cMods = actorSystemData.modifiers?.characteristics ?? {};
      actorSystemData.characteristics.str.total += Number(cMods.str ?? 0);
      actorSystemData.characteristics.end.total += Number(cMods.end ?? 0);
      actorSystemData.characteristics.agi.total += Number(cMods.agi ?? 0);
      actorSystemData.characteristics.int.total += Number(cMods.int ?? 0);
      actorSystemData.characteristics.wp.total += Number(cMods.wp ?? 0);
      actorSystemData.characteristics.prc.total += Number(cMods.prc ?? 0);
      actorSystemData.characteristics.prs.total += Number(cMods.prs ?? 0);
      actorSystemData.characteristics.lck.total += Number(cMods.lck ?? 0);
    }


    


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


// Health / Magicka / Stamina / Luck Points
// Active Effects: deterministic resource max pipeline.
//
// Effects authoring contract (recommended):
//  - Use keys under system.modifiers.<resource>.<base|bonus|max|value>
//  - ADD: treated as additive
//  - OVERRIDE: sets the corresponding derived component directly (ADDs ignored for that key)
//
// NOTE: This system recomputes derived stats each prepare cycle, so we cannot rely on Foundry
// directly applying changes to derived fields like system.hp.max.

// HP
actorSystemData.hp.base = Math.ceil(actorSystemData.characteristics.end.total / 2);
{
  const hpAE = this._getResourceAEModifiers('hp');

  const base = (hpAE.base.override != null) ? Number(hpAE.base.override) : (Number(actorSystemData.hp.base ?? 0) + Number(hpAE.base.add ?? 0));
  const bonus = (hpAE.bonus.override != null) ? Number(hpAE.bonus.override) : (Number(actorSystemData.hp.bonus ?? 0) + Number(hpAE.bonus.add ?? 0));

  actorSystemData.hp.base = base;
  actorSystemData.hp.bonus = bonus;

  const computedMax = Number(base) + Number(bonus);
  actorSystemData.hp.max = (hpAE.max.override != null) ? Number(hpAE.max.override) : (computedMax + Number(hpAE.max.add ?? 0));

  // Optional value targeting; always clamp to [0, max]
  if (hpAE.value.override != null) actorSystemData.hp.value = Number(hpAE.value.override);
  else if (hpAE.value.add) actorSystemData.hp.value = Number(actorSystemData.hp.value ?? 0) + Number(hpAE.value.add ?? 0);

  actorSystemData.hp.value = Math.clamp(Number(actorSystemData.hp.value ?? 0), 0, Number(actorSystemData.hp.max ?? 0));
}

// Magicka
actorSystemData.magicka.max = actorSystemData.characteristics.int.total + actorSystemData.magicka.bonus + this._determineIbMp(actorData);
{
  const mAE = this._getResourceAEModifiers('magicka');

  const bonus = (mAE.bonus.override != null) ? Number(mAE.bonus.override) : (Number(actorSystemData.magicka.bonus ?? 0) + Number(mAE.bonus.add ?? 0));
  actorSystemData.magicka.bonus = bonus;

  // base/max keys are treated as direct max contributions for magicka (no distinct base field in schema).
  const computedMax = Number(actorSystemData.magicka.max ?? 0) + Number(mAE.base.add ?? 0);
  const withAdd = computedMax + Number(mAE.max.add ?? 0);
  actorSystemData.magicka.max = (mAE.max.override != null) ? Number(mAE.max.override) : withAdd;

  if (mAE.value.override != null) actorSystemData.magicka.value = Number(mAE.value.override);
  else if (mAE.value.add) actorSystemData.magicka.value = Number(actorSystemData.magicka.value ?? 0) + Number(mAE.value.add ?? 0);

  actorSystemData.magicka.value = Math.clamp(Number(actorSystemData.magicka.value ?? 0), 0, Number(actorSystemData.magicka.max ?? 0));
}

// Stamina
actorSystemData.stamina.max = endBonus + actorSystemData.stamina.bonus;
{
  const sAE = this._getResourceAEModifiers('stamina');

  const bonus = (sAE.bonus.override != null) ? Number(sAE.bonus.override) : (Number(actorSystemData.stamina.bonus ?? 0) + Number(sAE.bonus.add ?? 0));
  actorSystemData.stamina.bonus = bonus;

  const computedMax = Number(actorSystemData.stamina.max ?? 0) + Number(sAE.base.add ?? 0);
  const withAdd = computedMax + Number(sAE.max.add ?? 0);
  actorSystemData.stamina.max = (sAE.max.override != null) ? Number(sAE.max.override) : withAdd;

  if (sAE.value.override != null) actorSystemData.stamina.value = Number(sAE.value.override);
  else if (sAE.value.add) actorSystemData.stamina.value = Number(actorSystemData.stamina.value ?? 0) + Number(sAE.value.add ?? 0);

  actorSystemData.stamina.value = Math.clamp(Number(actorSystemData.stamina.value ?? 0), 0, Number(actorSystemData.stamina.max ?? 0));
}

// Luck Points
actorSystemData.luck_points.max = lckBonus + actorSystemData.luck_points.bonus;
{
  const lAE = this._getResourceAEModifiers('luck_points');

  const bonus = (lAE.bonus.override != null) ? Number(lAE.bonus.override) : (Number(actorSystemData.luck_points.bonus ?? 0) + Number(lAE.bonus.add ?? 0));
  actorSystemData.luck_points.bonus = bonus;

  const computedMax = Number(actorSystemData.luck_points.max ?? 0) + Number(lAE.base.add ?? 0);
  const withAdd = computedMax + Number(lAE.max.add ?? 0);
  actorSystemData.luck_points.max = (lAE.max.override != null) ? Number(lAE.max.override) : withAdd;

  if (lAE.value.override != null) actorSystemData.luck_points.value = Number(lAE.value.override);
  else if (lAE.value.add) actorSystemData.luck_points.value = Number(actorSystemData.luck_points.value ?? 0) + Number(lAE.value.add ?? 0);

  actorSystemData.luck_points.value = Math.clamp(Number(actorSystemData.luck_points.value ?? 0), 0, Number(actorSystemData.luck_points.max ?? 0));
}

    // Carry Rating (base formula) + deterministic AE modifiers
    const carryAEs = this._getCarryAEModifiers();
    const fatigueAEs = this._getFatigueAEModifiers();

    // Bonus lane modifies carry_rating.bonus
    {
      const bonus = (carryAEs.bonus.override != null)
        ? Number(carryAEs.bonus.override)
        : (Number(actorSystemData.carry_rating.bonus ?? 0) + Number(carryAEs.bonus.add ?? 0));
      actorSystemData.carry_rating.bonus = bonus;
    }

    // Base formula lane (4*STR + 2*END) plus optional base modifier
    const baseFormula = Math.floor((4 * strBonus) + (2 * endBonus));
    const baseMod = (carryAEs.base.override != null)
      ? Number(carryAEs.base.override)
      : Number(carryAEs.base.add ?? 0);

    const computedMax = baseFormula + baseMod + Number(actorSystemData.carry_rating.bonus ?? 0);
    const withAdd = computedMax + Number(carryAEs.override.add ?? 0);

    // Override lane: hard set carry_rating.max (OVERRIDE), otherwise apply additive.
    actorSystemData.carry_rating.max = (carryAEs.override.override != null)
      ? Number(carryAEs.override.override)
      : withAdd;
    // Guard: Use Number() to ensure numeric value after toFixed for safe carry rating calculations
    // RAW: "ENC is halved when armor is worn (but not for carried shields)"
    actorSystemData.carry_rating.current = Number((agg.totalEnc - (agg.armorEnc / 2) - agg.excludedEnc).toFixed(1));

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

    // Encumbrance penalty AE modifier (applies after burden bracket computation)
    {
      const m = (carryAEs?.encTestPenalty) ? carryAEs.encTestPenalty : this._getCarryAEModifiers().encTestPenalty;
      if (m.override != null) actorSystemData.carry_rating.penalty = Number(m.override);
      else if (m.add) actorSystemData.carry_rating.penalty = Number(actorSystemData.carry_rating.penalty ?? 0) + Number(m.add);
    }

    // Encumbrance speed penalty AE modifier (RAW lane: modifies the encumbrance-applied speed penalty only).
    // Semantics: ADD is applied as a post-bracket delta to current speed.value; OVERRIDE sets that delta.
    {
      const m = (carryAEs?.encSpeedPenalty) ? carryAEs.encSpeedPenalty : this._getCarryAEModifiers().encSpeedPenalty;
      const delta = (m.override != null) ? Number(m.override) : (m.add ? Number(m.add) : 0);
      if (delta) actorSystemData.speed.value = Math.max(0, Number(actorSystemData.speed.value ?? 0) + delta);
    }

    // Encumbrance stamina penalty AE modifier (RAW lane: modifies the encumbrance-applied SP max penalty only).
    // Semantics: ADD is applied as a post-bracket delta to current stamina.max; OVERRIDE sets that delta.
    {
      const m = (carryAEs?.encStaminaPenalty) ? carryAEs.encStaminaPenalty : this._getCarryAEModifiers().encStaminaPenalty;
      const delta = (m.override != null) ? Number(m.override) : (m.add ? Number(m.add) : 0);
      if (delta) actorSystemData.stamina.max = Number(actorSystemData.stamina.max ?? 0) + delta;
    }


    // RAW: If encumbrance Stamina Penalty would reduce SP max below 0, excess converts into fatigue levels.
    // Implementation: keep stamina.max at 0 (never negative) and add the excess as derived fatigue.bonus.
    // This is derived-only; we do not persist document changes.
    {
      const spMax = Number(actorSystemData.stamina.max ?? 0);
      if (spMax < 0) {
        const excess = Math.abs(Math.trunc(spMax));
        actorSystemData.stamina.max = 0;
        // Ensure current SP does not exceed the new max.
        actorSystemData.stamina.value = Math.min(Number(actorSystemData.stamina.value ?? 0), 0);
        actorSystemData.fatigue.bonus = Number(actorSystemData.fatigue.bonus ?? 0) + excess;
      }
    }

    // Armor Weight Class Calculations
    // Use effective armor weight class as authoritative input (per contract).
    // We apply speed penalties here to keep existing derived speed math intact.
    const effWC = String(actorSystemData.mobility?.armorWeightClass ?? "none").toLowerCase();
    let spdPenalty = 0;
    if (effWC === "medium") spdPenalty = -1;
    else if (effWC === "heavy") spdPenalty = -2;
    else if (effWC === "superheavy") spdPenalty = -3;
    else if (effWC === "crippling") {
      // Do not guess the RAW value; keep 0 but warn (once per prepare).
      console.warn("uesrpg-3ev4 | Armor weight class 'crippling' equipped; mobility penalty table not finalized. No speed penalty applied.", this);
      spdPenalty = 0;
    }

    if (spdPenalty !== 0) {
      actorSystemData.speed.value = Math.max(0, Number(actorSystemData.speed.value || 0) + spdPenalty);
      actorSystemData.speed.swimSpeed = Math.max(0, Number(actorSystemData.speed.swimSpeed || 0) + spdPenalty);
    }


// Chapter 5 (Package 4): Movement restriction semantics derived from conditions.
// - Slowed: halve Speed (round up)
// - Entangled: halve Speed (round up)
// - Prone: movement costs double -> effective ground Speed is halved (round down)
// - Immobilized/Restrained/Paralyzed/Unconscious: cannot move (Speed 0)
this._applyMovementRestrictionSemantics(actorData, actorSystemData);

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
    const woundSuppressed = this._hasWoundPenaltySuppression(actorData);
    if (actorSystemData.wounded === true && !woundSuppressed) {
      let woundPen = 0;
      this._painIntolerant(actorData) ? woundPen = -30 : woundPen = -20;

      if (this._halfWoundPenalty(actorData) === true) {
        actorSystemData.woundPenalty = woundPen / 2;
      } else {
        actorSystemData.woundPenalty = woundPen;
      }

      // professionsWound mirrors professions; wound penalty is applied by TN calculation code
      if (actorSystemData.professionsWound && actorSystemData.professions) {
        for (var skill in actorSystemData.professionsWound) {
          actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
        }
      }
    }
    else if (actorSystemData.wounded === true && woundSuppressed) {
      // Passive wound penalties are suppressed by first aid / magical healing forestall,
      // without clearing the wounded state.
      actorSystemData.woundPenalty = 0;

      if (actorSystemData.professionsWound && actorSystemData.professions) {
        for (var skill in actorSystemData.professionsWound) {
          actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
        }
      }
    }

    else {
      for (var skill in actorSystemData.professionsWound) {
        actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
      }
    }

    //Fatigue Penalties
    // Active Effects: Fatigue/Exhaustion modifiers (bonus/penalty).
    {
      const m = (fatigueAEs?.bonus) ? fatigueAEs.bonus : this._getFatigueAEModifiers().bonus;
      if (m.override != null) actorSystemData.fatigue.bonus = Number(m.override);
      else if (m.add) actorSystemData.fatigue.bonus = Number(actorSystemData.fatigue.bonus ?? 0) + Number(m.add);
    }
    actorSystemData.fatigue.level = actorSystemData.stamina.value < 0 ? ((actorSystemData.stamina.value -1) * -1) + actorSystemData.fatigue.bonus : 0 + actorSystemData.fatigue.bonus

    switch (actorSystemData.fatigue.level > 0) {
      case true:
        actorSystemData.fatigue.penalty = this._calcFatiguePenalty(actorData)
        break

      case false:
        actorSystemData.fatigue.level = 0
        actorSystemData.fatigue.penalty = 0
        break
    }
    // Active Effects: Fatigue/Exhaustion penalty modifiers (applied after fatigue penalty is calculated).
    {
      const m = (fatigueAEs?.penalty) ? fatigueAEs.penalty : this._getFatigueAEModifiers().penalty;
      if (m.override != null) actorSystemData.fatigue.penalty = Number(m.override);
      else if (m.add) actorSystemData.fatigue.penalty = Number(actorSystemData.fatigue.penalty ?? 0) + Number(m.add);
    }


    // Active Effects: Wound Threshold modifiers (bonus/value) applied after all other rule adjustments.
    this._applyWoundThresholdAEs(actorSystemData);

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


// Health / Magicka / Stamina / Luck Points
// Active Effects: deterministic resource max pipeline (NPC).

// HP
actorSystemData.hp.base = Math.ceil(actorSystemData.characteristics.end.total / 2);
{
  const hpAE = this._getResourceAEModifiers('hp');

  const base = (hpAE.base.override != null) ? Number(hpAE.base.override) : (Number(actorSystemData.hp.base ?? 0) + Number(hpAE.base.add ?? 0));
  const bonus = (hpAE.bonus.override != null) ? Number(hpAE.bonus.override) : (Number(actorSystemData.hp.bonus ?? 0) + Number(hpAE.bonus.add ?? 0));

  actorSystemData.hp.base = base;
  actorSystemData.hp.bonus = bonus;

  const computedMax = Number(base) + Number(bonus);
  actorSystemData.hp.max = (hpAE.max.override != null) ? Number(hpAE.max.override) : (computedMax + Number(hpAE.max.add ?? 0));

  if (hpAE.value.override != null) actorSystemData.hp.value = Number(hpAE.value.override);
  else if (hpAE.value.add) actorSystemData.hp.value = Number(actorSystemData.hp.value ?? 0) + Number(hpAE.value.add ?? 0);

  actorSystemData.hp.value = Math.clamp(Number(actorSystemData.hp.value ?? 0), 0, Number(actorSystemData.hp.max ?? 0));
}

// Magicka
actorSystemData.magicka.max = actorSystemData.characteristics.int.total + actorSystemData.magicka.bonus + this._determineIbMp(actorData);
{
  const mAE = this._getResourceAEModifiers('magicka');

  const bonus = (mAE.bonus.override != null) ? Number(mAE.bonus.override) : (Number(actorSystemData.magicka.bonus ?? 0) + Number(mAE.bonus.add ?? 0));
  actorSystemData.magicka.bonus = bonus;

  const computedMax = Number(actorSystemData.magicka.max ?? 0) + Number(mAE.base.add ?? 0);
  const withAdd = computedMax + Number(mAE.max.add ?? 0);
  actorSystemData.magicka.max = (mAE.max.override != null) ? Number(mAE.max.override) : withAdd;

  if (mAE.value.override != null) actorSystemData.magicka.value = Number(mAE.value.override);
  else if (mAE.value.add) actorSystemData.magicka.value = Number(actorSystemData.magicka.value ?? 0) + Number(mAE.value.add ?? 0);

  actorSystemData.magicka.value = Math.clamp(Number(actorSystemData.magicka.value ?? 0), 0, Number(actorSystemData.magicka.max ?? 0));
}

// Stamina
actorSystemData.stamina.max = endBonus + actorSystemData.stamina.bonus;
{
  const sAE = this._getResourceAEModifiers('stamina');

  const bonus = (sAE.bonus.override != null) ? Number(sAE.bonus.override) : (Number(actorSystemData.stamina.bonus ?? 0) + Number(sAE.bonus.add ?? 0));
  actorSystemData.stamina.bonus = bonus;

  const computedMax = Number(actorSystemData.stamina.max ?? 0) + Number(sAE.base.add ?? 0);
  const withAdd = computedMax + Number(sAE.max.add ?? 0);
  actorSystemData.stamina.max = (sAE.max.override != null) ? Number(sAE.max.override) : withAdd;

  if (sAE.value.override != null) actorSystemData.stamina.value = Number(sAE.value.override);
  else if (sAE.value.add) actorSystemData.stamina.value = Number(actorSystemData.stamina.value ?? 0) + Number(sAE.value.add ?? 0);

  actorSystemData.stamina.value = Math.clamp(Number(actorSystemData.stamina.value ?? 0), 0, Number(actorSystemData.stamina.max ?? 0));
}

// Luck Points
actorSystemData.luck_points.max = lckBonus + actorSystemData.luck_points.bonus;
{
  const lAE = this._getResourceAEModifiers('luck_points');

  const bonus = (lAE.bonus.override != null) ? Number(lAE.bonus.override) : (Number(actorSystemData.luck_points.bonus ?? 0) + Number(lAE.bonus.add ?? 0));
  actorSystemData.luck_points.bonus = bonus;

  const computedMax = Number(actorSystemData.luck_points.max ?? 0) + Number(lAE.base.add ?? 0);
  const withAdd = computedMax + Number(lAE.max.add ?? 0);
  actorSystemData.luck_points.max = (lAE.max.override != null) ? Number(lAE.max.override) : withAdd;

  if (lAE.value.override != null) actorSystemData.luck_points.value = Number(lAE.value.override);
  else if (lAE.value.add) actorSystemData.luck_points.value = Number(actorSystemData.luck_points.value ?? 0) + Number(lAE.value.add ?? 0);

  actorSystemData.luck_points.value = Math.clamp(Number(actorSystemData.luck_points.value ?? 0), 0, Number(actorSystemData.luck_points.max ?? 0));
}

    // Carry Rating (base formula) + deterministic AE modifiers
    const carryAEs = this._getCarryAEModifiers();
    const fatigueAEs = this._getFatigueAEModifiers();

    // Bonus lane modifies carry_rating.bonus
    {
      const bonus = (carryAEs.bonus.override != null)
        ? Number(carryAEs.bonus.override)
        : (Number(actorSystemData.carry_rating.bonus ?? 0) + Number(carryAEs.bonus.add ?? 0));
      actorSystemData.carry_rating.bonus = bonus;
    }

    // Base formula lane (4*STR + 2*END) plus optional base modifier
    const baseFormula = Math.floor((4 * strBonus) + (2 * endBonus));
    const baseMod = (carryAEs.base.override != null)
      ? Number(carryAEs.base.override)
      : Number(carryAEs.base.add ?? 0);

    const computedMax = baseFormula + baseMod + Number(actorSystemData.carry_rating.bonus ?? 0);
    const withAdd = computedMax + Number(carryAEs.override.add ?? 0);

    // Override lane: hard set carry_rating.max (OVERRIDE), otherwise apply additive.
    actorSystemData.carry_rating.max = (carryAEs.override.override != null)
      ? Number(carryAEs.override.override)
      : withAdd;
    // Guard: Use Number() to ensure numeric value after toFixed for safe carry rating calculations
    // RAW: "ENC is halved when armor is worn (but not for carried shields)"
    actorSystemData.carry_rating.current = Number((agg.totalEnc - (agg.armorEnc / 2) - agg.excludedEnc).toFixed(1));

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

    // Encumbrance penalty AE modifier (applies after burden bracket computation)
    {
      const m = (carryAEs?.encTestPenalty) ? carryAEs.encTestPenalty : this._getCarryAEModifiers().encTestPenalty;
      if (m.override != null) actorSystemData.carry_rating.penalty = Number(m.override);
      else if (m.add) actorSystemData.carry_rating.penalty = Number(actorSystemData.carry_rating.penalty ?? 0) + Number(m.add);
    }

    // Encumbrance speed penalty AE modifier (RAW lane: modifies the encumbrance-applied speed penalty only).
    // Semantics: ADD is applied as a post-bracket delta to current speed.value; OVERRIDE sets that delta.
    {
      const m = (carryAEs?.encSpeedPenalty) ? carryAEs.encSpeedPenalty : this._getCarryAEModifiers().encSpeedPenalty;
      const delta = (m.override != null) ? Number(m.override) : (m.add ? Number(m.add) : 0);
      if (delta) actorSystemData.speed.value = Math.max(0, Number(actorSystemData.speed.value ?? 0) + delta);
    }

    // Encumbrance stamina penalty AE modifier (RAW lane: modifies the encumbrance-applied SP max penalty only).
    // Semantics: ADD is applied as a post-bracket delta to current stamina.max; OVERRIDE sets that delta.
    {
      const m = (carryAEs?.encStaminaPenalty) ? carryAEs.encStaminaPenalty : this._getCarryAEModifiers().encStaminaPenalty;
      const delta = (m.override != null) ? Number(m.override) : (m.add ? Number(m.add) : 0);
      if (delta) actorSystemData.stamina.max = Number(actorSystemData.stamina.max ?? 0) + delta;
    }

    // Armor Weight Class mobility penalties (effective, Step 9)
    // - Apply speed penalty now.
    // - Agility test penalty is stored on actorSystemData.mobility for roll logic to consume later.
    //
    // Existing code historically used actorSystemData.armor_class (derived elsewhere); we now normalize
    // that field from the computed effective weight class earlier in _prepareCharacterData.
    let spdPenalty = 0;
    if (actorSystemData.armor_class === "super_heavy") spdPenalty = -3;
    else if (actorSystemData.armor_class === "heavy") spdPenalty = -2;
    else if (actorSystemData.armor_class === "medium") spdPenalty = -1;

    if (spdPenalty !== 0) {
      actorSystemData.speed.value = Math.max(0, Number(actorSystemData.speed.value || 0) + spdPenalty);
      actorSystemData.speed.swimSpeed = Math.max(0, Number(actorSystemData.speed.swimSpeed || 0) + spdPenalty);
    }


// Chapter 5 (Package 4): Movement restriction semantics derived from conditions.
// - Slowed: halve Speed (round up)
// - Entangled: halve Speed (round up)
// - Prone: movement costs double -> effective ground Speed is halved (round down)
// - Immobilized/Restrained/Paralyzed/Unconscious: cannot move (Speed 0)
this._applyMovementRestrictionSemantics(actorData, actorSystemData);

    // Set Skill professions to regular professions (This is a fucking mess, but it's the way it's done for now...)
    for (let prof in actorSystemData.professions) {
      if (prof === 'profession1'||prof === 'profession2'||prof === 'profession3'||prof === 'commerce') {
        actorSystemData.professions[prof] === 0 ? actorSystemData.professions[prof] = actorSystemData.skills[prof].tn : actorSystemData.professions[prof] = 0
      }
    }

    // Wound Penalties
    const woundSuppressed = this._hasWoundPenaltySuppression(actorData);
    if (actorSystemData.wounded === true && !woundSuppressed) {
      let woundPen = 0;
      this._painIntolerant(actorData) ? woundPen = -30 : woundPen = -20;

      if (this._halfWoundPenalty(actorData) === true) {
        actorSystemData.woundPenalty = woundPen / 2;
      } else {
        actorSystemData.woundPenalty = woundPen;
      }

      // professionsWound mirrors professions; wound penalty is applied by TN calculation code
      if (actorSystemData.professionsWound && actorSystemData.professions) {
        for (var skill in actorSystemData.professionsWound) {
          actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
        }
      }
    }
    else if (actorSystemData.wounded === true && woundSuppressed) {
      // Passive wound penalties are suppressed by first aid / magical healing forestall,
      // without clearing the wounded state.
      actorSystemData.woundPenalty = 0;

      if (actorSystemData.professionsWound && actorSystemData.professions) {
        for (var skill in actorSystemData.professionsWound) {
          actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
        }
      }
    }
    else {
      for (var skill in actorSystemData.professionsWound) {
        actorSystemData.professionsWound[skill] = actorSystemData.professions[skill];
      }
    }

    //Fatigue Penalties
    // Active Effects: Fatigue/Exhaustion modifiers (bonus/penalty).
    {
      const m = (fatigueAEs?.bonus) ? fatigueAEs.bonus : this._getFatigueAEModifiers().bonus;
      if (m.override != null) actorSystemData.fatigue.bonus = Number(m.override);
      else if (m.add) actorSystemData.fatigue.bonus = Number(actorSystemData.fatigue.bonus ?? 0) + Number(m.add);
    }
    actorSystemData.fatigue.level = actorSystemData.stamina.value < 0 ? ((actorSystemData.stamina.value -1) * -1) + actorSystemData.fatigue.bonus : 0 + actorSystemData.fatigue.bonus

    switch (actorSystemData.fatigue.level > 0) {
      case true:
        actorSystemData.fatigue.penalty = this._calcFatiguePenalty(actorData)
        break

      case false:
        actorSystemData.fatigue.level = 0
        actorSystemData.fatigue.penalty = 0
        break
    }
    // Active Effects: Fatigue/Exhaustion penalty modifiers (applied after fatigue penalty is calculated).
    {
      const m = (fatigueAEs?.penalty) ? fatigueAEs.penalty : this._getFatigueAEModifiers().penalty;
      if (m.override != null) actorSystemData.fatigue.penalty = Number(m.override);
      else if (m.add) actorSystemData.fatigue.penalty = Number(actorSystemData.fatigue.penalty ?? 0) + Number(m.add);
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

    // Active Effects: Wound Threshold modifiers (bonus/value) applied after all other rule adjustments.
    this._applyWoundThresholdAEs(actorSystemData);

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
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);

    const wornArmor = items.filter(item => {
      if (item?.type !== "armor") return false;
      const sys = item.system ?? {};
      if (sys.equipped !== true) return false;
      const isShield = Boolean(sys?.isShieldEffective ?? sys?.isShield);
      return !isShield;
    });

    let armorENC = 0;
    for (const item of wornArmor) {
      const sys = item.system ?? {};
      const enc = Number(sys.enc ?? 0);
      const qty = Number(sys.quantity ?? 0);
      armorENC += ((enc / 2) * qty);
    }
    return armorENC;
  }

  _excludeENC(actorData) {
    let excluded = (actorData.items || []).filter(item => item?.system && item.system.excludeENC == true);
    let totalWeight = 0.0;
    for (let item of excluded) {
      totalWeight = totalWeight + (Number(item?.system?.enc || 0) * Number(item?.system?.quantity || 0));
    }
    return totalWeight
  }

  _speedCalc(actorData) {
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);
    const attribute = items.filter(item => item?.system?.halfSpeed === true);
    let speed = Number(actorData?.system?.speed?.base ?? 0);
    if (attribute.length >= 1) speed = Math.ceil(speed / 2);
    return speed;
  }

  _iniCalc(actorData) {
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);
    const attribute = items.filter(item => item && (item.type === "trait" || item.type === "talent"));
    let init = Number(actorData?.system?.initiative?.base ?? 0);
    for (let item of attribute) {
      if (item?.system?.replace?.ini && item.system.replace.ini.characteristic !== "none") {
        const ch = item.system.replace.ini.characteristic;
        if (ch === "str") init = Math.floor(this._getCharacteristicTotal(actorData, "str") / 10) * 3;
        else if (ch === "end") init = Math.floor(this._getCharacteristicTotal(actorData, "end") / 10) * 3;
        else if (ch === "agi") init = Math.floor(this._getCharacteristicTotal(actorData, "agi") / 10) * 3;
        else if (ch === "int") init = Math.floor(this._getCharacteristicTotal(actorData, "int") / 10) * 3;
        else if (ch === "wp") init = Math.floor(this._getCharacteristicTotal(actorData, "wp") / 10) * 3;
        else if (ch === "prc") init = Math.floor(this._getCharacteristicTotal(actorData, "prc") / 10) * 3;
        else if (ch === "prs") init = Math.floor(this._getCharacteristicTotal(actorData, "prs") / 10) * 3;
        else if (ch === "lck") init = Math.floor(this._getCharacteristicTotal(actorData, "lck") / 10) * 3;
      }
    }
    return init;
  }

  _woundThresholdCalc(actorData) {
    const itemsRaw = actorData?.items;
    const items = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw ? Array.from(itemsRaw) : []);
    const attribute = items.filter(item => item && (item.type === "trait" || item.type === "talent"));
    let wound = Number(actorData?.system?.wound_threshold?.base ?? 0);
    for (let item of attribute) {
      if (item?.system?.replace?.wt && item.system.replace.wt.characteristic !== "none") {
        const ch = item.system.replace.wt.characteristic;
        if (ch === "str") wound = Math.floor(this._getCharacteristicTotal(actorData, "str") / 10) * 3;
        else if (ch === "end") wound = Math.floor(this._getCharacteristicTotal(actorData, "end") / 10) * 3;
        else if (ch === "agi") wound = Math.floor(this._getCharacteristicTotal(actorData, "agi") / 10) * 3;
        else if (ch === "int") wound = Math.floor(this._getCharacteristicTotal(actorData, "int") / 10) * 3;
        else if (ch === "wp") wound = Math.floor(this._getCharacteristicTotal(actorData, "wp") / 10) * 3;
        else if (ch === "prc") wound = Math.floor(this._getCharacteristicTotal(actorData, "prc") / 10) * 3;
        else if (ch === "prs") wound = Math.floor(this._getCharacteristicTotal(actorData, "prs") / 10) * 3;
        else if (ch === "lck") wound = Math.floor(this._getCharacteristicTotal(actorData, "lck") / 10) * 3;
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

  /**
   * Collect all uesrpg-3ev4 condition keys applied via ActiveEffects.
   * This is a derived-data helper only; it does not mutate document data.
   */
  _getUesConditionKeySet(actorData) {
    const out = new Set();
    const effects = actorData?.effects?.contents ?? actorData?.effects ?? [];
    for (const e of effects) {
      const flagged = e?.getFlag?.("uesrpg-3ev4", "condition") ?? e?.flags?.["uesrpg-3ev4"]?.condition ?? null;
      const key = flagged?.key ? String(flagged.key).trim().toLowerCase() : "";
      if (key) out.add(key);

      // Fallback: some conditions may exist as named effects without our flags.
      const nm = String(e?.name ?? "").trim().toLowerCase();
      if (nm) {
        const first = nm.split("(")[0].trim().split(/\s+/)[0];
        if (first) out.add(first);
      }
    }
    return out;
  }

  /**
   * Chapter 5 (Package 4): enforce movement restriction semantics via derived Speed.
   * This does not block token movement in the canvas; it deterministically adjusts derived speed values.
   */
  _applyMovementRestrictionSemantics(actorData, actorSystemData) {
    try {
      if (!actorSystemData?.speed) return;

      const keys = this._getUesConditionKeySet(actorData);

      const clamp = (n) => {
        const v = Number(n);
        return Number.isFinite(v) ? Math.max(0, v) : 0;
      };

      let ground = clamp(actorSystemData.speed.value);
      let swim = clamp(actorSystemData.speed.swimSpeed);
      let fly = clamp(actorSystemData.speed.flySpeed);

      const immobile = keys.has("immobilized") || keys.has("restrained") || keys.has("paralyzed") || keys.has("unconscious");
      if (immobile) {
        ground = 0;
        swim = 0;
        fly = 0;
      } else {
        // Slowed / Entangled: halve (round up)
        if (keys.has("slowed")) {
          ground = Math.ceil(ground / 2);
          swim = Math.ceil(swim / 2);
          fly = Math.ceil(fly / 2);
        }
        if (keys.has("entangled")) {
          ground = Math.ceil(ground / 2);
          swim = Math.ceil(swim / 2);
          fly = Math.ceil(fly / 2);
        }

        // Prone: movement costs double, so effective ground speed is halved (round down).
        if (keys.has("prone")) {
          ground = Math.floor(ground / 2);
        }

        // Hidden: movement costs double, so effective movement speeds are halved (round down).
        if (keys.has("hidden")) {
          ground = Math.floor(ground / 2);
          swim = Math.floor(swim / 2);
          fly = Math.floor(fly / 2);
        }
      }

      actorSystemData.speed.value = ground;
      actorSystemData.speed.swimSpeed = swim;

      // Some actors may not define flySpeed in their schema; guard defensively.
      if (Object.prototype.hasOwnProperty.call(actorSystemData.speed, "flySpeed")) {
        actorSystemData.speed.flySpeed = fly;
      }
    } catch (err) {
      console.warn("uesrpg-3ev4 | Movement restriction semantics failed", err);
    }
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

  /**
   * Apply damage to this actor with automatic reductions and tracking
   * @param {number} damage - Raw damage amount
   * @param {string} damageType - Type of damage (physical, fire, frost, etc.)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Damage application result
   */
  async applyDamage(damage, damageType = 'physical', options = {}) {
    // Import damage automation module dynamically to avoid circular dependencies
    const { applyDamage: applyDamageFunc } = await import('../combat/damage-automation.js');
    return await applyDamageFunc(this, damage, damageType, options);
  }

  /**
   * Apply healing to this actor
   * @param {number} healing - Amount of HP to restore
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Healing result
   */
  async applyHealing(healing, options = {}) {
    const { applyHealing: applyHealingFunc } = await import('../combat/damage-automation.js');
    return await applyHealingFunc(this, healing, options);
  }

  /**
   * Get damage reduction values for this actor
   * @param {string} damageType - Type of damage
   * @returns {Object} - Damage reduction breakdown
   */
  async getDamageReduction(damageType = 'physical') {
    const { getDamageReduction: getDamageReductionFunc } = await import('../combat/damage-automation.js');
    return getDamageReductionFunc(this, damageType);
  }

}
