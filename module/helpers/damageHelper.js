// module/helpers/damageHelper. js

export function getDamageTypeFromWeapon(item) {
  // Defensive guard
  if (!item?. system) return 'physical';
  
  const qualities = item.system.qualities?. toLowerCase() || '';
  
  if (qualities.includes('fire')) return 'fire';
  if (qualities.includes('frost')) return 'frost';
  if (qualities.includes('shock')) return 'shock';
  if (qualities.includes('poison')) return 'poison';
  if (qualities.includes('magic')) return 'magic';
  
  return 'physical';
}

export function getArmorForLocation(actor, location) {
  // Defensive guard
  if (!actor?. system) return { physical: 0 };
  
  const armorMap = {
    'Head': 'head',
    'Right Arm': 'rightarm',
    'Left Arm':  'leftarm',
    'Body': 'body',
    'Right Leg': 'rightleg',
    'Left Leg':  'leftleg'
  };
  
  const loc = armorMap[location] || 'body';
  const armorData = actor.system.armor? .[loc] || {};
  
  return {
    physical: Number(armorData.physical || 0),
    fire: Number(armorData.fire || 0),
    frost: Number(armorData.frost || 0),
    shock: Number(armorData.shock || 0),
    poison: Number(armorData.poison || 0),
    magic: Number(armorData.magic || 0)
  };
}

export function applyArmorPenetration(armorValue, penetrateArmor) {
  if (!penetrateArmor) return armorValue;
  
  // Treat full armor as partial (half), partial as unarmored (0)
  // Assuming "full" armor is armorValue > 0, "partial" is armorValue / 2
  // If penetrateArmor is true, we halve the armor
  return Math.floor(armorValue / 2);
}

export function calculateFinalDamage(baseDamage, armor, damageType, penetrateArmor = false) {
  // Guard against undefined
  baseDamage = Number(baseDamage || 0);
  
  let relevantArmor = 0;
  if (damageType === 'physical') {
    relevantArmor = armor. physical;
  } else {
    // Magic damage uses specific resistance + magic AR
    relevantArmor = (armor[damageType] || 0) + (armor.magic || 0);
  }
  
  // Apply armor penetration
  if (penetrateArmor) {
    relevantArmor = applyArmorPenetration(relevantArmor, true);
  }
  
  const finalDamage = Math.max(0, baseDamage - relevantArmor);
  
  return {
    baseDamage,
    armorReduction: relevantArmor,
    finalDamage
  };
}
