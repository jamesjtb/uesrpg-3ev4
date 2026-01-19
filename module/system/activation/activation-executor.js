import { requestUpdateDocument } from "../../helpers/authority-proxy.js";
import { OpposedWorkflow } from "../../combat/opposed-workflow.js";
import { getHitLocationFromRoll } from "../../combat/combat-utils.js";
import { getExplicitActiveCombatStyleItem } from "../../combat/combat-style-utils.js";
import { isActorUndead } from "../../traits/trait-registry.js";
import { filterTargetsBySpellRange, getSpellAoEConfig, getSpellRangeType, placeAoETemplateAndCollectTargets } from "../../magic/spell-range.js";

const SYSTEM_ID = "uesrpg-3ev4";
const ACTION_TYPE_LABELS = {
  passive: "Passive",
  free: "Free",
  reaction: "Reaction",
  secondary: "Secondary",
  action: "Action",
  special: "Special"
};

function _num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function _firstNonEmptyString(...values) {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s) return s;
  }
  return "";
}

function _getActorResource(actor, path) {
  try {
    return _num(foundry.utils.getProperty(actor?.system, path));
  } catch {
    return 0;
  }
}

function _getTargetsFromContext(context) {
  const provided = context?.targets;
  if (provided instanceof Set) return Array.from(provided);
  if (Array.isArray(provided)) return provided;
  if (provided) return [provided];
  const targets = game?.user?.targets;
  if (targets instanceof Set) return Array.from(targets);
  return [];
}

function _resolveTokenForActor(actor) {
  const id = actor?.id ?? null;
  if (!id) return null;
  const controlled = canvas?.tokens?.controlled ?? [];
  const match = controlled.find(t => t?.actor?.id === id);
  if (match) return match;
  return canvas?.tokens?.placeables?.find(t => t?.actor?.id === id) ?? null;
}

function _hasEquippedWeapon(actor) {
  if (!actor) return false;
  return actor.items?.some?.(i => i.type === "weapon" && i.system?.equipped === true) ?? false;
}

function _hasEquippedMeleeWeapon(actor) {
  if (!actor) return false;
  return actor.items?.some?.(i => i.type === "weapon" && i.system?.equipped === true && String(i.system?.attackMode ?? "melee") !== "ranged") ?? false;
}

function _hasEquippedRangedWeapon(actor) {
  if (!actor) return false;
  return actor.items?.some?.(i => i.type === "weapon" && i.system?.equipped === true && String(i.system?.attackMode ?? "") === "ranged") ?? false;
}

function _getActivationCostValues(costs = {}) {
  return {
    ap: Math.max(0, _num(costs.action_points)),
    sp: Math.max(0, _num(costs.stamina)),
    mp: Math.max(0, _num(costs.magicka)),
    lp: Math.max(0, _num(costs.luck_points)),
    hp: Math.max(0, _num(costs.health))
  };
}

function _normalizeUsage(activation = {}) {
  const usage = activation.usage ?? null;
  const usagePeriod = String(usage?.period ?? "").trim();
  const usageHasData =
    (usage?.max != null && _num(usage.max) > 0) ||
    (usage?.current != null && _num(usage.current) > 0) ||
    usagePeriod.length > 0;
  if (usage && usageHasData) {
    return {
      source: "usage",
      max: usage.max == null ? null : _num(usage.max),
      period: usagePeriod || null,
      current: _num(usage.current)
    };
  }

  const uses = activation.uses ?? null;
  if (uses && (uses.max != null || uses.reset != null || uses.value != null)) {
    return {
      source: "uses",
      max: uses.max == null ? null : _num(uses.max),
      period: uses.reset ?? null,
      current: _num(uses.value)
    };
  }

  return { source: null, max: null, period: null, current: 0 };
}

function _formatUsagePeriod(period) {
  const key = String(period ?? "").trim();
  if (!key) return "";
  const labels = {
    encounter: "Encounter",
    shortRest: "Short Rest",
    longRest: "Long Rest",
    day: "Day",
    daily: "Daily",
    none: ""
  };
  return labels[key] ?? key;
}

function _shouldConsumeUsage(activation = {}) {
  return activation.consumeUse === true;
}

