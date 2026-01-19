/**
 * module/helpers/chat-message-socket.js
 *
 * Backwards-compatible ChatMessage update helper.
 *
 * NOTE: Opposed workflow updates now use the centralized Authority Proxy (queries-based) for
 * deterministic ack/return values. We keep the legacy socket listener to safely process any
 * outstanding in-flight socket events from older clients, but new callers should use
 * safeUpdateChatMessage (which delegates to authority-proxy).
 */

import {
  registerAuthorityProxy,
  requestUpdateChatMessage,
  canUserUpdateChatMessage,
  sanitizeChatMessageUpdatePayload,
  isChatMessageUpdateFresh,
  getMessageAuthorId
} from "./authority-proxy.js";

const SOCKET_EVENT_V1 = "uesrpg.chatMessageUpdate.v1";
const SOCKET_EVENT_V2 = "uesrpg.chatMessageUpdate.v2";
// v3: broadcast request; the first eligible applier (active GM preferred, otherwise author)
// updates the ChatMessage. This avoids brittle author-id extraction at emit time.
const SOCKET_EVENT_V3 = "uesrpg.chatMessageUpdate.v3";

function _socketChannel() {
  return `system.${game.system.id}`;
}

function _isAuthor(message, user) {
  try {
    return Boolean(user?.id) && (getMessageAuthorId(message) === user.id);
  } catch (_e) {
    return false;
  }
}

/**
 * Register the socket handler.
 * Safe to call multiple times; guarded per session.
 */
export function registerChatMessageSocket() {
  // Ensure queries-based authority proxy is registered as the canonical mechanism.
  registerAuthorityProxy();

  if (game.uesrpg?.__chatMessageSocketRegistered) return;
  game.uesrpg = game.uesrpg ?? {};
  game.uesrpg.__chatMessageSocketRegistered = true;

  game.socket.on(_socketChannel(), async (data) => {
    try {
      if (!data || (data.type !== SOCKET_EVENT_V1 && data.type !== SOCKET_EVENT_V2 && data.type !== SOCKET_EVENT_V3)) return;

      // v2 supports targeted delivery; v1 is GM-broadcast.
      const targetUserId = String(data.targetUserId ?? "").trim();
      if (data.type === SOCKET_EVENT_V2 && targetUserId && game.user?.id !== targetUserId) return;

      const messageId = String(data.messageId ?? "").trim();
      if (!messageId) return;

      const message = game.messages?.get(messageId) ?? null;
      if (!message) return;

      // Prefer GM application when any active GM is online to avoid duplicate updates.
      // If no active GM is online, allow the message author to apply.
      const anyActiveGM = (game.users ? Array.from(game.users.values()) : []).some(u => u?.active && u.isGM);
      if (anyActiveGM && !game.user?.isGM) return;

      // Only allow application by a GM or the message author.
      const isEligibleApplier = Boolean(game.user?.isGM) || _isAuthor(message, game.user);
      if (!isEligibleApplier) return;

      // And only if they can actually update the document.
      if (!canUserUpdateChatMessage(message, game.user)) return;

      const payload = sanitizeChatMessageUpdatePayload(data.payload);
      if (!payload || Object.keys(payload).length === 0) return;

      // Prevent out-of-order updates from reverting opposed state.
      if (!isChatMessageUpdateFresh(message, payload)) return;

      try {
        await message.update(payload, { render: false });
        if (ui?.chat) ui.chat.render?.(true);
      } catch (err) {
        console.error("UESRPG | chat-message-socket | apply failed", { messageId, err });
      }
    } catch (err) {
      console.error("UESRPG | chat-message-socket | handler crashed", err);
    }
  });
}

/**
 * Update a ChatMessage, falling back to a socket request if current user lacks permission.
 * @param {ChatMessage} message
 * @param {object} payload
 */
export async function safeUpdateChatMessage(message, payload) {
  await requestUpdateChatMessage(message, payload);
}

// Re-export for any legacy callers.
export { sanitizeChatMessageUpdatePayload };
