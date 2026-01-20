/**
 * src/utils/authority-proxy.js
 *
 * Centralized permission-safe mutation helper for distributed workflows.
 *
 * Foundry constraints:
 *  - Non-owners cannot mutate documents they do not own.
 *  - Some workflows require a remote, authorized writer (active GM preferred).
 *
 * This helper consolidates all "authority proxy" logic behind Foundry Queries
 * (CONFIG.queries + User#query), providing ack/return values.
 *
 * Supported operations:
 *  - ChatMessage updates (sanitized): content + flags[systemId].opposed / skillOpposed
 *  - Actor embedded ActiveEffect creation
 *  - Generic document updates (Actor / Item / ActiveEffect / TokenDocument)
 *  - Actor embedded document create/update/delete (ActiveEffect / Item)
 *
 * Concurrency hardening:
 *  - The authority writer serializes mutations per-target (ChatMessage / Actor / Document)
 *    with a deterministic in-flight guard.
 */

const NAMESPACE = "uesrpg-3ev4";

const QUERY_UPDATE_CHAT_MESSAGE_V1 = `${NAMESPACE}.authority.updateChatMessage.v1`;
const QUERY_CREATE_ACTIVE_EFFECT_V1 = `${NAMESPACE}.authority.createActiveEffect.v1`;
const QUERY_UPDATE_DOCUMENT_V1 = `${NAMESPACE}.authority.updateDocument.v1`;
const QUERY_CREATE_EMBEDDED_DOCS_V1 = `${NAMESPACE}.authority.createEmbeddedDocuments.v1`;
const QUERY_UPDATE_EMBEDDED_DOCS_V1 = `${NAMESPACE}.authority.updateEmbeddedDocuments.v1`;
const QUERY_DELETE_EMBEDDED_DOCS_V1 = `${NAMESPACE}.authority.deleteEmbeddedDocuments.v1`;

const _IN_FLIGHT_LOCKS = new Set();
const _RECENT_SIGNATURES = new Map();

function _debugEnabled() {
  try {
    return game.settings?.get?.(NAMESPACE, "effectsProxyDebug") === true;
  } catch (_e) {
    return false;
  }
}

function _dlog(msg, data) {
  if (!_debugEnabled()) return;
  try {
    console.log(`UESRPG | authority-proxy | ${msg}`, data ?? "");
  } catch (_e) {
    /* no-op */
  }
}

function _dwarn(msg, data) {
  if (!_debugEnabled()) return;
  try {
    console.warn(`UESRPG | authority-proxy | ${msg}`, data ?? "");
  } catch (_e) {
    /* no-op */
  }
}

function _channelSystemId() {
  return game.system?.id ?? NAMESPACE;
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _acquireLock(key, { timeoutMs = 3000, pollMs = 25 } = {}) {
  const start = Date.now();
  while (_IN_FLIGHT_LOCKS.has(key)) {
    if ((Date.now() - start) > timeoutMs) {
      throw new Error(`authority lock timeout for ${key}`);
    }
    await _sleep(pollMs);
  }
  _IN_FLIGHT_LOCKS.add(key);
}

function _releaseLock(key) {
  _IN_FLIGHT_LOCKS.delete(key);
}

function _stableStringify(value) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null) return "null";
    const t = typeof v;
    if (t === "string") return JSON.stringify(v);
    if (t === "number" || t === "boolean") return String(v);
    if (t !== "object") return JSON.stringify(String(v));

    if (seen.has(v)) return '"[Circular]"';
    seen.add(v);

    if (Array.isArray(v)) return `[${v.map(walk).join(",")}]`;

    const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = keys.map((k) => `${JSON.stringify(k)}:${walk(v[k])}`);
    return `{${parts.join(",")}}`;
  };

  try {
    return walk(value);
  } catch (_e) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

function _isRecentDuplicate(signature, { windowMs = 1500, maxEntries = 500 } = {}) {
  try {
    const now = Date.now();
    const prev = _RECENT_SIGNATURES.get(signature) ?? 0;
    if (prev && (now - prev) < windowMs) return true;

    _RECENT_SIGNATURES.set(signature, now);

    // Simple size bound; clear oldest-ish by brute force when oversized.
    if (_RECENT_SIGNATURES.size > maxEntries) {
      const entries = Array.from(_RECENT_SIGNATURES.entries());
      entries.sort((a, b) => a[1] - b[1]);
      const toDelete = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < toDelete; i++) _RECENT_SIGNATURES.delete(entries[i][0]);
    }

    return false;
  } catch (_e) {
    return false;
  }
}

