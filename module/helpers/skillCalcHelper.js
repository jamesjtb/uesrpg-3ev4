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

export function skillModHelper(actorData, skillName) {
    let bonusItems = actorData.items.filter(item => item.system.hasOwnProperty("skillArray") && item.system.hasOwnProperty("equipped"))
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