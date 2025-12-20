/**
 * module/combat/opposed-roll.js
 * Small opposed-roll wrapper that uses degree-roll-helper.js
 * Produces a chat card with both Rolls, DoS/DoF, and resolution.
 *
 * This module intentionally does NOT apply HP or actor updates.
 * It renders results and returns structured outcome so GM can apply effects.
 */

import { doTestRoll, resolveOpposed } from "../helpers/degree-roll-helper.js";

export const OpposedRoll = {
  /**
   * Perform an opposed roll between two tokens and post a chat card.
   * attackerToken/defenderToken: Token objects
   * options: { attackerTarget, defenderTarget, flavor }
   */
  async perform(attackerToken, defenderToken, { attackerTarget = null, defenderTarget = null, flavor = "" } = {}) {
    if (!attackerToken || !defenderToken) {
      ui.notifications.warn("Both attacker and defender tokens must be specified.");
      return;
    }

    const attacker = attackerToken.actor;
    const defender = defenderToken.actor;

    // Derive TNs — prefer explicit, fall back to sensible fields (common placements)
    const aTN = attackerTarget ?? Number(attacker.system?.combat?.value ?? attacker.system?.skills?.["Combat Style"]?.value ?? attacker.system?.attributes?.initiative?.value ?? 50);
    const dTN = defenderTarget ?? Number(defender.system?.combat?.value ?? defender.system?.skills?.["Evade"]?.value ?? defender.system?.attributes?.initiative?.value ?? 50);

    const aRes = await doTestRoll(attacker, { rollFormula: "1d100", target: aTN });
    const dRes = await doTestRoll(defender, { rollFormula: "1d100", target: dTN });

    const outcome = resolveOpposed(aRes, dRes);

    const outcomeText = outcome.winner === "attacker" ? `${attacker.name} wins` : (outcome.winner === "defender" ? `${defender.name} wins` : "Tie");

    // Render a compact chat card. For production move to templates/opposed-roll-card.hbs
    const html = `
      <div class="uesrpg-opposed">
        <h3>Opposed Roll: ${attacker.name} vs ${defender.name}</h3>
        <div style="display:flex; gap:1rem;">
          <div style="flex:1; border-right:1px solid #ddd; padding-right:1rem;">
            <h4>${attacker.name}</h4>
            <div>Target: ${aRes.target}</div>
            <div>Roll: ${aRes.rollTotal} — <strong>${aRes.textual}</strong> ${aRes.isCriticalSuccess ? '<span style="color:green">CRITICAL</span>' : ''}${aRes.isCriticalFailure ? '<span style="color:red">CRITICAL FAIL</span>' : ''}</div>
          </div>
          <div style="flex:1; padding-left:1rem;">
            <h4>${defender.name}</h4>
            <div>Target: ${dRes.target}</div>
            <div>Roll: ${dRes.rollTotal} — <strong>${dRes.textual}</strong> ${dRes.isCriticalSuccess ? '<span style="color:green">CRITICAL</span>' : ''}${dRes.isCriticalFailure ? '<span style="color:red">CRITICAL FAIL</span>' : ''}</div>
          </div>
        </div>
        <div style="margin-top:0.5rem;"><strong>Outcome: </strong>${outcomeText} — ${outcome.reason}</div>
        ${flavor ? `<div style="margin-top:0.5rem;">${flavor}</div>` : ""}
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker.id, token: attackerToken.id, scene: canvas.scene?.id }),
      content: html,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      flags: {
        'uesrpg-3ev4': {
          opposed: true,
          attackerId: attacker.id,
          defenderId: defender.id,
          outcome
        }
      },
      roll: aRes.roll
    });

    return { attacker: aRes, defender: dRes, outcome };
  }
};

// Helpful console binding
window.UesrpgOpposed = window.UesrpgOpposed || {};
window.UesrpgOpposed.perform = window.UesrpgOpposed.perform || OpposedRoll.perform;