export function getMessageAuthorId(message) {
  try {
    // Foundry v13: ChatMessage has .author (User) and .user may be a string id.
    const a = message?.author;
    if (a && typeof a === "object" && typeof a.id === "string") return a.id;

    const u = message?.user;
    if (typeof u === "string") return u;
    if (u && typeof u === "object" && typeof u.id === "string") return u.id;

    const srcUser = message?._source?.user;
    if (typeof srcUser === "string") return srcUser;

    return null;
  } catch (_e) {
    return null;
  }
}

export function canUserUpdateChatMessage(message, user) {
  try {
    if (!message || !user) return false;
    if (user.isGM) return true;
    if (typeof message.canUserModify === "function") return message.canUserModify(user, "update");
    if (typeof message.testUserPermission === "function") {
      return message.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    }
    // Fallback: author match.
    return getMessageAuthorId(message) === user.id;
  } catch (_e) {
    return false;
  }
}

function _isAuthor(message, user) {
  try {
    return Boolean(user?.id) && (getMessageAuthorId(message) === user.id);
  } catch (_e) {
    return false;
  }
}

function _deepClonePlain(obj) {
  try {
    if (foundry?.utils?.deepClone) return foundry.utils.deepClone(obj);
    return structuredClone(obj);
  } catch (_e) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_e2) {
      return obj;
    }
  }
}

/**
 * Sanitize payload to prevent arbitrary ChatMessage updates from clients.
 * Allowed:
 *  - content: string
 *  - flags[systemId].opposed
 *  - flags[systemId].skillOpposed
 */
export function sanitizeChatMessageUpdatePayload(payload) {
  if (!payload || typeof payload !== "object") return {};

  const sysId = _channelSystemId();
  const out = {};

  if (typeof payload.content === "string") out.content = payload.content;

  const flags = payload.flags;
  const sysFlags = (flags && typeof flags === "object") ? flags[sysId] : null;
  if (sysFlags && typeof sysFlags === "object") {
    const cleanedSysFlags = {};
    if (Object.prototype.hasOwnProperty.call(sysFlags, "opposed")) cleanedSysFlags.opposed = _deepClonePlain(sysFlags.opposed);
    if (Object.prototype.hasOwnProperty.call(sysFlags, "skillOpposed")) cleanedSysFlags.skillOpposed = _deepClonePlain(sysFlags.skillOpposed);
    if (Object.keys(cleanedSysFlags).length > 0) out.flags = { [sysId]: cleanedSysFlags };
  }

  return out;
}

/**
 * Determine whether the incoming payload is at least as new as the currently stored opposed state.
 */
export function isChatMessageUpdateFresh(message, payload) {
  try {
    const sysId = _channelSystemId();
    const incoming = payload?.flags?.[sysId] ?? null;
    if (!incoming || typeof incoming !== "object") return true;

    const current = message?.flags?.[sysId] ?? null;
    if (!current || typeof current !== "object") return true;

    const lanes = [];
    if (Object.prototype.hasOwnProperty.call(incoming, "opposed")) lanes.push("opposed");
    if (Object.prototype.hasOwnProperty.call(incoming, "skillOpposed")) lanes.push("skillOpposed");
    if (lanes.length === 0) return true;

    const extract = (obj, lane) => {
      if (lane === "opposed") {
        return {
          ts: Number(obj?.opposed?.context?.updatedAt ?? 0),
          seq: Number(obj?.opposed?.context?.updatedSeq ?? 0)
        };
      }
      if (lane === "skillOpposed") {
        return {
          ts: Number(obj?.skillOpposed?.state?.context?.updatedAt ?? 0),
          seq: Number(obj?.skillOpposed?.state?.context?.updatedSeq ?? 0)
        };
      }
      return { ts: 0, seq: 0 };
    };

    const incSeq = Math.max(...lanes.map(l => extract(incoming, l).seq));
    const curSeq = Math.max(...lanes.map(l => extract(current, l).seq));

    if (incSeq && curSeq) {
      if (incSeq < curSeq) return false;
      if (incSeq > curSeq) return true;
      // If sequences tie, fall through to timestamp comparison.
    }

    const incTs = Math.max(...lanes.map(l => extract(incoming, l).ts));
    const curTs = Math.max(...lanes.map(l => extract(current, l).ts));
    if (!incTs || !curTs) return true;
    return incTs >= curTs;
  } catch (_e) {
    return true;
  }
}

