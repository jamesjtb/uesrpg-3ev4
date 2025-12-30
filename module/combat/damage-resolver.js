/**
 * module/combat/damage-resolver.js
 *
 * Single, shared resolver path for damage application.
 *
 * This module is the canonical boundary between UI payloads (chat card datasets,
 * sheet buttons, legacy cards) and the underlying damage engine.
 *
 * Responsibilities:
 *  - Normalize hit location keys/labels.
 *  - Derive effective penetration from weapon + payload.
 *  - Provide consistent option-shaping for damage-automation.applyDamage.
 *  - Apply Active Effects-derived damage & mitigation modifiers deterministically
 *    at the final damage resolution boundary.
 *
 * NOTE: This system is not on ApplicationV2.
 */

import { applyDamage, calculateDamage, DAMAGE_TYPES, applyForcefulImpact, ensureUnconsciousEffect } from "./damage-automation.js";
import { evaluateAEModifierKeys } from "../ae/modifier-evaluator.js";
import { isTransferEffectActive } from "../ae/transfer.js";

/**
 * Normalize hit location values to engine keys used by damage-automation.js.
 * @param {string} hitLocation
 * @returns {string}
 */
function normalizeHitLocation(hitLocation) {
  const v = String(hitLocation ?? "").trim();
  if (!v) return "Body";

  // Common aliases seen in cards / legacy sheets.
  const map = {
    head: "Head",
    body: "Body",
    torso: "Body",
    leftarm: "LeftArm",
    "left arm": "LeftArm",
    rightarm: "RightArm",
    "right arm": "RightArm",
    leftleg: "LeftLeg",
    "left leg": "LeftLeg",
    rightleg: "RightLeg",
    "right leg": "RightLeg",
  };

  const key = v.replace(/\s+/g, "").toLowerCase();
  return map[key] ?? v;
}

/**
 * Coerce user-facing damage type strings to known damage types.
 * @param {string} damageType
 * @returns {string}
 */
function normalizeDamageType(damageType) {
  const v = String(damageType ?? "").trim().toLowerCase();
  if (!v) return DAMAGE_TYPES.PHYSICAL;

  // Prefer constants, but accept raw strings.
  const known = new Set(Object.values(DAMAGE_TYPES).map(x => String(x).toLowerCase()));
  if (known.has(v)) return v;

  // Allow some common aliases.
  const alias = {
    phys: DAMAGE_TYPES.PHYSICAL,
    physical: DAMAGE_TYPES.PHYSICAL,
  };
  return String(alias[v] ?? v).toLowerCase();
}

function asNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/**
 * Collect additive AE changes for the given actor and target keys.
 * Deterministic policy:
 *  - Actor embedded effects always apply (if not disabled)
 *  - Item transfer effects apply only if transfer=true AND isTransferEffectActive() returns true
 *  - Only ADD mode is honored for now by design (explicitly avoids implicit mode behavior)
 *
 * @param {Actor} actor
 * @param {string[]} targetKeys
 * @returns {{total:number, entries:Array<{key:string,label:string,value:number}>}}
 */


/**
 * Derive deterministic AE damage modifiers at the resolver boundary.
 *
 * Keys (ADD or OVERRIDE mode):
 *  - Attacker:
 *      - system.modifiers.combat.damage.dealt       (flat bonus to raw damage BEFORE mitigation)
 *      - system.modifiers.combat.penetration        (flat bonus to penetration)
 *  - Defender:
 *      - system.modifiers.combat.damage.taken       (flat bonus to damage AFTER mitigation; negative reduces)
 *      - system.modifiers.combat.mitigation.flat    (flat mitigation AFTER reductions; positive reduces damage)
 *
 * OVERRIDE semantics:
 *  - If OVERRIDE is present for a key, it replaces all ADD contributions for that key.
 *  - Selection is deterministic via evaluateAEModifierKeys().
 *
 * @param {Actor|null} attackerActor
 * @param {Actor} defenderActor
 * @returns {{
 *  attacker:{damageDealt:number, penetration:number, entries:any[]},
 *  defender:{damageTaken:number, mitigationFlat:number, entries:any[]}
 * }}
 */
