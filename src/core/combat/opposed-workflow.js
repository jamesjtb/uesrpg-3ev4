/**
 * src/core/combat/opposed-workflow.js
 *
 * Canonical opposed/contested workflow for UESRPG 3ev4 (Foundry v13, non-ApplicationV2).
 *
 * Design goals (per project decisions):
 *  - Clicking the combat style dice icon with a target selected ONLY creates a pending chat card.
 *  - Attacker rolls from the chat card. "Roll Attack" opens ONE dialog:
 *      - Attack variation selector (Normal / All Out / Precision / Coup de Grâce)
 *      - Manual TN modifier input
 *  - Defender rolls from the chat card via DefenseDialog (owns defense eligibility + TN calc).
 *  - Dice So Nice compatibility: each side's d100 roll is executed as a real Foundry Roll and
 *    sent as its own ChatMessage using Roll#toMessage (so DSN hooks always fire).
 *  - The opposed chat card is then updated with the numeric outcomes and final resolution.
 */

import { doTestRoll, computeResultFromRollTotal } from "../../utils/degree-roll-helper.js";
import { UESRPG } from "../constants.js";
import { hasCondition } from "../conditions/condition-engine.js";
import { DefenseDialog } from "./defense-dialog.js";
import { computeTN, listCombatStyles, hasEquippedShield, variantMod as computeVariantMod } from "./tn.js";
import { computeDefenseAvailability, normalizeDefenseType } from "./defense-options.js";
import { getDamageTypeFromWeapon, getHitLocationFromRoll, resolveHitLocationForTarget } from "./combat-utils.js";
import { getBlockValue, normalizeHitLocation } from "./mitigation.js";
import { DAMAGE_TYPES } from "./damage-automation.js";
import { ActionEconomy } from "./action-economy.js";
import { AttackTracker } from "./attack-tracker.js";
import { safeUpdateChatMessage } from "../../utils/chat-message-socket.js";
import { requestCreateActiveEffect } from "../../utils/active-effect-proxy.js";
import { buildSpecialActionsForActor, isSpecialActionUsableNow } from "./combat-style-utils.js";
import { SPECIAL_ACTIONS, getSpecialActionById } from "../config/special-actions.js";
import { getActiveStaminaEffect, consumeStaminaEffect, STAMINA_EFFECT_KEYS } from "../stamina/stamina-dialog.js";
import { isActorSkeletal } from "../traits/trait-registry.js";
import { canTokenEscapeTemplate } from "../../utils/aoe-utils.js";


function _collectSensorySituationalMods(decl) {
  const out = [];
  if (!decl) return out;
  if (decl.applyBlinded) out.push({ key: "blinded", label: "Blinded (sight)", value: -30 });
  if (decl.applyDeafened) out.push({ key: "deafened", label: "Deafened (hearing)", value: -30 });
  return out;
}

function _collectDefenseSensorySituationalMods(choice) {
  const out = [];
  if (!choice) return out;
  if (choice.applyBlinded) out.push({ key: "blinded", label: "Blinded (sight)", value: -30 });
  if (choice.applyDeafened) out.push({ key: "deafened", label: "Deafened (hearing)", value: -30 });
  return out;
}


