const DAMAGE_TYPE_MAP = {
  fire: { label: "Fire", resistanceKey: "fireR", damageType: "fire" },
  frost: { label: "Frost", resistanceKey: "frostR", damageType: "frost" },
  shock: { label: "Shock", resistanceKey: "shockR", damageType: "shock" },
  poison: { label: "Poison", resistanceKey: "poisonR", damageType: "poison" },
  magic: { label: "Magic", resistanceKey: "magicR", damageType: "magic" },
  silver: { label: "Silver", resistanceKey: "silverR", damageType: "silver" },
  sunlight: { label: "Sunlight", resistanceKey: "sunlightR", damageType: "sunlight" },
  disease: { label: "Disease", resistanceKey: "diseaseR", damageType: "disease" }
};

const CATEGORY_KEYS = ["resistance", "weakness", "immunity"];

export const TRAIT_REGISTRY = {
  resistance: { label: "Resistance", types: DAMAGE_TYPE_MAP },
  weakness: { label: "Weakness", types: DAMAGE_TYPE_MAP },
  immunity: { label: "Immunity", types: DAMAGE_TYPE_MAP }
};

function _normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function _normalizeToken(value) {
  return _normalizeKey(value).replace(/[\s._-]+/g, "");
}

function _normalizeCategory(value) {
  const key = _normalizeKey(value).replace(/[\s_-]+/g, "");
  return CATEGORY_KEYS.includes(key) ? key : "";
}

function _normalizeType(value) {
  const raw = _normalizeKey(value).replace(/[\s_-]+/g, "");
  if (!raw) return "";
  for (const key of Object.keys(DAMAGE_TYPE_MAP)) {
    if (key.replace(/[\s_-]+/g, "") === raw) return key;
  }
  return "";
}

function _parseTraitKey(traitKey = "", traitParam = "") {
  const keyRaw = _normalizeKey(traitKey).replace(/[/:]+/g, ".");
  const paramRaw = _normalizeKey(traitParam);
  if (!keyRaw && !paramRaw) return null;

  let category = "";
  let type = "";

  if (keyRaw.includes(".")) {
    const [cat, ...rest] = keyRaw.split(".");
    category = _normalizeCategory(cat);
    type = _normalizeType(rest.join("."));
  } else {
    category = _normalizeCategory(keyRaw);
    type = _normalizeType(paramRaw);
  }

  if (!category || !type) return null;
  const def = DAMAGE_TYPE_MAP[type];
  if (!def) return null;

  return { category, type, def };
}

function _isIncorporealTrait(traitKey = "", traitParam = "") {
  const keyRaw = _normalizeKey(traitKey).replace(/[/:]+/g, ".");
  const parts = keyRaw.split(".").filter(Boolean);
  if (parts.includes("incorporeal")) return true;
  return _normalizeKey(traitParam) === "incorporeal";
}

function _getTraitSignature(item) {
  const keyRaw = _normalizeKey(item?.system?.traitKey ?? "").replace(/[/:]+/g, ".");
  const paramRaw = _normalizeKey(item?.system?.traitParam ?? "");
  return {
    keyRaw,
    paramRaw,
    keyFlat: _normalizeToken(keyRaw),
    paramFlat: _normalizeToken(paramRaw),
  };
}

function _matchesTraitSignature(sig, key, param = null) {
  const desiredKeyRaw = _normalizeKey(key).replace(/[/:]+/g, ".");
  const desiredKeyFlat = _normalizeToken(desiredKeyRaw);
  if (!desiredKeyFlat) return false;

  if (param != null && param !== "") {
    const desiredParamRaw = _normalizeKey(param);
    const desiredParamFlat = _normalizeToken(desiredParamRaw);
    if (!desiredParamFlat) return false;

    if (sig.keyFlat === desiredKeyFlat && sig.paramFlat === desiredParamFlat) return true;
    if (sig.keyFlat === `${desiredKeyFlat}${desiredParamFlat}`) return true;
    if (sig.keyRaw === `${desiredKeyRaw}.${desiredParamRaw}`) return true;
    return false;
  }

  if (sig.keyFlat === desiredKeyFlat) return true;
  if (sig.paramFlat === desiredKeyFlat) return true;
  if (sig.keyRaw.split(".").includes(desiredKeyRaw)) return true;
  return false;
}

function _buildEmptyProfile() {
  const base = {
    resistance: {},
    weakness: {},
    immunity: {},
    flags: { incorporeal: false, undead: false, skeletal: false, undeadBloodless: false }
  };
  for (const key of Object.keys(DAMAGE_TYPE_MAP)) {
    base.resistance[key] = 0;
    base.weakness[key] = 0;
    base.immunity[key] = false;
  }
  return base;
}

