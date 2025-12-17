/**
 * OpposedRollHandler - Manages lifecycle of opposed rolls between attacker and defender
 * Based on working d100 systems (WFRP4e, BRP, AoV)
 */

const SOCKET_NAME = 'system.uesrpg-3ev4';
const OPPOSED_TIMEOUT = 60000; // 60 seconds

export class OpposedRollHandler {
  constructor({ 
    attackerActor, 
    attackerRoll, 
    attackerItem,
    defenderActor,
    defenderToken
  }) {
    this.attackerActor = attackerActor;
    this.attackerRoll = attackerRoll;
    this.attackerItem = attackerItem;
    this.defenderActor = defenderActor;
    this.defenderToken = defenderToken;
    this.attackerMessage = null;
    this.defenderMessage = null;
    this.timeoutId = null;
    this.state = 'waiting';
  }

  /**
   * Initialize the opposed roll - creates initial message and flags defender
   */
  async createOpposedMessage() {
    const templateData = {
      attackerName: this.attackerActor.name,
      attackerImg: this.attackerActor.img,
      defenderName: this.defenderActor.name,
      defenderImg: this.defenderActor.img,
      attackerRoll: this.attackerRoll.total,
      itemName: this.attackerItem?.name || "Attack",
      itemImg: this.attackerItem?.img || this.attackerActor.img,
      state: 'waiting'
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/uesrpg-3ev4/templates/chat/opposed-start.html',
      templateData
    );

    const messageData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.attackerActor }),
      content: content,
      rolls: [this.attackerRoll],
      flags: {
        'uesrpg-3ev4': {
          opposedRoll: {
            attackerActorId: this.attackerActor.id,
            defenderActorId: this.defenderActor.id,
            defenderTokenId: this.defenderToken?.id,
            attackerRoll: this.attackerRoll.total,
            attackerItemId: this.attackerItem?.id,
            state: 'waiting',
            timestamp: Date.now()
          }
        }
      }
    };

    this.attackerMessage = await ChatMessage.create(messageData);

    // Flag the defender actor with the opposed message ID
    await this.defenderActor.setFlag('uesrpg-3ev4', 'opposedMessageId', this.attackerMessage.id);
    
    // Set timeout for auto-resolution
    this.setTimeout(OPPOSED_TIMEOUT);

    return this.attackerMessage;
  }

  /**
   * Link defender's roll and compute result
   */
  async setDefender(defenderMessage) {
    console.log("UESRPG | OpposedRollHandler.setDefender called", {
      state: this.state,
      defenderMessage: defenderMessage
    });
    
    if (this.state !== 'waiting') {
      console.warn('OpposedRollHandler: Cannot set defender, state is not waiting');
      return;
    }

    this.defenderMessage = defenderMessage;
    
    // Clear timeout since defender responded
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Compute result
    await this.computeResult();

    // Clean up flags
    await this.cleanup();
  }

  /**
   * Compare rolls and determine winner
   * In d100 systems: higher roll wins if both succeed, or only succeeder wins
   */
  async computeResult() {
    const attackRoll = this.attackerRoll.total;
    
    // Support both message.roll.total and message.rolls[0].total patterns
    let defendRoll = 0;
    if (this.defenderMessage) {
      if (this.defenderMessage.roll?.total !== undefined) {
        defendRoll = this.defenderMessage.roll.total;
      } else if (this.defenderMessage.rolls?.[0]?.total !== undefined) {
        defendRoll = this.defenderMessage.rolls[0].total;
      }
    }
    
    // Add null check with error logging
    if (!attackRoll && attackRoll !== 0) {
      console.error("UESRPG | Opposed roll missing attacker roll data", {
        attacker: this.attackerMessage,
        attackerRoll: this.attackerRoll
      });
      return;
    }
    
    if (!defendRoll && defendRoll !== 0) {
      console.error("UESRPG | Opposed roll missing defender roll data", {
        defender: this.defenderMessage
      });
      return;
    }

    // Determine winner - higher roll wins in this d100 system
    let winner;
    let margin = Math.abs(attackRoll - defendRoll);
    
    if (attackRoll > defendRoll) {
      winner = 'attacker';
    } else if (defendRoll > attackRoll) {
      winner = 'defender';
    } else {
      winner = 'tie';
    }

    const templateData = {
      attackerName: this.attackerActor.name,
      attackerImg: this.attackerActor.img,
      defenderName: this.defenderActor.name,
      defenderImg: this.defenderActor.img,
      attackerRoll: attackRoll,
      defenderRoll: defendRoll,
      itemName: this.attackerItem?.name || "Attack",
      itemImg: this.attackerItem?.img || this.attackerActor.img,
      winner: winner,
      margin: margin,
      state: 'complete'
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/uesrpg-3ev4/templates/chat/opposed-result.html',
      templateData
    );

    // Update the original message
    await this.attackerMessage.update({
      content: content,
      'flags.uesrpg-3ev4.opposedRoll.state': 'complete',
      'flags.uesrpg-3ev4.opposedRoll.defenderRoll': defendRoll,
      'flags.uesrpg-3ev4.opposedRoll.defenderMessageId': this.defenderMessage?.id,
      'flags.uesrpg-3ev4.opposedRoll.winner': winner,
      'flags.uesrpg-3ev4.opposedRoll.margin': margin
    });

    this.state = 'complete';
  }

  /**
   * Set timeout for auto-resolution
   */
  setTimeout(duration) {
    this.timeoutId = setTimeout(async () => {
      if (this.state === 'waiting') {
        await this.resolveUnopposed();
      }
    }, duration);
  }

  /**
   * Handle timeout case - resolve as unopposed
   */
  async resolveUnopposed() {
    // Double-check state to prevent race conditions
    if (this.state !== 'waiting') {
      console.log('OpposedRollHandler: resolveUnopposed called but state is not waiting, skipping');
      return;
    }

    // Set state immediately to prevent concurrent execution
    this.state = 'resolving';

    const templateData = {
      attackerName: this.attackerActor.name,
      attackerImg: this.attackerActor.img,
      defenderName: this.defenderActor.name,
      defenderImg: this.defenderActor.img,
      attackerRoll: this.attackerRoll.total,
      itemName: this.attackerItem?.name || "Attack",
      itemImg: this.attackerItem?.img || this.attackerActor.img,
      state: 'unopposed'
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/uesrpg-3ev4/templates/chat/opposed-unopposed.html',
      templateData
    );

    await this.attackerMessage.update({
      content: content,
      'flags.uesrpg-3ev4.opposedRoll.state': 'unopposed'
    });

    this.state = 'unopposed';

    // Clean up flags
    await this.cleanup();
  }

  /**
   * Clean up actor flags after resolution
   */
  async cleanup() {
    try {
      await this.defenderActor.unsetFlag('uesrpg-3ev4', 'opposedMessageId');
    } catch (e) {
      console.error('OpposedRollHandler: Error cleaning up flags for actor', this.defenderActor.id, e);
      // Don't throw - we want cleanup to be best-effort
    }
  }

  /**
   * Static helper to check if an actor has a pending opposed roll
   */
  static async getOpposedMessageId(actor) {
    return await actor.getFlag('uesrpg-3ev4', 'opposedMessageId');
  }

  /**
   * Static helper to retrieve an opposed roll handler from a message
   */
  static async fromMessage(message) {
    const flags = message.flags?.['uesrpg-3ev4']?.opposedRoll;
    if (!flags) return null;

    const attackerActor = game.actors.get(flags.attackerActorId);
    const defenderActor = game.actors.get(flags.defenderActorId);
    
    if (!attackerActor || !defenderActor) return null;

    const attackerItem = flags.attackerItemId ? 
      attackerActor.items.get(flags.attackerItemId) : null;

    // Try to retrieve the defender token if ID is stored
    let defenderToken = null;
    if (flags.defenderTokenId) {
      // Search all tokens in the current scene
      const scene = game.scenes?.active;
      if (scene) {
        defenderToken = scene.tokens.get(flags.defenderTokenId);
      }
    }

    // Reconstruct the handler (note: this won't have the original roll object)
    const handler = new OpposedRollHandler({
      attackerActor,
      attackerRoll: message.rolls?.[0],
      attackerItem,
      defenderActor,
      defenderToken
    });

    handler.attackerMessage = message;
    handler.state = flags.state || 'waiting';

    return handler;
  }
}