function _isAttackActivation(activation = {}) {
  const mode = String(activation?.roll?.mode ?? "").toLowerCase().trim();
  return mode === "attack" || activation?.roll?.isAttack === true;
}

function _getHitLocationMode(activation = {}) {
  const mode = String(activation?.roll?.hitLocationMode ?? "roll").toLowerCase().trim();
  return mode === "manual" ? "manual" : "roll";
}

function _getAttackModeFromActivation(activation = {}) {
  const explicit = String(activation?.roll?.attackMode ?? "").toLowerCase().trim();
  if (explicit === "melee" || explicit === "ranged") return explicit;

  const req = activation?.requirements ?? {};
  if (req.requiresRanged) return "ranged";
  if (req.requiresMelee) return "melee";
  return "melee";
}

function _normalizeActivationDamage(activation = {}) {
  const dmg = activation?.damage ?? {};
  const mode = String(dmg.mode ?? "weapon").toLowerCase().trim();
  const allowed = new Set(["weapon", "manual", "healing", "temporary"]);
  if (!allowed.has(mode) || mode === "weapon") return null;
  const structuredRaw = Array.isArray(dmg.qualitiesStructured) ? dmg.qualitiesStructured : [];
  const traitsRaw = Array.isArray(dmg.qualitiesTraits) ? dmg.qualitiesTraits : [];

  const qualitiesStructured = structuredRaw.map((q) => {
    if (!q) return null;
    if (typeof q === "string") {
      const key = String(q).trim();
      return key ? { key } : null;
    }
    const key = String(q.key ?? q.name ?? q.label ?? "").trim();
    if (!key) return null;
    const out = { key };
    if (q.value != null && q.value !== "") {
      const num = Number(q.value);
      if (Number.isFinite(num)) out.value = num;
    }
    return out;
  }).filter(Boolean);

  const qualitiesTraits = traitsRaw
    .map(t => String(t ?? "").trim())
    .filter(Boolean);
  return {
    mode,
    formula: String(dmg.formula ?? "").trim(),
    type: String(dmg.type ?? "").trim().toLowerCase(),
    qualitiesStructured,
    qualitiesTraits
  };
}

function _normalizeActivationTags(activation = {}) {
  const tags = Array.isArray(activation?.roll?.tags) ? activation.roll.tags : [];
  return tags.map(t => String(t ?? "").trim()).filter(Boolean);
}

async function _promptHitLocationChoice({ title = "Select Hit Location", defaultValue = "Body" } = {}) {
  const locations = ["Head", "Body", "Right Arm", "Left Arm", "Right Leg", "Left Leg"];
  const options = locations.map((loc) => {
    const selected = loc === defaultValue ? " selected" : "";
    return `<option value="${loc}"${selected}>${loc}</option>`;
  }).join("\n");

  const content = `
    <form class="uesrpg-hit-location-choice">
      <div class="form-group">
        <label><b>Hit Location</b></label>
        <select name="hitLocation">${options}</select>
      </div>
    </form>
  `;

  return await new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        ok: {
          label: "Confirm",
          callback: (html) => {
            const val = html.find('select[name="hitLocation"]').val();
            resolve(String(val ?? "").trim() || null);
          }
        },
        cancel: { label: "Cancel", callback: () => resolve(null) }
      },
      default: "ok",
      close: () => resolve(null)
    }).render(true);
  });
}

function _buildActivationHeader({ label, img, actor, includeImage }) {
  const title = String(label ?? "Activation");
  const header = includeImage && img
    ? `<h2><img src="${img}"</img>${title}</h2>`
    : `<h2>${title}</h2>`;

  const actorLine = actor ? `<div class="uesrpg-activation-actor"><i>${actor.name}</i></div>` : "";
  return `${header}
  ${actorLine}`;
}

function _buildActivationCostsHtml(costs) {
  const costPairs = [];
  const { ap, sp, mp, lp, hp } = _getActivationCostValues(costs);
  if (ap) costPairs.push(`AP: ${ap}`);
  if (sp) costPairs.push(`SP: ${sp}`);
  if (mp) costPairs.push(`MP: ${mp}`);
  if (lp) costPairs.push(`LP: ${lp}`);
  if (hp) costPairs.push(`HP: ${hp}`);

  return costPairs.length
    ? `<div class="uesrpg-activation-costs"><b>Costs:</b> ${costPairs.join(", ")}</div>`
    : "";
}

