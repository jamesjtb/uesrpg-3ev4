/**
 * src/core/combat/mitigation.js
 *
 * Canonical mitigation resolvers.
 *
 * Design constraints:
 *  - Foundry v13 only
 *  - No schema changes
 *  - Deterministic and defensive around partial data
 */

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
  if (Number.isFinite(magicBR) && magicBR > 0) return Math.max(0, magicBR);

  // RAW: Magic damage treats Block Rating as half (round up) unless there is a magic BR.
  return Math.max(0, Math.ceil(baseBR / 2));
}
