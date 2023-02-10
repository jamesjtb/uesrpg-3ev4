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

export function isLucky(actorData, rollResult) {
    let luckyArray = []
    for (let num in actorData.system.lucky_numbers) {
        luckyArray.push(actorData.system.lucky_numbers[num])
    }

    return luckyArray.some(num => num == rollResult)
}

export function isUnlucky(actorData, rollResult) {
    let unluckyArray = []
    for (let num in actorData.system.unlucky_numbers) {
        unluckyArray.push(actorData.system.unlucky_numbers[num])
    }

    return unluckyArray.some(num => num == rollResult)
}