function _selectActiveGM() {
  try {
    if (game.users?.activeGM) return game.users.activeGM;
    const activeGMs = (game.users?.contents ?? []).filter(u => u?.active && u.isGM);
    if (!activeGMs.length) return null;
    activeGMs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return activeGMs[0];
  } catch (_e) {
    return null;
  }
}

function _selectActorOwner(actor) {
  try {
    if (!actor) return null;
    const owners = (game.users?.contents ?? [])
      .filter(u => u?.active && actor.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
    if (!owners.length) return null;
    owners.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return owners[0];
  } catch (_e) {
    return null;
  }
}

function _selectChatMessageAuthor(message) {
  try {
    const authorId = getMessageAuthorId(message);
    if (!authorId) return null;
    const u = game.users?.get?.(authorId) ?? null;
    if (u?.active) return u;
    return null;
  } catch (_e) {
    return null;
  }
}

function _selectDocumentOwner(doc) {
  try {
    if (!doc) return null;
    const owners = (game.users?.contents ?? [])
      .filter(u => u?.active && doc.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
    if (!owners.length) return null;
    owners.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return owners[0];
  } catch (_e) {
    return null;
  }
}

function _sanitizeGenericUpdatePayload(doc, payload) {
  if (!payload || typeof payload !== "object") return {};

  const docName = doc?.documentName ?? "";
  const out = {};

  // Allow flags and system subtrees; allow name/img for user-facing changes.
  // IMPORTANT: We also allow dot-path updates within these subtrees (e.g. "system.hp.value").
  const allowTopLevel = new Set(["system", "flags", "name", "img", "icon"]);

  // TokenDocument: extremely conservative.
  if (docName === "Token") {
    for (const [k, v] of Object.entries(payload)) {
      if (k === "flags" && v && typeof v === "object") {
        out.flags = _deepClonePlain(v);
        continue;
      }
      if (k.startsWith("flags.")) out[k] = _deepClonePlain(v);
    }
    return out;
  }

  // ActiveEffect: allow standard AE mutation lanes.
  if (docName === "ActiveEffect") {
    const allowed = new Set(["changes", "duration", "disabled", "name", "img", "icon", "flags", "statuses", "tint", "origin", "transfer"]);
    for (const [k, v] of Object.entries(payload)) {
      if (allowed.has(k)) {
        // Normalize legacy icon -> img.
        if (k === "icon" && payload.img === undefined) out.img = _deepClonePlain(v);
        else out[k] = _deepClonePlain(v);
        continue;
      }
      // Permit dot-path updates for safe subtrees.
      if (k.startsWith("flags.") || k.startsWith("duration.")) {
        out[k] = _deepClonePlain(v);
      }
    }
    // Do not retain "icon" if we normalized it.
    if (out.icon !== undefined) delete out.icon;
    return out;
  }

  // Actor / Item / other.
  for (const [k, v] of Object.entries(payload)) {
    if (allowTopLevel.has(k)) {
      if (k === "icon" && payload.img === undefined) out.img = _deepClonePlain(v);
      else out[k] = _deepClonePlain(v);
      continue;
    }

    // Permit dot-path updates for safe subtrees.
    if (k.startsWith("system.") || k.startsWith("flags.")) {
      out[k] = _deepClonePlain(v);
    }
  }

  if (out.icon !== undefined) delete out.icon;
  return out;
}

function _sanitizeEmbeddedDocData(embeddedName, data) {
  if (!data || typeof data !== "object") return null;

  if (embeddedName === "ActiveEffect") {
    // Allow Foundry's standard AE fields. Do not allow forcing IDs.
    // Normalize legacy "icon" to v13 "img".
    const allowed = new Set(["name", "img", "icon", "origin", "disabled", "duration", "changes", "flags", "statuses", "tint", "transfer"]);
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (!allowed.has(k)) continue;
      if (k === "icon") {
        if (out.img === undefined && data.img === undefined) out.img = _deepClonePlain(v);
        continue;
      }
      out[k] = _deepClonePlain(v);
    }
    return out;
  }

  if (embeddedName === "Item") {
    // Embedded Items: be conservative; allow system/name/img/type/flags.
    const allowed = new Set(["name", "img", "type", "system", "flags"]);
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      if (!allowed.has(k)) continue;
      out[k] = _deepClonePlain(v);
    }
    return out;
  }

  return null;
}

function _lockKeyForDoc(doc) {
  try {
    const docName = doc?.documentName ?? "Document";
    const uuid = doc?.uuid ?? "";
    const id = doc?.id ?? "";
    return `${docName}:${uuid || id}`;
  } catch (_e) {
    return "Document:unknown";
  }
}

