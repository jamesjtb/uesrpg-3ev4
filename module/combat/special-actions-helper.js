/**
 * module/combat/special-actions-helper.js
 */

import { hasCondition, applyCondition, removeCondition } from "../conditions/condition-engine.js";
import { getSpecialActionById } from "../config/special-actions.js";
import { ActionEconomy } from "./action-economy.js";

const SYSTEM_ID = "uesrpg-3ev4";

function _resolveActor(docOrUuid) {
  if (!docOrUuid) return null;
  const doc = typeof docOrUuid === "string" ? fromUuidSync(docOrUuid) : docOrUuid;
  if (!doc) return null;
  if (doc.documentName === "Actor") return doc;
  if (doc.documentName === "Token") return doc.actor ?? null;
  if (doc.actor) return doc.actor;
  return null;
}

function _resolveToken(docOrUuid) {
  if (!docOrUuid) return null;
  const doc = typeof docOrUuid === "string" ? fromUuidSync(docOrUuid) : docOrUuid;
  if (!doc) return null;
  if (doc.documentName === "Token") return doc.object ?? null;
  if (doc.actor && doc.document) return doc;
  return null;
}

/**
 * Apply condition safely with metadata for Feint tracking.
 */
async function _applyConditionWithMetadata(actor, conditionKey, { duration = null, source = null, attackerUuid = null } = {}) {
  if (!actor) return null;

  try {
    await applyCondition(actor, conditionKey, { origin: null, source: source ?? "specialAction" });
    
    if (conditionKey === "feinted" && attackerUuid) {
      const effect = actor.effects.find(e => 
        !e.disabled && 
        (e?.flags?.["uesrpg-3ev4"]?.condition?.key === "feinted")
      );
      
      if (effect && duration) {
        await effect.update({
          duration,
          [`flags.uesrpg-3ev4.condition.attackerUuid`]: attackerUuid
        });
      }
    }
    
    return true;
  } catch (err) {
    console.error(`UESRPG | Special Actions | Failed to apply condition "${conditionKey}"`, err);
    return false;
  }
}

async function postSpecialActionCard({
  specialActionId,
  actor,
  target,
  actorToken = null,
  targetToken = null
} = {}) {
  const def = getSpecialActionById(specialActionId);
  if (!def) return null;

  const actorName = actor?.name ?? "Actor";
  const targetName = target?.name ?? "Target";

  const skillMapping = {
    bash: { 
      attacker: ["Athletics", "Combat Style (unarmed)"], 
      defender: ["Athletics", "Combat Style (unarmed)", "Evade"] 
    },
    blindOpponent: { 
      attacker: ["Combat Style"], 
      defender: ["Evade", "Combat Style (with shield)"] 
    },
    disarm: { 
      attacker: ["Athletics", "Combat Style (unarmed)"], 
      defender: ["Athletics", "Combat Style (unarmed)"] 
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
      attacker: ["Athletics", "Combat Style (unarmed)"], 
      defender: ["Athletics", "Combat Style (unarmed)"] 
    },
    trip: { 
      attacker: ["Athletics", "Combat Style (unarmed)"], 
      defender: ["Athletics", "Combat Style (unarmed)", "Evade"] 
    }
  };

  const skills = skillMapping[specialActionId];
  const attackerSkills = skills?.attacker ? skills.attacker.join(", ") : "—";
  const defenderSkills = skills?.defender ? skills.defender.join(", ") : "—";

  const content = `
    <div class="uesrpg-special-action-card" style="padding: 8px;">
      <h2>Special Action: ${def.name}</h2>
      <div style="margin: 8px 0;">
        <b>${actorName} vs ${targetName}</b>
      </div>
      ${skills ? `
        <div style="margin: 8px 0; font-size:13px;">
          <div><b>Attacker Skills:</b> ${attackerSkills}</div>
          <div><b>Defender Skills:</b> ${defenderSkills}</div>
        </div>
        <div style="margin:8px 0; font-style:italic; font-size:12px; opacity:0.85;">
          Resolve this opposed test manually. The system will auto-apply effects when complete.
        </div>
      ` : `
        <div style="margin: 8px 0; font-style:italic; font-size:12px; opacity:0.85;">
          No opposed test required. Effect applied automatically.
        </div>
      `}
    </div>
  `;

  const message = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor, token: actorToken?.document ?? null }),
    content,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      [SYSTEM_ID]: {
        specialAction: {
          id: specialActionId,
          actorUuid: actor.uuid,
          targetUuid: target?.uuid ?? null,
          actorTokenUuid: actorToken?.document?.uuid ?? actorToken?.uuid ?? null,
          targetTokenUuid: targetToken?.document?.uuid ?? targetToken?.uuid ?? null
        }
      }
    }
  });

  return message;
}

