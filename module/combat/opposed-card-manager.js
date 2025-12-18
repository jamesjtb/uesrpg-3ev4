/**
 * Manages BRP-style manual opposed roll cards
 * Phase 1: Manual participation, GM-triggered resolution
 */
export class OpposedCardManager {
  
  /**
   * Create a new opposed test card
   * @param {Actor} initiator - Actor starting the opposed test
   * @param {Item} skill - Combat style or skill being used
   * @param {Array<Token>} targets - Targeted tokens (optional)
   */
  static async createCard(initiator, skill, targets = []) {
    const participants = [{
      particId: initiator.id,
      particName: initiator.name,
      particImg: initiator.img,
      skillId: skill.id,
      skillLabel: skill.name,
      targetNumber: skill.system.value || 0,
      rolled: false,
      rollResult: null,
      success: null
    }];

    // Pre-add targets as participants (they haven't rolled yet)
    for (const token of targets) {
      participants.push({
        particId: token.actor.id,
        particName: token.actor.name,
        particImg: token.actor.img,
        skillId: null,
        skillLabel: "Defense",
        targetNumber: 0,
        rolled: false,
        rollResult: null,
        success: null
      });
    }

    const templateData = {
      participants,
      state: 'open',
      isGM: game.user.isGM,
      isResolved: false
    };

    const content = await renderTemplate(
      'systems/uesrpg-3ev4/templates/chat/opposed-card.html',
      templateData
    );

    const messageData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: initiator }),
      content,
      flags: {
        'uesrpg-3ev4': {
          opposedCard: {
            participants,
            state: 'open',
            initiatorId: initiator.id,
            timestamp: Date.now()
          }
        }
      }
    };

    const message = await ChatMessage.create(messageData);
    
    // Flag participants that they have a pending opposed card
    for (const p of participants) {
      const actor = game.actors.get(p.particId);
      if (actor) {
        await actor.setFlag('uesrpg-3ev4', 'pendingOpposedCard', message.id);
      }
    }

    return message;
  }

  /**
   * Add a roll to an existing opposed card
   * @param {string} messageId - Chat message ID of the card
   * @param {Actor} actor - Actor making the roll
   * @param {Roll} roll - The roll result
   * @param {Item} skill - Skill/Combat style used
   */
  static async addRoll(messageId, actor, roll, skill) {
    const message = game.messages.get(messageId);
    if (!message) {
      ui.notifications.error("Opposed card not found");
      return;
    }

    const cardData = message.flags['uesrpg-3ev4'].opposedCard;
    if (cardData.state !== 'open') {
      ui.notifications.warn("This opposed test is already closed");
      return;
    }

    // Find participant or add new one
    let participant = cardData.participants.find(p => p.particId === actor.id);
    
    if (!participant) {
      // Add as new participant
      participant = {
        particId: actor.id,
        particName: actor.name,
        particImg: actor.img,
        skillId: skill.id,
        skillLabel: skill.name,
        targetNumber: skill.system.value || 0,
        rolled: false,
        rollResult: null,
        success: null
      };
      cardData.participants.push(participant);
    }

    // Update participant's roll
    participant.rolled = true;
    participant.rollResult = roll.total;
    participant.skillId = skill.id;
    participant.skillLabel = skill.name;
    participant.targetNumber = skill.system.value || 0;
    participant.success = roll.total <= participant.targetNumber;

    // Re-render card
    await this._updateCard(message, cardData);
    
    // Clear pending flag
    await actor.unsetFlag('uesrpg-3ev4', 'pendingOpposedCard');
  }

  /**
   * Add a test to an existing opposed card
   * Handles both combat style tests and weapon tests
   */
  static async addTest(messageId, test) {
    const message = game.messages.get(messageId);
    if (!message) {
      ui.notifications.error("Opposed card not found");
      return;
    }

    const cardData = message.flags['uesrpg-3ev4'].opposedCard;
    if (cardData.state !== 'open') {
      ui.notifications.warn("This opposed test is already closed");
      return;
    }

    // Find participant or add new one
    let participant = cardData.participants.find(p => p.particId === test.actor.id);
    
    if (!participant) {
      // Add as new participant
      participant = {
        particId: test.actor.id,
        particName: test.actor.name,
        particImg: test.actor.img,
        skillId: test.item.id,
        skillLabel: test.item.name,
        targetNumber: test.targetNumber,
        rolled: false,
        rollResult: null,
        success: null,
        degrees: null,
        hitLocation: null,
        testData: null,
        isWeaponTest: false
      };
      cardData.participants.push(participant);
    }

    // Update participant with test results
    participant.rolled = true;
    participant.skillId = test.item.id;
    participant.skillLabel = test.item.name;
    participant.targetNumber = test.targetNumber;
    participant.hitLocation = test._formatLocation(test.result.hitLocation);  // Format for display
    participant.testData = test.toObject();  // Store complete test data!
    
    // Handle weapon tests vs combat style tests
    if (test.isWeaponTest) {
      participant.isWeaponTest = true;
      participant.damage = test.result.damage;
      participant.qualities = test.result.qualities;
      participant.rollResult = test.result.damage;  // Use damage as "roll" for sorting
      participant.success = true;  // Weapons always "hit" in NPC system
      // Approximate degrees of success from damage (1 DoS per 10 damage)
      // This allows weapon tests to be compared with combat style tests in opposed resolution
      participant.degrees = Math.floor(test.result.damage / 10);
    } else {
      participant.isWeaponTest = false;
      participant.rollResult = test.result.total;
      participant.success = test.result.success;
      participant.degrees = test.result.degrees;
    }

    // Re-render card
    await this._updateCard(message, cardData);
    
    // Clear pending flag
    await test.actor.unsetFlag('uesrpg-3ev4', 'pendingOpposedCard');
  }

  /**
   * Resolve the opposed test and determine winner
   * Uses stored test data for future damage calculation
   */
  static async resolve(messageId) {
    const message = game.messages.get(messageId);
    if (!message) return;

    const cardData = message.flags['uesrpg-3ev4'].opposedCard;
    
    // Check minimum participants
    const rolled = cardData.participants.filter(p => p.rolled);
    if (rolled.length < 2) {
      ui.notifications.warn("Need at least 2 participants to resolve");
      return;
    }

    // Sort by success, then by degrees (if available) or roll value
    // Success always beats failure
    // If both succeed or both fail, higher degrees wins (or lower roll for legacy)
    rolled.sort((a, b) => {
      if (a.success !== b.success) return b.success ? 1 : -1;
      
           // Both same success state
      // If we have degrees, use them; otherwise fall back to roll comparison
      if (a.degrees !== null && a.degrees !== undefined && 
          b.degrees !== null && b.degrees !== undefined) {

        // If both succeed: higher DoS wins
        // If both fail: LOWER DoF wins (closer to success)
        if (a.success) {
          return b.degrees - a.degrees;   // higher DoS first
        } else {
          return a.degrees - b.degrees;   // lower DoF first
        }

      } else {
        // Legacy: lower roll is closer to success in d100 roll-under
        return a.rollResult - b.rollResult;
      }
    });

    const first = rolled[0];
    const second = rolled[1];

    // Winner rules for your workflow:
    // - one success => that actor wins
    // - both succeed => higher DoS wins (already sorted)
    // - both fail => lower DoF wins (already sorted)
    const winner = first;
    const runnerUp = second;
    
    // Calculate margin based on available data
    let margin;
    if (winner.degrees !== null && winner.degrees !== undefined &&
        runnerUp.degrees !== null && runnerUp.degrees !== undefined) {
      margin = Math.abs(winner.degrees - runnerUp.degrees);
    } else {
      margin = Math.abs(winner.rollResult - runnerUp.rollResult);
    }

    cardData.state = 'resolved';
    cardData.winner = winner.particName;
    cardData.winnerName = winner.particName;
    cardData.margin = margin;
    
    // Store winner's test data for future damage calculation (Phase 3)
    cardData.winnerTestData = winner.testData;
    cardData.defenderTestData = runnerUp.testData;

    await this._updateCard(message, cardData);

    // Clear all participant flags

  // Both succeed OR both fail:
  // - both succeed: tie (no winner) if you want RAW
  // - both fail: winner is the one closer to success (lower DoF / lower roll)
  if (!first.success && !second.success) {
    winner = first;
    runnerUp = second;
  } else {
    winner = null;
    runnerUp = null;
  }
}
    
    // Calculate margin only if there is a winner
    let margin = 0;
    if (winner && runnerUp) {
      if (winner.degrees !== null && winner.degrees !== undefined &&
          runnerUp.degrees !== null && runnerUp.degrees !== undefined) {
        margin = Math.abs(winner.degrees - runnerUp.degrees);
      } else {
        margin = Math.abs(winner.rollResult - runnerUp.rollResult);
      }
    }

    cardData.state = 'resolved';
    cardData.winner = winner ? winner.particName : null;
    cardData.winnerName = winner ? winner.particName : null;
    cardData.margin = margin;

    // Store winner's test data for future damage calculation (Phase 3)
    cardData.winnerTestData = winner ? winner.testData : null;
    cardData.defenderTestData = runnerUp ? runnerUp.testData : null;

    await this._updateCard(message, cardData);

    // Clear all participant flags

    for (const p of cardData.participants) {
      const actor = game.actors.get(p.particId);
      if (actor) {
        await actor.unsetFlag('uesrpg-3ev4', 'pendingOpposedCard');
      }
    }
  }

  /**
   * Close card without resolving
   * @param {string} messageId - Chat message ID of the card
   */
  static async close(messageId) {
    const message = game.messages.get(messageId);
    if (!message) return;

    const cardData = message.flags['uesrpg-3ev4'].opposedCard;
    cardData.state = 'closed';

    await this._updateCard(message, cardData);

    // Clear all participant flags
    for (const p of cardData.participants) {
      const actor = game.actors.get(p.particId);
      if (actor) {
        await actor.unsetFlag('uesrpg-3ev4', 'pendingOpposedCard');
      }
    }
  }

  /**
   * Remove a participant from the card
   * @param {string} messageId - Chat message ID
   * @param {string} actorId - Actor ID to remove
   */
  static async removeParticipant(messageId, actorId) {
    const message = game.messages.get(messageId);
    if (!message) return;

    const cardData = message.flags['uesrpg-3ev4'].opposedCard;
    cardData.participants = cardData.participants.filter(p => p.particId !== actorId);

    await this._updateCard(message, cardData);

    const actor = game.actors.get(actorId);
    if (actor) {
      await actor.unsetFlag('uesrpg-3ev4', 'pendingOpposedCard');
    }
  }

  /**
   * Update the card content and flags
   */
  static async _updateCard(message, cardData) {
    const templateData = {
      participants: cardData.participants,
      state: cardData.state,
      isGM: game.user.isGM,
      isResolved: cardData.state === 'resolved',
      winner: cardData.winner,
      winnerName: cardData.winnerName,
      margin: cardData.margin
    };

    const content = await renderTemplate(
      'systems/uesrpg-3ev4/templates/chat/opposed-card.html',
      templateData
    );

    await message.update({
      content,
      'flags.uesrpg-3ev4.opposedCard': cardData
    });
  }

  /**
   * Check if there's an open opposed card less than 1 day old
   */
  static getOpenCard() {
    const messages = game.messages.filter(m => {
      const cardData = m.flags?.['uesrpg-3ev4']?.opposedCard;
      if (!cardData || cardData.state !== 'open') return false;

      const timestamp = cardData.timestamp;
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      return (now - timestamp) < oneDayMs;
    });

    return messages.length > 0 ? messages[messages.length - 1] : null;
  }
}
