/**
 * HP button handler integration for actor sheet.
 * Overrides the default HP button to open the HP/Temp HP management dialog.
 */

import { HPTempHPDialog } from "../apps/hp-temp-hp-dialog.js";

/**
 * Register HP button handler to intercept clicks on the HP button
 * @param {ActorSheet} sheet - The actor sheet instance
 * @param {jQuery} html - The rendered HTML element
 */
export function registerHPButtonHandler(sheet, html) {
  if (!sheet?.actor) return;

  // Find the HP button (the "Health" button)
  const hpButton = html.find('button[data-resource="hp"]');
  
  if (hpButton.length === 0) return;

  // Remove existing click handlers and add new one
  hpButton.off('click');
  hpButton.on('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await HPTempHPDialog.show(sheet.actor);
  });
}
