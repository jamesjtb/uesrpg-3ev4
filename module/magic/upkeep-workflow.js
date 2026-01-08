/**
 * module/magic/upkeep-workflow.js
 *
 * Spell upkeep system for UESRPG 3ev4.
 * Monitors spell effects with Upkeep attribute and prompts the caster
 * to refresh them before expiration.
 */

/**
 * Initialize upkeep system hooks
 */
export function initializeUpkeepSystem() {
  console.log("UESRPG | Initializing Spell Upkeep System");
  
  // Monitor world time updates (real-time play)
  Hooks.on("updateWorldTime", async (worldTime, dt) => {
    // Check all actors for expiring upkeep spells
    for (const actor of game.actors) {
      await checkUpkeepSpells(actor);
    }
  });
  
  // Monitor combat round updates (combat play)
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!("round" in changed)) return;
    
    // Check all combatants for expiring upkeep spells
    for (const combatant of combat.combatants) {
      if (combatant.actor) {
        await checkUpkeepSpells(combatant.actor);
      }
    }
  });
  
  // Bind chat message listeners for upkeep buttons
  Hooks.on("renderChatMessage", (message, html) => {
    html.find(".upkeep-confirm").click(async (ev) => {
      const parent = ev.currentTarget.closest(".uesrpg-upkeep-buttons");
      await handleUpkeepConfirm(
        parent.dataset.effectId,
        parent.dataset.actorId,
        Number(parent.dataset.upkeepCost)
      );
      ev.currentTarget.disabled = true;
    });
    
    html.find(".upkeep-cancel").click(async (ev) => {
      const parent = ev.currentTarget.closest(".uesrpg-upkeep-buttons");
      await handleUpkeepCancel(
        parent.dataset.effectId,
        parent.dataset.actorId
      );
      ev.currentTarget.disabled = true;
    });
  });
}

/**
 * Check actor for spells about to expire that have Upkeep
 * @param {Actor} actor - The actor to check
 */
async function checkUpkeepSpells(actor) {
  const effects = actor.effects.filter(e => {
    const flags = e.flags["uesrpg-3ev4"];
    if (!flags?.spellEffect || !flags?.hasUpkeep) return false;
    
    // Check if expiring this round
    const duration = e.duration;
    if (!duration) return false;
    
    const currentRound = game.combat?.round ?? 0;
    const endRound = (duration.startRound ?? 0) + (duration.rounds ?? 0);
    
    // Prompt one round before expiration
    return currentRound >= endRound - 1 && currentRound < endRound;
  });
  
  for (const effect of effects) {
    await promptUpkeep(actor, effect);
  }
}

/**
 * Show upkeep prompt chat card
 * @param {Actor} actor - The actor with the spell effect
 * @param {ActiveEffect} effect - The spell effect to upkeep
 */
async function promptUpkeep(actor, effect) {
  const flags = effect.flags["uesrpg-3ev4"];
  const spell = await fromUuid(flags.spellUuid);
  const upkeepCost = flags.upkeepCost || spell?.system?.cost || 0;
  
  const currentMP = Number(actor.system?.magicka?.value ?? 0);
  const canAfford = currentMP >= upkeepCost;
  
  const content = `
    <div class="uesrpg-upkeep-prompt">
      <h3>🔮 Spell Upkeep Required</h3>
      <p><b>Actor:</b> ${actor.name}</p>
      <p><b>Spell:</b> ${spell?.name || effect.name}</p>
      <p><b>Upkeep Cost:</b> ${upkeepCost} MP</p>
      <p><b>Current MP:</b> ${currentMP} MP</p>
      ${!canAfford ? '<p style="color:red;"><b>⚠️ Insufficient Magicka!</b></p>' : ''}
    </div>
    <div class="uesrpg-upkeep-buttons" data-effect-id="${effect.id}" data-actor-id="${actor.id}" data-upkeep-cost="${upkeepCost}">
      <button type="button" class="upkeep-confirm" ${!canAfford ? 'disabled' : ''}>Upkeep (Pay ${upkeepCost} MP)</button>
      <button type="button" class="upkeep-cancel">End Spell</button>
    </div>
  `;
  
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      "uesrpg-3ev4": {
        upkeepPrompt: true,
        effectId: effect.id,
        actorId: actor.id
      }
    }
  });
}

/**
 * Handle upkeep confirmation
 * @param {string} effectId - The effect ID
 * @param {string} actorId - The actor ID
 * @param {number} upkeepCost - The MP cost to upkeep
 */
export async function handleUpkeepConfirm(effectId, actorId, upkeepCost) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  
  const effect = actor.effects.get(effectId);
  if (!effect) return;
  
  // Deduct MP
  const currentMP = Number(actor.system?.magicka?.value ?? 0);
  const newMP = Math.max(0, currentMP - upkeepCost);
  await actor.update({ "system.magicka.value": newMP });
  
  // Refresh duration
  const currentRound = game.combat?.round ?? 0;
  const duration = effect.duration;
  
  await effect.update({
    "duration.startRound": currentRound,
    "duration.startTime": game.time.worldTime
  });
  
  ui.notifications.info(`${effect.name} upkept for ${duration.rounds} more rounds.`);
}

/**
 * Handle upkeep cancellation
 * @param {string} effectId - The effect ID
 * @param {string} actorId - The actor ID
 */
export async function handleUpkeepCancel(effectId, actorId) {
  const actor = game.actors.get(actorId);
  if (!actor) return;
  
  const effect = actor.effects.get(effectId);
  if (!effect) return;
  
  await effect.delete();
  ui.notifications.info(`${effect.name} ended.`);
}
