/**
 * module/combat/mitigation.js
 *
 * Canonical mitigation resolvers (pre-Active Effects).
 *
 * Design constraints:
 *  - Foundry v13 only
 *  - No schema changes
 *  - Deterministic and defensive around partial data
 */

import { getDamageReduction, DAMAGE_TYPES } from "./damage-automation.js";

const LOCATION_MAP = {
  Head: { key: "Head", label: "Head" },
  Body: { key: "Body", label: "Body" },
  "Right Arm": { key: "RightArm", label: "Right Arm" },
  "Left Arm": { key: "LeftArm", label: "Left Arm" },
  "Right Leg": { key: "RightLeg", label: "Right Leg" },
  "Left Leg": { key: "LeftLeg", label: "Left Leg" },
  RightArm: { key: "RightArm", label: "Right Arm" },
  LeftArm: { key: "LeftArm", label: "Left Arm" },
  RightLeg: { key: "RightLeg", label: "Right Leg" },
  LeftLeg: { key: "LeftLeg", label: "Left Leg" },
};

export function normalizeHitLocation(hitLocation) {
  const raw = String(hitLocation ?? "Body").trim();
  return LOCATION_MAP[raw] ?? LOCATION_MAP.Body;
}

/**
 * Get effective Armor Rating at a hit location.
 * Penetration is applied to armor only (consistent with damage automation).
 */
export function getArmorValue(actor, hitLocation, { penetration = 0 } = {}) {
  if (!actor) return 0;
  const loc = normalizeHitLocation(hitLocation).label;
  const red = getDamageReduction(actor, DAMAGE_TYPES.PHYSICAL, loc);
  const base = Number(red?.armor ?? 0) || 0;
  const pen = Number(penetration ?? 0) || 0;
  return Math.max(0, base - pen);
}

/**
 * Determine effective Block Rating (BR) for a shield vs incoming damage type.
 * Prefers derived fields computed in Item#prepareData when present.
 */
export function getBlockValue(shield, damageType = "physical") {
  if (!shield) return 0;

  const sys = shield.system ?? {};
  const dt = String(damageType || "physical").toLowerCase();

  const baseBR = Number(sys.blockRatingEffective ?? sys.blockRating ?? 0);
  if (!Number.isFinite(baseBR)) return 0;

  // Physical: base BR.
  if (dt === "physical") return Math.max(0, baseBR);

  // Magic/Elemental: prefer special vs an element.
  const special = sys.magic_brSpecial;
  if (special && String(special.type || "").toLowerCase() === dt) {
    const v = Number(special.value ?? 0);
    return Math.max(0, Number.isFinite(v) ? v : 0);
  }

  const magicBR = Number(sys.magic_brEffective ?? sys.magic_br ?? 0);
  return Math.max(0, Number.isFinite(magicBR) ? magicBR : 0);
}
