/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class SimpleActorSheet extends ActorSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
  	  classes: ["worldbuilding", "sheet", "actor"],
  	  template: "systems/uesrpg-d100/templates/actor-sheet.html",
      width: 600,
      height: 600,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}],
      dragDrop: [{dragSelector: ".item-list .item", dropSelector: null}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    const  data = super.getData(); 
    data.dtypes = ["String", "Number", "Boolean"];

    // Prepare Items
    if (this.actor.data.type == 'character') {
      this._prepareCharacterItems(data);
    }

    return data;
    }

    _prepareCharacterItems(sheetData) {
      const actorData = sheetData.actor;

      //Initialize containers
      const gear = [];
      const weapon = [];
      const armor = [];
      const spell = {
        alteration: [],
        conjuration: [],
        destruction: [],
        illusion: [],
        mysticism: [],
        necromancy: [],
        restoration: []
      };

      //Iterate through items, allocating to containers
      //let totaWeight = 0;
      for (let i of sheetData.items) {
        let item = i.data;
        i.img = i.img || DEFAULT_TOKEN;
        //Append to item
        if (i.type === 'item') {
          gear.push(i);
        }
        //Append to weapons
        else if (i.type === 'weapon') {
          weapon.push(i);
        }
        //Append to armor
        else if (i.type === 'armor') {
          armor.push(i);
        }
        //Append to spell
        else if (i.type === 'spell') {
          if (i.data.school != undefined) {
            spell[i.data.school].push(i);
          }
        }
      }

      //Assign and return
      actorData.gear = gear;
      actorData.weapon = weapon;
      actorData.armor = armor;
      actorData.spell = spell;

    }

  /* -------------------------------------------- */

  /** @override */
	activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons
    html.find(".characteristic-roll").click(this._onClickCharacteristic.bind(this));
    html.find(".skill-roll").click(this._onSkillRoll.bind(this));
    html.find(".magic-skill-roll").click(this._onMagicSkillRoll.bind(this));
    html.find(".weapon-roll").click(this._onWeaponRoll.bind(this));
    html.find(".combat-style-roll").click(this._onCombatRoll.bind(this));

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.getOwnedItem(li.data("itemId"));
      item.sheet.render(true);
    });

    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.deleteOwnedItem(li.data("itemId"));
      li.slideUp(200, () => this.render(false));
    });

  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */

  _onClickCharacteristic(event) {
    event.preventDefault()
    const element = event.currentTarget

    let roll = new Roll("1d100");
    roll.roll();
  
    const content = `Rolls for <b>${element.name}</b>!
      <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value}]]</b> <p></p>
      <b>Result: [[${roll.total}]]</b><p></p>
      <b>${roll.total<=this.actor.data.data.characteristics[element.id].value ? "SUCCESS!": "FAILURE!"}</b>`
      roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
 
  }

  _onSkillRoll(event) {
  event.preventDefault()
  const element = event.currentTarget

  let roll = new Roll("1d100");
  roll.roll();

  const content = `Rolls for <b>${element.name}</b>!
    <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].tn}]]</b> <p></p>
    <b>Result: [[${roll.total}]]</b><p></p>
    ${roll.total<=this.actor.data.data.skills[element.id].tn ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
    roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

  _onMagicSkillRoll(event) {
    event.preventDefault()
    const element = event.currentTarget
  
    let roll = new Roll("1d100");
    roll.roll();
  
    const content = `Rolls for <b>${element.name}</b>!
      <p></p><b>Target Number: [[${this.actor.data.data.magic_skills[element.id].tn}]]</b> <p></p>
      <b>Result: [[${roll.total}]]</b><p></p>
      ${roll.total<=this.actor.data.data.magic_skills[element.id].tn ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
      roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

  _onWeaponRoll(event) {
    event.preventDefault()
    const element = event.currentTarget

    let roll = new Roll(this.actor.data.data.weapons[element.id].dmg);
    roll.roll();
    let hit = new Roll("1d10");
    hit.roll();

    const content = `Rolls damage for their <b>${this.actor.data.data.weapons[element.id].name}!</b>
    <p></p>
    <b>Damage:</b> <b>[[${roll.total}]]</b><p></p>
    <b>Hit Location:</b> <b>[[${hit.total}]]</b><p></p>
    <b>Qualities:</b> ${this.actor.data.data.weapons[element.id].qualities}
    `
    roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

  _onCombatRoll(event) {
    event.preventDefault()
    const element = event.currentTarget

    let roll = new Roll("1d100");
    roll.roll();

  const content = `Rolls Combat Style <b>${element.name}</b>!
    <p></p><b>Target Number: [[${this.actor.data.data.combat_styles[element.id].tn}]]</b> <p></p>
    <b>Result: [[${roll.total}]]</b><p></p>
    <b>${roll.total<=this.actor.data.data.combat_styles[element.id].tn ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`

    roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

}
