/**
 * module/skills/roll-request.js
 *
 * Internal data contract for skill roll workflows.
 *
 * Goals:
 * - Deterministic payload for chat-card flags.
 * - Input validation + sane clamping.
 * - Shared debug logging.
 */

import { getDifficultyByKey } from "./skill-tn.js";

export const SKILL_ROLL_REQUEST_VERSION = 1;

export function isSkillRollDebugEnabled() {
  try {
    return Boolean(game.settings.get("uesrpg-3ev4", "skillRollDebug"));
  } catch (_e) {
    return false;
  }
}

export function skillRollDebug(...args) {
  if (!isSkillRollDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log("[UESRPG][SkillRoll]", ...args);
}

export function clampNumber(v, { min = -200, max = 200 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSkillRollOptions(raw = {}, fallback = {}) {
  const diffKey = String(raw.difficultyKey ?? fallback.difficultyKey ?? "average");
  const diff = getDifficultyByKey(diffKey);

  return {
    difficultyKey: diff.key,
    manualMod: clampNumber(raw.manualMod ?? fallback.manualMod ?? 0, { min: -200, max: 200 }),
    useSpec: Boolean(raw.useSpec ?? fallback.useSpec ?? false)
  };
}

/**
 * Construct a normalized roll request contract.
 *
 * @param {object} cfg
 * @param {Actor} cfg.actor
 * @param {Item} cfg.skillItem
 * @param {Token|null} cfg.targetToken
 * @param {object} cfg.options
 * @param {object} cfg.context
 */
export function buildSkillRollRequest({ actor, skillItem, targetToken = null, options = {}, context = {} } = {}) {
  const actorUuid = actor?.uuid ?? null;
  const targetUuid = targetToken?.document?.uuid ?? targetToken?.uuid ?? null;
  const skillUuid = skillItem?.uuid ?? null;

  return {
    version: SKILL_ROLL_REQUEST_VERSION,
    createdAt: Date.now(),
    createdBy: game.user?.id ?? null,
    actorUuid,
    targetUuid,
    skill: {
      uuid: skillUuid,
      name: skillItem?.name ?? null,
      type: skillItem?.type ?? null
    },
    options: normalizeSkillRollOptions(options),
    context: {
      source: String(context.source ?? "unknown"),
      quick: Boolean(context.quick ?? false),
      messageId: context.messageId ?? null,
      groupId: context.groupId ?? null
    }
  };
}

/**
 * Validate a roll request contract. Returns { ok, error }.
 */
export function validateSkillRollRequest(req) {
  if (!req) return { ok: false, error: "Missing roll request." };
  if (Number(req.version) !== SKILL_ROLL_REQUEST_VERSION) {
    return { ok: false, error: `Unsupported skill roll request version: ${req.version}` };
  }
  if (!req.actorUuid) return { ok: false, error: "Missing actor." };
  if (!req.skill?.uuid) return { ok: false, error: "Missing skill." };
  if (!req.options?.difficultyKey) return { ok: false, error: "Missing difficulty." };
  return { ok: true, error: null };
}