function getAETwitterMods(attackerActor, defenderActor) {
  const atkKeys = ["system.modifiers.combat.damage.dealt", "system.modifiers.combat.penetration"];
  const defKeys = ["system.modifiers.combat.damage.taken", "system.modifiers.combat.mitigation.flat"];

  const atkResolved = attackerActor ? evaluateAEModifierKeys(attackerActor, atkKeys) : null;
  const defResolved = evaluateAEModifierKeys(defenderActor, defKeys);

  const packEntries = (resolved, mapping) => {
    const out = [];
    if (!resolved) return out;
    for (const [key, target] of Object.entries(mapping)) {
      const r = resolved[key];
      if (!r?.entries?.length) continue;
      for (const e of r.entries) {
        out.push({
          key: `ae-${target}-${e.effectId ?? foundry.utils.randomID()}`,
          label: e.label,
          value: e.value,
          target,
          mode: e.mode,
          priority: e.priority,
        });
      }
    }
    return out;
  };

  const attackerDamageDealt = atkResolved ? (atkResolved["system.modifiers.combat.damage.dealt"]?.total ?? 0) : 0;
  const attackerPen = atkResolved ? (atkResolved["system.modifiers.combat.penetration"]?.total ?? 0) : 0;

  const defenderDamageTaken = defResolved["system.modifiers.combat.damage.taken"]?.total ?? 0;
  const defenderMitFlat = defResolved["system.modifiers.combat.mitigation.flat"]?.total ?? 0;

  return {
    attacker: {
      damageDealt: attackerDamageDealt,
      penetration: attackerPen,
      entries: [
        ...packEntries(atkResolved, {
          "system.modifiers.combat.damage.dealt": "damage.dealt",
          "system.modifiers.combat.penetration": "penetration",
        }),
      ],
    },
    defender: {
      damageTaken: defenderDamageTaken,
      mitigationFlat: defenderMitFlat,
      entries: [
        ...packEntries(defResolved, {
          "system.modifiers.combat.damage.taken": "damage.taken",
          "system.modifiers.combat.mitigation.flat": "mitigation.flat",
        }),
      ],
    },
  };
}

/**
 * Derive deterministic AE damage modifiers at the resolver boundary.
 *
 * Keys (ADD mode only):
 *  - Attacker:
 *      - system.modifiers.combat.damage.dealt       (flat bonus to raw damage BEFORE mitigation)
 *      - system.modifiers.combat.penetration        (flat bonus to penetration)
 *  - Defender:
 *      - system.modifiers.combat.damage.taken       (flat bonus to damage AFTER mitigation; negative reduces)
 *      - system.modifiers.combat.mitigation.flat    (flat mitigation AFTER reductions; positive reduces damage)
 *
 * @param {Actor|null} attackerActor
 * @param {Actor} defenderActor
 * @returns {{
 *  attacker:{damageDealt:number, penetration:number, entries:any[]},
 *  defender:{damageTaken:number, mitigationFlat:number, entries:any[]}
 * }}
 */


/**
 * Collect typed bonus damage entries from attacker effects using the syntax: "<number>[<type>]".
 * Example: "3[fire]" yields 3 damage of type "fire".
 *
 * Deterministic mode behavior per damage type:
 *  - If any OVERRIDE entries exist for a given type, the highest-priority OVERRIDE wins for that type and ADDs are ignored.
 *  - Otherwise, ADD entries stack.
 *
 * @param {Actor} attackerActor
 * @returns {{byType: Record<string, {total:number, entries:Array<{label:string,value:number,mode:string,priority:number,effectId?:string}>}>}}
 */
