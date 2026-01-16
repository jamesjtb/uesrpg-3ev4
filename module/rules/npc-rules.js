const SYSTEM_ID = "uesrpg-3ev4";

export const NPC_LUCK_FLAG = "npcLuckAllowed";
export const NPC_ELITE_FLAG = "npcEliteAllowed";

export function isNPC(actor) {
  const type = String(actor?.type ?? "").toLowerCase().trim();
  return type === "npc";
}

export function getNpcCriticalBands() {
  return { successMax: 3, failureMin: 98 };
}

export function canUseLuck(actor) {
  if (!actor) return false;
  if (!isNPC(actor)) return true;
  try {
    return actor.getFlag?.(SYSTEM_ID, NPC_LUCK_FLAG) === true;
  } catch (_e) {
    return false;
  }
}

export function canUseHeroicActions(actor) {
  if (!actor) return false;
  if (!isNPC(actor)) return true;
  try {
    return actor.getFlag?.(SYSTEM_ID, NPC_ELITE_FLAG) === true;
  } catch (_e) {
    return false;
  }
}

export function resolveCriticalFlags(actor, rollTotal, { allowLucky = true, allowUnlucky = true } = {}) {
  const total = Number(rollTotal);
  if (!Number.isFinite(total)) return { isCriticalSuccess: false, isCriticalFailure: false };

  if (isNPC(actor)) {
    const { successMax, failureMin } = getNpcCriticalBands();
    return {
      isCriticalSuccess: total <= successMax,
      isCriticalFailure: total >= failureMin
    };
  }

  if (!canUseLuck(actor)) return { isCriticalSuccess: false, isCriticalFailure: false };

  let isCriticalSuccess = false;
  let isCriticalFailure = false;

  const luckyNums = Object.values(actor?.system?.lucky_numbers || {}).map(n => Number(n));
  const unluckyNums = Object.values(actor?.system?.unlucky_numbers || {}).map(n => Number(n));

  if (allowLucky && luckyNums.includes(total)) isCriticalSuccess = true;
  if (allowUnlucky && unluckyNums.includes(total)) isCriticalFailure = true;

  return { isCriticalSuccess, isCriticalFailure };
}
