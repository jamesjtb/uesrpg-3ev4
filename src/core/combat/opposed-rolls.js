/**
 * src/core/combat/opposed-rolls.js
 * Opposed-roll wrapper that uses degree-roll-helper.js and damage-automation.js
 * Produces a chat card with both Rolls, DoS/DoF, and resolution.
 *
 * Enhanced with automatic damage calculation and optional application.
 */

import { doTestRoll, resolveOpposed } from "../../utils/degree-roll-helper.js";
import { calculateDamage, DAMAGE_TYPES } from "./damage-automation.js";
import { applyDamageResolved } from "./damage-resolver.js";
import { getHitLocationFromRoll } from "./combat-utils.js";

export const OpposedRoll = {
  /**
   * Perform an opposed roll between two tokens and post a chat card.
   * attackerToken/defenderToken: Token objects
   * options: {
   *   attackerTarget, defenderTarget, flavor,
   *   weapon, damageRoll, damageType, autoApplyDamage,
   *   hitLocation, penetration
   * }
   */
  async perform(attackerToken, defenderToken, {
    attackerTarget = null,
    defenderTarget = null,
    flavor = "",
    weapon = null,
    damageRoll = null,
    damageType = DAMAGE_TYPES.PHYSICAL,
    autoApplyDamage = true,
    hitLocation = null,
    penetration = 0
  } = {}) {
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

    // Calculate damage if attacker wins and damage roll provided
    let damageInfo = null;
    let damageHtml = "";
    
    if (outcome.winner === "attacker" && damageRoll) {
      // Roll damage
      // Foundry V13+: Roll#evaluate is async by default; do not pass the removed `{async:true}` option.
      const roll = await new Roll(damageRoll).evaluate();
      const rawDamage = Number(roll.total);
      
      // Calculate hit location if not provided
      // RAW: hit location comes from the ones digit of the *attack roll*
      const hitLoc = hitLocation || getHitLocationFromRoll(aRes.rollTotal);
      
      // Calculate damage with all reductions
      const damageCalc = calculateDamage(rawDamage, damageType, defender, {
        penetration: penetration || 0,
        hitLocation: hitLoc
      });
      
      damageInfo = {
        roll,
        rawDamage,
damageCalc,
        hitLocation: hitLoc,
        damageType
      };
      
      // Build damage HTML
      damageHtml = `
        <div style="margin-top:0.5rem; padding:0.5rem; background:#f5f5f5; border-radius:4px;">
          <strong>Damage Roll:</strong> [[${roll.total}]] (${roll.formula})
<br><strong>Hit Location:</strong> ${hitLoc}
          <br><strong>Type:</strong> ${damageType}
          ${damageCalc.reductions.total > 0 ? `
            <br><strong>Reduction:</strong> -${damageCalc.reductions.total} (Armor: ${damageCalc.reductions.armor}, Resist: ${damageCalc.reductions.resistance}, Tough: ${damageCalc.reductions.toughness})
          ` : ''}
          <br><strong>Final Damage:</strong> <span style="color:#d32f2f; font-weight:bold;">${damageCalc.finalDamage}</span>
          ${!autoApplyDamage ? `
            <br><button type="button" class="apply-damage-btn"
              data-target-uuid="${defender.uuid}"
              data-attacker-actor-uuid="${attacker.uuid}"
              data-weapon-uuid="${weapon?.uuid ?? ''}"
              data-damage="${rawDamage}"
              data-damage-type="${damageType}"
              data-hit-location="${hitLoc}"
              data-penetration="${penetration || 0}"
              data-source="${weapon ? weapon.name : attacker.name}">
              Apply Damage
            </button>` : ''}
        </div>
      `;
      
      // Auto-apply damage if enabled
      if (autoApplyDamage) {
        await applyDamageResolved(defender, {
          rawDamage,
          damageType,
penetration,
          hitLocation: hitLoc,
          source: weapon ? weapon.name : attacker.name,
          attackerActor: attacker,
          weapon,
        });
      }
    }

    // Render a compact chat card. For production move to templates/opposed-roll-card.hbs
    const html = `
      <div class="uesrpg-opposed">
        <h3>Opposed Roll: ${attacker.name} vs ${defender.name}</h3>
        ${weapon ? `<div style="font-style:italic; margin-bottom:0.5rem;">Weapon: ${weapon.name}</div>` : ''}
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
        ${damageHtml}
        ${flavor ? `<div style="margin-top:0.5rem;">${flavor}</div>` : ""}
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: attackerToken.document?.id, scene: canvas.scene?.id }),
      content: html,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        'uesrpg-3ev4': {
          opposed: true,
          attackerId: attacker.id,
          defenderId: defender.id,
          outcome,
          damageInfo
        }
      },
      roll: aRes.roll
    });

    return { 
      attacker: aRes, 
      defender: dRes, 
      outcome,
      damage: damageInfo
    };
  }
};

// Helpful console binding
window.UesrpgOpposed = window.UesrpgOpposed || {};
window.UesrpgOpposed.perform = window.UesrpgOpposed.perform || OpposedRoll.perform;
