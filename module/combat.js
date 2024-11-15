/**
 * Handles system-specific combat functionality.
 * @extends {Combat}
 */
export class SystemCombat extends Combat {
  constructor(...args) {
    super(...args);
    this.apAutomationType = game.settings.get("uesrpg-3ev4", "actionPointAutomation");
  }

  resetAllActionPoints() {
    this.turns.forEach((combatant) => {
      combatant.actor.update({
        "system.action_points.value": combatant.actor.system.action_points.max,
      });
    });
  }

  /** @override */
  startCombat() {
    if (["round", "turn"].includes(this.apAutomationType)) {
      this.resetAllActionPoints();
    }

    super.startCombat();
  }

  /** @override */
  nextTurn() {
    if (this.apAutomationType === "turn") {
      if (this.round !== 1 || (this.turn + 1) === this.turns.length) {
        this.nextCombatant().actor.update({
          "system.action_points.value": this.nextCombatant().actor.system.action_points.max,
        });
      }
    }

    super.nextTurn();
  }

  /** @override */
  nextRound() {
    if (this.apAutomationType === "round") {
      this.resetAllActionPoints();
    }

    super.nextRound();
  }

  nextCombatant() {
    let nextTurnIndex = (this.turn + 1) % this.turns.length;
    return this.turns[nextTurnIndex];
  }
}