function _buildItemDescriptionHtml({ item, includeImage }) {
  if (!item) return "";
  if (includeImage) {
    return `<h2><img src="${item.img}"</img>${item.name}</h2>
    <i><b>${item.type}</b></i><p>
      <i>${item.system.description}</i>`;
  }
  return `<h2>${item.name}</h2><p>
  <i><b>${item.type}</b></i><p>
    <i>${item.system.description}</i>`;
}

async function _applyActivationActorFlags({ item, actor, activation } = {}) {
  if (!item || !actor) return { ok: true, applied: false };
  if (item.type !== "trait") return { ok: true, applied: false };
  if (String(actor?.type ?? "").toLowerCase().trim() !== "npc") return { ok: true, applied: false };

  const flags = activation?.flags ?? {};
  const updateData = {};

  if (flags.npcLuckAllowed === true) {
    updateData[`flags.${SYSTEM_ID}.npcLuckAllowed`] = true;
  }
  if (flags.npcEliteAllowed === true) {
    updateData[`flags.${SYSTEM_ID}.npcEliteAllowed`] = true;
  }

  if (!Object.keys(updateData).length) return { ok: true, applied: false };

  const ok = await requestUpdateDocument(actor, updateData);
  if (!ok) {
    ui.notifications?.warn?.(`Failed to apply NPC rule flags for ${item.name}.`);
    return { ok: false, applied: false };
  }

  return { ok: true, applied: true };
}

export function getActivationActionTypeLabel(actionType) {
  const key = String(actionType ?? "action");
  return ACTION_TYPE_LABELS[key] ?? key;
}

export function validateActivationContext({ actor, activation, context = {} } = {}) {
  const req = activation?.requirements ?? {};
  const targets = _getTargetsFromContext(context);

  if (req.requiresTarget && targets.length === 0) {
    ui.notifications?.warn?.("This ability requires a target.");
    return { ok: false, reason: "requiresTarget" };
  }

  if (req.requiresEquippedWeapon && !_hasEquippedWeapon(actor)) {
    ui.notifications?.warn?.("This ability requires an equipped weapon.");
    return { ok: false, reason: "requiresEquippedWeapon" };
  }

  if (req.requiresMelee && !_hasEquippedMeleeWeapon(actor)) {
    ui.notifications?.warn?.("This ability requires an equipped melee weapon.");
    return { ok: false, reason: "requiresMelee" };
  }

  if (req.requiresRanged && !_hasEquippedRangedWeapon(actor)) {
    ui.notifications?.warn?.("This ability requires an equipped ranged weapon.");
    return { ok: false, reason: "requiresRanged" };
  }

  if (req.requiresHitLocation && !context?.hitLocation) {
    ui.notifications?.warn?.("This ability requires a hit location.");
    return { ok: false, reason: "requiresHitLocation" };
  }

  return { ok: true };
}

export async function applyActivationCosts({ actor, activation, label = "Ability" } = {}) {
  if (!activation?.spendCosts) return { ok: true, spent: false };
  if (!actor) return { ok: false, spent: false };

  const { ap: apCost, sp: spCost, mp: mpCost, lp: lpCost, hp: hpCost } = _getActivationCostValues(activation.costs ?? {});
  if (!apCost && !spCost && !mpCost && !lpCost && !hpCost) return { ok: true, spent: false };

  const ap = _getActorResource(actor, "action_points.value");
  const sp = _getActorResource(actor, "stamina.value");
  const mp = _getActorResource(actor, "magicka.value");
  const lp = _getActorResource(actor, "luck_points.value");
  const hp = _getActorResource(actor, "hp.value");

  const missing = [];
  if (ap < apCost) missing.push("AP");
  if (sp < spCost) missing.push("SP");
  if (!missing.length && spCost > 0 && isActorUndead(actor) && (sp - spCost) < 0) {
    ui.notifications?.warn?.(`Undead cannot spend SP below 0 for ${label}.`);
    return { ok: false, spent: false };
  }
  if (mp < mpCost) missing.push("MP");
  if (lp < lpCost) missing.push("LP");
  if (hp < hpCost) missing.push("HP");

  if (missing.length) {
    ui.notifications?.warn?.(`Insufficient resources to activate ${label}: ${missing.join(", ")}`);
    return { ok: false, spent: false };
  }

  const updateData = {};
  if (apCost) updateData["system.action_points.value"] = ap - apCost;
  if (spCost) updateData["system.stamina.value"] = sp - spCost;
  if (mpCost) updateData["system.magicka.value"] = mp - mpCost;
  if (lpCost) updateData["system.luck_points.value"] = lp - lpCost;
  if (hpCost) updateData["system.hp.value"] = hp - hpCost;

  const ok = await requestUpdateDocument(actor, updateData);
  if (!ok) {
    ui.notifications?.warn?.(`Failed to spend activation costs for ${label}.`);
    return { ok: false, spent: false };
  }
  return { ok: true, spent: true };
}

