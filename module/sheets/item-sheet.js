import { UESRPG } from "../constants.js";
import { SPECIAL_ACTIONS } from "../config/special-actions.js";

/**
 * Extend the basic foundry.appv1.sheets.ItemSheet with some very simple modifications
 * @extends {foundry.appv1.sheets.ItemSheet}
 */
export class SimpleItemSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "item"],
      width: 520,
      height: 600,  // Increased default height to ensure content is visible
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
      // Explicitly keep core ItemSheet behavior deterministic.
      // Some worlds/users run with non-default sheet settings; Combat Style editing relies on submit-on-close.
      submitOnClose: true
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get template() {
    const path = "systems/uesrpg-3ev4/templates";
    return `${path}/${this.item.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const data = await super.getData();
    data.dtypes = ["String", "Number", "Boolean"];
    data.isGM = game.user.isGM;
    data.editable = data.options.editable;
    const itemData = data.item;

    // Enrich Description (AppV1-safe)
    data.item.system.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      itemData.system.description,
      { async: true }
    );

    // --------------------------------------------
    // Armor: Effective Weight Class (derived)
    // --------------------------------------------
    if (data.item && data.item.type === "armor") {
      const base = (data.item.system && data.item.system.weightClass != null) ? data.item.system.weightClass : "none";
      const quality = (data.item.system && data.item.system.qualityLevel != null) ? data.item.system.qualityLevel : "common";
      const order = ["none", "light", "medium", "heavy", "superheavy", "crippling"];
      let i = order.indexOf(base);
      if (i === -1) i = 0;
      if (quality === "inferior") i += 1;
      else if (quality === "superior") i -= 1;
      i = Math.max(0, Math.min(order.length - 1, i));
      data.item.system.effectiveWeightClass = order[i];
    }

    // --------------------------------------------
    // Item option lists for selects (v13-safe)
    // --------------------------------------------
    data.weaponQualityOptions = UESRPG.WEAPON_QUALITY_LEVELS;
    data.weaponMaterialOptions = UESRPG.WEAPON_MATERIALS;
    data.attackModeOptions = { melee: "Melee", ranged: "Ranged" };
    data.armorWeightClassOptions = UESRPG.ARMOR_WEIGHT_CLASSES;
    data.ammoArrowTypeOptions = UESRPG.AMMO_ARROW_TYPES;
    data.ammoMaterialOptions = UESRPG.AMMO_MATERIALS;
    data.armorMaterialOptions = UESRPG.ARMOR_MATERIALS;
    data.armorClassOptions = UESRPG.ARMOR_CLASSES;
    data.shieldTypeOptions = UESRPG.SHIELD_TYPES;

    // --------------------------------------------
    // Weapon (ranged): ammunition selection options (actor inventory)
    // --------------------------------------------
    if (data.item && data.item.type === "weapon" && data.item.actor) {
      const ammoItems = data.item.actor.items.filter(i => i.type === "ammunition");
      data.ammoOptions = ammoItems.map(i => ({
        value: i.id,
        label: `${i.name} (x${Number((i.system && i.system.quantity != null) ? i.system.quantity : 0)})`
      }));
    } else {
      data.ammoOptions = [];
    }


    // --------------------------------------------
    // Combat Style: Special Actions registry + safe defaults
    // --------------------------------------------
    if (data.item && data.item.type === "combatStyle") {
      // Ensure schema lanes exist even for older items.
      if (!Array.isArray(data.item.system.trainedEquipment)) data.item.system.trainedEquipment = ["","","","",""];
      if (data.item.system.trainedEquipment.length < 5) {
        data.item.system.trainedEquipment = (data.item.system.trainedEquipment.concat(["","","","",""]).slice(0, 5));
      }
      if (!data.item.system.specialAdvantages || typeof data.item.system.specialAdvantages !== "object") data.item.system.specialAdvantages = {};
      data.specialActionsRegistry = SPECIAL_ACTIONS;
      // Embedded Combat Style only: show whether this style is the Actor's active selection.
      try {
        if (data.item.actor) {
          const activeId = data.item.actor.getFlag?.("uesrpg-3ev4", "activeCombatStyleId");
          data.isActiveCombatStyle = Boolean(activeId && String(activeId) === String(data.item.id));
        } else {
          data.isActiveCombatStyle = false;
        }
      } catch (_e) {
        data.isActiveCombatStyle = false;
      }
    }
    // --------------------------------------------
    // Ammunition: derived Price / Shot (from Price / 10)
    // --------------------------------------------
    if (data.item && data.item.type === "ammunition") {
      const p10 = Number((data.item.system && data.item.system.pricePer10 != null) ? data.item.system.pricePer10 : 0);
      data.item.system.pricePerShot = Math.round((p10 / 10) * 100) / 100;
    }

    // --------------------------------------------
    // Structured Qualities v1 (shared)
    // --------------------------------------------
    // Structured qualities: show a type-specific "core" grid + a set of togglable "other traits".
    const itemType = data.item ? data.item.type : null;

    // NOTE: support multiple export locations/names from earlier patches so sheets never silently render empty.
    // Canonical in this repo is QUALITIES_CORE_BY_TYPE and TRAITS_BY_TYPE.
    const coreByType =
      (UESRPG.CONSTANTS && UESRPG.CONSTANTS.QUALITIES_CORE_BY_TYPE) ||
      UESRPG.QUALITIES_CORE_BY_TYPE ||
      (UESRPG.CONSTANTS && UESRPG.CONSTANTS.QUALITIES_CATALOG_BY_TYPE) ||
      UESRPG.QUALITIES_CATALOG_BY_TYPE;

    const traitsByType =
      (UESRPG.CONSTANTS && UESRPG.CONSTANTS.TRAITS_BY_TYPE) ||
      UESRPG.TRAITS_BY_TYPE ||
      (UESRPG.CONSTANTS && UESRPG.CONSTANTS.QUALITIES_TRAITS_BY_TYPE) ||
      UESRPG.QUALITIES_TRAITS_BY_TYPE;

    data.qualitiesCatalog = (coreByType && itemType) ? (coreByType[itemType] || UESRPG.QUALITIES_CATALOG) : UESRPG.QUALITIES_CATALOG;
    // Template compatibility: newer sheets reference `coreQualitiesCatalog`.
    data.coreQualitiesCatalog = data.qualitiesCatalog;

    // Armor cleanup: ensure weapon-only "Silver" never appears in armor qualities UI, regardless of
    // which catalog export a world is using.
    if (itemType === "armor" && Array.isArray(data.coreQualitiesCatalog)) {
      data.coreQualitiesCatalog = data.coreQualitiesCatalog.filter(q => q && q.key !== "silver");
      data.qualitiesCatalog = data.coreQualitiesCatalog;
    }

    // Trait catalog (type-specific) with selected flags.
    const traitsSrc = (data.item && data.item.system) ? data.item.system.qualitiesTraits : null;
    const traits = Array.isArray(traitsSrc) ? traitsSrc : [];
    const traitCatalog = (traitsByType && itemType) ? (traitsByType[itemType] || []) : [];
    data.traitsCatalog = traitCatalog.map(t => ({ ...t, selected: traits.includes(t.key) }));
    data.traitsSelected = traits.reduce((acc, k) => {
      acc[k] = true;
      return acc;
    }, {});

    const structuredSrc = (data.item && data.item.system) ? data.item.system.qualitiesStructured : null;
    const structured = Array.isArray(structuredSrc) ? structuredSrc : [];
    const selectedToggle = {};
    const selectedValue = {};
    for (const q of structured) {
      if (!q || !q.key) continue;
      // If a structured quality exists it is "on". Some qualities may optionally carry a numeric X value.
      selectedToggle[q.key] = true;
      if (typeof q.value === "number") selectedValue[q.key] = q.value;
    }
    data.qualitiesSelectedToggle = selectedToggle;
    data.qualitiesSelectedValue = selectedValue;

    // Active Effects list for templates (plain objects)
    data.effects = (this.item && this.item.effects) ? this.item.effects.contents.map(e => e.toObject()) : [];

    return data;
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    // ------------------------------------------------------------
    // Other Traits selection (checkbox pill UI)
    // ------------------------------------------------------------
    // We accept BOTH:
    // 1) the new checkbox-style inputs: qualitiesTraits.toggle.<key>
    // 2) the older <select multiple name="system.qualitiesTraits"> value
    // Then we normalize into system.qualitiesTraits (array of keys).
    const selectedTraits = new Set();

    // (2) Legacy multiselect (keep compatible in case a world has older templates cached)
    if (Object.prototype.hasOwnProperty.call(formData, "system.qualitiesTraits")) {
      const raw = formData["system.qualitiesTraits"];
      if (Array.isArray(raw)) raw.filter(Boolean).forEach(v => selectedTraits.add(String(v)));
      else if (typeof raw === "string" && raw.trim()) selectedTraits.add(raw.trim());
    }

    // (1) New checkbox toggles
    const traitsTogglePrefix = "qualitiesTraits.toggle.";
    for (const [k, v] of Object.entries(formData)) {
      if (!k.startsWith(traitsTogglePrefix)) continue;
      const key = k.slice(traitsTogglePrefix.length);
      if (v) selectedTraits.add(key);
      delete formData[k];
    }

    // Persist deterministically (sorted keys)
    formData["system.qualitiesTraits"] = Array.from(selectedTraits).filter(Boolean).sort((a, b) => a.localeCompare(b));

    // Extract structured qualities helper fields into system.qualitiesStructured.
    // Use a Map so toggle+value for the same key can be merged into a single entry.
    const structuredMap = new Map();
    const togglePrefix = "qualitiesStructured.toggle.";
    const valuePrefix = "qualitiesStructured.value.";

    // Reach mirroring: header Reach must mirror Structured Qualities (Reach hasValue).
    // Source of truth precedence: structured Reach (if provided) > system.reach.
    let reachFromStructured = null;
    let reachFromSystem = null;
    if (Object.prototype.hasOwnProperty.call(formData, "system.reach")) {
      reachFromSystem = formData["system.reach"];
    }

    for (const [k, v] of Object.entries(formData)) {
      if (k.startsWith(togglePrefix)) {
        const key = k.slice(togglePrefix.length);
        if (v) structuredMap.set(key, { key });
        delete formData[k];
        continue;
      }

      if (k.startsWith(valuePrefix)) {
        const key = k.slice(valuePrefix.length);
        const num = Number(v);
        if (!Number.isNaN(num) && num !== 0) {
          if (key === "reach") reachFromStructured = num;
          structuredMap.set(key, { key, value: num });
        }
        delete formData[k];
      }
    }

    const structured = Array.from(structuredMap.values());
    // ------------------------------------------------------------
    // Runed quality (RAW): On successful creation, armor/weapon gains Magic.
    // Armor additionally gains +1 Magic AR. We implement this as a safe,
    // idempotent sheet-level enforcement when Runed is checked:
    //  - Ensure Magic quality is present.
    //  - Ensure armor system.magic_ar is at least 1.
    // This avoids stacking and avoids destructive removal when unchecked.
    // ------------------------------------------------------------
    const hasRuned = structured.some(q => q && q.key === "runed");
    if (hasRuned) {
      // Ensure Magic quality exists
      const hasMagic = structured.some(q => q && q.key === "magic");
      if (!hasMagic) structured.push({ key: "magic" });

      // Armor: ensure Magic AR >= 1
      if (this.item?.type === "armor") {
        const currentMagicAR = Number(formData["system.magic_ar"] ?? this.item.system?.magic_ar ?? 0);
        if (!Number.isNaN(currentMagicAR) && currentMagicAR < 1) {
          formData["system.magic_ar"] = 1;
        }
      }
    }


    // Reconcile Reach between header field and structured list.
    const reachValue = (reachFromStructured != null) ? reachFromStructured : (() => {
      const n = Number(reachFromSystem);
      return (!Number.isNaN(n) && n !== 0) ? n : null;
    })();

    // Remove any existing reach entries then re-add if present
    for (let i = structured.length - 1; i >= 0; i--) {
      if (structured[i] && structured[i].key === "reach") structured.splice(i, 1);
    }
    if (reachValue != null) {
      structured.push({ key: "reach", value: reachValue });
      formData["system.reach"] = reachValue;
    } else {
      formData["system.reach"] = "";
    }

    // Deterministic ordering is useful for JSON exports/diffs.
    structured.sort((a, b) => (a.key || "").localeCompare(b.key || ""));

    // IMPORTANT: In AppV1 sheets, formData is a flat object whose keys use dot-notation.
    // Do NOT use setProperty here because it will create nested objects and may clobber other system fields.
    formData["system.qualitiesStructured"] = structured;

    // ------------------------------------------------------------
    // Combat Style: normalize Special Action known toggles
    // ------------------------------------------------------------
    if (this.item?.type === "combatStyle") {
      // Checkboxes only submit checked fields; ensure missing keys are written as false
      // so automation can rely on a deterministic map.
      for (const sa of SPECIAL_ACTIONS) {
        const k = `system.specialAdvantages.${sa.id}`;
        const has = Object.prototype.hasOwnProperty.call(formData, k);
        formData[k] = has ? Boolean(formData[k]) : false;
      }

      // Trained Equipment entries (5 slots)
      // IMPORTANT:
      // - Some older worlds/items may have trainedEquipment stored as a non-array type.
      // - Dot-path updates like system.trainedEquipment.0 will NOT reliably coerce the backing
      //   data into an Array in those cases.
      // - Persist the whole lane as an Array to guarantee deterministic storage.
      const te = [];
      for (let i = 0; i < 5; i++) {
        const key = `system.trainedEquipment.${i}`;
        te.push(String(formData[key] ?? this.item.system?.trainedEquipment?.[i] ?? "").trim());
        // Remove per-index keys so only the canonical array write remains.
        delete formData[key];
      }
      formData["system.trainedEquipment"] = te;
    }

    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options = {}) {
    const position = super.setPosition(options);
    // Let CSS flexbox handle heights naturally
    // Removed old height calculation that breaks scrolling
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  async activateListeners(html) {
    super.activateListeners(html);

    // Ammunition: live update derived Price / Shot display when Price / 10 changes.
    if (this.item && this.item.type === "ammunition") {
      const p10Input = html.find('input[name="system.pricePer10"]');
      const pShotDisplay = html.find('[data-uesrpg="pricePerShot"]');

      const refresh = () => {
        const v = Number(p10Input.val() || 0);
        const ps = Math.round((v / 10) * 100) / 100;
        pShotDisplay.val(String(ps));
      };

      if (p10Input.length && pShotDisplay.length) {
        p10Input.on("input", refresh);
        p10Input.on("change", refresh);
      }
    }

    // Item Value Change Buttons
    html.find(".chargePlus").click(this._onChargePlus.bind(this));
    html.find(".chargeMinus").click(this._onChargeMinus.bind(this));
    html.find(".addToContainer").click(this._addToContainer.bind(this));

    // Register listeners for items that have modifier arrays
    if (this.item && this.item.system && Object.prototype.hasOwnProperty.call(this.item.system, "skillArray")) {
      html.find(".modifier-create").click(this._onModifierCreate.bind(this));
      this._createModifierEntries();
      html.find(".item-delete").click(this._onDeleteModifier.bind(this));
    }

    // Registers functions for item sheet renders
    html.find(".item-name").click(async (ev) => {
      if (!this.actor) return ui.notifications.info("Containers must be on Actor Sheets in order to open the contents.");
      const li = ev.currentTarget.closest(".item");
      if (!li) return;
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      item.sheet.render(true);
      await item.update({ "system.value": item.system.value });
    });

    // Remove Contained Item from Container
    html.find(".remove-contained-item").click(this._onRemoveContainedItem.bind(this));
    html.find(".delete-contained-item").click(this._onDeleteContainedItem.bind(this));

    // Update contained Items elements list (keeps the contents list updated if items are updated themselves)
    if (this.item && this.item.type === "container" && this.item.isOwned) {
      void this._updateContainedItemsList();
    }

    if (this.item && this.item.system && Object.prototype.hasOwnProperty.call(this.item.system, "containerStats") && this.item.type !== "container") {
      // Keep parent container's embedded snapshot aligned with this item.
      await this._pushContainedItemData();
    }

    // Active Effects (Effects tab)
    html.find(".effect-control").click(this._onEffectControl.bind(this));

    // Spell Scaling: Add/Remove Level buttons
    if (this.item?.type === "spell") {
      html.find(".add-scaling-level").click(this._onAddScalingLevel.bind(this));
      html.find(".remove-scaling-level").click(this._onRemoveScalingLevel.bind(this));
    }

    // Combat Style: set active style on owner actor (Option 2)
    if (this.item?.type === "combatStyle" && this.item.isOwned && this.actor) {
      // Combat Style: auto-save UX
      // NOTE: Using full-form submits on every keystroke causes disruptive rerenders and can appear
      // like inputs are being "cleared". Instead, update only the changed lane(s) on change/blur.
      // This keeps the UX stable and still provides deterministic persistence.

      const equipInputs = html.find('input[name^="system.trainedEquipment."]');
      const saInputs = html.find('input[type="checkbox"][name^="system.specialAdvantages."]');

      const debouncedEquipUpdate = foundry.utils.debounce(async () => {
        try {
          // Persist as a canonical 5-slot array (see _updateObject for rationale).
          const te = [];
          for (let i = 0; i < 5; i++) {
            const el = equipInputs.get(i);
            te.push(String(el?.value ?? "").trim());
          }
          await this.item.update({ "system.trainedEquipment": te });
        } catch (err) {
          console.warn("UESRPG | Combat Style trainedEquipment auto-update failed", err);
        }
      }, 150);

      // Persist on change (not per keystroke) to prevent input jitter or perceived "clearing".
      // Users can type freely; the value is persisted when the field loses focus.
      equipInputs.on("change", debouncedEquipUpdate);

      // Prevent accidental form submit on Enter inside these fields.
      equipInputs.on("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.currentTarget?.blur?.();
        }
      });

      saInputs.on("change", async (ev) => {
        try {
          const el = ev.currentTarget;
          const name = el?.name;
          if (!name) return;
          await this.item.update({ [name]: Boolean(el.checked) });
        } catch (err) {
          console.warn("UESRPG | Combat Style specialAdvantages auto-update failed", err);
        }
      });

      html.find(".uesrpg-set-active-style").off("click.uesrpg").on("click.uesrpg", async (ev) => {
        ev.preventDefault();
        try {
          await this.actor.setFlag("uesrpg-3ev4", "activeCombatStyleId", this.item.id);
          ui.notifications?.info?.(`Active combat style set to: ${this.item.name}`);
          // Re-render owning sheet to update Special Actions list + advantage injection lane.
          this.actor.sheet?.render?.(false);
          this.render(false);
        } catch (err) {
          console.error("UESRPG | Failed to set active combat style", { actor: this.actor?.uuid, item: this.item?.uuid, err });
          ui.notifications?.error?.("Failed to set active combat style.");
        }
      });

    }
  }

  /* -------------------------------------------- */
  /* Modifier UI helpers                           */
  /* -------------------------------------------- */

  _onModifierCreate(event) {
    event.preventDefault();
    // Return if not embedded onto Actor
    if (!this.document.isEmbedded) return;

    // Create Options for Dropdown
    const modifierOptions = [];
    if (this.actor && this.actor.type === "Player Character") {
      const skills = this.actor.items.filter(i => i.type === "skill" || i.type === "magicSkill" || i.type === "combatStyle");
      for (const skill of skills) modifierOptions.push(`<option value="${skill.name}">${skill.name}</option>`);
    }

    if (this.actor && this.actor.type === "NPC") {
      for (const profession in this.actor.system.professions) {
        modifierOptions.push(`<option value="${profession}">${profession}</option>`);
      }
    }

    // Create Dialog for selecting skill/item to modify
    const d = new Dialog({
      title: "Create Modifier",
      content: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="background: rgba(180, 180, 180, 0.562); border: solid 1px; padding: 10px; font-style: italic;">
          ${this.item.name} can apply a bonus or penalty to various skills of the character that has possession of it.
          Select a skill, then apply the modifier.
        </div>
        <div style="padding: 5px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 5px; text-align: center;">
          <select id="modifierSelect" name="modifierSelect">
            ${modifierOptions.join("")}
          </select>
          <input id="modifier-value" type="number" value="0">
        </div>
      </div>`,
      buttons: {
        one: { label: "Cancel" },
        two: {
          label: "Create",
          callback: async html => {
            const sel = html[0].querySelector("#modifierSelect");
            const val = html[0].querySelector("#modifier-value");
            if (!sel || !val) return;

            const current = Array.isArray(this.item?.system?.skillArray) ? foundry.utils.deepClone(this.item.system.skillArray) : [];
            const next = current.concat([{ name: sel.value, value: Number(val.value || 0) }]);
            await this.item.update({ "system.skillArray": next });
          }
        }
      },
      default: "two"
    });

    d.render(true);
  }

  _createModifierEntries() {
    if (!this.item || !this.item.system || !Array.isArray(this.item.system.skillArray)) return;

    for (const entry of this.item.system.skillArray) {
      let modItem = this.actor ? this.actor.items.find(i => i.name === entry.name) : null;
      modItem = modItem || entry.name;

      const entryElement = document.createElement("div");
      entryElement.classList.add("grid-container");
      entryElement.id = entry.name;
      entryElement.innerHTML = `<div>${(modItem && modItem.name !== undefined) ? modItem.name : entry.name}</div>
        <div class="right-align-content">
          <div class="item-controls">
            <div>${entry.value}%</div>
            <a class="item-control item-delete" title="Delete Item"><i class="fas fa-trash"></i></a>
          </div>
        </div>`;
      if (this.form) {
        const container = this.form.querySelector("#item-modifiers");
        if (container) container.append(entryElement);
      }
    }
  }

  async _onDeleteModifier(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const modEntry = element.closest(".grid-container");
    if (!modEntry || !this.item || !this.item.system || !Array.isArray(this.item.system.skillArray)) return;

    const id = modEntry.getAttribute("id");
    if (!id) return;

    const current = foundry.utils.deepClone(this.item.system.skillArray);
    const next = current.filter(e => e?.name !== id);
    if (next.length === current.length) return;
    await this.item.update({ "system.skillArray": next });
  }

  /* -------------------------------------------- */
  /* Charge buttons                                */
  /* -------------------------------------------- */

  async _onChargePlus(event) {
    event.preventDefault();
    const chargeMax = this.document.system.charge.max;
    const currentCharge = this.document.system.charge.value;

    if (currentCharge >= chargeMax || currentCharge + this.item.system.charge.reduction >= chargeMax) {
      ui.notifications.info(`${this.item.name} is fully charged.`);
      return this.document.update({ "system.charge.value": chargeMax });
    }
    return this.document.update({ "system.charge.value": currentCharge + this.item.system.charge.reduction });
  }

  async _onChargeMinus(event) {
    event.preventDefault();
    const currentCharge = this.document.system.charge.value;

    if (currentCharge <= 0 || currentCharge - this.item.system.charge.reduction < 0) {
      return ui.notifications.info(`${this.item.name} does not have enough charge.`);
    }
    return this.document.update({ "system.charge.value": currentCharge - this.item.system.charge.reduction });
  }


  /* -------------------------------------------- */
  /* Containers                                    */
  /* -------------------------------------------- */

  /**
   * Return the set of item types that are allowed to be placed into containers.
   * We intentionally exclude non-physical "character build" items (skills, talents, traits, powers, etc).
   *
   * @returns {Set<string>}
   */
  static _containerAllowedTypes() {
    return new Set(["item", "weapon", "armor", "ammunition"]);
  }

  /**
   * Basic permission gate for modifying containment from an ItemSheet context.
   * Containers are only meaningful when embedded on an Actor.
   */
  _canModifyContainment() {
    return !!(this.options?.editable && this.item?.isOwned && this.actor && this.actor.isOwner);
  }


  /**
   * Build a normalized, de-duplicated, actor-authoritative contained_items list for this container.
   * - Removes missing/deleted item ids
   * - De-duplicates ids
   * - Adds any actor items which claim they are contained in this container but are missing from the list
   * - Stores a plain-object snapshot (toObject) for stable rendering and diffs
   *
   * @returns {Promise<boolean>} whether an update was applied
   */
  async _repairContainerContainedItems() {
    if (!this.item || this.item.type !== "container") return false;
    if (!this.actor) return false;


    const containerId = this.item.id;
    const current = Array.isArray(this.item.system?.contained_items) ? this.item.system.contained_items : [];

    const byId = new Map();

    // Seed from current list (but validate against actor items + containerStats)
    for (const entry of current) {
      const id = entry?._id;
      if (!id) continue;
      if (byId.has(id)) continue;

      const source = this.actor.items.get(id);
      if (!source) continue;

      const cs = source.system?.containerStats;
      const isInThis = !!cs?.contained && (cs?.container_id === containerId);
      if (!isInThis) continue;

      byId.set(id, { _id: id, item: source.toObject() });
    }

    // Add any actor items that claim they are in this container but are missing from list
    for (const source of this.actor.items) {
      if (!source) continue;
      if (source.type === "container") continue;
      const cs = source.system?.containerStats;
      const isInThis = !!cs?.contained && (cs?.container_id === containerId);
      if (!isInThis) continue;
      if (byId.has(source.id)) continue;
      byId.set(source.id, { _id: source.id, item: source.toObject() });
    }

    const next = Array.from(byId.values());

    // Detect meaningful change
    const curIds = current.map(e => e?._id).filter(Boolean);
    const nextIds = next.map(e => e?._id).filter(Boolean);
    const changedIds = (curIds.length !== nextIds.length) || curIds.some((id, idx) => id !== nextIds[idx]);

    // Also update if any snapshot modifiedTime differs (or missing snapshots)
    let changedSnapshot = false;
    if (!changedIds) {
      for (const entry of next) {
        const cur = current.find(e => e?._id === entry._id);
        const curMT = cur?.item?._stats?.modifiedTime;
        const nextMT = entry?.item?._stats?.modifiedTime;
        if (curMT !== nextMT) { changedSnapshot = true; break; }
      }
    }

    if (!changedIds && !changedSnapshot) return false;

    await this.item.update({ "system.contained_items": next });
    return true;
  }

  _createContainerListDialog(bagListItems, tooLarge) {
    const tableEntries = [];
    for (const bagItem of bagListItems) {
      const cs = bagItem?.system?.containerStats ?? { contained: false, container_id: "" };
      const isContained = !!cs.contained;
      const isInThisContainer = isContained && (cs.container_id === this.item._id);

      const img = bagItem?.img || CONST.DEFAULT_TOKEN;
      const qty = bagItem?.system?.quantity ?? 0;
      const enc = bagItem?.system?.enc ?? 0;

      const entry = `<tr data-item-id="${bagItem._id}">
        <td data-item-id="${bagItem._id}">
          <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
            <img class="item-img" src="${img}" height="24" width="24">
            ${isContained ? '<i class="fa-solid fa-backpack"></i>' : ""}
            ${bagItem.name}
          </div>
        </td>
        <td style="text-align: center;">${bagItem.type}</td>
        <td style="text-align: center;">${qty}</td>
        <td style="text-align: center;">${enc}</td>
        <td style="text-align: center;">
          <input type="checkbox" class="itemSelect container-select" data-item-id="${bagItem._id}" ${isInThisContainer ? "checked" : ""}>
        </td>
      </tr>`;
      tableEntries.push(entry);
    }

    const d = new Dialog({
      title: `Add Items to ${this.item.name}`,
      content: `<div>
        <div style="padding: 5px 0;">
          <label>Select Items to add to your ${this.item.name}.</label>
          ${tooLarge ? "<div>Some items do not appear on this list because their ENC is greater than the capacity in the container.</div>" : ""}
        </div>
        <div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>TYPE</th>
                <th>QTY</th>
                <th>ENC</th>
                <th>Add</th>
              </tr>
            </thead>
            <tbody>${tableEntries.join("")}</tbody>
          </table>
        </div>
      </div>`,
      buttons: {
        one: {
          label: "Apply",
          callback: async (html) => {
            if (!this._canModifyContainment()) {
              ui.notifications.warn("You do not have permission to modify container contents.");
              return;
            }

            const root = html?.[0] ?? document;
            const selectedInputs = [...root.querySelectorAll(".itemSelect")];

            const allowedTypes = this.constructor._containerAllowedTypes();
            const containerId = this.item.id;

            // Apply changes per checkbox:
            // - checked: set this container as owner; unlink from any previous container list
            // - unchecked: only un-contain if currently in this container
            for (const input of selectedInputs) {
              const itemId = input?.dataset?.itemId;
              if (!itemId) continue;

              const thisItem = this.actor.items.get(itemId);
              if (!thisItem) continue;

              // Defensive: never allow containers to be contained (prevents cycles)
              if (thisItem.type === "container") continue;

              // Defensive: only allow physical inventory items
              if (!allowedTypes.has(thisItem.type)) continue;
              const thisCS = thisItem.system?.containerStats ?? {};
              const currentContainerId = thisCS.container_id || "";
              const isInThis = !!thisCS.contained && (currentContainerId === containerId);

              if (input.checked) {
                // Already in this container; nothing to do beyond ensuring fields are consistent
                if (!isInThis) {
                  // If the item belongs to another container, remove it from that container's list first
                  if (currentContainerId) {
                    const oldContainer = this.actor.items.get(currentContainerId);
                    if (oldContainer && Array.isArray(oldContainer.system?.contained_items)) {
                      const nextOld = oldContainer.system.contained_items.filter(ci => ci?._id !== thisItem.id);
                      await oldContainer.update({ "system.contained_items": nextOld });
                    }
                  }
                }

                const updateData = {};


                const csObj = thisItem.system?.containerStats;
                const csValid = !!(csObj && typeof csObj === "object");

                if (csValid) {
                  updateData["system.containerStats.contained"] = true;
                  updateData["system.containerStats.container_id"] = containerId;
                  updateData["system.containerStats.container_name"] = this.item.name;
                } else {
                  // Backfill full object if legacy items lack containerStats
                  updateData["system.containerStats"] = {
                    contained: true,
                    container_id: containerId,
                    container_name: this.item.name
                  };
                }

                // Storing an equipped item is not meaningful; force unequipped if boolean field exists
                if (typeof thisItem.system?.equipped === "boolean") updateData["system.equipped"] = false;

                await thisItem.update(updateData);
              } else {
                // Unchecked: only remove if currently in this container
                if (isInThis) {
                  await thisItem.update({
                    "system.containerStats.contained": false,
                    "system.containerStats.container_id": "",
                    "system.containerStats.container_name": ""
                  });
                }
              }
            }

            // Rebuild container list authoritatively from actor item.containerStats
            await this._repairContainerContainedItems();
          }
        },
        two: { label: "Cancel" }
      },
      default: "one"
    });

    d.render(true);
  }

  _addToContainer() {
    if (!this._canModifyContainment()) {
      return ui.notifications.warn("Containers must be owned by an Actor and you must have permission to modify them.");
    }

    const bagListItems = [];
    let tooLarge = false;

    const allowedTypes = this.constructor._containerAllowedTypes();
    const itemList = this.actor.items;

    const containerMaxEnc =
      (this.item.system?.container_enc?.max != null)
        ? Number(this.item.system.container_enc.max)
        : 0;

    for (const i of itemList) {
      if (!i) continue;
      if (i.id === this.item.id) continue;

      // Never allow containers inside containers (prevents cycles)
      if (i.type === "container") continue;

      // Only physical inventory items
      if (!allowedTypes.has(i.type)) continue;
      const itemEnc = Number(i.system?.enc ?? 0);
      const cs = i.system?.containerStats ?? {};
      const isInThis = !!cs?.contained && (cs?.container_id === this.item.id);

      // Always show items already in this container (even if over capacity) so the user can remove them.
      if (isInThis) {
        bagListItems.push(i);
        continue;
      }

      if (itemEnc > containerMaxEnc) {
        tooLarge = true;
        continue;
      }

      bagListItems.push(i);
    }

    this._createContainerListDialog(bagListItems, tooLarge);
  }

  /**
   * Remove an item from this container (does not delete it).
   */
  async _onRemoveContainedItem(event) {
    event.preventDefault();
    if (!this._canModifyContainment()) {
      ui.notifications.warn("You do not have permission to modify container contents.");
      return;
    }

    const row = event.currentTarget?.closest?.(".item");
    const removedItemId = row?.dataset?.itemId;
    if (!removedItemId) return;
    if (!this.actor) return;

    const itemToUpdate = this.actor.items.get(removedItemId);
    if (itemToUpdate) {
      await itemToUpdate.update({
        "system.containerStats.contained": false,
        "system.containerStats.container_id": "",
        "system.containerStats.container_name": ""
      });
    }

    await this._repairContainerContainedItems();
  }

  /**
   * Delete a contained item from the Actor (destructive).
   */
  async _onDeleteContainedItem(event) {
    event.preventDefault();
    if (!this._canModifyContainment()) {
      ui.notifications.warn("You do not have permission to modify container contents.");
      return;
    }

    const row = event.currentTarget?.closest?.(".item");
    const deletedItemId = row?.dataset?.itemId;
    if (!deletedItemId) return;
    if (!this.actor) return;

    const itemDoc = this.actor.items.get(deletedItemId);
    const itemName = itemDoc?.name || "this item";

    const d = new Dialog({
      title: "Delete Item",
      content: `<p>Delete <strong>${itemName}</strong>? This cannot be undone.</p>`,
      buttons: {
        cancel: { label: "Cancel" },
        delete: {
          label: "Delete",
          callback: async () => {
            await this.actor.deleteEmbeddedDocuments("Item", [deletedItemId]);
            await this._repairContainerContainedItems();
          }
        }
      },
      default: "cancel"
    });

    d.render(true);
  }

  /**
   * Keep this container's contained_items snapshot in sync with owned items.
   * This is intentionally conservative to avoid render-loop churn.
   */
  async _updateContainedItemsList() {
    if (!this.item || this.item.type !== "container") return;
    if (!this.actor) return;

    // Repair first (removes ghost ids / dedupes / adds missing)
    const repaired = await this._repairContainerContainedItems();
    if (repaired) return;

    const current = Array.isArray(this.item.system?.contained_items) ? this.item.system.contained_items : [];
    let changed = false;
    const next = [];

    for (const entry of current) {
      const id = entry?._id;
      if (!id) { changed = true; continue; }
      const source = this.actor.items.get(id);
      if (!source) { changed = true; continue; }

      const sourceObj = source.toObject();
      const curMT = entry?.item?._stats?.modifiedTime;
      const nextMT = sourceObj?._stats?.modifiedTime;
      if (curMT !== nextMT) changed = true;

      next.push({ _id: id, item: sourceObj });
    }

    if (!changed) return;
    await this.item.update({ "system.contained_items": next });
  }

  async _pushContainedItemData() {
    if (!this.actor) return;
    if (!this.item?.system?.containerStats) return;
    if (this.item.type === "container") return;

    const containerId = this.item.system.containerStats.container_id;
    if (!containerId) return;

    const containerItem = this.actor.items.get(containerId);
    if (!containerItem) return;

    const current = Array.isArray(containerItem.system?.contained_items) ? containerItem.system.contained_items : [];
    const itemId = this.item.id;

    const nextEntry = { _id: itemId, item: this.item.toObject() };

    const next = current.filter(ci => ci?._id !== itemId).concat([nextEntry]);
    await containerItem.update({ "system.contained_items": next });
  }

  /* -------------------------------------------- */
  /* Active Effects                                */
  /* -------------------------------------------- */

  /**
   * Handle Active Effect controls from the Effects tab.
   */
  async _onEffectControl(event) {
    event.preventDefault();
    const el = event.currentTarget;
    if (!el) return;

    // In some templates the click target can be a nested element, or the control
    // may not carry the effect id directly. Resolve deterministically.
    const action = el.dataset?.action;
    const effectId = el.dataset?.effectId ?? el.closest?.("[data-effect-id]")?.dataset?.effectId;

    if (!action) return;
    if (!this.item || !this.item.effects) return;

    if (action === "create") {
      const effectData = {
        name: "New Effect",
        img: "icons/svg/aura.svg",
        changes: [],
        disabled: false,
        transfer: false,
        duration: {}
      };
      const created = await this.item.createEmbeddedDocuments("ActiveEffect", [effectData]);
      const eff = created && created.length ? created[0] : null;
      if (eff && eff.sheet) eff.sheet.render(true);
      return;
    }

    if (!effectId) return;
    const effect = this.item.effects.get(effectId);
    if (!effect) return;

    switch (action) {
      case "edit":
        if (effect.sheet) effect.sheet.render(true);
        break;
      case "delete":
        // Use embedded document API explicitly; this is more reliable for Item-embedded effects.
        await this.item.deleteEmbeddedDocuments("ActiveEffect", [effectId]);
        break;
      case "toggle":
        await this.item.updateEmbeddedDocuments("ActiveEffect", [{ _id: effectId, disabled: !effect.disabled }]);
        break;
      default:
        break;
    }
  }

  /* -------------------------------------------- */
  /* Spell Scaling Level Management               */
  /* -------------------------------------------- */

  /**
   * Add a new scaling level to a spell
   */
  async _onAddScalingLevel(event) {
    event.preventDefault();
    
    if (this.item?.type !== "spell") return;
    
    const rawLevels = foundry.utils.getProperty(this.item, "system.scaling.levels");
    let currentLevels = [];
    if (Array.isArray(rawLevels)) currentLevels = rawLevels;
    else if (rawLevels && typeof rawLevels === "object") currentLevels = Object.values(rawLevels);

    // Normalize to a stable, numeric-level-sorted array.
    currentLevels = currentLevels
      .filter(l => l && typeof l === "object")
      .map((l, idx) => ({
        level: Number(l.level) || (idx + 1),
        cost: Number(l.cost) || 0,
        damageFormula: String(l.damageFormula ?? ""),
        effectStrength: Number(l.effectStrength) || 0,
        duration: Number(l.duration) || 0
      }))
      .sort((a, b) => (a.level - b.level));

    const maxLevel = currentLevels.reduce((m, l) => Math.max(m, Number(l.level) || 0), 0);
    const nextLevelNum = maxLevel + 1;
    
    if (nextLevelNum > 7) {
      ui.notifications.warn("Maximum 7 spell levels (Novice to Grandmaster).");
      return;
    }
    
    const newLevels = [...currentLevels, {
      level: nextLevelNum,
      cost: 0,
      damageFormula: "",
      effectStrength: 0,
      duration: 0
    }];
    
    await this.item.update({ "system.scaling.levels": newLevels });
  }

  /**
   * Remove a scaling level from a spell
   */
  async _onRemoveScalingLevel(event) {
    event.preventDefault();
    
    if (this.item?.type !== "spell") return;
    
    const index = Number(event.currentTarget.closest("tr")?.dataset?.index ?? -1);
    if (index < 0) return;
    
    const rawLevels = foundry.utils.getProperty(this.item, "system.scaling.levels");
    let currentLevels = [];
    if (Array.isArray(rawLevels)) currentLevels = rawLevels;
    else if (rawLevels && typeof rawLevels === "object") currentLevels = Object.values(rawLevels);

    currentLevels = currentLevels
      .filter(l => l && typeof l === "object")
      .map((l, idx) => ({
        level: Number(l.level) || (idx + 1),
        cost: Number(l.cost) || 0,
        damageFormula: String(l.damageFormula ?? ""),
        effectStrength: Number(l.effectStrength) || 0,
        duration: Number(l.duration) || 0
      }))
      .sort((a, b) => (a.level - b.level));

    const newLevels = currentLevels.filter((_, i) => i !== index);
    
    await this.item.update({ "system.scaling.levels": newLevels });
  }
}
