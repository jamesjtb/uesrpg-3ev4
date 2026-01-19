function _num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function buildRestChatContent(title, lines) {
  const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  return `<h3>${title}</h3><ul>${safeLines.join("")}</ul>`;
}

export async function applyShortRest(actor) {
  if (!actor) return { line: "", updatesApplied: false };

  const fatigueLevel = _num(actor.system?.fatigue?.level ?? 0);
  const currentSP = _num(actor.system?.stamina?.value ?? 0);
  const maxSP = _num(actor.system?.stamina?.max ?? 0);
  const currentMP = _num(actor.system?.magicka?.value ?? 0);
  const maxMP = _num(actor.system?.magicka?.max ?? 0);

  const updateData = {};
  let line = `<li><b>${actor.name}</b>: `;

  // RAW: Remove 1 fatigue OR recover 1 SP
  if (fatigueLevel > 0) {
    updateData["system.fatigue.level"] = fatigueLevel - 1;
    line += `Removed 1 fatigue (now ${fatigueLevel - 1})`;
  } else if (currentSP < maxSP) {
    updateData["system.stamina.value"] = currentSP + 1;
    line += `Recovered 1 SP (now ${currentSP + 1}/${maxSP})`;
  } else {
    line += "No recovery needed";
  }

  // RAW: Recover MP = floor(maxMP / 10)
  const mpRecover = Math.floor(maxMP / 10);
  if (mpRecover > 0 && currentMP < maxMP) {
    const newMP = Math.min(currentMP + mpRecover, maxMP);
    updateData["system.magicka.value"] = newMP;
    line += ` (+${mpRecover} MP)`;
  }

  line += "</li>";

  const hasUpdates = Object.keys(updateData).length > 0;
  if (hasUpdates) await actor.update(updateData);

  return { line, updatesApplied: hasUpdates };
}

export async function applyLongRest(actor) {
  if (!actor) return { line: "", updatesApplied: false };

  const endBonus = Math.floor(_num(actor.system?.characteristics?.end?.total ?? 0) / 10);
  const fatigueLevel = _num(actor.system?.fatigue?.level ?? 0);
  const currentHP = _num(actor.system?.hp?.value ?? 0);
  const maxHP = _num(actor.system?.hp?.max ?? 0);
  const maxSP = _num(actor.system?.stamina?.max ?? 0);
  const maxMP = _num(actor.system?.magicka?.max ?? 0);
  const hasWounds = Boolean(actor.system?.wounded);

  const updateData = {};
  const recoveryParts = [];

  // RAW: Remove END bonus fatigue levels
  if (fatigueLevel > 0 && endBonus > 0) {
    const fatigueRemoved = Math.min(fatigueLevel, endBonus);
    updateData["system.fatigue.level"] = fatigueLevel - fatigueRemoved;
    recoveryParts.push(`Removed ${fatigueRemoved} fatigue`);
  }

  // RAW: Heal END bonus HP (only if no wounds)
  if (!hasWounds && currentHP < maxHP && endBonus > 0) {
    const hpHealed = Math.min(endBonus, maxHP - currentHP);
    updateData["system.hp.value"] = currentHP + hpHealed;
    recoveryParts.push(`Healed ${hpHealed} HP`);
  } else if (hasWounds) {
    recoveryParts.push("Cannot heal HP (wounded)");
  }

  // RAW: Recover all SP and MP
  updateData["system.stamina.value"] = maxSP;
  updateData["system.magicka.value"] = maxMP;
  recoveryParts.push("Recovered all SP and MP");

  const line = `<li><b>${actor.name}</b>: ${recoveryParts.join("; ")}</li>`;
  await actor.update(updateData);

  return { line, updatesApplied: true };
}