export async function consumeActivationUsage({ item, activation } = {}) {
  if (!item) return { ok: true, consumed: false, previous: null, current: null, source: null };
  if (!_shouldConsumeUsage(activation)) return { ok: true, consumed: false, previous: null, current: null, source: null };

  const usage = _normalizeUsage(activation);
  if (!usage.source) return { ok: true, consumed: false, previous: null, current: null, source: null };

  const current = Math.max(0, _num(usage.current));
  if (current <= 0) {
    ui.notifications?.warn?.(`No uses remaining for ${item.name}.`);
    return { ok: false, consumed: false, previous: null, current: null, source: usage.source };
  }

  const nextValue = current - 1;
  const updateData = {};
  const rollbackData = {};

  if (usage.source === "usage") {
    updateData["system.activation.usage.current"] = nextValue;
    rollbackData["system.activation.usage.current"] = current;

    const legacy = activation?.uses ?? null;
    const hasLegacy = legacy && (legacy.max != null || legacy.reset != null || legacy.value != null);
    if (hasLegacy) {
      updateData["system.activation.uses.value"] = nextValue;
      rollbackData["system.activation.uses.value"] = _num(legacy.value);
      if (usage.max != null) {
        updateData["system.activation.uses.max"] = usage.max;
        rollbackData["system.activation.uses.max"] = legacy.max ?? 0;
      }
      const p = String(usage.period ?? "").trim();
      const legacyReset = (p === "shortRest" || p === "longRest" || p === "daily" || p === "none")
        ? p
        : (p === "day" ? "daily" : null);
      if (legacyReset) {
        updateData["system.activation.uses.reset"] = legacyReset;
        rollbackData["system.activation.uses.reset"] = legacy.reset ?? "none";
      }
    }
  } else {
    updateData["system.activation.uses.value"] = nextValue;
    rollbackData["system.activation.uses.value"] = current;

    const prevUsage = activation?.usage ?? {};
    updateData["system.activation.usage.current"] = nextValue;
    rollbackData["system.activation.usage.current"] = _num(prevUsage.current);
    if (usage.max != null) {
      updateData["system.activation.usage.max"] = usage.max;
      rollbackData["system.activation.usage.max"] = prevUsage.max ?? 0;
    }
    if (usage.period != null) {
      updateData["system.activation.usage.period"] = usage.period;
      rollbackData["system.activation.usage.period"] = prevUsage.period ?? "";
    }
  }

  const ok = await requestUpdateDocument(item, updateData);
  if (!ok) {
    ui.notifications?.warn?.(`Failed to consume a use for ${item.name}.`);
    return { ok: false, consumed: false, previous: null, current: null, source: usage.source };
  }

  return { ok: true, consumed: true, previous: current, current: nextValue, source: usage.source, rollback: rollbackData };
}

