/**
 * module/combat/special-actions-helper.js
 * 
 * Full automation for Special Actions (Chapter 5) with:
 * - Interactive opposed test cards with action buttons
 * - Combat Style OR Skill choice for both attacker and defender
 * - Special Advantage mode selection (Free Action OR Auto-Win)
 * - Active Effect automation using system condition engine
 */

import { hasCondition, applyCondition, removeCondition } from "../conditions/condition-engine.js";
import { getSpecialActionById } from "../config/special-actions.js";
import { ActionEconomy } from "./action-economy.js";

const SYSTEM_ID = "uesrpg-3ev4";

/**
 * Show Special Advantage mode selection dialog.
 * @param {string} specialActionId 
 * @returns {Promise<{mode: "free"|"autowin"}|null>}
 */
export async function showSpecialAdvantageDialog(specialActionId) {
  const def = getSpecialActionById(specialActionId);
  if (!def) return null;

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: `Special Advantage: ${def.name}`,
      content: `
        <div style="padding: 10px;">
          <p>You are using <strong>${def.name}</strong> as a Special Advantage.</p>
          <p>Choose how to use it:</p>
          <form>
            <div style="margin: 10px 0;">
              <label>
                <input type="radio" name="advMode" value="free" checked>
                <strong>Free Action</strong> - No AP cost, but roll opposed test normally
              </label>
            </div>
            <div style="margin: 10px 0;">
              <label>
                <input type="radio" name="advMode" value="autowin">
                <strong>Auto-Win</strong> - Automatically win the opposed test (still costs AP if not using as advantage)
              </label>
            </div>
          </form>
        </div>
      `,
      buttons: {
        confirm: {
          label: "Confirm",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            const selected = root?.querySelector('input[name="advMode"]:checked')?.value ?? "free";
            resolve({ mode: selected });
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    });
    dialog.render(true);
  });
}

/**
 * Check if a Combat Style is unarmed.
 * @param {Item} combatStyleItem - Combat Style item
 * @returns {boolean}
 */
function _isUnarmedCombatStyle(combatStyleItem) {
  if (!combatStyleItem) return false;
  const name = String(combatStyleItem.name || "").trim().toLowerCase();
  // Common unarmed combat style names
  return name.includes("unarmed") || 
         name.includes("hand to hand") ||
         name.includes("hand-to-hand") ||
         name.includes("brawling") ||
         name.includes("martial arts");
}

/**
 * Check if a Combat Style can use shields.
 * @param {Item} combatStyleItem - Combat Style item  
 * @returns {boolean}
 */
function _canUseShield(combatStyleItem) {
  if (!combatStyleItem) return false;
  const name = String(combatStyleItem.name || "").trim().toLowerCase();
  // Shield-capable styles (one-handed weapons)
  // Unarmed styles cannot use shields
  if (_isUnarmedCombatStyle(combatStyleItem)) return false;
  // Two-handed weapon styles cannot use shields
  if (name.includes("two-handed") || name.includes("two handed")) return false;
  // Most other combat styles can use shields (sword and board, etc.)
  return true;
}

/**
 * Show test choice dialog BEFORE creating opposed card (NEW PRE-CHOICE FLOW).
 * Returns: { testType: "combatStyle" | "athletics" | "evade" | etc., skillUuid: "..." }
 * @param {Object} options
 * @param {string} options.specialActionId - Special action ID
 * @param {Actor} options.actor - Actor making the choice
 * @param {boolean} options.isDefender - Whether this is for the defender
 * @returns {Promise<{testType: string, skillUuid: string}|null>}
 */
