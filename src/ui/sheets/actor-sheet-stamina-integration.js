/**
 * Stamina button handler integration for actor sheet.
 * Overrides the default stamina button to open the stamina spending dialog.
 */

import { openStaminaDialog } from "../../core/stamina/stamina-dialog.js";

/**
 * Register stamina button handler to intercept clicks on the stamina button
 * @param {ActorSheet} sheet - The actor sheet instance
 * @param {jQuery} html - The rendered HTML element
 */
export function registerStaminaButtonHandler(sheet, html) {
  if (!sheet?.actor) return;

  // Find the stamina button
  const staminaButton = html.find('button[data-resource="stamina"]');
  
  if (staminaButton.length === 0) return;

  // Remove existing click handlers and add new one
  staminaButton.off('click');
  staminaButton.on('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openStaminaDialog(sheet.actor);
  });
}
