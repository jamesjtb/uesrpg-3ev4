// Combat resolution helper for UESRPG opposed rolls
export class CombatHelper {
  
  /**
   * Resolve an opposed combat roll between attacker and defender
   * @param {Object} attacker - attacking actor
   * @param {Object} defender - defending actor  
   * @param {Object} attackRoll - the d100 roll result from attacker
   * @param {Object} defendRoll - the d100 roll result from defender (or null if no defense)
   * @param {String} attackType - 'melee', 'ranged', or 'spell'
   * @returns {Object} result with winner, advantage, hit location
   */
  static resolveOpposedRoll(attacker, defender, attackRoll, defendRoll, attackType = 'melee') {
    // Guard against missing rolls
    if (!attackRoll) return { success: false, message: 'No attack roll provided' };
    
    const attackSuccess = attackRoll.total <= attackRoll.targetNumber;
    const attackDoS = attackSuccess ? Math.floor((attackRoll.targetNumber - attackRoll.total) / 10) : 0;
    
    // If no defense (surprise, helpless, etc), attacker auto-wins
    if (! defendRoll) {
      return {
        success: true,
        winner: 'attacker',
        advantage:  attackSuccess ? 1 : 0,
        attackDoS: attackDoS,
        defendDoS: 0,
        hitLocation: this. getHitLocation(attackRoll. total),
        message: attackSuccess ? 'Attack hits (no defense)!' : 'Attack missed!'
      };
    }
    
    const defendSuccess = defendRoll.total <= defendRoll.targetNumber;
    const defendDoS = defendSuccess ? Math.floor((defendRoll.targetNumber - defendRoll. total) / 10) : 0;
    
    // Both fail - no resolution
    if (!attackSuccess && ! defendSuccess) {
      return {
        success: false,
        winner: null,
        advantage: 0,
        attackDoS: 0,
        defendDoS: 0,
        message: 'Both attacker and defender failed their tests!'
      };
    }
    
    // One fails - winner gains advantage
    if (! attackSuccess && defendSuccess) {
      return {
        success: true,
        winner: 'defender',
        advantage: 1,
        attackDoS: 0,
        defendDoS:  defendDoS,
        message: 'Defender wins with advantage!'
      };
    }
    
    if (attackSuccess && !defendSuccess) {
      return {
        success: true,
        winner: 'attacker',
        advantage:  1,
        attackDoS: attackDoS,
        defendDoS: 0,
        hitLocation: this.getHitLocation(attackRoll.total),
        message: 'Attacker wins with advantage!'
      };
    }
    
    // Both pass - compare DoS
    if (attackDoS > defendDoS) {
      return {
        success: true,
        winner: 'attacker',
        advantage: 0,
        attackDoS: attackDoS,
        defendDoS: defendDoS,
        hitLocation: this.getHitLocation(attackRoll.total),
        message: `Attacker hits!  (DoS: ${attackDoS} vs ${defendDoS})`
      };
    } else if (defendDoS > attackDoS) {
      return {
        success: true,
        winner:  'defender',
        advantage:  0,
        attackDoS: attackDoS,
        defendDoS: defendDoS,
        message: `Defender blocks/parries! (DoS: ${defendDoS} vs ${attackDoS})`
      };
    } else {
      // Tie - no advantage
      return {
        success:  false,
        winner: null,
        advantage: 0,
        attackDoS: attackDoS,
        defendDoS: defendDoS,
        message: 'Tied - no resolution!'
      };
    }
  }
  
  /**
   * Determine hit location from d100 roll (ones digit)
   */
  static getHitLocation(rollTotal) {
    const ones = rollTotal % 10;
    if (ones >= 1 && ones <= 5) return 'body';
    if (ones === 6) return 'rightLeg';
    if (ones === 7) return 'leftLeg';
    if (ones === 8) return 'rightArm';
    if (ones === 9) return 'leftArm';
    if (ones === 0) return 'head';
    return 'body'; // fallback
  }
  
  /**
   * Apply damage to actor after armor reduction
   * @param {Actor} target - the actor taking damage
   * @param {Number} rawDamage - damage before AR
   * @param {String} hitLocation - where the hit landed
   * @param {String} damageType - 'physical', 'fire', 'frost', 'shock', 'poison', 'magic'
   * @returns {Object} damage applied, wounds caused
   */
  static async applyDamage(target, rawDamage, hitLocation = 'body', damageType = 'physical') {
    // Legacy helper kept for backwards compatibility.
    // Delegate to the canonical resolver path.
    const { applyDamageResolved } = await import("../combat/damage-resolver.js");

    return await applyDamageResolved(target, {
      rawDamage,
      damageType,
      hitLocation,
      source: "CombatHelper",
    });
  }
  
  /**
   * Get armor rating for a specific hit location and damage type
   */
  static getArmorRating(actor, hitLocation, damageType) {
    // Find equipped armor for that location
    const equippedArmor = (actor.items || []).find(i => 
      i.type === 'armor' && 
      i?. system?.equipped === true && 
      i?. system?.location === hitLocation
    );
    
    if (!equippedArmor) return 0;
    
    const armorSys = equippedArmor?. system || {};
    
    // Physical damage uses standard AR
    if (damageType === 'physical') {
      return Number(armorSys?. armor ??  0);
    }
    
    // Magic damage types use specific resistances if available
    const magicARField = `${damageType}_ar`; // e.g., 'fire_ar'
    const specificAR = Number(armorSys? .[magicARField] ??  0);
    const genericMagicAR = Number(armorSys?.magic_ar ?? 0);
    
    // Use specific if available, otherwise fall back to generic magic AR
    return specificAR > 0 ? specificAR : genericMagicAR;
  }
}
