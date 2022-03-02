/**
 * Handles system-specific combat functionality.
 * @extends {Combat}
 */
export class SystemCombat extends Combat {

  /** @override */
  startCombat() {
    if (game.settings.get("uesrpg-d100", "automateActionPoints")) {
      // Set all combatant's action points to their maximum values.
      this.turns.forEach((combatant) => {
        combatant.actor.update({
          "data.action_points.value": combatant.actor.data.data.action_points.max,
        });
      });
    }

    super.startCombat();
  }

  /** @override */
  nextTurn() {
    if (game.settings.get("uesrpg-d100", "automateActionPoints")) {
      // Set the next combatant's action points to their maximum value, but only if it's not the first round of combat.
      // Characters can take reactions before their first turn, but they start with less AP on their first turn as a
      // result. The 3rd edition v3 core rules state:
      //  "Characters that aren’t surprised and that haven’t started their turn yet may still take up to three reactions
      //   excluding Attacks of Opportunity and Counter Attacking. For each reaction taken in this way, the character
      //   starts with one less AP when their turn starts for this round."
      // Note: In Foundry, rounds are one-indexed, whereas turns are zero-indexed.
      if (this.round !== 1 || (this.turn + 1) === this.turns.length) {
        this.nextCombatant().actor.update({
          "data.action_points.value": this.nextCombatant().actor.data.data.action_points.max,
        });
      }
    }

    super.nextTurn();
  }

  nextCombatant() {
    let nextTurnIndex = (this.turn + 1) % this.turns.length;
    return this.turns[nextTurnIndex];
  }
}