export async function showPreTestChoiceDialog({ specialActionId, actor, isDefender = false }) {
  const def = getSpecialActionById(specialActionId);
  if (!def) return null;

  const options = _getSpecialActionOptions(specialActionId);
  const available = isDefender ? options.defender : options.attacker;

  if (!available || available.length === 0) {
    console.warn(`UESRPG | No options defined for Special Action: ${specialActionId}`);
    return null;
  }

  const isNPC = actor?.type === "NPC";
  const choices = [];

  // Process each available option type
  for (const optType of available) {
    if (optType === "Combat Style") {
      // Generic Combat Style - offer ALL Combat Style items
      if (!isNPC) {
        const combatStyles = actor.items?.filter(i => i.type === "combatStyle") ?? [];
        for (const style of combatStyles) {
          choices.push({
            value: "combatStyle",
            label: `${style.name} (Combat Style)`,
            skillUuid: style.uuid,
            checked: choices.length === 0
          });
        }
      } else {
        // NPC: use combat profession
        if (actor.system?.professions?.combat != null) {
          choices.push({
            value: "combatProfession",
            label: "Combat (Profession)",
            skillUuid: "prof:combat",
            checked: choices.length === 0
          });
        }
      }
    }
    else if (optType === "Combat Style (unarmed)") {
      // Unarmed Combat Style only
      if (!isNPC) {
        const unarmedStyles = actor.items?.filter(i => 
          i.type === "combatStyle" && _isUnarmedCombatStyle(i)
        ) ?? [];
        for (const style of unarmedStyles) {
          choices.push({
            value: "combatStyle",
            label: `${style.name} (Combat Style - Unarmed)`,
            skillUuid: style.uuid,
            checked: choices.length === 0
          });
        }
      } else {
        // NPC: use combat profession (treat as unarmed-capable)
        if (actor.system?.professions?.combat != null) {
          choices.push({
            value: "combatProfession",
            label: "Combat (Profession)",
            skillUuid: "prof:combat",
            checked: choices.length === 0
          });
        }
      }
    }
    else if (optType === "Combat Style (with shield)") {
      // Shield-capable Combat Style
      if (!isNPC) {
        const shieldStyles = actor.items?.filter(i => 
          i.type === "combatStyle" && _canUseShield(i)
        ) ?? [];
        for (const style of shieldStyles) {
          choices.push({
            value: "combatStyle",
            label: `${style.name} (Combat Style - Shield)`,
            skillUuid: style.uuid,
            checked: choices.length === 0
          });
        }
      } else {
        // NPC: use combat profession (treat as shield-capable)
        if (actor.system?.professions?.combat != null) {
          choices.push({
            value: "combatProfession",
            label: "Combat (Profession)",
            skillUuid: "prof:combat",
            checked: choices.length === 0
          });
        }
      }
    }
    else if (optType === "Athletics") {
      if (isNPC) {
        if (actor.system?.professions?.athletics != null) {
          choices.push({
            value: "athletics",
            label: "Athletics (Profession)",
            skillUuid: "prof:athletics",
            checked: choices.length === 0
          });
        }
      } else {
        const skill = actor.items?.find(i => i.type === "skill" && i.name?.toLowerCase() === "athletics");
        if (skill) {
          choices.push({
            value: "athletics",
            label: "Athletics",
            skillUuid: skill.uuid,
            checked: choices.length === 0
          });
        }
      }
    }
    else if (optType === "Evade") {
      const skill = actor.items?.find(i => i.type === "skill" && i.name?.toLowerCase() === "evade");
      if (skill) {
        choices.push({
          value: "evade",
          label: "Evade",
          skillUuid: skill.uuid,
          checked: choices.length === 0
        });
      }
    }
    else if (optType === "Deceive") {
      const skill = actor.items?.find(i => i.type === "skill" && i.name?.toLowerCase() === "deceive");
      if (skill) {
        choices.push({
          value: "deceive",
          label: "Deceive",
          skillUuid: skill.uuid,
          checked: choices.length === 0
        });
      }
    }
    else if (optType === "Observe") {
      const skill = actor.items?.find(i => i.type === "skill" && i.name?.toLowerCase() === "observe");
      if (skill) {
        choices.push({
          value: "observe",
          label: "Observe",
          skillUuid: skill.uuid,
          checked: choices.length === 0
        });
      }
    }
  }

  if (choices.length === 0) {
    ui.notifications.warn(`${actor.name} has no valid options for ${def.name}. Check that they have the required Combat Styles or Skills.`);
    return null;
  }

  // Only show dialog if there are multiple choices
  if (choices.length === 1) {
    return {
      testType: choices[0].value,
      skillUuid: choices[0].skillUuid
    };
  }

  const content = `
    <form class="uesrpg-special-action-test-choice">
      <p><b>Special Action: ${def.name}</b></p>
      <p>Choose your ${isDefender ? 'defense' : 'test'}:</p>
      <div style="margin: 12px 0;">
        ${choices.map(opt => `
          <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <input type="radio" name="testChoice" value="${opt.value}" data-skill-uuid="${opt.skillUuid}" ${opt.checked ? 'checked' : ''} />
            <span><b>${opt.label}</b></span>
          </label>
        `).join('')}
      </div>
    </form>
  `;

  try {
    const result = await Dialog.wait({
      title: `Special Action: ${def.name}`,
      content,
      buttons: {
        ok: {
          label: "Confirm",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            const selected = root?.querySelector('input[name="testChoice"]:checked');
            const testType = selected?.value;
            const skillUuid = selected?.dataset?.skillUuid;
            
            return { testType, skillUuid };
          }
        },
        cancel: { label: "Cancel", callback: () => null }
      },
      default: "ok"
    }, { width: 400 });

    return result ?? null;
  } catch (_e) {
    return null;
  }
}