function collectTypedBonusDamage(attackerActor) {
  const ADD = CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  const OVERRIDE = CONST?.ACTIVE_EFFECT_MODES?.OVERRIDE ?? 5;

  const parseTyped = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim();
    const m = s.match(/^(-?\d+(?:\.\d+)?)\s*\[\s*([^\]]+)\s*\]\s*$/i);
    if (!m) return null;
    const amount = Number(m[1]);
    const dtype = String(m[2]).trim().toLowerCase();
    if (!Number.isFinite(amount) || !dtype) return null;
    return { amount, dtype };
  };

  /** @type {{effect:any,label:string}[]} */
  const sources = [];

  for (const ef of (attackerActor?.effects ?? [])) {
    sources.push({ effect: ef, label: ef?.name ?? "Effect" });
  }

  for (const item of (attackerActor?.items ?? [])) {
    for (const ef of (item?.effects ?? [])) {
      if (!isTransferEffectActive(attackerActor, item, ef)) continue;
      const src = item?.name ? `${item.name}` : (ef?.name ?? "Effect");
      const label = ef?.name ? `${src}: ${ef.name}` : src;
      sources.push({ effect: ef, label });
    }
  }

  /** @type {Record<string, any[]>} */
  const collected = {};

  for (const { effect, label } of sources) {
    if (!effect || effect.disabled) continue;
    const priority = Number(effect.priority ?? 0) || 0;

    for (const ch of (Array.isArray(effect.changes) ? effect.changes : [])) {
      if (!ch) continue;
      if (ch.key !== "system.modifiers.combat.damage.dealt") continue;

      const typed = parseTyped(ch.value);
      if (!typed) continue;

      const mode = (typeof ch.mode === "number") ? ch.mode : (String(ch.mode ?? "").toUpperCase() === "OVERRIDE" ? OVERRIDE : ADD);
      const dtype = typed.dtype;
      collected[dtype] ??= [];
      collected[dtype].push({
        label,
        value: typed.amount,
        mode: (mode === OVERRIDE ? "OVERRIDE" : "ADD"),
        priority,
        effectId: effect.id,
      });
    }
  }

  /** @type {Record<string, {total:number, entries:any[]}>} */
  const byType = {};

  for (const [dtype, entries] of Object.entries(collected)) {
    const overrides = entries.filter(e => e.mode === "OVERRIDE" && Number.isFinite(e.value));
    if (overrides.length) {
      overrides.sort((a, b) => (b.priority - a.priority) || String(b.effectId ?? "").localeCompare(String(a.effectId ?? "")));
      const chosen = overrides[0];
      byType[dtype] = { total: chosen.value, entries: [chosen] };
      continue;
    }
    // ADD
    const addEntries = entries.filter(e => e.mode === "ADD" && Number.isFinite(e.value) && e.value !== 0);
    const total = addEntries.reduce((s, e) => s + e.value, 0);
    byType[dtype] = { total, entries: addEntries };
  }

  return { byType };
}


/**
 * Build the canonical damage context from a resolver payload.
 * @param {object} payload
 * @returns {{rawDamage:number, damageType:string, options:object}}
 */
function buildDamageContext(payload = {}) {
  const rawDamage = asNumber(payload.rawDamage ?? payload.damage ?? 0);
  const dosBonus = asNumber(payload.dosBonus ?? 0);
  const penetration = asNumber(payload.penetration ?? 0);
  const hitLocation = normalizeHitLocation(payload.hitLocation ?? payload.location ?? "Body");
  const damageType = normalizeDamageType(payload.damageType ?? DAMAGE_TYPES.PHYSICAL);

  const options = {
    // Damage-automation options (kept stable)
    ignoreReduction: payload.ignoreReduction === true,
    penetrateArmorForTriggers: payload.penetrateArmorForTriggers === true,
    forcefulImpact: payload.forcefulImpact === true,
    pressAdvantage: payload.pressAdvantage === true,
    source: payload.source ?? "Unknown",
    hitLocation,
    dosBonus,
    penetration,

    // Optional enrichment
    weapon: payload.weapon ?? null,
    attackerActor: payload.attackerActor ?? null,
  };

 _toggleKnownOption(payload, options, "ignoreArmor");
  _toggleKnownOption(payload, options, "ignoreResistance");

  return { rawDamage, damageType, options };
}



/**
 * Best-effort reporting helper: list equipped armor items that explicitly cover a location.
 * This mirrors the simplest branch of getDamageReduction() coverage checks.
 * It is used for chat-card attribution only and MUST NOT affect mechanics.
 *
 * @param {Actor} actor
 * @param {string} locKey - normalized location key (e.g. "Head", "Body", "LeftLeg")
 * @returns {{name:string, ar:number}[]}
 */
