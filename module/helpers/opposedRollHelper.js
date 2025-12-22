// module/helpers/opposedRollHelper.js

export async function executeOpposedRoll(attackerData, defenderData) {
  // Guard against missing data
  if (!attackerData || !defenderData) {
    ui.notifications.warn('Missing attacker or defender data for opposed roll');
    return null;
  }
  
  const attackRoll = new Roll('1d100');
  const defendRoll = new Roll('1d100');
  
  await attackRoll.evaluate({async: true});
  await defendRoll.evaluate({async: true});
  
  const attackTN = Number(attackerData.targetNumber || 0);
  const defendTN = Number(defenderData.targetNumber || 0);
  
  const attackSuccess = attackRoll.total <= attackTN;
  const defendSuccess = defendRoll.total <= defendTN;
  
  const attackDoS = attackSuccess ? Math.floor((attackTN - attackRoll.total) / 10) : 0;
  const defendDoS = defendSuccess ? Math.floor((defendTN - defendRoll.total) / 10) : 0;
  
  let result = {
    attackRoll:  attackRoll.total,
    defendRoll: defendRoll.total,
    attackTN,
    defendTN,
    attackSuccess,
    defendSuccess,
    attackDoS,
    defendDoS,
    winner: null,
    advantage: false,
    penetrateArmor: false
  };
  
  // Determine winner
  if (! attackSuccess && !defendSuccess) {
    result.winner = 'none'; // Both fail
  } else if (attackSuccess && !defendSuccess) {
    result.winner = 'attacker';
    result.advantage = true;
  } else if (!attackSuccess && defendSuccess) {
    result.winner = 'defender';
    result.advantage = true;
  } else {
    // Both succeed - higher DoS wins
    if (attackDoS > defendDoS) {
      result.winner = 'attacker';
    } else if (defendDoS > attackDoS) {
      result.winner = 'defender';
    } else {
      result.winner = 'tie'; // Both succeed, same DoS
    }
  }
  
  return result;
}

export function displayOpposedRollResult(result, attackerName, defenderName) {
  if (!result) return;
  
  let content = `
    <div class="opposed-roll-result">
      <h3>Opposed Roll</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <th style="border: 1px solid #ccc; padding: 0.5rem;">Character</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem;">Roll</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem;">TN</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem;">Success?</th>
          <th style="border: 1px solid #ccc; padding: 0.5rem;">DoS</th>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 0.5rem;"><b>${attackerName}</b> (Attacker)</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.attackRoll}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.attackTN}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.attackSuccess ?  'Yes' : 'No'}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.attackDoS}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ccc; padding: 0.5rem;"><b>${defenderName}</b> (Defender)</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.defendRoll}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.defendTN}</td>
          <td style="border: 1px solid #ccc; padding: 0.5rem;">${result.defendSuccess ? 'Yes' : 'No'}</td>
          <td style="border: 1px solid #ccc; padding:  0.5rem;">${result.defendDoS}</td>
        </tr>
      </table>
      <p style="margin-top: 1rem;"><b>Result:</b> ${getWinnerText(result.winner)}</p>
      ${result.advantage ? '<p><b>Advantage gained! </b></p>' : ''}
    </div>
  `;
  
  ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker()
  });
}

function getWinnerText(winner) {
  switch(winner) {
    case 'attacker': return '<span style="color: green;">Attacker wins!</span>';
    case 'defender': return '<span style="color: blue;">Defender wins!</span>';
    case 'tie': return 'Tie (both succeeded with same DoS)';
    case 'none': return 'Both failed';
    default: return 'Unknown';
  }
}