/**
 * Get available test options for a Special Action.
 * @param {string} specialActionId
 * @returns {{attacker: string[], defender: string[]}}
 */
function _getSpecialActionOptions(specialActionId) {
  const options = {
    bash: {
      attacker: ["Combat Style (unarmed)", "Athletics"],
      defender: ["Combat Style (unarmed)", "Athletics", "Evade"]
    },
    blindOpponent: {
      attacker: ["Combat Style"],
      defender: ["Combat Style (with shield)", "Evade"]
    },
    disarm: {
      attacker: ["Combat Style (unarmed)", "Athletics"],
      defender: ["Combat Style (unarmed)", "Athletics"]
    },
    feint: {
      attacker: ["Combat Style", "Deceive"],
      defender: ["Combat Style", "Observe"]
    },
    forceMovement: {
      attacker: ["Combat Style"],
      defender: ["Combat Style", "Athletics"]
    },
    resist: {
      attacker: ["Combat Style (unarmed)", "Athletics"],
      defender: ["Combat Style (unarmed)", "Athletics"]
    },
    trip: {
      attacker: ["Combat Style (unarmed)", "Athletics"],
      defender: ["Combat Style (unarmed)", "Athletics", "Evade"]
    }
  };

  return options[specialActionId] ?? { attacker: [], defender: [] };
}

/**
 * Show test choice dialog (Combat Style vs Skills).
 * @param {Object} options
 * @param {string} options.title
 * @param {string[]} options.options - Available test types (e.g., ["Combat Style", "Athletics", "Evade"])
 * @param {Actor} options.actor
 * @returns {Promise<{testType: string}|null>}
 */
