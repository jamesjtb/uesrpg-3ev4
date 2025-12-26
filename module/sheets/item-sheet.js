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
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}]
		});
  }

  /* -------------------------------------------- */

/** @override */
    get template() {
      const path = "systems/uesrpg-3ev4/templates";
      return `${path}/${this.item.type}-sheet.html`;
    }

    async getData() {
      const  data = super.getData();
      data.dtypes = ["String", "Number", "Boolean"];
      data.isGM = game.user.isGM;
      data.editable = data.options.editable;
      const itemData = data.item;

      data.item.system.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(itemData.system.description, { async: true });

      // --------------------------------------------
      // Armor: Effective Weight Class (derived)
      // --------------------------------------------
      if (data.item?.type === "armor") {
        const base = data.item.system?.weightClass ?? "none";
        const quality = data.item.system?.qualityLevel ?? "common";
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

      // --------------------------------------------
      // Ammunition: derived Price / Shot (from Price / 10)
      // --------------------------------------------
      if (data.item?.type === "ammunition") {
        const p10 = Number(data.item.system?.pricePer10 ?? 0);
        data.item.system.pricePerShot = Math.round((p10 / 10) * 100) / 100;
      }

      // --------------------------------------------
      // Structured Qualities v1 (shared)
      // --------------------------------------------
      // Structured qualities: show a type-specific "core" grid + a set of togglable "other traits".
      const itemType = data.item?.type;
      // NOTE: support multiple export locations/names from earlier patches so sheets never silently render empty.
      // Canonical in this repo is QUALITIES_CORE_BY_TYPE and TRAITS_BY_TYPE.
      const coreByType = UESRPG.CONSTANTS?.QUALITIES_CORE_BY_TYPE
        ?? UESRPG.QUALITIES_CORE_BY_TYPE
        ?? UESRPG.CONSTANTS?.QUALITIES_CATALOG_BY_TYPE
        ?? UESRPG.QUALITIES_CATALOG_BY_TYPE;

      const traitsByType = UESRPG.CONSTANTS?.TRAITS_BY_TYPE
        ?? UESRPG.TRAITS_BY_TYPE
        ?? UESRPG.CONSTANTS?.QUALITIES_TRAITS_BY_TYPE
        ?? UESRPG.QUALITIES_TRAITS_BY_TYPE;

      data.qualitiesCatalog = coreByType?.[itemType] ?? UESRPG.QUALITIES_CATALOG;
      // Template compatibility: newer sheets reference `coreQualitiesCatalog`.
      data.coreQualitiesCatalog = data.qualitiesCatalog;

      // Trait catalog (type-specific) with selected flags.
      const traits = Array.isArray(data.item?.system?.qualitiesTraits) ? data.item.system.qualitiesTraits : [];
      const traitCatalog = traitsByType?.[itemType] ?? [];
      data.traitsCatalog = traitCatalog.map(t => ({ ...t, selected: traits.includes(t.key) }));
      data.traitsSelected = traits.reduce((acc, k) => {
        acc[k] = true;
        return acc;
      }, {});
      const structured = Array.isArray(data.item?.system?.qualitiesStructured) ? data.item.system.qualitiesStructured : [];
      const selectedToggle = {};
      const selectedValue = {};
      for (const q of structured) {
        if (!q?.key) continue;
        // If a structured quality exists it is "on". Some qualities may optionally carry a numeric X value.
        selectedToggle[q.key] = true;
        if (typeof q.value === "number") selectedValue[q.key] = q.value;
      }
      data.qualitiesSelectedToggle = selectedToggle;
      data.qualitiesSelectedValue = selectedValue;

      return data;
    }

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
    // This is required for qualities like Slashing/Splitting/Crushing which can be present
    // with an optional numeric (X) value.
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


    // Reconcile Reach between header field and structured list.
    const reachValue = (reachFromStructured != null) ? reachFromStructured : (() => {
      const n = Number(reachFromSystem);
      return (!Number.isNaN(n) && n !== 0) ? n : null;
    })();

    // Remove any existing reach entries then re-add if present
    for (let i = structured.length - 1; i >= 0; i--) {
      if (structured[i]?.key === "reach") structured.splice(i, 1);
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
    // Do NOT use setProperty here because it will create nested objects and may clobber
    // other system fields during update.
    formData["system.qualitiesStructured"] = structured;

    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options={}) {
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
    if (this.item?.type === "ammunition") {
      const p10Input = html.find('input[name="system.pricePer10"]');
      const pShotDisplay = html.find('[data-uesrpg="pricePerShot"]');

      const refresh = () => {
        const v = Number(p10Input.val() ?? 0);
        const ps = Math.round((v / 10) * 100) / 100;
        pShotDisplay.val(String(ps));
      };

      if (p10Input.length && pShotDisplay.length) {
        p10Input.on("input", refresh);
        p10Input.on("change", refresh);
      }
    }

    //Item Value Change Buttons
    html.find(".chargePlus").click(this._onChargePlus.bind(this));
    html.find(".chargeMinus").click(this._onChargeMinus.bind(this));
    html.find(".addToContainer").click(this._addToContainer.bind(this));

    // Register listeners for items that have modifier arrays
    if (this.item?.system && Object.prototype.hasOwnProperty.call(this.item.system, 'skillArray')) {
      html.find(".modifier-create").click(this._onModifierCreate.bind(this))
      this._createModifierEntries()
      html.find('.item-delete').click(this._onDeleteModifier.bind(this))
    }

    // Registers functions for item sheet renders
    html.find('.item-name').click( async (ev) => {
      if (!this.actor) return ui.notifications.info("Containers must be on Actor Sheets in order to open the contents.")
      const li = ev.currentTarget.closest(".item");
      const item = this.actor?.items?.get(li.dataset.itemId);
      item.sheet.render(true);
      await item.update({"system.value" : item.system.value})
    });

    // Remove Contained Item from Container
    html.find(".remove-contained-item").click(this._onRemoveContainedItem.bind(this));

    // Update contained Items elements list (this keeps the contents list updated if items are updated themselves)
    this.item.type == 'container' && this.item.isOwned ? this._updateContainedItemsList() : {}

    this.item?.system && Object.prototype.hasOwnProperty.call(this.item.system, 'containerStats') && this.item.type != 'container' ? this._pushContainedItemData() : {}
  }

  /**
   * Handle clickables.
   * @param {Event} event   The originating click event
   * @private
   */

  _onModifierCreate(event) {
    event.preventDefault()
    // Return if not embedded onto Actor
    if (!this.document.isEmbedded) {return}

    // Create Options for Dropdown
    let modifierOptions = []
    if (this.actor.type === 'Player Character') {
      for (let skill of this.actor?.items?.filter(i => i.type === 'skill'||i.type === 'magicSkill'||i.type === 'combatStyle')) {
        modifierOptions.push(`<option value="${skill.name}">${skill.name}</option>`)
      }
    }

    if (this.actor.type === 'NPC') {
      for (let profession in this.actor.system.professions) {
        modifierOptions.push(`<option value="${profession}">${profession}</option>`)
      }
    }

    // Create Dialog for selecting skill/item to modify
    let d = new Dialog({
      title: 'Create Modifier',
      content: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">

                    <div style="background: rgba(180, 180, 180, 0.562); border: solid 1px; padding: 10px; font-style: italic;">
                        ${this.item.name} can apply a bonus or penalty to various skills of the character that has possession of it.
                        Select a skill, then apply the modifier.
                    </div>

                    <div style="padding: 5px; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 5px; text-align: center;">
                        <select id="modifierSelect" name="modifierSelect">
                          ${modifierOptions.join('')}
                        </select>
                        <input id="modifier-value" type="number" value="0">
                    </div>

                </div>`,
      buttons: {
        one: {
          label: 'Cancel',
          callback: html => console.log("Cancelled")
        },
        two: {
          label: 'Create',
          callback: html => {
            let skillObject = {name: html[0].querySelector('#modifierSelect').value, value: html[0].querySelector('#modifier-value').value}
            this.item.system.skillArray.push(skillObject)
            this.item.update({'system.skillArray': this.item.system.skillArray})
          }
        }
      },
      default: 'two',
      close: html => console.log()
    })

    d.render(true)
  }

  _createModifierEntries() {
    for (let entry of this.item.system.skillArray) {
      let modItem = this.actor?.items?.find(i => i.name === entry.name) || entry.name

      let entryElement = document.createElement('div')
      entryElement.classList.add('grid-container')
      entryElement.id = entry.name
      entryElement.innerHTML = `<div>${modItem.name != undefined ? modItem.name : entry.name}</div>
                                <div class="right-align-content">
                                    <div class="item-controls">
                                        <div>${entry.value}%</div>
                                        <a class="item-control item-delete" title="Delete Item"><i class="fas fa-trash"></i></a>
                                    </div>
                                </div>`
      this.form.querySelector('#item-modifiers').append(entryElement)
    }
  }

  _onDeleteModifier(event) {
    event.preventDefault()
    let element = event.currentTarget
    let modEntry = element.closest('.grid-container')
    for (let entry of this.item.system.skillArray) {
      if (entry.name == modEntry.getAttribute('id')) {
        let index = this.item.system.skillArray.indexOf(entry)
        this.item.system.skillArray.splice(index, 1)
        this.item.update({'system.skillArray': this.item.system.skillArray})
        break
      }
    }

  }

  async _onChargePlus(event) {
    event.preventDefault()
    let chargeMax = this.document.system.charge.max;
    let currentCharge = this.document.system.charge.value;

    if (currentCharge >= chargeMax||currentCharge + this.item.system.charge.reduction >= chargeMax) {
      ui.notifications.info(`${this.item.name} is fully charged.`)
      this.document.update({'system.charge.value': chargeMax})
    } else {
    this.document.update({"system.charge.value" : currentCharge + this.item.system.charge.reduction});
    }
  }

  async _onChargeMinus(event) {
    event.preventDefault()
    let currentCharge = this.document.system.charge.value;

    if (currentCharge <= 0||currentCharge - this.item.system.charge.reduction < 0) {
      ui.notifications.info(`${this.item.name} does not have enough charge.`)
    } else {
    this.document.update({"system.charge.value" : currentCharge - this.item.system.charge.reduction});
    }
  }

  _createContainerListDialog(bagListItems, tooLarge) {
    // Create dialog box for selecting items to add to container
    // Create list item entries

    console.log(bagListItems);
    let tableEntries = []
    for (let bagItem of bagListItems) {
      let entry = `<tr data-item-id="${bagItem._id}">
                      <td data-item-id="${bagItem._id}">
                          <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                            <img class="item-img" src="${bagItem.img}" height="24" width="24">
                            ${bagItem.system.containerStats.contained ? '<i class="fa-solid fa-backpack"></i>' : ''}
                            ${bagItem.name}
                          </div>
                      </td>
                      <td style="text-align: center;">${bagItem.type}</td>
                      <td style="text-align: center;">${bagItem.system.quantity}</td>
                      <td style="text-align: center;">${bagItem.system.enc}</td>
                      <td style="text-align: center;">
                          <input type="checkbox" class="itemSelect container-select" data-item-id="${bagItem._id}" ${bagItem.system.containerStats.contained && bagItem.system.containerStats.container_id == this.item._id ? 'checked' : ''}>
                      </td>
                  </tr>`

      tableEntries.push(entry)
    }

    // Create Dialog Box
    let d = new Dialog({
      title: `Add Items to ${this.item.name}`,
      content: `<div>
                  <div style="padding: 5px 0;">
                      <label>Select Items to add to your ${this.item.name}.</label>
                        ${tooLarge ? "<div>Some items do not appear on this list because their ENC is greater than the capacity in the container.</div>" : ""}
                      </div>
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
                          <tbody>
                              ${tableEntries.join('')}
                          </tbody>
                      </table>
                  </div>
              </div>`,
      buttons: {
        one: {
          label: "Apply",
          callback: html => {
            // Update and assign data to container items
            let selectedItems = [...document.querySelectorAll('.itemSelect')]
            let containedItemsList = []

                for (let i of selectedItems) {
                  let thisItem = this.item.isOwned ? this.actor?.items?.filter(item => item._id == i.dataset.itemId)[0] : {}

                  // Escapes iteration if item is not found on actor
                  if (!thisItem) continue

                  // checks to see if item was selected for storage
                  if (i.checked) {
                    // This pushes a duplicate of the item into contained_item array, but duping the item data does NOT
                    // push over the _id property for some reason. Need to find a way to add it back in

                    // If the item has an existing container, need to access that container and rewrite it's contained_items array
                    if (thisItem?.system?.containerStats?.container_id != "") {
                      let oldContainer = this.actor?.items?.get(thisItem.system.containerStats.container_id)
                      if (oldContainer && Array.isArray(oldContainer?.system?.contained_items)) {
                        let indexToRemove = oldContainer.system.contained_items.indexOf(oldContainer.system.contained_items.find(i => i._id == thisItem._id))
                        if (indexToRemove !== -1) {
                          oldContainer.system.contained_items.splice(indexToRemove, 1)
                          oldContainer.update({'system.contained_items': oldContainer.system.contained_items})
                        }
                      }
                    }

                    thisItem.update({
                      'system.containerStats.contained': true,
                      'system.containerStats.container_id': this.item._id,
                      'system.containerStats.container_name': this.item.name
                  })

                  // This is the data structure for stored items: _id & data
                  containedItemsList.push({_id: thisItem._id, item: thisItem}
                  )

                  } else {
                      if (thisItem?.system?.containerStats?.container_id == this.item._id) {
                        thisItem.update({
                          'system.containerStats.contained': false,
                          'system.containerStats.container_id': "",
                          "system.containerStats.container_name": ""
                        })
                      }
                  }
                }

            //Update the container item with updated list of items
            this.item.update({'system.contained_items': containedItemsList})
          }
        },
        two: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        }
      },
      default: "one",
      close: html => console.log("Closed")
    })

    d.render(true)
  }

  _addToContainer() {
    // Bring up list of all items that are able to be stored into the container.
    // Need to limit the list based on the bag's capacity vs the enc of the items

    // Create List of items to show in list
    const bagListItems = []
    let tooLarge = false
    let itemList = []

    // Return if container is not embedded onto actor
    if (!this.item.isOwned) {
      return ui.notifications.info("Containers must be owned by Actors in order to add items. This will be updated in the future.")
    }

    itemList = this.actor?.items;

    for (let i of itemList) {
      if (
            i._id == this.item._id
            //(i.system.containerStats?.contained &&
            //i.system.containerStats?.container_id != this.item._id)
          ) continue

      Number(i?.system?.enc ?? 0) > Number(this.item?.system?.container_enc?.max ?? 0) ? tooLarge = true : {}
      if (Number(i?.system?.enc ?? 0) <= Number(this.item?.system?.container_enc?.max ?? 0) && i?.system && Object.prototype.hasOwnProperty.call(i.system, "containerStats")) {
        bagListItems.push(i)
      }
    }

    // Execute Dialog box to select items to add to container
    this._createContainerListDialog(bagListItems, tooLarge)

  }

  _onRemoveContainedItem(event) {
    event.preventDefault()
    let element = event.currentTarget
    let removedItemId = element.closest('.item').dataset.itemId
    if (!Array.isArray(this.item?.system?.contained_items)) return;
    
    let indexToRemove = this.item.system.contained_items.indexOf(this.item.system.contained_items.find(item => item._id == removedItemId))
    
    if (indexToRemove === -1) return;

    // Update the container item contents list
    this.item.system.contained_items.splice(indexToRemove, 1)
    this.item.update({'system.contained_items': this.item.system.contained_items})

    // Update the contained item's status
    const itemToUpdate = this.actor?.items?.find(i => i._id == removedItemId);
    if (itemToUpdate) {
      itemToUpdate.update({
        'system.containerStats.contained': false,
        'system.containerStats.container_id': "",
        'system.containerStats.container_name': ""
      })
    }
    this._updateContainedItemsList()
  }

  _updateContainedItemsList() {
    if (!Array.isArray(this.item?.system?.contained_items)) return;
    
    let updatedContainedList = [];

    let wasChanged = false;
    for (let item of this.item.system.contained_items) {
      let sourceItem = this.actor?.items?.find(i => i._id == item._id)
      if (!sourceItem) continue

      const diff = foundry.utils.diffObject(item.item, sourceItem);
      if (diff._stats?.modifiedTime) wasChanged = true;

      updatedContainedList.push({_id: sourceItem._id, item: sourceItem});
    }

    // Bail if there are no updates to avoid infinite loop
    if (!wasChanged) return;

    this.item.update({'system.contained_items': updatedContainedList});
  }

  _pushContainedItemData() {
    // this refreshes content from a stored item to the container item on stored item refresh
    let containerItem = this.actor?.items?.find(i => i._id == this.item.system.containerStats.container_id)
    if (!containerItem || containerItem != null || containerItem != undefined) return
    let indexOfStoredItem = containerItem.system.contained_items.indexOf(containerItem.system.contained_items.find(i => i._id == this.item._id))
    let refreshedData = {_id: this.item._id, item: this.item}

    // Remove old entry
    let splicedArray = containerItem.system.contained_items.splice(indexOfStoredItem, 1)

    // Add refreshed entry
    let refreshedArray = containerItem.system.contained_items.push(refreshedData)
    containerItem.update({'system.contained_items': refreshedArray})
  }

}
