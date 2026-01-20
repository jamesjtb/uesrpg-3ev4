/**
 * module/wounds/wound-ticker.js
 *
 * Deterministic combat-driven ticking for Chapter 5 wound automation.
 *
 * Why this exists:
 * - Core Foundry does not automatically advance custom counters stored in effect flags.
 * - External duration modules (e.g. Times Up) are optional and must not be required for RAW.
 *
 * We therefore tick wound automation at the end of each combatant's own turn.
 */

let _registered = false;

/** @type {Map<string, {round: number, turn: number, combatantId: string|null}>} */
const _combatState = new Map();

function _snapshotCombat(combat) {
  const round = Number(combat?.round ?? 0);
  const turn = Number(combat?.turn ?? 0);
  const combatantId = combat?.combatant?.id ?? combat?.combatantId ?? null;
  return { round, turn, combatantId: combatantId ? String(combatantId) : null };
}

function _setState(combat) {
  if (!combat?.id) return;
  _combatState.set(String(combat.id), _snapshotCombat(combat));
}

function _getState(combat) {
  if (!combat?.id) return null;
  return _combatState.get(String(combat.id)) ?? null;
}

/**
 * Register the combat ticker once.
 *
 * @param {object} params
 * @param {(actor: Actor)=>Promise<void>} params.tickActorEndTurn
 */
export function registerWoundCombatTicker({ tickActorEndTurn } = {}) {
  if (_registered) return;
  _registered = true;

  const tickFn = typeof tickActorEndTurn === "function" ? tickActorEndTurn : null;

  // Seed state if combat already exists.
  if (game?.combat) _setState(game.combat);

  Hooks.on("createCombat", (combat) => {
    _setState(combat);
  });

  Hooks.on("deleteCombat", (combat) => {
    if (!combat?.id) return;
    _combatState.delete(String(combat.id));
  });

  Hooks.on("updateCombat", async (combat, changes) => {
    // Avoid double-ticks from multiple connected clients: only the GM runs deterministic ticking.
    if (game?.user?.isGM !== true) return;
    if (!combat?.id) return;

    const prev = _getState(combat);
    if (!prev) {
      _setState(combat);
      return;
    }

    const relevant = ("round" in (changes ?? {})) || ("turn" in (changes ?? {})) || ("combatantId" in (changes ?? {}));
    if (!relevant) return;

    const prevCombatantId = prev.combatantId;
    _setState(combat);

    if (!tickFn || !prevCombatantId) return;

    const prevCombatant = combat.combatants?.get?.(prevCombatantId) ?? null;
    const actor = prevCombatant?.actor ?? null;
    if (!actor) return;

    try {
      await tickFn(actor);
    } catch (err) {
      console.warn("UESRPG | Wounds | combat ticker failed", err);
    }
  });
}