async function _showTestChoiceDialog({ title, options, actor }) {
  if (!options || options.length === 0) return null;
  if (options.length === 1) return { testType: options[0] };

  // Check if actor has active combat style
  const { getActiveCombatStyleId } = await import("./combat-style-utils.js");
  const activeCombatStyleId = getActiveCombatStyleId(actor);
  const hasCombatStyle = Boolean(activeCombatStyleId);

  // Filter options based on availability
  const availableOptions = options.filter(opt => {
    if (opt === "Combat Style") return hasCombatStyle;
    return true; // Skills are always available if listed
  });

  if (availableOptions.length === 0) {
    ui.notifications.warn("No available test options for this Special Action.");
    return null;
  }

  if (availableOptions.length === 1) {
    return { testType: availableOptions[0] };
  }

  return new Promise((resolve) => {
    const optionsHtml = availableOptions.map((opt, idx) => `
      <div style="margin: 8px 0;">
        <label>
          <input type="radio" name="testChoice" value="${opt}" ${idx === 0 ? 'checked' : ''}>
          <strong>${opt}</strong>
        </label>
      </div>
    `).join('');

    const dialog = new Dialog({
      title,
      content: `
        <div style="padding: 10px;">
          <p>Choose which test to use:</p>
          <form>
            ${optionsHtml}
          </form>
        </div>
      `,
      buttons: {
        confirm: {
          label: "Confirm",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            const selected = root?.querySelector('input[name="testChoice"]:checked')?.value;
            resolve(selected ? { testType: selected } : null);
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "confirm",
      close: () => resolve(null)
    });
    dialog.render(true);
  });
}

/**
 * Find a skill by name with precise matching.
 * @param {Actor} actor
 * @param {string} skillName - Lowercase skill name
 * @returns {Item|null}
 */
function _findSkillByName(actor, skillName) {
  if (!actor || !skillName) return null;
  
  // First try exact match
  const exactMatch = actor.items.find(i =>
    i.type === "skill" &&
    i.name.toLowerCase() === skillName
  );
  if (exactMatch) return exactMatch;
  
  // For known Special Action skills, allow word-boundary matching
  const knownSkills = {
    "athletics": /\bathletics\b/i,
    "evade": /\bevade\b/i,
    "deceive": /\bdeceive\b/i,
    "observe": /\bobserve\b/i
  };
  
  const pattern = knownSkills[skillName];
  if (pattern) {
    return actor.items.find(i =>
      i.type === "skill" &&
      pattern.test(i.name)
    );
  }
  
  return null;
}

/**
 * Get available test options for a Special Action.
 * @param {string} specialActionId
 * @param {"attacker"|"defender"} side
 * @returns {string[]}
 */
function _getTestOptions(specialActionId, side) {
  const mapping = {
    bash: {
      attacker: ["Combat Style", "Athletics"],
      defender: ["Combat Style", "Athletics", "Evade"]
    },
    blindOpponent: {
      attacker: ["Combat Style"],
      defender: ["Combat Style", "Evade"]
    },
    disarm: {
      attacker: ["Combat Style", "Athletics"],
      defender: ["Combat Style", "Athletics"]
    },
    feint: {
      attacker: ["Combat Style", "Deceive"],
      defender: ["Combat Style", "Observe"]
    },
    forceMovement: {
      attacker: ["Combat Style"],
      defender: ["Combat Style", "Athletics"]
    },
    resist: {
      attacker: ["Combat Style", "Athletics"],
      defender: ["Combat Style", "Athletics"]
    },
    trip: {
      attacker: ["Combat Style", "Athletics"],
      defender: ["Combat Style", "Athletics", "Evade"]
    }
  };

  const opts = mapping[specialActionId];
  if (!opts) return [];
  return side === "attacker" ? opts.attacker : opts.defender;
}

/**
 * Render interactive Special Action card HTML.
 * @param {Object} data - Card data
 * @param {string} messageId - Chat message ID
 * @returns {string}
 */
function _renderSpecialActionCard(data, messageId) {
  const { specialActionId, attacker, defender, isFreeAction } = data;
  const def = getSpecialActionById(specialActionId);
  const name = def?.name ?? "Special Action";

  const attackerOptions = _getTestOptions(specialActionId, "attacker");
  const defenderOptions = _getTestOptions(specialActionId, "defender");

  const attackerOptionsText = attackerOptions.join(", ");
  const defenderOptionsText = defenderOptions.join(", ");

  const attackerSection = attacker.result
    ? `<div><strong>${attacker.name}:</strong> ${attacker.testLabel} - ${attacker.result.isSuccess ? 'Success' : 'Failure'} (${attacker.result.rollTotal}/${attacker.result.target})</div>`
    : `<div><strong>${attacker.name}:</strong> <button class="ues-special-action-btn" data-ues-special-action="attacker-roll">Roll Test</button> (${attackerOptionsText})</div>`;

  const defenderSection = defender.result
    ? `<div><strong>${defender.name}:</strong> ${defender.testLabel} - ${defender.result.isSuccess ? 'Success' : 'Failure'} (${defender.result.rollTotal}/${defender.result.target})</div>`
    : `<div><strong>${defender.name}:</strong> <button class="ues-special-action-btn" data-ues-special-action="defender-roll">Roll Opposed</button> (${defenderOptionsText})</div>`;

  let outcomeSection = '';
  if (attacker.result && defender.result && data.outcome) {
    outcomeSection = `
      <div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px;">
        <strong>Outcome:</strong> ${data.outcome.text}
        ${data.outcome.effectMessage ? `<br><em>${data.outcome.effectMessage}</em>` : ''}
      </div>
    `;
  }

  const freeText = isFreeAction ? '<div style="font-style: italic; font-size: 12px; opacity: 0.8;">(Special Advantage: Free Action)</div>' : '';

  return `
    <div class="uesrpg-special-action-card" style="padding: 12px; border: 1px solid #999; border-radius: 4px; background: rgba(255,255,255,0.05);">
      <h3 style="margin: 0 0 8px 0;">Special Action: ${name}</h3>
      ${freeText}
      <div style="margin: 8px 0;">
        ${attackerSection}
      </div>
      <div style="margin: 8px 0;">
        ${defenderSection}
      </div>
      ${outcomeSection}
    </div>
  `;
}

/**
 * Create an interactive opposed test card for a Special Action.
 * @param {Object} options
 * @param {string} options.specialActionId
 * @param {Token} options.attackerToken
 * @param {Token} options.defenderToken
 * @param {boolean} options.isFreeAction
 * @returns {Promise<ChatMessage>}
 */
export async function createSpecialActionOpposedTest({
  specialActionId,
  attackerToken,
  defenderToken,
  isFreeAction = false
}) {
  const def = getSpecialActionById(specialActionId);
  if (!def) return null;

  const attacker = attackerToken?.actor ?? null;
  const defender = defenderToken?.actor ?? null;

  if (!attacker || !defender) {
    ui.notifications.warn("Could not resolve attacker or defender.");
    return null;
  }

  const data = {
    specialActionId,
    isFreeAction,
    attacker: {
      name: attacker.name,
      actorUuid: attacker.uuid,
      tokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
      result: null,
      testLabel: null
    },
    defender: {
      name: defender.name,
      actorUuid: defender.uuid,
      tokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
      result: null,
      testLabel: null
    },
    outcome: null
  };

  const content = _renderSpecialActionCard(data, "pending");

  const message = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: attackerToken.document ?? null }),
    content,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      [SYSTEM_ID]: {
        specialActionOpposed: {
          state: data
        }
      }
    }
  });

  return message;
}