function listArmorSourcesForLocation(actor, locKey) {
  try {
    const items = actor?.items?.filter((i) => i?.type === "armor" && i?.system?.equipped === true && !i?.system?.isShield) ?? [];
    const out = [];
    for (const item of items) {
      const hitLocs = item?.system?.hitLocations ?? {};
      // Only explicit true counts (same rule as getDamageReduction for explicit locations)
      const covered = hitLocs?.[locKey] === true;
      if (!covered) continue;

      const ar = (item.system?.armorEffective != null)
        ? Number(item.system.armorEffective)
        : Number(item.system?.armor ?? 0);

      out.push({ name: String(item.name ?? "Armor"), ar: Number.isFinite(ar) ? ar : 0 });
    }
    return out;
  } catch (_err) {
    return [];
  }
}
function _toggleKnownOption(payload, options, key) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
    options[key] = payload[key];
  }
}

/**
 * Canonical resolver: applies damage with deterministic option shaping and AE modifiers.
 *
 * @param {Actor} targetActor
 * @param {object} payload - see buildDamageContext()
 * @returns {Promise<object|null>} Damage engine result (applyDamage return value)
 */
export async function applyDamageResolved(targetActor, payload = {}) {
  if (!targetActor) {
    ui.notifications.warn("No valid target actor found for damage application.");
    return null;
  }

  const ctx = buildDamageContext(payload);

  // --- Active Effects: damage & mitigation modifiers (resolver boundary) ---
  const attackerActor = ctx.options?.attackerActor ?? null;
  const mods = getAETwitterMods(attackerActor, targetActor);

  // Apply attacker-side bonuses BEFORE mitigation
  ctx.rawDamage = Math.max(0, ctx.rawDamage + asNumber(mods.attacker.damageDealt));
  ctx.options.penetration = Math.max(0, asNumber(ctx.options.penetration) + asNumber(mods.attacker.penetration));

  // Pass defender-side adjustments into the final resolution stage
  ctx.options.aeDamageTaken = asNumber(mods.defender.damageTaken);
  ctx.options.aeMitigationFlat = Math.max(0, asNumber(mods.defender.mitigationFlat));

  // Attach provenance for downstream chat cards / debugging (non-authoritative).
  ctx.options.aeBreakdown = {
    attacker: mods.attacker.entries,
    defender: mods.defender.entries,
  };

  // --- Typed bonus damage (single application workflow)
  // We must support additional damage types in ONE damage application click.
  // Policy:
  //  - Primary instance receives defender-side AE taken/mitigation adjustments.
  //  - Typed bonus instances receive their own reductions (resistance/toughness) but do NOT re-apply
  //    defender AE taken/mitigation adjustments (avoids double-counting per attack).
  //  - All instances are applied in one HP update and reported in one chat card.

  const components = [];

  // Primary component
  components.push({
    kind: "primary",
    amount: Math.max(0, ctx.rawDamage),
    damageType: ctx.damageType,
    applyDefenderAdjust: true,
    sourceLabel: ctx.options.source ?? "Attack",
    breakdown: {
      attacker: ctx.options?.aeBreakdown?.attacker ?? [],
      defender: ctx.options?.aeBreakdown?.defender ?? [],
    },
  });

  // Typed bonus components
  const typedBonusDamage = (attackerActor ? collectTypedBonusDamage(attackerActor) : null);
  if (typedBonusDamage?.byType) {
    for (const [dtype, t] of Object.entries(typedBonusDamage.byType)) {
      const amt = Number(t?.total ?? 0);
      if (!Number.isFinite(amt) || amt === 0) continue;
      components.push({
        kind: "typed",
        amount: Math.max(0, amt),
        damageType: normalizeDamageType(dtype),
        applyDefenderAdjust: false,
        sourceLabel: `${ctx.options.source ?? "Attack"} • AE Bonus [${dtype}]`,
        breakdown: {
          attackerTyped: t.entries ?? [],
        },
      });
    }
  }

  // Compute per-component results and apply once.
  const hitLocation = ctx.options.hitLocation ?? "Body";
  const currentHP = Number(targetActor.system?.hp?.value ?? 0);
  const maxHP = Number(targetActor.system?.hp?.max ?? 1);

  const woundThreshold = (() => {
    const wt = targetActor.system?.wound_threshold;
    if (wt && typeof wt === "object") {
      const v = Number(wt.value ?? wt.total ?? wt.base);
      return Number.isFinite(v) ? v : 0;
    }
    const v = Number(targetActor.system?.woundThreshold ?? targetActor.system?.wounds ?? 0);
    return Number.isFinite(v) ? v : 0;
  })();

  // Choose update target: unlinked token actor if applicable, else base actor
  const activeToken = targetActor.token ?? targetActor.getActiveTokens?.()[0] ?? null;
  const isUnlinkedToken = !!(activeToken && targetActor.prototypeToken && targetActor.prototypeToken.actorLink === false);
  const updateTarget = isUnlinkedToken ? activeToken.actor : targetActor;

  /** @type {Array<any>} */
  const results = [];
  let totalApplied = 0;
  let anyWoundTrigger = false;

  for (const c of components) {
    const isPrimary = c.kind === "primary";

    const calc = ctx.options?.ignoreReduction === true
      ? {
          rawDamage: Number(c.amount || 0),
          dosBonus: isPrimary ? Number(ctx.options?.dosBonus || 0) : 0,
          totalDamage: Math.max(0, Number(c.amount || 0) + (isPrimary ? Number(ctx.options?.dosBonus || 0) : 0)),
          reductions: { armor: 0, resistance: 0, toughness: 0, total: 0, penetrated: 0 },
          finalDamage: Math.max(0, Number(c.amount || 0) + (isPrimary ? Number(ctx.options?.dosBonus || 0) : 0)),
          hitLocation,
          damageType: c.damageType,
          weaponBonus: 0,
        }
      : calculateDamage(Number(c.amount || 0), c.damageType, updateTarget, {
          penetration: isPrimary ? Number(ctx.options?.penetration || 0) : 0,
          dosBonus: isPrimary ? Number(ctx.options?.dosBonus || 0) : 0,
          hitLocation,
          penetrateArmorForTriggers: isPrimary ? (ctx.options?.penetrateArmorForTriggers === true) : false,
          weapon: isPrimary ? (ctx.options?.weapon ?? null) : null,
          attackerActor: isPrimary ? (ctx.options?.attackerActor ?? null) : null,
        });

    const baseFinal = Number(calc.finalDamage || 0);
    const adjusted = c.applyDefenderAdjust
      ? Math.max(0, baseFinal + asNumber(ctx.options?.aeDamageTaken) - asNumber(ctx.options?.aeMitigationFlat))
      : Math.max(0, baseFinal);

    totalApplied += adjusted;
    if (woundThreshold > 0 && adjusted >= woundThreshold && adjusted > 0) anyWoundTrigger = true;

    results.push({
      kind: c.kind,
      sourceLabel: c.sourceLabel,
      damageType: c.damageType,
      hitLocation,
      rawDamage: Number(calc.rawDamage ?? c.amount ?? 0),
      dosBonus: Number(calc.dosBonus ?? 0),
      weaponBonus: Number(calc.weaponBonus ?? 0),
      reductions: calc.reductions,
      finalDamage: baseFinal,
      finalApplied: adjusted,
      breakdown: c.breakdown ?? null,
    });
  }

  const newHP = Math.max(0, Number(currentHP) - Math.max(0, totalApplied));

  const updateData = { "system.hp.value": newHP };
  if (anyWoundTrigger && !updateTarget.system?.wounded) updateData["system.wounded"] = true;
  await updateTarget.update(updateData);

  // Forceful Impact: only meaningful for primary physical hits.
  if (ctx.options?.forcefulImpact && String(ctx.damageType ?? "").toLowerCase() === DAMAGE_TYPES.PHYSICAL) {
    const primaryApplied = results.find(r => r.kind === "primary")?.finalApplied ?? 0;
    if (primaryApplied > 0) {
      try {
        await applyForcefulImpact(updateTarget, hitLocation);
      } catch (err) {
        console.warn("UESRPG | Forceful Impact armor update failed", err);
      }
    }
  }

  if (newHP === 0) {
    await ensureUnconsciousEffect(updateTarget);
  }

  // Consolidated GM-only damage report
  const gmIds = game.users?.filter(u => u.isGM).map(u => u.id) ?? [];
  const hpDelta = Math.max(0, currentHP - newHP);

  const fmt = (n) => {
    const v = Number(n ?? 0) || 0;
    return v >= 0 ? `+${v}` : `${v}`;
  };

  const summarizeAEs = (entries, target) => {
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(e => e?.target === target)
      .map(e => {
        const value = Number(e?.value ?? 0) || 0;
        if (!value) return null;
        return { label: String(e?.label ?? "Effect"), value };
      })
      .filter(Boolean);
  };

  const attackerDealtEntries = summarizeAEs(ctx.options?.aeBreakdown?.attacker, "damage.dealt");
  const attackerPenEntries = summarizeAEs(ctx.options?.aeBreakdown?.attacker, "penetration");
  const defenderTakenEntries = summarizeAEs(ctx.options?.aeBreakdown?.defender, "damage.taken");
  const defenderMitEntries = summarizeAEs(ctx.options?.aeBreakdown?.defender, "mitigation.flat");

  const renderEntryLines = (title, entries, signFmt = fmt) => {
    if (!Array.isArray(entries) || !entries.length) return "";
    const lines = entries.map(e => `<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">${title}: ${e.label} ${signFmt(e.value)}</span></div>`);
    return lines.join("");
  };

  const renderReductionProvenance = (r) => {
    const red = r?.reductions ?? {};
    const ae = red?.ae ?? null;

    const lines = [];

    // --- Armor ---
    const armorBase = Number(red?.armor ?? 0) || 0;
    if (armorBase) {
      const armorSources = listArmorSourcesForLocation(updateTarget, hitLocation);
      if (armorSources.length) {
        const src = armorSources.map(a => `${a.name} (${a.ar})`).join(", ");
        lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">AR (armor): ${src}</span></div>`);
      } else {
        lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">AR (armor): ${armorBase}</span></div>`);
      }
    }

    if (ae?.armorRating && ((ae.armorRating.global?.total ?? 0) || (ae.armorRating.location?.total ?? 0))) {
      const bits = [];
      if (ae.armorRating.global?.total) bits.push(`Global ${fmt(ae.armorRating.global.total)}`);
      if (ae.armorRating.location?.total) bits.push(`${ae.armorRating.location.key} ${fmt(ae.armorRating.location.total)}`);
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">AR AE: ${bits.join(" • ")}</span></div>`);
      lines.push(renderEntryLines("AR", ae.armorRating.global?.entries));
      lines.push(renderEntryLines("AR", ae.armorRating.location?.entries));
    }

    // --- Resistance ---
    const resistanceBase = Number(red?.resistance ?? 0) || 0;
    if (r?.damageType && String(r.damageType) !== "physical" && resistanceBase) {
      const resKeyByType = {
        fire: "fireR",
        frost: "frostR",
        shock: "shockR",
        poison: "poisonR",
        magic: "magicR",
        silver: "silverR",
        sunlight: "sunlightR",
      };
      const rk = resKeyByType[String(r.damageType).toLowerCase()] ?? "resistance";
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">R (base ${rk}): ${resistanceBase}</span></div>`);
    }

    if (ae?.resistance?.key && ae?.resistance?.total) {
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">R AE (${ae.resistance.key}): ${fmt(ae.resistance.total)}</span></div>`);
      lines.push(renderEntryLines("R", ae.resistance.entries));
    }

    // --- Natural Toughness ---
    const toughnessBase = Number(updateTarget.system?.resistance?.natToughness ?? 0) || 0;
    if (toughnessBase) {
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">T (base natToughness): ${toughnessBase}</span></div>`);
    }

    if (ae?.natToughness?.total) {
      lines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">T AE (natToughness): ${fmt(ae.natToughness.total)}</span></div>`);
      lines.push(renderEntryLines("T", ae.natToughness.entries));
    }

    return lines.filter(Boolean).join("");
  };

  const renderDamageSegments = () => {
    const segs = [];

    for (const r of results) {
      const dtype = String(r.damageType ?? "physical");
      const rawBase = Number(r.rawDamage ?? 0) || 0;

      // Raw composition and provenance
      const rawLines = [];
      if (r.kind === "primary") {
        const wName = String(ctx.options?.weapon?.name ?? "Weapon");
        rawLines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">Weapon: ${wName}</span></div>`);
        if (r.dosBonus) rawLines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">DoS bonus: ${fmt(r.dosBonus)}</span></div>`);
        if (r.weaponBonus) rawLines.push(`<div class="uesrpg-da-row"><span class="k"></span><span class="v muted">Weapon bonus: ${fmt(r.weaponBonus)} (${wName})</span></div>`);
        if (attackerDealtEntries.length) rawLines.push(renderEntryLines("AE dealt", attackerDealtEntries));
        if (attackerPenEntries.length) rawLines.push(renderEntryLines("AE penetration", attackerPenEntries));
      } else {
        // Typed bonus
        const typedEntries = Array.isArray(r.breakdown?.entries) ? r.breakdown.entries : [];
        if (typedEntries.length) {
          const formatted = typedEntries
            .map(e => ({ label: String(e.label ?? "Effect"), value: Number(e.value ?? 0) || 0 }))
            .filter(e => e.value);
          rawLines.push(renderEntryLines(`AE bonus [${dtype}]`, formatted));
        }
      }

      // Defender AE adjustments only apply to primary
      const defLines = [];
      if (r.kind === "primary") {
        if (defenderTakenEntries.length) defLines.push(renderEntryLines("AE taken", defenderTakenEntries));
        if (defenderMitEntries.length) {
          // Mitigation flat is shown as -X
          const mf = defenderMitEntries.map(e => ({ label: e.label, value: -Math.abs(Number(e.value ?? 0) || 0) }));
          defLines.push(renderEntryLines("AE mitigation", mf, (n) => (Number(n) <= 0 ? `${n}` : `+${n}`)));
        }
      }

      const reductionTotal = Number(r.reductions?.total ?? 0) || 0;
      const applied = Number(r.finalApplied ?? 0) || 0;

      segs.push(`
        <div class="uesrpg-da-segment" style="margin-top:8px; padding-top:6px; border-top:1px solid rgba(0,0,0,0.1);">
          <div class="uesrpg-da-row"><span class="k"><strong>${dtype}</strong></span><span class="v"></span></div>
          <div class="uesrpg-da-row"><span class="k">Raw</span><span class="v">${rawBase}</span></div>
          ${rawLines.join("")}
          <div class="uesrpg-da-row"><span class="k">Reduction</span><span class="v">-${reductionTotal}</span></div>
          ${renderReductionProvenance(r)}
          ${defLines.join("")}
          <div class="uesrpg-da-row"><span class="k">Applied</span><span class="v final">${applied}</span></div>
        </div>
      `);
    }

    return segs.join("\n");
  };

  const messageContent = `
    <div class="uesrpg-damage-applied-card">
      <div class="hdr">
        <div class="title">${updateTarget.name}</div>
        <div class="sub">${ctx.options.source ?? "Attack"}${hitLocation ? ` • ${hitLocation}` : ""}</div>
      </div>
      <div class="body">
        <div class="uesrpg-da-row"><span class="k">Total Damage</span><span class="v final">${Math.max(0, Number(totalApplied || 0))}</span></div>
        <div class="uesrpg-da-row"><span class="k">HP</span><span class="v">${newHP} / ${maxHP}${hpDelta ? ` <span class="muted">(-${hpDelta})</span>` : ""}</span></div>
        ${anyWoundTrigger ? `<div class="status wounded">WOUNDED <span class="muted">(WT ${woundThreshold})</span></div>` : ""}
        ${newHP === 0 ? `<div class="status unconscious">UNCONSCIOUS</div>` : ""}
        <details style="margin-top:6px;">
          <summary style="cursor:pointer; user-select:none;">Damage breakdown</summary>
          <div style="margin-top:4px; font-size:12px; opacity:0.95;">${renderDamageSegments()}</div>
        </details>
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: updateTarget }),
    content: messageContent,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    whisper: gmIds,
    blind: true,
  });

  // Preserve expected return shape for callers.
  return {
    actor: updateTarget,
    damage: Math.max(0, Number(totalApplied || 0)),
    components: results,
    oldHP: Number(currentHP || 0),
    newHP,
    woundStatus: (newHP === 0) ? "unconscious" : (anyWoundTrigger ? "wounded" : "uninjured"),
  };
}
