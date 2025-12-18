/**
 * Migration:  Convert legacy NPC actors to unified Character type
 * 
 * This migration: 
 * 1. Changes NPC type to 'character'
 * 2. Sets isNPC flag to true
 * 3. Preserves all existing data
 * 4. Adds migration flag to prevent re-migration
 * 
 * @param {Actor} actor - The actor to migrate
 */
export async function migrateNPCToCharacter(actor) {
  try {
    // Safety check:  Skip if already migrated
    if (actor.type !== 'NPC') {
      console.log(`UESRPG | Skipping ${actor.name} - already a ${actor.type}`);
      return;
    }

    // Safety check: Skip if already has migration flag
    if (actor.getFlag('uesrpg-3ev4', 'migratedFromNPC')) {
      console.log(`UESRPG | Skipping ${actor.name} - already migrated`);
      return;
    }

    console.log(`UESRPG | Migrating NPC to Character:  ${actor.name}`);
    
    // Step 1: Change type to character with isNPC flag
    // Use recursive: false to allow type changes
    await actor.update({
      type: 'character',
      'system.isNPC':  true
    }, { 
      recursive:  false,  // Required for Document type changes
      diff: false,       // Skip differential updates for type changes
      render: false      // Don't render until migration complete
    });
    
    // Step 2: Mark as migrated to prevent re-migration
    await actor.setFlag('uesrpg-3ev4', 'migratedFromNPC', true);
    
    console.log(`UESRPG | ✓ Successfully migrated ${actor.name} to unified character type`);
    
  } catch (error) {
    console.error(`UESRPG | ✗ Failed to migrate ${actor. name}:`, error);
    ui.notifications.error(`Failed to migrate NPC "${actor.name}".  See console for details.`);
    // Don't throw - allow migration to continue with other actors
  }
}

/**
 * Run the NPC to Character migration on all NPC actors in the world
 * Called from migrations.js during system initialization
 */
export async function runNPCToCharacterMigration() {
  console.log('UESRPG | Starting NPC to Character migration...');
  
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Get all NPC actors (both in world and in compendia)
  const npcActors = game.actors.filter(actor => actor.type === 'NPC');
  
  if (npcActors.length === 0) {
    console.log('UESRPG | No NPCs found to migrate');
    return;
  }

  console.log(`UESRPG | Found ${npcActors.length} NPC(s) to migrate`);

  // Migrate each NPC
  for (const actor of npcActors) {
    const initialType = actor.type;
    await migrateNPCToCharacter(actor);
    
    // Check if migration succeeded
    if (actor.type === 'character' && actor.system?. isNPC) {
      migratedCount++;
    } else if (actor.type === 'NPC') {
      // Migration didn't happen (likely already migrated or error)
      if (actor.getFlag('uesrpg-3ev4', 'migratedFromNPC')) {
        skippedCount++;
      } else {
        errorCount++;
      }
    }
  }

  // Report results
  console.log(`UESRPG | Migration npcToCharacter complete:`);
  console.log(`  ✓ Migrated:  ${migratedCount}`);
  console.log(`  ⊘ Skipped: ${skippedCount}`);
  console.log(`  ✗ Errors: ${errorCount}`);

  if (migratedCount > 0) {
    ui.notifications.info(`Migrated ${migratedCount} NPC(s) to unified character type`);
  }
}