/**
 * Handle Special Action card button clicks.
 * @param {ChatMessage} message
 * @param {string} action - "attacker-roll" or "defender-roll"
 */
export async function handleSpecialActionCardAction(message, action) {
  try {
    // Import helpers once at the start
    const { doTestRoll, resolveOpposed } = await import("../helpers/degree-roll-helper.js");
    
    const data = message.flags?.[SYSTEM_ID]?.specialActionOpposed?.state;
    if (!data) return;

    const { specialActionId, attacker, defender, isFreeAction } = data;
    const def = getSpecialActionById(specialActionId);
    if (!def) return;

    const isAttacker = action === "attacker-roll";
    const side = isAttacker ? attacker : defender;
    const actor = fromUuidSync(side.actorUuid);

    if (!actor) {
      ui.notifications.warn("Could not resolve actor for this action.");
      return;
    }

    // Check if already rolled
    if (side.result) {
      ui.notifications.warn(`${side.name} has already rolled.`);
      return;
    }

    // Show test choice dialog
    const options = _getTestOptions(specialActionId, isAttacker ? "attacker" : "defender");
    const choice = await _showTestChoiceDialog({
      title: `${def.name} - ${side.name}`,
      options,
      actor
    });

    if (!choice) return;

    // Perform roll
    let rollResult;
    let testLabel;

    if (choice.testType === "Combat Style") {
      // Roll using Combat Style TN
      const { computeTN } = await import("./tn.js");
      const tn = computeTN(actor, { difficultyKey: "average" });
      rollResult = await doTestRoll(actor, {
        rollFormula: "1d100",
        target: tn.finalTN,
        allowLucky: true,
        allowUnlucky: true
      });
      testLabel = "Combat Style";
    } else {
      // Roll using Skill TN
      const skillName = choice.testType.toLowerCase();
      
      // Find skill item with precise matching
      const skillItem = _findSkillByName(actor, skillName);

      if (!skillItem) {
        ui.notifications.warn(`${actor.name} does not have the ${choice.testType} skill.`);
        return;
      }

      const { computeSkillTN } = await import("../skills/skill-tn.js");
      const tn = computeSkillTN({
        actor,
        skillItem,
        difficultyKey: "average",
        manualMod: 0
      });

      rollResult = await doTestRoll(actor, {
        rollFormula: "1d100",
        target: tn.finalTN,
        allowLucky: true,
        allowUnlucky: true
      });
      testLabel = choice.testType;
    }

    // Update side with result
    side.result = rollResult;
    side.testLabel = testLabel;

    // Check if both have rolled
    if (attacker.result && defender.result) {
      // Resolve outcome
      const opposedResult = resolveOpposed(attacker.result, defender.result);

      const outcomeText = opposedResult.winner === "attacker"
        ? `${attacker.name} wins!`
        : (opposedResult.winner === "defender" ? `${defender.name} wins!` : "Tie!");

      // Execute Special Action effects
      const attackerActor = fromUuidSync(attacker.actorUuid);
      const defenderActor = fromUuidSync(defender.actorUuid);
      
      if (!attackerActor || !defenderActor) {
        console.error("UESRPG | Special Action: Could not resolve actors for effect execution");
        data.outcome = {
          ...opposedResult,
          text: outcomeText,
          effectMessage: "Error: Could not resolve actors"
        };
      } else {
        const executionResult = await executeSpecialAction({
          specialActionId,
          actor: attackerActor,
          target: defenderActor,
          isAutoWin: false,
          opposedResult
        });

        data.outcome = {
          ...opposedResult,
          text: outcomeText,
          effectMessage: executionResult.success ? executionResult.message : null
        };
      }
    }

    // Update message
    await message.update({
      content: _renderSpecialActionCard(data, message.id),
      [`flags.${SYSTEM_ID}.specialActionOpposed.state`]: data
    });

  } catch (err) {
    console.error("UESRPG | Special Action card action failed", err);
    ui.notifications.error("Special Action failed. Check console for details.");
  }
}

