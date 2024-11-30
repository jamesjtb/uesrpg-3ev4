export function renderRaceCards(races) {
    const raceCards = [];
    for (const raceKey in races) {
        raceCards.push(renderRaceCard(races[raceKey]));
    }
    return raceCards;
}

function renderRaceCard(race) {
    const traits = renderTraits(race.traits);
    const baselineCells = renderBaselineCells(race.baseline);
    return `
        <div style="display: flex; flex-direction: row; align-items: center; border: solid 1px; padding: 0 5px; width: 49%;">
            <div style="width: 100%; height: 100%;">
                <div style="text-align: center; position: relative; top: 0;">
                    <input type="checkbox" class="raceSelect" id="${race.name}" style="position: relative; left: 0; top: 0;">
                    <img src="${race.img}" alt="${race.name}" height="150" width="100" style="border: none;">
                </div>
                <div style="position: relative; top: 0;">
                    <h2 style="text-align: center;">${race.name}</h2>
                    <table style="text-align: center;">
                        <thead>
                        <tr>
                            <th colspan="7">Characteristic Baseline</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr>
                            <th>STR</th>
                            <th>END</th>
                            <th>AGI</th>
                            <th>INT</th>
                            <th>WP</th>
                            <th>PRC</th>
                            <th>PRS</th>
                        </tr>
                        <tr>
                            ${baselineCells}
                        </tr>
                        </tbody>
                    </table>
                    <ul>
                        ${traits}
                    </ul>
                </div>
            </div>
        </div>
    `;
}

function renderBaselineCells(baseline) {
    const baselineCellsList = [];
    for (let char in baseline) {
        const baseValue = baseline[char];
        baselineCellsList.push(`<td>${baseValue}</td>`)
    }
    return baselineCellsList.join('');
}

function renderTraits(traits) {
    const traitList = [];
    for (const trait of traits) {
        traitList.push(`<li>${trait}</li>`)
    }
    return traitList.join('');
}