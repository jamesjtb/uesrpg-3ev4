/**
 * module/combat/special-actions-helper.js
 *
 * Special Actions automation helper (Chapter 5 - Advanced Mechanics).
 *
 * Implements:
 * - Regular Special Action usage (costs 1 AP, requires opposed test)
 * - Special Advantage mode (free + auto-win)
 * - Active Effect automation for status conditions
 * - Support for both PC (combat style-based) and NPC (flag-based) Special Actions
 */

import { getSpecialActionById } from "../config/special-actions.js";
import { applyCondition, removeCondition } from "../conditions/condition-engine.js";

/**
 * Execute a Special Action outcome.
 *
 * @param {Object} options
 * @param {string} options.specialActionId - The Special Action ID (e.g., "bash", "trip")
 * @param {Actor} options.actor - The actor performing the Special Action
 * @param {Actor|null} options.target - The target actor (null for non-targeted actions)
 * @param {boolean} options.isAdvantageMode - Whether this is Special Advantage mode (free + auto-win)
 * @param {Object|null} options.opposedResult - The opposed test result {winner: "attacker"|"defender"}
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function executeSpecialAction({ specialActionId, actor, target, isAdvantageMode, opposedResult }) {
  const def = getSpecialActionById(specialActionId);
  if (!def) {
    return { success: false, message: `Unknown Special Action: ${specialActionId}` };
  }

  // In advantage mode, auto-win. In regular mode, check opposed result
  const success = isAdvantageMode || opposedResult?.winner === "attacker";
  
  if (!success) {
    return { success: false, message: `${def.name} failed - defender won the opposed test.` };
  }

  try {
    let message = "";

    switch (specialActionId) {
      case "arise":
        // Remove Prone condition
        if (actor) {
          await removeCondition(actor, "prone");
          message = `${actor.name} rises from prone position without provoking Attacks of Opportunity.`;
        }
        break;

      case "bash":
        // Apply Prone condition + knockback 1 meter
        if (target) {
          await applyCondition(target, "prone", { 
            origin: actor?.uuid, 
            source: `Bashed by ${actor?.name}` 
          });
          message = `${target.name} is knocked prone and pushed back 1 meter.`;
        }
        break;

      case "blindOpponent":
        // Apply Blinded condition for 1 round
        if (target) {
          await applyCondition(target, "blinded", {
            origin: actor?.uuid,
            source: `Blinded by ${actor?.name}`
          });
          message = `${target.name} is blinded for 1 round (-30 to tests requiring sight).`;
        }
        break;

      case "trip":
        // Apply Prone condition
        if (target) {
          await applyCondition(target, "prone", {
            origin: actor?.uuid,
            source: `Tripped by ${actor?.name}`
          });
          message = `${target.name} is knocked prone.`;
        }
        break;

      case "feint":
        // Apply custom effect: next melee defense negated (within 1 round)
        if (target) {
          const effectData = {
            name: "Feinted",
            icon: "icons/svg/combat.svg",
            origin: actor?.uuid,
            duration: { rounds: 1 },
            flags: {
              "uesrpg-3ev4": {
                specialAction: "feint",
                source: `Feinted by ${actor?.name}`
              }
            },
            changes: []
          };

          // Check for existing feint effect to prevent duplicates
          const existing = target.effects.find(e => 
            e.flags?.["uesrpg-3ev4"]?.specialAction === "feint" &&
            e.origin === actor?.uuid
          );

          if (!existing) {
            await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
          }

          message = `${target.name}'s next melee defense is negated (within 1 round).`;
        }
        break;

      case "resist":
        // Remove Restrained condition
        if (actor) {
          await removeCondition(actor, "restrained");
          message = `${actor.name} breaks free from restraints.`;
        }
        break;

      case "disarm":
        // Manual outcome - no automation (requires GM adjudication for item removal)
        if (target) {
          message = `${target.name} is disarmed. GM should remove the weapon from their inventory.`;
        }
        break;

      case "forceMovement":
        // Manual outcome - no automation (requires positioning on map)
        if (target) {
          message = `${target.name} is forced to move. GM should reposition the token.`;
        }
        break;

      default:
        return { success: false, message: `No automation defined for ${def.name}.` };
    }

    return { success: true, message };

  } catch (err) {
    console.error("UESRPG | Failed to execute Special Action automation", err);
    return { success: false, message: `Failed to execute ${def.name}: ${err.message}` };
  }
}

/**
 * Initiate a skill opposed test for a Special Action.
 *
 * @param {Object} options
 * @param {string} options.specialActionId - The Special Action ID
 * @param {string} options.actorTokenUuid - The actor's token UUID
 * @param {string} options.targetTokenUuid - The target's token UUID
 * @returns {Promise<void>}
 */