/**
 * Execute Special Action effects.
 * @param {Object} options
 * @param {string} options.specialActionId
 * @param {Actor} options.actor
 * @param {Actor} options.target
 * @param {boolean} options.isAutoWin
 * @param {Object} options.opposedResult
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function executeSpecialAction({
  specialActionId,
  actor,
  target,
  isAutoWin = false,
  opposedResult = null
} = {}) {
  const def = getSpecialActionById(specialActionId);
  if (!def) {
    return { success: false, message: "Unknown Special Action." };
  }

  const actorName = actor?.name ?? "Actor";
  const targetName = target?.name ?? "Target";
  const winner = isAutoWin ? "attacker" : (opposedResult?.winner ?? null);

  switch (specialActionId) {
    case "arise":
      return await _executeArise({ actor, winner, actorName, isAutoWin });
    case "bash":
      return await _executeBash({ actor, target, winner, actorName, targetName, isAutoWin });
    case "blindOpponent":
      return await _executeBlindOpponent({ actor, target, winner, actorName, targetName, isAutoWin });
    case "disarm":
      return await _executeDisarm({ actor, target, winner, actorName, targetName, isAutoWin });
    case "feint":
      return await _executeFeint({ actor, target, winner, actorName, targetName, isAutoWin });
    case "forceMovement":
      return await _executeForceMovement({ actor, target, winner, actorName, targetName, isAutoWin });
    case "resist":
      return await _executeResist({ actor, target, winner, actorName, targetName, isAutoWin });
    case "trip":
      return await _executeTrip({ actor, target, winner, actorName, targetName, isAutoWin });
    default:
      return { success: false, message: `No automation for ${def.name}.` };
  }
}

/**
 * Initiate Special Action from character sheet.
 * @param {Object} options
 * @param {string} options.specialActionId
 * @param {Actor} options.actor
 * @param {Actor} options.target
 * @param {Token} options.actorToken
 * @param {Token} options.targetToken
 * @returns {Promise<Object>}
 */
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

  // Arise doesn't need a target
  if (specialActionId === "arise") {
    const result = await executeSpecialAction({
      specialActionId,
      actor,
      target: null,
      isAutoWin: false,
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

  // Other Special Actions require a target
  if (!target) {
    ui.notifications.warn(`${def.name} requires a targeted token.`);
    return null;
  }

  // Create interactive opposed test card
  await createSpecialActionOpposedTest({
    specialActionId,
    attackerToken: actorToken,
    defenderToken: targetToken,
    isFreeAction: false
  });

  return { success: true, message: "Special Action test initiated." };
}

/**
 * Create Acrobatics test card for Bash follow-up.
 * Target must pass to avoid becoming Prone.
 * @param {Actor} target - The actor who was bashed
 */
async function _createBashAcrobaticsTest(target) {
  // Find Acrobatics skill (exact match, case-insensitive)
  const acrobatics = target.items.find(i => 
    i.type === "skill" && 
    String(i.name || "").trim().toLowerCase() === "acrobatics"
  );

  if (!acrobatics) {
    ui.notifications.warn(`${target.name} has no Acrobatics skill. Apply Prone manually if they fail.`);
    return;
  }

  // Find target's token
  const targetToken = canvas.tokens?.placeables?.find(t => t.actor?.uuid === target.uuid) ?? null;

  // Create a simple skill test card (not opposed, just a single roll)
  const { computeSkillTN } = await import("../skills/skill-tn.js");
  const { doTestRoll } = await import("../helpers/degree-roll-helper.js");
  
  const tn = computeSkillTN({
    actor: target,
    skillItem: acrobatics,
    difficultyKey: "average",
    manualMod: 0,
    useSpecialization: false,
    situationalMods: []
  });

  const result = await doTestRoll(target, {
    rollFormula: "1d100",
    target: tn.finalTN,
    allowLucky: true,
    allowUnlucky: true
  });

  // Post the roll to chat
  await result.roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: target, token: targetToken?.document ?? null }),
    flavor: `Acrobatics — Bash Follow-Up (avoid Prone)`,
    rollMode: game.settings.get("core", "rollMode")
  });

  // Apply Prone if they failed
  if (!result.isSuccess) {
    await applyCondition(target, "prone", { source: "bash-failed-acrobatics" });
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="uesrpg-bash-outcome"><b>Bash Follow-Up:</b><p>${target.name} fails the Acrobatics test and falls Prone!</p></div>`,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  } else {
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="uesrpg-bash-outcome"><b>Bash Follow-Up:</b><p>${target.name} passes the Acrobatics test and avoids falling Prone.</p></div>`,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
  }
}

