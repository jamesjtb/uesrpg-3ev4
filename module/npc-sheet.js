/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class npcSheet extends ActorSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "npc"],
      width: 600,
      height: 600,
      tabs: [{navSelector: ".sheet-tabs2", contentSelector: ".sheet-body", initial: "core"}],
      dragDrop: [{dragSelector: [".item-list .item", ".combat-list .item", ".ability-list .item", ".spell-list .item"], dropSelector: null}]
    });
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    const  data = super.getData(); 
    data.dtypes = ["String", "Number", "Boolean"];

    // Prepare Items
    if (this.actor.data.type == 'npc') {
      this._prepareCharacterItems(data);
    } 
    return  data;
    }
  
    _prepareCharacterItems(sheetData) {
      const actorData = sheetData.actor;

      //Initialize containers
      const gear = [];
      const weapon = [];
      const armor = {
        Equipped: [],
        Unequipped: []
      };
      const power = [];
      const trait = [];
      const talent = [];
      const combatStyle = [];
      const spell = {
        alteration: [],
        conjuration: [],
        destruction: [],
        illusion: [],
        mysticism: [],
        necromancy: [],
        restoration: []
      };
      const ammunition = [];

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
          if (i.data.equipped === true) {
          armor.Equipped.push(i);
          } else {
            armor.Unequipped.push(i);
          }
        }
        //Append to power
        else if (i.type === 'power') {
          power.push(i);
        }
        //Append to trait
        else if (i.type === 'trait') {
          trait.push(i);
        }
        //Append to talent
        else if (i.type === 'talent') {
          talent.push(i);
        }
        //Append to combatStyle
        else if (i.type === 'combatStyle') {
          combatStyle.push(i);
        }
        //Append to spell
        else if (i.type === 'spell') {
          if (i.data.school != undefined) {
            spell[i.data.school].push(i);
          }
        }
        //Append to ammunition
        else if (i.type === 'ammunition') {
          ammunition.push(i);
        }
      }

      //Assign and return
      actorData.gear = gear;
      actorData.weapon = weapon;
      actorData.armor = armor;
      actorData.power = power;
      actorData.trait = trait;
      actorData.talent = talent;
      actorData.combatStyle = combatStyle;
      actorData.spell = spell;
      actorData.ammunition = ammunition;

    }

    get template() {
      const path = "systems/uesrpg-d100/templates";
      if (!game.user.isGM && this.actor.limited) return "systems/uesrpg-d100/templates/limited-npc-sheet.html"; 
      return `${path}/${this.actor.data.type}-sheet.html`;
    }

  /* -------------------------------------------- */

  /** @override */
	activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons
    html.find(".characteristic-roll").click(this._onClickCharacteristic.bind(this));
    html.find(".professions-roll").click(this._onProfessionsRoll.bind(this));
    html.find(".damage-roll").click(this._onDamageRoll.bind(this));
    html.find(".unconventional-roll").click(this._onUnconventionalRoll.bind(this));
    html.find(".magic-roll").click(this._onSpellRoll.bind(this));
    html.find(".resistance-roll").click(this._onResistanceRoll.bind(this));
    html.find(".armor-roll").click(this._onArmorRoll.bind(this));
    html.find(".ammo-roll").click(this._onAmmoRoll.bind(this));
    html.find(".ability-list .item-img").click(this._onTalentRoll.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(this._onToggle2H.bind(this));
    html.find(".ammo-plus").click(this._onPlusAmmo.bind(this));
    html.find(".ammo-minus").click(this._onMinusAmmo.bind(this));
    html.find(".itemEquip").click(this._onItemEquip.bind(this));

    //Item Create Buttons
    html.find(".weapon-create").click(this._onItemCreate.bind(this));
    html.find(".ammo-create").click(this._onItemCreate.bind(this));
    html.find(".armor-create").click(this._onItemCreate.bind(this));
    html.find(".gear-create").click(this._onItemCreate.bind(this));
    html.find(".trait-create").click(this._onItemCreate.bind(this));
    html.find(".power-create").click(this._onItemCreate.bind(this));
    html.find(".talent-create").click(this._onItemCreate.bind(this));

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Update Inventory/Spell Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.getOwnedItem(li.data("itemId"));
      item.sheet.render(true);
    });

    html.find('.item-name').click(ev => {
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
    let wounded_char = this.actor.data.data.characteristics[element.id].value - 20

    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.name} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: html => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

    let roll = new Roll("1d100");
    roll.roll();

      if (this.actor.data.data.wounded == true) {
        if (roll.total == this.actor.data.data.lucky_numbers.ln1 || 
          roll.total == this.actor.data.data.lucky_numbers.ln2 || 
          roll.total == this.actor.data.data.lucky_numbers.ln3 || 
          roll.total == this.actor.data.data.lucky_numbers.ln4 || 
          roll.total == this.actor.data.data.lucky_numbers.ln5 ||
          roll.total == this.actor.data.data.lucky_numbers.ln6 ||
          roll.total == this.actor.data.data.lucky_numbers.ln7 ||
          roll.total == this.actor.data.data.lucky_numbers.ln8 ||
          roll.total == this.actor.data.data.lucky_numbers.ln9 ||
          roll.total == this.actor.data.data.lucky_numbers.ln10)

         {
          const content = `Rolls for <b>${element.name}</b>!
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.total}]]</b><p></p>
          <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
          roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
    
        } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
          roll.total == this.actor.data.data.unlucky_numbers.ul6) 
          {
          const content = `Rolls for <b>${element.name}</b>!
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.total}]]</b><p></p>
          <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
          roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
    
        } else {
          const content = `Rolls for <b>${element.name}</b>!
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.total}]]</b><p></p>
          <b>${roll.total<=wounded_char ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
          roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
        } 
      } else {
        if (roll.total == this.actor.data.data.lucky_numbers.ln1 || 
          roll.total == this.actor.data.data.lucky_numbers.ln2 || 
          roll.total == this.actor.data.data.lucky_numbers.ln3 || 
          roll.total == this.actor.data.data.lucky_numbers.ln4 || 
          roll.total == this.actor.data.data.lucky_numbers.ln5 ||
          roll.total == this.actor.data.data.lucky_numbers.ln6 ||
          roll.total == this.actor.data.data.lucky_numbers.ln7 ||
          roll.total == this.actor.data.data.lucky_numbers.ln8 ||
          roll.total == this.actor.data.data.lucky_numbers.ln9 ||
          roll.total == this.actor.data.data.lucky_numbers.ln10)

      {
        const content = `Rolls for <b>${element.name}</b>!
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.total}]]</b><p></p>
        <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
        roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});

      } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
          roll.total == this.actor.data.data.unlucky_numbers.ul6) 

      {
        const content = `Rolls for <b>${element.name}</b>!
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.total}]]</b><p></p>
        <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
        roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});

      } else {
        const content = `Rolls for <b>${element.name}</b>!
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.total}]]</b><p></p>
        <b>${roll.total<=(this.actor.data.data.characteristics[element.id].value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
        roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
      }
    } 
    }
  },
  two: {
    label: "Cancel",
    callback: html => console.log("Cancelled")
  }
  },
  default: "one",
  close: html => console.log()
  });
  d.render(true);
  }

  _onProfessionsRoll(event) {
    event.preventDefault()
    const element = event.currentTarget

    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.name} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: html => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

            let roll = new Roll("1d100");
            roll.roll();

            if (roll.total == this.actor.data.data.lucky_numbers.ln1 || 
              roll.total == this.actor.data.data.lucky_numbers.ln2 || 
              roll.total == this.actor.data.data.lucky_numbers.ln3 || 
              roll.total == this.actor.data.data.lucky_numbers.ln4 || 
              roll.total == this.actor.data.data.lucky_numbers.ln5 ||
              roll.total == this.actor.data.data.lucky_numbers.ln6 ||
              roll.total == this.actor.data.data.lucky_numbers.ln7 ||
              roll.total == this.actor.data.data.lucky_numbers.ln8 ||
              roll.total == this.actor.data.data.lucky_numbers.ln9 ||
              roll.total == this.actor.data.data.lucky_numbers.ln10)
              {
              const content = `Rolls for <b>${element.name}</b>!
              <p></p><b>Target Number: [[${this.actor.data.data.professions[element.id]} + ${playerInput}]]</b> <p></p>
              <b>Result: [[${roll.total}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
              roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
              }
              else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
                roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
                roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
                roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
                roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
                roll.total == this.actor.data.data.unlucky_numbers.ul6) 
                {
                  const content = `Rolls for <b>${element.name}</b>!
                  <p></p><b>Target Number: [[${this.actor.data.data.professions[element.id]} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.total}]]</b><p></p>
                  <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
                  roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
                } else {
                  const content = `Rolls for <b>${element.name}</b>!
                  <p></p><b>Target Number: [[${this.actor.data.data.professions[element.id]} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.total}]]</b><p></p>
                  <b>${roll.total<=(this.actor.data.data.professions[element.id] + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
                  roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
                }
          }
        },
        two: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        }
        },
        default: "one",
        close: html => console.log()
        });
        d.render(true);
  }

  _onUnconventionalRoll(event) {
    event.preventDefault()
    const element = event.currentTarget

    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.name} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: html => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

          let roll = new Roll("1d100");
          roll.roll();

          if (roll.total == this.actor.data.data.lucky_numbers.ln1 || 
            roll.total == this.actor.data.data.lucky_numbers.ln2 || 
            roll.total == this.actor.data.data.lucky_numbers.ln3 || 
            roll.total == this.actor.data.data.lucky_numbers.ln4 || 
            roll.total == this.actor.data.data.lucky_numbers.ln5 ||
            roll.total == this.actor.data.data.lucky_numbers.ln6 ||
            roll.total == this.actor.data.data.lucky_numbers.ln7 ||
            roll.total == this.actor.data.data.lucky_numbers.ln8 ||
            roll.total == this.actor.data.data.lucky_numbers.ln9 ||
            roll.total == this.actor.data.data.lucky_numbers.ln10)
            {
              const content = `Rolls for <b>${element.name}</b>!
              <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].bonus} + ${playerInput}]]</b> <p></p>
              <b>Result: [[${roll.total}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
              roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
            } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
              roll.total == this.actor.data.data.unlucky_numbers.ul6) 
              {
                const content = `Rolls for <b>${element.name}</b>!
                <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].bonus} + ${playerInput}]]</b> <p></p>
                <b>Result: [[${roll.total}]]</b><p></p>
                <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
                roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
              } else {
                const content = `Rolls for <b>${element.name}</b>!
                <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].bonus} + ${playerInput}]]</b> <p></p>
                <b>Result: [[${roll.total}]]</b><p></p>
                <b>${roll.total<=(this.actor.data.data.skills[element.id].bonus + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
                roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
              }
        }
      },
      two: {
        label: "Cancel",
        callback: html => console.log("Cancelled")
      }
      },
      default: "one",
      close: html => console.log()
      });
      d.render(true);
  }

  _onDamageRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));
      
    let hit_loc = "";
      
    let hit = new Roll("1d10");
    hit.roll();
      
    if (hit.total <= 5) {
      hit_loc = "Body"
    } else if (hit.total == 6) {
      hit_loc = "Right Leg"
    } else if (hit.total == 7) {
      hit_loc = "Left Leg"
    } else if (hit.total == 8) {
      hit_loc = "Right Arm"
    } else if (hit.total == 9) {
      hit_loc = "Left Arm"
    } else if (hit.total == 10) {
      hit_loc = "Head"
    }
      
    let roll = new Roll(item.data.data.damage);
    let supRoll = new Roll(item.data.data.damage);
    let roll2H = new Roll(item.data.data.damage2);
    let supRoll2H = new Roll(item.data.data.damage2);
    roll.roll();
    supRoll.roll();
    roll2H.roll();
    supRoll2H.roll();
      
          if (item.data.data.weapon2H == true) {
            if (item.data.data.superior == true) {
              const content = `Rolls damage for their <b>${item.name}!</b>
                <p></p>
                <b>Damage:</b> <b> [[${roll2H.total}]] [[${supRoll2H.total}]]</b> ${roll2H._formula}<p></p>
                <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
                <b>Qualities:</b> ${item.data.data.qualities}`
                roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
      
            } else {
                const content = `Rolls damage for their <b>${item.name}!</b>
                  <p></p>
                  <b>Damage:</b> <b> [[${roll2H.total}]]</b> ${roll2H._formula}<p></p>
                  <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
                  <b>Qualities:</b> ${item.data.data.qualities}`
                  roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
              }
      
          } else {
              if (item.data.data.superior == true) {
                const content = `Rolls damage for their <b>${item.name}!</b>
                  <p></p>
                  <b>Damage:</b> <b> [[${roll.total}]] [[${supRoll.total}]]</b> ${roll._formula}<p></p>
                  <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
                  <b>Qualities:</b> ${item.data.data.qualities}`
                  roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
      
            } else {
                const content = `Rolls damage for their <b>${item.name}!</b>
                  <p></p>
                  <b>Damage:</b> <b> [[${roll.total}]]</b> ${roll._formula}<p></p>
                  <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
                  <b>Qualities:</b> ${item.data.data.qualities}`
                  roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
                }
              }
  }

  _onSpellRoll(event) {
      event.preventDefault()
      let button = $(event.currentTarget);
      const li = button.parents(".item");
      const item = this.actor.getOwnedItem(li.data("itemId"));
      
      let hit_loc = ""
      
      let roll = new Roll(item.data.data.damage);
      roll.roll();
      let hit = new Roll("1d10");
      hit.roll();
      
      if (hit.total <= 5) {
        hit_loc = "Body"
      } else if (hit.total == 6) {
        hit_loc = "Right Leg"
      } else if (hit.total == 7) {
        hit_loc = "Left Leg"
      } else if (hit.total == 8) {
         hit_loc = "Right Arm"
       } else if (hit.total == 9) {
        hit_loc = "Left Arm"
       } else if (hit.total == 10) {
        hit_loc = "Head"
      }
    
      const content = `Casts the spell <b>${item.name}!</b>
       <p></p>
       <b>Damage: [[${roll.total}]]</b> ${roll._formula}<b>
      <p></p>
      Hit Location: [[${hit.total}]]</b> ${hit_loc}<b>
       <p></p>
       MP Cost: [[${item.data.data.cost}]]
      <p></p>
       Attributes:</b> ${item.data.data.attributes}`
      
      roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }
      
  _onCombatRoll(event) {
  event.preventDefault()
  let button = $(event.currentTarget);
  const li = button.parents(".item");
  const item = this.actor.getOwnedItem(li.data("itemId"));
      
  let d = new Dialog({
    title: "Apply Roll Modifier",
    content: `<form>
                <div class="dialogForm">
                <label><b>${item.name} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                  </form>`,
        buttons: {
          one: {
            label: "Roll!",
            callback: html => {
              const playerInput = parseInt(html.find('[id="playerInput"]').val());
      
            let roll = new Roll("1d100");
            roll.roll();
      
                if (roll.total == this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
                  const content = `Rolls Combat Style <b>${item.name}</b>!
                  <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.total}]]</b><p></p>
                  <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
                  roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
      
                } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
                  const content = `Rolls Combat Style <b>${item.name}</b>!
                  <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.total}]]</b><p></p>
                  <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
                  roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
      
                } else {
                  const content = `Rolls Combat Style <b>${item.name}</b>!
                  <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.total}]]</b><p></p>
                  <b>${roll.total<=(item.data.data.value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
                  roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
                }
              }
            },
            two: {
              label: "Cancel",
              callback: html => console.log("Cancelled")
            }
            },
            default: "one",
            close: html => console.log()
            });
            d.render(true);
  }

  _onResistanceRoll(event) {
    event.preventDefault()
    const element = event.currentTarget

    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.name} Resistance Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: html => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

          let roll = new Roll("1d100");
          roll.roll();

          if (roll.total == this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
            const content = `Rolls Resistance for <b>${element.name}</b>!
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.total}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
            roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            const content = `Rolls Resistance for <b>${element.name}</b>!
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.total}]]</b><p></p>
            <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
            roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});

          } else {
            const content = `Rolls Resistance for <b>${element.name}</b>!
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.total}]]</b><p></p>
            <b>${roll.total<=(this.actor.data.data.resistance[element.id] + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
            roll.toMessage({type: 4, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
          }
        }
      },
      two: {
        label: "Cancel",
        callback: html => console.log("Cancelled")
      }
      },
      default: "one",
      close: html => console.log()
      });
      d.render(true);

  }

  _onArmorRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    let roll = new Roll("1d10")
    roll.roll();

    const content = `<h2>${item.name}</h2><p>
      <b>AR:</b> ${item.data.data.armor}<p>
      <b>Magic AR:</b> ${item.data.data.magic_ar}<p>
      <b>Qualities</b> ${item.data.data.qualities}`
      roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

  _onAmmoRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity - 1;
    item.update({"data.quantity" : item.data.data.quantity})

    let roll = new Roll("1d10")
    roll.roll();

    const content = `<h2>${item.name}</h2><p>
      <b>Damage Bonus:</b> ${item.data.data.damage}<p>
      <b>Qualities</b> ${item.data.data.qualities}`
      roll.toMessage({type: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

  _onToggle2H(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    if (item.data.data.weapon2H === false) {
      item.data.data.weapon2H = true;
    } else if (item.data.data.weapon2H === true) {
      item.data.data.weapon2H = false;
    }
    item.update({"data.weapon2H" : item.data.data.weapon2H})
  }

  _onPlusAmmo(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity + 1;

    item.update({"data.quantity" : item.data.data.quantity})
  }

  _onMinusAmmo(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity - 1;

    item.update({"data.quantity" : item.data.data.quantity})
  }

  _onItemEquip(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    if (item.data.data.equipped === false) {
      item.data.data.equipped = true;
    } else if (item.data.data.equipped === true) {
      item.data.data.equipped = false;
    }
    item.update({"data.equipped" : item.data.data.equipped})
  }

  _onItemCreate(event) {
    event.preventDefault()
    const element = event.currentTarget

    const itemData = {
      name: element.id,
      type: element.id,
    }

    this.actor.createOwnedItem(itemData);
  }

  _onTalentRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getOwnedItem(li.data("itemId"));

    let roll = new Roll("1d10")
    roll.roll();

    const content = `<h2>${item.name} (${item.type})</h2><p>
      <i>${item.data.data.description}</i>`
      roll.toMessage({typ: 1, user: game.user._id, speaker: ChatMessage.getSpeaker(), content: content});
  }

}