function _asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function _normalizeKey(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function _weaponHasQuality(weapon, qualityKey, { allowLegacy = true } = {}) {
  if (!weapon?.system) return false;
  const target = _normalizeKey(qualityKey);
  if (!target) return false;

  const structured = Array.isArray(weapon.system.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : null;

  if (structured) {
    for (const q of structured) {
      const k = _normalizeKey(q?.key ?? q);
      if (k && k === target) return true;
    }
  }

  const traits = Array.isArray(weapon.system.qualitiesTraitsInjected)
    ? weapon.system.qualitiesTraitsInjected
    : Array.isArray(weapon.system.qualitiesTraits)
      ? weapon.system.qualitiesTraits
      : null;

  if (traits) {
    for (const t of traits) {
      const k = _normalizeKey(t);
      if (k && k === target) return true;
    }
  }

  if (!allowLegacy) return false;

  const raw = String(weapon.system.qualities ?? "");
  if (!raw) return false;

  const plain = raw
    .replace(/@Compendium\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = plain
    .split(/[^A-Za-z0-9]+/)
    .map(t => _normalizeKey(t))
    .filter(Boolean);
  if (tokens.includes(target)) return true;

  // Last resort: substring match for legacy concatenations.
  const legacy = _normalizeKey(plain);
  if (legacy && legacy.includes(target)) return true;

  return false;
}

function _weaponHasTraitText(weapon, traitKey) {
  // Fallback for legacy weapons where traits are stored as free-text in system.qualities.
  const target = _normalizeKey(traitKey);
  if (!target) return false;
  const raw = String(weapon?.system?.qualities ?? "");
  if (!raw) return false;

  const text = raw
    .replace(/@Compendium\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = text
    .split(/[^A-Za-z0-9]+/)
    .map(t => _normalizeKey(t))
    .filter(Boolean);

  if (tokens.includes(target)) return true;

  // Last resort substring for edge-case legacy exports.
  const legacy = _normalizeKey(text);
  return !!(legacy && legacy.includes(target));
}

function _parseRangeBandsFromWeapon(weapon) {
  // Chapter 7 formatting in compendium exports commonly embeds:
  //   "Ranged (7/27/52)" or "Thrown (3/8/16)" inside system.qualities as rich text.
  const raw = String(weapon?.system?.qualities ?? "");
  if (!raw) return null;

  const text = raw
    .replace(/@Compendium\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const mRanged = text.match(/\bRanged\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
  const mThrown = text.match(/\bThrown\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s*\)/i);

  const ranged = mRanged
    ? { close: Number(mRanged[1]), effective: Number(mRanged[2]), long: Number(mRanged[3]) }
    : null;
  const thrown = mThrown
    ? { close: Number(mThrown[1]), effective: Number(mThrown[2]), long: Number(mThrown[3]) }
    : null;

  return { ranged, thrown };
}

function _parseRangeTriplet(text) {
  // Accept "2/3/4" or "2 / 3 / 4".
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  return { close: Number(m[1]), effective: Number(m[2]), long: Number(m[3]) };
}

function _measureTokenDistance(tokenA, tokenB) {
  try {
    const a = tokenA?.center ?? tokenA?.object?.center ?? null;
    const b = tokenB?.center ?? tokenB?.object?.center ?? null;
    if (!a || !b) return null;

    // v13: Use namespaced Ray from foundry.canvas.geometry
    const ray = new foundry.canvas.geometry.Ray(a, b);

    // Preferred: BaseGrid.measurePath (v13+)
    const grid = canvas?.grid?.grid;
    if (grid && typeof grid.measurePath === "function") {
      const result = grid.measurePath([a, b], { gridSpaces: true });
      const dist = result?.distance ?? result?.totalDistance ?? null;
      if (Number.isFinite(dist)) return dist;
    }

    // Fallback: manual calculation (deprecated measureDistances removed)
    const gridSize = Number(canvas?.scene?.grid?.size ?? 0);
    const gridDistance = Number(canvas?.scene?.grid?.distance ?? 0);
    if (gridSize > 0 && gridDistance > 0) {
      const px = Math.hypot(b.x - a.x, b.y - a.y);
      const spaces = px / gridSize;
      return spaces * gridDistance;
    }

    return null;
  } catch (err) {
    console.warn("UESRPG | Failed to measure token distance", err);
    return null;
  }
}



function _getWeaponRangeBands(weapon) {
  const sys = weapon?.system ?? {};

  // Preferred: derived range bands (effective first), as computed in src/core/documents/item.js.
  // That lane uses close/effective/long keys; this workflow uses close/medium/long.
  const src = sys.rangeBandsDerivedEffective ?? sys.rangeBandsDerived ?? null;
  if (src && Number.isFinite(Number(src.long))) {
    return {
      kind: src.kind ?? null,
      source: src.source ?? null,
      close: Number(src.close) || 0,
      medium: Number(src.medium ?? src.effective) || 0,
      long: Number(src.long) || 0,
      rangeMod: Number(src.rangeMod) || 0,
      display: src.display ?? null
    };
  }

  // Secondary: explicit system.range (common on legacy items) in "S/M/L" format.
  // NOTE: This is distinct from Reach; ranged weapons should populate system.range.
  const fromRangeField = _parseRangeTriplet(sys.range);
  if (fromRangeField && Number.isFinite(Number(fromRangeField.long))) {
    return {
      kind: "ranged",
      source: "rangeField",
      close: Number(fromRangeField.close) || 0,
      medium: Number(fromRangeField.effective) || 0,
      long: Number(fromRangeField.long) || 0,
      rangeMod: 0,
      display: `${Number(fromRangeField.close)}/${Number(fromRangeField.effective)}/${Number(fromRangeField.long)}`
    };
  }

  // Legacy fallback: parse bands from free-text qualities for weapons that were not migrated.
  const parsed = _parseRangeBandsFromWeapon(weapon);
  if (!parsed) return null;

  const isThrown = weapon ? (_weaponHasQuality(weapon, "thrown") || _weaponHasTraitText(weapon, "thrown")) : false;
  const b = isThrown ? (parsed.thrown ?? null) : (parsed.ranged ?? null);
  if (!b || !Number.isFinite(Number(b.long))) return null;

  return {
    kind: isThrown ? "thrown" : "ranged",
    source: "qualities",
    close: Number(b.close) || 0,
    medium: Number(b.effective) || 0,
    long: Number(b.long) || 0
  };
}


function _computeRangedRangeContext({ attackerToken, defenderToken, weapon }) {
  const bands = _getWeaponRangeBands(weapon);
  if (!bands) return null;

  const distance = _measureTokenDistance(attackerToken, defenderToken);
  if (distance == null) return {
    distance: null,
    band: null,
    tnMod: 0,
    close: Number(bands.close) || 0,
    medium: Number(bands.medium) || 0,
    long: Number(bands.long) || 0,
    outOfRange: false,
    reason: "no-distance"
  };

  const close = Number(bands.close) || 0;
  const medium = Number(bands.medium) || 0;
  const long = Number(bands.long) || 0;

  if (long > 0 && distance > long) {
    return { distance, band: "out", tnMod: 0, close, medium, long, outOfRange: true, reason: "out-of-range" };
  }

  if (close > 0 && distance <= close) {
    return { distance, band: "close", tnMod: +10, close, medium, long, outOfRange: false };
  }
  if (medium > 0 && distance <= medium) {
    return { distance, band: "medium", tnMod: 0, close, medium, long, outOfRange: false };
  }
  // Long band includes any distance up to (and including) long.
  return { distance, band: "long", tnMod: -20, close, medium, long, outOfRange: false };
}

function _getWeaponReachBounds(weapon) {
  const sys = weapon?.system ?? {};
  const max = Number(sys.reach ?? 0);
  const min = Number(sys.reachMin ?? 0);
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0
  };
}

function _computeMeleeReachContext({ attackerToken, defenderToken, weapon }) {
  const { min, max } = _getWeaponReachBounds(weapon);
  if (!(min > 0) && !(max > 0)) return null;

  const distance = _measureTokenDistance(attackerToken, defenderToken);
  if (distance == null) {
    return { distance: null, min, max, inRange: true, reason: "no-distance" };
  }

  // Minimum reach (e.g., polearms). RAW: cannot attack targets closer than min.
  if (min > 0 && distance < min) {
    return { distance, min, max, inRange: false, reason: "too-close" };
  }

  // Maximum reach: cannot attack beyond max.
  if (max > 0 && distance > max) {
    return { distance, min, max, inRange: false, reason: "too-far" };
  }

  return { distance, min, max, inRange: true, reason: null };
}


/**
 * Canonical attack-type lane for all combat contexts.
 *
 * This system uses `context.attackMode` as the source of truth.
 * A legacy `context.attackType` may exist on older chat cards; we normalize it once.
 *
 * @param {any} ctx
 * @returns {"melee"|"ranged"}
 */
function getContextAttackMode(ctx) {
  const raw = String(ctx?.attackMode ?? ctx?.attackType ?? "melee").toLowerCase().trim();
  if (raw === "ranged" || raw === "melee") return raw;
  // Defensive normalization for previously-used labels.
  if (raw.includes("rang") || raw.includes("missile") || raw.includes("projectile") || raw.includes("shoot") || raw.includes("bow") || raw.includes("crossbow") || raw.includes("throw")) return "ranged";
  return "melee";
}

/**
 * Normalize a user/system-provided dice expression into something safe to hand to Foundry's Roll parser.
 * This is defensive: it strips annotations/import artefacts that can break Roll evaluation.
 */
function normalizeDiceExpression(expr) {
  const raw = String(expr ?? "").trim();
  if (!raw) return "0";

  // Legacy annotation / import artefact.
  if (/uses\s+nat\.?\s*weapon/i.test(raw)) return "0";

  // Handle alternate damage formats like: "1d8 (1d10)" -> prefer the base.
  const paren = raw.match(/^(.+?)\s*\((.+?)\)\s*$/);
  const base = paren ? String(paren[1]).trim() : raw;

  // Normalize unicode minus/en-dash to ASCII hyphen.
  const ascii = base.replace(/[\u2012\u2013\u2014\u2212]/g, "-");

  // Remove non-roll characters, keep basic math, dice letters, parentheses and whitespace.
  let cleaned = ascii.replace(/[^0-9dDkKfFhHlL+\-*/().,\s@]/g, " ").trim();

  // Normalize decimal comma to dot (common in some locales).
  cleaned = cleaned.replace(/(\d),(\d)/g, "$1.$2");

  // Collapse whitespace.
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Strip trailing operators or punctuation that would invalidate a Roll formula.
  cleaned = cleaned.replace(/[+\-*/.,\s]+$/g, "").trim();

  // Strip leading operators.
  cleaned = cleaned.replace(/^[+\-*/.,\s]+/g, "").trim();

  return cleaned || "0";
}

async function safeEvaluateRoll(formula, { allowUnvalidated = false } = {}) {
  const f = normalizeDiceExpression(formula);
  if (game?.settings?.get("uesrpg-3ev4", "opposedDebugFormula") && String(formula ?? "").trim() !== f) {
    // eslint-disable-next-line no-console
    console.log("UESRPG Opposed | Formula normalized", { original: String(formula ?? ""), normalized: f });
  }
  const ok = (typeof Roll?.validate === "function") ? Roll.validate(f) : true;
  if (!ok && !allowUnvalidated) {
    console.warn(`UESRPG Opposed | Invalid roll formula "${String(formula)}" -> normalized "${f}". Falling back to 0.`);
    const r = new Roll("0");
    await r.evaluate();
    return r;
  }
  try {
    const r = new Roll(f);
    await r.evaluate();
    return r;
  } catch (err) {
    console.warn(`UESRPG Opposed | Failed to evaluate roll "${String(formula)}" -> normalized "${f}". Falling back to 0.`, err);
    const r = new Roll("0");
    await r.evaluate();
    return r;
  }
}

// Combat style listing is centralized in src/core/combat/tn.js
// Block Rating resolver is centralized in src/core/combat/mitigation.js


async function _promptWeaponAndAdvantages({ attackerActor, advantageCount = 0, attackMode = "melee", defaultWeaponUuid = null, defaultHitLocation = "Body", allowNoWeapon = false }) {
  const weapons = _listEquippedWeapons(attackerActor);
  if (!weapons.length && !allowNoWeapon) {
    ui.notifications.warn("No equipped weapons found.");
    return null;
  }

  const max = Number(advantageCount || 0);
  const defaultWeapon = weapons.find(w => w.uuid === defaultWeaponUuid) ?? weapons[0] ?? null;

  const allowedLocs = ["Head", "Body", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const safeDefaultLoc = allowedLocs.includes(defaultHitLocation) ? defaultHitLocation : "Body";

  const locOptions = allowedLocs
    .map(l => `<option value="${l}" ${l === safeDefaultLoc ? "selected" : ""}>${l}</option>`)
    .join("\n");

  const hasPressAdvantage = (getContextAttackMode({ attackMode }) === "melee");

  // Known Special Actions are derived ONLY from the actor's active combat style.
  // For attacker spend: Primary must be usable now; Secondary is always usable.
  const knownSpecial = (() => {
    try {
      const all = buildSpecialActionsForActor(attackerActor);
      return all.filter(a => a.known && isSpecialActionUsableNow(attackerActor, a.actionType));
    } catch (_e) {
      return [];
    }
  })();

  const renderSpecialOpt = (sa) => {
    const id = String(sa?.id ?? "").trim();
    if (!id) return "";
    const label = String(sa?.name ?? id);
    const typ = String(sa?.actionType ?? "").toLowerCase();
    const chipClass = typ === "primary" ? "uesrpg-adv-chip--primary" : "uesrpg-adv-chip--secondary";
    const chipLabel = typ === "primary" ? "Primary" : "Secondary";
    return `
      <label class="uesrpg-adv-choice">
        <input type="checkbox" name="sa_${id}" />
        <span class="uesrpg-adv-choice__label">
          <span class="uesrpg-adv-choice__title">${label}</span>
        </span>
        <span class="uesrpg-adv-chip ${chipClass}">${chipLabel}</span>
      </label>
    `;
  };

  const noneSelected = allowNoWeapon && !defaultWeapon;
  const noneOption = allowNoWeapon ? `<option value="" ${noneSelected ? "selected" : ""}>None</option>` : "";
  const weaponOptions = `${noneOption}${weapons
    .map(w => `<option value="${w.uuid}" ${w.uuid === defaultWeapon?.uuid ? "selected" : ""}>${w.name}</option>`)
    .join("\n")}`;

  const content = `
    <form class="uesrpg-opp-dmg uesrpg-adv-dialog uesrpg-adv-dialog--attacker">
      <div class="form-group uesrpg-adv-weapon">
        <label><b>Weapon</b></label>
        <select name="weaponUuid">${weaponOptions}</select>
      </div>

      ${max > 0 ? `
        <hr style="margin:0.5rem 0;" />
        <div class="uesrpg-adv-summary">
          <b>Advantage</b>: ${max} available
          <div class="uesrpg-adv-count" aria-live="polite"></div>
        </div>

        <input type="hidden" name="defaultHitLocation" value="${safeDefaultLoc}" />

        <div class="uesrpg-adv-grid">
          <div class="uesrpg-adv-block">
            <label class="uesrpg-adv-choice">
              <input type="checkbox" name="precisionStrike" />
              <span class="uesrpg-adv-choice__label">
                <span class="uesrpg-adv-choice__title">Precision Strike</span>
                <span class="uesrpg-adv-choice__desc">Choose a hit location.</span>
              </span>
            </label>
            <div class="uesrpg-adv-inline">
              <select name="precisionLocation" disabled>${locOptions}</select>
            </div>
          </div>

          <label class="uesrpg-adv-choice">
            <input type="checkbox" name="penetrateArmor" />
            <span class="uesrpg-adv-choice__label">
              <span class="uesrpg-adv-choice__title">Penetrate Armor</span>
            </span>
          </label>

          <label class="uesrpg-adv-choice">
            <input type="checkbox" name="forcefulImpact" />
            <span class="uesrpg-adv-choice__label">
              <span class="uesrpg-adv-choice__title">Forceful Impact</span>
            </span>
          </label>

          ${hasPressAdvantage ? `
          <label class="uesrpg-adv-choice">
            <input type="checkbox" name="pressAdvantage" />
            <span class="uesrpg-adv-choice__label">
              <span class="uesrpg-adv-choice__title">Press Advantage</span>
            </span>
          </label>
          ` : ``}

          ${knownSpecial.length ? `
            <div class="uesrpg-adv-section">
              <div class="uesrpg-adv-section__title"><b>Known Special Actions</b></div>
            </div>
            ${knownSpecial.map(renderSpecialOpt).join("\n")}
          ` : ``}
        </div>

        <p class="hint">Select up to ${max} option(s).</p>
      ` : ``}
    </form>
  `;

  return await new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dialog = new Dialog({
      title: "Resolve Damage",
      content,
      buttons: {
        continue: {
          label: "Continue",
          callback: (html) => {
            const root = (html && "0" in html && html[0] instanceof Element) ? html[0] : (html instanceof Element ? html : null);
            const form = root?.querySelector("form.uesrpg-opp-dmg");
            if (!form) return settle(null);

            const q = (name) => form.querySelector(`[name="${name}"]`);
            const weaponUuid = String(q("weaponUuid")?.value ?? "");

            const precisionStrike = Boolean(q("precisionStrike")?.checked);
            const defaultLoc = String(q("defaultHitLocation")?.value ?? "Body");
            const precisionLocation = precisionStrike
              ? String(q("precisionLocation")?.value ?? defaultLoc)
              : defaultLoc;

            const penetrateArmor = Boolean(q("penetrateArmor")?.checked);
            const forcefulImpact = Boolean(q("forcefulImpact")?.checked);
            const pressAdvantage = Boolean(q("pressAdvantage")?.checked);

            const selectedSpecial = [];
            for (const sa of knownSpecial) {
              const id = String(sa?.id ?? "").trim();
              if (!id) continue;
              if (Boolean(q(`sa_${id}`)?.checked)) selectedSpecial.push(id);
            }

            const selectedCount = [precisionStrike, penetrateArmor, forcefulImpact, pressAdvantage].filter(Boolean).length + selectedSpecial.length;
            if (max > 0 && selectedCount > max) {
              ui.notifications.warn(`You only have ${max} Advantage to spend.`);
              return false;
            }

            return settle({
              weaponUuid,
              precisionStrike,
              precisionLocation,
              penetrateArmor,
              forcefulImpact,
              pressAdvantage,
              specialActionsSelected: selectedSpecial
            });
          }
        },
        cancel: { label: "Cancel", callback: () => settle(null) }
      },
      default: "continue",
      close: () => settle(null)
    });

    Hooks.once("renderDialog", (app, html) => {
      if (app !== dialog) return;
      const root = html?.[0] instanceof Element ? html[0] : null;
      const form = root?.querySelector("form.uesrpg-opp-dmg");
      if (!form) return;

      const precisionSelect = form.querySelector('select[name="precisionLocation"]');
      const defaultLoc = String(form.querySelector('input[name="defaultHitLocation"]')?.value ?? "Body");

      const listAllCheckboxes = () => [...form.querySelectorAll('input[type="checkbox"]')];
      const computeSelectedCount = () => listAllCheckboxes().filter(el => Boolean(el.checked)).length;

      const updateUi = () => {
        if (precisionSelect) {
          const ps = form.querySelector('input[type="checkbox"][name="precisionStrike"]');
          const psOn = Boolean(ps?.checked);
          precisionSelect.disabled = !psOn;
          if (!psOn) precisionSelect.value = defaultLoc;
        }

        const count = computeSelectedCount();
        const c = form.querySelector(".uesrpg-adv-count");
        if (c) c.textContent = `${count} / ${max} selected`;

        for (const el of listAllCheckboxes()) {
          if (Boolean(el.checked)) {
            el.disabled = false;
            continue;
          }
          el.disabled = (count >= max);
        }
      };

      for (const el of listAllCheckboxes()) {
        el.addEventListener("change", (ev) => {
          const count = computeSelectedCount();
          if (count > max) {
            ev.currentTarget.checked = false;
            ui.notifications.warn(`You only have ${max} Advantage to spend.`);
          }
          updateUi();
        });
      }

      updateUi();
    });

    dialog.render(true);
  });
}
/**
 * Prompt the defender to utilize their Advantage after a successful defense.
 *
 * RAW (Chapter 5, Attacking & Defending, Step 3):
 * "Defender wins: The defense is successful, the defender chooses how to utilize their advantage and resolves it."
 *
 * Pre–Active Effects scope: we provide a pipeline to select/record an advantage utilization choice,
 * and post a chat audit message. Most mechanical outcomes will be implemented later via Active Effects.
 */


// NOTE: Duplicate _promptDefenderAdvantage removed (boot-time SyntaxError fix)



async function _rollWeaponDamage({ weapon, preConsumedAmmo = null }) {
  const addFlatBonus = (expr, bonus) => {
    const b = Number(bonus || 0);
    if (!Number.isFinite(b) || b === 0) return String(expr ?? "0");
    const e = String(expr ?? "0").trim();
    // Keep the expression readable; do not attempt to parse dice groups.
    return b > 0 ? `${e}+${b}` : `${e}${b}`;
  };

  let damageString =
    (weapon.system.damage3Effective ?? weapon.system.damage3 ?? weapon.system.damage2Effective ?? weapon.system.damage2 ?? weapon.system.damageEffective ?? weapon.system.damage) || "0";

  /** @type {{ammoUuid:string, qtyAfter:number, ammoName:string}|null} */
  let pendingAmmo = null;

  // Ranged: add ammunition contribution (damage bonus) from the selected ammunition item.
  // Ammunition quantity is consumed at ATTACK TIME (before the attack roll), not here.
  // This function only reads ammo data for damage expression enrichment and gates legacy/stale cards defensively.
  if (String(weapon.system?.attackMode ?? "melee") === "ranged" && weapon.actor) {
    // Do not involve ammunition for thrown attacks.
    const injected = Array.isArray(weapon.system?.qualitiesStructuredInjected)
      ? weapon.system.qualitiesStructuredInjected
      : Array.isArray(weapon.system?.qualitiesStructured)
        ? weapon.system.qualitiesStructured
        : [];
    const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
    const hasThrown = injected.some(q => String(q?.key ?? q ?? "").toLowerCase() === "thrown")
      || traits.some(t => String(t ?? "").toLowerCase() === "thrown")
      || (String(weapon.system?.rangeBandsDerivedEffective?.kind ?? weapon.system?.rangeBandsDerived?.kind ?? "") === "thrown");
    if (hasThrown) {
      // Leave pendingAmmo null and do not gate on ammo.
    } else {
    const shouldConsume = weapon.system?.consumeAmmo !== false;
    const ammoId = String(weapon.system?.ammoId ?? "").trim();


    const preConsumedMatches = !!(preConsumedAmmo
      && preConsumedAmmo.weaponUuid
      && preConsumedAmmo.ammoId
      && preConsumedAmmo.weaponUuid === weapon.uuid
      && preConsumedAmmo.ammoId === ammoId);

    // If the weapon is configured to consume ammo, enforce that ammo exists.
    // Quantity can be 0 here if the last shot was consumed at attack time.
    if (shouldConsume) {
      if (!ammoId) {
        ui.notifications.warn(`${weapon.name}: no ammunition selected.`);
        return null;
      }
      const ammo = weapon.actor.items.get(ammoId);
      if (!ammo || ammo.type !== "ammunition") {
        ui.notifications.warn(`${weapon.name}: selected ammunition could not be resolved.`);
        return null;
      }
      const qty = Number(ammo.system?.quantity ?? 0);
      // Defensive gating for legacy/stale cards: if we did not see a pre-consumption record, require qty > 0.
      // In the normal opposed flow, ammo is always pre-consumed at attack time.
      if (!preConsumedMatches && !(qty > 0)) {
        ui.notifications.warn(`${ammo.name}: no ammunition remaining.`);
        return null;
      }

      const ammoExpr = normalizeDiceExpression(ammo.system?.damageEffective ?? ammo.system?.damage ?? "0");
      let ammoBonus = 0;
      try {
        const r = await safeEvaluateRoll(ammoExpr);
        ammoBonus = Number(r.total) || 0;
      } catch (err) {
        console.warn("UESRPG | Failed to evaluate ammunition damage expression", { ammoId, ammoExpr, err });
      }
      damageString = addFlatBonus(damageString, ammoBonus);

      // Ammo is already consumed earlier; do not schedule consumption here.
      pendingAmmo = null;
    } else if (ammoId) {
      // Ammo is configured but consumption is disabled; treat ammo as optional damage modifier.
      const ammo = weapon.actor.items.get(ammoId);
      if (ammo?.type === "ammunition") {
        const ammoExpr = normalizeDiceExpression(ammo.system?.damageEffective ?? ammo.system?.damage ?? "0");
        let ammoBonus = 0;
        try {
          const r = await safeEvaluateRoll(ammoExpr);
          ammoBonus = Number(r.total) || 0;
        } catch (err) {
          console.warn("UESRPG | Failed to evaluate ammunition damage expression", { ammoId, ammoExpr, err });
        }
        damageString = addFlatBonus(damageString, ammoBonus);
      }
    }
    }
  }

  const structured = Array.isArray(weapon.system.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];
  const hasQ = (key) => structured.some(q => String(q?.key ?? q ?? "").toLowerCase() === key);

  const wantsProven = hasQ("proven");
  const wantsPrimitive = hasQ("primitive");
  const wantsSuperior = !!weapon.system.superior;

  // Damaged (X): reduces weapon damage. Apply as a flat modifier to the damage expression.
  const damagedValue = (() => {
    const q = structured.find(e => String(e?.key ?? e ?? "").toLowerCase() === "damaged");
    const v = Number(q?.value ?? 0);
    return Number.isFinite(v) ? v : 0;
  })();
  if (damagedValue > 0) {
    damageString = addFlatBonus(damageString, -damagedValue);
  }

  const a = await safeEvaluateRoll(damageString);
  damageString = a.formula;
  let b = null;
  let total = Number(a.total);

  let rerollMode = null;
  if (wantsSuperior || wantsProven || wantsPrimitive) {
    b = await safeEvaluateRoll(damageString);
    const alt = Number(b.total);
    if (wantsPrimitive && !wantsProven) {
      total = Math.min(total, alt);
      rerollMode = "primitive";
    } else {
      total = Math.max(total, alt);
      rerollMode = (wantsSuperior || wantsProven) ? "proven" : null;
    }
  }

  return { damageString, rollA: a, rollB: b, finalDamage: total, pendingAmmo, rerollMode, damagedValue };
}

async function _rollManualDamage({ formula }) {
  const expr = normalizeDiceExpression(formula);
  const rollA = await safeEvaluateRoll(expr);
  return {
    damageString: rollA.formula,
    rollA,
    rollB: null,
    finalDamage: Number(rollA.total) || 0
  };
}

async function _consumePendingAmmo(pendingAmmo) {
  if (!pendingAmmo) return true;

  const { ammoUuid, actorUuid, ammoId, qtyAfter, ammoName } = pendingAmmo;

  // Prefer consuming by updating the embedded Item on the parent Actor.
  // This is more reliable than updating the embedded Item directly by UUID in cases where
  // the workflow involves a synthetic (unlinked) token Actor or other UUID resolution edge cases.
  const _resolveActor = async (uuid) => {
    if (!uuid) return null;
    const doc = await fromUuid(uuid);
    if (!doc) return null;

    // Actor document
    if (doc.documentName === "Actor") return doc;

    // TokenDocument (synthetic Actor lives here)
    if (doc.documentName === "Token" && doc.actor) return doc.actor;

    // TokenDocument in some contexts may resolve as a Scene or other parent; fall through
    return doc.actor ?? null;
  };

  try {
    // Attempt 1: consume via Actor + embedded Item id
    if (actorUuid && ammoId) {
      const actor = await _resolveActor(actorUuid);
      const ammo = actor?.items?.get?.(ammoId) ?? null;

      if (ammo && ammo.type === "ammunition") {
        const qty = Number(ammo.system?.quantity ?? 0);
        const next = Math.min(qty, Math.max(0, Number(qtyAfter ?? 0)));
        if (next !== qty) {
          await actor.updateEmbeddedDocuments("Item", [{ _id: ammoId, "system.quantity": next }]);
        }
        return true;
      }
    }

    // Attempt 2: consume by resolving the embedded Item UUID directly
    if (ammoUuid) {
      const doc = await fromUuid(ammoUuid);
      if (!doc) {
        ui.notifications.warn(`${ammoName || "Ammunition"}: could not be resolved for consumption.`);
        return false;
      }
      const qty = Number(doc.system?.quantity ?? 0);
      const next = Math.min(qty, Math.max(0, Number(qtyAfter ?? 0)));
      if (next !== qty) await doc.update({ "system.quantity": next });
      return true;
    }

    ui.notifications.warn(`${ammoName || "Ammunition"}: could not be resolved for consumption.`);
    return false;
  } catch (err) {
    console.error("UESRPG | Failed to consume ammo", { pendingAmmo, err });
    ui.notifications.error(`${ammoName || "Ammunition"}: failed to consume. See console for details.`);
    return false;
  }
}

async function _postManualEffectChatCard({
  attacker,
  aToken,
  itemLabel,
  itemImg,
  dmg,
  hitLocation,
  effectLabel = "Damage",
  pillsInline = "",
  applyButtonHtml = "",
  extraNoteHtml = "",
  parentMessageId = null,
  stage = "damage",
} = {}) {
  if (!attacker || !dmg) return;

  const headerImg = itemImg ? `<img src="${itemImg}" style="height:32px;width:32px;">` : "";
  const headerLabel = itemLabel ?? "Effect";

  const cardHtml = `
    <div class="uesrpg-weapon-damage-card">
      <h2 style="display:flex;gap:0.5rem;align-items:center;">
        ${headerImg}
        <div>${headerLabel}</div>
      </h2>

      <table class="uesrpg-weapon-damage-table">
        <thead>
          <tr>
            <th>${effectLabel}</th>
            <th class="tableCenterText">Result</th>
            <th class="tableCenterText">Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="tableAttribute">${effectLabel}</td>
            <td class="tableCenterText">${dmg.finalDamage}</td>
            <td class="tableCenterText">
              <div>${dmg.damageString}</div>
              <div style="margin-top:0.35rem;">${pillsInline}</div>
            </td>
          </tr>
          ${hitLocation ? `
          <tr>
            <td class="tableAttribute">Hit Location</td>
            <td class="tableCenterText">${hitLocation}</td>
            <td class="tableCenterText">from attack roll</td>
          </tr>` : ""}
        </tbody>
      </table>
      ${extraNoteHtml ? `<div style="margin-top:0.5rem; opacity:0.9;">${extraNoteHtml}</div>` : ""}
      ${applyButtonHtml ? `<div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">${applyButtonHtml}</div>` : ""}
    </div>
  `;

  const msgFlags = parentMessageId ? _opposedFlags(parentMessageId, stage) : undefined;
  const created = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
    content: cardHtml,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: [dmg.rollA, dmg.rollB].filter(Boolean),
    rollMode: game.settings.get("core", "rollMode"),
    flags: msgFlags,
  });
  return created;
}

let _qualityLabelIndexCache = null;

function _getQualityLabelIndex() {
  if (_qualityLabelIndexCache) return _qualityLabelIndexCache;
  const core = UESRPG?.QUALITIES_CORE_BY_TYPE?.weapon ?? UESRPG?.QUALITIES_CATALOG ?? [];
  const traits = UESRPG?.TRAITS_BY_TYPE?.weapon ?? [];
  const idx = new Map();
  for (const q of [...core, ...traits, ...(UESRPG?.QUALITIES_CATALOG ?? [])]) {
    if (!q?.key) continue;
    idx.set(String(q.key).toLowerCase(), String(q.label ?? q.key));
  }
  _qualityLabelIndexCache = idx;
  return idx;
}

function _buildInlineQualityTags({ structured = [], traits = [] } = {}) {
  const labelIndex = _getQualityLabelIndex();
  const out = [];

  for (const q of structured) {
    const key = String(q?.key ?? q ?? "").toLowerCase().trim();
    if (!key) continue;
    const label = labelIndex.get(key) ?? key;
    const v = (q?.value !== undefined && q?.value !== null && q?.value !== "") ? Number(q.value) : null;
    out.push(`<span class="tag">${v != null && !Number.isNaN(v) ? `${label} (${v})` : label}</span>`);
  }

  for (const t of traits) {
    const key = String(t ?? "").toLowerCase().trim();
    if (!key) continue;
    const label = labelIndex.get(key) ?? key;
    out.push(`<span class="tag">${label}</span>`);
  }

  if (!out.length) return '<span style="opacity:0.75;">-</span>';
  return `<span class="uesrpg-inline-tags">${out.join("")}</span>`;
}

function _collectWeaponInlineQualities(weapon) {
  if (!weapon) return { structured: [], traits: [] };
  const structured = Array.isArray(weapon.system?.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system?.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];
  const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
  return { structured, traits };
}

function _collectActivationDamageQualities(activationDamage) {
  if (!activationDamage) return { structured: [], traits: [] };
  const structured = Array.isArray(activationDamage.qualitiesStructured) ? activationDamage.qualitiesStructured : [];
  const traits = Array.isArray(activationDamage.qualitiesTraits) ? activationDamage.qualitiesTraits : [];
  return { structured, traits };
}

function _buildWeaponPillsInline(weapon) {
  if (!weapon) return "";
  const injected = Array.isArray(weapon.system?.qualitiesStructuredInjected)
    ? weapon.system.qualitiesStructuredInjected
    : Array.isArray(weapon.system?.qualitiesStructured)
      ? weapon.system.qualitiesStructured
      : [];

  const structured = injected
    .filter(q => q?.active)
    .map(q => q?.name)
    .filter(Boolean);

  const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
  const pills = [...structured, ...traits].filter(Boolean);
  return pills.map(p => `<span class="uesrpg-pill">${p}</span>`).join(" ");
}

/**
 * Post a weapon damage chat card.
 *
 * This mirrors the standard "Roll Damage" output so that block-resolution flows
 * still provide a clear record of hit location and rolled damage.
 *
 * Non-invasive: chat-only; does not mutate documents.
 */
async function _postWeaponDamageChatCard({
  attacker,
  aToken,
  weapon,
  dmg,
  hitLocation,
  applyButtonHtml = "",
  extraNoteHtml = "",
  parentMessageId = null,
  stage = "damage",
} = {}) {
  if (!attacker || !weapon || !dmg) return;

  const pillsInline = _buildWeaponPillsInline(weapon);

  const altTag = dmg?.usedAltDamage ? ` <span style="opacity:0.85; font-size:12px;">(2H)</span>` : "";

  const cardHtml = `
    <div class="uesrpg-weapon-damage-card">
      <h2 style="display:flex;gap:0.5rem;align-items:center;">
        <img src="${weapon.img}" style="height:32px;width:32px;">
        <div>${weapon.name}</div>
      </h2>

      <table class="uesrpg-weapon-damage-table">
        <thead>
          <tr>
            <th>Damage</th>
            <th class="tableCenterText">Result</th>
            <th class="tableCenterText">Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="tableAttribute">Damage</td>
            <td class="tableCenterText">${dmg.finalDamage}${altTag}</td>
            <td class="tableCenterText">
              <div>${dmg.damageString}</div>
              <div style="margin-top:0.35rem;">${pillsInline}</div>
            </td>
          </tr>
          <tr>
            <td class="tableAttribute">Hit Location</td>
            <td class="tableCenterText">${hitLocation}</td>
            <td class="tableCenterText">from attack roll</td>
          </tr>
        </tbody>
      </table>
      ${extraNoteHtml ? `<div style="margin-top:0.5rem; opacity:0.9;">${extraNoteHtml}</div>` : ""}
      ${applyButtonHtml ? `<div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">${applyButtonHtml}</div>` : ""}
    </div>
  `;

  const msgFlags = parentMessageId ? _opposedFlags(parentMessageId, stage) : undefined;
  // Ammunition is consumed at attack time (prior to the attack roll), not when the damage card is posted.
  // Keep flags lane clean: do not schedule post-hoc consumption here.

  // Return the created message so callers can enforce strict ordering when multiple
  // chat cards are posted in sequence (e.g., Resolve Block -> weapon card -> block result).
  const created = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
    content: cardHtml,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: [dmg.rollA, dmg.rollB].filter(Boolean),
    rollMode: game.settings.get("core", "rollMode"),
    flags: msgFlags,
  });
  return created;
}

function _buildSharedDamagePayload({ mode, dmg, weaponUuid = null, damageType = null } = {}) {
  if (!mode || !dmg) return null;
  return {
    mode,
    weaponUuid: weaponUuid ?? null,
    damageType: damageType ?? null,
    damageString: dmg.damageString ?? "0",
    finalDamage: Number(dmg.finalDamage ?? 0) || 0,
    rollATotal: Number(dmg.rollA?.total ?? NaN),
    rollBTotal: Number(dmg.rollB?.total ?? NaN),
    rerollMode: dmg.rerollMode ?? null,
    damagedValue: dmg.damagedValue ?? null,
    usedAltDamage: Boolean(dmg.usedAltDamage)
  };
}

function _inflateSharedDamage(shared) {
  if (!shared) return null;
  return {
    damageString: shared.damageString ?? "0",
    finalDamage: Number(shared.finalDamage ?? 0) || 0,
    rollA: null,
    rollB: null,
    rerollMode: shared.rerollMode ?? null,
    damagedValue: shared.damagedValue ?? null,
    usedAltDamage: Boolean(shared.usedAltDamage)
  };
}

const _bankedAutoRollLocalLocks = new Set();

export const OpposedWorkflow = {
  async consumePendingAmmo(pendingAmmo) {
    return _consumePendingAmmo(pendingAmmo);
  },

  /**
   * Bank an externally-created roll message (attacker-roll / defender-roll / defender-nodefense)
   * into the originating opposed chat card.
   *
   * Rationale: players can always create their own roll messages, but Foundry's ChatMessage
   * update permissions can prevent that player from updating the *parent* opposed card (which
   * is authored by another user). When an active GM is present, this method is intended to be
   * executed on the active GM client from a createChatMessage hook.
   *
   * @param {ChatMessage} rollMessage
   */
  async applyExternalRollMessage(rollMessage) {
    const meta = rollMessage?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
    const parentId = meta?.parentMessageId ?? null;
    const stage = meta?.stage ?? null;

    const rollId = rollMessage?.id ?? rollMessage?._id ?? null;
    if (!parentId || !stage) return;

    const parent = game.messages.get(parentId) ?? null;
    if (!parent) return;

    const current = parent?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
    if (!current || typeof current !== "object") return;

    // Anti-spoof + consistency checks: only bank roll messages that match the expected side.
    // This prevents other users from posting a roll message that is incorrectly attributed.
    const defenderIndex = _resolveDefenderIndex(current, meta ?? {});
    const defenderEntry = (defenderIndex != null) ? _getDefenderEntries(current)[defenderIndex] : current.defender;
    const expectedSide = (stage === "attacker-roll")
      ? current.attacker
      : ((stage === "defender-roll" || stage === "defender-nodefense") ? defenderEntry : null);

    if (!expectedSide?.actorUuid) return;

    const expectedActor = _resolveActor(expectedSide.actorUuid);
    if (!expectedActor) return;

    const speakerActorId = rollMessage?.speaker?.actor ?? null;
    if (speakerActorId && speakerActorId !== expectedActor.id) return;

    const authorId =
      rollMessage?.author?.id ??
      rollMessage?._source?.author ??
      rollMessage?._source?.user ??
      rollMessage?.data?.author ??
      rollMessage?.data?.user ??
      null;
    const authorUser = authorId ? (game.users.get(String(authorId)) ?? null) : null;
    if (!authorUser) return;

    if (!authorUser.isGM && !_userHasActorOwnership(authorUser, expectedActor)) return;

    // Clone so we never mutate message.flags directly.
    const data = foundry.utils.deepClone(current);
    _selectDefenderEntry(data, { defenderIndex, defenderTokenUuid: meta?.defenderTokenUuid, defenderActorUuid: meta?.defenderActorUuid });

    let dirty = false;

    const applyResult = async (side) => {
      if (!side?.actorUuid) return null;
      let actor = null;
      try {
        const doc = fromUuidSync(side.actorUuid);
        actor = (doc?.documentName === "Actor") ? doc : (doc?.actor ?? null);
      } catch (_e) {
        actor = null;
      }
      if (!actor) return null;

      const roll = rollMessage?.rolls?.[0] ?? null;
      const rollTotal = Number(roll?.total ?? NaN);
      if (!Number.isFinite(rollTotal)) return null;

      const res = computeResultFromRollTotal(actor, {
        rollTotal,
        target: Number(side.target ?? side?.tn?.finalTN ?? 0),
        allowLucky: true,
        allowUnlucky: true
      });

      return {
        rollTotal: res.rollTotal,
        target: res.target,
        isSuccess: res.isSuccess,
        degree: res.degree,
        textual: res.textual,
        isCriticalSuccess: res.isCriticalSuccess,
        isCriticalFailure: res.isCriticalFailure
      };
    };

    // If the roll message includes a commit payload (computed TN, labels, etc.),
    // apply it to the parent card before computing success/DoS/DoF.
    // This is required when the roller lacks permission to update the parent chat card.
    if (stage === "defender-roll") {
      const c = meta?.commit?.defender ?? null;
      if (c && typeof c === "object") {
        data.defender = data.defender ?? {};
        if (c.defenseType != null) data.defender.defenseType = String(c.defenseType);
        if (c.label != null) data.defender.label = String(c.label);
        if (c.defenseLabel != null) data.defender.defenseLabel = String(c.defenseLabel);
        if (c.testLabel != null) data.defender.testLabel = String(c.testLabel);
        if (c.target != null && Number.isFinite(Number(c.target))) data.defender.target = Number(c.target);
        if (c.targetLabel != null) data.defender.targetLabel = String(c.targetLabel);
        if (c.tn && typeof c.tn === "object") data.defender.tn = foundry.utils.deepClone(c.tn);
      }
    }

    if (stage === "attacker-roll") {
      const c = meta?.commit?.attacker ?? null;
      if (c && typeof c === "object") {
        _applyAttackerCommitToData(data, c);
      }
    }

if (stage === "attacker-roll") {
      if (data.attacker?.result) {
        if (!data.attacker.rollMessageId && rollId) {
          data.attacker.rollMessageId = rollId;
          data.attacker.rolledAt = Date.now();
          dirty = true;
        } else {
          return;
        }
      } else {
        const r = await applyResult(data.attacker);
        if (!r) return;
        data.attacker.result = r;
        if (rollId) {
          data.attacker.rollMessageId = rollId;
          data.attacker.rolledAt = Date.now();
        }
        dirty = true;
      }
    } else if (stage === "defender-roll") {
      if (data.defender?.noDefense) return;
      if (data.defender?.result) {
        if (!data.defender.rollMessageId && rollId) {
          data.defender.rollMessageId = rollId;
          data.defender.rolledAt = Date.now();
          dirty = true;
        } else {
          return;
        }
      } else {
        const r = await applyResult(data.defender);
        if (!r) return;
        data.defender.result = r;
        if (rollId) {
          data.defender.rollMessageId = rollId;
          data.defender.rolledAt = Date.now();
        }
        dirty = true;
      }
    } else if (stage === "defender-nodefense") {
      if (data.defender?.result || data.defender?.noDefense) return;
      if (rollId) {
        data.defender.noDefenseMessageId = rollId;
        data.defender.noDefenseAt = Date.now();
      }
      dirty = true;
      data.defender.noDefense = true;
      data.defender.defenseType = "none";
      data.defender.label = data.defender.label || "No Defense";
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
      data.defender.target = 0;
      data.defender.tn = data.defender.tn || { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1, textual: "1 DoF", isCriticalSuccess: false, isCriticalFailure: false };
    } else {
      return;
    }


    // Post-roll adjustments (schema-safe).
    // Dueling Weapon: grants +1 Degree of Success on successful Parry or Counter-Attack.
    if (stage === "defender-roll" && data.defender?.result?.isSuccess && !Number(data.defender.result.duelingBonus)) {
      const dt = String(data.defender?.defenseType ?? "");
      if (dt === "parry" || dt === "counter") {
        try {
          const defWUuid = _getPreferredWeaponUuid(expectedActor, { meleeOnly: true }) || "";
          if (defWUuid) {
            const defW = fromUuidSync(defWUuid);
            if (defW?.type === "weapon" && _weaponHasQuality(defW, "dueling")) {
              data.defender.result.degree = Math.max(1, (Number(data.defender.result.degree) || 1) + 1);
              data.defender.result.duelingBonus = 1;
              data.defender.result.textual = data.defender.result.isSuccess
                ? `${data.defender.result.degree} DoS`
                : `${data.defender.result.degree} DoF`;
              dirty = true;
            }
          }
        } catch (err) {
          console.warn("UESRPG | opposed-workflow | dueling weapon bonus lookup failed", err);
        }
      }
    }
    if (stage === "defender-roll") {
      await _maybeSetAoEEvadeEscape(data, data.defender, expectedActor);
      dirty = true;
    }
    // Phase tracking (non-breaking; used for diagnostics).
    data.context = data.context ?? {};
    if (stage === "attacker-roll") {
      data.context.phase = "waitingDefender";
      if (!data.context.waitingSince) data.context.waitingSince = Date.now();
    }
    if (stage === "defender-roll" || stage === "defender-nodefense") {
      if (!data.context.phase || data.context.phase === "pending") data.context.phase = "resolving";
    }

    // Resolve if ready.
    const currentOutcome = _getDefenderOutcome(data, data.defender);
    if (data.attacker?.result && (data.defender?.result || data.defender?.noDefense) && !currentOutcome) {
      const baseOutcome = _resolveOutcomeRAW(data, data.defender) ?? { winner: "tie", text: "" };
      const outcome = _applyAoEEvadeOutcome(data, baseOutcome);
      _setDefenderOutcome(data, data.defender, outcome);
      _setDefenderAdvantage(data, data.defender, _computeAdvantageRAW(data, outcome, data.defender));

      const allResolved = _getDefenderEntries(data).every(def => Boolean(_getDefenderOutcome(data, def)));
      if (allResolved) {
        data.status = "resolved";
        data.context = data.context ?? {};
        data.context.phase = "resolved";
        if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
        _cleanupAutoRollContext(data.context);
      }
      dirty = true;
    }

    // Multi-defender: when the attacker roll arrives, resolve every committed defender lane.
    if (stage === "attacker-roll" && _isMultiDefender(data) && data.attacker?.result) {
      const originalDefender = data.defender;
      const defenders = _getDefenderEntries(data);
      let resolvedAny = false;

      for (const def of defenders) {
        if (!def) continue;
        if (!(def.result || def.noDefense)) continue;
        if (_getDefenderOutcome(data, def)) continue;

        data.defender = def;
        const baseOutcome = _resolveOutcomeRAW(data, def) ?? { winner: "tie", text: "" };
        const outcome = _applyAoEEvadeOutcome(data, baseOutcome, def);
        _setDefenderOutcome(data, def, outcome);
        _setDefenderAdvantage(data, def, _computeAdvantageRAW(data, outcome, def));
        resolvedAny = true;
      }

      if (resolvedAny) {
        const allResolved = defenders.every(def => Boolean(_getDefenderOutcome(data, def)));
        if (allResolved) {
          data.status = "resolved";
          data.context = data.context ?? {};
          data.context.phase = "resolved";
          if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
          _cleanupAutoRollContext(data.context);
        }
        dirty = true;
      }

      data.defender = originalDefender;
    }

    // Multi-defender: when a defender roll arrives, also resolve other defenders who have already rolled.
    // This ensures that when Defender A rolls after Defender B has already rolled, both get resolved.
    if ((stage === "defender-roll" || stage === "defender-nodefense") && _isMultiDefender(data) && data.attacker?.result) {
      const originalDefender = data.defender;
      const defenders = _getDefenderEntries(data);
      let resolvedAny = false;

      for (const def of defenders) {
        if (!def) continue;
        if (!(def.result || def.noDefense)) continue;
        if (_getDefenderOutcome(data, def)) continue;

        data.defender = def;
        const baseOutcome = _resolveOutcomeRAW(data, def) ?? { winner: "tie", text: "" };
        const outcome = _applyAoEEvadeOutcome(data, baseOutcome, def);
        _setDefenderOutcome(data, def, outcome);
        _setDefenderAdvantage(data, def, _computeAdvantageRAW(data, outcome, def));
        resolvedAny = true;
      }

      if (resolvedAny) {
        const allResolved = defenders.every(def => Boolean(_getDefenderOutcome(data, def)));
        if (allResolved) {
          data.status = "resolved";
          data.context = data.context ?? {};
          data.context.phase = "resolved";
          if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
          _cleanupAutoRollContext(data.context);
        }
        dirty = true;
      }

      data.defender = originalDefender;
    }

    await _updateCard(parent, data);
  },

  /**
   * Banked-choice auto roll hook helper.
   * Called from updateChatMessage (GM) to begin rolling once both sides have committed.
   */
  async maybeAutoRollBanked(message) {
    try {
      if (!message) return;

      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isBankChoicesEnabledForData(opposed)) return;

      const data = foundry.utils.deepClone(opposed);
      _ensureBankedScaffold(data);

      // Only proceed when a roll has been requested and has not started.
      if (!data?.context?.autoRollRequested) return;
      if (data?.context?.autoRollStarted) return;

      const defenders = _getDefenderEntries(data);
      // For banking: require ALL defenders to be committed before rolling
      const allCommitted = _allDefendersCommitted(data);
      if (!allCommitted) return;

      // Only the active GM should run the auto-roll.
      if (!_anyActiveGMOnline()) return;
      const activeGM = game.users.activeGM ?? null;
      if (activeGM && game.user.id !== activeGM.id) return;
      if (!game.user.isGM) return;

      await this._autoRollBanked(message.id, { trigger: "hook" });
    } catch (err) {
      console.error("UESRPG | maybeAutoRollBanked failed", err);
    }
  },

  /**
   * Banked-choice auto roll helper for non-GM scenarios.
   *
   * If no active GM is online, each participant auto-rolls their own committed lane once
   * both sides have committed. Parent-card updates are still applied by the message author
   * (via Authority Proxy), so the workflow completes deterministically without a manual
   * “Roll (GM)” confirmation.
   */
  async maybeAutoRollBankedNoGM(message) {
    try {
      if (!message) return;

      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isBankChoicesEnabledForData(opposed)) return;

      // If any active GM is online, the GM is the canonical runner.
      if (_anyActiveGMOnline()) return;

      const data = foundry.utils.deepClone(opposed);
      _ensureBankedScaffold(data);

      const defenders = _getDefenderEntries(data);
      // For banking: require ALL defenders to be committed before rolling
      const allCommitted = _allDefendersCommitted(data);
      if (!allCommitted) return;

      data.context = data.context ?? {};
      if (!data.context.autoRollRequested) {
        // Compatibility: older cards may not set this in commit handlers.
        data.context.autoRollRequested = true;
        data.context.autoRollRequestedAt = Date.now();
        data.context.autoRollRequestedBy = game.user.id;
        await _updateCard(message, data);
      }

      const userId = game.user?.id ?? null;
      if (!userId) return;

      // Attacker lane: only the committing user should auto-roll.
      if (!data.attacker?.result && data.attacker?.banked?.committed === true && data.attacker?.banked?.committedBy === userId) {
        // Only attempt if a declaration exists.
        const t = Number(data.attacker?.target ?? data.attacker?.tn?.finalTN ?? NaN);
        if (Number.isFinite(t)) {
          const committedIdx = defenders.findIndex(def => _getBankCommitState(data, def).bothCommitted);
          const idx = committedIdx >= 0 ? committedIdx : 0;
          await this.handleAction(message, "attacker-roll-committed", { defenderIndex: idx });
        }
      }

      // Defender lane: only the committing user should auto-roll, and only if this is not No Defense.
      for (let idx = 0; idx < defenders.length; idx += 1) {
        const def = defenders[idx];
        if (!def || def.result || def.noDefense === true) continue;
        if (def?.banked?.committed !== true || def?.banked?.committedBy !== userId) continue;
        const dt = String(def?.defenseType ?? "");
        if (!dt || dt === "none") continue;
        const t = Number(def?.target ?? def?.tn?.finalTN ?? NaN);
        if (Number.isFinite(t)) {
          await this.handleAction(message, "defender-roll-committed", { defenderIndex: idx });
        }
      }
    } catch (err) {
      console.error("UESRPG | maybeAutoRollBankedNoGM failed", err);
    }
  },
  /**
   * Begin rolling a banked-choice opposed test once both sides have committed.
   * This will roll any unresolved lanes without prompting for additional choices.
   *
   * Safeguards:
   *  - Local lock prevents same-client re-entrancy (e.g. commit-path + update hook).
   *  - Claim-id prevents cross-caller duplication if two runners attempt to start simultaneously.
   */
  async _autoRollBanked(parentMessageId, { trigger = "auto" } = {}) {
    const message = game.messages.get(parentMessageId) ?? null;
    if (!message) return;

    // Same-client re-entrancy guard.
    if (_bankedAutoRollLocalLocks.has(parentMessageId)) return;
    _bankedAutoRollLocalLocks.add(parentMessageId);

    try {
      const opposed = message?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      if (!opposed) return;
      if (!_isBankChoicesEnabledForData(opposed)) return;

      const data = foundry.utils.deepClone(opposed);
      _ensureBankedScaffold(data);

      const defenders = _getDefenderEntries(data);
      // For banking: require ALL defenders to be committed before rolling
      const allCommitted = _allDefendersCommitted(data);
      if (!allCommitted) return;

      data.context = data.context ?? {};
      if (data.context.autoRollStarted) return;

      // Claim this auto-roll run. If another caller claims after us, we will abort.
      const claimId = foundry.utils.randomID();
      data.context.autoRollClaimId = claimId;
      data.context.autoRollStarted = true;
      data.context.autoRollStartedAt = Date.now();
      data.context.autoRollStartedBy = game.user.id;
      data.context.autoRollStartedTrigger = String(trigger ?? "auto");

      if (!data.context.autoRollRequested) {
        data.context.autoRollRequested = true;
        data.context.autoRollRequestedAt = Date.now();
        data.context.autoRollRequestedBy = game.user.id;
      }

      await _updateCard(message, data);

      // Verify we still own the claim after the persisted update.
      // (If another runner wrote a different claimId, they are the canonical runner.)
      const fresh = game.messages.get(parentMessageId) ?? message;
      const freshOpposed = fresh?.flags?.["uesrpg-3ev4"]?.opposed ?? null;
      const freshClaimId = freshOpposed?.context?.autoRollClaimId ?? null;
      if (freshClaimId && freshClaimId !== claimId) return;

      // Roll unresolved lanes (committed).
      const freshDefenders = _getDefenderEntries(freshOpposed);
      const committedIdx = freshDefenders.findIndex(def => _getBankCommitState(freshOpposed, def).bothCommitted);
      if (!freshOpposed?.attacker?.result && committedIdx >= 0) {
        await this.handleAction(fresh, "attacker-roll-committed", { defenderIndex: committedIdx });
      }

      for (let idx = 0; idx < freshDefenders.length; idx += 1) {
        const def = freshDefenders[idx];
        if (!def || def.result || def.noDefense === true) continue;
        const bankState = _getBankCommitState(freshOpposed, def);
        if (!bankState.bothCommitted) continue;
        await this.handleAction(fresh, "defender-roll-committed", { defenderIndex: idx });
      }
    } finally {
      _bankedAutoRollLocalLocks.delete(parentMessageId);
    }
  },


  /**
   * Create a pending opposed test card.
   * Compatible with legacy callers.
   */
  async createPending(cfg = {}) {
    const aDoc = _resolveDoc(cfg.attackerTokenUuid) ?? _resolveDoc(cfg.attackerActorUuid) ?? _resolveDoc(cfg.attackerUuid);
    const aToken = _resolveToken(aDoc);
    const attacker = _resolveActor(aDoc);

    const defenderRefs = [];
    const addDefenderRef = (ref) => {
      if (!ref) return;
      if (typeof ref === "string") defenderRefs.push(ref);
      else if (ref?.uuid) defenderRefs.push(ref.uuid);
    };

    if (Array.isArray(cfg.defenders)) {
      for (const def of cfg.defenders) {
        addDefenderRef(def?.tokenUuid ?? def?.actorUuid ?? def?.uuid ?? def);
      }
    }
    if (Array.isArray(cfg.defenderTokenUuids)) {
      for (const ref of cfg.defenderTokenUuids) addDefenderRef(ref);
    }
    if (Array.isArray(cfg.defenderActorUuids)) {
      for (const ref of cfg.defenderActorUuids) addDefenderRef(ref);
    }
    addDefenderRef(cfg.defenderTokenUuid ?? cfg.defenderActorUuid ?? cfg.defenderUuid);

    const defenderEntries = [];
    const seen = new Set();
    for (const ref of defenderRefs) {
      const dDoc = _resolveDoc(ref);
      const dToken = _resolveToken(dDoc);
      const dActor = _resolveActor(dDoc);
      if (!dActor) continue;
      const key = dToken?.document?.uuid ?? dToken?.uuid ?? dActor.uuid;
      if (seen.has(key)) continue;
      seen.add(key);

      defenderEntries.push({
        actorUuid: dActor.uuid,
        tokenUuid: dToken?.document?.uuid ?? null,
        tokenName: dToken?.name ?? null,
        name: dActor.name,
        label: null,
        testLabel: null,
        defenseLabel: null,
        target: null,
        defenseType: null,
        result: null,
        noDefense: false,
        banked: { committed: false, committedAt: null, committedBy: null },
        tn: null,
        outcome: null,
        advantage: null
      });
    }

    if (!attacker || defenderEntries.length === 0) {
      ui.notifications.warn("Opposed test requires both an attacker and at least one defender (token or actor).");
      return null;
    }

    // Chapter 5 (Defensive Stance): Attack limit reduced to 0 until next Turn.
    // Prevent creating a pending attack when Defensive Stance is active.
    if (String(cfg.mode ?? "attack") === "attack" && _findEnabledEffectByUesrpgKey(attacker, "defensiveStance")) {
      ui.notifications.warn("Defensive Stance is active: you cannot attack until your next Turn.");
      return null;
    }

    const baseTarget = Number(cfg.attackerTarget ?? 0);

    // Seed the opposed context with a weapon UUID.
    //
    // Default behavior: use the attacker's preferred equipped weapon.
    // Override behavior (cfg.weaponUuid): used by sheet quick-actions to ensure
    // the pending card reflects the clicked weapon and that the Declare dialog
    // preselects the correct weapon.
    //
    // This is required for deterministic range band TN modifiers and weapon-quality gating
    // (e.g., Flail) during DefenseDialog, before any damage-resolution step.
    let seededWeaponUuid = "";
    if (cfg.weaponUuid) {
      try {
        const w = fromUuidSync(String(cfg.weaponUuid));
        if (w && w.documentName === "Item" && w.type === "weapon" && w.parent?.uuid === attacker.uuid) {
          seededWeaponUuid = w.uuid;
        }
      } catch (_e) {
        seededWeaponUuid = "";
      }
    }
    if (!seededWeaponUuid) seededWeaponUuid = _getPreferredWeaponUuid(attacker, { meleeOnly: false }) || "";
    const seededAttackMode = cfg.attackMode ? String(cfg.attackMode) : await _inferAttackModeFromPreferredWeapon(attacker);

    const isAoE = Boolean(cfg?.aoe?.isAoE || cfg?.context?.aoe?.isAoE || cfg?.isAoE);
    const data = {
        context: {
          schemaVersion: 1,
          createdAt: Date.now(),
          createdBy: game.user.id,
          updatedAt: Date.now(),
          updatedBy: game.user.id,
          phase: 'pending',
          waitingSince: null,
          weaponUuid: seededWeaponUuid || null,
          attackMode: seededAttackMode || "melee",
          forcedHitLocation: isAoE ? "Body" : (cfg.forcedHitLocation ?? null),
          aoe: cfg?.aoe ? foundry.utils.deepClone(cfg.aoe) : undefined,
          isAoE: cfg?.isAoE ?? undefined,
          activation: cfg.activation ?? null,
          skipAttackerAPDeduction: Boolean(cfg.skipAttackerAPDeduction),
          bankChoicesEnabled: true,
          autoRollRequested: false,
        autoRollRequestedAt: null,
        autoRollRequestedBy: null,
        autoRollStarted: false,
        autoRollStartedAt: null,
        autoRollStartedBy: null
      },
      status: "pending",
      mode: cfg.mode ?? "attack",
      attacker: {
        actorUuid: attacker.uuid,
        tokenUuid: aToken?.document?.uuid ?? null,
        tokenName: aToken?.name ?? null,
        name: attacker.name,
        label: cfg.attackerLabel ?? "Attack",
        itemUuid: cfg.attackerItemUuid ?? cfg.itemUuid ?? null,
        baseTarget,
        hasDeclared: false,
        banked: { committed: false, committedAt: null, committedBy: null },
        variant: "normal",
        variantMod: 0,
        manualMod: 0,
        totalMod: 0,
        target: baseTarget,
        tn: null,
        result: null
      },
      defender: defenderEntries[0] ?? {},
      defenders: defenderEntries,
      outcome: null
    };

    const message = await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
      content: _renderCard(data, ""),
      flags: { "uesrpg-3ev4": { opposed: data } }
    });

    await message.update({ content: _renderCard(data, message.id) });

    _logDebug("createPending", {
      messageId: message.id,
      attackerUuid: data.attacker.actorUuid,
      defenderUuid: data.defender.actorUuid,
      mode: data.mode
    });

    return message;
  },

  async handleAction(message, action, opts = {}) {
    const messageId = message?.id ?? message?._id ?? null;
    const liveMessage = messageId ? (game.messages.get(messageId) ?? message) : message;
    const raw = liveMessage?.flags?.["uesrpg-3ev4"]?.opposed;
    if (!raw) return;

    // Clone so we never mutate ChatMessage flags directly (prevents stale-snapshot regressions).
    const data = foundry.utils.deepClone(raw);

    // From here on, operate on the live ChatMessage document.
    message = liveMessage;

    // Normalize combat context once per interaction to avoid legacy field regressions.
    data.context = data.context ?? {};
    if (!data.context.attackMode) data.context.attackMode = getContextAttackMode(data.context);

    const { defender: defenderData, defenderIndex, defenders, isMulti } = _selectDefenderEntry(data, opts);
    const attacker = _resolveActor(data.attacker.actorUuid);
    const defender = defenderData ? _resolveActor(defenderData.actorUuid) : null;
    const aToken = _resolveToken(data.attacker.tokenUuid);
    const dToken = defenderData ? _resolveToken(defenderData.tokenUuid) : null;

    if (!attacker || !defender) {
      ui.notifications.warn("Opposed Test: could not resolve attacker/defender.");
      return;
    }

    // Banked choice mode (meta-limiting): snapshot and state scaffold
    const bankMode = _isBankChoicesEnabledForData(data);
    _ensureBankedScaffold(data);
    const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);

    // Back-compat: treat legacy actions as banked commits when bankMode is enabled.
    if (bankMode) {
      if (action === "attacker-roll") action = "attacker-commit";
      if (action === "defender-roll") action = "defender-commit";
      if (action === "defender-nodefense") action = "defender-commit-nodefense";
    }
    // Banked roll trigger (meta-limiting): begin rolling once both sides have committed.
    if (action === "banked-roll") {
      if (!bankMode) return;
      const bank = _getBankCommitState(data);
      if (!bank.bothCommitted) {
        ui.notifications.warn("Both sides must commit their choices before rolling.");
        return;
      }

      data.context = data.context ?? {};
      if (!data.context.autoRollRequested) {
        data.context.autoRollRequested = true;
        data.context.autoRollRequestedAt = Date.now();
        data.context.autoRollRequestedBy = game.user.id;
      }

      await _updateCard(message, data);

      if (!_anyActiveGMOnline()) {
        ui.notifications.info("No active GM is online; rolling will proceed automatically for each participant.");
        return;
      }

      const activeGM = game.users.activeGM ?? null;
      if (activeGM && game.user.id !== activeGM.id) {
        ui.notifications.info("Requested GM to begin the opposed roll.");
        return;
      }

      if (!game.user.isGM) {
        ui.notifications.warn("Only the active GM may begin the opposed roll.");
        return;
      }

      await this._autoRollBanked(message.id, { trigger: "manual" });
      return;
    }

    // --- Attacker Actions ---
    if (action === "attacker-roll" || action === "attacker-commit" || action === "attacker-roll-committed") {
      const isCommit = action === "attacker-commit";
      const isRollCommitted = action === "attacker-roll-committed";

      if (data.attacker.result) return;

      if (isCommit && !bankMode) {
        ui.notifications.warn("Banked choices are not enabled for this opposed test.");
        return;
      }

      if (!_canControlActor(attacker)) {
        ui.notifications.warn("You do not have permission to roll for the attacker.");
        return;
      }

      const bank = bankMode ? _getBankCommitState(data, data.defender) : null;
      if (isRollCommitted) {
        if (!bankMode) {
          ui.notifications.warn("Banked choices are not enabled for this opposed test.");
          return;
        }
        if (!bank?.bothCommitted) {
          ui.notifications.warn("Both sides must commit their choices before rolling.");
          return;
        }
        if (!data.attacker.hasDeclared || !Number.isFinite(Number(data.attacker.target))) {
          ui.notifications.warn("Attacker has not committed an attack declaration yet.");
          return;
        }
      }

      // Chapter 5 (Restrained): cannot attack.
      if (hasCondition(attacker, "restrained")) {
        ui.notifications.warn(`${attacker.name} is Restrained and cannot attack.`);
        return;
      }

      // Chapter 5 (Defensive Stance): Attack limit reduced to 0 until next Turn.
      if (_findEnabledEffectByUesrpgKey(attacker, "defensiveStance")) {
        ui.notifications.warn("Defensive Stance is active: you cannot attack until your next Turn.");
        return;
      }

      let decl = null;
      let pendingApCost = Number(data.attacker?.pendingApCost ?? 0) || 0;

      if (!isRollCommitted) {
        // One dialog only: (optional) combat style selector + attack variant + manual modifier.
        const styles = listCombatStyles(attacker);
        const selectedStyleUuid = styles.find(s => s.uuid === data.attacker.itemUuid)?.uuid ?? styles[0]?.uuid ?? data.attacker.itemUuid ?? null;

        // Attack type is inferred from the currently preferred weapon (automatic; no manual override).
        data.context = data.context ?? {};
        data.context.attackMode = await _inferAttackModeFromPreferredWeapon(attacker);
        data.context.attackFromHidden = hasCondition(attacker, "hidden");

        // RAW: Hard gate for unloaded ranged weapons (Issue 1)
        // Before allowing attack declaration, check if the weapon is loaded
        if (data.context.attackMode === "ranged") {
          const weaponUuid = data.context?.weaponUuid || _getPreferredWeaponUuid(attacker, { meleeOnly: false });
          if (weaponUuid) {
            const weapon = await fromUuid(weaponUuid);
            if (weapon?.type === "weapon") {
              const reloadState = weapon.system?.reloadState;
              if (reloadState?.requiresReload && !reloadState?.isLoaded) {
                ui.notifications.warn(`${weapon.name} must be reloaded before attacking.`);
                return; // Hard stop - prevent attack
              }
            }
          }
        }

        decl = await _attackerDeclareDialog(attacker, data.attacker.label ?? "Attack", {
          styles,
          selectedStyleUuid,
          defaultWeaponUuid: data.context?.weaponUuid ?? null,
          defaultVariant: data.attacker.variant ?? "normal",
          defaultManual: data.attacker.manualMod ?? 0,
          defaultCirc: data.attacker.circumstanceMod ?? 0
        });
        if (!decl) return;

        // Persist the declared weapon selection into the opposed context for downstream automation
        // (range, traits, damage previews, etc.). This is a non-schema-breaking addition.
        data.context.weaponUuid = decl.weaponUuid || data.context.weaponUuid || null;

        // Normalize attackMode from the explicitly selected weapon (covers thrown weapons where weaponType may be melee).
        if (data.context.weaponUuid) {
          try {
            const w = await fromUuid(String(data.context.weaponUuid));
            if (w?.type === "weapon") {
              const wt = String(w.system?.attackMode ?? w.system?.weaponType ?? w.system?.type ?? "").toLowerCase();
              data.context.attackMode = (wt.includes("ranged") || _weaponHasQuality(w, "thrown")) ? "ranged" : "melee";
            }
          } catch (_e) {
            // No-op; keep previously inferred mode.
          }
        }

        const attackerMovementAction = _getTokenMovementAction(aToken);

        // IMPORTANT: Do not spend AP until after we have produced a real roll message.
        // This prevents AP loss if the workflow fails before resolving the roll.
        // AP: any attack costs 1 AP; variant AP cost is additive (e.g., All Out Attack is +1 AP).
        const baseApCost = (String(data.mode ?? "attack") === "attack") ? 1 : 0;
        const extraApCost = Number(decl.apCost ?? 0) || 0;
        pendingApCost = baseApCost + extraApCost;

        // If the attacker selected a different combat style, switch base TN + label now.
        if (decl.styleUuid && decl.styleUuid !== data.attacker.itemUuid) {
          const chosen = styles.find(s => s.uuid === decl.styleUuid) ?? null;
          if (chosen) {
            data.attacker.itemUuid = chosen.uuid;
            data.attacker.label = chosen.name;
          }
        }

        const manualMod = Number(decl.manualMod) || 0;
        const circumstanceMod = Number(decl.circumstanceMod) || 0;
        const situationalMods = _collectSensorySituationalMods(decl);

        // Range computation for ranged attacks.
        // Rules (Chapter 7): Close = +10, Medium = +0, Long = -20, beyond Long = cannot attack.
        // Reach computation for melee attacks.
        // RAW: weapons with a minimum reach (e.g., 2-3m) cannot attack targets closer than their minimum.
        // RAW: weapons cannot attack targets beyond their maximum reach.
        {
          let weapon = null;
          try {
            if (data.context.weaponUuid) weapon = await fromUuid(String(data.context.weaponUuid));
          } catch (_e) {
            weapon = null;
          }

          if (String(data.context?.attackMode ?? "melee") === "ranged") {
            const rangeCtx = _computeRangedRangeContext({ attackerToken: aToken, defenderToken: dToken, weapon });
            if (rangeCtx) {
              data.context.range = rangeCtx;
              if (rangeCtx.outOfRange) {
                const wName = weapon?.name ? ` (${weapon.name})` : "";
                ui.notifications.warn(`Target is out of range${wName}. Distance ${Math.round(rangeCtx.distance)} > Long ${rangeCtx.long}.`);
                return;
              }
              if (rangeCtx.band) {
                const bandLabel = rangeCtx.band === "close" ? "Close" : rangeCtx.band === "medium" ? "Medium" : "Long";
                // Only add when it actually modifies TN (Close/Long). Medium has no modifier.
                if (Number(rangeCtx.tnMod) !== 0) {
                  situationalMods.push({ key: "range", label: `Range (${bandLabel})`, value: Number(rangeCtx.tnMod) });
                }
              }
            }
          }

          if (String(data.context?.attackMode ?? "melee") === "melee") {
            const reachCtx = _computeMeleeReachContext({ attackerToken: aToken, defenderToken: dToken, weapon });
            if (reachCtx) {
              data.context.reach = reachCtx;
              if (!reachCtx.inRange) {
                const wName = weapon?.name ? ` (${weapon.name})` : "";
                const d = reachCtx.distance == null ? "?" : Math.round(reachCtx.distance * 10) / 10;
                if (reachCtx.reason === "too-close") {
                  ui.notifications.warn(`Target is too close${wName}. Distance ${d} < Min Reach ${reachCtx.min}.`);
                  return;
                }
                if (reachCtx.reason === "too-far") {
                  ui.notifications.warn(`Target is out of reach${wName}. Distance ${d} > Reach ${reachCtx.max}.`);
                  return;
                }
              }
            }
          }
        }
        if (String(data.context?.attackMode ?? "melee") === "ranged" && defender && isActorSkeletal(defender)) {
          situationalMods.push({ key: "skeletal", label: "Skeletal (ranged)", value: -20 });
        }
        const tn = computeTN({
          actor: attacker,
          role: "attacker",
          styleUuid: data.attacker.itemUuid,
          variant: decl.variant,
          manualMod,
          circumstanceMod,
          situationalMods,
          context: {
            opponentUuid: defender?.uuid ?? null,
            opponentSize: defender?.system?.size ?? null,
            attackMode: data.context?.attackMode ?? "melee",
            itemUuid: data.context?.weaponUuid ?? null,
            selfSize: attacker?.system?.size ?? null,
            movementAction: attackerMovementAction
          }
        });

        const finalTN = tn.finalTN;
        const totalMod = tn.totalMod;
        const vMod = computeVariantMod(decl.variant);

        data.attacker.hasDeclared = true;
        data.attacker.variant = decl.variant;
        data.attacker.variantLabel = _variantLabel(decl.variant);
        data.attacker.variantMod = vMod;
        data.attacker.manualMod = manualMod;
        data.attacker.circumstanceMod = circumstanceMod;
        data.attacker.circumstanceLabel = _circumstanceLabel(circumstanceMod);
        data.attacker.totalMod = totalMod;
        data.attacker.baseTarget = tn.baseTN;
        data.attacker.target = finalTN;
        data.attacker.tn = tn;
        data.attacker.pendingApCost = pendingApCost;
        data.attacker.pendingApVariant = decl.variant;

        _logDebug("attackerDeclare", {
          attackerUuid: data.attacker.actorUuid,
          defenderUuid: data.defender.actorUuid,
          attackVariant: data.attacker.variant,
          tn
        });

        // Banked-choice mode: stop after declaration; do not roll until both sides have committed.
        if (isCommit) {
          data.attacker.banked = data.attacker.banked ?? {};
          data.attacker.banked.committed = true;
          data.attacker.banked.committedAt = Date.now();
          data.attacker.banked.committedBy = game.user.id;

          // Chapter 5 (Hidden): enemies cannot defend against attacks made by hidden characters.
          // To avoid deadlocks in banked mode, force the defender lane to No Defense immediately.
          if (data.context?.attackFromHidden === true) {
            for (const def of defenders) {
              if (!def || def.result || def.noDefense === true) continue;
              def.banked = def.banked ?? {};
              def.banked.committed = true;
              def.banked.committedAt = Date.now();
              def.banked.committedBy = "system";
              def.banked.forced = true;
              def.banked.reason = "hidden";

              def.noDefense = true;
              def.defenseType = "none";
              def.label = "No Defense (Hidden)";
              def.testLabel = "No Defense";
              def.defenseLabel = "No Defense";
              def.target = 0;
              def.tn = {
                finalTN: 0,
                baseTN: 0,
                totalMod: 0,
                breakdown: [{ key: "base", label: "No Defense (Hidden)", value: 0, source: "base" }]
              };
              def.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
            }
          }

          // Auto-request GM roll when ALL participants have committed (banking workflow)
          const b = _getBankCommitState(data, data.defender);
          if (b.bothCommitted && _allDefendersCommitted(data)) {
            data.context = data.context ?? {};
            if (!data.context.autoRollRequested) {
              data.context.autoRollRequested = true;
              data.context.autoRollRequestedAt = Date.now();
              data.context.autoRollRequestedBy = game.user.id;
            }
            // Trigger auto-roll for all committed participants
            if (!data.context.autoRollStarted) {
              await this._autoRollBanked(message.id, { trigger: "all-committed" });
            }
          }

          await _updateCard(message, data);

          return;
        }
      }

      // At this point we are rolling (either standard workflow or banked roll).
      const finalTN = Number(data.attacker.target ?? 0) || 0;

      // Consume ammunition at attack time (per system rules and project direction).
      // Hard requirement: ranged (non-thrown) attacks must have ammo even if no damage card is ever produced.
      const ammoOk = await _preConsumeAttackAmmo(attacker, data);
      if (!ammoOk) return;

      // Mark weapon as needing reload immediately after successful ammunition consumption (ranged attacks only).
      // This ensures reload state is properly tracked before the attack roll executes.
      const attackMode = getContextAttackMode(data?.context);
      if (attackMode === "ranged") {
        try {
          // Weapon UUID priority: preConsumedAmmo (cached) > context (declared) > preferred (equipped)
          const weaponUuid = (data.attacker?.preConsumedAmmo?.weaponUuid 
            ?? String(data?.context?.weaponUuid ?? "")) 
            || _getPreferredWeaponUuid(attacker, { meleeOnly: false }) 
            || "";
          if (weaponUuid) {
            const weapon = await fromUuid(weaponUuid);
            if (weapon && weapon.type === "weapon") {
              await _markWeaponNeedsReload(weapon);
            }
          }
        } catch (err) {
          console.warn("UESRPG | Failed to mark weapon as needing reload after attack", err);
        }
      }

      // Perform a real Foundry roll + message so Dice So Nice triggers.
      const res = await doTestRoll(attacker, { rollFormula: "1d100", target: finalTN, allowLucky: true, allowUnlucky: true });
      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        flavor: `${data.attacker.label} — Attacker Roll`,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "attacker-roll", {
          commit: {
            attacker: {
              hasDeclared: true,
              variant: data.attacker.variant,
              variantLabel: data.attacker.variantLabel,
              variantMod: data.attacker.variantMod,
              manualMod: data.attacker.manualMod,
              circumstanceMod: data.attacker.circumstanceMod,
              circumstanceLabel: data.attacker.circumstanceLabel,
              totalMod: data.attacker.totalMod,
              baseTarget: data.attacker.baseTarget,
              target: data.attacker.target,
              tn: data.attacker.tn,
              itemUuid: data.attacker.itemUuid,
              label: data.attacker.label
            }
          }
        })
      });

      // Consume one-shot Advantage-derived effects after they have been applied to this attack test.
      // RAW: Press Advantage / Overextend apply to the next attack test within 1 round.
      await _consumeOneShotAdvantageEffects(attacker, {
        opponentUuid: defender?.uuid ?? null,
        attackMode: String(data?.context?.attackMode ?? "melee")
      });

      // RAW: Aim bonus applies to the next ranged attack with the aimed weapon/spell.
      // Taking any other action breaks the chain; firing the aimed item consumes it.
      await _consumeOrBreakAimAfterAttack(attacker, {
        attackMode: String(data?.context?.attackMode ?? "melee"),
        itemUuid: data.context?.weaponUuid ?? null
      });

      // Spend AP only after the attack roll has been successfully executed and posted.
      // This avoids losing AP on cancelled/failed workflows.
      // Skip AP deduction if it was already consumed (e.g., Attack of Opportunity).
      const skipAP = Boolean(data.context?.skipAttackerAPDeduction);
      pendingApCost = Number(data.attacker?.pendingApCost ?? pendingApCost) || 0;
      const apVariant = String(data.attacker?.pendingApVariant ?? data.attacker.variant ?? "normal");
      let apOk = true;
      if (pendingApCost > 0 && !skipAP) {
        apOk = await ActionEconomy.spendAP(attacker, pendingApCost, { reason: `attackVariant:${apVariant}`, silent: true });
        if (!apOk) {
          ui.notifications.warn("Insufficient Action Points to perform this attack.");
        }
      }
      
      // Increment attack counter after AP is spent successfully
      // This ensures attacks only count if they were properly resourced
      if (apOk) {
        try {
          await AttackTracker.incrementAttacks(attacker);
        } catch (err) {
          console.error("UESRPG | Failed to increment attack counter", { actor: attacker?.uuid, err });
          // Don't break the workflow if attack tracking fails
        }
      }
      
      if (isRollCommitted) {
        // Banked-choice auto-roll: do not write roll results directly into the parent card.
        // The roll chat message will be banked into the parent card by the createChatMessage hook.
        // Still apply post-attack side-effects that do not depend on the parent card state.
        if (data.context?.attackFromHidden === true) {
          await _consumeHiddenAfterAttack(attacker);
        }
        return;
      }

      data.attacker.result = {
        rollTotal: res.rollTotal,
        target: res.target,
        isSuccess: res.isSuccess,
        degree: res.degree,
        textual: res.textual,
        isCriticalSuccess: res.isCriticalSuccess,
        isCriticalFailure: res.isCriticalFailure
      };

      // Chapter 5 (Hidden): enemies cannot defend against attacks made by hidden characters.
      if (data.context?.attackFromHidden === true) {
        for (const def of defenders) {
          if (!def || def.result || def.noDefense === true) continue;
          def.noDefense = true;
          def.defenseType = "none";
          def.label = "No Defense (Hidden)";
          def.testLabel = "No Defense";
          def.defenseLabel = "No Defense";
          def.target = 0;
          def.tn = {
            finalTN: 0,
            baseTN: 0,
            totalMod: 0,
            breakdown: [{ key: "base", label: "No Defense (Hidden)", value: 0, source: "base" }]
          };
          def.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        }
      }

      // RAW: attacking causes the Hidden condition to be lost immediately after the attack.
      if (data.context?.attackFromHidden === true) {
        await _consumeHiddenAfterAttack(attacker);
      }

      await _updateCard(message, data);
    }



    // --- Defender Actions (banked choices) ---
    if (action === "defender-commit-nodefense") {
      if (!bankMode) {
        ui.notifications.warn("Banked choices are not enabled for this opposed test.");
        return;
      }

      if (data.defender.result || data.defender.noDefense) return;

      if (data.defender?.banked?.committed === true) {
        ui.notifications.warn("Defender has already committed a defense choice.");
        return;
      }

      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to choose defender actions.");
        return;
      }

      data.defender.banked = data.defender.banked ?? {};
      data.defender.banked.committed = true;
      data.defender.banked.committedAt = Date.now();
      data.defender.banked.committedBy = game.user.id;

      data.defender.noDefense = true;
      data.defender.defenseType = "none";
      data.defender.label = "No Defense";
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
      data.defender.target = 0;
      data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

      // If the attacker has already rolled, resolve this defender immediately.
      const currentOutcome = _getDefenderOutcome(data, data.defender);
      if (data.attacker?.result && !currentOutcome) {
        const baseOutcome = _resolveOutcomeRAW(data, data.defender) ?? { winner: "tie", text: "" };
        const outcome = _applyAoEEvadeOutcome(data, baseOutcome);
        _setDefenderOutcome(data, data.defender, outcome);
        _setDefenderAdvantage(data, data.defender, _computeAdvantageRAW(data, outcome, data.defender));

        const allResolved = _getDefenderEntries(data).every(def => Boolean(_getDefenderOutcome(data, def)));
        if (allResolved) {
          data.status = "resolved";
          data.context = data.context ?? {};
          data.context.phase = "resolved";
          if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
          _cleanupAutoRollContext(data.context);
        }
      }

      _logDebug("defenderCommitNoDefense", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid
      });

      // Auto-request GM roll when ALL participants have committed (banking workflow)
      const b = _getBankCommitState(data, data.defender);
      if (b.bothCommitted && _allDefendersCommitted(data)) {
        data.context = data.context ?? {};
        if (!data.context.autoRollRequested) {
          data.context.autoRollRequested = true;
          data.context.autoRollRequestedAt = Date.now();
          data.context.autoRollRequestedBy = game.user.id;
        }
        // Trigger auto-roll for all committed participants
        if (!data.context.autoRollStarted) {
          await this._autoRollBanked(message.id, { trigger: "all-committed" });
        }
      }

      await _updateCard(message, data);

      return;
    }

    if (action === "defender-commit" || action === "defender-roll-committed") {
      const isCommit = action === "defender-commit";
      const isRollCommitted = action === "defender-roll-committed";

      // CORRECTED: Feint gating - force No Defense if Feinted by this specific attacker
      const feintedEffect = defender.effects.find(e => 
        !e.disabled && 
        (e?.flags?.uesrpg?.key === "feinted" || e?.flags?.["uesrpg-3ev4"]?.condition?.key === "feinted")
      );

      if (feintedEffect) {
        const feintedByUuid = feintedEffect?.flags?.uesrpg?.attackerUuid ?? 
                              feintedEffect?.flags?.["uesrpg-3ev4"]?.condition?.attackerUuid;
        
        if (feintedByUuid && feintedByUuid === attacker.uuid) {
          // RAW: treat next melee attack as if attacker were Hidden
          // Implementation: force No Defense
          data.defender.banked = data.defender.banked ?? {};
          data.defender.banked.committed = true;
          data.defender.banked.committedAt = Date.now();
          data.defender.banked.committedBy = "system";
          data.defender.banked.forced = true;
          data.defender.banked.reason = "feinted";

          data.defender.noDefense = true;
          data.defender.defenseType = "none";
          data.defender.label = "No Defense (Feinted)";
          data.defender.testLabel = "No Defense";
          data.defender.defenseLabel = "No Defense";
          data.defender.target = 0;
          data.defender.tn = {
            finalTN: 0,
            baseTN: 0,
            totalMod: 0,
            breakdown: [{ key: "base", label: "No Defense (Feinted)", value: 0, source: "base" }]
          };
          data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

          await _updateCard(message, data);

          // Remove Feinted after it's been used
          const { removeCondition } = await import("../conditions/condition-engine.js");
          await removeCondition(defender, "feinted");

          ui.notifications.info(`${defender.name} is Feinted and cannot defend against ${attacker.name}!`);
          return;
        }
      }

      if (!bankMode) {
        ui.notifications.warn("Banked choices are not enabled for this opposed test.");
        return;
      }

      if (data.defender.result || data.defender.noDefense) return;

      if (isCommit && data.defender?.banked?.committed === true) {
        ui.notifications.warn("Defender has already committed a defense choice.");
        return;
      }

      if (!_canControlActor(defender)) {
        ui.notifications.warn(isCommit ? "You do not have permission to choose defender actions." : "You do not have permission to roll for the defender.");
        return;
      }

      const bank = _getBankCommitState(data);

      if (isRollCommitted) {
        // For multi-defender: require ALL defenders to be committed before rolling
        if (!bank.bothCommitted || !_allDefendersCommitted(data)) {
          ui.notifications.warn(_isMultiDefender(data) 
            ? "All participants must commit their choices before rolling." 
            : "Both sides must commit their choices before rolling.");
          return;
        }

        const t = Number(data.defender?.target ?? data.defender?.tn?.finalTN ?? NaN);
        if (!Number.isFinite(t)) {
          ui.notifications.warn("Defender has not committed a defense declaration yet.");
          return;
        }

        const dt = String(data.defender?.defenseType ?? "");
        if (!dt || dt === "none") {
          ui.notifications.warn("Defender has committed No Defense (or no defense type). No roll is required.");
          return;
        }
      }

      // Chapter 5 (Restrained): cannot defend.
      // Chapter 5 (Hidden): if the attacker struck from Hidden, the defender cannot attempt defense.
      if (hasCondition(defender, "restrained") || data.context?.attackFromHidden === true) {
        const reason = hasCondition(defender, "restrained") ? "Restrained" : "Hidden";

        data.defender.banked = data.defender.banked ?? {};
        data.defender.banked.committed = true;
        data.defender.banked.committedAt = Date.now();
        data.defender.banked.committedBy = "system";
        data.defender.banked.forced = true;
        data.defender.banked.reason = String(reason).toLowerCase();

        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = `No Defense (${reason})`;
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: `No Defense (${reason})`, value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

        // Auto-request GM roll when ALL participants have committed (banking workflow)
        const b = _getBankCommitState(data, data.defender);
        if (b.bothCommitted && _allDefendersCommitted(data)) {
          data.context = data.context ?? {};
          if (!data.context.autoRollRequested) {
            data.context.autoRollRequested = true;
            data.context.autoRollRequestedAt = Date.now();
            data.context.autoRollRequestedBy = game.user.id;
          }
          // Trigger auto-roll for all committed participants
          if (!data.context.autoRollStarted) {
            await this._autoRollBanked(message.id, { trigger: "all-committed" });
          }
        }

        await _updateCard(message, data);

        return;
      }

      const defenderMovementAction = _getTokenMovementAction(dToken);

      if (isCommit) {
        const { attackerWeaponTraits, defenderHasSmallWeapon } = await _getDefenseGatingContext({ attacker, defender, data });

        const choice = await DefenseDialog.show(defender, {
          attackerContext: data.attacker,
          attackerWeaponTraits,
          defenderHasSmallWeapon,
          allowedDefenseTypes: isAoE ? ["block", "evade"] : null,
          context: {
            opponentUuid: attacker?.uuid ?? null,
            attackMode: data.context?.attackMode ?? "melee",
            movementAction: defenderMovementAction
          }
        });
        if (!choice) return;

        // Defense option availability normalization (single canonical rules-layer).
        // This is a defensive server-side validation: UI already prevents illegal selection,
        // but we do not trust client-side input.
        try {
          const availability = computeDefenseAvailability({
            attackMode: data.context?.attackMode ?? "melee",
            attackerWeaponTraits,
            defenderHasSmallWeapon,
            defenderHasShield: hasEquippedShield(defender),
            allowedDefenseTypes: isAoE ? ["block", "evade"] : null
          });
          const requested = String(choice.defenseType ?? "evade");
          const normalized = normalizeDefenseType(requested, availability, "evade");
          if (normalized !== requested) {
            ui.notifications.warn("Selected defense option is not available for this attack. Defaulting to Evade.");
            choice.defenseType = "evade";
            choice.label = "Evade";
            choice.styleUuid = null;
            choice.styleId = null;
          }
        } catch (err) {
          console.warn("UESRPG | opposed-workflow | defense option normalization failed", err);
        }

        // RAW: Defensive reactions cost Action Points unless an explicit feature states otherwise.

        // Default: any defense choice other than No Defense costs 1 AP.

        // Spend immediately upon selecting the defense choice to prevent later desync.

        if (choice.defenseType && choice.defenseType !== "none") {

          const ok = await ActionEconomy.spendAP(defender, 1, { reason: `reaction:${choice.defenseType}`, silent: true });

          if (!ok) {

            ui.notifications.warn(`${defender.name} does not have enough Action Points to perform a defensive reaction. Choose No Defense instead.`);

            return;

          }

        }


        if (choice.defenseType && choice.defenseType !== "none") {

          // RAW: Any reaction other than continuing to Aim or firing breaks the Aim chain.

          await _breakAimChainIfPresent(defender);

        }
        data.defender.defenseType = choice.defenseType;
        data.defender.label = choice.label;
        data.defender.defenseLabel = choice.label;

        if (choice.defenseType === "evade") {
          data.defender.testLabel = "Evade";
        } else if (choice.styleUuid || choice.styleId) {
          const styleUuid = choice.styleUuid ?? choice.styleId;
          const styles = listCombatStyles(defender);
          const style = styles.find(s => s.uuid === styleUuid) ?? null;
          data.defender.testLabel = style?.name ?? "(Combat Style)";
        } else {
          data.defender.testLabel = "(Combat Style)";
        }

        const manualMod = _asNumber(choice.manualMod ?? 0);
        const circumstanceMod = _asNumber(choice.circumstanceMod ?? 0);
        const situationalMods = _collectDefenseSensorySituationalMods(choice);
        const tn = computeTN({
          actor: defender,
          role: "defender",
          defenseType: choice.defenseType,
          styleUuid: choice.styleUuid ?? choice.styleId ?? null,
          manualMod,
          circumstanceMod,
          situationalMods,
          context: {
            opponentUuid: attacker?.uuid ?? null,
            attackMode: data.context?.attackMode ?? "melee",
            movementAction: defenderMovementAction
          }
        });

        data.defender.target = tn.finalTN;
        const declaredMod = (Number(manualMod) || 0) + (Number(circumstanceMod) || 0);
        data.defender.targetLabel = declaredMod
          ? `${tn.finalTN} (${declaredMod >= 0 ? "+" : ""}${declaredMod})`
          : `${tn.finalTN}`;
        data.defender.tn = tn;

        _logDebug("defenderCommit", {
          defenderUuid: data.defender.actorUuid,
          attackerUuid: data.attacker.actorUuid,
          defenseType: data.defender.defenseType,
          tn
        });

        // Defender "none" is not expected via the dialog, but keep deterministic.
        if (choice.defenseType === "none") {
          data.defender.noDefense = true;
          data.defender.defenseType = "none";
          data.defender.label = "No Defense";
          data.defender.testLabel = "No Defense";
          data.defender.defenseLabel = "No Defense";
          data.defender.target = 0;
          data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
          data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        }

        data.defender.banked = data.defender.banked ?? {};
        data.defender.banked.committed = true;
        data.defender.banked.committedAt = Date.now();
        data.defender.banked.committedBy = game.user.id;

        // Auto-request GM roll when ALL participants have committed (banking workflow)
        const b = _getBankCommitState(data, data.defender);
        if (b.bothCommitted && _allDefendersCommitted(data)) {
          data.context = data.context ?? {};
          if (!data.context.autoRollRequested) {
            data.context.autoRollRequested = true;
            data.context.autoRollRequestedAt = Date.now();
            data.context.autoRollRequestedBy = game.user.id;
          }
          // Trigger auto-roll for all committed participants
          if (!data.context.autoRollStarted) {
            await this._autoRollBanked(message.id, { trigger: "all-committed" });
          }
        }

        await _updateCard(message, data);

        return;
      }

      // Roll committed defense lane.
      const res = await doTestRoll(defender, { rollFormula: "1d100", target: Number(data.defender.target), allowLucky: true, allowUnlucky: true });

      await res.roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        flavor: `${data.defender.label} — Defender Roll`,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "defender-roll", {
          defenderIndex,
          commit: {
            defender: {
              defenseType: data.defender.defenseType,
              label: data.defender.label,
              defenseLabel: data.defender.defenseLabel,
              testLabel: data.defender.testLabel,
              target: data.defender.target,
              targetLabel: data.defender.targetLabel,
              tn: data.defender.tn
            }
          }
        })
      });

      // Banked-choice auto-roll: do not write roll results directly into the parent card.
      // The roll chat message will be banked into the parent card by the createChatMessage hook.
      return;
    }
    // --- Defender: No Defense ---
    if (action === "defender-nodefense") {
      if (data.defender.result || data.defender.noDefense) return;
      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to choose defender actions.");
        return;
      }

      data.defender.noDefense = true;
      data.defender.defenseType = "none";
      data.defender.label = "No Defense";
      data.defender.testLabel = "No Defense";
      data.defender.defenseLabel = "No Defense";
      data.defender.target = 0;
      data.defender.tn = { finalTN: 0, baseTN: 0, totalMod: 0, breakdown: [{ key: "base", label: "No Defense", value: 0, source: "base" }] };
      data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

      // Resolve immediately if the attacker already rolled.
      const currentOutcome = _getDefenderOutcome(data, data.defender);
      if (data.attacker?.result && !currentOutcome) {
        const baseOutcome = _resolveOutcomeRAW(data, data.defender) ?? { winner: "tie", text: "" };
        const outcome = _applyAoEEvadeOutcome(data, baseOutcome);
        _setDefenderOutcome(data, data.defender, outcome);
        _setDefenderAdvantage(data, data.defender, _computeAdvantageRAW(data, outcome, data.defender));

        const allResolved = _getDefenderEntries(data).every(def => Boolean(_getDefenderOutcome(data, def)));
        if (allResolved) {
          data.status = "resolved";
          data.context = data.context ?? {};
          data.context.phase = "resolved";
          if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
          _cleanupAutoRollContext(data.context);
        }
      }

      _logDebug("defenderNoDefense", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid
      });

      // Create a lightweight workflow marker message so an active GM (or the card author
      // if no GM is present) can reliably bank the defender choice into the parent card.
      // This is required because ChatMessage update permissions are restrictive for
      // non-GM users editing another user's message.
      try {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          content: `<div class="ues-opposed-card" style="padding:6px;"><b>No Defense</b> declared.</div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "defender-nodefense", { defenderIndex })
        });
      } catch (err) {
        console.warn("UESRPG | opposed-workflow | failed to create defender-nodefense marker", err);
      }

      await _updateCard(message, data);
    }

    // --- Defender Roll ---
    if (action === "defender-roll") {
      if (data.defender.result || data.defender.noDefense) return;

      // CORRECTED: Feint gating - force No Defense if Feinted by this specific attacker
      const feintedEffect = defender.effects.find(e => 
        !e.disabled && 
        (e?.flags?.uesrpg?.key === "feinted" || e?.flags?.["uesrpg-3ev4"]?.condition?.key === "feinted")
      );

      if (feintedEffect) {
        const feintedByUuid = feintedEffect?.flags?.uesrpg?.attackerUuid ?? 
                              feintedEffect?.flags?.["uesrpg-3ev4"]?.condition?.attackerUuid;
        
        if (feintedByUuid && feintedByUuid === attacker.uuid) {
          // RAW: treat next melee attack as if attacker were Hidden
          // Implementation: force No Defense
          data.defender.noDefense = true;
          data.defender.defenseType = "none";
          data.defender.label = "No Defense (Feinted)";
          data.defender.testLabel = "No Defense";
          data.defender.defenseLabel = "No Defense";
          data.defender.target = 0;
          data.defender.tn = {
            finalTN: 0,
            baseTN: 0,
            totalMod: 0,
            breakdown: [{ key: "base", label: "No Defense (Feinted)", value: 0, source: "base" }]
          };
          data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };

          await _updateCard(message, data);

          // Remove Feinted after it's been used
          const { removeCondition } = await import("../conditions/condition-engine.js");
          await removeCondition(defender, "feinted");

          ui.notifications.info(`${defender.name} is Feinted and cannot defend against ${attacker.name}!`);
          return;
        }
      }

      if (!_canControlActor(defender)) {
        ui.notifications.warn("You do not have permission to roll for the defender.");
        return;
      }

      // Chapter 5 (Restrained): cannot defend.
      if (hasCondition(defender, "restrained")) {
        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = "No Defense (Restrained)";
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: "No Defense (Restrained)", value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        await _updateCard(message, data);
        return;
      }

      // Chapter 5 (Hidden): if the attacker struck from Hidden, the defender cannot attempt defense.
      if (data.context?.attackFromHidden === true) {
        data.defender.noDefense = true;
        data.defender.defenseType = "none";
        data.defender.label = "No Defense (Hidden)";
        data.defender.testLabel = "No Defense";
        data.defender.defenseLabel = "No Defense";
        data.defender.target = 0;
        data.defender.tn = {
          finalTN: 0,
          baseTN: 0,
          totalMod: 0,
          breakdown: [{ key: "base", label: "No Defense (Hidden)", value: 0, source: "base" }]
        };
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        await _updateCard(message, data);
        return;
      }



      const defenderMovementAction = _getTokenMovementAction(dToken);


      // Attacker weapon traits can restrict eligible defense options (e.g., Flail cannot be parried/countered).
      // Keep this deterministic and schema-safe.
      const { attackerWeaponTraits, defenderHasSmallWeapon } = await _getDefenseGatingContext({ attacker, defender, data });

      const choice = await DefenseDialog.show(defender, {
        attackerContext: data.attacker,
        attackerWeaponTraits,
        defenderHasSmallWeapon,
        allowedDefenseTypes: isAoE ? ["block", "evade"] : null,
        context: {
          opponentUuid: attacker?.uuid ?? null,
          attackMode: data.context?.attackMode ?? "melee",
          movementAction: defenderMovementAction
        }
      });
      if (!choice) return;

      // Defense option availability normalization (single canonical rules-layer).
      // This is a defensive server-side validation: UI already prevents illegal selection,
      // but we do not trust client-side input.
      try {
        const availability = computeDefenseAvailability({
          attackMode: data.context?.attackMode ?? "melee",
          attackerWeaponTraits,
          defenderHasSmallWeapon,
          defenderHasShield: hasEquippedShield(defender),
          allowedDefenseTypes: isAoE ? ["block", "evade"] : null
        });
        const requested = String(choice.defenseType ?? "evade");
        const normalized = normalizeDefenseType(requested, availability, "evade");
        if (normalized !== requested) {
          ui.notifications.warn("Selected defense option is not available for this attack. Defaulting to Evade.");
          choice.defenseType = "evade";
          choice.label = "Evade";
          choice.styleUuid = null;
          choice.styleId = null;
        }
      } catch (err) {
        console.warn("UESRPG | opposed-workflow | defense option normalization failed", err);
      }

      // RAW: Defensive reactions cost Action Points unless an explicit feature states otherwise.

      // Default: any defense choice other than No Defense costs 1 AP.

      // Spend immediately upon selecting the defense choice to prevent later desync.

      if (choice.defenseType && choice.defenseType !== "none") {

        const ok = await ActionEconomy.spendAP(defender, 1, { reason: `reaction:${choice.defenseType}`, silent: true });

        if (!ok) {

          ui.notifications.warn(`${defender.name} does not have enough Action Points to perform a defensive reaction. Choose No Defense instead.`);

          return;

        }

      }


      if (choice.defenseType && choice.defenseType !== "none") {

        // RAW: Any reaction other than continuing to Aim or firing breaks the Aim chain.

        await _breakAimChainIfPresent(defender);

      }
      data.defender.defenseType = choice.defenseType;
      // label is used for roll flavor (e.g. "Parry — Defender Roll")
      data.defender.label = choice.label;
      data.defender.defenseLabel = choice.label;

      // For the chat card, "Test" must reflect the *actual test rolled*:
      //  - Evade: Evade
      //  - Parry/Block/Counter: the chosen Combat Style/Profession item name
      if (choice.defenseType === "evade") {
        data.defender.testLabel = "Evade";
      } else if (choice.styleUuid || choice.styleId) {
        const styleUuid = choice.styleUuid ?? choice.styleId;
        const styles = listCombatStyles(defender);
        const style = styles.find(s => s.uuid === styleUuid) ?? null;
        data.defender.testLabel = style?.name ?? "(Combat Style)";
      } else {
        // Fallback: keep something readable rather than repeating the defense label.
        data.defender.testLabel = "(Combat Style)";
      }

      const manualMod = _asNumber(choice.manualMod ?? 0);
      const circumstanceMod = _asNumber(choice.circumstanceMod ?? 0);
      const situationalMods = _collectDefenseSensorySituationalMods(choice);
      const tn = computeTN({
        actor: defender,
        role: "defender",
        defenseType: choice.defenseType,
        styleUuid: choice.styleUuid ?? choice.styleId ?? null,
        manualMod,
        circumstanceMod,
	        situationalMods,
        context: {
          opponentUuid: attacker?.uuid ?? null,
          attackMode: data.context?.attackMode ?? "melee",
          movementAction: defenderMovementAction
        }
      });

      data.defender.target = tn.finalTN;
      const declaredMod = (Number(manualMod) || 0) + (Number(circumstanceMod) || 0);
      data.defender.targetLabel = declaredMod
        ? `${tn.finalTN} (${declaredMod >= 0 ? "+" : ""}${declaredMod})`
        : `${tn.finalTN}`;
      data.defender.tn = tn;

      _logDebug("defenderDeclare", {
        defenderUuid: data.defender.actorUuid,
        attackerUuid: data.attacker.actorUuid,
        defenseType: data.defender.defenseType,
        tn
      });

      // Defender "none" is handled by the separate button, but keep safe.
      if (choice.defenseType === "none") {
        data.defender.noDefense = true;
        data.defender.result = { rollTotal: 100, target: 0, isSuccess: false, degree: 1 };
        await _updateCard(message, data);
      } else {
        const res = await doTestRoll(defender, { rollFormula: "1d100", target: data.defender.target, allowLucky: true, allowUnlucky: true });
        // IMPORTANT: The defender may not have permission to update the parent opposed card
        // (ChatMessage authored by the attacker). We therefore include the computed TN and
        // defense choice metadata in the roll message flags so the GM/author banking hook can
        // accurately commit the defender lane into the parent card.
        await res.roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          flavor: `${data.defender.label} — Defender Roll`,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "defender-roll", {
            defenderIndex,
            commit: {
              defender: {
                defenseType: data.defender.defenseType,
                label: data.defender.label,
                defenseLabel: data.defender.defenseLabel,
                testLabel: data.defender.testLabel,
                target: data.defender.target,
                targetLabel: data.defender.targetLabel,
                tn: data.defender.tn
              }
            }
          })
        });

        data.defender.result = {
          rollTotal: res.rollTotal,
          target: res.target,
          isSuccess: res.isSuccess,
          degree: res.degree,
          textual: res.textual,
          isCriticalSuccess: res.isCriticalSuccess,
          isCriticalFailure: res.isCriticalFailure
        };

        // Dueling Weapon: grants +1 Degree of Success on successful Parry or Counter-Attack.
        if (res.isSuccess && (choice.defenseType === "parry" || choice.defenseType === "counter")) {
          try {
            const defWUuid = _getPreferredWeaponUuid(defender, { meleeOnly: true }) || "";
            if (defWUuid) {
              const defW = await fromUuid(defWUuid);
              if (defW?.type === "weapon" && _weaponHasQuality(defW, "dueling")) {
                data.defender.result.degree = Math.max(1, (Number(data.defender.result.degree) || 1) + 1);
                data.defender.result.duelingBonus = 1;
                // Keep the displayed DoS/DoF string consistent with the modified degree.
                data.defender.result.textual = data.defender.result.isSuccess
                  ? `${data.defender.result.degree} DoS`
                  : `${data.defender.result.degree} DoF`;
              }
            }
          } catch (err) {
            console.warn("UESRPG | opposed-workflow | dueling weapon bonus lookup failed", err);
          }
        }
        await _maybeSetAoEEvadeEscape(data, data.defender, defender);
        
        // Resolve immediately if the attacker has already rolled.
        // For multi-defender scenarios, resolve all defenders who have rolled.
        if (data.attacker?.result) {
          const originalDefender = data.defender;
          const defenders = _getDefenderEntries(data);
          let resolvedAny = false;

          for (const def of defenders) {
            if (!def) continue;
            if (!(def.result || def.noDefense)) continue;
            if (_getDefenderOutcome(data, def)) continue;

            data.defender = def;
            const baseOutcome = _resolveOutcomeRAW(data, def) ?? { winner: "tie", text: "" };
            const outcome = _applyAoEEvadeOutcome(data, baseOutcome, def);
            _setDefenderOutcome(data, def, outcome);
            _setDefenderAdvantage(data, def, _computeAdvantageRAW(data, outcome, def));
            resolvedAny = true;
          }

          if (resolvedAny) {
            const allResolved = defenders.every(def => Boolean(_getDefenderOutcome(data, def)));
            if (allResolved) {
              data.status = "resolved";
              data.context = data.context ?? {};
              data.context.phase = "resolved";
              if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
              _cleanupAutoRollContext(data.context);
            }
          }

          data.defender = originalDefender;
        }
        
        await _updateCard(message, data);
      }
    }

    // --- Damage Roll (attacker won) ---
    if (action === "damage-roll") {
      const ok = await _ensureResolvedForPostActions(message, data, { defenderIndex });
      if (!ok) {
        ui.notifications.warn("Damage cannot be rolled until the opposed test is resolved.");
        return;
      }
      const outcome = _getDefenderOutcome(data, data.defender);
      if (!outcome || outcome.winner !== "attacker") {
        ui.notifications.warn("Damage can only be rolled when the attacker wins the opposed test.");
        return;
      }
      if (!_canControlActor(attacker) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to roll damage for this attacker.");
        return;
      }

      const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
      const shareDamage = isAoE || _isMultiDefender(data);
      let sharedDamage = shareDamage ? (data.context?.sharedDamage ?? null) : null;
      const sharedSelection = shareDamage ? (data.context?.sharedDamageSelection ?? null) : null;

      const advantage = _getDefenderAdvantage(data, data.defender) ?? { attacker: 0, defender: 0 };
      const attackMode = getContextAttackMode(data.context);
      const advCount = (attackMode === "melee") ? Number(advantage.attacker ?? 0) : 0;
      const defenderActor = _resolveDoc(data?.defender?.actorUuid);
      const forcedHitLocationRaw = data?.context?.forcedHitLocation ?? null;
      const forcedHitLocation = forcedHitLocationRaw
        ? resolveHitLocationForTarget(defenderActor, forcedHitLocationRaw)
        : null;
      const baseHitLocation = forcedHitLocation
        ?? resolveHitLocationForTarget(defenderActor, getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 0));
      const activationCtx = data.context?.activation ?? null;
      const activationDamage = activationCtx?.damage ?? null;
      const activationMode = String(activationDamage?.mode ?? "weapon").toLowerCase().trim();
      const allowNoWeapon = Boolean(activationDamage && activationMode !== "weapon");

      const selection = sharedSelection ?? await _promptWeaponAndAdvantages({
        attackerActor: attacker,
        attackMode,
        advantageCount: advCount,
        defaultWeaponUuid: data.context?.lastWeaponUuid ?? _getPreferredWeaponUuid(attacker, { meleeOnly: false }) ?? null,
        defaultHitLocation: baseHitLocation,
        allowNoWeapon,
      });
      if (!selection) return;

      // Do not persist selection here; block resolution does not spend Advantage.

      // Record Advantage spend selections (including Special Actions) for downstream automation/rendering.
      const resolutionState = _getDefenderResolutionState(data, data.defender);
      resolutionState.advantageResolution.attacker = {
        precisionStrike: Boolean(selection.precisionStrike),
        precisionLocation: String(selection.precisionLocation ?? ""),
        penetrateArmor: Boolean(selection.penetrateArmor),
        forcefulImpact: Boolean(selection.forcefulImpact),
        pressAdvantage: Boolean(selection.pressAdvantage),
        specialActionsSelected: Array.isArray(selection.specialActionsSelected) ? selection.specialActionsSelected.slice() : []
      };
      await _updateCard(message, data);

        const weapon = selection.weaponUuid ? await fromUuid(selection.weaponUuid) : null;
        if (!weapon && !allowNoWeapon) {
          ui.notifications.warn("Selected weapon could not be resolved.");
          return;
        }

        // Persist last weapon for convenience within this single opposed workflow.
        if (weapon) {
          data.context = data.context ?? {};
          data.context.lastWeaponUuid = weapon.uuid;
          await _updateCard(message, data);
        }

      if (selection.pressAdvantage && attackMode === "melee") {
        const defenderActor = _resolveDoc(data?.defender?.actorUuid);
        await _applyPressAdvantageEffect(attacker, defenderActor, { attackerTokenUuid: data.attacker?.tokenUuid ?? null, defenderTokenUuid: data.defender?.tokenUuid ?? null });
      }

      // Execute Special Advantage automation (free + auto-win)
      if (Array.isArray(selection.specialActionsSelected) && selection.specialActionsSelected.length > 0) {
        try {
          const { showSpecialAdvantageDialog, executeSpecialAction } = await import("./special-actions-helper.js");
          const defenderActor = _resolveDoc(data?.defender?.actorUuid);
          
          for (const saId of selection.specialActionsSelected) {
            const choice = await showSpecialAdvantageDialog(saId);
            if (!choice) continue;

            if (choice.mode === "autowin") {
              // Auto-Win: consume 1 AP, skip test, auto-succeed
              const { ActionEconomy } = await import("./action-economy.js");
              const def = getSpecialActionById(saId);
              await ActionEconomy.spendAP(attacker, 1, { 
                reason: `Special Advantage: ${def?.name} (Auto-Win)`, 
                silent: false 
              });

              const result = await executeSpecialAction({
                specialActionId: saId,
                actor: attacker,
                target: defenderActor ?? null,
                isAutoWin: true,
                opposedResult: { winner: "attacker" }
              });

              if (result.success) {
                await ChatMessage.create({
                  user: game.user.id,
                  speaker: ChatMessage.getSpeaker({ actor: attacker }),
                  content: `<div class="uesrpg-special-action-advantage"><b>Special Advantage (Auto-Win):</b><p>${result.message}</p></div>`,
                  style: CONST.CHAT_MESSAGE_STYLES.OTHER
                });
              }
            } else if (choice.mode === "free") {
              // Free Action: 0 AP, initiate test with dropdown selection
              const attackerTokenUuid = data.attacker?.tokenUuid ?? null;
              const defenderTokenUuid = data.defender?.tokenUuid ?? null;
              const attackerToken = attackerTokenUuid ? fromUuidSync(attackerTokenUuid)?.object : null;
              const defenderToken = defenderTokenUuid ? fromUuidSync(defenderTokenUuid)?.object : null;

              if (attackerToken && defenderToken) {
                const { SkillOpposedWorkflow } = await import("../skills/opposed-workflow.js");
                const def = getSpecialActionById(saId);
                
                const message = await SkillOpposedWorkflow.createPending({
                  attackerTokenUuid: attackerToken?.document?.uuid ?? attackerToken?.uuid,
                  defenderTokenUuid: defenderToken?.document?.uuid ?? defenderToken?.uuid,
                  attackerSkillUuid: null,  // Let user choose from dropdown in card
                  attackerSkillLabel: `${def?.name} (Special Action)`
                });

                const state = message?.flags?.["uesrpg-3ev4"]?.skillOpposed?.state;
                if (state) {
                  state.specialActionId = saId;
                  state.allowCombatStyle = true;
                  state.isFreeAction = true;

                  await message.update({
                    flags: {
                      "uesrpg-3ev4": {
                        skillOpposed: {
                          version: state.version ?? 1,
                          state
                        }
                      }
                    }
                  });
                }

                ui.notifications.info(`Special Advantage: ${def?.name} used as free action.`);
              }
            }
          }
        } catch (err) {
          console.error("UESRPG | Failed to execute Special Advantage automation", err);
        }
      }

      // Hit location RAW: ones digit of attack roll, unless Precision Strike is used.
      const hitLocationRaw = forcedHitLocation
        ?? ((advCount > 0 && selection.precisionStrike)
          ? selection.precisionLocation
          : getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 0));
      const hitLocation = resolveHitLocationForTarget(defenderActor, hitLocationRaw);

      const activationFormula = String(activationDamage?.formula ?? "").trim();
      const activationType = String(activationDamage?.type ?? "").trim().toLowerCase();
      const activationTags = Array.isArray(activationCtx?.tags) ? activationCtx.tags : [];
      const activationQualities = _collectActivationDamageQualities(activationDamage);
      const hasActivationQualities = activationQualities.structured.length > 0 || activationQualities.traits.length > 0;

      const useManual = activationDamage && activationMode !== "weapon";
      const isHealingMode = activationMode === "healing" || activationMode === "temporary";
      const isManualMode = activationMode === "manual";
      if (useManual && !isHealingMode && !isManualMode) {
        ui.notifications.warn("Unsupported activation damage mode.");
        return;
      }
      if (useManual && !activationFormula) {
        ui.notifications.warn("Manual damage/healing requires a formula.");
        return;
      }

      // Render a weapon damage chat card, gated by the opposed result.
        let pillsInline = (() => {
          if (!weapon) return '<span style="opacity:0.75;">—</span>';
          const injected = Array.isArray(weapon.system?.qualitiesStructuredInjected)
            ? weapon.system.qualitiesStructuredInjected
            : Array.isArray(weapon.system?.qualitiesStructured)
              ? weapon.system.qualitiesStructured
              : [];

        const labelIndex = (() => {
          const core = UESRPG?.QUALITIES_CORE_BY_TYPE?.weapon ?? UESRPG?.QUALITIES_CATALOG ?? [];
          const traits = UESRPG?.TRAITS_BY_TYPE?.weapon ?? [];
          const idx = new Map();
          for (const q of [...core, ...traits, ...(UESRPG?.QUALITIES_CATALOG ?? [])]) {
            if (!q?.key) continue;
            idx.set(String(q.key).toLowerCase(), String(q.label ?? q.key));
          }
          return idx;
        })();

        const out = [];
        for (const q of injected) {
          const key = String(q?.key ?? q ?? "").toLowerCase().trim();
          if (!key) continue;
          const label = labelIndex.get(key) ?? key;
          const v = (q?.value !== undefined && q?.value !== null && q?.value !== "") ? Number(q.value) : null;
          out.push(`<span class="tag">${v != null && !Number.isNaN(v) ? `${label} (${v})` : label}</span>`);
        }
        const traits = Array.isArray(weapon.system?.qualitiesTraits) ? weapon.system.qualitiesTraits : [];
        for (const t of traits) {
          const key = String(t ?? "").toLowerCase().trim();
          if (!key) continue;
          const label = labelIndex.get(key) ?? key;
          out.push(`<span class="tag">${label}</span>`);
        }
        if (!out.length) return '<span style="opacity:0.75;">—</span>';
        return `<span class="uesrpg-inline-tags">${out.join("")}</span>`;
      })();

        const sourceLabel = activationCtx?.itemName ?? weapon?.name ?? "Attack";
        const sourceImg = activationCtx?.itemImg ?? weapon?.img ?? null;
      let magicSource = (() => {
        const tags = activationTags.map(t => String(t ?? "").toLowerCase());
        if (tags.includes("magic") || tags.includes("silver") || tags.includes("silvered")) return true;
        if (activationMode === "manual") {
          return activationType === "magic" || activationType === "silver" || activationType === "sunlight";
        }
        return false;
      })();

      pillsInline = hasActivationQualities
        ? _buildInlineQualityTags(activationQualities)
        : _buildInlineQualityTags(_collectWeaponInlineQualities(weapon));

      magicSource = (() => {
        const tags = activationTags.map(t => String(t ?? "").toLowerCase());
        if (tags.includes("magic") || tags.includes("silver") || tags.includes("silvered")) return true;
        const qualTokens = [
          ...activationQualities.structured.map(q => String(q?.key ?? q ?? "").toLowerCase().trim()),
          ...activationQualities.traits.map(t => String(t ?? "").toLowerCase().trim())
        ].filter(Boolean);
        if (qualTokens.includes("magic") || qualTokens.includes("silver") || qualTokens.includes("silvered")) return true;
        if (activationMode === "manual") {
          return activationType === "magic" || activationType === "silver" || activationType === "sunlight";
        }
        return false;
      })();

      if (useManual && isHealingMode) {
        const reuseShared = Boolean(sharedDamage && sharedDamage.mode === "manual-healing");
        const dmg = reuseShared ? _inflateSharedDamage(sharedDamage) : await _rollManualDamage({ formula: activationFormula });
        if (!dmg) return;
        if (shareDamage && (!sharedDamage || sharedDamage.mode !== "manual-healing")) {
          sharedDamage = _buildSharedDamagePayload({ mode: "manual-healing", dmg, damageType: activationType || "healing" });
          data.context = data.context ?? {};
          data.context.sharedDamage = sharedDamage;
          await _updateCard(message, data);
        }
        const isTemporary = activationMode === "temporary";
        const effectLabel = isTemporary ? "Temp HP" : "Healing";

        const applyBtn = `<button type="button" class="apply-healing-btn"
          data-target-uuid="${defender.uuid}"
          data-healing="${dmg.finalDamage}"
          data-temp-hp="${isTemporary ? "1" : "0"}"
          data-source="${sourceLabel}">
          Apply ${effectLabel} → ${dToken?.name ?? defender.name}
        </button>`;

        await _postManualEffectChatCard({
          attacker,
          aToken,
          itemLabel: sourceLabel,
          itemImg: sourceImg,
          dmg,
          hitLocation,
          effectLabel,
          pillsInline,
          applyButtonHtml: applyBtn,
          extraNoteHtml: `<b>Activation:</b> ${sourceLabel}`,
          parentMessageId: message.id,
          stage: "damage-card",
        });
        return;
      }

      if (useManual && isManualMode) {
        const reuseShared = Boolean(sharedDamage && sharedDamage.mode === "manual-damage");
        const dmg = reuseShared ? _inflateSharedDamage(sharedDamage) : await _rollManualDamage({ formula: activationFormula });
        if (!dmg) return;
        if (shareDamage && (!sharedDamage || sharedDamage.mode !== "manual-damage")) {
          sharedDamage = _buildSharedDamagePayload({ mode: "manual-damage", dmg, damageType: activationType || DAMAGE_TYPES.PHYSICAL });
          data.context = data.context ?? {};
          data.context.sharedDamage = sharedDamage;
          await _updateCard(message, data);
        }
        const damageType = activationType || DAMAGE_TYPES.PHYSICAL;
        const sourceItemUuid = activationCtx?.itemUuid ?? "";
        const weaponUuidForDamage = sourceItemUuid ? "" : (weapon?.uuid ?? "");

        const applyBtn = `<button type="button" class="apply-damage-btn"
          data-target-uuid="${defender.uuid}"
          data-attacker-actor-uuid="${attacker.uuid}"
          data-weapon-uuid="${weaponUuidForDamage}"
          data-source-item-uuid="${sourceItemUuid}"
          data-damage="${dmg.finalDamage}"
          data-damage-type="${damageType}"
          data-hit-location="${hitLocation}"
          data-dos-bonus="0"
          data-penetration="0"
          data-penetrate-armor="${selection.penetrateArmor ? "1" : "0"}"
	      data-forceful-impact="${selection.forcefulImpact ? "1" : "0"}"
	      data-press-advantage="${selection.pressAdvantage ? "1" : "0"}"
          data-magic-source="${magicSource ? "1" : "0"}"
          data-source="${sourceLabel}">
          Apply Damage → ${dToken?.name ?? defender.name}
        </button>`;

        await _postManualEffectChatCard({
          attacker,
          aToken,
          itemLabel: sourceLabel,
          itemImg: sourceImg,
          dmg,
          hitLocation,
          effectLabel: "Damage",
          pillsInline,
          applyButtonHtml: applyBtn,
          extraNoteHtml: `<b>Activation:</b> ${sourceLabel}`,
          parentMessageId: message.id,
          stage: "damage-card",
        });
        return;
      }

      const reuseShared = Boolean(sharedDamage && sharedDamage.mode === "weapon" && (!sharedDamage.weaponUuid || sharedDamage.weaponUuid === weapon?.uuid));
      const dmg = reuseShared
        ? _inflateSharedDamage(sharedDamage)
        : await _rollWeaponDamage({ weapon, preConsumedAmmo: data.attacker?.preConsumedAmmo ?? null });
      if (!dmg) return;
      if (shareDamage && (!sharedDamage || sharedDamage.mode !== "weapon")) {
        sharedDamage = _buildSharedDamagePayload({ mode: "weapon", dmg, weaponUuid: weapon?.uuid ?? null, damageType: getDamageTypeFromWeapon(weapon) });
        data.context = data.context ?? {};
        data.context.sharedDamage = sharedDamage;
        await _updateCard(message, data);
      }
      const damageType = getDamageTypeFromWeapon(weapon);

      const extraNotes = (() => {
        const notes = [];
        if (dmg?.damagedValue && Number(dmg.damagedValue) > 0) notes.push(`Damaged: -${Number(dmg.damagedValue)}`);
        if (dmg?.rerollMode === "primitive") notes.push("Primitive: take lower");
        else if (dmg?.rerollMode === "proven") notes.push("Proven: take higher");
        return notes.length ? `<div style="margin-top:0.15rem;">${notes.join('<br>')}</div>` : "";
      })();

      const rollATotal = Number.isFinite(Number(dmg.rollA?.total)) ? dmg.rollA.total : (Number.isFinite(Number(sharedDamage?.rollATotal)) ? sharedDamage.rollATotal : null);
      const rollBTotal = Number.isFinite(Number(dmg.rollB?.total)) ? dmg.rollB.total : (Number.isFinite(Number(sharedDamage?.rollBTotal)) ? sharedDamage.rollBTotal : null);
      const altTag = (rollBTotal != null)
        ? `<div style="margin-top:0.25rem;font-size:x-small;line-height:1.2;">Roll A: ${rollATotal ?? "?"}<br>Roll B: ${rollBTotal}${extraNotes}</div>`
        : (extraNotes ? `<div style="margin-top:0.25rem;font-size:x-small;line-height:1.2;">${extraNotes}</div>` : "");

      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${defender.uuid}"
        data-attacker-actor-uuid="${attacker.uuid}"
          data-weapon-uuid="${weapon?.uuid ?? ""}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${hitLocation}"
        data-dos-bonus="0"
        data-penetration="0"
        data-penetrate-armor="${selection.penetrateArmor ? "1" : "0"}"
	      data-forceful-impact="${selection.forcefulImpact ? "1" : "0"}"
	      data-press-advantage="${selection.pressAdvantage ? "1" : "0"}"
        data-source="${weapon.name}">
        Apply Damage → ${dToken?.name ?? defender.name}
      </button>`;

      const cardHtml = `
        <div class="uesrpg-weapon-damage-card">
          <h2 style="display:flex;gap:0.5rem;align-items:center;">
            <img src="${weapon.img}" style="height:32px;width:32px;">
            <div>${weapon.name}</div>
          </h2>

          <table class="uesrpg-weapon-damage-table">
            <thead>
              <tr>
                <th>Damage</th>
                <th class="tableCenterText">Result</th>
                <th class="tableCenterText">Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="tableAttribute">Damage</td>
                <td class="tableCenterText">${dmg.finalDamage}${altTag}</td>
                <td class="tableCenterText">
                  <div>${dmg.damageString}</div>
                  <div style="margin-top:0.35rem;">${pillsInline}</div>
                </td>
              </tr>
              <tr>
                <td class="tableAttribute">Hit Location</td>
                <td class="tableCenterText">${hitLocation}</td>
                <td class="tableCenterText">from attack roll</td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
            ${applyBtn}
          </div>
        </div>
      `;

      const damageFlags = _opposedFlags(message.id, "damage-card");
      const dmgMsg = await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: attacker, token: aToken?.document ?? null }),
        content: cardHtml,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rolls: [dmg.rollA, dmg.rollB].filter(Boolean),
        rollMode: game.settings.get("core", "rollMode"),
        flags: damageFlags,
      });
      return;
    }

    // --- Damage Roll (defender won via counter-attack) ---
    if (action === "counter-damage-roll") {
      const ok = await _ensureResolvedForPostActions(message, data, { defenderIndex });
      if (!ok) {
        ui.notifications.warn("Counter-attack damage cannot be rolled until the opposed test is resolved.");
        return;
      }

      let defenseType = String(data.defender?.defenseType ?? "").toLowerCase();
      if (defenseType !== "counter") {
        const lbl = String(data.defender?.defenseLabel ?? data.defender?.label ?? "").toLowerCase();
        if (lbl.includes("counter")) {
          data.defender = data.defender ?? {};
          data.defender.defenseType = "counter";
          defenseType = "counter";
          await _updateCard(message, data);
        }
      }

      const outcome = _getDefenderOutcome(data, data.defender);
      if (!outcome || outcome.winner !== "defender" || defenseType !== "counter") {
        ui.notifications.warn("Counter-attack damage can only be rolled when the defender wins via Counter-Attack.");
        return;
      }
      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to roll damage for this defender.");
        return;
      }

      const advantage = _getDefenderAdvantage(data, data.defender) ?? { attacker: 0, defender: 0 };
      const advCount = Number(advantage.defender ?? 0);
      const targetActor = _resolveDoc(data?.attacker?.actorUuid) ?? attacker;
      const baseHitLocation = resolveHitLocationForTarget(targetActor, getHitLocationFromRoll(data.defender?.result?.rollTotal ?? 0));
      const selection = await _promptWeaponAndAdvantages({
        attackerActor: defender,
        advantageCount: advCount,
        defaultWeaponUuid: data.context?.lastDefenderWeaponUuid ?? _getPreferredWeaponUuid(defender, { meleeOnly: true }) ?? null,
        defaultHitLocation: baseHitLocation,
      });
      if (!selection) return;

      const weapon = await fromUuid(selection.weaponUuid);
      if (!weapon) {
        ui.notifications.warn("Selected weapon could not be resolved.");
        return;
      }

      // Persist last defender weapon for convenience within this single opposed workflow.
      data.context = data.context ?? {};
      data.context.lastDefenderWeaponUuid = weapon.uuid;
      await _updateCard(message, data);

      // Press Advantage: if the counter-attacker spends Advantage here, the benefit belongs to the defender
      // (the striker in this counter-damage roll) against the original attacker.
      // This mirrors the attacker-win damage flow, which applies Press Advantage immediately upon selection.
      const attackMode = getContextAttackMode(data.context);
      if (selection.pressAdvantage && attackMode === "melee") {
        try {
          // Counter-attack is only legal against melee attacks; still guard defensively.
          await _applyPressAdvantageEffect(
            defender,
            targetActor,
            {
              attackerTokenUuid: data.defender?.tokenUuid ?? null,
              defenderTokenUuid: data.attacker?.tokenUuid ?? null
            }
          );
        } catch (err) {
          console.warn("UESRPG | Failed to apply Press Advantage on counter-attack damage selection", err);
        }
      }

      // Hit location RAW: ones digit of counter-attack roll, unless Precision Strike is used.
      const hitLocationRaw = (advCount > 0 && selection.precisionStrike)
        ? selection.precisionLocation
        : getHitLocationFromRoll(data.defender?.result?.rollTotal ?? 0);
      const hitLocation = resolveHitLocationForTarget(targetActor, hitLocationRaw);

      const dmg = await _rollWeaponDamage({ weapon, preConsumedAmmo: data.attacker?.preConsumedAmmo ?? null });
      if (!dmg) return;
      const damageType = getDamageTypeFromWeapon(weapon);

      // Counter-attack: defender is the striker, original attacker is the target.
      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${attacker.uuid}"
        data-attacker-actor-uuid="${defender.uuid}"
        data-weapon-uuid="${weapon.uuid}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${hitLocation}"
        data-dos-bonus="0"
        data-penetration="0"
        data-penetrate-armor="${selection.penetrateArmor ? "1" : "0"}"
        data-forceful-impact="${selection.forcefulImpact ? "1" : "0"}"
        data-press-advantage="${selection.pressAdvantage ? "1" : "0"}"
        data-source="${weapon.name}">
        Apply Damage → ${aToken?.name ?? attacker.name}
      </button>`;

      await _postWeaponDamageChatCard({
        attacker: defender,
        aToken: dToken,
        weapon,
        dmg,
        hitLocation,
        applyButtonHtml: applyBtn,
        extraNoteHtml: `<b>Strike:</b> Counter-Attack against ${aToken?.name ?? attacker.name}`,
        parentMessageId: message.id,
        stage: "counter-damage-card",
      });

      return;
    }

    // --- Resolve Advantage (defender won via successful defense) ---
    if (action === "defender-advantage") {
      const resolvedOk = await _ensureResolvedForPostActions(message, data, { defenderIndex });
      if (!resolvedOk) {
        ui.notifications.warn("Defender Advantage can only be resolved after the opposed test is resolved and the defender wins.");
        return;
      }

      const outcome = _getDefenderOutcome(data, data.defender);
      if (!outcome || outcome.winner !== "defender") {
        ui.notifications.warn("Defender Advantage can only be resolved after the opposed test is resolved and the defender wins.");
        return;
      }
      // If the defender chose No Defense, they are treated as having failed and cannot utilize Advantage.
      if (data.defender?.noDefense === true || String(data.defender?.defenseType ?? "none") === "none") {
        ui.notifications.warn("No Defense was chosen; defender cannot resolve Advantage.");
        return;
      }
      // Counter-Attack and Block have their own dedicated resolution actions.
      const dt = String(data.defender?.defenseType ?? "none");
      if (dt === "counter" || dt === "block") {
        ui.notifications.warn("This defense type has a dedicated resolution action.");
        return;
      }

      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to resolve Advantage for this defender.");
        return;
      }

      const advantage = _getDefenderAdvantage(data, data.defender) ?? { attacker: 0, defender: 0 };
      const advCount = Number(advantage.defender ?? 0);
      if (!Number.isFinite(advCount) || advCount <= 0) {
        ui.notifications.warn("No Advantage is available to resolve for the defender.");
        return;
      }

      // Prevent double-resolution.
      const resolutionState = _getDefenderResolutionState(data, data.defender);
      if (resolutionState.defenderAdvantage.resolved === true || resolutionState.advantageSpent?.defender === true) {
        ui.notifications.warn("Defender Advantage has already been resolved.");
        return;
      }

      const attacker = _resolveDoc(data?.attacker?.actorUuid);
      if (!attacker) {
        ui.notifications.warn("Attacker could not be resolved.");
        return;
      }

      const choice = await _promptDefenderAdvantage({
        defenderActor: defender,
        attackerActor: attacker,
        advantageCount: advCount
      });

      // If the dialog was closed, do not mark as spent.
      if (!choice) return;

      resolutionState.advantageSpent.defender = true;
      resolutionState.advantageResolution.defender = { 
        overextend: Boolean(choice.overextend), 
        overwhelm: Boolean(choice.overwhelm),
        specialActionsSelected: Array.isArray(choice.specialActionsSelected) ? choice.specialActionsSelected.slice() : []
      };

      resolutionState.defenderAdvantage = {
        resolved: true,
        choice: { 
          overextend: Boolean(choice.overextend), 
          overwhelm: Boolean(choice.overwhelm),
          specialActionsSelected: Array.isArray(choice.specialActionsSelected) ? choice.specialActionsSelected.slice() : []
        },
        resolvedAt: Date.now(),
        resolvedBy: game.user.id,
      };

      await _updateCard(message, data);

      // Apply mechanical effects now (only when Resolve Advantage is clicked).
      if (choice.overextend) {
        await _applyOverextendEffect(attacker, {
          defenderUuid: defender.uuid,
          defenderTokenUuid: data.defender?.tokenUuid ?? null,
          opponentTokenUuid: data.attacker?.tokenUuid ?? null
        });
      }
      if (choice.overwhelm) {
        await _applyOverwhelmEffect(attacker, { defenderUuid: defender.uuid });
      }

      // Execute Special Advantage automation for defender (free + auto-win)
      if (Array.isArray(choice.specialActionsSelected) && choice.specialActionsSelected.length > 0) {
        try {
          const { showSpecialAdvantageDialog, executeSpecialAction } = await import("./special-actions-helper.js");
          
          for (const saId of choice.specialActionsSelected) {
            const advChoice = await showSpecialAdvantageDialog(saId);
            if (!advChoice) continue;

            if (advChoice.mode === "autowin") {
              // Auto-Win: consume 1 AP, skip test, auto-succeed
              const { ActionEconomy } = await import("./action-economy.js");
              const def = getSpecialActionById(saId);
              await ActionEconomy.spendAP(defender, 1, { 
                reason: `Special Advantage: ${def?.name} (Auto-Win)`, 
                silent: false 
              });

              const result = await executeSpecialAction({
                specialActionId: saId,
                actor: defender,
                target: attacker ?? null,
                isAutoWin: true,
                opposedResult: { winner: "defender" }
              });

              if (result.success) {
                await ChatMessage.create({
                  user: game.user.id,
                  speaker: ChatMessage.getSpeaker({ actor: defender }),
                  content: `<div class="uesrpg-special-action-advantage"><b>Special Advantage (Auto-Win):</b><p>${result.message}</p></div>`,
                  style: CONST.CHAT_MESSAGE_STYLES.OTHER
                });
              }
            } else if (advChoice.mode === "free") {
              // Free Action: 0 AP, initiate test with dropdown selection
              const attackerTokenUuid = data.attacker?.tokenUuid ?? null;
              const defenderTokenUuid = data.defender?.tokenUuid ?? null;
              const attackerToken = attackerTokenUuid ? fromUuidSync(attackerTokenUuid)?.object : null;
              const defenderToken = defenderTokenUuid ? fromUuidSync(defenderTokenUuid)?.object : null;

              // Defender initiates, so swap attacker/defender roles
              if (attackerToken && defenderToken) {
                const { SkillOpposedWorkflow } = await import("../skills/opposed-workflow.js");
                const def = getSpecialActionById(saId);
                
                const message = await SkillOpposedWorkflow.createPending({
                  attackerTokenUuid: defenderToken?.document?.uuid ?? defenderToken?.uuid,
                  defenderTokenUuid: attackerToken?.document?.uuid ?? attackerToken?.uuid,
                  attackerSkillUuid: null,  // Let user choose from dropdown in card
                  attackerSkillLabel: `${def?.name} (Special Action)`
                });

                const state = message?.flags?.["uesrpg-3ev4"]?.skillOpposed?.state;
                if (state) {
                  state.specialActionId = saId;
                  state.allowCombatStyle = true;
                  state.isFreeAction = true;

                  await message.update({
                    flags: {
                      "uesrpg-3ev4": {
                        skillOpposed: {
                          version: state.version ?? 1,
                          state
                        }
                      }
                    }
                  });
                }

                ui.notifications.info(`Special Advantage: ${def?.name} used as free action.`);
              }
            }
          }
        } catch (err) {
          console.error("UESRPG | Failed to execute Special Advantage automation", err);
        }
      }

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        content: `<div class="ues-opposed-card" style="padding:6px;">
          <b>Defender Advantage Resolved.</b>
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "defender-advantage"),
      });

      return;
    }

    // --- Resolve Block (defender won via block) ---
    if (action === "block-resolve") {
      const resolvedOk = await _ensureResolvedForPostActions(message, data, { defenderIndex });
      if (!resolvedOk) {
        ui.notifications.warn("Block resolution is only available when the opposed test is resolved.");
        return;
      }

      const outcome = _getDefenderOutcome(data, data.defender);
      if (!outcome || outcome.winner !== "defender" || (data.defender.defenseType ?? "none") !== "block") {
        ui.notifications.warn("Block resolution is only available when the defender wins by blocking.");
        return;
      }
      if (!_canControlActor(defender) && !game.user.isGM) {
        ui.notifications.warn("You do not have permission to resolve this block.");
        return;
      }

      const isAoE = Boolean(data?.context?.aoe?.isAoE || data?.context?.isAoE);
      const shareDamage = isAoE || _isMultiDefender(data);
      let sharedDamage = shareDamage ? (data.context?.sharedDamage ?? null) : null;
      const sharedSelection = shareDamage ? (data.context?.sharedDamageSelection ?? null) : null;

      const shields = _listEquippedShields(defender);
      const shield = shields[0] ?? null;
      if (!shield) {
        ui.notifications.warn("No equipped shield found on the defender.");
        return;
      }

      // Roll the incoming attack damage (attacker weapon selection).
      const selection = sharedSelection ?? (sharedDamage?.weaponUuid ? { weaponUuid: sharedDamage.weaponUuid } : null) ?? await _promptWeaponAndAdvantages({
        attackerActor: attacker,
        attackMode: data.context?.attackMode ?? "melee",
        advantageCount: 0,
        defaultWeaponUuid: data.context?.lastWeaponUuid ?? _getPreferredWeaponUuid(attacker, { meleeOnly: false }) ?? null,
      });
      if (!selection) return;

      if (shareDamage && !sharedSelection) {
        data.context = data.context ?? {};
        data.context.sharedDamageSelection = foundry.utils.deepClone(selection);
        await _updateCard(message, data);
      }

      const weapon = await fromUuid(selection.weaponUuid);
      if (!weapon) {
        ui.notifications.warn("Selected weapon could not be resolved.");
        return;
      }

      const reuseShared = Boolean(sharedDamage && sharedDamage.mode === "weapon" && (!sharedDamage.weaponUuid || sharedDamage.weaponUuid === weapon?.uuid));
      const dmg = reuseShared
        ? _inflateSharedDamage(sharedDamage)
        : await _rollWeaponDamage({ weapon, preConsumedAmmo: data.attacker?.preConsumedAmmo ?? null });
      if (!dmg) return;
      if (shareDamage && (!sharedDamage || sharedDamage.mode !== "weapon")) {
        sharedDamage = _buildSharedDamagePayload({ mode: "weapon", dmg, weaponUuid: weapon?.uuid ?? null, damageType: getDamageTypeFromWeapon(weapon) });
        data.context = data.context ?? {};
        data.context.sharedDamage = sharedDamage;
        await _updateCard(message, data);
      }
      const damageType = getDamageTypeFromWeapon(weapon);
      // Always post the weapon damage card so the chat log retains hit-location context,
      // even when the defender wins by blocking.
      const hitLocation = resolveHitLocationForTarget(defender, getHitLocationFromRoll(data.attacker?.result?.rollTotal ?? 100));
      await _postWeaponDamageChatCard({
        attacker,
        aToken,
        weapon,
        dmg,
        hitLocation,
        extraNoteHtml: `<b>Defense:</b> Block (${shield?.name ?? "Shield"})`,
        parentMessageId: message.id,
        stage: "block-damage-card",
      });
      if (isAoE) {
        const forcedLoc = data?.context?.forcedHitLocation ?? "Body";
        const hitLocation = resolveHitLocationForTarget(defender, forcedLoc);
        const reducedDamage = Math.ceil(Number(dmg.finalDamage) / 2);
        const applyBtn = `<button type="button" class="apply-damage-btn"
          data-target-uuid="${defender.uuid}"
          data-attacker-actor-uuid="${attacker.uuid}"
          data-weapon-uuid="${weapon.uuid}"
          data-damage="${reducedDamage}"
          data-damage-type="${damageType}"
          data-hit-location="${hitLocation}"
          data-dos-bonus="0"
          data-penetration="0"
          data-source="${weapon.name}">
          Apply Block Damage → ${dToken?.name ?? defender.name}
        </button>`;

        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          content: `<div class="uesrpg-weapon-damage-card">
            <h2 style="margin:0 0 0.25rem 0;">AoE Block</h2>
            <div style="opacity:0.9; margin-bottom:0.5rem;">Incoming damage reduced by half (rounded up): <b>${reducedDamage}</b>.</div>
            ${applyBtn}
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "block-result"),
        });
        return;
      }

      let br = getBlockValue(shield, damageType);
      
      // Check for Power Block stamina effect (only for physical damage)
      const powerBlockEffect = getActiveStaminaEffect(defender, STAMINA_EFFECT_KEYS.POWER_BLOCK);
      const isPowerBlockActive = powerBlockEffect && String(damageType).toLowerCase() === DAMAGE_TYPES.PHYSICAL;
      if (isPowerBlockActive) {
        const originalBR = br;
        br = br * 2;
        await consumeStaminaEffect(defender, STAMINA_EFFECT_KEYS.POWER_BLOCK, {
          message: `Shield BR doubled: ${originalBR} → ${br} (physical damage only)`
        });
      }
      
      const shieldSplitter = _weaponHasQuality(weapon, "shieldSplitter");
      if (shieldSplitter) br = Math.max(0, Math.ceil(_asNumber(br) / 2));
      const blocked = dmg.finalDamage <= br;

      if (blocked) {
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
          content: `<div class="ues-opposed-card" style="padding:6px;">
            <b>Block:</b> Incoming damage <b>${dmg.finalDamage}</b> does not exceed Block Rating <b>${br}</b>${shieldSplitter ? ' (Shield Splitter applied)' : ''}. No damage taken.
          </div>`,
          style: CONST.CHAT_MESSAGE_STYLES.OTHER,
          rollMode: game.settings.get("core", "rollMode"),
          flags: _opposedFlags(message.id, "block-result"),
        });
        return;
      }

      // RAW: if damage exceeds BR, take full damage to shield arm.
      const shieldArm = "Left Arm";

      const resolvedShieldArm = resolveHitLocationForTarget(defender, shieldArm);

      const applyBtn = `<button type="button" class="apply-damage-btn"
        data-target-uuid="${defender.uuid}"
        data-attacker-actor-uuid="${attacker.uuid}"
        data-weapon-uuid="${weapon.uuid}"
        data-damage="${dmg.finalDamage}"
        data-damage-type="${damageType}"
        data-hit-location="${resolvedShieldArm}"
        data-dos-bonus="0"
        data-penetration="0"
        data-source="${weapon.name}">
        Apply Block Damage → ${dToken?.name ?? defender.name}
      </button>`;

      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: defender, token: dToken?.document ?? null }),
        content: `<div class="uesrpg-weapon-damage-card">
          <h2 style="margin:0 0 0.25rem 0;">Block Penetrated</h2>
          <div style="opacity:0.9; margin-bottom:0.5rem;">Incoming damage <b>${dmg.finalDamage}</b> exceeds Block Rating <b>${br}</b>${shieldSplitter ? ' (Shield Splitter applied)' : ''} (${shield?.name ?? "No Shield"}).</div>
          ${applyBtn}
        </div>`,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
        rollMode: game.settings.get("core", "rollMode"),
        flags: _opposedFlags(message.id, "block-penetrated"),
      });
      return;
    }

    // --- Resolve ---
    const currentOutcome = _getDefenderOutcome(data, data.defender);
    if (data.attacker.result && (data.defender.result || data.defender.noDefense) && !currentOutcome) {
      const baseOutcome = _resolveOutcomeRAW(data, data.defender) ?? { winner: "tie", text: "" };
      const outcome = _applyAoEEvadeOutcome(data, baseOutcome);
      _setDefenderOutcome(data, data.defender, outcome);
      _setDefenderAdvantage(data, data.defender, _computeAdvantageRAW(data, outcome, data.defender));

      const allResolved = defenders.every(def => Boolean(_getDefenderOutcome(data, def)));
      if (allResolved) {
        data.status = "resolved";
        data.context = data.context ?? {};
        data.context.phase = "resolved";
        if (!data.context.resolvedAt) data.context.resolvedAt = Date.now();
        _cleanupAutoRollContext(data.context);
      }

      _logDebug("resolve", {
        attackerUuid: data.attacker.actorUuid,
        defenderUuid: data.defender.actorUuid,
        outcome,
        advantage: _getDefenderAdvantage(data, data.defender),
        attackerResult: data.attacker
          ? { rollTotal: data.attacker.result?.rollTotal, isSuccess: data.attacker.result?.isSuccess, degree: data.attacker.result?.degree }
          : null,
        defenderResult: data.defender
          ? { rollTotal: data.defender.result?.rollTotal, isSuccess: data.defender.result?.isSuccess, degree: data.defender.result?.degree, noDefense: data.defender.noDefense }
          : null
      });

      await _updateCard(message, data);
    }
  }
};

