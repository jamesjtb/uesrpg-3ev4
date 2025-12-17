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
    console.log('UESRPG | RAW socket data received:', data);
    
    try {
      await handleSocketEvent(data);
    } catch (error) {
      console.error('UESRPG | Socket handler error:', error);
    }
  });
  
  console.log('UESRPG | Socket listener active for \'system.uesrpg-3ev4\'');
}

/**
 * Handle socket events with validation
 */
async function handleSocketEvent(data) {
  console.log('UESRPG | Processing socket event, type:', data?.type);
  
  if (!data || !data.type) {
    console.warn('UESRPG | Invalid socket data:', data);
    return;
  }

  // Handle opposed roll request
  if (data.type === 'OPPOSED_ROLL_REQUEST') {
    await handleOpposedRollRequest(data);
  } else {
    console.warn('UESRPG | Unknown socket event type:', data.type);
  }
}

/**
 * Handle incoming opposed roll request
 * Shows dialog to defender to prompt for defense roll
 */
async function handleOpposedRollRequest(data) {
  console.log("UESRPG | Handling opposed roll request for actor:", data.defenderActorId);
  
  const {
    attackerActorId,
    attackerName,
    attackerRoll,
    defenderActorId,
    itemName,
    itemImg,
    messageId
  } = data;

  // Get the defender actor with defensive null check
  const defenderActor = game.actors.get(defenderActorId);
  if (!defenderActor) {
    console.error('UESRPG | Target actor not found:', defenderActorId);
    return;
  }
  
  console.log("UESRPG | Target actor found:", defenderActor.name, "| Is owner:", defenderActor.isOwner, "| Is GM:", game.user.isGM);

  // CRITICAL FIX: Allow GM to see dialogs in solo testing
  const canView = defenderActor.isOwner || game.user.isGM;
  if (!canView) {
    console.log("UESRPG | User cannot view dialog for this actor");
    return;
  }
  
  console.log("UESRPG | Showing defender dialog to user");

  // Get opposed message to show attacker info
  const opposedMsg = game.messages.get(messageId);
  if (!opposedMsg) {
    console.error("UESRPG | Opposed message not found:", messageId);
    return;
  }
  
  const opposedData = opposedMsg.flags['uesrpg-3ev4']?.opposedRoll;
  if (!opposedData) {
    console.error("UESRPG | Opposed roll data missing from message");
    return;
  }

  console.log("UESRPG | Creating dialog - Attacker:", attackerName, "Roll:", attackerRoll);

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

  try {
    const dialog = new Dialog({
      title: `Incoming Attack - ${escape(defenderActor.name)}`,
      content: content,
      buttons: {
        defend: {
          icon: '<i class="fas fa-shield-alt"></i>',
          label: 'Open Character Sheet to Defend',
          callback: async () => {
            console.log('UESRPG | User chose to defend');
            // Open the character sheet so they can make a defense roll
            defenderActor.sheet.render(true);
            ui.notifications.info(`Roll your defense! This is an opposed roll against ${attackerName}.`);
          }
        },
        noDefense: {
          icon: '<i class="fas fa-times"></i>',
          label: 'No Defense (Accept Hit)',
          callback: async () => {
            console.log('UESRPG | User chose not to defend');
            
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
                ui.notifications.info('You chose not to defend. Opponent wins by default.');
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
        console.log('UESRPG | Defender dialog closed without action');
      }
    }, {
      width: 400
    });
    
    dialog.render(true);
    console.log('UESRPG | Dialog rendered successfully');
    
  } catch (error) {
    console.error('UESRPG | Error creating/rendering dialog:', error);
    ui.notifications.error('Failed to show defender dialog. Check console for details.');
  }
}

/**
 * Emit an opposed roll request to other clients
 */
export function emitOpposedRollRequest(data) {
  console.log("UESRPG | Emitting opposed roll request:", data);
  
  // Verify game.socket exists
  if (!game.socket) {
    console.error("UESRPG | game.socket is not available!");
    return;
  }
  
  game.socket.emit(SOCKET_NAME, {
    type: 'OPPOSED_ROLL_REQUEST',
    ...data
  });
  
  console.log("UESRPG | Socket emission complete");
}
