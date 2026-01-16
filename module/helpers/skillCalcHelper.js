import { resolveCriticalFlags } from "../rules/npc-rules.js";

export function skillHelper(actorData, characteristic) {
    // First, try to use an aggregated cache if present (fast)
    try {
      const agg = actorData?._aggCache?.agg;
      if (agg && agg.charBonus && Object.prototype.hasOwnProperty.call(agg.charBonus, characteristic)) {
        return Number(agg.charBonus[characteristic] || 0);
      }
    } catch (err) {
      // fall back to original behavior
    }

    // Fallback: compute by scanning items (slower)
    let bonusItems = actorData.items?.filter(item => item && item.system && Object.prototype.hasOwnProperty.call(item.system, 'characteristicBonus')) || [];
    let totalBonus = 0;
    for (let bonusItem of bonusItems) {
        let bonusValue = Number(bonusItem.system.characteristicBonus[characteristic + 'ChaBonus'] || 0)
        if (bonusValue !== 0) {
            totalBonus = totalBonus + bonusValue
        }
    }
    return totalBonus
}

export function skillModHelper(actorData, skillName) {
    // Try aggregated cache first
    try {
      const agg = actorData?._aggCache?.agg;
      if (agg && agg.skillModifiers && Object.prototype.hasOwnProperty.call(agg.skillModifiers, skillName)) {
        return Number(agg.skillModifiers[skillName] || 0);
      }
    } catch (err) {
      // fall back
    }

    // Fallback: find equipped items that have skillArray
    let bonusItems = (actorData.items || []).filter(item => item && item.system && Array.isArray(item.system.skillArray) && item.system.skillArray.length > 0 && item.system.equipped);
    if (bonusItems.length == 0) {return 0}
    let totalBonus = 0
    for (let bonusItem of bonusItems) {
        if (!bonusItem.system.equipped) continue
        let bonusValue = Number(bonusItem.system.skillArray.find(itemName => itemName.name == skillName)?.value || 0)
        if (bonusValue != 0) {
            totalBonus = totalBonus + bonusValue
        }
    }
    return Number(totalBonus)
}

export function isLucky(actorData, rollResult) {
    const crit = resolveCriticalFlags(actorData, Number(rollResult), { allowLucky: true, allowUnlucky: false });
    return crit.isCriticalSuccess === true;
}

export function isUnlucky(actorData, rollResult) {
    const crit = resolveCriticalFlags(actorData, Number(rollResult), { allowLucky: false, allowUnlucky: true });
    return crit.isCriticalFailure === true;
}
