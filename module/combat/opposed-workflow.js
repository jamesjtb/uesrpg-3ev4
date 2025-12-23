/**
 * module/combat/opposed-workflow.js
 * Opposed test workflow (WFRP-like) for UESRPG 3ev4.
 *
 * Second-order pass:
 * - TN derivation guarantees (fallback derive from actor/item when TN not provided)
 * - Defense option filtering via DefenseDialog (dynamic + basic ranged filtering)
 * - Proper DoS when TN > 100 is already handled by degree-roll-helper.js
 * - Critical handling: ensures allowLucky/allowUnlucky flags passed through
 * - Safer flag updates (only update system namespace)
 *
 * NOTE: This file intentionally remains non-ApplicationV2 (v13-safe legacy approach).
 */

import { doTestRoll, resolveOpposed } from "../helpers/degree-roll-helper.js";
import { DefenseDialog } from "./defense-dialog.js";

function _asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

async function _resolveDoc(uuid) {
  if (!uuid) return null;
  try { return await fromUuid(uuid); } catch (_e) { return null; }
}

async function _resolveActorFromDoc(uuid) {
  const doc = await _resolveDoc(uuid);
  if (!doc) return null;
  // TokenDocument / Token / Actor
  if (doc?.actor) return doc.actor;
  if (doc?.document?.actor) return doc.document.actor;
  if (doc?.type && doc?.system) return doc; // Actor
  return null;
}

async function _resolveItem(uuid) {
  const doc = await _resolveDoc(uuid);
  if (!doc) return null;
  // Item embedded or world item
  if (doc?.type && doc?.system) return doc;
  return null;
}

function _getItemTN(item) {
  return _asNumber(item?.system?.value ?? item?.system?.total ?? item?.system?.tn ?? 0);
}

function _getActorFallbackTN(actor) {
  // Prefer combat total/value if present; fallback to STR/AGI max.
  const combat = _asNumber(actor?.system?.combat?.total ?? actor?.system?.combat?.value ?? 0);
  if (combat) return combat;
  const str = _asNumber(actor?.system?.characteristics?.str?.total ?? actor?.system?.characteristics?.str?.value ?? 0);
  const agi = _asNumber(actor?.system?.characteristics?.agi?.total ?? actor?.system?.characteristics?.agi?.value ?? 0);
  return Math.max(str, agi, 0);
}

function _inferIsRangedFromItem(item) {
  // Best-effort inference; your schema doesn't define a strict ranged flag in template.json.
  const reach = String(item?.system?.reach ?? "").toLowerCase();
  const name = String(item?.name ?? "").toLowerCase();
  // Heuristics: "ranged", "bow", "crossbow", "gun", "rifle", "pistol", "throw"
  if (reach.includes("ranged") || reach.includes("range")) return true;
  if (/(bow|crossbow|rifle|pistol|gun|thrown|throw)/i.test(name)) return true;
  return false;
}

function _renderResultLine(side) {
  // side: {target, modifier, result}
  const tgt = _asNumber(side?.target);
  const mod = _asNumber(side?.modifier);
  const tn = tgt + mod;

  if (!side?.result) {
    return `<div><b>Target:</b> ${tn}</div>`;
  }

  const total = (side.result.rollTotal ?? side.result.total ?? side.result?.roll?.total);
  const deg = side.result.textual ?? (side.result.isSuccess ? `${side.result.degree} DoS` : `${side.result.degree} DoF`);
  const crit = side.result.isCriticalSuccess ? " <b>(CRIT SUCCESS)</b>" : (side.result.isCriticalFailure ? " <b>(CRIT FAILURE)</b>" : "");
  return `
    <div><b>Target:</b> ${tn}</div>
    <div><b>Roll:</b> ${total} — ${deg}${crit}</div>
  `;
}

function _renderCard(data) {
  const a = data.attacker;
  const d = data.defender;

  const aLine = _renderResultLine(a);
  const dLine = d.noDefense
    ? `<div><b>Defense:</b> No Defense</div><div><b>Target:</b> 0</div><div><b>Roll:</b> 100 — 1 DoF</div>`
    : `
      <div><b>Test:</b> ${d.label ?? "(choose)"}</div>
      ${_renderResultLine(d)}
    `;

  const outcome = data.outcome?.text
    ? `<div style="margin-top:10px;"><b>Outcome:</b> ${data.outcome.text}</div>`
    : "";

  return `
    <div class="ues-opposed-card" data-message-id="${data.messageId ?? ""}">
      <h2>Opposed Test</h2>
      <div class="ues-opposed-row" style="display:flex; gap:16px;">
        <div class="ues-opposed-side" style="flex:1;">
          <h3>${a.name}</h3>
          <div><b>Test:</b> ${a.label}</div>
          ${aLine}
          ${a.result ? "" : `<button type="button" data-ues-opposed-action="attacker-roll" data-side="attacker">Roll</button>`}
        </div>

        <div class="ues-opposed-side" style="flex:1;">
          <h3>${d.name}</h3>
          ${dLine}
          ${(!d.result && !d.noDefense) ? `<button type="button" data-ues-opposed-action="defender-roll" data-side="defender">Defend</button>` : ""}
          ${(!d.result && !d.noDefense) ? `<button type="button" data-ues-opposed-action="defender-nodef" data-side="defender">No Defense</button>` : ""}
        </div>
      </div>
      ${outcome}
    </div>
  `;
}

async function _updateMessageCard(message, opposedData) {
  const content = _renderCard(opposedData);
  await message.update({
    content,
    [`flags.uesrpg-3ev4.opposed`]: opposedData
  });
}

