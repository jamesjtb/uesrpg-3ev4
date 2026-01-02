import { UESRPG } from "../constants.js";

/**
 * Extend the basic foundry.appv1.sheets.ItemSheet with some very simple modifications
 * @extends {foundry.appv1.sheets.ItemSheet}
 */
export class SimpleItemSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "item"],
      width: 480,
      height: 520,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
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

    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options = {}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".sheet-body");
    const bodyHeight = position.height - 210;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
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

    // Update contained Items elements list (keeps the contents list updated if items are updated themselves)
    if (this.item && this.item.type === "container" && this.item.isOwned) {
      this._updateContainedItemsList();
    }

    if (this.item && this.item.system && Object.prototype.hasOwnProperty.call(this.item.system, "containerStats") && this.item.type !== "container") {
      this._pushContainedItemData();
    }

    // Active Effects (Effects tab)
    html.find(".effect-control").click(this._onEffectControl.bind(this));
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
          callback: html => {
            const sel = html[0].querySelector("#modifierSelect");
            const val = html[0].querySelector("#modifier-value");
            if (!sel || !val) return;
            const skillObject = { name: sel.value, value: val.value };
            this.item.system.skillArray.push(skillObject);
            this.item.update({ "system.skillArray": this.item.system.skillArray });
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

  _onDeleteModifier(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const modEntry = element.closest(".grid-container");
    if (!modEntry || !this.item || !this.item.system || !Array.isArray(this.item.system.skillArray)) return;

    for (const entry of this.item.system.skillArray) {
      if (entry.name === modEntry.getAttribute("id")) {
        const index = this.item.system.skillArray.indexOf(entry);
        if (index >= 0) this.item.system.skillArray.splice(index, 1);
        this.item.update({ "system.skillArray": this.item.system.skillArray });
        break;
      }
    }
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

  _createContainerListDialog(bagListItems, tooLarge) {
    const tableEntries = [];
    for (const bagItem of bagListItems) {
      const entry = `<tr data-item-id="${bagItem._id}">
        <td data-item-id="${bagItem._id}">
          <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
            <img class="item-img" src="${bagItem.img}" height="24" width="24">
            ${bagItem.system.containerStats.contained ? '<i class="fa-solid fa-backpack"></i>' : ""}
            ${bagItem.name}
          </div>
        </td>
        <td style="text-align: center;">${bagItem.type}</td>
        <td style="text-align: center;">${bagItem.system.quantity}</td>
        <td style="text-align: center;">${bagItem.system.enc}</td>
        <td style="text-align: center;">
          <input type="checkbox" class="itemSelect container-select" data-item-id="${bagItem._id}" ${bagItem.system.containerStats.contained && bagItem.system.containerStats.container_id === this.item._id ? "checked" : ""}>
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
          callback: () => {
            const selectedItems = [...document.querySelectorAll(".itemSelect")];
            const containedItemsList = [];

            for (const i of selectedItems) {
              let thisItem = null;
              if (this.item.isOwned && this.actor) {
                thisItem = this.actor.items.get(i.dataset.itemId) || null;
              }
              if (!thisItem) continue;

              if (i.checked) {
                // If the item has an existing container, remove from that container list first
                if ((thisItem.system && thisItem.system.containerStats ? thisItem.system.containerStats.container_id : null)) {
                  const oldContainer = this.actor.items.get(thisItem.system.containerStats.container_id);
                  if (oldContainer && Array.isArray(oldContainer.system.contained_items)) {
                    const idx = oldContainer.system.contained_items.findIndex(ci => ci._id === thisItem._id);
                    if (idx !== -1) {
                      const next = oldContainer.system.contained_items.slice();
                      next.splice(idx, 1);
                      oldContainer.update({ "system.contained_items": next });
                    }
                  }
                }

                thisItem.update({
                  "system.containerStats.contained": true,
                  "system.containerStats.container_id": this.item._id,
                  "system.containerStats.container_name": this.item.name
                });

                containedItemsList.push({ _id: thisItem._id, item: thisItem });
              } else {
                if ((thisItem.system && thisItem.system.containerStats ? thisItem.system.containerStats.container_id : null) === this.item._id) {
                  thisItem.update({
                    "system.containerStats.contained": false,
                    "system.containerStats.container_id": "",
                    "system.containerStats.container_name": ""
                  });
                }
              }
            }

            this.item.update({ "system.contained_items": containedItemsList });
          }
        },
        two: { label: "Cancel" }
      },
      default: "one"
    });

    d.render(true);
  }

  _addToContainer() {
    const bagListItems = [];
    let tooLarge = false;

    if (!this.item.isOwned) {
      return ui.notifications.info("Containers must be owned by Actors in order to add items. This will be updated in the future.");
    }
    if (!this.actor) return;

    const itemList = this.actor.items;

    for (const i of itemList) {
      if (i._id === this.item._id) continue;

      const itemEnc = (i.system && i.system.enc != null) ? Number(i.system.enc) : 0;
      const containerMaxEnc = (this.item.system && this.item.system.container_enc && this.item.system.container_enc.max != null)
        ? Number(this.item.system.container_enc.max)
        : 0;

      if (itemEnc > containerMaxEnc) tooLarge = true;

      const isContainer = !!(i.system && Object.prototype.hasOwnProperty.call(i.system, "containerStats") && i.type === "container");
      if (itemEnc <= containerMaxEnc && !isContainer) {
        bagListItems.push(i);
      }
    }

    this._createContainerListDialog(bagListItems, tooLarge);
  }

  _onRemoveContainedItem(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const row = element.closest(".item");
    if (!row) return;
    const removedItemId = row.dataset.itemId;
    if (!this.item || !this.item.system || !Array.isArray(this.item.system.contained_items)) return;

    const indexToRemove = this.item.system.contained_items.findIndex(item => item._id === removedItemId);
    if (indexToRemove === -1) return;

    // Update the container item contents list
    const next = this.item.system.contained_items.slice();
    next.splice(indexToRemove, 1);
    this.item.update({ "system.contained_items": next });

    // Update the contained item's status
    const itemToUpdate = this.actor ? this.actor.items.get(removedItemId) : null;
    if (itemToUpdate) {
      itemToUpdate.update({
        "system.containerStats.contained": false,
        "system.containerStats.container_id": "",
        "system.containerStats.container_name": ""
      });
    }
    this._updateContainedItemsList();
  }

  _updateContainedItemsList() {
    if (!this.item || !this.item.system || !Array.isArray(this.item.system.contained_items)) return;
    if (!this.actor) return;

    const updatedContainedList = [];
    let wasChanged = false;

    for (const item of this.item.system.contained_items) {
      const sourceItem = this.actor.items.get(item._id);
      if (!sourceItem) continue;

      // diffObject expects plain objects; we compare stored snapshot vs current to detect change
      const diff = foundry.utils.diffObject(item.item, sourceItem);
      if (diff && diff._stats && diff._stats.modifiedTime) wasChanged = true;

      updatedContainedList.push({ _id: sourceItem._id, item: sourceItem });
    }

    // Bail if there are no updates to avoid infinite loop
    if (!wasChanged) return;

    this.item.update({ "system.contained_items": updatedContainedList });
  }

  _pushContainedItemData() {
    if (!this.actor) return;
    if (!this.item || !this.item.system || !this.item.system.containerStats) return;

    // Refreshes content from a stored item to the container item on stored item refresh
    const containerId = this.item.system.containerStats.container_id;
    if (!containerId) return;

    const containerItem = this.actor.items.get(containerId);
    if (!containerItem) return;

    if (!Array.isArray(containerItem.system.contained_items)) return;

    const idx = containerItem.system.contained_items.findIndex(ci => ci._id === this.item._id);
    if (idx === -1) return;

    const next = containerItem.system.contained_items.slice();
    next.splice(idx, 1, { _id: this.item._id, item: this.item });
    containerItem.update({ "system.contained_items": next });
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
    if (!el || !el.dataset) return;

    const action = el.dataset.action;
    const effectId = el.dataset.effectId;

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

    const effect = this.item.effects.get(effectId);
    if (!effect) return;

    switch (action) {
      case "edit":
        if (effect.sheet) effect.sheet.render(true);
        break;
      case "delete":
        await effect.delete();
        break;
      case "toggle":
        await effect.update({ disabled: !effect.disabled });
        break;
      default:
        break;
    }
  }
}
