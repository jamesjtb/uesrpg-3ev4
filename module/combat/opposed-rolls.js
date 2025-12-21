/**
 * module/combat/opposed-roll.js
 * Opposed-roll wrapper that uses degree-roll-helper.js and damage-automation.js
 * Produces a chat card with both Rolls, DoS/DoF, and resolution.
 *
 * Enhanced with automatic damage calculation and optional application.
 */

import { doTestRoll, resolveOpposed } from "../helpers/degree-roll-helper.js";
import { applyDamage, calculateDamage, DAMAGE_TYPES } from "./damage-automation.js";
import { rollHitLocation } from "./combat-utils.js";

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
    autoApplyDamage = false,
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
      const roll = await new Roll(damageRoll).evaluate({ async: true });
      const rawDamage = Number(roll.total);
      
      // Calculate DoS bonus if enabled and attacker won
      const useDosBonus = game.settings.get("uesrpg-3ev4", "useDosBonus");
      const dosBonus = (useDosBonus && outcome.winner === "attacker" && aRes.isSuccess) 
        ? Math.floor(aRes.degree / 2) 
        : 0;
      
      // Calculate hit location if not provided
      const hitLoc = hitLocation || await rollHitLocation();
      
      // Calculate damage with all reductions
      const damageCalc = calculateDamage(rawDamage, damageType, defender, { 
        penetration, 
        dosBonus 
      });
      
      damageInfo = {
        roll,
        rawDamage,
        dosBonus,
        damageCalc,
        hitLocation: hitLoc,
        damageType
      };
      
      // Build damage HTML
      damageHtml = `
        <div style="margin-top:0.5rem; padding:0.5rem; background:#f5f5f5; border-radius:4px;">
          <strong>Damage Roll:</strong> [[${roll.total}]] (${roll.formula})
          ${dosBonus > 0 ? `<br><strong>DoS Bonus:</strong> +${dosBonus}` : ''}
          <br><strong>Hit Location:</strong> ${hitLoc}
          <br><strong>Type:</strong> ${damageType}
          ${damageCalc.reduction.total > 0 ? `
            <br><strong>Reduction:</strong> -${damageCalc.reduction.total} (Armor: ${damageCalc.reduction.armor}, Resist: ${damageCalc.reduction.resistance}, Tough: ${damageCalc.reduction.toughness})
          ` : ''}
          <br><strong>Final Damage:</strong> <span style="color:#d32f2f; font-weight:bold;">${damageCalc.finalDamage}</span>
          ${!autoApplyDamage ? `<br><button class="apply-damage-btn" data-actor-id="${defender.id}" data-damage="${damageCalc.finalDamage}" data-type="${damageType}" data-location="${hitLoc}">Apply Damage</button>` : ''}
        </div>
      `;
      
      // Auto-apply damage if enabled
      if (autoApplyDamage) {
        await applyDamage(defender, rawDamage, damageType, {
          dosBonus,
          penetration,
          source: weapon ? weapon.name : attacker.name,
          hitLocation: hitLoc
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
      speaker: ChatMessage.getSpeaker({ actor: attacker.id, token: attackerToken.id, scene: canvas.scene?.id }),
      content: html,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
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