export class OpposedWorkflow {
  /**
   * Create a pending opposed test chat message.
   * cfg: { attackerTokenUuid, defenderTokenUuid, attackerActorUuid, defenderActorUuid, attackerItemUuid, attackerLabel, attackerTarget, mode }
   */
  static async createPending(cfg) {
    const attacker = await _resolveActorFromDoc(cfg.attackerTokenUuid || cfg.attackerActorUuid);
    const defender = await _resolveActorFromDoc(cfg.defenderTokenUuid || cfg.defenderActorUuid);

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed Test: Could not resolve attacker/defender actor.");
      return null;
    }

    const item = cfg.attackerItemUuid ? await _resolveItem(cfg.attackerItemUuid) : null;

    // TN derivation guarantee: prefer provided attackerTarget; else derive from item; else fallback to actor combat.
    const providedTN = (cfg.attackerTarget != null) ? _asNumber(cfg.attackerTarget) : null;
    const derivedTN = item ? _getItemTN(item) : 0;
    const attackerTarget = (providedTN != null && Number.isFinite(providedTN) && providedTN !== 0)
      ? providedTN
      : (derivedTN || _getActorFallbackTN(attacker));

    const isRanged = _inferIsRangedFromItem(item);

    const opposedData = {
      schema: 2,
      mode: cfg.mode ?? "opposed",
      context: {
        isRanged,
        // Future extension points:
        // difficultyMods: { attacker: 0, defender: 0 },
        // advantage: { attacker: 0, defender: 0 },
      },
      attacker: {
        name: attacker.name,
        actorUuid: attacker.uuid,
        tokenUuid: cfg.attackerTokenUuid ?? null,
        itemUuid: cfg.attackerItemUuid ?? null,
        label: cfg.attackerLabel ?? item?.name ?? "Attack",
        target: attackerTarget,
        modifier: 0,
        result: null
      },
      defender: {
        name: defender.name,
        actorUuid: defender.uuid,
        tokenUuid: cfg.defenderTokenUuid ?? null,
        label: "(choose)",
        target: null,
        modifier: 0,
        result: null,
        noDefense: false
      },
      outcome: null,
      messageId: null
    };

    const content = _renderCard(opposedData);

    const msg = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content,
      flags: { "uesrpg-3ev4": { opposed: opposedData } }
    });

    opposedData.messageId = msg.id;
    await _updateMessageCard(msg, opposedData);
    return msg;
  }

  /**
   * Handle button clicks from chat-handlers.js
   */
  static async handleAction(message, action, user) {
    const opposedData = message?.flags?.["uesrpg-3ev4"]?.opposed;
    if (!opposedData) return;

    const side = (action === "attacker-roll") ? "attacker"
               : (action.startsWith("defender")) ? "defender"
               : null;

    if (!side) return;

    // Permission gate: GM or owner of the actor on that side.
    const actor = await _resolveActorFromDoc(opposedData[side].tokenUuid || opposedData[side].actorUuid);
    if (!actor) {
      ui.notifications.warn("Opposed Test: Could not resolve actor for roll.");
      return;
    }
    const canAct = game.user.isGM || actor.isOwner;
    if (!canAct) {
      ui.notifications.warn("You do not have permission to roll for that actor.");
      return;
    }

    // Already rolled?
    if (opposedData[side].result) return;

    if (action === "defender-nodef") {
      opposedData.defender.noDefense = true;
      opposedData.defender.label = "No Defense";
      opposedData.defender.target = 0;
      opposedData.defender.modifier = 0;
      opposedData.defender.result = {
        roll: null,
        rollTotal: 100,
        target: 0,
        isSuccess: false,
        isCriticalSuccess: false,
        isCriticalFailure: false,
        degree: 1,
        textual: "1 DoF"
      };
      await _maybeResolve(message, opposedData);
      return;
    }

    if (action === "defender-roll") {
      // Choose defense option (dynamic and context-aware).
      const choice = await DefenseDialog.show(actor, {
        isRanged: Boolean(opposedData?.context?.isRanged)
      });

      if (choice.defenseType === "none") {
        // Equivalent to defender-nodef, but preserve the same path.
        return await OpposedWorkflow.handleAction(message, "defender-nodef", user);
      }

      opposedData.defender.label = choice.label ?? "Defense";
      opposedData.defender.target = _asNumber(choice.skill);
      opposedData.defender.modifier = 0;
    }

    // Roll for attacker or defender.
    const baseTN = _asNumber(opposedData[side].target);
    const modTN = _asNumber(opposedData[side].modifier);
    const tn = baseTN + modTN;

    const res = await doTestRoll(actor, {
      rollFormula: "1d100",
      target: tn,
      allowLucky: true,
      allowUnlucky: true
    });

    opposedData[side].result = res;

    await _maybeResolve(message, opposedData);
  }
}

async function _maybeResolve(message, opposedData) {
  // Update after each change
  if (!opposedData.attacker.result || (!opposedData.defender.result && !opposedData.defender.noDefense)) {
    await _updateMessageCard(message, opposedData);
    return;
  }

  const outcome = resolveOpposed(opposedData.attacker.result, opposedData.defender.result);

  let text = "Tie";
  if (outcome.winner === "attacker") text = `${opposedData.attacker.name} wins — ${outcome.reason}`;
  else if (outcome.winner === "defender") text = `${opposedData.defender.name} wins — ${outcome.reason}`;
  else text = `Draw — ${outcome.reason}`;

  opposedData.outcome = { ...outcome, text };

  await _updateMessageCard(message, opposedData);
}
