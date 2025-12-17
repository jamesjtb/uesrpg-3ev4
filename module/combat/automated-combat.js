/**
 * Automated Combat Workflow (Phase 1)
 */

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

function makeOptions(items, { labelFn, valueFn, selectedId } = {}) {
  return (items ?? []).map(i => {
    const val = valueFn ? valueFn(i) : i.id;
    const lab = labelFn ? labelFn(i) : i.name;
    const sel = (selectedId && selectedId === i.id) ? "selected" : "";
    return `<option value="${escapeHTML(val)}" ${sel}>${escapeHTML(lab)}</option>`;
  }).join("");
}

async function applyDamageToTarget({ target, targetToken, raw, type, locKey }) {
  const canUpdate = target.isOwner || game.user.isGM;

  if (canUpdate) {
    return await target.applyLocationDamage({ raw, type, locKey, mitigated: true });
  }

  const resp = await requestGMAppliedDamage({
    targetTokenUuid: targetToken?.document?.uuid ?? null,
    targetActorUuid: target.uuid,
    raw,
    type,
    locKey,
    mitigated: true
  });

  if (!resp?.ok) throw new Error(resp?.error ?? "GM apply damage failed");
  return resp.result;
}

async function maybeApplyWound({ target, appliedDamage, attackerName, hitLocKey }) {
  const wt = Number(target.system?.wound_threshold?.value ?? 0) || 0;
  if (wt <= 0) return { wounded: false, wt };

  if (Number(appliedDamage) >= wt && appliedDamage > 0) {
    const notes = (target.system?.woundNotes ?? "").toString();
    const line = `Wounded by ${attackerName} (${locLabel(hitLocKey)}) for ${appliedDamage} on ${new Date().toLocaleString()}`;
    const nextNotes = notes ? `${notes}\n${line}` : line;

    await target.update({
      "system.wounded": true,
      "system.woundNotes": nextNotes
    });

    return { wounded: true, wt };
  }

  return { wounded: false, wt };
}

