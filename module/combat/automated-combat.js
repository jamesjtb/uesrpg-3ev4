import { initCombatSocket, requestDefenseReaction, requestGMAppliedDamage } from "./combat-socket.js";

const LOCATIONS = [
  { key: "body",  label: "Body" },
  { key: "r_leg", label: "Right Leg" },
  { key: "l_leg", label: "Left Leg" },
  { key: "r_arm", label: "Right Arm" },
  { key: "l_arm", label: "Left Arm" },
  { key: "head",  label: "Head" }
];

function locLabel(key) {
  return LOCATIONS.find(l => l.key === key)?.label ?? "Body";
}

async function evalRoll(formula) {
  const r = new Roll(String(formula));
  await r.evaluate();
  return r;
}

function calcDegrees({ rollTotal, tn, success }) {
  const r = Number(rollTotal) || 0;
  const t = Number(tn) || 0;

  if (success) {
    const rollTens = Math.floor(r / 10);
    const baseDoS = Math.max(1, rollTens);
    const tnTensBonus = (t > 100) ? Math.floor(t / 10) : 0;
    return baseDoS + tnTensBonus;
  }

  const diff = Math.max(0, r - t);
  return Math.max(1, 1 + Math.floor(diff / 10));
}

function hitLocFromOnesDigit(rollTotal) {
  const n = (Number(rollTotal) || 0) % 10;
  if (n >= 1 && n <= 5) return "body";
  if (n === 6) return "r_leg";
  if (n === 7) return "l_leg";
  if (n === 8) return "r_arm";
  if (n === 9) return "l_arm";
  return "head";
}

function getCombatStyles(actor) {
  return actor.items?.filter(i => i.type === "combatStyle") ?? [];
}

function escapeHTML(s) {
  return foundry.utils.escapeHTML(String(s ?? ""));
}

function makeOptions(items, { labelFn, selectedId } = {}) {
  return (items ?? []).map(i => {
    const lab = labelFn ? labelFn(i) : i.name;
    const sel = (selectedId && selectedId === i.id) ? "selected" : "";
    return `<option value="${escapeHTML(i.id)}" ${sel}>${escapeHTML(lab)}</option>`;
  }).join("");
}

/**
 * Find the intended defender user deterministically.
 * Priority:
 * 1) first ACTIVE non-GM user who has OWNER on target actor
 * 2) otherwise first ACTIVE GM
 * If none -> null
 */
function findDefenderUserId(targetActor) {
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  const activeUsers = game.users?.filter(u => u.active) ?? [];

  const activeOwners = activeUsers
    .filter(u => !u.isGM)
    .filter(u => targetActor.testUserPermission(u, OWNER));

  if (activeOwners.length) return activeOwners[0].id;

  const activeGM = activeUsers.find(u => u.isGM);
  return activeGM?.id ?? null;
}

