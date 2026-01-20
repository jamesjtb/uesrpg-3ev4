/**
 * Shared listener binding for Actor sheets (PC + NPC).
 * Keeps templates unchanged; consolidates common click handlers to reduce duplication and regressions.
 *
 * Target: Foundry VTT v13 (AppV1 ActorSheet).
 */

import { unlinkAllItemsFromContainer, unlinkItemFromContainer } from "./sheet-containers.js";
import { SYSTEM_ID, NPC_KNOWN_FLAG, getNpcSpecialActionsKnownMap } from "../../core/combat/combat-style-utils.js";

/**
 * Bind non-destructive, shared listeners that should exist for both PC and NPC sheets.
 *
 * @param {foundry.appv1.sheets.ActorSheet} sheet
 * @param {JQuery} html
 */
export function bindCommonSheetListeners(sheet, html) {
  if (!sheet || !html) return;

  // Active Effects (Effects tab)
  if (typeof sheet._onEffectControl === "function") {
    html.find(".effect-control").off("click.uesrpgCommon").on("click.uesrpgCommon", sheet._onEffectControl.bind(sheet));
  }

  // Combat quick actions
  if (typeof sheet._onCombatQuickAction === "function") {
    html.find(".uesrpg-quick-action").off("click.uesrpgCommon").on("click.uesrpgCommon", sheet._onCombatQuickAction.bind(sheet));
  }

  // Combat Actions subtabs (Primary/Secondary/Reactions/Special)
  const applyActionsSubtab = (tab) => {
    if (!tab) return;
    html.find(".uesrpg-actions-subtab").removeClass("active");
    html.find(`.uesrpg-actions-subtab[data-actionstab="${tab}"]`).addClass("active");
    html.find(".uesrpg-actions-panel").removeClass("active");
    html.find(`.uesrpg-actions-panel[data-actionstab="${tab}"]`).addClass("active");
  };

  const initialActive = html.find(".uesrpg-actions-subtab.active")?.[0]?.dataset?.actionstab;
  if (!sheet._uesrpgActionsSubtab && initialActive) sheet._uesrpgActionsSubtab = initialActive;
  if (sheet._uesrpgActionsSubtab) applyActionsSubtab(sheet._uesrpgActionsSubtab);

  const onActionsSubtab = (ev) => {
    ev.preventDefault();
    const el = ev.currentTarget;
    const tab = el?.dataset?.actionstab;
    if (!tab) return;

    sheet._uesrpgActionsSubtab = tab;

    html.find(".uesrpg-actions-subtab").removeClass("active");
    $(el).addClass("active");

    html.find(".uesrpg-actions-panel").removeClass("active");
    html.find(`.uesrpg-actions-panel[data-actionstab="${tab}"]`).addClass("active");
  };

  html.find(".uesrpg-actions-subtab")
    .off("click.uesrpgCommon")
    .on("click.uesrpgCommon", onActionsSubtab)
    .off("keydown.uesrpgCommon")
    .on("keydown.uesrpgCommon", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        ev.currentTarget?.click?.();
      }
    });

  // Active Combat Style selector (Option 2)
  // Stores selection on the Actor and drives Advantage special-action injection.
  const styleSelect = html.find(".uesrpg-active-combat-style");
  styleSelect.off("change.uesrpgCommon").on("change.uesrpgCommon", async (ev) => {
    if (!sheet?.options?.editable) return;
    const v = String(ev?.currentTarget?.value ?? "").trim();
    try {
      if (!v) await sheet.actor.setFlag("uesrpg-3ev4", "activeCombatStyleId", "");
      else await sheet.actor.setFlag("uesrpg-3ev4", "activeCombatStyleId", v);
      sheet.render(false);
    } catch (err) {
      console.error("UESRPG | Failed to update active combat style", { actor: sheet.actor?.uuid, err });
      ui.notifications?.error?.("Failed to update active combat style");
    }
  });


  // NPC: toggle "Known/Unknown" state directly on the Actor (no Combat Style item needed).
  // This drives which Special Actions appear as Advantage options during Advantage utilization.
  const knownToggleEls = html.find(".uesrpg-sa-known-toggle");
  knownToggleEls
    .off("click.uesrpgCommon")
    .on("click.uesrpgCommon", async (ev) => {
      if (!sheet?.options?.editable) return;

      const actorType = String(sheet?.actor?.type ?? "").toLowerCase();
      if (actorType !== "npc") return;

      const el = ev.currentTarget;
      const saId = String(el?.dataset?.saId ?? "").trim();
      if (!saId) return;

      try {
        const current = getNpcSpecialActionsKnownMap(sheet.actor);
        const next = { ...current, [saId]: !Boolean(current?.[saId]) };
        await sheet.actor.setFlag(SYSTEM_ID, NPC_KNOWN_FLAG, next);
        sheet.render(false);
      } catch (err) {
        console.error("UESRPG | Failed to toggle NPC Special Action known state", { actor: sheet.actor?.uuid, saId, err });
        ui.notifications?.error?.("Failed to update Special Action state");
      }
    })
    .off("keydown.uesrpgCommon")
    .on("keydown.uesrpgCommon", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        ev.currentTarget?.click?.();
      }
    });

  // Items tab QoL (per-user UI state)
  if (typeof sheet._onToggleGroupCollapse === "function") {
    html.find(".uesrpg-group-toggle")
      .off("click.uesrpgCommon")
      .on("click.uesrpgCommon", sheet._onToggleGroupCollapse.bind(sheet))
      .off("keydown.uesrpgCommon")
      .on("keydown.uesrpgCommon", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.currentTarget?.click?.();
        }
      });
  }

  if (typeof sheet._onItemSearch === "function") {
    html.find("#uesrpg-item-search").off("input.uesrpgCommon").on("input.uesrpgCommon", sheet._onItemSearch.bind(sheet));
  }

  if (typeof sheet._onLoadoutSave === "function") {
    html.find(".uesrpg-loadout-save").off("click.uesrpgCommon").on("click.uesrpgCommon", sheet._onLoadoutSave.bind(sheet));
  }
  if (typeof sheet._onLoadoutApply === "function") {
    html.find(".uesrpg-loadout-apply").off("click.uesrpgCommon").on("click.uesrpgCommon", sheet._onLoadoutApply.bind(sheet));
  }
  if (typeof sheet._onLoadoutDelete === "function") {
    html.find(".uesrpg-loadout-delete").off("click.uesrpgCommon").on("click.uesrpgCommon", sheet._onLoadoutDelete.bind(sheet));
  }

  // Item Create Buttons
  if (typeof sheet._onItemCreate === "function") {
    html.find(".item-create").off("click.uesrpgCommon").on("click.uesrpgCommon", sheet._onItemCreate.bind(sheet));
  }

  // Apply persisted collapsed groups after initial render
  if (typeof sheet._applyCollapsedGroups === "function") {
    try {
      void sheet._applyCollapsedGroups(html);
    } catch (_e) {
      // no-op
    }
  }
}