async function postChatSummary({ attacker, weapon, target, attack, defense, outcome, damage }) {
  const parts = [];
  parts.push(`<h2><img src="${escapeHTML(weapon?.img)}" style="width:24px;height:24px;vertical-align:middle;margin-right:6px;">${escapeHTML(weapon?.name ?? "Attack")}</h2>`);
  parts.push(`<p><b>Attacker:</b> ${escapeHTML(attacker.name)}<br><b>Target:</b> ${escapeHTML(target.name)}</p>`);

  parts.push(`<p><b>Attack</b>: TN ${attack.tn}, Roll ${attack.roll} (${attack.success ? "SUCCESS" : "FAIL"}) — DoS/DoF: ${attack.degrees}</p>`);

  if (defense) {
    parts.push(`<p><b>Defense</b>: ${escapeHTML(defense.typeLabel)} — TN ${defense.tn}, Roll ${defense.roll ?? "-"} ${defense.roll != null ? `(${defense.success ? "SUCCESS" : "FAIL"})` : ""} — DoS/DoF: ${defense.degrees ?? "-"}</p>`);
    if (defense.type === "block" && defense.shield) {
      parts.push(`<p><b>Shield:</b> ${escapeHTML(defense.shield.name)} (BR ${defense.shield.br}) on ${escapeHTML(locLabel(defense.shieldArm ?? "l_arm"))}</p>`);
    }
  }

  parts.push(`<p><b>Outcome:</b> ${escapeHTML(outcome)}</p>`);

  if (damage) {
    parts.push(`<hr><p><b>Hit Location:</b> ${escapeHTML(locLabel(damage.locKey))}</p>`);
    parts.push(`<p><b>Damage:</b> Raw ${damage.raw} (${escapeHTML(damage.type)}) → Mitigated ${damage.final} (Mitigation ${damage.totalMit})</p>`);
    parts.push(`<p><b>HP:</b> ${damage.before.value}${damage.before.temp ? ` (+${damage.before.temp} temp)` : ""} → ${damage.after.value}${damage.after.temp ? ` (+${damage.after.temp} temp)` : ""}</p>`);
    if (damage.wound?.wounded) {
      parts.push(`<p style="color:#a00;"><b>WOUND:</b> Applied damage ≥ WT (${damage.wound.wt}). system.wounded set to true.</p>`);
    }
  }

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
    if (!targetTokens.length) {
      ui.notifications.warn("Target a token first.");
      return;
    }
    if (targetTokens.length > 1) {
      ui.notifications.warn("Phase 1 supports one target at a time. Please target only one token.");
      return;
    }

    const targetToken = targetTokens[0];
    const target = targetToken.actor;
    if (!target) {
      ui.notifications.warn("Target token has no actor.");
      return;
    }

    const combatStyles = getCombatStyles(attacker);
    if (!combatStyles.length) {
      ui.notifications.warn("Attacker has no Combat Styles.");
      return;
    }

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
            <input type="checkbox" name="precisionStrike" />
            Precision Strike
          </label>
        </div>

        <div class="form-group">
          <label>Targeted Hit Location</label>
          <select name="manualLoc" disabled>
            ${LOCATIONS.map(l => `<option value="${l.key}">${l.label}</option>`).join("")}
          </select>
        </div>

        <div class="form-group">
          <label>Damage Type</label>
          <select name="damageType">
            <option value="physical" selected>Physical</option>
            <option value="magic">Magic</option>
            <option value="fire">Fire</option>
            <option value="frost">Frost</option>
            <option value="shock">Shock</option>
            <option value="poison">Poison</option>
            <option value="shadow">Shadow</option>
          </select>
        </div>
      </form>
    `;

    const result = await new Promise((resolve) => {
      const dlg = new Dialog({
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
                precisionStrike: form.precisionStrike.checked,
                manualLoc: form.manualLoc.value,
                damageType: form.damageType.value
              });
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "attack"
      });

      dlg.render(true);

      setTimeout(() => {
        const form = dlg.element?.find("form.uesrpg-attack-dialog")?.[0];
        if (!form) return;
        const cb = form.precisionStrike;
        const sel = form.manualLoc;
        const sync = () => { sel.disabled = !cb.checked; };
        cb.addEventListener("change", sync);
        sync();
      }, 0);
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
        attacker,
        weapon,
        target,
        attack: { tn: attackTN, roll: attackRoll.total, success: false, degrees: attackDegrees },
        defense: null,
        outcome: `Attack failed (${attackRoll.total} > ${attackTN}).`,
        damage: null
      });
      return;
    }

    let defenseResolved = null;
    let hit = true;
    let outcome = result.opposed ? "Hit (awaiting defense reaction...)" : "Hit (standard test).";

    if (result.opposed) {
      ui.notifications.info("Waiting for defender reaction (up to 30s)...");

      const defenseChoice = await requestDefenseReaction({
        attackerUserId: game.user.id,
        targetTokenUuid: targetToken.document.uuid,
        suggestedDefense: "parry"
      });

      const defType = defenseChoice?.defenseType ?? "none";
      const defTN = Number(defenseChoice?.tn ?? 0) || 0;

      if (defType === "none") {
        defenseResolved = { type: "none", typeLabel: "No Reaction", tn: 0, roll: null, success: false, degrees: null };
        outcome = defenseChoice?.timeout ? "Hit (defense timed out)." : "Hit (no defense reaction).";
      } else {
        const defRoll = await evalRoll("1d100");
        const defSuccess = defRoll.total <= defTN;
        const defDegrees = calcDegrees({ rollTotal: defRoll.total, tn: defTN, success: defSuccess });

        defenseResolved = {
          type: defType,
          typeLabel: defType === "evade" ? "Evade" : defType === "parry" ? "Parry" : defType === "block" ? "Block" : "Counter-Attack",
          tn: defTN,
          roll: defRoll.total,
          success: defSuccess,
          degrees: defDegrees,
          shield: defenseChoice?.shield ?? null,
          shieldArm: defenseChoice?.shieldArm ?? "l_arm"
        };

        if (defType === "block") {
          hit = true;
          outcome = defSuccess ? "Hit (blocked: resolve vs Shield BR)." : "Hit (block failed).";
        } else if (defSuccess) {
          if (attackDegrees > defDegrees) {
            hit = true;
            outcome = `Hit (attacker DoS ${attackDegrees} > defender DoS ${defDegrees}).`;
          } else {
            hit = false;
            outcome = `Defended (defender DoS ${defDegrees} ≥ attacker DoS ${attackDegrees}).`;
          }
        } else {
          hit = true;
          outcome = "Hit (defense failed).";
        }
      }
    }

    if (!hit) {
      await postChatSummary({
        attacker,
        weapon,
        target,
        attack: { tn: attackTN, roll: attackRoll.total, success: true, degrees: attackDegrees },
        defense: defenseResolved,
        outcome,
        damage: null
      });
      return;
    }

    let locKey = hitLocFromOnesDigit(attackRoll.total);
    if (result.precisionStrike) locKey = result.manualLoc || locKey;

    let dmgFormula = weapon?.system?.weapon2H ? weapon?.system?.damage2 : weapon?.system?.damage;
    dmgFormula = dmgFormula || "0";
    const dmgRoll = await evalRoll(dmgFormula);
    let rawDamage = Number(dmgRoll.total) || 0;

    if (defenseResolved?.type === "block" && defenseResolved?.success && defenseResolved?.shield) {
      const br = Number(defenseResolved.shield.br ?? 0) || 0;
      let effectiveBR = br;
      const dt = String(result.damageType || "physical").toLowerCase();
      if (dt !== "physical") effectiveBR = Math.floor(br / 2);

      if (rawDamage <= effectiveBR) {
        await postChatSummary({
          attacker,
          weapon,
          target,
          attack: { tn: attackTN, roll: attackRoll.total, success: true, degrees: attackDegrees },
          defense: defenseResolved,
          outcome: `Blocked by shield (Damage ${rawDamage} ≤ BR ${effectiveBR}). No damage applied.`,
          damage: null
        });
        return;
      }

      locKey = defenseResolved.shieldArm ?? "l_arm";
    }

    const dmgType = result.damageType || "physical";
    const applied = await applyDamageToTarget({ target, targetToken, raw: rawDamage, type: dmgType, locKey });
    const wound = await maybeApplyWound({ target, appliedDamage: applied.final, attackerName: attacker.name, hitLocKey: locKey });

    await postChatSummary({
      attacker,
      weapon,
      target,
      attack: { tn: attackTN, roll: attackRoll.total, success: true, degrees: attackDegrees },
      defense: defenseResolved,
      outcome,
      damage: { ...applied, raw: rawDamage, type: dmgType, locKey, wound }
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