async function postChatSummary({ attacker, weapon, target, attack, defense, outcome }) {
  const parts = [];
  parts.push(`<p><b>${escapeHTML(attacker.name)}</b> attacks <b>${escapeHTML(target.name)}</b>${weapon ? ` with <b>${escapeHTML(weapon.name)}</b>` : ""}.</p>`);
  parts.push(`<p><b>Attack</b>: TN ${attack.tn}, Roll ${attack.roll} (${attack.success ? "SUCCESS" : "FAIL"}) — DoS/DoF: ${attack.degrees}</p>`);
  if (defense) parts.push(`<p><b>Defense</b>: ${escapeHTML(defense.typeLabel)} — TN ${defense.tn}</p>`);
  parts.push(`<p><b>Outcome:</b> ${escapeHTML(outcome)}</p>`);

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="uesrpg-auto-combat">${parts.join("\n")}</div>`,
    rollMode: game.settings.get("core", "rollMode")
  });
}

export async function attackWithDialog(attacker, weapon) {
  if (game.uesrpg?.automatedCombat?._busy) {
    ui.notifications.warn("An automated attack is already in progress.");
    return;
  }
  game.uesrpg.automatedCombat._busy = true;

  try {
    const targetTokens = Array.from(game.user?.targets ?? []);
    if (targetTokens.length !== 1) {
      ui.notifications.warn("Target exactly one token.");
      return;
    }

    const targetToken = targetTokens[0];
    const target = targetToken.actor;
    if (!target) return;

    const combatStyles = getCombatStyles(attacker);
    if (!combatStyles.length) return;

    const defaultStyleId = combatStyles[0].id;

    const content = `
      <form class="uesrpg-attack-dialog">
        <div class="form-group">
          <label>Combat Style (TN)</label>
          <select name="combatStyleId">
            ${makeOptions(combatStyles, {
              selectedId: defaultStyleId,
              labelFn: (cs) => `${cs.name} (TN ${Number(cs.system?.value ?? 0) || 0})`
            })}
          </select>
        </div>

        <div class="form-group">
          <label>Modifier</label>
          <input type="number" name="modifier" value="0" step="5"/>
        </div>

        <div class="form-group">
          <label>Opposed?</label>
          <select name="opposed">
            <option value="yes" selected>Yes (prompt defender)</option>
            <option value="no">No (standard test)</option>
          </select>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" name="precisionStrike"
                   onchange="this.form.manualLoc.disabled = !this.checked;">
            Precision Strike
          </label>
        </div>

        <div class="form-group">
          <label>Precision Strike Location</label>
          <select name="manualLoc" disabled>
            ${LOCATIONS.map(l => `<option value="${l.key}">${l.label}</option>`).join("")}
          </select>
        </div>
      </form>
    `;

    const result = await new Promise((resolve) => {
      new Dialog({
        title: `Attack — ${attacker.name} → ${target.name}`,
        content,
        buttons: {
          attack: {
            label: "Roll Attack",
            callback: (html) => {
              const form = html[0].querySelector("form.uesrpg-attack-dialog");
              resolve({
                combatStyleId: form.combatStyleId.value,
                modifier: Number(form.modifier.value ?? 0) || 0,
                opposed: form.opposed.value === "yes",
                precisionStrike: !!form.precisionStrike.checked,
                manualLoc: form.manualLoc.value
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "attack"
      }).render(true);
    });

    if (!result) return;

    const cs = attacker.items.get(result.combatStyleId);
    const baseTN = Number(cs?.system?.value ?? 0) || 0;
    const attackTN = Math.max(0, baseTN + result.modifier);

    const attackRoll = await evalRoll("1d100");
    const attackSuccess = attackRoll.total <= attackTN;
    const attackDegrees = calcDegrees({ rollTotal: attackRoll.total, tn: attackTN, success: attackSuccess });

    if (!attackSuccess) {
      await postChatSummary({
        attacker, weapon, target,
        attack: { tn: attackTN, roll: attackRoll.total, success: false, degrees: attackDegrees },
        defense: null,
        outcome: "Miss (attack failed)."
      });
      return;
    }

    let defenseChoice = { defenseType: "none", tn: 0 };
    if (result.opposed) {
      const defenderUserId = findDefenderUserId(target);

      if (!defenderUserId) {
        // No active owner/GM to prompt
        defenseChoice = { defenseType: "none", tn: 0, error: "No active defender to prompt" };
      } else {
        ui.notifications.info("Waiting for defender reaction (up to 30s)...");
        defenseChoice = await requestDefenseReaction({
          attackerUserId: game.user.id,
          defenderUserId,
          targetTokenUuid: targetToken.document.uuid,
          targetActorUuid: target.uuid,
          targetActorId: target.id,
          suggestedDefense: "parry"
        });
      }
    }

    // From here you keep your existing defense resolution and damage logic.
    // (I’m not reprinting the whole file again to keep this patch focused.)
    await postChatSummary({
      attacker, weapon, target,
      attack: { tn: attackTN, roll: attackRoll.total, success: true, degrees: attackDegrees },
      defense: defenseChoice?.defenseType === "none" ? null : { typeLabel: defenseChoice.defenseType, tn: defenseChoice.tn },
      outcome: `Attack success. Defense: ${defenseChoice.defenseType}${defenseChoice.timeout ? " (timeout)" : ""}.`
    });

  } finally {
    game.uesrpg.automatedCombat._busy = false;
  }
}

export function initAutomatedCombat() {
  initCombatSocket();
  if (!game.uesrpg) game.uesrpg = {};
  game.uesrpg.automatedCombat = { attackWithDialog, _busy: false };
}
