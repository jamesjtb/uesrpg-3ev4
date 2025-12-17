/**
 * UESRPG Combat Test Class
 * Based on WFRP4e's Test pattern, adapted for UESRPG 3e v4 mechanics
 * 
 * Stores complete roll context for future automation while preserving
 * existing manual resolution workflow.
 */
export class UESRPGTest {
  constructor({
    actor,
    item,           // Combat style or weapon
    modifier = 0,
    targetNumber = null,
    precisionStrike = false,
    manualLocation = null,
    context = {}    // Additional context (targets, etc.)
  }) {
    this.actor = actor;
    this.item = item;
    this.modifier = modifier;
    this.precisionStrike = precisionStrike;
    this.manualLocation = manualLocation;
    this.context = context;
    
    // Calculate target number (TN)
    // For combat styles: item.system.value contains the TN
    // For NPCs: weapon.system may have different structure
    this.targetNumber = targetNumber ?? this._calculateTargetNumber();
    
    // Result storage
    this.result = {
      roll: null,
      total: 0,
      success: false,
      degrees: 0,
      hitLocation: null
    };
    
    this.message = null;
  }
  
  _calculateTargetNumber() {
    // Combat style items store TN in system.value
    let baseTN = 0;
    
    if (this.item.system?.value !== undefined) {
      baseTN = Number(this.item.system.value) || 0;
    } else if (this.item.system?.baseCha !== undefined) {
      // Combat styles have baseCha and bonus
      const baseValue = this.actor.system.characteristics[this.item.system.baseCha]?.value || 0;
      const bonus = this.item.system.bonus || 0;
      baseTN = baseValue + bonus;
    }
    
    return Math.max(0, baseTN + this.modifier);
  }
  
  /**
   * Execute the roll and compute all results
   */
  async roll() {
    // Execute the d100 roll
    this.result.roll = new Roll("1d100");
    await this.result.roll.evaluate();
    this.result.total = this.result.roll.total;
    
    // Determine success
    this.result.success = this.result.total <= this.targetNumber;
    
    // Calculate degrees of success/failure
    this._calculateDegrees();
    
    // Determine hit location
    this._determineHitLocation();
    
    // Create chat message
    await this.renderMessage();
    
    return this;
  }
  
  /**
   * Calculate Degrees of Success/Failure based on UESRPG rules
   * DoS: Based on tens digit + TN bonus if TN > 100
   * DoF: Based on margin of failure
   */
  _calculateDegrees() {
    const rollTotal = Number(this.result.total) || 0;
    const tn = Number(this.targetNumber) || 0;
    
    if (this.result.success) {
      // Degrees of Success
      const rollTens = Math.floor(rollTotal / 10);
      const baseDoS = Math.max(1, rollTens);
      
      // Bonus DoS if TN > 100
      const tnBonus = tn > 100 ? Math.floor(tn / 10) : 0;
      
      this.result.degrees = baseDoS + tnBonus;
    } else {
      // Degrees of Failure
      const margin = Math.max(0, rollTotal - tn);
      this.result.degrees = Math.max(1, 1 + Math.floor(margin / 10));
    }
  }
  
  /**
   * Determine hit location from ones digit
   * 1-5 = Body, 6 = R.Leg, 7 = L.Leg, 8 = R.Arm, 9 = L.Arm, 0 = Head
   */
  _determineHitLocation() {
    // Precision strike override
    if (this.precisionStrike && this.manualLocation) {
      this.result.hitLocation = this.manualLocation;
      return;
    }
    
    // Use ones digit to determine location
    const onesDigit = (Number(this.result.total) || 0) % 10;
    
    if (onesDigit >= 1 && onesDigit <= 5) {
      this.result.hitLocation = "body";
    } else if (onesDigit === 6) {
      this.result.hitLocation = "r_leg";
    } else if (onesDigit === 7) {
      this.result.hitLocation = "l_leg";
    } else if (onesDigit === 8) {
      this.result.hitLocation = "r_arm";
    } else if (onesDigit === 9) {
      this.result.hitLocation = "l_arm";
    } else { // 0
      this.result.hitLocation = "head";
    }
  }
  
