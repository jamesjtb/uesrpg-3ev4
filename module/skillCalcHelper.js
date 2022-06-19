export function skillHelper(actorData, characteristic) {
    let bonusItems = actorData.items.filter(item => item.data.data.hasOwnProperty('characteristicBonus'))
    let totalBonus = 0
    for (let bonusItem of bonusItems) {
        let bonusValue = bonusItem.data.data.characteristicBonus[characteristic + 'ChaBonus']
        if (bonusValue != 0) {
            totalBonus = totalBonus + bonusValue
        }
    }
    return totalBonus
}