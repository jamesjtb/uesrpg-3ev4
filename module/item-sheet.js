/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class SimpleItemSheet extends ItemSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "item"],
			width: 480,
			height: 520,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}]
		});
  }

  /* -------------------------------------------- */

/** @override */
    get template() {
      const path = "systems/uesrpg-d100/templates";
      return `${path}/${this.item.type}-sheet.html`;
    }

    getData() {
      const  data = super.getData(); 
      data.dtypes = ["String", "Number", "Boolean"];
      data.isGM = game.user.isGM;
      data.editable = data.options.editable;
      const itemData = data.system;
      data.actor = itemData;
      data.data = itemData;
  
      return data;
      }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options={}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".sheet-body");
    const bodyHeight = position.height - 192;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
	activateListeners(html) {
    super.activateListeners(html);

    //Item Value Change Buttons
    html.find(".chargePlus").click(this._onChargePlus.bind(this));
    html.find(".chargeMinus").click(this._onChargeMinus.bind(this));
    html.find(".addToContainer").click(this._addToContainer.bind(this));

    // Register listeners for items that have modifier arrays
    if (this.item.system.hasOwnProperty('skillArray')) {
      html.find(".modifier-create").click(this._onModifierCreate.bind(this))
      this._createModifierEntries()
      html.find('.item-delete').click(this._onDeleteModifier.bind(this))
    }

    // Registers functions for item sheet renders
    html.find('.item-name').click( async (ev) => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      item.sheet.render(true);
      await item.update({"system.value" : item.system.value})
    });

    // Remove Contained Item from Container
    html.find(".remove-contained-item").click(this._onRemoveContainedItem.bind(this));

    // Update contained Items elements list (this keeps the contents list updated if items are updated themselves)
    this.item.type == 'container' && this.isOwned ? this._updateContainedItemsList() : {}
    this.item.system.hasOwnProperty('containerStats') && this.item.type != 'container' ? this._pushContainedItemData() : {}
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
    if (this.actor.type === 'character') {
      for (let skill of this.actor.items.filter(i => i.type === 'skill'||i.type === 'magicSkill'||i.type === 'combatStyle')) {
        modifierOptions.push(`<option value="${skill.name}">${skill.name}</option>`)
      }
    }

    if (this.actor.type === 'npc') {
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
      let modItem = this.actor.items.find(i => i.name === entry.name) || entry.name

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
    let tableEntries = []
    for (let bagItem of bagListItems) {
      let entry = `<tr data-item-id="${bagItem._id}">
                      <td data-item-id="${bagItem._id}">
                          <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                            <img class="item-img" src="${bagItem.img}" height="24" width="24">
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
                  let thisItem = this.item.isOwned ? this.actor.items.filter(item => item._id == i.dataset.itemId)[0] : {}

                  // Escapes iteration if item is not found on actor
                  if (!thisItem) continue

                  // checks to see if item was selected for storage
                  if (i.checked) {
                    // This pushes a duplicate of the item into contained_item array, but duping the item data does NOT
                    // push over the _id property for some reason. Need to find a way to add it back in

                    thisItem.update({
                      'system.containerStats.contained': true, 
                      'system.containerStats.container_id': this.item._id,
                      'system.containerStats.container_name': this.item.name
                  })

                  // This is the data structure for stored items: _id & data
                  containedItemsList.push({_id: thisItem._id, item: thisItem}
                  )

                  } else {
                      if (thisItem.system.containerStats.container_id == this.item._id) {
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
            console.log(this.item.system.contained_items)
          }
        },
        two: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        }
      },
      default: "Apply",
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
    if (this.item.isOwned) {itemList = this.actor.items}
    else { 
      return ui.notifications.info("Containers must be owned by Actors in order to add items. This will be updated in the future.")
    }

    for (let i of itemList) {
      if (
            i._id == this.item._id 
            //(i.system.containerStats?.contained && 
            //i.system.containerStats?.container_id != this.item._id)
          ) continue

      i.system.enc > this.item.system.container_enc.max ? tooLarge = true : {}
      if (i.system.enc <= this.item.system.container_enc.max && i.system.hasOwnProperty("containerStats")) {
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
    let indexToRemove = this.item.system.contained_items.indexOf(this.item.system.contained_items.find(item => item._id == removedItemId))

    // Update the contained item's status
    this.actor.items.find(i => i._id == removedItemId).update({
      'system.containerStats.contained': false, 
      'system.containerStats.container_id': "",
      'system.containerStats.container_name': ""
    })

    // Update the container item contents list
    this.item.update({'system.contained_items': this.item.system.contained_items.splice(indexToRemove, 1)})

    this._updateContainedItemsList()

  }

  _updateContainedItemsList() {
    let updatedContainedList = []
    this.item.system.contained_items.forEach(item => {
      let sourceItem = this.actor.items.find(i => i._id == item._id)
      let updatedEntry = {_id: sourceItem._id, item: sourceItem}
      // {
        // _id: sourceItem._id,
        // name: sourceItem.name,
        // type: sourceItem.type,
        // img: sourceItem.img,
        // enc: sourceItem.system.enc,
        // quantity: sourceItem.system.quantity
      // }

      updatedContainedList.push(updatedEntry)
    })

    this.item.update({'system.contained_items': updatedContainedList})
  }

  _pushContainedItemData() {
    // this refreshes content from a stored item to the container item on stored item refresh
    let containerItem = this.actor.items.find(i => i._id == this.item.system.containerStats.container_id)
    if (!containerItem || containerItem != null || containerItem != undefined) return
    let indexOfStoredItem = containerItem.system.contained_items.indexOf(containerItem.system.contained_items.find(i => i._id == this.item._id))
    let refreshedData = this.item
    //{
      // _id: this.item._id,
      // name: this.item.name,
      // type: this.item.type,
      // img: this.item.img,
      // enc: this.item.system.enc,
      // quantity: this.item.system.quantity
    // }

    // Remove old entry
    containerItem.system.contained_items.splice(indexOfStoredItem, 1)

    // Add refreshed entry
    containerItem.system.contained_items.push(refreshedData)
    containerItem.update({'system.contained_items': containerItem.system.contained_items})
  }

}