export function getResistanceKeyForTraitType(typeKey) {
  return DAMAGE_TYPE_MAP[typeKey]?.resistanceKey ?? null;
}

export function collectTraitDamageModifiers(items = []) {
  const profile = _buildEmptyProfile();
  const list = Array.isArray(items) ? items : Array.from(items ?? []);

  for (const item of list) {
    if (!item) continue;
    const itemType = String(item.type ?? "");
    if (!["trait", "talent", "power"].includes(itemType)) continue;

    const traitKey = item.system?.traitKey ?? "";
    const traitParam = item.system?.traitParam ?? "";
    if (_isIncorporealTrait(traitKey, traitParam)) {
      profile.flags.incorporeal = true;
      continue;
    }

    const sig = _getTraitSignature(item);
    if (_matchesTraitSignature(sig, "undead")) {
      profile.flags.undead = true;
      if (_matchesTraitSignature(sig, "undead", "bloodless")) {
        profile.flags.undeadBloodless = true;
      }
    }
    if (_matchesTraitSignature(sig, "skeletal")) {
      profile.flags.skeletal = true;
    }
    if (_matchesTraitSignature(sig, "undead", "bloodless")) {
      profile.flags.undeadBloodless = true;
    }

    const resolved = _parseTraitKey(traitKey, traitParam);
    if (!resolved) continue;

    const { category, type } = resolved;
    const value = Number(item.system?.traitValue);

    if (category === "immunity") {
      profile.immunity[type] = true;
      continue;
    }

    if (!Number.isFinite(value) || value === 0) continue;
    profile[category][type] = (Number(profile[category][type] ?? 0) || 0) + value;
  }

  return profile;
}

export function getActorTraitDamageProfile(actor) {
  const profile = actor?.system?.ui?.traitAutomation;
  if (profile && typeof profile === "object") return profile;
  return collectTraitDamageModifiers(actor?.items ?? []);
}

export function isActorImmuneToDamageType(actor, damageType) {
  const key = _normalizeType(damageType);
  if (!key) return false;
  if ((key === "poison" || key === "disease") && isActorUndead(actor)) return true;
  const profile = getActorTraitDamageProfile(actor);
  return profile?.immunity?.[key] === true;
}

export function isActorIncorporeal(actor) {
  const profile = getActorTraitDamageProfile(actor);
  return profile?.flags?.incorporeal === true;
}

export function isActorSkeletal(actor) {
  const profile = getActorTraitDamageProfile(actor);
  return profile?.flags?.skeletal === true;
}

export function isActorUndead(actor) {
  const profile = getActorTraitDamageProfile(actor);
  return profile?.flags?.undead === true || profile?.flags?.skeletal === true;
}

export function isActorUndeadBloodless(actor) {
  const profile = getActorTraitDamageProfile(actor);
  return profile?.flags?.undeadBloodless === true;
}

export function hasActorTrait(actor, key, { param = null } = {}) {
  if (!actor) return false;
  for (const item of (actor.items ?? [])) {
    if (!item) continue;
    if (!["trait", "talent", "power"].includes(String(item.type ?? ""))) continue;
    const sig = _getTraitSignature(item);
    if (_matchesTraitSignature(sig, key, param)) return true;
  }
  return false;
}

export function getActorTraitValue(actor, key, { param = null, mode = "sum" } = {}) {
  if (!actor) return 0;
  const useMax = String(mode ?? "sum").toLowerCase() === "max";
  let total = 0;
  let max = 0;
  let found = false;

  for (const item of (actor.items ?? [])) {
    if (!item) continue;
    if (!["trait", "talent", "power"].includes(String(item.type ?? ""))) continue;
    const sig = _getTraitSignature(item);
    if (!_matchesTraitSignature(sig, key, param)) continue;
    const value = Number(item.system?.traitValue);
    if (!Number.isFinite(value)) continue;
    found = true;
    if (useMax) {
      if (value > max) max = value;
    } else {
      total += value;
    }
  }

  return useMax ? (found ? max : 0) : total;
}

export function getDiseaseResistancePercent(actor) {
  const legacy = Number(actor?.system?.resistance?.diseaseR ?? 0) || 0;
  const traitValue = getActorTraitValue(actor, "diseaseResistance", { mode: "sum" });
  const total = Math.max(0, legacy + Number(traitValue || 0));
  return Math.min(100, total);
}

export function getResistanceBonusOptions(actor) {
  const profile = getActorTraitDamageProfile(actor);
  const resist = profile?.resistance ?? {};
  const out = [];

  for (const [typeKey, def] of Object.entries(DAMAGE_TYPE_MAP)) {
    const value = Number(resist?.[typeKey] ?? 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({
      key: typeKey,
      label: def?.label ?? typeKey,
      value,
      bonus: value * 10
    });
  }

  return out;
}
