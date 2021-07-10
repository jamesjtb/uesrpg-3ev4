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
      dragDrop: [{dragSelector: [".item-list .item", ".combat-list .item", ".ability-list .item", ".spell-list .item"], dropSelector: null}]
    });
  }

  /* -------------------------------------------- */

  /** @override */

  getData() {
    const  data = super.getData(); 
    data.dtypes = ["String", "Number", "Boolean"];
    data.isGM = game.user.isGM;
    data.editable = data.options.editable;
    const actorData = data.data;
    data.actor = actorData;
    data.data = actorData.data;
    let options = 0;
    let user = this.user;

    // Prepare Items
    if (this.actor.data.type === 'character') {
      this._prepareCharacterItems(data);
    }

    return data;
    }

    _prepareCharacterItems(sheetData) {
      const actorData = sheetData.actor.data;

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
      const skill = {
        skill: [],
        language: []
      };
      const magicSkill = [];
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
          if (i.data.school !== undefined) {
            spell[i.data.school].push(i);
          }
        }
        //Append to skill
        else if (i.type === 'skill') {
          if (i.name.includes("Language")) {
            skill.language.push(i);
          } else {
            skill.skill.push(i);
          }
        }
        //Append to magicSkill
        else if (i.type === 'magicSkill') {
          magicSkill.push(i);
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
      actorData.skill = skill;
      actorData.magicSkill = magicSkill;
      actorData.ammunition = ammunition;

    }

  /* -------------------------------------------- */

  /** @override */
	async activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons
    html.find(".characteristic-roll").click(await this._onClickCharacteristic.bind(this));
    html.find(".skill-roll").click(await this._onSkillRoll.bind(this));
    html.find(".combat-roll").click(await this._onCombatRoll.bind(this));
    html.find(".magic-roll").click(await this._onSpellRoll.bind(this));
    html.find(".resistance-roll").click(this._onResistanceRoll.bind(this));
    html.find(".damage-roll").click(this._onDamageRoll.bind(this));
    html.find(".armor-roll").click(await this._onArmorRoll.bind(this));
    html.find(".ammo-roll").click(await this._onAmmoRoll.bind(this));
    html.find(".ability-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".talents-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".spell-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".combat-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".item-list .item-img").click(await this._onTalentRoll.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(await this._onToggle2H.bind(this));
    html.find(".ammo-plus").click(await this._onPlusAmmo.bind(this));
    html.find(".ammo-minus").click(await this._onMinusAmmo.bind(this));
    html.find(".itemEquip").click(await this._onItemEquip.bind(this));

    //Item Create Buttons
    html.find(".combat-create").click(await this._onItemCreate.bind(this));
    html.find(".weapon-create").click(await this._onItemCreate.bind(this));
    html.find(".ammo-create").click(await this._onItemCreate.bind(this));
    html.find(".armor-create").click(await this._onItemCreate.bind(this));
    html.find(".gear-create").click(await this._onItemCreate.bind(this));
    html.find(".trait-create").click(await this._onItemCreate.bind(this));
    html.find(".power-create").click(await this._onItemCreate.bind(this));
    html.find(".talent-create").click(await this._onItemCreate.bind(this));

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Update Inventory Item
    html.find('.item-name').click( async (ev) => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      item.sheet.render(true);
      await item.update({"data.value" : item.data.data.value})
    });

    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = ev.currentTarget.closest(".item");
      this.actor.deleteEmbeddedDocuments("Item", [li.dataset.itemId]);
    });

  }

  /**
   * Handle clickable rolls.
   * @param event   The originating click event
   * @private
   */
  

  async _onClickCharacteristic(event) {
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
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

    let roll = new Roll("1d100");
    roll.roll({async:false});
    let contentString = "";

      if (this.actor.data.data.wounded === true) {
        if (roll.total == this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
          contentString = `<h4>Rolls for <b>${element.name}</b>!</h4>
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
    
        } else if (roll.total === this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
          contentString = `<h4>Rolls for <b>${element.name}</b>!</h4>
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
    
        } else {
          contentString = `<h4>Rolls for <b>${element.name}</b>!</h4>
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <b>${roll.total<=wounded_char ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
        } 
      } else {
      if (roll.total === this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
        contentString = `<h4>Rolls for <b>${element.name}</b>!</h4>
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

      } else if (roll.total === this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
        contentString = `<h4>Rolls for <b>${element.name}</b>!</h4>
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

      } else {
        contentString = `<h4>Rolls for <b>${element.name}</b>!</h4>
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].value} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <b>${roll.total<=(this.actor.data.data.characteristics[element.id].value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
      }
    }
    await roll.toMessage({
      async: false,
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: contentString
    }) 
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

  async _onSkillRoll(event) {
    event.preventDefault()
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.actor.items.get(li?.dataset.itemId);
    const luck1 = this.actor.data.data.lucky_numbers.ln1;
    const luck2 = this.actor.data.data.lucky_numbers.ln2;
    const luck3 = this.actor.data.data.lucky_numbers.ln3;
    const luck4 = this.actor.data.data.lucky_numbers.ln4;
    const luck5 = this.actor.data.data.lucky_numbers.ln5;
    const luck6 = this.actor.data.data.unlucky_numbers.ul1;
    const luck7 = this.actor.data.data.unlucky_numbers.ul2;
    const luck8 = this.actor.data.data.unlucky_numbers.ul3;
    const luck9 = this.actor.data.data.unlucky_numbers.ul4;
    const luck10 = this.actor.data.data.unlucky_numbers.ul5;

    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${item.name} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());
            let contentString = "";
            let roll = new Roll("1d100");
            roll.roll({async:false});

          if (roll.total === luck1 || roll.total === luck2 || roll.total === luck3 || roll.total === luck4 || roll.total === luck5) {
            contentString = `<h4>Rolls for <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == luck6 || roll.total === luck7 || roll.total === luck8 || roll.total === luck9 || roll.total === luck10) {
            contentString = `<h4>Rolls for <b>${item.name}</b></h4>!
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else if (this.actor.data.data.wounded === true) {
            contentString = `<h4>Rolls for <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput} + ${this.actor.data.data.woundPenalty}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput + this.actor.data.data.woundPenalty) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`

          } else {
            contentString = `<h4>Rolls for <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
          }
          await roll.toMessage({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: contentString
          })
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

      await item.update({"data.data.value" : item.data.data.value});
  }

  async _onSpellRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    let hit_loc = ""

    let roll = new Roll(item.data.data.damage);
    roll.roll({async:false});
    let hit = new Roll("1d10");
    hit.roll({async:false});

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

    let contentString = `<h4>Casts the spell <b>${item.name}!</b></h4>
    <p></p>
    <b>Damage: [[${roll.result}]]</b> ${roll._formula}<b>
    <p></p>
    Hit Location: [[${hit.total}]]</b> ${hit_loc}<b>
    <p></p>
    MP Cost: [[${item.data.data.cost}]]
    <p></p>
    Attributes:</b> ${item.data.data.attributes}`

    await roll.toMessage({
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      async: false,
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: contentString
    })
  }

  async _onCombatRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${item.name} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

          let roll = new Roll("1d100");
          roll.roll({async:false});
          let contentString = "";
          
          if (roll.total == this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
            contentString = `<h4>Rolls Combat Style <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            contentString = `<h4>Rolls Combat Style <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else if (this.actor.data.data.wounded === true) {
            contentString = `<h4>Rolls Combat Style <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput} + ${this.actor.data.data.woundPenalty}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput + this.actor.data.data.woundPenalty) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`

          } else {
            contentString = `<h4>Rolls Combat Style <b>${item.name}</b>!</h4>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
          }
          await roll.toMessage({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: contentString
          })
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

      await item.update({"data.value" : item.data.data.value});
  }

  async _onResistanceRoll(event) {
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
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

          let roll = new Roll("1d100");
          roll.roll({async:false});
          let contentString = "";

          if (roll.total == this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
            contentString = `<h4>Rolls Resistance for <b>${element.name}</b>!</h4>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            contentString = `<h4>Rolls Resistance for <b>${element.name}</b>!</h4>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:red; font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else {
            contentString = `<h4>Rolls Resistance for <b>${element.name}</b>!</h4>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(this.actor.data.data.resistance[element.id] + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: red; font-size: 120%;'> <b>FAILURE!</b></span>"}`
          }
          await roll.toMessage({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: contentString
          })
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

  async _onDamageRoll(event) {
    event.preventDefault()
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.actor.items.get(li?.dataset.itemId);
    const d1 = this.actor.items.get(li?.dataset.itemId).data.data.damage;
    const d2 = this.actor.items.get(li?.dataset.itemId).data.data.damage2;

    let hit_loc = "";

    let hit = new Roll("1d10");
    hit.roll({async:false});

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

    let roll = new Roll(d1);
    let supRoll = new Roll(d1);
    let roll2H = new Roll(d2);
    let supRoll2H = new Roll(d2);
    let contentString = "";
    roll.roll({async:false});
    supRoll.roll({async:false});
    roll2H.roll({async:false});
    supRoll2H.roll({async:false});

    if (item.data.data.weapon2H === true) {
      if (item.data.data.superior === true) {
        contentString = `<h4>Rolls damage for their <b>${item.name}!</b></h4>
          <p></p>
          <b>Damage:</b> <b> [[${roll2H.result}]] [[${supRoll2H.result}]]</b> ${roll2H._formula}<p></p>
          <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
          <b>Qualities:</b> ${item.data.data.qualities}`
          ChatMessage.create({
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: contentString,
            roll: supRoll2H, roll2H
          })

      } else {
        contentString = `<h4>Rolls damage for their <b>${item.name}!</b></h4>
            <p></p>
            <b>Damage:</b> <b> [[${roll2H.result}]]</b> ${roll2H._formula}<p></p>
            <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
            <b>Qualities:</b> ${item.data.data.qualities}`
            ChatMessage.create({
              type: CONST.CHAT_MESSAGE_TYPES.ROLL,
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              content: contentString,
              roll: roll2H
            })
        }

    } else {
        if (item.data.data.superior === true) {
          contentString = `<h4>Rolls damage for their <b>${item.name}!</b></h4>
            <p></p>
            <b>Damage:</b> <b> [[${roll.result}]] [[${supRoll.result}]]</b> ${roll._formula}<p></p>
            <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
            <b>Qualities:</b> ${item.data.data.qualities}`
            ChatMessage.create({
              type: CONST.CHAT_MESSAGE_TYPES.ROLL,
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              content: contentString,
              roll: roll, supRoll
            })

      } else {
        contentString = `<h4>Rolls damage for their <b>${item.name}!</b></h4>
            <p></p>
            <b>Damage:</b> <b> [[${roll.result}]]</b> ${roll._formula}<p></p>
            <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
            <b>Qualities:</b> ${item.data.data.qualities}`
            ChatMessage.create({
              type: CONST.CHAT_MESSAGE_TYPES.ROLL,
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              content: contentString,
              roll: roll
            })
          }
        }
  }
  
  async _onArmorRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.items.get(li.data("itemId"));

    const content = `<h2>${item.name}</h2><p>
      <b>AR:</b> ${item.data.data.armor}<p>
      <b>Magic AR:</b> ${item.data.data.magic_ar}<p>
      <b>Qualities</b> ${item.data.data.qualities}`
      await ChatMessage.create({user: game.user.id, 
        speaker: ChatMessage.getSpeaker(), 
        content: content});
  }

  async _onAmmoRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    const contentString = `<h2>${item.name}</h2><p>
      <b>Damage Bonus:</b> ${item.data.data.damage}<p>
      <b>Qualities</b> ${item.data.data.qualities}`

      if (item.data.data.quantity > 0){
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: contentString
        })
      }

    item.data.data.quantity = item.data.data.quantity - 1;
    if (item.data.data.quantity < 0){
      item.data.data.quantity = 0;
      ui.notifications.info("Out of Ammunition!");
    }
      await item.update({"data.quantity" : item.data.data.quantity})
    }

  async _onToggle2H(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.data.data.weapon2H === false) {
      item.data.data.weapon2H = true;
    } else if (item.data.data.weapon2H === true) {
      item.data.data.weapon2H = false;
    }
    await item.update({"data.weapon2H" : item.data.data.weapon2H})
  }

  async _onPlusAmmo(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity + 1;

    await item.update({"data.quantity" : item.data.data.quantity})
  }

  async _onMinusAmmo(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity - 1;
    if (item.data.data.quantity < 0){
      item.data.data.quantity = 0;
      ui.notifications.info("Out of Ammunition!");
    }

    await item.update({"data.quantity" : item.data.data.quantity})
  }

  async _onItemEquip(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.data.data.equipped === false) {
      item.data.data.equipped = true;
    } else if (item.data.data.equipped === true) {
      item.data.data.equipped = false;
    }
    await item.update({"data.equipped" : item.data.data.equipped})
  }

  async _onItemCreate(event) {
    event.preventDefault()
    const element = event.currentTarget
    const actor = this.actor
    const itemData = [{
      name: element.id,
      type: element.id
    }];
    const created = await Item.create(itemData, {parent: actor});
    return created;
  }

  async _onTalentRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    let contentString = `<h2>${item.name}</h2><p>
    <i><b>${item.type}</b></i><p>
      <i>${item.data.data.description}</i>`

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: contentString
    })
  }

}
