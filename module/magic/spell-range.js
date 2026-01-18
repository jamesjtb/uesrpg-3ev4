/**
 * module/magic/spell-range.js
 *
 * Range gating and AoE template placement for spell casting.
 * Target: Foundry VTT v13.351.
 *
 * This module is intentionally conservative:
 * - No schema migrations.
 * - Deterministic gating: block out-of-range casts before AP/MP spend or rolls.
 * - AoE placement uses a lightweight preview loop (mouse-move + wheel rotate) and only
 *   persists the MeasuredTemplate on confirm.
 */

function _str(v) {
  return v === undefined || v === null ? "" : String(v);
}

function _num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a meters value from free-text.
 * Accepts: "100", "100m", "100 m", "100 meters", "100m (something)".
 * @param {string} text
 * @returns {number|null}
 */
export function parseMeters(text) {
  const raw = _str(text).trim();
  if (!raw) return null;

  const m = raw.match(/(\d+(?:\.\d+)?)\s*(m|meter|meters)?/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * Canonical spell range type.
 *
 * This is consumed by actor-sheet.js and npc-sheet.js to decide whether to:
 *  - filter explicit targets by range (ranged/melee), or
 *  - initiate AoE template placement (aoe).
 *
 * Accepted values: "none" | "ranged" | "melee" | "aoe"
 *
 * @param {Item} spell
 * @returns {"none"|"ranged"|"melee"|"aoe"}
 */
export function getSpellRangeType(spell) {
  const sys = spell?.system ?? {};

  // Primary lane: explicit selector field used by the spell sheet.
  const t = _str(sys.rangeType).trim().toLowerCase();
  if (t && ["none", "ranged", "melee", "aoe"].includes(t)) return /** @type any */ (t);

  // Conservative fallback: do NOT attempt to infer range type from free-text.
  // Legacy spells will behave as "none" until configured explicitly.
  // The only exception is when AoE configuration is explicitly present.
  const hasExplicitAoE = Boolean(_str(sys.aoeShape).trim()) || Boolean(_str(sys.aoe?.shape).trim()) || Boolean(sys.aoeSize) || Boolean(sys.aoe?.size);
  if (hasExplicitAoE) return "aoe";

  return "none";
}

/**
 * Get maximum range in meters for a spell.
 * Uses (in order):
 * - spell.system.rangeType + spell.system.rangeValue (new fields)
 * - spell.system.range (legacy free-text)
 * - spell.system.range.value (legacy structured)
 *
 * @param {Item} spell
 * @returns {number|null}
 */
export function getSpellMaxRangeMeters(spell) {
  const sys = spell?.system ?? {};

  // New: explicit range type/value fields (as implemented in prior patches).
  const rangeType = _str(sys.rangeType).toLowerCase();
  const rangeValue = _num(sys.rangeValue, null);

  if (rangeType === "ranged" && Number.isFinite(rangeValue) && rangeValue > 0) return rangeValue;
  if (rangeType === "melee" && Number.isFinite(rangeValue) && rangeValue > 0) return rangeValue;
  if (rangeType === "aoe" && Number.isFinite(rangeValue) && rangeValue > 0) return rangeValue;

  // Legacy: structured
  const legacyValue = _num(sys.range?.value, null);
  if (Number.isFinite(legacyValue) && legacyValue > 0) return legacyValue;

  // Legacy: free text
  const legacyText = _str(sys.range);
  const parsed = parseMeters(legacyText);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  return null;
}

/**
 * AoE config read (tolerant).
 * Expected data (new fields):
 *  - system.aoeShape: "circle"|"cone"|"rect"|"ray" (stored as measured template types: "circle","cone","rect","ray")
 *  - system.aoeSize: number (meters)
 *  - system.aoeWidth: number (meters) for ray/rect
 *  - system.aoePulse: boolean (centered on caster)
 *  - system.aoeIncludeCaster: boolean (include caster in pulse)
 *
 * @param {Item} spell
 * @returns {{shape: string|null, sizeMeters: number|null, widthMeters: number|null, pulse: boolean, includeCaster?: boolean}|null}
 */
export function getSpellAoEConfig(spell) {
  const sys = spell?.system ?? {};

  // New structured fields
  const shapeRaw = _str(sys.aoeShape || sys.aoe?.shape || "").toLowerCase();
  const sizeMeters = _num(sys.aoeSize ?? sys.aoe?.size, null);
  const widthMeters = _num(sys.aoeWidth ?? sys.aoe?.width, null);

  // Pulse is a modifier (centered on caster), not a measured-template type.
  // For backwards compatibility with earlier prototypes, accept aoeShape="pulse".
  const pulseFromShape = (shapeRaw === "pulse");
  const pulseFromFlag = Boolean(sys.aoePulse ?? sys.aoe?.pulse);
  const pulse = pulseFromShape || pulseFromFlag;
  const includeCaster = Boolean(sys.aoeIncludeCaster ?? sys.aoe?.includeCaster);

  // MeasuredTemplate types
  const normalizedShape = ["circle", "cone", "rect", "ray"].includes(shapeRaw)
    ? shapeRaw
    : (pulse ? "circle" : null);

  // If the spell is not configured as AoE, do not return an AoE config.
  // NOTE: We do not infer shape/size from free-text range because it becomes ambiguous quickly.
  if (!normalizedShape && _str(sys.rangeType).toLowerCase() !== "aoe") return null;

  return {
    shape: normalizedShape,
    sizeMeters: Number.isFinite(sizeMeters) ? sizeMeters : null,
    widthMeters: Number.isFinite(widthMeters) ? widthMeters : null,
    pulse,
    includeCaster
  };
}

function _roundTimeSeconds() {
  return Number(CONFIG.time?.roundTime ?? 6) || 6;
}

/**
 * Measure distance in meters between two canvas points using grid measurement.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function measureDistanceMeters(a, b) {
  if (!canvas?.grid || !a || !b) return 0;

  // Use v13 namespaced Ray with fallback to global Ray for compatibility
  const RayClass = foundry?.canvas?.geometry?.Ray ?? Ray;
  const ray = new RayClass(a, b);

  // Use v13 measurePath API with fallback to deprecated measureDistances
  if (typeof canvas.grid.measurePath === "function") {
    const path = canvas.grid.measurePath([{ ray }], { gridSpaces: true });
    // API may return object with distance property or array of distances
    const d = path?.distance ?? (Array.isArray(path) && path.length > 0 ? path[0] : null);
    if (Number.isFinite(d)) return d;
  } else {
    // Fallback for compatibility
    const distances = canvas.grid.measureDistances([{ ray }], { gridSpaces: true });
    const d = Array.isArray(distances) ? distances[0] : 0;
    if (Number.isFinite(d)) return d;
  }

  return 0;
}

/**
 * Snap a canvas point to the grid, defensively across grid types.
 * @param {{x:number,y:number}} pt
 * @returns {{x:number,y:number}}
 */
function snapPoint(pt) {
  // System default: allow free placement (no snapping) so templates can be dropped on hex borders/vertices.
  // This is intentional and global (no setting).
  return pt;
}

/**
 * Filter currently targeted tokens by spell range.
 * Returns the subset which are within range. Also emits warnings for those out of range.
 *
 * @param {object} opts
 * @param {Token} opts.casterToken
 * @param {Token[]} opts.targets
 * @param {Item} opts.spell
 * @returns {{inRange: Token[], outOfRange: Array<{token: Token, distance: number, maxRange: number}>}}
 */
export function filterTargetsBySpellRange({ casterToken, targets, spell } = {}) {
  const maxRange = getSpellMaxRangeMeters(spell);
  const origin = casterToken?.center ?? casterToken?.object?.center ?? null;

  // If there is no usable range, do not filter.
  if (!Number.isFinite(maxRange) || maxRange <= 0 || !origin) {
    const all = Array.from(targets ?? []);
    return {
      validTargets: all,
      rejected: [],
      maxRange,
      // Back-compat aliases
      inRange: all,
      outOfRange: []
    };
  }

  const inRange = [];
  const outOfRange = [];
  for (const tok of (targets ?? [])) {
    const c = tok?.center ?? tok?.object?.center ?? null;
    if (!c) continue;
    const d = measureDistanceMeters(origin, c);
    if (d <= maxRange) inRange.push(tok);
    else outOfRange.push({ token: tok, distance: d, maxRange });
  }

  return {
    validTargets: inRange,
    rejected: outOfRange,
    maxRange,
    // Back-compat aliases
    inRange,
    outOfRange
  };
}

/**
 * Create a MeasuredTemplate preview loop.
 * Creates the template on the scene immediately, then updates its position/rotation during preview.
 * If cancelled, the template is deleted.
 *
 * @param {MeasuredTemplateDocument} templateDoc
 * @param {{x:number,y:number}} origin
 * @param {number|null} maxRangeMeters
 * @returns {Promise<MeasuredTemplateDocument|null>}
 */
async function previewPlaceTemplate(templateDoc, origin, maxRangeMeters) {
  return new Promise((resolve) => {
    let active = true;
    let raf = null;

    const cleanup = async (result) => {
      if (!active) return;
      active = false;

      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }

      try { window.removeEventListener("keydown", onKeyDown); } catch (_e) {}
      try { canvas.stage.off("pointermove", onMove); } catch (_e) {}
      try { canvas.stage.off("pointerdown", onDown); } catch (_e) {}
      try { canvas.stage.off("rightdown", onRightDown); } catch (_e) {}

      resolve(result);
    };

    const onKeyDown = async (ev) => {
      if (ev.key === "Escape") {
        try { await templateDoc.delete(); } catch (_e) {}
        await cleanup(null);
      }
    };

    const onMove = async (ev) => {
      if (!active) return;
      const data = ev?.data ?? ev;
      const pos = data?.getLocalPosition ? data.getLocalPosition(canvas.stage) : null;
      if (!pos) return;

      const snapped = snapPoint({ x: pos.x, y: pos.y });

      // Don't range gate during preview - allow free movement
      // Range gating will happen only when the template is committed (on click)

      // Throttle document updates to rAF
      if (raf) return;
      raf = requestAnimationFrame(async () => {
        raf = null;
        try {
          await templateDoc.update({ x: snapped.x, y: snapped.y }, { render: false });
        } catch (_e) {
          // ignore
        }
      });
    };

    const onDown = async (ev) => {
      if (!active) return;
      const data = ev?.data ?? ev;
      const pos = data?.getLocalPosition ? data.getLocalPosition(canvas.stage) : null;
      if (!pos) return;

      const snapped = snapPoint({ x: pos.x, y: pos.y });

      if (Number.isFinite(maxRangeMeters) && maxRangeMeters > 0 && origin) {
        const d = measureDistanceMeters(origin, snapped);
        if (d > maxRangeMeters) {
          ui.notifications.warn(`Out of range (${Math.round(d)}m) (max ${maxRangeMeters}m). Choose a closer point or right-click/Esc to cancel.`);
          return;
        }
      }

      try {
        await templateDoc.update({ x: snapped.x, y: snapped.y });
      } catch (_e) {
        // best-effort
      }
      await cleanup(templateDoc);
    };

    const onRightDown = async () => {
      if (!active) return;
      try { await templateDoc.delete(); } catch (_e) {}
      await cleanup(null);
    };

    window.addEventListener("keydown", onKeyDown);
    canvas.stage.on("pointermove", onMove);
    canvas.stage.on("pointerdown", onDown);
    canvas.stage.on("rightdown", onRightDown);

    ui.notifications.info("Move the template with your mouse. Left-click to place. Right-click or Esc to cancel.");
  });
}

/**
 * Await the MeasuredTemplate object being available on canvas.
 * @param {string} templateId
 * @param {number} attempts
 * @returns {Promise<MeasuredTemplate|null>}
 */
async function awaitTemplateObject(templateId, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const obj =
      canvas.templates?.get?.(templateId) ??
      canvas.templates?.placeables?.find?.(t => t?.document?.id === templateId) ??
      null;
    if (obj) return obj;
    await new Promise(r => setTimeout(r, 25));
  }
  return null;
}

