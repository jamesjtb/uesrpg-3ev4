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
      width: 650,
      height: 720,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description"}],
      dragDrop: [{dragSelector: [".item"], 
      dropSelector: null}]
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
    const skill = [];
    const magicSkill = [];
    const ammunition = [];
    const language = [];
    const faction = [];

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
          skill.push(i);
      }
      //Append to magicSkill
      else if (i.type === 'magicSkill') {
        magicSkill.push(i);
      }
      //Append to ammunition
      else if (i.type === 'ammunition') {
        ammunition.push(i);
      }
      else if (i.type === "language") {
        language.push(i);
      }
      //Append to faction
      else if (i.type === "faction") {
        faction.push(i);
      }
    }

    // Alphabetically sort all item lists
    const itemCats = [gear, weapon, armor, power, trait, talent, combatStyle, spell, skill, magicSkill, ammunition, language, faction]
    for (let category of itemCats) {
      if (category.length > 1 && category != spell) {
        category.sort((a,b) => {
          let nameA = a.name.toLowerCase()
          let nameB = b.name.toLowerCase()
          if (nameA > nameB) {return 1}
          else {return -1}
        })
      }
      else if (category == spell) {
        for (let school in category) {
          let spellArray = category[school]
          if (spellArray.length > 1) {
            spellArray.sort((a,b) => {
              let nameA = a.name.toLowerCase()
              let nameB = b.name.toLowerCase()
              if (nameA > nameB) {return 1}
              else {return -1}
            })
          }
        }
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
    actorData.language = language;
    actorData.faction = faction;

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
    html.find(".itemTabInfo .supplyRoll").click(await this._onSupplyRoll.bind(this));
    html.find("#luckyMenu").click(this._onLuckyMenu.bind(this));
    html.find("#raceMenu").click(this._onRaceMenu.bind(this));
    html.find('#birthSignMenu').click(this._onBirthSignMenu.bind(this));
    html.find('#xpMenu').click(this._onXPMenu.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(await this._onToggle2H.bind(this));
    html.find(".ammo-plus").click(await this._onPlusAmmo.bind(this));
    html.find(".ammo-minus").click(await this._onMinusAmmo.bind(this));
    html.find(".itemEquip").click(await this._onItemEquip.bind(this));
    html.find(".itemTabInfo .wealthCalc").click(await this._onWealthCalc.bind(this));
    html.find(".setBaseCharacteristics").click(await this._onSetBaseCharacteristics.bind(this));
    html.find(".carryBonus").click(await this._onCarryBonus.bind(this));
    html.find(".incrementResource").click(this._onIncrementResource.bind(this))
    html.find(".resourceLabel button").click(this._onResetResource.bind(this))

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
  
  async _onSetBaseCharacteristics(event) {
      event.preventDefault()
      const strBonusArray = [];
      const endBonusArray = [];
      const agiBonusArray = [];
      const intBonusArray = [];
      // Willpower is set as wpC (instead of just 'wp' because the item value only contains 2 initial letters vs. 3 for all others... an inconsistency that is easier to resolve this way)
      const wpCBonusArray = [];
      const prcBonusArray = [];
      const prsBonusArray = [];
      const lckBonusArray = [];

      const bonusItems = this.actor.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));

      for (let item of bonusItems) {
        for (let key in item.data.data.characteristicBonus) {
            let itemBonus = item.data.data.characteristicBonus[key]
            if (itemBonus !== 0) {
              let itemButton = `<button style="width: auto;" onclick="getItem(this.id, this.dataset.actor)" id="${item.id}" data-actor="${item.actor.id}">${item.name} ${itemBonus >= 0 ? `+${itemBonus}` : itemBonus}</button>`
              let bonusName = eval([...key].splice(0, 3).join('') + 'BonusArray')
              bonusName.push(itemButton)
            }
        }
      }

      let d = new Dialog({
        title: "Set Base Characteristics",
        content: `<form>
                    <script>
                      function getItem(itemID, actorID) {
                          let actor = game.actors.find(actor => actor.id === actorID)
                          let tokenActor = game.scenes.find(scene => scene.active === true).tokens.find(token => token.data.actorId === actorID)

                          let actorBonusItems = actor.items.filter(item => item.data.data.hasOwnProperty('characteristicBonus'))
                          let tokenBonusItems = tokenActor._actor.items.filter(item => item.data.data.hasOwnProperty('characteristicBonus'))

                          if (actor.data.token.actorLink) {
                            let item = actorBonusItems.find(i => i.id === itemID)
                            item.sheet.render(true)
                          }
                          else {
                            let item = tokenBonusItems.find(i => i.id === itemID)
                            item.sheet.render(true)
                          }
                        }
                    </script>

                    <h2>Set the Character's Base Characteristics.</h2>

                    <div style="border: inset; margin-bottom: 10px; padding: 5px;">
                    <i>Use this menu to adjust characteristic values on the character 
                      when first creating a character or when spending XP to increase 
                      their characteristics.
                    </i>
                    </div>

                    <div style="margin-bottom: 10px;">
                      <label><b>Points Total: </b></label>
                      <label>
                      ${this.actor.data.data.characteristics.str.base +
                      this.actor.data.data.characteristics.end.base +
                      this.actor.data.data.characteristics.agi.base +
                      this.actor.data.data.characteristics.int.base +
                      this.actor.data.data.characteristics.wp.base +
                      this.actor.data.data.characteristics.prc.base +
                      this.actor.data.data.characteristics.prs.base +
                      this.actor.data.data.characteristics.lck.base}
                      </label>
                      <table style="table-layout: fixed; text-align: center;">
                        <tr>
                          <th>STR</th>
                          <th>END</th>
                          <th>AGI</th>
                          <th>INT</th>
                          <th>WP</th>
                          <th>PRC</th>
                          <th>PRS</th>
                          <th>LCK</th>
                        </tr>
                        <tr>
                          <td><input type="number" id="strInput" value="${this.actor.data.data.characteristics.str.base}"></td>
                          <td><input type="number" id="endInput" value="${this.actor.data.data.characteristics.end.base}"></td>
                          <td><input type="number" id="agiInput" value="${this.actor.data.data.characteristics.agi.base}"></td>
                          <td><input type="number" id="intInput" value="${this.actor.data.data.characteristics.int.base}"></td>
                          <td><input type="number" id="wpInput" value="${this.actor.data.data.characteristics.wp.base}"></td>
                          <td><input type="number" id="prcInput" value="${this.actor.data.data.characteristics.prc.base}"></td>
                          <td><input type="number" id="prsInput" value="${this.actor.data.data.characteristics.prs.base}"></td>
                          <td><input type="number" id="lckInput" value="${this.actor.data.data.characteristics.lck.base}"></td>
                        </tr>
                      </table>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">STR Modifiers</h2>
                      <span style="font-size: small">${strBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">END Modifiers</h2>
                      <span style="font-size: small">${endBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">AGI Modifiers</h2>
                      <span style="font-size: small">${agiBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">INT Modifiers</h2>
                      <span style="font-size: small">${intBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">WP Modifiers</h2>
                      <span style="font-size: small">${wpCBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">PRC Modifiers</h2>
                      <span style="font-size: small">${prcBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">PRS Modifiers</h2>
                      <span style="font-size: small">${prsBonusArray.join('')}</span>
                    </div>

                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">LCK Modifiers</h2>
                      <span style="font-size: small">${lckBonusArray.join('')}</span>
                    </div>

                  </form>`,
      buttons: {
        one: {
          label: "Submit",
          callback: async (html) => {
            const strInput = parseInt(html.find('[id="strInput"]').val());
            const endInput = parseInt(html.find('[id="endInput"]').val());
            const agiInput = parseInt(html.find('[id="agiInput"]').val());
            const intInput = parseInt(html.find('[id="intInput"]').val());
            const wpInput = parseInt(html.find('[id="wpInput"]').val());
            const prcInput = parseInt(html.find('[id="prcInput"]').val());
            const prsInput = parseInt(html.find('[id="prsInput"]').val());
            const lckInput = parseInt(html.find('[id="lckInput"]').val());

            //Shortcut for characteristics
            const chaPath = this.actor.data.data.characteristics;

            //Assign values to characteristics
            chaPath.str.base = strInput;
            chaPath.str.total = strInput + chaPath.str.bonus;
            await this.actor.update({
              "data.characteristics.str.base" : strInput,
              "data.characteristics.str.total": chaPath.str.total
            });

            chaPath.end.base = endInput;
            chaPath.end.total = endInput + chaPath.end.bonus;
            await this.actor.update({
              "data.characteristics.end.base" : endInput,
              "data.characteristics.end.total": chaPath.end.total
            });

            chaPath.agi.base = agiInput;
            chaPath.agi.total = agiInput + chaPath.agi.bonus;
            await this.actor.update({
              "data.characteristics.agi.base" : agiInput,
              "data.characteristics.agi.total": chaPath.agi.total
            });

            chaPath.int.base = intInput;
            chaPath.int.total = intInput + chaPath.int.bonus;
            await this.actor.update({
              "data.characteristics.int.base" : intInput,
              "data.characteristics.int.total": chaPath.int.total
            });

            chaPath.wp.base = wpInput;
            chaPath.wp.total = wpInput + chaPath.wp.bonus;
            await this.actor.update({
              "data.characteristics.wp.base" : wpInput,
              "data.characteristics.wp.total": chaPath.wp.total
            });

            chaPath.prc.base = prcInput;
            chaPath.prc.total = prcInput + chaPath.prc.bonus;
            await this.actor.update({
              "data.characteristics.prc.base" : prcInput,
              "data.characteristics.prc.total": chaPath.prc.total
            });

            chaPath.prs.base = prsInput;
            chaPath.prs.total = prsInput + chaPath.prs.bonus;
            await this.actor.update({
              "data.characteristics.prs.base" : prsInput,
              "data.characteristics.prs.total": chaPath.prs.total
            });

            chaPath.lck.base = lckInput;
            chaPath.lck.total = lckInput + chaPath.lck.bonus;
            await this.actor.update({
              "data.characteristics.lck.base" : lckInput,
              "data.characteristics.lck.total": chaPath.lck.total
            });

          }
        },
        two: {
          label: "Cancel",
          callback: async (html) => console.log("Cancelled")
        }
      },
      default: "one",
      close: async (html) => console.log()
    })
    d.render(true);
  }

  async _onClickCharacteristic(event) {
    event.preventDefault()
    const element = event.currentTarget
    let wounded_char = this.actor.data.data.characteristics[element.id].total - 20

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
          contentString = `<h2>${element.name}</h2>
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`
    
        } else if (roll.total === this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
          contentString = `<h2>${element.name}</h2>
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`
    
        } else {
          contentString = `<h2>${element.name}</h2>
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <b>${roll.total<=wounded_char ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
        } 
      } else {
      if (roll.total === this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
        contentString = `<h2>${element.name}</h2>
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].total} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

      } else if (roll.total === this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
        contentString = `<h2>${element.name}</h2>
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].total} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

      } else {
        contentString = `<h2>${element.name}</h2>
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].total} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <b>${roll.total<=(this.actor.data.data.characteristics[element.id].total + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
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
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == luck6 || roll.total === luck7 || roll.total === luck8 || roll.total === luck9 || roll.total === luck10) {
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else if (this.actor.data.data.wounded === true) {
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput} + ${this.actor.data.data.woundPenalty}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput + this.actor.data.data.woundPenalty) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`

          } else {
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
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

    let contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
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
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else if (this.actor.data.data.wounded === true) {
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput} + ${this.actor.data.data.woundPenalty}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput + this.actor.data.data.woundPenalty) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`

          } else {
            contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(item.data.data.value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
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
            contentString = `<h2 style='font-size: large;'>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            contentString = `<h2 style='font-size: large;'>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else {
            contentString = `<h2 style='font-size: large;'>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(this.actor.data.data.resistance[element.id] + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
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
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
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
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
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
          contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
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
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
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

    const content = `<h2 style='font-size: large;'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2><p>
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

    const contentString = `<h2 style='font-size: large;'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2><p>
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

    let contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2><p>
    <i><b>${item.type}</b></i><p>
      <i>${item.data.data.description}</i>`

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: contentString
    })
  }

  async _onSupplyRoll(event) {
    event.preventDefault()
    const supplyDice = this.actor.data.data.supply;

    let supplyRoll = new Roll(supplyDice);
    supplyRoll.roll({async:false});

    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      roll: supplyRoll,
      content: `<h2 style='font-size: large'>Supply Dice Roll</h2>
                <i>Reduce your Supply Dice Tier if you roll a 1.</i>
                <p></p>
                <label><b>Result: </b></label> <b>[[${supplyRoll.result}]]</b> ${supplyRoll._formula}
                <p></p>
                <b>${supplyRoll.result == 1 ? "<span><i>Your supplies begin to diminish.</i></span>" 
                : "<span><i>Your supplies remain intact.</i></span>"}</b>`
    })
  }

  async _onWealthCalc(event) {
    event.preventDefault()

    let d = new Dialog({
      title: "Add/Subtract Wealth",
      content: `<form>
                <div class="dialogForm">
                <label><i class="fas fa-coins"></i><b> Add/Subtract: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        },
        two: {
          label: "Submit",
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());
            let wealth = this.actor.data.data.wealth;

            wealth = wealth + playerInput;
            this.actor.update({"data.wealth" : wealth});

          }
        }
      },
      default: "two",
      close: html => console.log()
    })
    d.render(true);
  }

  async _onCarryBonus(event) {
    event.preventDefault()

    let d = new Dialog({
      title: "Carry Rating Bonus",
      content: `<form>
                  <div class="dialogForm">
                  <div style="margin: 5px;">
                    <label><b>Current Carry Rating Bonus: </b></label>
                    <label style=" text-align: center; float: right; width: 50%;">${this.actor.data.data.carry_rating.bonus}</label>
                  </div>

                  <div style="margin: 5px;">
                  <label><b> Set Carry Weight Bonus:</b></label>
                  <input placeholder="10, -10, etc." id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                  </div>

                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        },
        two: {
          label: "Submit",
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());
            this.actor.data.data.carry_rating.bonus = playerInput;
            this.actor.update({"data.carry_rating.bonus" : this.actor.data.data.carry_rating.bonus});
          }
        }
      },
      default: "two",
      close: html => console.log()
    })
    d.render(true);
  }

  _onLuckyMenu(event) {
    event.preventDefault()

    let d = new Dialog({
      title: "Lucky & Unlucky Numbers",
      content: `<form style="padding: 10px">
                  <div style="background: rgba(85, 85, 85, 0.40); border: solid 1px; padding: 10px; font-style: italic;">
                      Input your character's lucky and unlucky numbers and click submit to register them. You can change them at any point.
                  </div>

                  <div>
                    <h2 style="text-align: center;">
                      Lucky Numbers
                    </h2>
                    <div style="display: flex; justify-content: space-around; align-items: center; text-align: center;">
                        <input class="luckyNum" id="ln1" type="number" value=${this.actor.data.data.lucky_numbers.ln1}>
                        <input class="luckyNum" id="ln2" type="number" value=${this.actor.data.data.lucky_numbers.ln2}>
                        <input class="luckyNum" id="ln3" type="number" value=${this.actor.data.data.lucky_numbers.ln3}>
                        <input class="luckyNum" id="ln4" type="number" value=${this.actor.data.data.lucky_numbers.ln4}>
                        <input class="luckyNum" id="ln5" type="number" value=${this.actor.data.data.lucky_numbers.ln5}>
                    </div>
                  </div>

                  <div>
                    <h2 style="text-align: center;">
                      Unlucky Numbers
                    </h2>
                    <div style="display: flex; justify-content: space-around; align-items: center; text-align: center;">
                        <input class="unluckyNum" id="ul1" type="number" value=${this.actor.data.data.unlucky_numbers.ul1}>
                        <input class="unluckyNum" id="ul2" type="number" value=${this.actor.data.data.unlucky_numbers.ul2}>
                        <input class="unluckyNum" id="ul3" type="number" value=${this.actor.data.data.unlucky_numbers.ul3}>
                        <input class="unluckyNum" id="ul4" type="number" value=${this.actor.data.data.unlucky_numbers.ul4}>
                        <input class="unluckyNum" id="ul5" type="number" value=${this.actor.data.data.unlucky_numbers.ul5}>
                    </div>
                  </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        },
        two: {
          label: "Submit",
          callback: html => {
            // Create input arrays
            const luckyNums = [...document.querySelectorAll(".luckyNum")]
            const unluckyNums = [...document.querySelectorAll(".unluckyNum")]

            // Assign input values to appropriate actor fields
            for (let num of luckyNums) {
              this.actor.data.data.lucky_numbers[num.id] = Number(num.value)
            }

            for (let num of unluckyNums) {
              this.actor.data.data.unlucky_numbers[num.id] = Number(num.value)
            }

          }
        }
      },
      default: "two",
      close: html => console.log()
    })
    d.render(true)
  }

  _onRaceMenu(event) {
    event.preventDefault();
    const imgPath = 'systems/uesrpg-d100/images'

    const races = {
      altmer: {
        name: 'Altmer',
        img: `${imgPath}/altmer.webp`,
        baseline: {str: 20, end: 23, agi: 23, int: 30, wp: 28, prc: 25, prs: 25},
        traits: [
          'Disease Resistance (50%)',
          'Power Well (20)',
          'Weakness (Magic, 2)',
          'Mental Strength: Ignores penalties to Willpower tests made to resist paralysis',
          'During Character Creation, Altmer can pick one additional magic skill to begin trained at Novice for free'
        ]
      },

      argonian: {
        name: 'Argonian',
        img: `${imgPath}/argonian.webp`,
        baseline: {str: 25, end: 24, agi: 28, int: 27, wp: 24, prc: 25, prs: 22},
        traits: [
          'Disease Resistance (75%)',
          'Immunity (Poison)',
          'Amphibious: Can breathe water and ignores skill cap placed on Combat rolls by their Athletics skill',
          'Inscrutable: -10 penalty on Persuade tests vs. Non-Argonians & others receive -10 penalty on Observe tests to determine an Argonians motives'
        ]
      },

      bosmer: {
        name: 'Bosmer',
        img: `${imgPath}/bosmer.webp`,
        baseline: {str: 21, end: 21, agi: 31, int: 25, wp: 23, prc: 26, prs: 24},
        traits: [
          'Disease Resistance (50%)',
          'Resistance (Poison, 1)',
          'Natural Archers: May add shortbows to any Combat Style (does not count towards weapon max)',
          'Beast Tongue: Can speak with animals'
        ]
      },

      breton: {
        name: 'Breton',
        img: `${imgPath}/breton.webp`,
        baseline: {str: 23, end: 21, agi: 22, int: 28, wp: 30, prc: 25, prs: 25},
        traits: [
          'Resistance (Magic, 2)',
          'Power Well (10)',
          'During Character Creation, Breton characters may add one extra magic skill to begin at Novice rank for free'
        ]
      },

      dunmer: {
        name: 'Dunmer',
        img: `${imgPath}/dunmer.webp`,
        baseline: {str: 25, end: 24, agi: 29, int: 25, wp: 24, prc: 25, prs: 23},
        traits: [
          'Resistance (Fire, 3)',
          'Ancestor Guardian: See Powers section of Core Rulebook',
          'During Character Creation, Dunmer may begin with the Destruction skill trained to Novice rank for free'
        ]
      },

      imperial: {
        name: 'Imperial',
        img: `${imgPath}/imperial.webp`,
        baseline: {str: 26, end: 27, agi: 24, int: 24, wp: 24, prc: 25, prs: 25},
        traits: [
          'Star of the West: Increase Stamina Points max by 1',
          'Voice of the Emperor: Can use Personality in place of Willpower for the purpose of tests and overloading spells',
          'During Character Creation, may choose either Commerce, Persuade, or Deceive to begin at Novice rank for free'
        ]
      },

      khajiit: {
        name: 'Khajiit',
        img: `${imgPath}/khajiit.webp`,
        baseline: {str: 22, end: 22, agi: 29, int: 25, wp: 21, prc: 28, prs: 24},
        traits: [
          'Dark Sight: Can see normally even in areas with total darkness',
          'Natural Weapons: (Claws - 1d4 Slashing)'
        ]
      },

      nord: {
        name: 'Nord',
        img: `${imgPath}/nord.webp`,
        baseline: {str: 30, end: 28, agi: 23, int: 21, wp: 24, prc: 25, prs: 23},
        traits: [
          'Tough: +10 bonus to Shock Tests',
          'Resistance (Frost, 2)',
          'Resistance (Shock, 1)',
          'War Cry: See Powers section of Core Rulebook'
        ]
      },

      orsimer: {
        name: 'Orsimer',
        img: `${imgPath}/orc.webp`,
        baseline: {str: 28, end: 30, agi: 22, int: 23, wp: 26, prc: 24, prs: 22},
        traits: [
          'Resilient: Increase HP max by +3',
          'Tough: Gain +10 to Shock Tests',
          'Resistance (Magic, 1)',
          'During Character Creation, may choose to begin with Profession (Smithing) at Novice rank for free'
        ]
      },

      redguard: {
        name: 'Redguard',
        img: `${imgPath}/redguard.webp`,
        baseline: {str: 27, end: 28, agi: 26, int: 22, wp: 23, prc: 25, prs: 24},
        traits: [
          'Disease Resistance (75%)',
          'Resistance (Poison, 3)',
          'Adrenaline Rush: See Powers section of Core Rulebook',
          'During Character Creation, may choose to begin with a Combat Style skill at Novice rank for free'
        ]
      },

    }

    const raceCards = []
    for (let i in races) {
      const race = races[i]
      const baseLineCells = []
      const traits = []

      // Loop through traits values and create list items
      for (let i of race.traits) {
          const trait = `<li>${i}</li>`
          traits.push(trait)
      }
      

      // Loop through baseline values and create table cells
      for (let i in race.baseline) {
        const base = race.baseline[i]
        const tableCell = `<td>${base}</td>`
        baseLineCells.push(tableCell)
      }

      const card = `<div style="display: flex; flex-direction: row; align-items: center; border: solid 1px; padding: 0 5px; width: 49%;">
                        <div style="width: 100%;">
                            <div style="text-align: center; position: relative; top: 0;">
                                <input type="checkbox" class="raceSelect" id="${race.name}" style="position: relative; left: 0; top: 0;">
                                <img src="${race.img}" alt="${race.name}" height="150" width="100" style="border: none;">
                            </div>
                            <div style="position: relative; top: 0;">
                                <h2 style="text-align: center;">${race.name}</h2>
                                <table style="text-align: center;">
                                    <tr>
                                      <th colspan="7">Characteristic Baseline</th>
                                    </tr>
                                    <tr>
                                      <th>STR</th>
                                      <th>END</th>
                                      <th>AGI</th>
                                      <th>INT</th>
                                      <th>WP</th>
                                      <th>PRC</th>
                                      <th>PRS</th>
                                    </tr>
                                    <tr>
                                      ${baseLineCells.join('')}
                                    </tr>
                              </table>
                              <ul>
                                  ${traits.join('')}
                              </ul>
                            </div>
                        </div>
                    </div>`
      
      raceCards.push(card)

    }

    let d = new Dialog({
      title: "Race Menu",
      content: `<form style="padding: 10px;">

                  <div style="border: 1px solid; background: rgba(85, 85, 85, 0.40); font-style:italic; padding: 5px; text-align: center;">
                    <div>
                        Select a Race from the cards below or input your own custom race label below. Leave blank if you do NOT want to use a custom race.
                    </div>
                    <input type="text" id="customRace" style="width: 200px">
                  </div>

                  <div>
                      <img src="systems/uesrpg-d100/images/Races_Oblivion.webp" title="Races of Elder Scrolls" style="border: none;">
                  </div>

                  <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-content: center; width: 100%;">
                    ${raceCards.join('')}
                  </div>

                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        },
        two: {
          label: "Submit",
          callback: html => {
              // Check for a selection, or show error instead
              let raceSelection = [...document.querySelectorAll('.raceSelect')].filter(i => i.checked)
              let customRaceLabel = document.querySelector('#customRace').value

              if (raceSelection.length < 1 && customRaceLabel === '') {
                ui.notifications.error("Please select a race or input a custom race label")
              } 
              
              // Logic for setting Race Name and Other factors
              else {
                let raceName

                if (customRaceLabel !== '') {
                  raceName = customRaceLabel
                }

                else {
                  raceName = raceSelection[0].id
                  let selectedRace = races[raceName.toLowerCase()]
                  
                  // Loop through and update actor base characteristics with race object baselines
                  for (let value in this.actor.data.data.characteristics) {
                    let baseChaPath = `data.characteristics.${value}.base`
                    this.actor.update({[baseChaPath]: selectedRace.baseline[value]})
                  }

                }
              
                  // Update Actor with Race Label
                  this.actor.update({'data.race' : raceName})
              }
          }
        }
      },
      default: "two",
      close: html => console.log()
    })

    d.position.width = 600;
    d.position.height = 800;
    d.render(true)
  }

  _onBirthSignMenu(event) {
    event.preventDefault()

    let signCards = []
    const imgPath = 'systems/uesrpg-d100/images'
    const signs = {
      apprentice: {
        name: 'Apprentice',
        img: `${imgPath}/sign-apprentice.webp`,
        description: `The Apprentice’s Season is Sun’s Height. Those born under the sign of the apprentice have a special 
                      affinity for magick of all kinds, but are more vulnerable to magick as well.`,
        traits: [
          'Power Well (25)',
          'Star-Cursed Apprentice: Gain Power Well (50) instead, and also gain Weakness(Magic, 3)'
        ]
      },
      atronach: {
        name: 'Atronach',
        img: `${imgPath}/sign-atronach.webp`,
        description: `The Atronach (often called the Golem) is one of the Mage’s Charges. Its season is Sun’s Dusk. 
                      Those born under this sign are natural sorcerers with deep reserves of magicka, but they cannot 
                      generate magicka of their own.`,
        traits: [
          'Power Well (50)',
          'Spell Absorption (5)',
          'Stunted Magicka: Cannot naturally regenerate Magicka',
          'Star-Cursed Atronach: As above, but gain Power Well (75) instead and -5 to either Agility OR Endurance'
        ]
      },
      lady: {
        name: 'Lady',
        img: `${imgPath}/sign-lady.webp`,
        description: `The Lady is one of the Warrior's Charges and her Season is Hearthfire. Those born under the sign
                      of the Lady are kind and tolerant.`,
        traits: [
          '+5 Personality',
          'Star Cursed Lady: As above, but also gain +5 Endurance and -5 Strength'
        ]
      },
      lord: {
        name: 'Lord',
        img: `${imgPath}/sign-lord.webp`,
        description: `The Lord’s Season is First Seed and he oversees all of Tamriel during the planting. Those born under the sign 
                      of the Lord are stronger and healthier than those born under other signs.`,
        traits: [
          "Healing Rate is doubled",
          "Star-Cursed Lord: As above, but also gain +5 Endurance and Weakness (Fire, 2)"
        ]
      },
      lover: {
        name: 'Lover',
        img: `${imgPath}/sign-lover.webp`,
        description: `The Lover is one of the Thief ’s Charges and her season is Sun’s Dawn. Those born under the sign of the Lover are graceful and passionate.`,
        traits: [
          "+5 Agility",
          "Star-Cursed Lover: As above, but also gain +5 Personality and -5 Willpower OR Strength"
        ]
      },
      mage: {
        name: 'Mage',
        img: `${imgPath}/sign-mage.webp`,
        description: `The Mage is a Guardian Constellation whose Season is Rain’s Hand when magicka was first used by men. 
                      His Charges are the Apprentice, the Golem, and the Ritual. Those born under the Mage have more magicka 
                      and talent for all kinds of spellcasting, but are often arrogant and absent-minded.`,
        traits: [
          'Power Well (10)',
          'Star-Cursed Mage: Gain Power Well (25) instead and one of the following (your choice) receives -5 (Perception, Strength, or Personality)'
        ]
      },
      ritual: {
        name: 'Ritual',
        img: `${imgPath}/sign-ritual.webp`,
        description: `The Ritual is one of the Mage’s Charges and its Season is Morning Star. Those born under this sign have 
                      a variety of abilities depending on the aspects of the moons and the Divines.`,
        traits: [
          "At the start of each day, select a Power (Blessed Touch, Blessed Word, or Mara's Gift) to gain until the start of the next day, where you can choose again.",
          'Blessed Touch',
          'Blessed Word',
          "Mara's Gift",
          'Star-Cursed Ritual: Gain all three powers permanently but receive -5 Luck'
        ]
      },
      // serpent: {
      //   name: 'Serpent',
      //   img: `${imgPath}/sign-serpent.webp}`,
      //   description: 'Placeholder Description',
      //   traits: [

      //   ]
      // },
      shadow: {
        name: 'Shadow',
        img: `${imgPath}/sign-shadow.webp`,
        description: `The Shadow’s Season is Second Seed. The Shadow grants those born under her sign the ability to hide in shadows.`,
        traits: [
          "Moonshadow: See Powers section of Core Rulebook",
          "Star-Cursed Shadow: As Above, but also gain +5 Perception and -5 Personality OR Strength"
        ]
      },
      steed: {
        name: 'Steed',
        img: `${imgPath}/sign-steed.webp`,
        description: `The Steed is one of the Warrior’s Charges, and her Season is Mid Year. Those born under the sign of the Steed are impatient and 
                      always hurrying from one place to another.”`,
        traits: [
          "+2 Speed",
          "Star-Cursed Steed: As above, but also gain +5 Agility and -5 Willpower OR Perception"
        ]
      },
      thief: {
        name: 'Thief',
        img: `${imgPath}/sign-thief.webp`,
        description: `The Thief is the last Guardian Constellation, and her Season is the darkest month of Evening Star. Her Charges are the Lover, 
                      the Shadow, and the Tower. Those born under the sign of the Thief are not typically thieves, though they take risks more often 
                      and only rarely come to harm. They will run out of luck eventually, however, and rarely live as long as those born under other signs.`,
        traits: [
          "Roll an extra Lucky Number that cannot be lost, regardless of Luck Score",
          "Star-Cursed Thief: As above, but replace their rolled Luck Score with 50, gain the Akiviri Danger Sense Power, and the Running Out of Luck trait."
        ]
      },
      tower: {
        name: 'Tower',
        img: `${imgPath}/sign-tower.webp`,
        description: `The Tower is one of the Thief ’s Charges and its Season is Frostfall. Those born under the sign of the Tower have a knack for finding gold 
                      and can open locks of all kinds.`,
        traits: [
          "Treasure Seeker: See Powers section in the Core Rulebook",
          "+5 Perception",
          "Star-Cursed Tower: As above, but also gain +5 Agility and -5 Willpower OR Strength"
        ]
      },
      warrior: {
        name: 'Warrior',
        img: `${imgPath}/sign-warrior.webp`,
        description: `The Warrior is the first Guardian Constellation and he protects his charges during their Seasons.
                      The Warrior’s own season is Last Seed when his Strength is needed for the harvest. His Charges are 
                      the Lady, the Steed, and the Lord. Those born under the sign of the Warrior are skilled with weapons 
                      of all kinds, but prone to short tempers.`,
        traits: [
          'Increase Stamina Point Maximum by +1',
          'Star-Cursed Warrior: As above but also +5 Strength and -5 Willpower'
        ]
      },
    }

    // Create sign cards
    for (let sign in signs) {
      const signObject = signs[sign]

      // Create trait list items
      let traitListItems = []
      for (let trait of signObject.traits) {
        const traitItem = `<li>${trait}</li>`
        traitListItems.push(traitItem)
      }

      const card = `<div style="display: flex; flex-direction: column; justify-content: flex-start; align-items: center; width: 49%; height: 510px; border: 1px solid; padding: 5px;">
                        <div>
                            <img src="${signObject.img}" alt="${sign.name}" width="200" height="200">
                            <input type="checkbox" id="${signObject.name}" class="signSelect">
                        </div>
                        <h2 style="text-align: center;">${signObject.name}</h2>
                        <div>
                            ${signObject.description}
                        </div>
                        <div>
                            <ul>
                                ${traitListItems.join('')}
                            </ul>
                        </div>

                    </div>`

      signCards.push(card)
    }

    let d = new Dialog({
      title: "Birthsign Menu",
      content: `<form>
                    <div>

                        <div style="border: 1px solid; background: rgba(85, 85, 85, 0.40); font-style:italic; padding: 5px; text-align: center;">
                            Select a birthsign or roll to select using the rules from the Core Rulebook. Alternatively, you may enter in a custom birthsign label below:
                            <div>
                                <input type="text" id="customSign" style="width: 200px;">
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-around; align-items: center; width: 100%;">
                            ${signCards.join('')}
                        </div>

                    </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        },
        two: {
          label: "Submit",
          callback: html => {
              // Check for a selection, or show error instead
              let signSelection = [...document.querySelectorAll('.signSelect')].filter(i => i.checked)
              let customSignLabel = document.querySelector('#customSign').value

              if (signSelection.length < 1 && customSignLabel === '') {
                ui.notifications.error("Please select a race or input a custom race label")
              } 

              // Assign selected sign to actor object
              else {
                if (customSignLabel === '') {
                    const signObject = signs[signSelection[0].id.toLowerCase()]
                    this.actor.update({'data.birthsign': signObject.name})
                }

                else {
                    this.actor.update({'data.birthsign': customSignLabel})
                }
              }

          }
        }
      },
      default: "two",
      close: html => console.log()
    })

    d.position.width = 600;
    d.position.height = 800;
    d.render(true)
  }

  _onIncrementResource(event) {
    event.preventDefault()
    const resource = this.actor.data.data[event.currentTarget.dataset.resource]
    const action = event.currentTarget.dataset.action
    let dataPath = `data.${event.currentTarget.dataset.resource}.value`
    
    // Update and increment resource
    action == 'increase' ? this.actor.update({[dataPath]: resource.value + 1}) : this.actor.update({[dataPath]: resource.value - 1})
  }

  _onResetResource(event) {
    event.preventDefault()
    const resourceLabel = event.currentTarget.dataset.resource
    const resource = this.actor.data.data[resourceLabel]
    let dataPath = `data.${resourceLabel}.value`

    this.actor.update({[dataPath]: resource.value = resource.max})
  }

  _onXPMenu(event) {
    event.preventDefault()
    let currentXP = this.actor.data.data.xp
    let totalXP = this.actor.data.data.xpTotal

    // Rank Objects
    const ranks = {
      apprentice: {name: 'Apprentice', xp: 1000},
      journeyman: {name: 'Journeyman', xp: 2000},
      adept: {name: 'Adept', xp: 3000},
      expert: {name: 'Expert', xp: 4000},
      master: {name: 'Master', xp: 5000}
    }

    // Create Rank table rows
    const rankRows = []
    for (let rank in ranks) {
      const rankObject = ranks[rank]
      const row = `<tr>
                      <td>${rankObject.name}</td>
                      <td>${rankObject.xp}</td>
                  </tr>`
      rankRows.push(row)
    }

    let d = new Dialog({
      title: "Experience Menu",
      content: `<form>
                    <div style="display: flex; flex-direction: column;">

                        <div style="display: flex; flex-direction: row; justify-content: space-around; align-items: top; background: rgba(85, 85, 85, 0.40); padding: 10px; text-align: center; border: 1px solid;">
                            <div style="width: 33.33%">
                                <div>Current XP</div>
                                <input type="number" id="xp" value="${this.actor.data.data.xp}">
                            </div>
                            <div style="width: 33.33%">
                                <div>Total XP</div>
                                <input type="number" id="xpTotal" value="${this.actor.data.data.xpTotal}">
                            </div>
                            <div style="width: 33.33%">
                                <div>Campaign Rank</div>
                                <div style="padding: 5px 0;">${this.actor.data.data.campaignRank}</div>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: row; justify-content: space-around; align-items: center;">
                            <div style="width: 50%">
                                <p>Depending on how much CrP or total XP your character has, they may only purchase Ranks appropriate to their Campaign Skill Experience.</p>
                                <p>Increase your total XP or CrP to select higher Skill Ranks.</p>
                            </div>
                            <div>
                                <table style="text-align: center;">
                                    <tr>
                                        <th>Skill Rank</th>
                                        <th>Total XP/CrP</th>
                                    </tr>
                                    ${rankRows.join('')}
                                </table>
                            </div>
                        </div>

                    </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log("Cancelled")
        },
        two: {
          label: "Submit",
          callback: html => {
              // Grab Input Values
              const currentXP = document.querySelector("#xp").value
              const totalXP = document.querySelector("#xpTotal").value
              
              // Update XP Values on Actor
              this.actor.update({'data.xp': currentXP, 'data.xpTotal': totalXP})
          }
        }
      },
      default: "two",
      close: html => console.log()
    })

    d.render(true)
  }


}

