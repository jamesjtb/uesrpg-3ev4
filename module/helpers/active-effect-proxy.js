/**
 * module/helpers/active-effect-proxy.js
 *
 * Backwards-compatible wrapper for ActiveEffect proxy creation.
 *
 * Canonical implementation lives in module/helpers/authority-proxy.js.
 */

import { registerAuthorityProxy, requestCreateActiveEffect as requestCreateActiveEffectAuthority } from "./authority-proxy.js";

/**
 * Register the query handler that performs the actual ActiveEffect creation.
 * Must be called during init/ready.
 */
export function registerActiveEffectProxy() {
  registerAuthorityProxy();
}

/**
 * Request creation of an ActiveEffect on the given Actor.
 * Returns the created ActiveEffect document when possible, otherwise a minimal descriptor.
 */
export async function requestCreateActiveEffect(actor, effectData, { timeout = 5000 } = {}) {
  return requestCreateActiveEffectAuthority(actor, effectData, { timeout });
}
