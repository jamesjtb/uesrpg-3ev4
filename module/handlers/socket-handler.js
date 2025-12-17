/**
 * Socket Communication Handler for Opposed Rolls
 * Manages socket communication for multi-user opposed rolls
 */

import { OpposedRollHandler } from '../combat/opposed-handler.js';

const SOCKET_NAME = 'system.uesrpg-3ev4';

/**
 * Register socket listeners for opposed rolls
 */
export function registerSocketListeners() {
  console.log('UESRPG | Registering opposed roll socket listeners');

  game.socket.on(SOCKET_NAME, async (data) => {
    if (!data || !data.type) return;

    // Handle opposed roll request
    if (data.type === 'OPPOSED_ROLL_REQUEST') {
      await handleOpposedRollRequest(data);
    }
  });
}

/**
 * Handle incoming opposed roll request
 * Shows dialog to defender to prompt for defense roll
 */
async function handleOpposedRollRequest(data) {
  console.log("UESRPG | Received opposed roll request:", data);
  
  const {
    attackerActorId,
    attackerName,
    attackerRoll,
    defenderActorId,
    itemName,
    itemImg,
    messageId
  } = data;

  // Get the defender actor
  const defenderActor = game.actors.get(defenderActorId);
  if (!defenderActor) {
    console.warn('UESRPG | Cannot find defender actor for opposed roll');
    return;
  }
  
  console.log("UESRPG | Target actor:", defenderActor.name, "Is owner:", defenderActor?.isOwner, "Is GM:", game.user.isGM);

  // Show to users who own the defending actor OR to GMs (for solo testing)
  const canView = defenderActor.isOwner || game.user.isGM;
  if (!canView) {
    return;
  }

  // Show dialog to defender
  await showDefenderDialog({
    attackerName,
    attackerRoll,
    defenderActor,
    itemName,
    itemImg,
    messageId
  });
}

/**
 * Show dialog to defender prompting for defense
 */
async function showDefenderDialog({ 
  attackerName, 
  attackerRoll, 
  defenderActor, 
  itemName, 
  itemImg,
  messageId 
}) {
  // Use Foundry's built-in HTML escaping
  const escape = foundry.utils.escapeHTML;
  
  const content = `
    <div class="uesrpg-opposed-defense-dialog">
      <div style="text-align: center; margin-bottom: 10px;">
        <img src="${escape(itemImg)}" style="border: none; max-width: 64px; max-height: 64px;" />
      </div>
      <p><strong>${escape(attackerName)}</strong> is attacking you with <strong>${escape(itemName)}</strong>!</p>
      <p><strong>Attacker's Roll:</strong> ${escape(String(attackerRoll))}</p>
      <p>Choose a defense roll from your character sheet, or the attack will succeed by default in 60 seconds.</p>
      <p><em>Tip: Use Evade, Block, or another appropriate defense skill.</em></p>
    </div>
  `;

  new Dialog({
    title: `Incoming Attack - ${escape(defenderActor.name)}`,
    content: content,
    buttons: {
      defend: {
        icon: '<i class="fas fa-shield-alt"></i>',
        label: 'Open Character Sheet to Defend',
        callback: async () => {
          // Open the character sheet so they can make a defense roll
          defenderActor.sheet.render(true);
        }
      },
      noDefense: {
        icon: '<i class="fas fa-times"></i>',
        label: 'No Defense (Accept Hit)',
        callback: async () => {
          // Retrieve the opposed message and resolve it as unopposed
          const opposedMessage = game.messages.get(messageId);
          if (opposedMessage) {
            const handler = await OpposedRollHandler.fromMessage(opposedMessage);
            if (handler) {
              // Clear the timeout first
              if (handler.timeoutId) {
                clearTimeout(handler.timeoutId);
                handler.timeoutId = null;
              }
              // Resolve as unopposed (defender chose not to defend)
              await handler.resolveUnopposed();
            }
          } else {
            // Fallback: just clear the flag
            await defenderActor.unsetFlag('uesrpg-3ev4', 'opposedMessageId');
          }
        }
      }
    },
    default: 'defend',
    close: () => {
      // If they close the dialog, they can still defend via the sheet
      console.log('UESRPG | Defender closed dialog');
    }
  }).render(true);
}

/**
 * Emit an opposed roll request to other clients
 */
export function emitOpposedRollRequest(data) {
  console.log("UESRPG | Emitting opposed roll request:", data);
  game.socket.emit(SOCKET_NAME, {
    type: 'OPPOSED_ROLL_REQUEST',
    ...data
  });
}
