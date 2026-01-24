/**
 * @deprecated
 *
 * This module previously contained item migration / normalization logic.
 * The canonical implementation now lives in src/core/migrations/items.js.
 *
 * This file is kept as a compatibility shim for any external imports.
 */

export { migrateItemsIfNeeded } from "../migrations/items.js";
