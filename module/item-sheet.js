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
      return `${path}/${this.item.data.type}-sheet.html`;
    }

    getData() {
      const  data = super.getData(); 
      data.dtypes = ["String", "Number", "Boolean"];
      data.isGM = game.user.isGM;
      data.editable = data.options.editable;
      const itemData = data.data;
      data.actor = itemData;
      data.data = itemData.data;
  
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
  }

  /**
   * Handle clickables.
   * @param {Event} event   The originating click event
   * @private
   */

  async _onChargePlus(event) {
    event.preventDefault()
    let chargeMax = this.document.data.data.charge.max;
    let currentCharge = this.document.data.data.charge.value;

    if (currentCharge >= chargeMax) {
      ui.notifications.info("Your item is fully charged.")
    } else {
    currentCharge = currentCharge + 1;
    this.document.update({"data.charge.value" : currentCharge});
    }
  }

  async _onChargeMinus(event) {
    event.preventDefault()
    let currentCharge = this.document.data.data.charge.value;

    if (currentCharge <= 0) {
      ui.notifications.info("Your item is completely drained.")
    } else {
    currentCharge = currentCharge - 1;
    this.document.update({"data.charge.value" : currentCharge});
    }
  }

}
