import { getDiseaseResistancePercent } from "./trait-registry.js";

function _norm(str) {
  return String(str ?? "").trim();
}

function _getOwnerUserIds(actor) {
  const out = new Set();
  const users = game.users?.contents ?? [];

  for (const user of users) {
    if (!user) continue;
    if (user.isGM) {
      out.add(user.id);
      continue;
    }
    const hasOwner = typeof actor?.testUserPermission === "function"
      ? actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
      : Number(actor?.ownership?.[user.id] ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    if (hasOwner) out.add(user.id);
  }

  return Array.from(out);
}

export async function postDiseasedCheckCard({ attacker, defender, traitValue = 0, sourceItem = null } = {}) {
  if (!defender) return null;
  const mod = Number(traitValue ?? 0) || 0;
  const modLabel = mod >= 0 ? `+${mod}` : `${mod}`;
  const sourceLabel = _norm(sourceItem?.name) || _norm(attacker?.name) || "Attack";
  const resistPercent = getDiseaseResistancePercent(defender);

  const content = `
    <div class="uesrpg-disease-card">
      <h3>Diseased (${modLabel})</h3>
      <p><b>Source:</b> ${sourceLabel}</p>
      <p>Target must pass an <b>Endurance</b> test ${modLabel} or contract a common disease.</p>
      ${resistPercent > 0 ? `<p><b>Disease Resistance:</b> ${resistPercent}% (if test fails)</p>` : ""}
      <div style="margin-top:6px;">
        <button type="button" data-ues-disease-action="roll"
          data-actor-uuid="${defender.uuid}"
          data-trait-value="${mod}"
          data-source-label="${sourceLabel}">
          Roll Endurance (Diseased)
        </button>
      </div>
    </div>
  `;

  return ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    content,
    whisper: _getOwnerUserIds(defender),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      "uesrpg-3ev4": {
        diseaseCheck: {
          actorUuid: defender.uuid,
          attackerUuid: attacker?.uuid ?? null,
          traitValue: mod,
          sourceItemUuid: sourceItem?.uuid ?? null,
          createdAt: Date.now()
        }
      }
    }
  });
}

export async function postRegenerationPrompt({ actor, traitValue = 0, round = null } = {}) {
  if (!actor) return null;
  const value = Math.max(0, Number(traitValue ?? 0) || 0);
  if (value <= 0) return null;

  const roundLabel = Number.isFinite(Number(round)) ? `Round ${Number(round)}` : "Start of Round";
  const content = `
    <div class="uesrpg-regeneration-card">
      <h3>Regeneration (${value})</h3>
      <p><b>${roundLabel}:</b> Make an Endurance test to heal ${value} HP.</p>
      <div style="margin-top:6px;">
        <button type="button" data-ues-regeneration-action="roll"
          data-actor-uuid="${actor.uuid}"
          data-regen-value="${value}">
          Roll Endurance (Regeneration)
        </button>
      </div>
    </div>
  `;

  return ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    whisper: _getOwnerUserIds(actor),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flags: {
      "uesrpg-3ev4": {
        regenerationPrompt: {
          actorUuid: actor.uuid,
          value,
          round: Number.isFinite(Number(round)) ? Number(round) : null,
          createdAt: Date.now()
        }
      }
    }
  });
}
