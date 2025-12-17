/**
 * Handle chat message button clicks for opposed cards
 */
export function registerChatListeners() {
  Hooks.on('renderChatMessage', (message, html, data) => {
    // Only process opposed cards
    if (!message.flags?.['uesrpg-3ev4']?.opposedCard) return;

    // Resolve button
    html.find('[data-action="resolve-opposed"]').click(async (event) => {
      event.preventDefault();
      const { OpposedCardManager } = await import('./opposed-card-manager.js');
      await OpposedCardManager.resolve(message.id);
    });

    // Close button
    html.find('[data-action="close-card"]').click(async (event) => {
      event.preventDefault();
      const { OpposedCardManager } = await import('./opposed-card-manager.js');
      await OpposedCardManager.close(message.id);
    });

    // Remove participant
    html.find('.remove-participant').click(async (event) => {
      event.preventDefault();
      const actorId = event.currentTarget.dataset.participantId;
      const { OpposedCardManager } = await import('./opposed-card-manager.js');
      await OpposedCardManager.removeParticipant(message.id, actorId);
    });
  });
}
