/**
 * module/dev/opposed-diagnostics.js
 *
 * GM-facing diagnostics helpers for the opposed workflow.
 *
 * Goals:
 *  - Provide a per-client, in-memory trace ring buffer keyed by opposed card ChatMessage id.
 *  - Expose safe console utilities for quickly dumping an opposed card snapshot.
 *
 * Non-goals:
 *  - No schema changes
 *  - No UI changes
 */

const NAMESPACE = "uesrpg-3ev4";

const MAX_EVENTS_PER_CARD = 200;

/** @type {Map<string, Array<object>>} */
const _traceByMessageId = new Map();

function _isGM() {
  return Boolean(game.user?.isGM);
}

function _warnGMOnly(fnName) {
  try {
    ui?.notifications?.warn?.(`Opposed diagnostics '${fnName}' is GM-only on this client.`);
  } catch (_e) {
    /* no-op */
  }
}

function _now() {
  return Date.now();
}

function _safeClone(value) {
  try {
    if (foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    return structuredClone(value);
  } catch (_e) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_e2) {
      return value;
    }
  }
}

function _summarizeDocLike(v) {
  try {
    if (!v || typeof v !== "object") return v;
    const isDoc = typeof v.documentName === "string" && (typeof v.id === "string" || typeof v._id === "string");
    if (!isDoc) return v;
    return {
      documentName: v.documentName,
      id: v.id ?? v._id ?? null,
      uuid: v.uuid ?? null,
      name: v.name ?? null
    };
  } catch (_e) {
    return v;
  }
}

function _sanitizePayload(payload) {
  // Keep the payload reasonably sized and avoid embedding full Documents.
  if (payload == null) return null;
  if (typeof payload !== "object") return payload;

  const cloned = _safeClone(payload);
  if (!cloned || typeof cloned !== "object") return cloned;

  // Shallow sanitize: summarize doc-like values on the top level.
  for (const [k, v] of Object.entries(cloned)) {
    if (v && typeof v === "object") {
      cloned[k] = _summarizeDocLike(v);
    }
  }

  // Cap large breakdown arrays if present.
  if (cloned.tn && typeof cloned.tn === "object" && Array.isArray(cloned.tn.breakdown)) {
    if (cloned.tn.breakdown.length > 50) cloned.tn.breakdown = cloned.tn.breakdown.slice(0, 50);
  }

  return cloned;
}

function _pushTrace(messageId, event, payload) {
  const id = String(messageId ?? "").trim();
  if (!id) return;

  const entry = {
    at: _now(),
    event: String(event ?? ""),
    payload: _sanitizePayload(payload)
  };

  const buf = _traceByMessageId.get(id) ?? [];
  buf.push(entry);
  if (buf.length > MAX_EVENTS_PER_CARD) buf.splice(0, buf.length - MAX_EVENTS_PER_CARD);
  _traceByMessageId.set(id, buf);
}

function _findLatestOpposedMessageId() {
  try {
    const msgs = game.messages?.contents ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const opposed = m?.flags?.[NAMESPACE]?.opposed;
      if (opposed) return m.id;
    }
    return null;
  } catch (_e) {
    return null;
  }
}

function _getAuthorSummary(msg) {
  try {
    // Prefer the modern author field (User object).
    const author = msg?.author ?? null;
    const authorId =
      author?.id ??
      msg?._source?.author ??
      msg?._source?.user ??
      msg?.data?.author ??
      msg?.data?.user ??
      null;

    const summary = author
      ? { id: author.id, name: author.name ?? null }
      : (authorId ? { id: String(authorId), name: null } : null);

    return { author: summary, authorId: authorId ? String(authorId) : null };
  } catch (_e) {
    return { author: null, authorId: null };
  }
}

/**
 * Register console helpers under game.uesrpg.debug.*
 *
 * Exposed (GM only):
 *  - game.uesrpg.debug.dumpOpposed(messageId)
 *  - game.uesrpg.debug.dumpLatestOpposed()
 *  - game.uesrpg.debug.dumpOpposedToConsole(messageId)
 *  - game.uesrpg.debug.dumpLatestOpposedToConsole()
 *
 * Exposed (all users):
 *  - game.uesrpg.debug.recordOpposedEvent(messageId, event, payload)
 */
export function registerOpposedDiagnostics() {
  if (!game.uesrpg) game.uesrpg = {};
  if (!game.uesrpg.debug) game.uesrpg.debug = {};

  // Always expose the recorder so opposed-workflow can push traces without hard imports.
  if (!game.uesrpg.debug.recordOpposedEvent) {
    game.uesrpg.debug.recordOpposedEvent = (messageId, event, payload) => {
      try {
        _pushTrace(messageId, event, payload);
      } catch (_e) {
        /* no-op */
      }
    };
  }

  // GM-only dump helpers
  // Always register the functions so macros / console commands do not throw on non-GM clients.
  // Non-GM clients receive a safe stub response.
  if (game.uesrpg.debug.dumpOpposed) return;

  game.uesrpg.debug.dumpOpposed = async (messageId) => {
    if (!_isGM()) {
      _warnGMOnly("dumpOpposed");
      return null;
    }
    const id = String(messageId ?? "").trim();
    if (!id) return null;

    const msg = game.messages?.get?.(id) ?? null;
    const flags = msg?.flags?.[NAMESPACE]?.opposed ?? null;

    const { author, authorId } = _getAuthorSummary(msg);

    return {
      messageId: id,
      speaker: msg?.speaker ?? null,
      author,
      authorId,
      opposed: _safeClone(flags),
      trace: _safeClone(_traceByMessageId.get(id) ?? [])
    };
  };

  game.uesrpg.debug.dumpLatestOpposed = async () => {
    if (!_isGM()) {
      _warnGMOnly("dumpLatestOpposed");
      return null;
    }
    const id = _findLatestOpposedMessageId();
    if (!id) return null;
    return game.uesrpg.debug.dumpOpposed(id);
  };

  game.uesrpg.debug.dumpOpposedToConsole = async (messageId) => {
    if (!_isGM()) {
      _warnGMOnly("dumpOpposedToConsole");
      return null;
    }
    const snap = await game.uesrpg.debug.dumpOpposed(messageId);
    // eslint-disable-next-line no-console
    console.log("UESRPG Opposed | snapshot", snap);
    return snap;
  };

  game.uesrpg.debug.dumpLatestOpposedToConsole = async () => {
    if (!_isGM()) {
      _warnGMOnly("dumpLatestOpposedToConsole");
      return null;
    }
    const snap = await game.uesrpg.debug.dumpLatestOpposed();
    // eslint-disable-next-line no-console
    console.log("UESRPG Opposed | latest snapshot", snap);
    return snap;
  };
}