/**
 * Create an AoE template on the scene for an AoE spell and return affected tokens.
 * This function does NOT apply any effects or rolls; it only handles placement and target collection.
 *
 * @param {object} opts
 * @param {Token} opts.casterToken
 * @param {Item} opts.spell
 * @param {boolean} opts.includeCaster - always include caster in affected targets (Pulse semantics)
 * @returns {Promise<{templateDoc: MeasuredTemplateDocument|null, targets: Token[]}|null>}
 */
export async function placeAoETemplateAndCollectTargets({ casterToken, spell, includeCaster = false } = {}) {
  if (!canvas?.scene) {
    ui.notifications.warn("No active Scene.");
    return null;
  }
  if (!casterToken) {
    ui.notifications.warn("No caster token selected.");
    return null;
  }

  const maxRange = getSpellMaxRangeMeters(spell);
  const aoe = getSpellAoEConfig(spell);

  if (!aoe?.shape) {
    ui.notifications.warn("AoE shape is not configured on this spell.");
    return null;
  }
  if (!Number.isFinite(aoe.sizeMeters) || aoe.sizeMeters <= 0) {
    ui.notifications.warn("AoE size is not configured on this spell.");
    return null;
  }

  const origin = casterToken.center ?? casterToken?.object?.center ?? null;
  if (!origin) {
    ui.notifications.warn("Unable to determine caster token origin.");
    return null;
  }

  const pulse = Boolean(aoe.pulse);
  const includeCasterFinal = pulse && (Boolean(includeCaster) || Boolean(aoe.includeCaster));

  // Initial placement point
  const initialPoint = pulse ? { x: origin.x, y: origin.y } : { x: origin.x, y: origin.y };

  const data = {
    user: game.user.id,
    t: aoe.shape,                 // "circle"|"cone"|"rect"|"ray"
    x: initialPoint.x,
    y: initialPoint.y,
    direction: 0,
    distance: aoe.sizeMeters,     // in scene distance units (meters)
    width: Number.isFinite(aoe.widthMeters) ? aoe.widthMeters : undefined,
    fillColor: 0x000000,          // color is not important; users can override via core
    flags: {
      "uesrpg-3ev4": {
        spellAoE: true,
        spellUuid: spell?.uuid ?? null,
        casterTokenId: casterToken?.id ?? casterToken?.document?.id ?? null
      }
    }
  };

  let created = null;
  try {
    const docs = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
    created = docs?.[0] ?? null;
  } catch (err) {
    console.error("UESRPG | Failed to create MeasuredTemplate", err);
    ui.notifications.error("Failed to place spell template.");
    return null;
  }
  if (!created) return null;

  // Preview placement (no preview needed for pulse).
  let templateDoc = created;
  if (!pulse) {
    const placed = await previewPlaceTemplate(templateDoc, origin, Number.isFinite(maxRange) ? maxRange : null);
    if (!placed) return null;
    templateDoc = placed;
  }

  // Compute affected tokens.
  const templateObj = await awaitTemplateObject(templateDoc.id);
  const tokens = Array.from(canvas.tokens?.placeables ?? []);
  const affected = [];

  if (templateObj?.shape && typeof templateObj.shape.contains === "function") {
    for (const tok of tokens) {
      const tokObj = tok?.object ?? tok;
      const c = tokObj?.center ?? null;
      if (!c) continue;

      // For small templates (e.g., 1x1), the template can overlap a token without containing its center.
      // We therefore sample multiple points on the token bounds.
      const w = Number(tokObj?.w ?? tokObj?.width ?? 0);
      const h = Number(tokObj?.h ?? tokObj?.height ?? 0);
      const x0 = Number(tokObj?.x ?? tokObj?.document?.x ?? (c.x - w / 2));
      const y0 = Number(tokObj?.y ?? tokObj?.document?.y ?? (c.y - h / 2));

      const points = [];
      // Center
      points.push({ x: c.x, y: c.y });
      if (w > 0 && h > 0) {
        // Corners
        points.push({ x: x0, y: y0 });
        points.push({ x: x0 + w, y: y0 });
        points.push({ x: x0, y: y0 + h });
        points.push({ x: x0 + w, y: y0 + h });
        // Edge midpoints
        points.push({ x: x0 + w / 2, y: y0 });
        points.push({ x: x0 + w / 2, y: y0 + h });
        points.push({ x: x0, y: y0 + h / 2 });
        points.push({ x: x0 + w, y: y0 + h / 2 });
      }

      let inside = false;
      for (const p of points) {
        if (templateObj.shape.contains(p.x - templateObj.x, p.y - templateObj.y)) {
          inside = true;
          break;
        }
      }
      if (inside) affected.push(tok);
    }
  } else {
    ui.notifications.warn("Template placed, but could not determine affected tokens. Please target tokens manually.");
  }

  if (pulse) {
    const casterId = casterToken?.id ?? casterToken?.document?.id;
    if (casterId) {
      const isCaster = (t) => (t?.id ?? t?.document?.id) === casterId;
      const already = affected.some(isCaster);

      if (!includeCasterFinal && already) {
        for (let i = affected.length - 1; i >= 0; i -= 1) {
          if (isCaster(affected[i])) affected.splice(i, 1);
        }
      } else if (includeCasterFinal && !already) {
        affected.push(casterToken);
      }
    }
  }

  if (!affected.length) {
    ui.notifications.info("No tokens are affected by the spell template.");
  }

  return { templateDoc, targets: affected };
}
