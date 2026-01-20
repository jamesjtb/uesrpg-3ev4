/**
 * src/core/combat/combat-utils.js
 *
 * UESRPG 3e v4 — Combat utilities (Foundry VTT v13).
 *
 * This file was restored after an automated cleanup removed/mismerged the
 * original exports used by the opposed workflow and various sheets.
 *
 * Design constraints:
 *  - No schema changes
 *  - Deterministic, defensive behavior
 *  - Prefer explicit system fields when present; fall back to qualities/traits
 */

import { DAMAGE_TYPES } from "./damage-automation.js";

const _KNOWN_DAMAGE_TYPES = new Set(Object.values(DAMAGE_TYPES).map((v) => String(v).toLowerCase()));

/**
 * Infer damage type from a weapon item.
 *
 * Priority order:
 *  1) Explicit system fields (damageType, damage_type, damage_typeEffective, etc.)
 *  2) Structured qualities / traits containing a known damage type token
 *  3) Default to physical
 *
 * @param {Item|null} weapon
 * @returns {string} One of DAMAGE_TYPES.* values (lowercase string).
 */
export function getDamageTypeFromWeapon(weapon) {
  if (!weapon) return DAMAGE_TYPES.PHYSICAL;

  const sys = weapon.system ?? {};

  // 1) Explicit fields (some worlds may have legacy/custom data here).
  const explicitCandidates = [
    sys.damageType,
    sys.damage_type,
    sys.damageTypeEffective,
    sys.damage_typeEffective,
    sys.damage_type_effective,
    sys.damage?.type,
    sys.damage?.damageType,
  ].filter(Boolean);

  for (const c of explicitCandidates) {
    const v = String(c).trim().toLowerCase();
    if (v && _KNOWN_DAMAGE_TYPES.has(v)) return v;
  }

  // 2) Derive from qualities/traits.
  const tokens = [];

  const qInjected = Array.isArray(sys.qualitiesStructuredInjected) ? sys.qualitiesStructuredInjected : null;
  const qBase = Array.isArray(sys.qualitiesStructured) ? sys.qualitiesStructured : null;
  const structured = qInjected ?? qBase ?? [];

  for (const q of structured) {
    if (!q) continue;
    // common shapes: {key}, {name}, string
    if (typeof q === "string") tokens.push(q);
    else {
      if (q.key) tokens.push(q.key);
      if (q.name) tokens.push(q.name);
      if (q.label) tokens.push(q.label);
    }
  }

  const traits = Array.isArray(sys.qualitiesTraits) ? sys.qualitiesTraits : [];
  for (const t of traits) {
    if (!t) continue;
    tokens.push(String(t));
  }

  const normalized = tokens
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);

  // Recognize direct matches first.
  for (const t of normalized) {
    if (_KNOWN_DAMAGE_TYPES.has(t)) return t;
  }

  // Recognize common composite labels (e.g. "fire damage", "magic (x)").
  for (const t of normalized) {
    for (const dt of _KNOWN_DAMAGE_TYPES) {
      if (t.includes(dt)) return dt;
    }
  }

  return DAMAGE_TYPES.PHYSICAL;
}

/**
 * Resolve hit location from a d100 attack roll (or an explicit d10 roll).
 *
 * RAW mapping (Chapter 5: Advanced Mechanics):
 * - Use the ones digit of the attack roll (or a d10; count 10 as 0).
 *   1-5 Body
 *   6   Right Leg
 *   7   Left Leg
 *   8   Right Arm
 *   9   Left Arm
 *   0   Head
 *
 * @param {number} rollTotal
 * @returns {"Body"|"RightLeg"|"LeftLeg"|"RightArm"|"LeftArm"|"Head"}
 */
export function getHitLocationFromRoll(rollTotal) {
  const n = Number(rollTotal);
  const ones = Number.isFinite(n) ? Math.abs(Math.trunc(n)) % 10 : 0;

  switch (ones) {
    case 0: return "Head";
    case 6: return "RightLeg";
    case 7: return "LeftLeg";
    case 8: return "RightArm";
    case 9: return "LeftArm";
    default: return "Body"; // 1-5
  }
}

const _HIT_LOCATION_CANONICAL = new Set(["Head", "Body", "RightArm", "LeftArm", "RightLeg", "LeftLeg"]);

/**
 * Normalize a hit location string (chat cards / UI inputs / legacy values).
 *
 * Accepts:
 * - Canonical keys: Head, Body, RightArm, LeftArm, RightLeg, LeftLeg
 * - Human labels: "Right Arm", "Left Leg", etc.
 * - Legacy tokens: r_arm, l_leg, etc.
 * - Digit strings: "0"-"9" (mapped via getHitLocationFromRoll semantics)
 *
 * @param {Actor|null} _targetActor currently unused (reserved for future coverage checks)
 * @param {string|number|null} raw
 * @returns {"Head"|"Body"|"RightArm"|"LeftArm"|"RightLeg"|"LeftLeg"}
 */
export function resolveHitLocationForTarget(_targetActor, raw) {
  if (raw === null || raw === undefined || raw === "") return "Body";

  // If a numeric digit was provided (e.g. from UI), apply RAW digit mapping.
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return getHitLocationFromRoll(raw);
  }

  const s0 = String(raw).trim();
  if (!s0) return "Body";

  // Digit string support ("10" counts as 0).
  if (/^\d+$/.test(s0)) {
    const v = Number(s0);
    if (Number.isFinite(v)) return getHitLocationFromRoll(v);
  }

  // Canonical exact.
  if (_HIT_LOCATION_CANONICAL.has(s0)) return s0;

  const s = s0.toLowerCase().replace(/[_\s-]+/g, "");
  const map = {
    head: "Head",
    body: "Body",
    rightarm: "RightArm",
    leftarm: "LeftArm",
    rightleg: "RightLeg",
    leftleg: "LeftLeg",
    rarm: "RightArm",
    larm: "LeftArm",
    rleg: "RightLeg",
    lleg: "LeftLeg",
  };

  const mapped = map[s];
  if (mapped && _HIT_LOCATION_CANONICAL.has(mapped)) return mapped;

  // Final fallback.
  return "Body";
}