export async function initiateSpecialActionOpposedTest({ specialActionId, actorTokenUuid, targetTokenUuid }) {
  const def = getSpecialActionById(specialActionId);
  if (!def) {
    ui.notifications?.warn?.(`Unknown Special Action: ${specialActionId}`);
    return;
  }

  // Arise doesn't require an opposed test
  if (specialActionId === "arise") {
    const actor = fromUuidSync(actorTokenUuid)?.actor;
    if (!actor) {
      ui.notifications?.warn?.("No actor found for Arise.");
      return;
    }

    const result = await executeSpecialAction({
      specialActionId: "arise",
      actor,
      target: null,
      isAdvantageMode: false,
      opposedResult: { winner: "attacker" }
    });

    if (result.success) {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="uesrpg-special-action-outcome"><b>Special Action:</b><p>${result.message}</p></div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
      });
    } else {
      ui.notifications?.warn?.(result.message);
    }
    return;
  }

  // Get opposed test skill mapping
  const opposedSkills = getOpposedSkillsForSpecialAction(specialActionId);
  if (!opposedSkills) {
    ui.notifications?.warn?.(`No opposed test defined for ${def.name}.`);
    return;
  }

  // Resolve actor and target
  const actorToken = fromUuidSync(actorTokenUuid);
  const targetToken = fromUuidSync(targetTokenUuid);
  
  if (!actorToken || !targetToken) {
    ui.notifications?.warn?.("Could not resolve actor or target token.");
    return;
  }

  const actor = actorToken.actor;
  const target = targetToken.actor;

  if (!actor || !target) {
    ui.notifications?.warn?.("Could not resolve actor or target.");
    return;
  }

  // Create a pending skill opposed test card
  // This creates a chat message flagged with specialActionId.
  // The GM/players manually resolve the opposed test using the skill opposed workflow.
  // When the outcome is set on the message flags, the createChatMessage hook in init.js
  // will automatically execute the Special Action outcome.
  const content = `
    <div class="uesrpg-special-action-opposed">
      <h3>Special Action: ${def.name}</h3>
      <p><strong>${actor.name}</strong> vs <strong>${target.name}</strong></p>
      <p>Attacker Skills: ${opposedSkills.attacker.join(", ")}</p>
      <p>Defender Skills: ${opposedSkills.defender.join(", ")}</p>
      <p><em>Resolve this opposed test manually. The system will auto-apply effects when complete.</em></p>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      "uesrpg-3ev4": {
        skillOpposed: {
          state: {
            specialActionId,
            attacker: { actorUuid: actor.uuid, tokenUuid: actorTokenUuid },
            defender: { actorUuid: target.uuid, tokenUuid: targetTokenUuid },
            outcome: null // Will be populated by skill opposed workflow when test is resolved
          }
        }
      }
    }
  });

  ui.notifications?.info?.(`${def.name} opposed test initiated. Roll for both parties.`);
}

/**
 * Get opposed skills for a Special Action.
 *
 * @param {string} specialActionId
 * @returns {{attacker: string[], defender: string[]}|null}
 */
function getOpposedSkillsForSpecialAction(specialActionId) {
  const mapping = {
    bash: {
      attacker: ["Athletics", "Combat Style"],
      defender: ["Athletics", "Combat Style", "Evade"]
    },
    blindOpponent: {
      attacker: ["Combat Style"],
      defender: ["Evade", "Combat Style"]
    },
    disarm: {
      attacker: ["Athletics", "Combat Style"],
      defender: ["Athletics", "Combat Style"]
    },
    feint: {
      attacker: ["Combat Style", "Deceive"],
      defender: ["Observe", "Combat Style"]
    },
    forceMovement: {
      attacker: ["Combat Style"],
      defender: ["Combat Style", "Athletics"]
    },
    resist: {
      attacker: ["Athletics"],
      defender: ["Athletics"]
    },
    trip: {
      attacker: ["Athletics"],
      defender: ["Athletics", "Evade"]
    }
  };

  return mapping[specialActionId] ?? null;
}
