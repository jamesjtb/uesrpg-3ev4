/**
 * src/core/magic/backfire.js

 *
 * Magical backfire detection and handling (RAW p.128 lines 225-233).
 * Full backfire tables implementation deferred to future milestone.
 */

import { getMagicSkillLevel } from "./magicka-utils.js";
import { doTestRoll } from "../../utils/degree-roll-helper.js";
import { actorHasTalent } from "./magic-modifiers.js";

/**
 * Check if spell should trigger backfire on failure
 * RAW p.128 lines 225-233:
 *  - Always backfire on critical failure
 *  - Backfire on normal failure IF:
 *    - Spell is unconventional, OR
 *    - Spell level > caster's spellcasting level
 *
 * @param {Item} spell - The spell that failed
 * @param {Actor} actor - The caster
 * @param {boolean} isCriticalFailure - Whether the roll was a critical failure
 * @param {boolean} isFailure - Whether the roll failed
 * @returns {boolean} - True if backfire should occur
 */
export function shouldBackfire(spell, actor, isCriticalFailure, isFailure) {
  // Always backfire on critical failure
  if (isCriticalFailure) return true;
  
  // No backfire if spell succeeded
  if (!isFailure) return false;
  
  const spellLevel = Number(spell.system?.level ?? 1);
  const spellcastingLevel = getMagicSkillLevel(actor, spell.system?.school);
  const isUnconventional = String(spell.system?.spellType ?? "").toLowerCase() === "unconventional";
  
  // Backfire on normal failure if unconventional OR spell level exceeds caster level
  return isUnconventional || (spellLevel > spellcastingLevel);
}

/**
 * Trigger backfire notification and GM prompt
 * TODO: Implement full backfire tables from Chapter 6 p.156+
 *
 * @param {Actor} actor - The caster
 * @param {Item} spell - The spell that backfired
 * @returns {Promise<void>}
 */
export async function triggerBackfire(actor, spell) {
  const spellLevel = Number(spell.system?.level ?? 1);
  const school = String(spell.system?.school ?? "Unknown");
  
  // Talent (Chapter 4): Control — may test Willpower to negate a backfire.
  if (actorHasTalent(actor, "Control")) {
    const doAttempt = await Dialog.confirm({
      title: "Magical Backfire — Control",
      content: `<p>${actor.name} has <b>Control</b>. Attempt a Willpower test to negate the backfire?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: true
    });

    if (doAttempt) {
      const wpTN = Number(actor?.system?.characteristics?.wp?.total ?? 0) || 0;
      const res = await doTestRoll(actor, {
        target: wpTN,
        allowLucky: true,
        allowUnlucky: true
      });

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<b>${actor.name}</b> — Control (negate backfire)`
      });

      if (res.isSuccess) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="uesrpg-backfire" style="border: 2px solid #2d7; padding: 10px; background: rgba(0,128,0,0.08);">
              <h3 style="margin-top: 0;">Backfire Negated</h3>
              <p><strong>${actor.name}</strong> negated the backfire from <strong>${spell.name}</strong> using <strong>Control</strong>.</p>
            </div>`
        });
        return;
      }
    }
  }

  ui.notifications.warn(`Magical Backfire! ${spell.name} backfired on ${actor.name}!`);
  
  // Create chat message for GM with backfire details
  const content = `
    <div class="uesrpg-backfire" style="border: 2px solid #cc0000; padding: 10px; background: #ffe0e0;">
      <h3 style="margin-top: 0; color: #cc0000;">⚠️ Magical Backfire!</h3>
      <p><strong>Caster:</strong> ${actor.name}</p>
      <p><strong>Spell:</strong> ${spell.name}</p>
      <p><strong>School:</strong> ${school} (Level ${spellLevel})</p>
      <hr style="border-color: #cc0000;">
      <p><strong>Action Required:</strong> Roll <code>[[/r 1d4 + ${spellLevel}]]</code> on the ${school} backfire table (Chapter 6 p.156+)</p>
      <p style="font-size: 0.9em; font-style: italic; margin-bottom: 0;">
        Full backfire table automation is planned for a future release.
      </p>
    </div>
  `;
  
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });
}