  /**
   * Create chat message with test data
   * Handles both regular messages and opposed card integration
   */
  async renderMessage() {
    // Check if actor has pending opposed card (Phase 1 integration)
    const pendingCard = this.actor.getFlag('uesrpg-3ev4', 'pendingOpposedCard');
    
    if (pendingCard) {
      // Add to opposed card instead of creating new message
      const { OpposedCardManager } = await import('../combat/opposed-card-manager.js');
      await OpposedCardManager.addTest(pendingCard, this);
      ui.notifications.info(`Roll added to opposed test`);
      return;
    }
    
    // Regular message - format exactly like existing system
    const content = await this._formatContent();
    const flavor = this._formatFlavor();
    
    // Create message with test data in flags
    this.message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      flavor,
      rolls: [this.result.roll],  // Foundry v10+ format
      flags: {
        'uesrpg-3ev4': {
          test: this.toObject()  // Store complete test data
        }
      },
      rollMode: game.settings.get("core", "rollMode")
    });
    
    return this.message;
  }
  
  /**
   * Format flavor tags (wound, fatigue, encumbrance)
   */
  _formatFlavor() {
    const tags = [];
    
    if (this.actor.system?.wounded) {
      tags.push(`<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`);
    }
    if (this.actor.system?.fatigue?.penalty != 0) {
      tags.push(`<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`);
    }
    if (this.actor.system?.carry_rating?.penalty != 0) {
      tags.push(`<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`);
    }
    
    return tags.length > 0 ? `<div class="tag-container">${tags.join("")}</div>` : '';
  }
  
  /**
   * Format chat message content to match existing system appearance
   */
  async _formatContent() {
    // Check for lucky/unlucky numbers
    const isLucky = this._isLucky();
    const isUnlucky = this._isUnlucky();
    
    // Build header with item image and name
    const header = `<h2><img src="${this.item.img}"/>${this.item.name}</h2>`;
    
    // Build result display
    let resultDisplay = '';
    if (isLucky) {
      resultDisplay = `<p></p><b>Target Number: [[${this.targetNumber}]]</b><p></p>
        <b>Result: [[${this.result.total}]]</b><p></p>
        <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
    } else if (isUnlucky) {
      resultDisplay = `<p></p><b>Target Number: [[${this.targetNumber}]]</b><p></p>
        <b>Result: [[${this.result.total}]]</b><p></p>
        <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
    } else {
      const successMsg = this.result.success 
        ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
        : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>";
      
      resultDisplay = `<p></p><b>Target Number: [[${this.targetNumber}]]</b><p></p>
        <b>Result: [[${this.result.total}]]</b><p></p>
        <b>${successMsg}</b>
        <p></p><b>Degrees: ${this.result.degrees}</b>
        ${this.result.hitLocation ? `<p></p><b>Hit Location: ${this._formatLocation(this.result.hitLocation)}</b>` : ''}`;
    }
    
    return header + resultDisplay;
  }
  
  /**
   * Check if roll result is a lucky number
   */
  _isLucky() {
    const luckyNumbers = this.actor.system?.lucky_numbers;
    if (!luckyNumbers) return false;
    
    const rollResult = this.result.total;
    for (let key in luckyNumbers) {
      if (luckyNumbers[key] === rollResult) return true;
    }
    return false;
  }
  
  /**
   * Check if roll result is an unlucky number
   */
  _isUnlucky() {
    const unluckyNumbers = this.actor.system?.unlucky_numbers;
    if (!unluckyNumbers) return false;
    
    const rollResult = this.result.total;
    for (let key in unluckyNumbers) {
      if (unluckyNumbers[key] === rollResult) return true;
    }
    return false;
  }
  
  /**
   * Format hit location for display
   */
  _formatLocation(loc) {
    const labels = {
      body: "Body",
      head: "Head",
      r_arm: "Right Arm",
      l_arm: "Left Arm",
      r_leg: "Right Leg",
      l_leg: "Left Leg"
    };
    return labels[loc] || loc;
  }
  
  /**
   * Serialize test for storage in message flags
   */
  toObject() {
    return {
      actorId: this.actor.id,
      actorType: this.actor.type,
      actorName: this.actor.name,
      itemId: this.item.id,
      itemName: this.item.name,
      itemImg: this.item.img,
      modifier: this.modifier,
      targetNumber: this.targetNumber,
      precisionStrike: this.precisionStrike,
      manualLocation: this.manualLocation,
      result: {
        total: this.result.total,
        success: this.result.success,
        degrees: this.result.degrees,
        hitLocation: this.result.hitLocation
      },
      context: this.context,
      timestamp: Date.now()
    };
  }
  
  /**
   * Reconstruct test from saved data (for future opposed resolution)
   */
  static recreate(data) {
    const actor = game.actors.get(data.actorId);
    const item = actor?.items.get(data.itemId);
    
    if (!actor || !item) {
      console.error("Cannot recreate test: actor or item not found", data);
      return null;
    }
    
    const test = new UESRPGTest({
      actor,
      item,
      modifier: data.modifier,
      targetNumber: data.targetNumber,
      precisionStrike: data.precisionStrike,
      manualLocation: data.manualLocation,
      context: data.context || {}
    });
    
    // Restore result
    test.result = {
      roll: null, // Roll object can't be reconstructed
      total: data.result.total,
      success: data.result.success,
      degrees: data.result.degrees,
      hitLocation: data.result.hitLocation
    };
    
    return test;
  }
}