/**
 * Bind shared inventory click handlers that should only be available when the sheet is editable.
 *
 * @param {foundry.appv1.sheets.ActorSheet} sheet
 * @param {JQuery} html
 */
export function bindCommonEditableInventoryListeners(sheet, html) {
  if (!sheet || !html) return;
  if (!sheet.options?.editable) return;
  if (!sheet.actor) return;

  // Duplicate via contextmenu on item name
  html.find(".item-name")
    .off("contextmenu.uesrpgCommon")
    .on("contextmenu.uesrpgCommon", async (ev) => {
      const li = ev.currentTarget?.closest?.(".item");
      const itemId = li?.dataset?.itemId;
      if (!itemId) return;

      const item = sheet.actor.items.get(itemId);
      if (!item) return;

      if (typeof sheet._duplicateItem === "function") sheet._duplicateItem(item);
    });

  // Open item sheet on click
  html.find(".item-name")
    .off("click.uesrpgCommon")
    .on("click.uesrpgCommon", async (ev) => {
      const li = ev.currentTarget?.closest?.(".item");
      const itemId = li?.dataset?.itemId;
      if (!itemId) return;

      const item = sheet.actor.items.get(itemId);
      if (!item) return;

      item.sheet.render(true);

      // Preserve existing behavior: trigger a benign update to ensure reactive data paths refresh.
      try {
        await item.update({ "system.value": item.system.value });
      } catch (_e) {
        // Some items may not have system.value; ignore.
      }
    });

  // Open container sheet from backpack icon
  html.find(".fa-backpack")
    .off("click.uesrpgCommon")
    .on("click.uesrpgCommon", async (ev) => {
      const containerId = ev.currentTarget?.dataset?.containerId;
      if (!containerId) return;

      const containerItem = sheet.actor.items.get(containerId);
      if (!containerItem) return;

      containerItem.sheet.render(true);

      try {
        await containerItem.update({ "system.value": containerItem.system.value });
      } catch (_e) {
        // ignore
      }
    });

  // Delete inventory item (container-safe)
  html.find(".item-delete")
    .off("click.uesrpgCommon")
    .on("click.uesrpgCommon", async (ev) => {
      const li = ev.currentTarget?.closest?.(".item");
      const itemId = li?.dataset?.itemId;
      if (!itemId) return;

      const itemToDelete = sheet.actor.items.get(itemId) ?? sheet.actor.items.find((i) => i?._id == itemId);
      if (!itemToDelete) return;

      // If deleting a container, first unlink all contained items (non-destructive for those items)
      if (itemToDelete.type === "container") {
        await unlinkAllItemsFromContainer(sheet.actor, itemToDelete);
      } else {
        // If deleting an item that is in a container, unlink it first
        await unlinkItemFromContainer(sheet.actor, itemToDelete);
      }

      await sheet.actor.deleteEmbeddedDocuments("Item", [itemId]);
    });
}