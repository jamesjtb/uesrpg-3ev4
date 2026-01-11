import { shouldHideFromMainInventory } from "./sheet-inventory.js";

/**
 * Categorize Actor-owned Items into sheet-ready buckets.
 *
 * This helper is intentionally pure with respect to document data:
 * it only mutates the transient sheet item objects produced by Foundry's sheet data pipeline.
 *
 * @param {object} sheetData The sheet data object returned by ActorSheet#getData
 * @param {object} [options]
 * @param {boolean} [options.includeSkills=false] Whether to collect "skill" items.
 * @param {boolean} [options.includeMagicSkills=false] Whether to collect "magicSkill" items.
 */
export function prepareCharacterItems(sheetData, { includeSkills = false, includeMagicSkills = false } = {}) {
  const actorData = sheetData.actor;

  // Initialize containers
  const gear = { equipped: [], unequipped: [] };
  const weapon = { equipped: [], unequipped: [] };
  const armor = { equipped: [], unequipped: [] };
  const power = [];
  const trait = [];
  const talent = [];
  const combatStyle = [];
  const spell = [];
  const spellsBySchool = Object.create(null); // Use null prototype to avoid conflicts
  const ammunition = { equipped: [], unequipped: [] };
  const language = [];
  const faction = [];
  const container = [];

  // Optional categories (PC sheet only)
  const skill = includeSkills ? [] : null;
  const magicSkill = includeMagicSkills ? [] : null;

  // Iterate through items, allocating to containers
  for (const i of sheetData.items ?? []) {
    // Ensure rendering has an image fallback (safe: sheet-only object)
    i.img = i.img || CONST.DEFAULT_TOKEN;

    // If an item is inside a container, hide it from the main inventory lists.
    // Contained items remain owned by the Actor and are surfaced through the container sheet UI.
    if (shouldHideFromMainInventory(i)) continue;

    if (i.type === "item") {
      i.system?.equipped ? gear.equipped.push(i) : gear.unequipped.push(i);
    } else if (i.type === "weapon") {
      i.system?.equipped ? weapon.equipped.push(i) : weapon.unequipped.push(i);
    } else if (i.type === "armor") {
      i.system?.equipped ? armor.equipped.push(i) : armor.unequipped.push(i);
    } else if (i.type === "power") {
      power.push(i);
    } else if (i.type === "trait") {
      trait.push(i);
    } else if (i.type === "talent") {
      talent.push(i);
    } else if (i.type === "combatStyle") {
      combatStyle.push(i);
    } else if (i.type === "spell") {
      spell.push(i);
    } else if (includeSkills && i.type === "skill") {
      skill.push(i);
    } else if (includeMagicSkills && i.type === "magicSkill") {
      magicSkill.push(i);
    } else if (i.type === "ammunition") {
      i.system?.equipped ? ammunition.equipped.push(i) : ammunition.unequipped.push(i);
    } else if (i.type === "language") {
      language.push(i);
    } else if (i.type === "faction") {
      faction.push(i);
    } else if (i.type === "container") {
      container.push(i);
    }
  }

  // Alphabetically sort all item lists
  if (game.settings.get("uesrpg-3ev4", "sortAlpha")) {
    /** @type {Array<Array<object>>} */
    const itemCats = [
      gear.equipped,
      gear.unequipped,
      weapon.equipped,
      weapon.unequipped,
      armor.equipped,
      armor.unequipped,
      power,
      trait,
      talent,
      combatStyle,
      spell,
      ammunition.equipped,
      ammunition.unequipped,
      language,
      faction,
      container,
    ];

    if (includeSkills) itemCats.push(skill);
    if (includeMagicSkills) itemCats.push(magicSkill);

    for (const category of itemCats) {
      if (!Array.isArray(category) || category.length <= 1) continue;

      // Spells sort by school; everything else by name.
      if (category === spell) {
        category.sort((a, b) => {
          const nameA = a?.system?.school ?? "";
          const nameB = b?.system?.school ?? "";
          if (nameA > nameB) return 1;
          if (nameA < nameB) return -1;
          return 0;
        });
      } else {
        category.sort((a, b) => {
          const nameA = (a?.name ?? "").toLowerCase();
          const nameB = (b?.name ?? "").toLowerCase();
          if (nameA > nameB) return 1;
          if (nameA < nameB) return -1;
          return 0;
        });
      }
    }
  }

  // Group spells by school
  for (const s of spell) {
    const school = String(s?.system?.school ?? "").toLowerCase().trim() || "unknown";
    if (!spellsBySchool[school]) {
      spellsBySchool[school] = [];
    }
    spellsBySchool[school].push(s);
  }

  // Sort spells within each school if sortAlpha enabled
  if (game.settings.get("uesrpg-3ev4", "sortAlpha")) {
    for (const schoolKey in spellsBySchool) {
      spellsBySchool[schoolKey].sort((a, b) => {
        const nameA = (a?.name ?? "").toLowerCase();
        const nameB = (b?.name ?? "").toLowerCase();
        if (nameA > nameB) return 1;
        if (nameA < nameB) return -1;
        return 0;
      });
    }
  }

  // Convert spellsBySchool object to array for proper Handlebars iteration
  const spellSchools = Object.keys(spellsBySchool).map(school => {
    const spells = spellsBySchool[school];
    return {
      key: school,
      label: school.charAt(0).toUpperCase() + school.slice(1),
      spells: spells,
      count: spells.length
    };
  });

  // Assign
  actorData.gear = gear;
  actorData.weapon = weapon;
  actorData.armor = armor;
  actorData.power = power;
  actorData.trait = trait;
  actorData.talent = talent;
  actorData.combatStyle = combatStyle;
  actorData.spell = spell;
  // Store spellsBySchool in ui namespace to avoid conflicts with Foundry's mergeObject
  actorData.ui = actorData.ui || {};
  actorData.ui.spellsBySchool = spellsBySchool;
  actorData.spellSchools = spellSchools; // Array format for template iteration
  actorData.ammunition = ammunition;
  actorData.language = language;
  actorData.faction = faction;
  actorData.container = container;

  if (includeSkills) actorData.skill = skill;
  if (includeMagicSkills) actorData.magicSkill = magicSkill;
}
