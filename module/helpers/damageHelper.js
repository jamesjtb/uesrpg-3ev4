// module/helpers/damageHelper.js
export function applyArmorPenetration(armorRating, armorType, advantageUsedForPenetration) {
  if (! advantageUsedForPenetration) return armorRating;
  
  // Full → Partial; Partial → Unarmored
  if (armorType === "full") {
    // Treat as partial:  halve AR (rules don't specify exact partial value, assume half)
    return Math.floor(armorRating / 2);
  } else if (armorType === "partial") {
    // Treat as unarmored:  0 AR
    return 0;
  }
  
  return armorRating; // unarmored already 0
}

export function calculateDamage(rawDamage, armorRating, armorType, penetrateArmor = false) {
  const effectiveAR = applyArmorPenetration(armorRating, armorType, penetrateArmor);
  const finalDamage = Math.max(0, rawDamage - effectiveAR);
  return {
    rawDamage,
    effectiveAR,
    finalDamage,
    armorPenetrated: penetrateArmor
  };
}
