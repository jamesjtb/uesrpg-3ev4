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

    // Register listeners for items that have modifier arrays
    if (this.item.system.hasOwnProperty('skillArray')) {
      html.find(".modifier-create").click(this._onModifierCreate.bind(this))
      this._createModifierEntries()
      html.find('.item-delete').click(this._onDeleteModifier.bind(this))
    }
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

}