export function renderActivationCard({ item = null, actor = null, activation = {}, label = "", includeImage = false, usageOverride = null, textOverride = null } = {}) {
  const renderSimple = Boolean(item && activation?.renderFullCard !== true);
  if (renderSimple) return _buildItemDescriptionHtml({ item, includeImage });

  const actionType = getActivationActionTypeLabel(activation?.actionType ?? "action");
  const header = _buildActivationHeader({
    label: label || item?.name || "Activation",
    img: item?.img ?? null,
    actor,
    includeImage
  });

  const typeLine = item?.type
    ? `<div class="uesrpg-activation-type"><i><b>${item.type}</b></i></div>`
    : "";

  const costsHtml = _buildActivationCostsHtml(activation.costs ?? {});
  const usage = _normalizeUsage(activation);
  const usageCurrent = (usageOverride && usageOverride.consumed && usageOverride.current != null)
    ? usageOverride.current
    : usage.current;
  const usageMax = usage.max;
  const usagePeriod = _formatUsagePeriod(usage.period);

  let usesHtml = "";
  if (usageMax != null && usageMax > 0) {
    usesHtml = `<div class="uesrpg-activation-uses"><b>Uses:</b> ${usageCurrent}/${usageMax}</div>`;
  } else if (usageCurrent > 0) {
    usesHtml = `<div class="uesrpg-activation-uses"><b>Uses:</b> ${usageCurrent}</div>`;
  }

  const resetHtml = usagePeriod
    ? `<div class="uesrpg-activation-reset"><b>Reset:</b> ${usagePeriod}</div>`
    : "";

  const textBlock = textOverride ?? {};
  const shortText = _firstNonEmptyString(textBlock.short, activation?.text?.short);
  const fullText = _firstNonEmptyString(textBlock.full, activation?.text?.full, item?.system?.description);

  const shortHtml = shortText ? `<div class="uesrpg-activation-summary"><i>${shortText}</i></div>` : "";
  const fullHtml = fullText ? `<div class="uesrpg-activation-desc"><i>${fullText}</i></div>` : "";

  return `${header}
  ${typeLine}
  <div class="uesrpg-activation-meta"><b>Activation:</b> ${actionType}</div>
  ${costsHtml}
  ${usesHtml}
  ${resetHtml}
  ${shortHtml}
  <hr />
  ${fullHtml}`;
}

export async function executeActivation({
  actor,
  activation,
  label = "Ability",
  includeImage = false,
  event = null,
  renderChat = true,
  context = {},
  textOverride = null
} = {}) {
  if (!activation) return { ok: false };
  if (activation.enabled === false) return { ok: false };

  const validation = validateActivationContext({ actor, activation, context });
  if (!validation.ok) return { ok: false };

  const spendResult = await applyActivationCosts({ actor, activation, label });
  if (!spendResult.ok) return { ok: false };

  if (renderChat) {
    const content = renderActivationCard({
      item: null,
      actor,
      activation,
      label,
      includeImage,
      textOverride
    });
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });
  }

  return { ok: true };
}

