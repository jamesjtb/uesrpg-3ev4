export function skillHelper(actorData, characteristic) {
    let bonusItems = actorData.items.filter(item => item.system.hasOwnProperty('characteristicBonus'))
    let totalBonus = 0
    for (let bonusItem of bonusItems) {
        let bonusValue = bonusItem.system.characteristicBonus[characteristic + 'ChaBonus']
        if (bonusValue != 0) {
            totalBonus = totalBonus + bonusValue
        }
    }
    return totalBonus
}