export async function executeSpecialAction({
  specialActionId,
  actor,
  target,
  isAdvantageMode = false,
  opposedResult = null
} = {}) {
  const def = getSpecialActionById(specialActionId);
  if (!def) {
    return { success: false, message: "Unknown Special Action." };
  }

  const actorName = actor?.name ?? "Actor";
  const targetName = target?.name ?? "Target";
  const winner = isAdvantageMode ? "attacker" : (opposedResult?.winner ?? null);

  switch (specialActionId) {
    case "arise":
      return await _executeArise({ actor, winner, actorName, isAdvantageMode });
    case "bash":
      return await _executeBash({ actor, target, winner, actorName, targetName, isAdvantageMode });
    case "blindOpponent":
      return await _executeBlindOpponent({ actor, target, winner, actorName, targetName, isAdvantageMode });
    case "disarm":
      return await _executeDisarm({ actor, target, winner, actorName, targetName, isAdvantageMode });
    case "feint":
      return await _executeFeint({ actor, target, winner, actorName, targetName, isAdvantageMode });
    case "forceMovement":
      return await _executeForceMovement({ actor, target, winner, actorName, targetName, isAdvantageMode });
    case "resist":
      return await _executeResist({ actor, target, winner, actorName, targetName, isAdvantageMode });
    case "trip":
      return await _executeTrip({ actor, target, winner, actorName, targetName, isAdvantageMode });
    default:
      return { success: false, message: `No automation for ${def.name}.` };
  }
}

export async function initiateSpecialActionFromSheet({
  specialActionId,
  actor,
  target,
  actorToken = null,
  targetToken = null
} = {}) {
  const def = getSpecialActionById(specialActionId);
  if (!def) {
    ui.notifications.warn("Unknown Special Action.");
    return null;
  }

  if (specialActionId === "arise") {
    const result = await executeSpecialAction({
      specialActionId,
      actor,
      target: null,
      isAdvantageMode: false,
      opposedResult: { winner: "attacker" }
    });

    if (result.success) {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor, token: actorToken?.document ?? null }),
        content: `<div class="uesrpg-special-action-outcome"><b>Special Action:</b><p>${result.message}</p></div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
      });
    }
    return result;
  }

  if (!target) {
    ui.notifications.warn(`${def.name} requires a targeted token.`);
    return null;
  }

  await postSpecialActionCard({
    specialActionId,
    actor,
    target,
    actorToken,
    targetToken
  });

  return { success: true, message: "Special Action card posted." };
}

// Executors
async function _executeArise({ actor, winner, actorName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    await removeCondition(actor, "prone");
    return {
      success: true,
      message: `${actorName} arises without provoking an attack of opportunity.`
    };
  }
  return { success: false, message: `${actorName} fails to arise.` };
}

async function _executeBash({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    await ActionEconomy.spendAP(target, 1, { reason: "bashed", silent: true });
    await applyCondition(target, "prone", { source: "bash" });
    return {
      success: true,
      message: `${actorName} bashes ${targetName}! Knocked back 1m, loses 1 AP, and falls Prone (unless Acrobatics test succeeds).`
    };
  }
  return { success: false, message: `${actorName}'s bash fails.` };
}

async function _executeBlindOpponent({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    const combat = game.combat ?? null;
    const duration = combat?.started
      ? { rounds: 1, startRound: combat.round ?? 0, startTurn: combat.turn ?? 0 }
      : { seconds: 6 };

    await applyCondition(target, "blinded", { source: "blindOpponent" });
    
    const effect = target.effects.find(e => 
      !e.disabled && 
      (e?.flags?.["uesrpg-3ev4"]?.condition?.key === "blinded")
    );
    if (effect) {
      await effect.update({ duration });
    }

    return {
      success: true,
      message: `${actorName} blinds ${targetName} for 1 round.`
    };
  }
  return { success: false, message: `${actorName} fails to blind ${targetName}.` };
}

async function _executeDisarm({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    return {
      success: true,
      message: `${actorName} disarms ${targetName}! Weapon can be taken (if free hand) or flung 1d4m in random direction. (Manual: unequip weapon)`
    };
  }
  return { success: false, message: `${actorName} fails to disarm ${targetName}.` };
}

async function _executeFeint({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    const combat = game.combat ?? null;
    const duration = combat?.started
      ? { rounds: 1, startRound: combat.round ?? 0, startTurn: combat.turn ?? 0 }
      : { seconds: 6 };

    await _applyConditionWithMetadata(target, "feinted", { 
      duration, 
      source: "feint",
      attackerUuid: actor.uuid
    });

    return {
      success: true,
      message: `${actorName} feints! ${targetName} treats next melee attack from ${actorName} as if ${actorName} were Hidden (until end of ${actorName}'s turn).`
    };
  }
  return { success: false, message: `${actorName}'s feint fails.` };
}

async function _executeForceMovement({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    return {
      success: true,
      message: `${actorName} forces movement! Both move up to 3m in same direction (Manual: adjust tokens).`
    };
  }
  return { success: false, message: `${actorName} fails to force movement.` };
}

async function _executeResist({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    await removeCondition(actor, "restrained");
    await removeCondition(actor, "grappled");
    await removeCondition(actor, "blinded");
    
    return {
      success: true,
      message: `${actorName} escapes!`
    };
  }
  return { success: false, message: `${actorName} fails to resist.` };
}

async function _executeTrip({ actor, target, winner, actorName, targetName, isAdvantageMode }) {
  if (winner === "attacker" || isAdvantageMode) {
    await applyCondition(target, "prone", { source: "trip" });
    return {
      success: true,
      message: `${actorName} trips ${targetName}, making them Prone.`
    };
  }
  return { success: false, message: `${actorName} fails to trip ${targetName}.` };
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