async function _prepareAttackActivationContext({ actor, item, activation, context = {} } = {}) {
  if (!actor) {
    ui.notifications?.warn?.("Attack activation requires an owning actor.");
    return { ok: false };
  }

  const rangeType = item ? getSpellRangeType(item) : "none";
  const attackerToken = _resolveTokenForActor(actor);
  let workingTargets = _getTargetsFromContext(context);
  let aoeTemplateUuid = null;
  let aoeTemplateId = null;

  if ((rangeType === "ranged" || rangeType === "melee" || rangeType === "aoe") && !attackerToken) {
    ui.notifications?.warn?.("Please place and select a token for this actor.");
    return { ok: false };
  }

  if (rangeType === "aoe") {
    const includeCaster = Boolean(item?.system?.aoeIncludeCaster);
    const placed = await placeAoETemplateAndCollectTargets({
      casterToken: attackerToken,
      spell: item,
      includeCaster
    });
    if (!placed) return { ok: false };
    const templateDoc = placed?.templateDoc ?? null;
    aoeTemplateId = templateDoc?.id ?? templateDoc?._id ?? null;
    aoeTemplateUuid = templateDoc?.uuid
      ?? (aoeTemplateId && canvas?.scene?.id ? `Scene.${canvas.scene.id}.MeasuredTemplate.${aoeTemplateId}` : null);
    if (placed.targets?.length) {
      workingTargets = placed.targets;
    } else {
      if (!workingTargets.length) {
        ui.notifications?.info?.("No tokens are affected by the template.");
        workingTargets = [];
      }
    }
  } else if (rangeType === "ranged" || rangeType === "melee") {
    if (workingTargets.length) {
      const res = filterTargetsBySpellRange({
        casterToken: attackerToken,
        targets: workingTargets,
        spell: item
      }) ?? {};

      const validTargets = Array.isArray(res.validTargets) ? res.validTargets : [];
      const rejected = Array.isArray(res.rejected) ? res.rejected : [];
      const maxRange = Number.isFinite(Number(res.maxRange)) ? Number(res.maxRange) : null;

      if (rejected.length) {
        const names = rejected.map((r) => r?.token?.name ?? r?.token?.document?.name ?? "Target").join(", ");
        const rangeLabel = (maxRange != null) ? `${maxRange}m` : "range";
        ui.notifications?.warn?.(`Targets out of range (${rangeLabel}): ${names}`);
      }

      workingTargets = validTargets;
    }
  }

  workingTargets = Array.from(workingTargets ?? []).filter(t => t?.actor);
  if (!workingTargets.length) {
    ui.notifications?.warn?.("This attack requires a target.");
    return { ok: false };
  }

  const hitLocationMode = _getHitLocationMode(activation);
  let hitLocationRaw = null;
  if (rangeType === "aoe") {
    hitLocationRaw = "Body";
  } else if (hitLocationMode === "manual") {
    hitLocationRaw = await _promptHitLocationChoice({ title: "Select Hit Location" });
    if (!hitLocationRaw) return { ok: false };
  } else {
    const roll = new Roll("1d10");
    await roll.evaluate();
    hitLocationRaw = getHitLocationFromRoll(roll.total);
  }

  const attackMode = _getAttackModeFromActivation(activation);
  const aoeConfig = (rangeType === "aoe")
    ? {
        ...(getSpellAoEConfig(item) ?? {}),
        isAoE: true,
        templateUuid: aoeTemplateUuid ?? null,
        templateId: aoeTemplateId ?? null
      }
    : null;

  return {
    ok: true,
    attackerToken,
    defenderToken: workingTargets[0] ?? null,
    defenderActor: workingTargets[0]?.actor ?? null,
    targets: workingTargets,
    attackMode,
    hitLocation: hitLocationRaw,
    isAoE: rangeType === "aoe",
    aoe: aoeConfig,
    context: {
      targets: workingTargets,
      hitLocation: hitLocationRaw,
      isAoE: rangeType === "aoe",
      aoe: aoeConfig
    }
  };
}

async function _startAttackWorkflow({ actor, item, activation, attackContext } = {}) {
  const attackerToken = attackContext?.attackerToken ?? _resolveTokenForActor(actor);
  if (!attackerToken) {
    ui.notifications?.warn?.("Please place and select a token for this actor.");
    return false;
  }

  const defenderTokens = Array.isArray(attackContext?.targets)
    ? attackContext.targets
    : (attackContext?.defenderToken ? [attackContext.defenderToken] : []);
  if (!defenderTokens.length) {
    ui.notifications?.warn?.("Please target an enemy token.");
    return false;
  }

  const attackMode = attackContext?.attackMode ?? _getAttackModeFromActivation(activation);
  const fatiguePenalty = Number(actor?.system?.fatigue?.penalty ?? 0) || 0;
  const carryPenalty = Number(actor?.system?.carry_rating?.penalty ?? 0) || 0;
  const woundPenalty = Number(actor?.system?.woundPenalty ?? 0) || 0;

  let attackerItemUuid = null;
  let attackerLabel = item?.name ?? "Attack";
  let attackerTarget = 0;

  if (String(actor?.type ?? "") === "NPC") {
    const base = Number(actor?.system?.professions?.combat ?? 0) || 0;
    attackerTarget = base + fatiguePenalty + carryPenalty + woundPenalty;
    attackerItemUuid = "prof:combat";
  } else {
    const style = getExplicitActiveCombatStyleItem(actor) ?? actor?.items?.find?.(i => i.type === "combatStyle") ?? null;
    if (!style) {
      ui.notifications?.warn?.("No Combat Style found on this actor.");
      return false;
    }
    const base = Number(style?.system?.value ?? 0) || 0;
    attackerTarget = base + fatiguePenalty + carryPenalty + woundPenalty;
    attackerItemUuid = style.uuid;
    attackerLabel = `${attackerLabel} - ${style.name}`;
  }

  const activationDamage = _normalizeActivationDamage(activation);
  const activationTags = _normalizeActivationTags(activation);
  const activationContext = (activationDamage || activationTags.length)
    ? {
        itemUuid: item?.uuid ?? null,
        itemName: item?.name ?? null,
        itemImg: item?.img ?? null,
        damage: activationDamage,
        tags: activationTags
      }
    : null;

  await OpposedWorkflow.createPending({
    attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
    defenderTokenUuids: defenderTokens.map(t => t?.document?.uuid ?? t?.uuid).filter(Boolean),
    attackerActorUuid: actor.uuid,
    attackerItemUuid,
    attackerLabel,
    attackerTarget,
    mode: "attack",
    attackMode,
    forcedHitLocation: attackContext?.hitLocation ?? null,
    aoe: attackContext?.aoe ?? null,
    isAoE: Boolean(attackContext?.isAoE),
    activation: activationContext
  });

  return true;
}

