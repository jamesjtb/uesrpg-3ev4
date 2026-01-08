/**
 * module/magic/backfire.js
 *
 * Magical backfire detection and handling (RAW p.128 lines 225-233).
 * Full backfire tables implementation deferred to future milestone.
 */

import { getMagicSkillLevel } from "./magicka-utils.js";

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
  
  ui.notifications.warn(`⚠️ Magical Backfire! ${spell.name} backfired on ${actor.name}!`);
  
  // Create chat message for GM with backfire details
  const content = `
    <div class="uesrpg-backfire" style="border: 2px solid #cc0000; padding: 10px; background: #ffe0e0;">
      <h3 style="margin-top: 0; color: #cc0000;">⚠️ Magical Backfire!</h3>
      <p><strong>Caster:</strong> ${actor.name}</p>
      <p><strong>Spell:</strong> ${spell.name}</p>
      <p><strong>School:</strong> ${school} (Level ${spellLevel})</p>
      <hr style="border-color: #cc0000;">
      <p><strong>Action Required:</strong> Roll <code>1d4 + ${spellLevel}</code> on the ${school} backfire table (Chapter 6 p.156+)</p>
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
