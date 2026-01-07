/**
 * module/combat/attack-tracker.js
 *
 * Track attacks made per round/turn for the UESRPG 3ev4 system.
 * According to RAW: "A character may make no more than two total attacks in a single round"
 */

export class AttackTracker {
  /**
   * Increment attack count for the current round/turn
   * @param {Actor} actor - The actor making the attack
   * @returns {Promise<void>}
   */
  static async incrementAttacks(actor) {
    if (!actor) return;
    
    // Ensure combat_tracking exists with safe defaults
    const tracking = actor.system?.combat_tracking ?? {
      attacks_this_round: 0,
      attacks_this_turn: 0,
      last_reset_round: 0,
      last_reset_turn: 0
    };
    
    const combat = game.combat;
    const currentRound = combat?.round ?? 0;
    const currentTurn = combat?.turn ?? 0;
    
    // Reset if round has changed
    let attacks = tracking.attacks_this_round ?? 0;
    if (currentRound !== (tracking.last_reset_round ?? 0)) {
      attacks = 0;
    }
    
    attacks += 1;
    
    await actor.update({
      "system.combat_tracking.attacks_this_round": attacks,
      "system.combat_tracking.last_reset_round": currentRound,
      "system.combat_tracking.last_reset_turn": currentTurn
    });
  }
  
  /**
   * Get current attack count for this round
   * @param {Actor} actor - The actor to check
   * @returns {number} - Number of attacks made this round
   */
  static getAttackCount(actor) {
    if (!actor) return 0;
    
    const tracking = actor.system?.combat_tracking;
    if (!tracking) return 0;
    
    const combat = game.combat;
    const currentRound = combat?.round ?? 0;
    
    // If round has changed but not reset yet, return 0
    if (currentRound !== (tracking.last_reset_round ?? 0)) {
      return 0;
    }
    
    return tracking.attacks_this_round ?? 0;
  }
  
  /**
   * Reset attack counter (called on round change)
   * @param {Actor} actor - The actor to reset
   * @returns {Promise<void>}
   */
  static async resetAttacks(actor) {
    if (!actor) return;
    
    const combat = game.combat;
    const currentRound = combat?.round ?? 0;
    const currentTurn = combat?.turn ?? 0;
    
    await actor.update({
      "system.combat_tracking.attacks_this_round": 0,
      "system.combat_tracking.attacks_this_turn": 0,
      "system.combat_tracking.last_reset_round": currentRound,
      "system.combat_tracking.last_reset_turn": currentTurn
    });
  }
  
  /**
   * Check if actor has exceeded the 2 attack limit
   * @param {Actor} actor - The actor to check
   * @returns {boolean} - True if >= 2 attacks made
   */
  static hasExceededLimit(actor) {
    return this.getAttackCount(actor) >= 2;
  }
  
  /**
   * Get warning message for attack limit
   * @param {Actor} actor - The actor to check
   * @returns {string} - Warning message or empty string
   */
  static getLimitWarning(actor) {
    const count = this.getAttackCount(actor);
    if (count >= 2) {
      return `Maximum attacks (2) reached this round. This attack may violate RAW.`;
    }
    return "";
  }
}

/**
 * Hook into combat updates to auto-reset attack counters on round changes
 */
Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  // Only run on the round change
  if (!changed.round) return;
  
  // Reset attack counters for all combatants in parallel
  const resetPromises = [];
  for (const combatant of combat.combatants) {
    if (combatant.actor) {
      resetPromises.push(AttackTracker.resetAttacks(combatant.actor));
    }
  }
  await Promise.all(resetPromises);
});
