/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class SimpleItemSheet extends ItemSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "item"],
			width: 520,
			height: 480,
      tabs: [{navSelector: ".sheet-tabs3", contentSelector: ".sheet-body", initial: "description"}]
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
  }

  /**
   * Handle clickables.
   * @param {Event} event   The originating click event
   * @private
   */

}
