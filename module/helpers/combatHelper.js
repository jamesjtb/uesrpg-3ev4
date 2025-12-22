// ADD TO:  module/helpers/combatHelper.js (create this file)

export class CombatHelper {
  
  /**
   * Initiate an opposed combat roll (attack vs. defense)
   * @param {Actor} attacker - The attacking actor
   * @param {Actor} defender - The defending actor
   * @param {Object} attackData - Attack details (weapon, Combat Style, modifiers)
   */
  static async initiateOpposedRoll(attacker, defender, attackData) {
    // 1. Attacker makes attack test
    const attackRoll = await this._makeAttackRoll(attacker, attackData);
    
    // 2. Defender chooses defense method (dialog)
    const defenseChoice = await this._promptDefenseChoice(defender, attackData);
    
    if (! defenseChoice) {
      // Defender chose not to defend or failed to respond
      await this._resolveUndefendedAttack(attacker, defender, attackRoll, attackData);
      return;
    }
    
    // 3. Defender makes defense test
    const defenseRoll = await this._makeDefenseRoll(defender, defenseChoice);
    
    // 4. Compare results and determine outcome
    await this._resolveOpposedRoll(attacker, defender, attackRoll, defenseRoll, attackData, defenseChoice);
  }
  
  /**
   * Make an attack roll for the attacker
   */
  static async _makeAttackRoll(attacker, attackData) {
    const skill = attackData.combatStyle;
    const skillValue = Number(attacker.system.professions? .[skill] ??  0);
    const modifier = Number(attackData.modifier ??  0);
    const targetNumber = skillValue + modifier;
    
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    const result = {
      roll: roll,
      total: roll.total,
      targetNumber: targetNumber,
      passed: roll.total <= targetNumber,
      degreesOfSuccess: this._calculateDoS(roll.total, targetNumber),
      isCritical: roll.total <= 5,
      isFumble: roll.total >= 96
    };
    
    // Send attack roll to chat
    await this._sendAttackRollMessage(attacker, result, attackData);
    
    return result;
  }
  
  /**
   * Prompt defender to choose defense method
   */
  static async _promptDefenseChoice(defender, attackData) {
    return new Promise((resolve) => {
      new Dialog({
        title: `Defend Against Attack`,
        content: `
          <p><strong>${attackData.attackerName}</strong> is attacking you! </p>
          <p>Choose your defense: </p>
        `,
        buttons: {
          evade: {
            label: "Evade",
            callback: () => resolve({ method: "evade", skill: "evade" })
          },
          parry: {
            label: "Parry",
            callback:  () => resolve({ method: "parry", skill: attackData.combatStyle })
          },
          block: {
            label: "Block (Shield)",
            callback: () => resolve({ method: "block", skill:  attackData.combatStyle })
          },
          counter: {
            label: "Counter-Attack",
            callback: () => resolve({ method: "counter", skill: attackData.combatStyle })
          },
          none: {
            label: "Don't Defend",
            callback:  () => resolve(null)
          }
        },
        default: "evade",
        close: () => resolve(null)
      }).render(true);
    });
  }
  
  /**
   * Make a defense roll for the defender
   */
  static async _makeDefenseRoll(defender, defenseChoice) {
    const skill = defenseChoice.skill;
    const skillValue = Number(defender. system.professions?.[skill] ?? 0);
    const modifier = 0; // Add modifiers as needed
    const targetNumber = skillValue + modifier;
    
    const roll = new Roll("1d100");
    await roll.evaluate();
    
    const result = {
      roll: roll,
      total: roll.total,
      targetNumber: targetNumber,
      passed: roll.total <= targetNumber,
      degreesOfSuccess: this._calculateDoS(roll.total, targetNumber),
      method: defenseChoice.method,
      isCritical: roll. total <= 5,
      isFumble: roll.total >= 96
    };
    
    // Send defense roll to chat
    await this._sendDefenseRollMessage(defender, result);
    
    return result;
  }
  