// ============================================================================
// EXECUTORS
// ============================================================================

async function _executeArise({ actor, winner, actorName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
    await removeCondition(actor, "prone");
    return {
      success: true,
      message: `${actorName} arises without provoking an attack of opportunity.`
    };
  }
  return { success: false, message: `${actorName} fails to arise.` };
}

async function _executeBash({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
    // Remove 1 AP
    await ActionEconomy.spendAP(target, 1, { reason: "bashed", silent: true });

    // Create Acrobatics test card for target (RAW: must pass to avoid Prone)
    await _createBashAcrobaticsTest(target);

    return {
      success: true,
      message: `${actorName} bashes ${targetName}! Knocked back 1m, loses 1 AP. ${targetName} must pass Acrobatics test to avoid Prone. (Manual: move token back 1m)`
    };
  }
  return { success: false, message: `${actorName}'s bash fails.` };
}

async function _executeBlindOpponent({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
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

async function _executeDisarm({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
    return {
      success: true,
      message: `${actorName} disarms ${targetName}! Weapon can be taken or flung 1d4m. (Manual: unequip weapon)`
    };
  }
  return { success: false, message: `${actorName} fails to disarm ${targetName}.` };
}

async function _executeFeint({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
    const combat = game.combat ?? null;
    const duration = combat?.started
      ? { rounds: 1, startRound: combat.round ?? 0, startTurn: combat.turn ?? 0 }
      : { seconds: 6 };

    await applyCondition(target, "feinted", { source: "feint" });

    const effect = target.effects.find(e =>
      !e.disabled &&
      (e?.flags?.["uesrpg-3ev4"]?.condition?.key === "feinted")
    );

    if (effect) {
      await effect.update({
        duration,
        [`flags.uesrpg-3ev4.condition.attackerUuid`]: actor.uuid
      });
    }

    return {
      success: true,
      message: `${actorName} feints! ${targetName} cannot defend against ${actorName}'s next melee attack.`
    };
  }
  return { success: false, message: `${actorName}'s feint fails.` };
}

async function _executeForceMovement({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
    return {
      success: true,
      message: `${actorName} forces movement! Both move up to 3m in same direction (Manual: adjust tokens).`
    };
  }
  return { success: false, message: `${actorName} fails to force movement.` };
}

async function _executeResist({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
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

async function _executeTrip({ actor, target, winner, actorName, targetName, isAutoWin }) {
  if (winner === "attacker" || isAutoWin) {
    await applyCondition(target, "prone", { source: "trip" });
    return {
      success: true,
      message: `${actorName} trips ${targetName}, making them Prone.`
    };
  }
  return { success: false, message: `${actorName} fails to trip ${targetName}.` };
}
