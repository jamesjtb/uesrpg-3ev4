/**
 * UESRPG 3ev4 system constants (items-focused).
 * Keep this file free of Foundry runtime dependencies so it can be imported safely anywhere.
 */

/**
 * Root path for this system's static assets and templates.
 * Some modules import this by name (e.g. startup.js), so it must remain a named export.
 */
export const systemRootPath = "systems/uesrpg-3ev4";

/** Central constants object (extend as needed). */
export const UESRPG = {
  // Weapon quality levels (Chapter 7 scaffold)
  WEAPON_QUALITY_LEVELS: [
    { value: "inferior", label: "Inferior" },
    { value: "common", label: "Common" },
    { value: "superior", label: "Superior" }
  ],

  // Weapon materials (Chapter 7)
  // NOTE: These are keys used in dropdowns. The derived rules below (WEAPON_MATERIAL_RULES*)
  // implement the RAW modifiers.
  WEAPON_MATERIALS: [
    // Legacy/compat
    { value: "standard", label: "Standard" },
    { value: "chitin", label: "Chitin" },
    { value: "iron", label: "Iron" },
    { value: "silver", label: "Silver" },
    { value: "steel", label: "Steel" },
    { value: "dwemer", label: "Dwemer" },
    { value: "moonstone", label: "Moonstone" },
    { value: "orichalcum", label: "Orichalcum" },
    { value: "adamantium", label: "Adamantium" },
    { value: "malachite", label: "Malachite" },
    { value: "stalhrim", label: "Stalhrim" },
    { value: "daedric", label: "Daedric" },
    { value: "ebony", label: "Ebony" },
    { value: "dragonbone", label: "Dragonbone" },
    // Ranged-only
    { value: "bonemold", label: "Bonemold" },
    // Sling-only
    { value: "cloth", label: "Cloth" },
    { value: "hemp", label: "Hemp" },
    { value: "leatherStraps", label: "Leather Straps" },
    { value: "netchLeatherStraps", label: "Netch Leather Straps" },
    { value: "silk", label: "Silk" },
    { value: "dreughHide", label: "Dreugh Hide" },
    // Special melee-only materials
    { value: "wood", label: "Wood" },
    { value: "bone", label: "Bone" }
  ],

  ARMOR_WEIGHT_CLASSES: [
    { value: "none", label: "None" },
    { value: "light", label: "Light" },
    { value: "medium", label: "Medium" },
    { value: "heavy", label: "Heavy" },
    { value: "superheavy", label: "Super Heavy" },
    { value: "crippling", label: "Crippling" }
  ],

  AMMO_ARROW_TYPES: [
    { value: "none", label: "None" },
    { value: "slashing", label: "Slashing" },
    { value: "splitting", label: "Splitting" }
  ],

  AMMO_MATERIALS: [
    // Legacy/compat
    { value: "standard", label: "Standard" },
    { value: "chitin", label: "Chitin" },
    { value: "iron", label: "Iron" },
    { value: "silver", label: "Silver" },
    { value: "steel", label: "Steel" },
    { value: "dwemer", label: "Dwemer" },
    { value: "moonstone", label: "Moonstone" },
    { value: "orichalcum", label: "Orichalcum" },
    { value: "adamantium", label: "Adamantium" },
    { value: "malachite", label: "Malachite" },
    { value: "stalhrim", label: "Stalhrim" },
    { value: "daedric", label: "Daedric" },
    { value: "ebony", label: "Ebony" },
    { value: "dragonbone", label: "Dragonbone" }
  ],

  // --- RAW rule tables (Chapter 7) ---
  // Values here are used for derived, non-persisted "effective" stats.
  WEAPON_QUALITY_RULES: {
    inferior: { priceMult: 0.5, autoQualities: [{ key: "primitive" }] },
    common: { priceMult: 1.0, autoQualities: [] },
    superior: { priceMult: 3.0, autoQualities: [{ key: "proven" }] }
  },

  // Melee weapon material rules
  WEAPON_MATERIAL_RULES_MELEE: {
    // Legacy/compat: treat "standard" as iron for now.
    standard: { damageMod: 0, encDelta: 0, enchantLevel: 200, priceMult: 0.8, autoQualities: [] },
    chitin: { damageMod: 0, encDelta: 0, enchantLevel: 100, priceMult: 0.8, autoQualities: [] },
    iron: { damageMod: 0, encDelta: 0, enchantLevel: 200, priceMult: 0.8, autoQualities: [] },
    silver: { damageMod: 1, encDelta: 0, enchantLevel: 550, priceMult: 1.3, autoQualities: [{ key: "silver" }] },
    steel: { damageMod: 1, encDelta: 0, enchantLevel: 300, priceMult: 1.0, autoQualities: [] },
    dwemer: { damageMod: 2, encDelta: 0, enchantLevel: 400, priceMult: 6.0, autoQualities: [{ key: "magic" }] },
    moonstone: { damageMod: 2, encDelta: 0, enchantLevel: 500, priceMult: 5.0, autoQualities: [{ key: "magic" }] },
    orichalcum: { damageMod: 2, encDelta: 0, enchantLevel: 400, priceMult: 4.0, autoQualities: [] },
    adamantium: { damageMod: 3, encDelta: 0, enchantLevel: 1000, priceMult: 8.0, autoQualities: [] },
    malachite: { damageMod: 3, encDelta: 0, enchantLevel: 200, priceMult: 7.0, autoQualities: [{ key: "magic" }] },
    stalhrim: { damageMod: 3, encDelta: 0, enchantLevel: 1000, priceMult: 12.0, autoQualities: [{ key: "magic" }] },
    daedric: { damageMod: 4, encDelta: 1, enchantLevel: 1500, priceMult: 15.0, autoQualities: [{ key: "magic" }] },
    ebony: { damageMod: 4, encDelta: 1, enchantLevel: 1250, priceMult: 10.0, autoQualities: [{ key: "magic" }] },
    dragonbone: { damageMod: 5, encDelta: 1, enchantLevel: 1500, priceMult: 30.0, autoQualities: [{ key: "magic" }] },
    // Special melee materials
    wood: { damageMod: 0, encDelta: 0, enchantLevel: 100, priceMult: 0.5, autoQualities: [{ key: "specialDamageRule", value: "wood" }] },
    bone: { damageMod: 0, encDelta: 0, enchantLevel: 0, priceMult: 0.5, autoQualities: [{ key: "specialDamageRule", value: "bone" }] }
  },

  // Ranged weapon material rules
  WEAPON_MATERIAL_RULES_RANGED: {
    wood: { rangeMod: 0, encDelta: 0, enchantLevel: 100, priceMult: 1.0, autoQualities: [] },
    bonemold: { rangeMod: 5, encDelta: 0, enchantLevel: 300, priceMult: 1.5, autoQualities: [] },
    chitin: { rangeMod: 5, encDelta: 0, enchantLevel: 200, priceMult: 1.25, autoQualities: [] },
    dwemer: { rangeMod: 5, encDelta: 0, enchantLevel: 800, priceMult: 6.0, autoQualities: [] },
    orichalcum: { rangeMod: 5, encDelta: 0, enchantLevel: 400, priceMult: 4.0, autoQualities: [] },
    moonstone: { rangeMod: 10, encDelta: 0, enchantLevel: 500, priceMult: 5.0, autoQualities: [] },
    daedric: { rangeMod: 15, encDelta: 1, enchantLevel: 1500, priceMult: 15.0, autoQualities: [] },
    ebony: { rangeMod: 15, encDelta: 1, enchantLevel: 1250, priceMult: 10.0, autoQualities: [] },
    malachite: { rangeMod: 15, encDelta: 0, enchantLevel: 200, priceMult: 7.0, autoQualities: [] },
    dragonbone: { rangeMod: 20, encDelta: 1, enchantLevel: 1500, priceMult: 30.0, autoQualities: [] }
  },

  // Sling materials
  WEAPON_MATERIAL_RULES_SLING: {
    cloth: { damageMod: 0, enchantLevel: 50, priceMult: 1.0 },
    hemp: { damageMod: 1, enchantLevel: 100, priceMult: 2.0 },
    leatherStraps: { damageMod: 2, enchantLevel: 150, priceMult: 3.0 },
    netchLeatherStraps: { damageMod: 3, enchantLevel: 200, priceMult: 5.0 },
    silk: { damageMod: 4, enchantLevel: 250, priceMult: 10.0 },
    dreughHide: { damageMod: 5, enchantLevel: 300, priceMult: 15.0 }
  },

  // Ammunition material rules (priced per 10 shots)
  AMMO_MATERIAL_RULES: {
    // Legacy/compat: treat "standard" as iron/chitin.
    standard: { damageMod: 0, enchantLevel: 200, pricePer10: 16, autoQualities: [] },
    chitin: { damageMod: 0, enchantLevel: 200, pricePer10: 16, autoQualities: [] },
    iron: { damageMod: 0, enchantLevel: 200, pricePer10: 16, autoQualities: [] },
    silver: { damageMod: 1, enchantLevel: 550, pricePer10: 26, autoQualities: [{ key: "silver" }] },
    steel: { damageMod: 1, enchantLevel: 300, pricePer10: 20, autoQualities: [] },
    dwemer: { damageMod: 2, enchantLevel: 400, pricePer10: 120, autoQualities: [{ key: "magic" }] },
    moonstone: { damageMod: 2, enchantLevel: 500, pricePer10: 100, autoQualities: [{ key: "magic" }] },
    orichalcum: { damageMod: 2, enchantLevel: 400, pricePer10: 80, autoQualities: [] },
    adamantium: { damageMod: 3, enchantLevel: 1000, pricePer10: 160, autoQualities: [] },
    malachite: { damageMod: 3, enchantLevel: 200, pricePer10: 140, autoQualities: [{ key: "magic" }] },
    stalhrim: { damageMod: 3, enchantLevel: 1000, pricePer10: 240, autoQualities: [{ key: "magic" }] },
    daedric: { damageMod: 4, enchantLevel: 1500, pricePer10: 300, autoQualities: [{ key: "magic" }] },
    ebony: { damageMod: 4, enchantLevel: 1250, pricePer10: 200, autoQualities: [{ key: "magic" }] },
    dragonbone: { damageMod: 5, enchantLevel: 1500, pricePer10: 600, autoQualities: [{ key: "magic" }] }
  },

  /**
   * Structured qualities v1
   * - key: canonical identifier stored in system.qualitiesStructured
   * - label: display name
   * - hasValue: whether this quality takes a numeric parameter (e.g., Reload (2))
   */
  QUALITIES_CATALOG: [
    { key: "slashing", label: "Slashing", hasValue: false },
    { key: "splitting", label: "Splitting", hasValue: false },
    { key: "crushing", label: "Crushing", hasValue: false },
    { key: "piercing", label: "Piercing", hasValue: false },
    { key: "reach", label: "Reach", hasValue: true },
    { key: "magic", label: "Magic", hasValue: false },
    { key: "silver", label: "Silver", hasValue: false },
    { key: "primitive", label: "Primitive", hasValue: false },
    { key: "proven", label: "Proven", hasValue: false },
    { key: "reload", label: "Reload", hasValue: true },
    { key: "damaged", label: "Damaged", hasValue: true }
  ],

  /**
   * Structured Qualities (core grid) and extended Traits (multi-select) catalogs.
   *
   * - "Core" are rendered as the responsive checkbox/value grid (2x2 / 3x3, etc.).
   * - "Traits" are rendered as a multi-select list for the long tail of RAW tags.
   *
   * Notes:
   * - These are *additive* to existing schema. They do not remove or rename fields.
   * - Not all traits have automation yet; storing them now unblocks future roll logic.
   */
  QUALITIES_CORE_BY_TYPE: {
    weapon: [
      // Damage-type qualities may optionally carry an (X) value.
      { key: "slashing", label: "Slashing", hasValue: false, optionalValue: true },
      { key: "splitting", label: "Splitting", hasValue: false, optionalValue: true },
      { key: "crushing", label: "Crushing", hasValue: false, optionalValue: true },
      { key: "piercing", label: "Piercing", hasValue: false },
      { key: "reach", label: "Reach", hasValue: true },
      { key: "magic", label: "Magic", hasValue: false },
      { key: "silver", label: "Silver", hasValue: false },
      { key: "primitive", label: "Primitive", hasValue: false },
      { key: "proven", label: "Proven", hasValue: false },
      { key: "reload", label: "Reload", hasValue: true },
      { key: "damaged", label: "Damaged", hasValue: true }
    ],
    armor: [
      // Armor/Shield: do not include weapon-only damage-type toggles.
      { key: "magic", label: "Magic", hasValue: false },
      { key: "silver", label: "Silver", hasValue: false },
      { key: "damaged", label: "Damaged", hasValue: true }
    ],
    ammunition: [
      // Ammunition can contribute damage-type and special flags.
      { key: "slashing", label: "Slashing", hasValue: false, optionalValue: true },
      { key: "splitting", label: "Splitting", hasValue: false, optionalValue: true },
      { key: "magic", label: "Magic", hasValue: false },
      { key: "silver", label: "Silver", hasValue: false },
      { key: "damaged", label: "Damaged", hasValue: true }
    ]
  },

  /**
   * Extended trait tags (multi-select). These are *stored* on the item, but many
   * are not yet used by automation.
   */
  TRAITS_BY_TYPE: {
    weapon: [
      { key: "concealable", label: "Concealable" },
      { key: "concussive", label: "Concussive" },
      { key: "complex", label: "Complex" },
      { key: "dueling", label: "Dueling Weapon" },
      { key: "entangling", label: "Entangling" },
      { key: "exploitWeakness", label: "Exploit Weakness" },
      { key: "flail", label: "Flail" },
      { key: "focus", label: "Focus" },
      { key: "handToHand", label: "Hand-to-Hand" },
      { key: "hooked", label: "Hooked" },
      { key: "impaling", label: "Impaling" },
      { key: "mounted", label: "Mounted" },
      { key: "shieldSplitter", label: "Shield Splitter" },
      { key: "sling", label: "Sling" },
      { key: "small", label: "Small" },
      { key: "snare", label: "Snare" },
      { key: "thrown", label: "Thrown" },
      { key: "unwieldy", label: "Unwieldy" }
    ],
    armor: [
      // Armor-specific tags. Weight-class logic remains driven by weightClass/effectiveWeightClass.
      { key: "shield", label: "Shield" },
      { key: "helmet", label: "Helmet" }
    ],
    ammunition: [
      { key: "bodkin", label: "Bodkin" },
      { key: "barbed", label: "Barbed" },
      { key: "broadhead", label: "Broadhead" }
    ]
  },

  /**
   * Aliases used by migration parsing of legacy rich-text qualities into structured form.
   * Lowercase only.
   */
  QUALITIES_ALIASES: {
    slashing: "slashing",
    splitting: "splitting",
    crushing: "crushing",
    piercing: "piercing",
    magic: "magic",
    silver: "silver",
    "silvered": "silver",
    primitive: "primitive",
    proven: "proven",
    reload: "reload",
    damaged: "damaged"
  },

  DEFAULTS: {
    weapon: {
      attackMode: "melee",
      qualityLevel: "common",
      material: "standard",
      qualitiesStructured: [],
      qualitiesTraits: []
    },
    armor: {
      qualityLevel: "common",
      material: "standard",
      weightClass: "none",
      qualitiesStructured: [],
      qualitiesTraits: []
    },
    ammunition: {
      arrowType: "none",
      ammoMaterial: "standard",
      pricePer10: 0,
      qualitiesStructured: [],
      qualitiesTraits: []
    }
  }
};

export default UESRPG;