export async function executeItemActivation({
  item,
  actor,
  includeImage = false,
  event = null,
  renderChat = true,
  context = {}
} = {}) {
  if (!item) return { ok: false };

  const activation = item?.system?.activation ?? {};
  if (activation.enabled === false) return { ok: false };
  const isAttack = _isAttackActivation(activation);
  const label = item?.name ?? "Ability";

  let attackContext = null;
  let mergedContext = context;
  if (isAttack) {
    attackContext = await _prepareAttackActivationContext({ actor, item, activation, context });
    if (!attackContext?.ok) return { ok: false };
    mergedContext = { ...(context ?? {}), ...(attackContext.context ?? {}) };
  }

  const validation = validateActivationContext({ actor, activation, context: mergedContext });
  if (!validation.ok) return { ok: false };

  const usageResult = await consumeActivationUsage({ item, activation });
  if (!usageResult.ok) return { ok: false };

  const spendResult = await applyActivationCosts({ actor, activation, label });
  if (!spendResult.ok) {
    if (usageResult.consumed && usageResult.rollback && Object.keys(usageResult.rollback).length) {
      const rolledBack = await requestUpdateDocument(item, usageResult.rollback);
      if (!rolledBack) ui.notifications?.warn?.(`Failed to restore uses for ${item.name}.`);
    }
    return { ok: false };
  }

  await _applyActivationActorFlags({ item, actor, activation });

  if (renderChat) {
    const content = renderActivationCard({
      item,
      actor,
      activation,
      label,
      includeImage,
      usageOverride: usageResult
    });
    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content
    });
  }

  if (item) await executeItemMacroBestEffort(item, { event });
  if (isAttack) {
    const ok = await _startAttackWorkflow({ actor, item, activation, attackContext });
    if (!ok) return { ok: false };
  }
  return { ok: true };
}

export async function executeItemMacroBestEffort(item, { event } = {}) {
  try {
    const itemMacroActive = game.modules.get("itemacro")?.active;
    const canExecute = itemMacroActive && typeof item.executeMacro === "function" && typeof item.hasMacro === "function" && item.hasMacro();
    if (canExecute) await item.executeMacro({ event });
  } catch (err) {
    console.warn("uesrpg-3ev4 | ItemMacro execution failed", err);
  }
}

export function buildSpecialActionActivation({ actionType = "action", apCost = 1, requiresTarget = true } = {}) {
  const mappedType = (actionType === "secondary" || actionType === "reaction" || actionType === "free")
    ? actionType
    : "action";

  return {
    enabled: true,
    actionType: mappedType,
    spendCosts: true,
    consumeUse: false,
    costs: {
      action_points: Math.max(0, _num(apCost)),
      stamina: 0,
      magicka: 0,
      luck_points: 0,
      health: 0
    },
    requirements: {
      requiresTarget: Boolean(requiresTarget),
      requiresEquippedWeapon: false,
      requiresMelee: false,
      requiresRanged: false,
      requiresHitLocation: false
    }
  };
}
