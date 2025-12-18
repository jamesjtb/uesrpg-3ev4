export const UESRPG = {};

UESRPG.languages = {
  "aldmeri": "Aldmeri",
  "ayleidoon": "Ayleidoon",
  "bosmeri": "Bosmeri",
  "cyrodilic": "Cyrodilic",
  "daedric": "Daedric",
  "dovah": "Dovah",
  "dunmeri": "Dunmeri",
  "dwemeris": "Dwemeris",
  "falmer": "Falmer",
  "jel": "Jel",
  "nordic": "Nordic",
  "taagra": "Ta'Agra",
  "yoku": "Yoku"
};

/**
 * Armor hit-location categories for Armor Items.
 * Keys MUST match:
 * - template.json armor item system.category expected values
 * - actor.js bucketing keys (head/body/l_arm/r_arm/l_leg/r_leg/shield)
 * - armor-sheet.html location selector options
 */
UESRPG.armorItemCat = {
  head: "Head",
  body: "Body",
  r_arm: "Right Arm",
  l_arm: "Left Arm",
  r_leg: "Right Leg",
  l_leg: "Left Leg",
  shield: "Shield"
};

UESRPG.characteristicAbbr = {
  str: "Strength",
  end: "Endurance",
  agi: "Agility",
  int: "Intelligence",
  wp: "Willpower",
  prc: "Perception",
  prs: "Personality",
  lck: "Luck"
};

export const systemRootPath = "systems/uesrpg-3ev4/";