  /**
   * Resolve the opposed roll and determine outcome
   */
  static async _resolveOpposedRoll(attacker, defender, attackRoll, defenseRoll, attackData, defenseChoice) {
    let outcome = {
      winner: null,
      advantage: false,
      advantageCount: 0,
      attackHits: false,
      message: ""
    };
    
    // Determine winner based on rules
    if (! attackRoll.passed && ! defenseRoll.passed) {
      outcome.message = "Both attacker and defender failed their tests.  No effect.";
    } else if (attackRoll. isCritical && ! defenseRoll.isCritical) {
      outcome.winner = "attacker";
      outcome.advantage = true;
      outcome.advantageCount = 2;
      outcome.attackHits = true;
      outcome.message = "Critical attack success!  Attacker gains 2 advantages.";
    } else if (defenseRoll.isCritical && !attackRoll.isCritical) {
      outcome.winner = "defender";
      outcome.advantage = true;
      outcome.advantageCount = 2;
      outcome.message = "Critical defense success! Defender gains 2 advantages.";
    } else if (attackRoll.passed && ! defenseRoll.passed) {
      outcome.winner = "attacker";
      outcome.advantage = true;
      outcome.advantageCount = 1;
      outcome.attackHits = true;
      outcome.message = "Attack succeeds! Attacker gains advantage.";
    } else if (defenseRoll.passed && ! attackRoll.passed) {
      outcome.winner = "defender";
      outcome.advantage = true;
      outcome.advantageCount = 1;
      outcome.message = "Defense succeeds! Defender gains advantage.";
    } else if (attackRoll.degreesOfSuccess > defenseRoll.degreesOfSuccess) {
      outcome.winner = "attacker";
      outcome.attackHits = true;
      
      // Special case for block
      if (defenseChoice.method === "block") {
        outcome.message = "Attack blocked by shield.  Resolve block damage.";
        await this._resolveBlockDefense(defender, attackData);
        return; // Block prevents further damage
      }
      
      outcome.message = `Attack hits!  (${attackRoll.degreesOfSuccess} DoS vs ${defenseRoll.degreesOfSuccess} DoS)`;
    } else if (defenseRoll.degreesOfSuccess > attackRoll.degreesOfSuccess) {
      outcome.winner = "defender";
      outcome. message = `Defense succeeds! (${defenseRoll.degreesOfSuccess} DoS vs ${attackRoll.degreesOfSuccess} DoS)`;
    } else {
      // Tied DoS
      outcome.message = "Both tests pass with equal success.  No effect.";
    }
    
    // Send outcome message to chat
    await this._sendOutcomeMessage(attacker, defender, outcome);
    
    // If attack hits, prompt for advantage use and then resolve damage
    if (outcome.attackHits) {
      if (outcome.advantage) {
        await this._promptAdvantageUse(attacker, outcome. advantageCount);
      }
      await this._resolveDamage(attacker, defender, attackData, attackRoll);
    } else if (outcome.winner === "defender" && outcome.advantage) {
      await this._promptDefensiveAdvantage(defender, defenseChoice. method, outcome.advantageCount);
    }
  }
  
  /**
   * Calculate degrees of success/failure
   */
  static _calculateDoS(rollTotal, targetNumber) {
    if (rollTotal <= targetNumber) {
      return Math.floor((targetNumber - rollTotal) / 10) + 1;
    }
    return 0;
  }
  
  /**
   * Resolve damage when attack hits
   */
  static async _resolveDamage(attacker, defender, attackData, attackRoll) {
    // Determine hit location
    const hitLocation = this._determineHitLocation(attackRoll. total);
    
    // Roll damage
    const damageRoll = new Roll(attackData.weapon.damage);
    await damageRoll. evaluate();
    
    // Get armor rating for hit location
    const armorRating = Number(defender.system.armor?.[hitLocation]?.ar ?? 0);
    
    // Calculate final damage
    const finalDamage = Math.max(0, damageRoll.total - armorRating);
    
    // Apply damage to defender
    const newHP = Math.max(0, Number(defender.system.hp. value ??  0) - finalDamage);
    await defender.update({ "system.hp.value": newHP });
    
    // Check for wounds
    const woundThreshold = Number(defender.system. wound_threshold. value ?? 0);
    if (finalDamage > woundThreshold) {
      await this._applyWound(defender, hitLocation, finalDamage);
    }
    
    // Send damage message to chat
    await this._sendDamageMessage(attacker, defender, {
      hitLocation,
      damageRoll,
      armorRating,
      finalDamage,
      newHP,
      wounded: finalDamage > woundThreshold
    });
  }
  
  /**
   * Determine hit location from attack roll
   */
  static _determineHitLocation(attackTotal) {
    const ones = attackTotal % 10;
    if (ones >= 1 && ones <= 5) return "body";
    if (ones === 6) return "rightLeg";
    if (ones === 7) return "leftLeg";
    if (ones === 8) return "rightArm";
    if (ones === 9) return "leftArm";
    if (ones === 0) return "head";
    return "body"; // fallback
  }
  
  /**
   * Apply wound effects to defender
   */
  static async _applyWound(defender, hitLocation, damage) {
    // Implement wound tracking based on your system
    ui.notifications.warn(`${defender.name} has been wounded at ${hitLocation}! `);
    
    // Mark as wounded
    await defender.update({ "system.wounded": true });
    
    // Apply wound penalties (-20 to tests, etc.)
    // This can be tracked via active effects or manual flags
  }
  
  // Additional helper methods for chat messages, advantage prompts, etc.
  // (Implementation details omitted for brevity - these would format and send chat cards)
  
  static async _sendAttackRollMessage(attacker, result, attackData) {
    // Create chat message for attack roll
  }
  
  static async _sendDefenseRollMessage(defender, result) {
    // Create chat message for defense roll
  }
  
  static async _sendOutcomeMessage(attacker, defender, outcome) {
    // Create chat message for outcome
  }
  
  static async _sendDamageMessage(attacker, defender, damageData) {
    // Create chat message for damage
  }
  
  static async _promptAdvantageUse(attacker, advantageCount) {
    // Dialog to choose how to use advantage
  }
  
  static async _promptDefensiveAdvantage(defender, method, advantageCount) {
    // Dialog for defensive advantage effects
  }
  
  static async _resolveUndefendedAttack(attacker, defender, attackRoll, attackData) {
    // Treat defender as failed - resolve direct hit
  }
  
  static async _resolveBlockDefense(defender, attackData) {
    // Special block resolution (check Block Rating vs damage)
  }
}