export function registerAuthorityProxy() {
  CONFIG.queries = CONFIG.queries ?? {};

  if (!CONFIG.queries[QUERY_UPDATE_CHAT_MESSAGE_V1]) {
    CONFIG.queries[QUERY_UPDATE_CHAT_MESSAGE_V1] = async function updateChatMessageHandler(queryData) {
      const lockKey = `ChatMessage:${String(queryData?.messageId ?? "")}`;
      try {
        await _acquireLock(lockKey);
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
      try {
        const messageId = String(queryData?.messageId ?? "").trim();
        if (!messageId) return { ok: false, error: "Missing messageId" };

        const message = game.messages?.get?.(messageId) ?? null;
        if (!message) return { ok: false, error: `ChatMessage not found: ${messageId}` };

        // Eligibility: GM preferred, otherwise author. Still validate.
        const eligible = Boolean(game.user?.isGM) || _isAuthor(message, game.user);
        if (!eligible) return { ok: false, error: "Not eligible to apply ChatMessage updates" };
        if (!canUserUpdateChatMessage(message, game.user)) return { ok: false, error: "No permission to update ChatMessage" };

        const sanitized = sanitizeChatMessageUpdatePayload(queryData?.payload ?? {});
        if (!sanitized || Object.keys(sanitized).length === 0) return { ok: false, error: "Empty or invalid payload" };
        if (!isChatMessageUpdateFresh(message, sanitized)) return { ok: false, error: "Stale payload" };

        await message.update(sanitized, { render: false });
        if (ui?.chat) ui.chat.render?.(true);

        return { ok: true };
      } catch (err) {
        console.error("UESRPG | authority-proxy | updateChatMessage query handler failed", err);
        return { ok: false, error: err?.message ?? String(err) };
      } finally {
        _releaseLock(lockKey);
      }
    };
  }

  if (!CONFIG.queries[QUERY_CREATE_ACTIVE_EFFECT_V1]) {
    CONFIG.queries[QUERY_CREATE_ACTIVE_EFFECT_V1] = async function createActiveEffectHandler(queryData) {
      const actorUuid = queryData?.actorUuid ? String(queryData.actorUuid) : "";
      const lockKey = `Actor:${actorUuid}`;

      try {
        await _acquireLock(lockKey);
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
      try {
        const effectData = queryData?.effectData ?? null;
        if (!actorUuid || !effectData) return { ok: false, error: "Missing actorUuid/effectData" };

        const actor = await fromUuid(actorUuid);
        if (!actor) return { ok: false, error: `Actor not found for uuid=${actorUuid}` };
        if (actor.documentName !== "Actor") return { ok: false, error: "Target is not an Actor" };

        // Eligibility: GM preferred, otherwise an OWNER. Still validate.
        if (!(game.user?.isGM || actor.isOwner)) {
          return { ok: false, error: "Not authorized to create ActiveEffect on target Actor" };
        }

        // Best-effort duplicate suppression for rapid double-clicks.
        const sig = `createAE:${actorUuid}:${_stableStringify(effectData)}`;
        if (_isRecentDuplicate(sig)) return { ok: true, skipped: true };

        const cleaned = _sanitizeEmbeddedDocData("ActiveEffect", effectData);
        if (!cleaned || Object.keys(cleaned).length === 0) return { ok: false, error: "Invalid ActiveEffect data" };

        const created = await actor.createEmbeddedDocuments("ActiveEffect", [cleaned]);
        const effect = created?.[0] ?? null;
        if (!effect) return { ok: false, error: "ActiveEffect creation returned no document" };

        return { ok: true, effectId: effect.id, effectUuid: effect.uuid };
      } catch (err) {
        console.error("UESRPG | authority-proxy | createActiveEffect query handler failed", err);
        return { ok: false, error: err?.message ?? String(err) };
      } finally {
        _releaseLock(lockKey);
      }
    };
  }

  if (!CONFIG.queries[QUERY_UPDATE_DOCUMENT_V1]) {
    CONFIG.queries[QUERY_UPDATE_DOCUMENT_V1] = async function updateDocumentHandler(queryData) {
      try {
        const uuid = queryData?.uuid ? String(queryData.uuid) : "";
        const updateData = queryData?.updateData ?? null;
        if (!uuid || !updateData) return { ok: false, error: "Missing uuid/updateData" };

        const doc = await fromUuid(uuid);
        if (!doc) return { ok: false, error: `Document not found for uuid=${uuid}` };

        // Avoid using this generic lane for ChatMessage; keep the existing sanitization path.
        if (doc.documentName === "ChatMessage") return { ok: false, error: "Use updateChatMessage proxy for ChatMessage" };

        // Supported docs only.
        const allowedDocs = new Set(["Actor", "Item", "ActiveEffect", "Token"]);
        if (!allowedDocs.has(doc.documentName)) {
          return { ok: false, error: `Unsupported document type: ${doc.documentName}` };
        }

        // Eligibility: GM preferred, otherwise OWNER.
        if (!(game.user?.isGM || doc.isOwner)) {
          return { ok: false, error: "Not authorized to update target document" };
        }

        const cleaned = _sanitizeGenericUpdatePayload(doc, updateData);
        if (!cleaned || Object.keys(cleaned).length === 0) return { ok: false, error: "Empty/invalid update payload" };

        const lockKey = _lockKeyForDoc(doc);
        await _acquireLock(lockKey);
        try {
          await doc.update(cleaned);
        } finally {
          _releaseLock(lockKey);
        }

        return { ok: true };
      } catch (err) {
        console.error("UESRPG | authority-proxy | updateDocument query handler failed", err);
        return { ok: false, error: err?.message ?? String(err) };
      }
    };
  }

  if (!CONFIG.queries[QUERY_CREATE_EMBEDDED_DOCS_V1]) {
    CONFIG.queries[QUERY_CREATE_EMBEDDED_DOCS_V1] = async function createEmbeddedDocumentsHandler(queryData) {
      const actorUuid = queryData?.actorUuid ? String(queryData.actorUuid) : "";
      const embeddedName = queryData?.embeddedName ? String(queryData.embeddedName) : "";
      const lockKey = `Actor:${actorUuid}`;

      try {
        await _acquireLock(lockKey);
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
      try {
        const docsData = Array.isArray(queryData?.docsData) ? queryData.docsData : null;
        if (!actorUuid || !embeddedName || !docsData) return { ok: false, error: "Missing actorUuid/embeddedName/docsData" };

        if (embeddedName !== "ActiveEffect" && embeddedName !== "Item") {
          return { ok: false, error: `Unsupported embedded type: ${embeddedName}` };
        }

        const actor = await fromUuid(actorUuid);
        if (!actor || actor.documentName !== "Actor") return { ok: false, error: `Actor not found for uuid=${actorUuid}` };
        if (!(game.user?.isGM || actor.isOwner)) return { ok: false, error: "Not authorized to create embedded documents on target Actor" };

        const cleanedList = docsData
          .map((d) => _sanitizeEmbeddedDocData(embeddedName, d))
          .filter((d) => d && typeof d === "object" && Object.keys(d).length > 0);
        if (!cleanedList.length) return { ok: false, error: "No valid documents in docsData" };

        // Best-effort duplicate suppression for rapid double-clicks.
        const sig = `createEmbedded:${actorUuid}:${embeddedName}:${_stableStringify(cleanedList)}`;
        if (_isRecentDuplicate(sig)) return { ok: true, skipped: true, created: [] };

        const created = await actor.createEmbeddedDocuments(embeddedName, cleanedList);
        const descriptors = (created ?? []).map((d) => ({ id: d.id, uuid: d.uuid }));
        return { ok: true, created: descriptors };
      } catch (err) {
        console.error("UESRPG | authority-proxy | createEmbeddedDocuments query handler failed", err);
        return { ok: false, error: err?.message ?? String(err) };
      } finally {
        _releaseLock(lockKey);
      }
    };
  }

  if (!CONFIG.queries[QUERY_UPDATE_EMBEDDED_DOCS_V1]) {
    CONFIG.queries[QUERY_UPDATE_EMBEDDED_DOCS_V1] = async function updateEmbeddedDocumentsHandler(queryData) {
      const actorUuid = queryData?.actorUuid ? String(queryData.actorUuid) : "";
      const embeddedName = queryData?.embeddedName ? String(queryData.embeddedName) : "";
      const lockKey = `Actor:${actorUuid}`;

      try {
        await _acquireLock(lockKey);
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
      try {
        const updates = Array.isArray(queryData?.updates) ? queryData.updates : null;
        if (!actorUuid || !embeddedName || !updates) return { ok: false, error: "Missing actorUuid/embeddedName/updates" };

        if (embeddedName !== "ActiveEffect" && embeddedName !== "Item") {
          return { ok: false, error: `Unsupported embedded type: ${embeddedName}` };
        }

        const actor = await fromUuid(actorUuid);
        if (!actor || actor.documentName !== "Actor") return { ok: false, error: `Actor not found for uuid=${actorUuid}` };
        if (!(game.user?.isGM || actor.isOwner)) return { ok: false, error: "Not authorized to update embedded documents on target Actor" };

        const cleanedUpdates = updates
          .map((u) => {
            if (!u || typeof u !== "object") return null;
            const id = u._id ?? u.id;
            if (!id) return null;
            const cleaned = _sanitizeEmbeddedDocData(embeddedName, u);
            if (!cleaned) return null;
            // Ensure id survives.
            cleaned._id = String(id);
            return cleaned;
          })
          .filter(Boolean);
        if (!cleanedUpdates.length) return { ok: false, error: "No valid embedded document updates" };

        await actor.updateEmbeddedDocuments(embeddedName, cleanedUpdates);
        return { ok: true };
      } catch (err) {
        console.error("UESRPG | authority-proxy | updateEmbeddedDocuments query handler failed", err);
        return { ok: false, error: err?.message ?? String(err) };
      } finally {
        _releaseLock(lockKey);
      }
    };
  }

  if (!CONFIG.queries[QUERY_DELETE_EMBEDDED_DOCS_V1]) {
    CONFIG.queries[QUERY_DELETE_EMBEDDED_DOCS_V1] = async function deleteEmbeddedDocumentsHandler(queryData) {
      const actorUuid = queryData?.actorUuid ? String(queryData.actorUuid) : "";
      const embeddedName = queryData?.embeddedName ? String(queryData.embeddedName) : "";
      const lockKey = `Actor:${actorUuid}`;

      try {
        await _acquireLock(lockKey);
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
      try {
        const ids = Array.isArray(queryData?.ids) ? queryData.ids : null;
        if (!actorUuid || !embeddedName || !ids) return { ok: false, error: "Missing actorUuid/embeddedName/ids" };

        if (embeddedName !== "ActiveEffect" && embeddedName !== "Item") {
          return { ok: false, error: `Unsupported embedded type: ${embeddedName}` };
        }

        const actor = await fromUuid(actorUuid);
        if (!actor || actor.documentName !== "Actor") return { ok: false, error: `Actor not found for uuid=${actorUuid}` };
        if (!(game.user?.isGM || actor.isOwner)) return { ok: false, error: "Not authorized to delete embedded documents on target Actor" };

        const cleanedIds = ids.map((x) => String(x)).filter((x) => x.length > 0);
        if (!cleanedIds.length) return { ok: false, error: "No valid ids" };

        await actor.deleteEmbeddedDocuments(embeddedName, cleanedIds);
        return { ok: true };
      } catch (err) {
        console.error("UESRPG | authority-proxy | deleteEmbeddedDocuments query handler failed", err);
        return { ok: false, error: err?.message ?? String(err) };
      } finally {
        _releaseLock(lockKey);
      }
    };
  }
}

/**
 * Permission-safe ChatMessage update.
 *
 * - If current user can update, update directly.
 * - Otherwise, delegate to an active GM; if none, delegate to the message author.
 */
export async function requestUpdateChatMessage(message, payload, { timeout = 5000 } = {}) {
  if (!message) return false;

  // Direct path.
  if (canUserUpdateChatMessage(message, game.user)) {
    try {
      await message.update(payload);
      return true;
    } catch (err) {
      _dwarn("direct update failed; applying non-rendering fallback", { messageId: message.id, err });
      try {
        await message.update(payload, { render: false });
        if (ui?.chat) ui.chat.render?.(true);
        return true;
      } catch (err2) {
        console.error("UESRPG | authority-proxy | direct update fallback failed", { messageId: message.id, err: err2 });
        return false;
      }
    }
  }

  // Proxy path.
  const sanitized = sanitizeChatMessageUpdatePayload(payload);
  if (!sanitized || Object.keys(sanitized).length === 0) return false;

  const applier = _selectActiveGM() ?? _selectChatMessageAuthor(message);
  if (!applier) {
    ui.notifications?.warn?.("A GM (or the message author) must be online to update this opposed card.");
    return false;
  }

  _dlog("proxy update requested", { messageId: message.id, applierUserId: applier.id, requestedBy: game.user?.id ?? null });

  try {
    const resp = await applier.query(QUERY_UPDATE_CHAT_MESSAGE_V1, { messageId: message.id, payload: sanitized }, { timeout });
    if (!resp?.ok) {
      _dwarn("proxy update rejected", { messageId: message.id, resp });
      ui.notifications?.warn?.(`Failed to update opposed card: ${resp?.error ?? "unknown error"}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("UESRPG | authority-proxy | proxy update failed", { messageId: message.id, err });
    return false;
  }
}

/**
 * Permission-safe ActiveEffect creation on a target Actor.
 *
 * - If current user can create (GM or actor owner), do it directly.
 * - Otherwise, delegate to an active GM; if none, delegate to an active Actor OWNER.
 */
export async function requestCreateActiveEffect(actor, effectData, { timeout = 5000 } = {}) {
  if (!actor || !effectData) return null;

  const cleaned = _sanitizeEmbeddedDocData("ActiveEffect", effectData);
  if (!cleaned || Object.keys(cleaned).length === 0) return null;

  // Direct path.
  if (game.user?.isGM || actor.isOwner) {
    const created = await actor.createEmbeddedDocuments("ActiveEffect", [cleaned]);
    return created?.[0] ?? null;
  }

  const applier = _selectActiveGM() ?? _selectActorOwner(actor);
  if (!applier) {
    ui.notifications?.warn?.("A GM (or an owner of the target Actor) must be online to apply effects to this target.");
    return null;
  }

  _dlog("proxy createActiveEffect requested", { actorUuid: actor.uuid, applierUserId: applier.id, requestedBy: game.user?.id ?? null });

  try {
    const resp = await applier.query(QUERY_CREATE_ACTIVE_EFFECT_V1, { actorUuid: actor.uuid, effectData: cleaned }, { timeout });
    if (!resp?.ok) {
      _dwarn("proxy createActiveEffect rejected", { actorUuid: actor.uuid, resp });
      ui.notifications?.warn?.(`Failed to apply effect to target: ${resp?.error ?? "unknown error"}`);
      return null;
    }

    if (resp?.skipped) return null;

    // Best-effort fetch of the created effect.
    try {
      const eff = await fromUuid(resp.effectUuid);
      return eff ?? { id: resp.effectId, uuid: resp.effectUuid };
    } catch {
      return { id: resp.effectId, uuid: resp.effectUuid };
    }
  } catch (err) {
    console.error("UESRPG | authority-proxy | proxy createActiveEffect failed", { actorUuid: actor.uuid, err });
    return null;
  }
}

/**
 * Permission-safe generic document update.
 *
 * Supported:
 *  - Actor / Item / ActiveEffect / TokenDocument
 *
 * The payload is sanitized to conservative lanes.
 */
export async function requestUpdateDocument(docOrUuid, updateData, { timeout = 5000 } = {}) {
  if (!docOrUuid || !updateData) return false;

  const doc = (typeof docOrUuid === "string") ? await fromUuid(docOrUuid) : docOrUuid;
  if (!doc) return false;
  if (doc.documentName === "ChatMessage") return false;

  const cleaned = _sanitizeGenericUpdatePayload(doc, updateData);
  if (!cleaned || Object.keys(cleaned).length === 0) return false;

  // Direct path.
  if (game.user?.isGM || doc.isOwner) {
    try {
      await doc.update(cleaned);
      return true;
    } catch (err) {
      console.error("UESRPG | authority-proxy | direct document update failed", { uuid: doc.uuid, err });
      return false;
    }
  }

  const applier = _selectActiveGM() ?? _selectDocumentOwner(doc);
  if (!applier) {
    ui.notifications?.warn?.("A GM (or an owner of the target document) must be online to apply this change.");
    return false;
  }

  _dlog("proxy updateDocument requested", { uuid: doc.uuid, docName: doc.documentName, applierUserId: applier.id, requestedBy: game.user?.id ?? null });

  try {
    const resp = await applier.query(QUERY_UPDATE_DOCUMENT_V1, { uuid: doc.uuid, updateData: cleaned }, { timeout });
    if (!resp?.ok) {
      _dwarn("proxy updateDocument rejected", { uuid: doc.uuid, resp });
      ui.notifications?.warn?.(`Failed to apply change: ${resp?.error ?? "unknown error"}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("UESRPG | authority-proxy | proxy updateDocument failed", { uuid: doc.uuid, err });
    return false;
  }
}

/**
 * Permission-safe Actor embedded docs create/update/delete.
 *
 * Supported embedded types: ActiveEffect, Item.
 */
export async function requestCreateEmbeddedDocuments(actor, embeddedName, docsData, { timeout = 5000 } = {}) {
  if (!actor || !embeddedName || !Array.isArray(docsData) || !docsData.length) return [];
  if (embeddedName !== "ActiveEffect" && embeddedName !== "Item") return [];

  const cleanedList = docsData
    .map((d) => _sanitizeEmbeddedDocData(embeddedName, d))
    .filter((d) => d && typeof d === "object" && Object.keys(d).length > 0);
  if (!cleanedList.length) return [];

  // Direct path.
  if (game.user?.isGM || actor.isOwner) {
    return await actor.createEmbeddedDocuments(embeddedName, cleanedList);
  }

  const applier = _selectActiveGM() ?? _selectActorOwner(actor);
  if (!applier) {
    ui.notifications?.warn?.("A GM (or an owner of the target Actor) must be online to apply this change.");
    return [];
  }

  _dlog("proxy createEmbeddedDocuments requested", { actorUuid: actor.uuid, embeddedName, applierUserId: applier.id, requestedBy: game.user?.id ?? null });
  try {
    const resp = await applier.query(QUERY_CREATE_EMBEDDED_DOCS_V1, { actorUuid: actor.uuid, embeddedName, docsData: cleanedList }, { timeout });
    if (!resp?.ok) {
      _dwarn("proxy createEmbeddedDocuments rejected", { actorUuid: actor.uuid, embeddedName, resp });
      ui.notifications?.warn?.(`Failed to create embedded documents: ${resp?.error ?? "unknown error"}`);
      return [];
    }
    if (resp?.skipped) return [];

    // Best-effort hydrate.
    const created = [];
    for (const d of (resp.created ?? [])) {
      try {
        const doc = d?.uuid ? await fromUuid(d.uuid) : null;
        if (doc) created.push(doc);
      } catch {
        /* ignore */
      }
    }
    return created;
  } catch (err) {
    console.error("UESRPG | authority-proxy | proxy createEmbeddedDocuments failed", { actorUuid: actor.uuid, embeddedName, err });
    return [];
  }
}

export async function requestUpdateEmbeddedDocuments(actor, embeddedName, updates, { timeout = 5000 } = {}) {
  if (!actor || !embeddedName || !Array.isArray(updates) || !updates.length) return false;
  if (embeddedName !== "ActiveEffect" && embeddedName !== "Item") return false;

  // Direct path.
  if (game.user?.isGM || actor.isOwner) {
    await actor.updateEmbeddedDocuments(embeddedName, updates);
    return true;
  }

  const applier = _selectActiveGM() ?? _selectActorOwner(actor);
  if (!applier) {
    ui.notifications?.warn?.("A GM (or an owner of the target Actor) must be online to apply this change.");
    return false;
  }

  _dlog("proxy updateEmbeddedDocuments requested", { actorUuid: actor.uuid, embeddedName, applierUserId: applier.id, requestedBy: game.user?.id ?? null });
  try {
    const resp = await applier.query(QUERY_UPDATE_EMBEDDED_DOCS_V1, { actorUuid: actor.uuid, embeddedName, updates }, { timeout });
    if (!resp?.ok) {
      _dwarn("proxy updateEmbeddedDocuments rejected", { actorUuid: actor.uuid, embeddedName, resp });
      ui.notifications?.warn?.(`Failed to update embedded documents: ${resp?.error ?? "unknown error"}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("UESRPG | authority-proxy | proxy updateEmbeddedDocuments failed", { actorUuid: actor.uuid, embeddedName, err });
    return false;
  }
}

export async function requestDeleteEmbeddedDocuments(actor, embeddedName, ids, { timeout = 5000 } = {}) {
  if (!actor || !embeddedName || !Array.isArray(ids) || !ids.length) return false;
  if (embeddedName !== "ActiveEffect" && embeddedName !== "Item") return false;

  // Direct path.
  if (game.user?.isGM || actor.isOwner) {
    await actor.deleteEmbeddedDocuments(embeddedName, ids);
    return true;
  }

  const applier = _selectActiveGM() ?? _selectActorOwner(actor);
  if (!applier) {
    ui.notifications?.warn?.("A GM (or an owner of the target Actor) must be online to apply this change.");
    return false;
  }

  _dlog("proxy deleteEmbeddedDocuments requested", { actorUuid: actor.uuid, embeddedName, applierUserId: applier.id, requestedBy: game.user?.id ?? null });
  try {
    const resp = await applier.query(QUERY_DELETE_EMBEDDED_DOCS_V1, { actorUuid: actor.uuid, embeddedName, ids }, { timeout });
    if (!resp?.ok) {
      _dwarn("proxy deleteEmbeddedDocuments rejected", { actorUuid: actor.uuid, embeddedName, resp });
      ui.notifications?.warn?.(`Failed to delete embedded documents: ${resp?.error ?? "unknown error"}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("UESRPG | authority-proxy | proxy deleteEmbeddedDocuments failed", { actorUuid: actor.uuid, embeddedName, err });
    return false;
  }
}
