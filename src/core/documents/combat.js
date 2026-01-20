/**
 * Handles system-specific combat functionality.
 * @extends {Combat}
 */
export class SystemCombat extends Combat {
  constructor(...args) {
    super(...args);
    this.apAutomationType = game.settings.get("uesrpg-3ev4", "actionPointAutomation");
  }

  _actorHasCondition(actor, key) {
    if (!actor || !key) return false;
    const k = String(key).trim().toLowerCase();

    // Prefer the system condition API (ActiveEffect flags)
    const api = game?.uesrpg?.conditions;
    if (api?.hasCondition && typeof api.hasCondition === "function") {
      try {
        return !!api.hasCondition(actor, k);
      } catch (_e) {
        // Fall through to name-based detection.
      }
    }

    const effects = actor?.effects?.contents ?? [];
    return effects.some((e) => {
      const n = String(e?.name ?? "").trim().toLowerCase();
      return n === k || n.startsWith(`${k} `) || n.startsWith(`${k}(`);
    });
  }

  _refreshActionPoints(actor) {
    if (!actor) return;

    const maxRaw = Number(actor?.system?.action_points?.max ?? 0);
    const max = Number.isFinite(maxRaw) ? maxRaw : 0;

    // Chapter 5: Dazed -> gain 1 fewer AP at the beginning of each round (minimum 1).
    // We implement this by reducing action_points.max via ActiveEffects, then clamping
    // the refresh to at least 1 while Dazed is present.
    const min = this._actorHasCondition(actor, "dazed") ? 1 : 0;
    let next = Math.max(min, max);

    // Chapter 5: Wounds to the body cause the target to lose 1 AP, or start next refresh
    // with 1 fewer AP if already at 0. We implement the "next refresh" rule as a debt flag
    // that is consumed on the next AP refresh.
    const debtRaw = Number(actor.getFlag("uesrpg-3ev4", "wounds.apDebtNextRefresh") ?? 0);
    const debt = Number.isFinite(debtRaw) ? debtRaw : 0;
    if (debt > 0) {
      next = Math.max(min, next - debt);
      // Clear debt once consumed.
      actor.unsetFlag("uesrpg-3ev4", "wounds.apDebtNextRefresh").catch(() => {});
    }

    actor.update({ "system.action_points.value": next });
  }

  resetAllActionPoints() {
    this.turns.forEach((combatant) => {
      this._refreshActionPoints(combatant?.actor);
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
        this._refreshActionPoints(this.nextCombatant()?.actor);
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
    const nextTurnIndex = (this.turn + 1) % this.turns.length;
    return this.turns[nextTurnIndex];
  }
}
