/**
 * module/magic/spell-effects.js
 *
 * Spell effect application with RAW stacking rules.
 * Chapter 6 p.128 lines 234-241: Effects don't stack with themselves,
 * and opposing effects override each other.
 */

/**
 * Apply a spell effect to a target actor
 * Respects RAW stacking rules:
 *  - Effects don't stack with themselves
 *  - Opposing effects (e.g., Frenzy vs Calm) override each other
 *
 * @param {Actor} target - The target actor
 * @param {Item} spell - The spell being applied
 * @param {object} options - Additional options (duration, isCritical, etc.)
 * @returns {Promise<void>}
 */
export async function applySpellEffect(target, spell, options = {}) {
  // Extract spell effect data from the spell
  const changes = extractSpellChanges(spell);
  
  // If no changes to apply, exit early
  if (!changes || changes.length === 0) {
    console.log(`UESRPG | No effect changes found for spell: ${spell.name}`);
    return;
  }
  
  const effectData = {
    name: spell.name,
    icon: spell.img,
    origin: spell.uuid,
    disabled: false,
    duration: computeSpellDuration(spell, options),
    changes,
    flags: {
      "uesrpg-3ev4": {
        spellEffect: true,
        spellUuid: spell.uuid,
        spellSchool: spell.system?.school ?? "",
        canStack: false // RAW: effects don't stack with themselves
      }
    }
  };
  
  // Remove opposing effects first (e.g., Frenzy vs Calm)
  await removeOpposingEffects(target, spell);
  
  // Remove duplicate effects from same spell (no stacking)
  const existing = target.effects.find(e => 
    e.flags["uesrpg-3ev4"]?.spellUuid === spell.uuid
  );
  
  if (existing) {
    await existing.delete();
  }
  
  // Create new effect
  await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
  
  ui.notifications.info(`${spell.name} applied to ${target.name}`);
}

/**
 * Remove opposing spell effects
 * E.g., Frenzy removes Calm, and vice versa
 *
 * @param {Actor} target - The target actor
 * @param {Item} spell - The spell being cast
 * @returns {Promise<void>}
 */
async function removeOpposingEffects(target, spell) {
  // Define opposing spell pairs
  const opposingPairs = {
    "frenzy": "calm",
    "calm": "frenzy",
    "light": "darkness",
    "darkness": "light",
    "courage": "fear",
    "fear": "courage"
    // Add more opposing pairs as needed
  };
  
  const spellNameNormalized = String(spell.name ?? "").toLowerCase().trim();
  const opposingName = opposingPairs[spellNameNormalized];
  
  if (!opposingName) return;
  
  // Find and remove opposing effects
  const toRemove = target.effects.filter(e => {
    const effectIsSpell = e.flags?.["uesrpg-3ev4"]?.spellEffect === true;
    const effectName = String(e.name ?? "").toLowerCase().trim();
    return effectIsSpell && effectName === opposingName;
  });
  
  if (toRemove.length > 0) {
    await target.deleteEmbeddedDocuments("ActiveEffect", toRemove.map(e => e.id));
    ui.notifications.info(`${spell.name} overrode ${toRemove.length} opposing effect(s)`);
  }
}

/**
 * Compute spell duration
 * For now, returns a simple duration structure
 * TODO: Parse spell.system.attributes for duration keywords
 *
 * @param {Item} spell - The spell
 * @param {object} options - Additional options
 * @returns {object} - Duration object for ActiveEffect
 */
function computeSpellDuration(spell, options = {}) {
  // Default: no duration (indefinite until dispelled)
  const duration = {
    rounds: undefined,
    seconds: undefined,
    turns: undefined
  };
  
  // Parse attributes for duration hints
  const attributes = String(spell.system?.attributes ?? "").toLowerCase();
  
  // Check for "instant" keyword - effect lasts 0 rounds
  if (attributes.includes("instant")) {
    duration.rounds = 0;
  }
  
  // Check for round-based duration (e.g., "3 rounds")
  const roundMatch = attributes.match(/(\d+)\s*round/i);
  if (roundMatch) {
    duration.rounds = Number(roundMatch[1]);
  }
  
  // Check for turn-based duration (e.g., "5 turns")
  const turnMatch = attributes.match(/(\d+)\s*turn/i);
  if (turnMatch) {
    duration.turns = Number(turnMatch[1]);
  }
  
  // Check for minute-based duration (e.g., "10 minutes")
  const minuteMatch = attributes.match(/(\d+)\s*minute/i);
  if (minuteMatch) {
    duration.seconds = Number(minuteMatch[1]) * 60;
  }
  
  return duration;
}

/**
 * Extract Active Effect changes from a spell
 * This is a placeholder - actual implementation depends on how spell effects are stored
 *
 * @param {Item} spell - The spell
 * @returns {Array} - Array of change objects for ActiveEffect
 */
function extractSpellChanges(spell) {
  // For now, return empty array
  // Future implementation should parse spell.system.attributes or spell effects
  // to generate appropriate Active Effect changes
  
  // Example structure:
  // return [
  //   { key: "system.characteristics.str.total", mode: 2, value: "+10" },
  //   { key: "system.movement.base", mode: 2, value: "+2" }
  // ];
  
  return [];
}
