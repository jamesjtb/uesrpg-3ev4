/**
 * module/helpers/aoe-utils.js
 *
 * Small AoE geometry helpers for escape checks.
 * Foundry VTT v13.
 */

function _getPixelsPerMeter() {
  const gridSize = Number(canvas?.grid?.size ?? 0) || 0;
  const gridDistance = Number(canvas?.scene?.grid?.distance ?? 0) || 0;
  if (!gridSize || !gridDistance) return null;
  return gridSize / gridDistance;
}

function _getTemplateObject(templateDoc, templateId) {
  if (templateDoc?.object) return templateDoc.object;
  const id = templateDoc?.id ?? templateDoc?._id ?? templateId ?? null;
  if (!id) return null;
  return (
    canvas?.templates?.get?.(id) ??
    canvas?.templates?.placeables?.find?.(t => t?.id === id || t?.document?.id === id) ??
    null
  );
}

/**
 * Resolve a MeasuredTemplateDocument from a UUID.
 * @param {string|null} templateUuid
 * @returns {MeasuredTemplateDocument|null}
 */
export function resolveTemplateByUuid(templateUuid) {
  if (!templateUuid) return null;
  try {
    const doc = fromUuidSync(String(templateUuid));
    return doc?.documentName === "MeasuredTemplate" ? doc : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Determine if a token can move 1 meter to leave a template area.
 * Uses a simple 8-direction sample from the token center.
 *
 * @param {object} params
 * @param {string|null} params.templateUuid
 * @param {string|null} params.templateId
 * @param {Token|null} params.token
 * @param {number} params.stepMeters
 * @returns {boolean|null} true if a 1m step can exit, false if not, null if unknown
 */
export function canTokenEscapeTemplate({ templateUuid = null, templateId = null, token = null, stepMeters = 1 } = {}) {
  if (!canvas?.scene || !token) return null;

  const templateDoc = resolveTemplateByUuid(templateUuid);
  const templateObj = _getTemplateObject(templateDoc, templateId);
  if (!templateObj?.shape || typeof templateObj.shape.contains !== "function") return null;

  const center = token?.center ?? token?.object?.center ?? null;
  if (!center) return null;

  const ppm = _getPixelsPerMeter();
  if (!ppm) return null;

  const step = Number(stepMeters) * ppm;
  if (!Number.isFinite(step) || step <= 0) return null;

  const isInside = templateObj.shape.contains(center.x - templateObj.x, center.y - templateObj.y);
  if (!isInside) return true;

  const diag = step / Math.SQRT2;
  const offsets = [
    { x: step, y: 0 },
    { x: -step, y: 0 },
    { x: 0, y: step },
    { x: 0, y: -step },
    { x: diag, y: diag },
    { x: diag, y: -diag },
    { x: -diag, y: diag },
    { x: -diag, y: -diag }
  ];

  for (const off of offsets) {
    const px = center.x + off.x;
    const py = center.y + off.y;
    const inside = templateObj.shape.contains(px - templateObj.x, py - templateObj.y);
    if (!inside) return true;
  }

  return false;
}
