// module/helpers/opposedRollHelper.js
export async function resolveOpposedRoll(attacker, defender, attackRoll, defenseRoll, attackType, defenseType) {
  // attackType: "melee", "ranged", "spell"
  // defenseType: "evade", "parry", "block", "counter"
  
  const attackDoS = calculateDegreesOfSuccess(attackRoll);
  const defenseDoS = calculateDegreesOfSuccess(defenseRoll);
  
  // Determine advantage & result per Chapter 5 rules
  let result = {
    attackerWon: false,
    defenderWon: false,
    advantage: null,
    advantageCount: 0,
    hitLocation: null,
    armorPenetration: false
  };
  
  // Logic per rules: 
  // - Both fail: nothing
  // - One fails: winner gains advantage
  // - Both pass: compare DoS
  // - Critical success/failure handling
  
  if (! attackRoll. success && !defenseRoll. success) {
    // Both fail:  no result
    return result;
  }
  
  if (attackRoll.isCritical && ! defenseRoll.isCritical) {
    result.attackerWon = true;
    result.advantage = "attacker";
    result.advantageCount = 2; // crit gives 2 advantages
  } else if (defenseRoll.isCritical && !attackRoll.isCritical) {
    result.defenderWon = true;
    result.advantage = "defender";
    result.advantageCount = 2;
  } else if (attackRoll.success && ! defenseRoll.success) {
    result.attackerWon = true;
    result.advantage = "attacker";
    result.advantageCount = 1;
  } else if (defenseRoll.success && !attackRoll.success) {
    result.defenderWon = true;
    result.advantage = "defender";
    result.advantageCount = 1;
  } else if (attackRoll.success && defenseRoll.success) {
    // Both passed: compare DoS
    if (defenseType === "block") {
      // Block:  defender wins regardless of DoS
      result.defenderWon = true;
      result.advantage = "defender";
      result.advantageCount = 1;
    } else if (defenseType === "parry" || defenseType === "evade") {
      if (attackDoS > defenseDoS) {
        result.attackerWon = true;
        // No advantage when both pass and attacker wins by DoS
      } else if (defenseDoS > attackDoS) {
        result.defenderWon = true;
        result.advantage = "defender";
        result.advantageCount = 1;
      } else {
        // Tied DoS:  no result
      }
    } else if (defenseType === "counter") {
      if (attackDoS > defenseDoS) {
        result.attackerWon = true;
      } else if (defenseDoS > attackDoS) {
        result.defenderWon = true;
      }
      // Counter: whoever wins hits; no advantage
    }
  }
  
  // Determine hit location if attacker won (use ones digit of attack roll)
  if (result.attackerWon) {
    const onesDigit = attackRoll.total % 10;
    result.hitLocation = getHitLocation(onesDigit);
  }
  
  return result;
}

function calculateDegreesOfSuccess(roll) {
  if (! roll.success) return 0;
  return Math.floor((roll.target - roll.total) / 10);
}

function getHitLocation(onesDigit) {
  // 1-5=Body; 6=Right Leg; 7=Left Leg; 8=Right Arm; 9=Left Arm; 10/0=Head
  if (onesDigit >= 1 && onesDigit <= 5) return "body";
  if (onesDigit === 6) return "rightLeg";
  if (onesDigit === 7) return "leftLeg";
  if (onesDigit === 8) return "rightArm";
  if (onesDigit === 9) return "leftArm";
  if (onesDigit === 0) return "head";
  return "body"; // fallback
}
