/**
 * Migration: Convert NPC actors to Player Character type with isNPC flag
 * 
 * This migration unifies the actor system by:
 * 1. Converting all NPC actors to Player Character type
 * 2. Setting isNPC: true flag
 * 3. Converting profession percentages to skill-based system
 * 4. Preserving all existing data (characteristics, items, etc.)
 */

const NS = "uesrpg-3ev4";

// Constants for rank calculation
const MIN_RANK = 0;
const MAX_RANK = 5;
const RANK_MULTIPLIER = 10;

export async function migrateNPCToCharacter() {
  const actors = game.actors?.contents ?? [];
  let migrated = 0;

  for (const actor of actors) {
    // Only migrate NPC type actors
    if (actor.type !== "NPC") continue;

    // Check if already migrated
    if (actor.getFlag(NS, "migrations.npcToCharacter")) continue;

    console.log(`UESRPG | Migrating NPC to Character: ${actor.name}`);

    try {
      // Build the update data
      const updateData = {
        type: "Player Character",
        "system.isNPC": true,
        [`flags.${NS}.migrations.npcToCharacter`]: true
      };

      // Convert profession percentages to combat style skills
      // The profession system will be preserved but combat styles will use proper skill ranks
      const professions = actor.system?.professions ?? {};
      
      // For each profession, if it's using the new hybrid format with auto=false,
      // calculate the proper rank from the percentage value
      for (const [profKey, profData] of Object.entries(professions)) {
        if (typeof profData === 'object' && profData !== null && !profData.auto) {
          const govCharKey = (profData.governingCha || 'str').toLowerCase();
          const charScore = actor.system.characteristics?.[govCharKey]?.total || 0;
          const profValue = profData.value || 0;
          
          // Calculate rank: (profession% - characteristic) / 10, clamped to 0-5
          const calculatedRank = Math.max(MIN_RANK, Math.min(MAX_RANK, Math.floor((profValue - charScore) / RANK_MULTIPLIER)));
          
          updateData[`system.professions.${profKey}.rank`] = calculatedRank;
          updateData[`system.professions.${profKey}.auto`] = true; // Enable auto-calculation going forward
        }
      }

      // Perform the migration update
      await actor.update(updateData);
      
      // Set the preferred sheet to npcSheet for this actor
      await actor.setFlag("core", "sheetClass", "uesrpg-3ev4.npcSheet");
      
      migrated++;

      console.log(`UESRPG | Successfully migrated ${actor.name} to unified character type`);
    } catch (error) {
      console.error(`UESRPG | Failed to migrate NPC ${actor.name}:`, error);
    }
  }

  console.log(`UESRPG | Migration npcToCharacter: ${migrated} NPC(s) converted to Character type`);
}
