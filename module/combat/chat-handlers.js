/**
 * module/combat/chat-handlers.js
 * Chat message handlers for combat automation
 * Handles "Apply Damage" button clicks and other combat-related chat interactions
 */

import { applyDamage, applyHealing } from './damage-automation.js';

/**
 * Initialize chat listeners for combat automation
 */
export function initializeChatHandlers() {
  // Listen for chat message renders to add click handlers
  Hooks.on('renderChatMessage', (message, html, data) => {
    // Add handler for "Apply Damage" buttons
    html.find('.apply-damage-btn').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      
      const actorId = button.dataset.actorId;
      const damage = Number(button.dataset.damage);
      const damageType = button.dataset.type || 'physical';
      const hitLocation = button.dataset.location || 'Body';
      
      const actor = game.actors.get(actorId);
      if (!actor) {
        ui.notifications.error("Actor not found");
        return;
      }
      
      // Get source from chat message speaker
      const speaker = message.speaker;
      const sourceActor = game.actors.get(speaker.actor);
      const source = sourceActor?.name || "Unknown";
      
      // Apply damage directly (already calculated with reductions)
      await applyDamage(actor, damage, damageType, {
        ignoreReduction: true, // Damage was already reduced
        source: source,
        hitLocation: hitLocation
      });
      
      // Disable the button after use
      button.disabled = true;
      button.textContent = "Damage Applied";
      button.style.opacity = "0.5";
    });

    // Add handler for "Apply Healing" buttons (for future use)
    html.find('.apply-healing-btn').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      
      const actorId = button.dataset.actorId;
      const healing = Number(button.dataset.healing);
      
      const actor = game.actors.get(actorId);
      if (!actor) {
        ui.notifications.error("Actor not found");
        return;
      }
      
      const speaker = message.speaker;
      const sourceActor = game.actors.get(speaker.actor);
      const source = sourceActor?.name || "Healing";
      
      await applyHealing(actor, healing, { source });
      
      button.disabled = true;
      button.textContent = "Healing Applied";
      button.style.opacity = "0.5";
    });
  });
}

/**
 * Register hooks for chat-based combat automation
 */
export function registerCombatChatHooks() {
  // Hook to add context menu options to chat messages with damage info
  Hooks.on('getChatLogEntryContext', (html, options) => {
    options.push({
      name: "Apply Damage to Target",
      icon: '<i class="fas fa-heart-broken"></i>',
      condition: li => {
        const message = game.messages.get(li.data("messageId"));
        return message?.flags?.['uesrpg-3ev4']?.damageInfo;
      },
      callback: async li => {
        const message = game.messages.get(li.data("messageId"));
        const damageInfo = message?.flags?.['uesrpg-3ev4']?.damageInfo;
        const defenderId = message?.flags?.['uesrpg-3ev4']?.defenderId;
        
        if (!damageInfo || !defenderId) {
          ui.notifications.error("No damage information found");
          return;
        }
        
        const defender = game.actors.get(defenderId);
        if (!defender) {
          ui.notifications.error("Defender not found");
          return;
        }
        
        await applyDamage(defender, damageInfo.rawDamage, damageInfo.damageType, {
          dosBonus: damageInfo.dosBonus,
          source: message.speaker?.alias || "Attack",
          hitLocation: damageInfo.hitLocation
        });
      }
    });
  });
}
