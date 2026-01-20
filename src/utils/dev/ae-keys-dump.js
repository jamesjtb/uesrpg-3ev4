/**
 * Active Effect Attribute Key Inspector
 * Foundry VTT v13 (AppV1) compatible.
 *
 * This tool enumerates system data paths on an Actor and classifies them as:
 * - source: present on actor._source.system (persisted)
 * - derived: present only on actor.system (prepared/derived)
 *
 * Use this to identify reliable Active Effect targets.
 *
 * Usage:
 *   const actor = game.actors.getName("My Actor");
 *   await game.uesrpg.dumpAEKeys(actor);
 *   // or press the sheet header button "AE Keys" (GM only)
 */

function _isPlainObject(v) {
  return v !== null && typeof v === "object" && (v.constructor === Object || Object.getPrototypeOf(v) === null);
}

function _flatten(obj, prefix = "system", out = new Set()) {
  if (obj === null || obj === undefined) return out;

  // Arrays: include index paths (rarely useful for AE but included for completeness)
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      const p = `${prefix}.${i}`;
      if (_isPlainObject(v) || Array.isArray(v)) _flatten(v, p, out);
      else out.add(p);
    }
    return out;
  }

  // Objects
  if (_isPlainObject(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const p = `${prefix}.${k}`;
      if (_isPlainObject(v) || Array.isArray(v)) _flatten(v, p, out);
      else out.add(p);
    }
    return out;
  }

  // Primitive
  out.add(prefix);
  return out;
}

function _toMarkdownTable(rows) {
  const header = `| Key | Class |\n|---|---|`;
  const body = rows.map(r => `| ${r.key} | ${r.kind} |`).join("\n");
  return `${header}\n${body}`;
}

/**
 * Dump AE keys for an Actor.
 * @param {Actor} actor
 * @param {object} [opts]
 * @param {boolean} [opts.print=true] Print to console.
 * @param {boolean} [opts.includeDerived=true] Include derived keys in output.
 * @returns {Promise<{rows: Array<{key:string, kind:'source'|'derived'}>, markdown: string}>}
 */
export async function dumpAEKeys(actor, opts = {}) {
  const { print = true, includeDerived = true } = opts;

  if (!actor) throw new Error("dumpAEKeys | Missing actor");

  // Ensure data is prepared
  actor.prepareData();

  const sourceSystem = actor._source?.system ?? {};
  const preparedSystem = actor.system ?? {};

  const sourceKeys = Array.from(_flatten(sourceSystem, "system", new Set()));
  const preparedKeys = Array.from(_flatten(preparedSystem, "system", new Set()));

  const sourceSet = new Set(sourceKeys);

  const rows = [];
  for (const k of preparedKeys.sort((a, b) => a.localeCompare(b))) {
    const kind = sourceSet.has(k) ? "source" : "derived";
    if (!includeDerived && kind === "derived") continue;
    rows.push({ key: k, kind });
  }

  const markdown = _toMarkdownTable(rows);

  if (print) {
    console.group(`UESRPG | AE Key Dump | ${actor.name}`);
    console.log(markdown);
    console.groupEnd();
  }

  return { rows, markdown };
}
