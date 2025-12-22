export class CombatRoll {
  static async execute(attacker, defender, attackType, defenseType) {
    // Step 1: Attacker rolls
    const attackTest = await attacker.rollCombatStyle(attackType);
    
    // Step 2: Defender chooses defense & rolls
    const defenseTest = await defender.rollDefense(defenseType);
    
    // Step 3: Compare results & determine advantage
    const result = this.compareRolls(attackTest, defenseTest);
    
    // Step 4: Create chat card showing results
    await this.createCombatCard(attacker, defender, result);
    
    return result;
  }

  static compareRolls(attack, defense) {
    const atkSuccess = attack.isSuccess;
    const defSuccess = defense.isSuccess;
    const atkDoS = attack.degreesOfSuccess;
    const defDoS = defense.degreesOfSuccess;

    let winner = null;
    let advantage = 0;

    // Both fail
    if (! atkSuccess && !defSuccess) {
      return { winner: null, advantage: 0, hit: false };
    }

    // One fails
    if (! atkSuccess && defSuccess) {
      winner = 'defender';
      advantage = 1;
    } else if (atkSuccess && ! defSuccess) {
      winner = 'attacker';
      advantage = 1;
    }

    // Both succeed - compare DoS
    if (atkSuccess && defSuccess) {
      if (atkDoS > defDoS) {
        winner = 'attacker';
      } else if (defDoS > atkDoS) {
        winner = 'defender';
      } else {
        // Tie - no advantage
        return { winner: null, advantage: 0, hit:  false };
      }
    }

    // Critical handling
    if (attack.isCritical && ! defense.isCritical) advantage += 1;
    if (defense.isCritical && ! attack.isCritical) advantage += 1;

    return {
      winner,
      advantage,
      hit:  winner === 'attacker',
      attackRoll: attack,
      defenseRoll: defense
    };
  }
}
