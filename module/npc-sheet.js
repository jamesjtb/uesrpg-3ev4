/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class npcSheet extends ActorSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "npc"],
      width: 680,
      height: 720,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "core"}],
      dragDrop: [{dragSelector: [
        ".equipmentList .item", 
        ".spellList .item",
        ".skillList .item"
      ], 
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

    // Prepare Items
    if (this.actor.data.type === 'npc') {
      this._prepareCharacterItems(data);
    }

    return data;
    }

  
    _prepareCharacterItems(sheetData) {
      const actorData = sheetData.actor.data;
  
      //Initialize containers
      const gear = [];
      const weapon = [];
      const armor = [];
      const power = [];
      const trait = [];
      const talent = [];
      const combatStyle = [];
      const spell = [];
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
          armor.push(i);
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
          spell.push(i)
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
          if (category.length > 1) {
            category.sort((a, b) => {
              let nameA = a.data.school
              let nameB = b.data.school
              if (nameA > nameB) {return 1}
              else {return -1}
            })
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

    get template() {
      const path = "systems/uesrpg-d100/templates";
      if (!game.user.isGM && this.actor.limited) return "systems/uesrpg-d100/templates/limited-npc-sheet.html"; 
      return `${path}/${this.actor.data.type}-sheet.html`;
    }

  /* -------------------------------------------- */

  /** @override */
	async activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons
    html.find(".characteristic-roll").click(await this._onClickCharacteristic.bind(this));
    html.find(".professions-roll").click(await this._onProfessionsRoll.bind(this));
    html.find(".damage-roll").click(await this._onDamageRoll.bind(this));
    html.find(".magic-roll").click(await this._onSpellRoll.bind(this));
    html.find(".resistance-roll").click(await this._onResistanceRoll.bind(this));
    html.find(".ammo-roll").click(await this._onAmmoRoll.bind(this));
    html.find(".ability-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".talents-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".spell-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".combat-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".item-list .item-img").click(await this._onTalentRoll.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(await this._onToggle2H.bind(this));
    html.find(".plusQty").click(await this._onPlusQty.bind(this));
    html.find(".minusQty").contextmenu(await this._onMinusQty.bind(this));
    html.find(".itemEquip").click(await this._onItemEquip.bind(this));
    html.find(".itemTabInfo .wealthCalc").click(await this._onWealthCalc.bind(this));
    html.find(".setBaseCharacteristics").click(await this._onSetBaseCharacteristics.bind(this));
    html.find(".carryBonus").click(await this._onCarryBonus.bind(this));
    html.find(".wealthCalc").click(await this._onWealthCalc.bind(this));
    html.find(".incrementResource").click(this._onIncrementResource.bind(this))
    html.find(".resourceLabel button").click(this._onResetResource.bind(this))
    html.find(".swapContainer button").click(this._setPaperDoll.bind(this))
    html.find("#spellFilter").click(this._filterSpells.bind(this))
    html.find('#selectWornArmor').click(this._selectWornArmor.bind(this))
    html.find('#resistanceToggle').click(this._toggleResistanceColumn.bind(this))
    html.find('.selectWeapon').contextmenu(this._selectWeaponMenu.bind(this))
    html.find('.selectWeapon').click(this._onWeaponShortcut.bind(this))

    // Checks UI Elements for update
    this._createSpellFilterOptions()
    this._setDefaultSpellFilter()
    this._setResourceBars()
    this._setWoundIcon()
    this._setWoundBackground()
    this._setEquippedArmor()
    this._setResistanceColumnToggle()
    this._refreshWeaponShortcuts()

    //Item Create Buttons
    html.find(".item-create").click(await this._onItemCreate.bind(this));

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
   * @param {Event} event   The originating click event
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

                          if (actor.data.token.actorLink) {
                            let actorBonusItems = actor.items.filter(item => item.data.data.hasOwnProperty('characteristicBonus'))
                            let item = actorBonusItems.find(i => i.id === itemID)
                            item.sheet.render(true)
                          }
                          else {
                            let tokenBonusItems = tokenActor._actor.items.filter(item => item.data.data.hasOwnProperty('characteristicBonus'))
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

                    <div class="modifierBox">
                      <h2>STR Modifiers</h2>
                      <span style="font-size: small">${strBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>END Modifiers</h2>
                      <span style="font-size: small">${endBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>AGI Modifiers</h2>
                      <span style="font-size: small">${agiBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>INT Modifiers</h2>
                      <span style="font-size: small">${intBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>WP Modifiers</h2>
                      <span style="font-size: small">${wpCBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>PRC Modifiers</h2>
                      <span style="font-size: small">${prcBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>PRS Modifiers</h2>
                      <span style="font-size: small">${prsBonusArray.join('')}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>LCK Modifiers</h2>
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
          callback: html => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

    let contentString = "";
    let roll = new Roll("1d100");
    roll.roll({async:false});

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
          contentString = `<h2>${element.name}</h2
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

    
        } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
          roll.total == this.actor.data.data.unlucky_numbers.ul6) 
          {
          contentString = `<h2>${element.name}</h2
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

    
        } else {
          contentString = `<h2>${element.name}</h2
          <p></p><b>Target Number: [[${wounded_char} + ${playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <b>${roll.total<=wounded_char ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`

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
        contentString = `<h2>${element.name}</h2
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].total} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`


      } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
          roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
          roll.total == this.actor.data.data.unlucky_numbers.ul6) 

      {
        contentString = `<h2>${element.name}</h2
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].total} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`


      } else {
        contentString = `<h2>${element.name}</h2
        <p></p><b>Target Number: [[${this.actor.data.data.characteristics[element.id].total} + ${playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <b>${roll.total<=(this.actor.data.data.characteristics[element.id].total + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`

      }
       roll.toMessage({
        async: false,
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content: contentString
      })
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
                  <label><b>${element.getAttribute('name')} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: html => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

            let contentString = "";
            let roll = new Roll("1d100");
            roll.roll({async: false});

            if (roll.result == this.actor.data.data.lucky_numbers.ln1 || 
              roll.result == this.actor.data.data.lucky_numbers.ln2 || 
              roll.result == this.actor.data.data.lucky_numbers.ln3 || 
              roll.result == this.actor.data.data.lucky_numbers.ln4 || 
              roll.result == this.actor.data.data.lucky_numbers.ln5 ||
              roll.result == this.actor.data.data.lucky_numbers.ln6 ||
              roll.result == this.actor.data.data.lucky_numbers.ln7 ||
              roll.result == this.actor.data.data.lucky_numbers.ln8 ||
              roll.result == this.actor.data.data.lucky_numbers.ln9 ||
              roll.result == this.actor.data.data.lucky_numbers.ln10)
              {
              contentString = `<h2>${element.getAttribute('name')}</h2>
              <p></p><b>Target Number: [[${this.actor.data.data.professionsWound[element.getAttribute('id')]} + ${playerInput}]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

              }
              else if (roll.result == this.actor.data.data.unlucky_numbers.ul1 || 
                roll.result == this.actor.data.data.unlucky_numbers.ul2 || 
                roll.result == this.actor.data.data.unlucky_numbers.ul3 || 
                roll.result == this.actor.data.data.unlucky_numbers.ul4 || 
                roll.result == this.actor.data.data.unlucky_numbers.ul5 ||
                roll.result == this.actor.data.data.unlucky_numbers.ul6) 
                {
                  contentString = `<h2>${element.getAttribute('name')}</h2>
                  <p></p><b>Target Number: [[${this.actor.data.data.professionsWound[element.getAttribute('id')]} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.result}]]</b><p></p>
                  <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

                } else {
                  contentString = `<h2>${element.getAttribute('name')}</h2>
                  <p></p><b>Target Number: [[${this.actor.data.data.professionsWound[element.getAttribute('id')]} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.result}]]</b><p></p>
                  <b>${roll.result<=(this.actor.data.data.professionsWound[element.getAttribute('id')] + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`

                }

                ChatMessage.create({
                  async:false, 
                  type: CONST.CHAT_MESSAGE_TYPES.ROLL, 
                  user: game.user.id, 
                  speaker: ChatMessage.getSpeaker(), 
                  roll: roll,
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
        contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
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
        contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
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
          contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
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
        contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
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

  _onSpellRoll(event) {
    //Search for Talents that affect Spellcasting Costs
    let spellToCast

    if (event.currentTarget.closest('.item') != null || event.currentTarget.closest('.item') != undefined) {
      spellToCast = this.actor.items.find(spell => spell.id === event.currentTarget.closest('.item').dataset.itemId)
    }
    else {
      spellToCast = this.actor.getEmbeddedDocument('Item', this.actor.data.data.favorites[event.currentTarget.dataset.hotkey].id)
    }

    // const spellToCast = this.actor.items.find(spell => spell.id === event.currentTarget.closest('.item').dataset.itemId)
    const hasCreative = this.actor.items.find(i => i.type === "talent" && i.name === "Creative") ? true : false;
    const hasForceOfWill = this.actor.items.find(i => i.type === "talent" && i.name === "Force of Will") ? true : false;
    const hasMethodical = this.actor.items.find(i => i.type === "talent" && i.name === "Methodical") ? true : false;
    const hasOvercharge = this.actor.items.find(i => i.type === "talent" && i.name === "Overcharge") ? true : false;
    const hasMagickaCycling = this.actor.items.find(i => i.type === "talent" && i.name === "Magicka Cycling") ? true : false;

    //Add options in Dialog based on Talents and Traits
    let overchargeOption = ""
    let magickaCyclingOption = ""

    if (hasOvercharge){
        overchargeOption = `<tr>
                                <td><input type="checkbox" id="Overcharge"/></td>
                                <td><strong>Overcharge</strong></td>
                                <td>Roll damage twice and use the highest value (spell cost is doubled)</td>
                            </tr>`
    }

    if (hasMagickaCycling){
        magickaCyclingOption = `<tr>
                                    <td><input type="checkbox" id="MagickaCycling"/></td>
                                    <td><strong>Magicka Cycling</strong></td>
                                    <td>Double Restraint Value, but backfires on failure</td>
                                </tr>`
    }

    // If Description exists, put into the dialog for reference
    let spellDescriptionDiv = ''
    if (spellToCast.data.data.description != '' && spellToCast.data.data.description != undefined) {
      spellDescriptionDiv = `<div style="padding: 10px;">
                                  ${spellToCast.data.data.description}
                              </div>`
    }

      const m = new Dialog({
        title: "Cast Spell",
        content: `<form>
                    <div>

                        <div>
                            <h2 style="text-align: center; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 5px; font-size: xx-large;">
                                <img src="${spellToCast.img}" class="item-img" height=35 width=35>
                                <div>${spellToCast.name}</div>
                            </h2>

                            ${spellDescriptionDiv}

                            <div style="padding: 10px; margin-top: 10px; background: rgba(161, 149, 149, 0.486); border: black 1px; font-style: italic;">
                                Select one of the options below OR skip this to cast the spell without any modifications.
                            </div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th>Select</th>
                                    <th style="min-width: 120px;">Option</th>
                                    <th>Effect</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><input type="checkbox" id="Restraint"/></td>
                                    <td><strong>Spell Restraint</strong></td>
                                    <td>Reduces cost of spell by WP Bonus</td>
                                </tr>
                                <tr>
                                    <td><input type="checkbox" id="Overload"/></td>
                                    <td><strong>Overload</strong></td>
                                    <td>Additional effects if not Restrained</td>
                                </tr>
                                ${magickaCyclingOption}
                                ${overchargeOption}
                            </tbody>
                        </table>

                    </div>
                  </form>`,
        buttons: {
            one: {
                label: "Cast Spell",
                callback: async (html) => {
                    let spellRestraint = 0;
                    let stackCostMod = 0;

                    //Assign Tags for Chat Output
                    const isRestrained = html.find(`[id="Restraint"]`)[0].checked;
                    const isOverloaded = html.find(`[id="Overload"]`)[0].checked;
                    let isMagickaCycled = "";
                    let isOvercharged = "";

                    if (hasMagickaCycling){
                        isMagickaCycled = html.find(`[id="MagickaCycling"]`)[0].checked;
                    }

                    if (hasOvercharge){
                        isOvercharged = html.find(`[id="Overcharge"]`)[0].checked;
                    }

                    const tags = [];


                    //Functions for Spell Modifiers
                    if (isRestrained){
                        let restraint = `<span style="border: none; border-radius: 30px; background-color: rgba(29, 97, 187, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;">Restraint</span>`;
                        tags.push(restraint);

                        //Determine cost mod based on talents and other modifiers
                        if (hasCreative && spellToCast.data.data.spellType === "unconventional"){
                            stackCostMod = stackCostMod - 1;
                        } 

                        if (hasMethodical && spellToCast.data.data.spellType === "conventional"){
                            stackCostMod = stackCostMod - 1;
                        }
                        
                        if(hasForceOfWill){
                            stackCostMod = stackCostMod - 1;
                        }

                        spellRestraint = 0 - Math.floor(this.actor.data.data.characteristics.wp.total/10);
                    }

                    if (isOverloaded){
                        let overload = `<span style="border: none; border-radius: 30px; background-color: rgba(161, 2, 2, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;">Overload</span>`;
                        tags.push(overload);
                    }

                    if (isMagickaCycled){
                        let cycled = `<span style="border: none; border-radius: 30px; background-color: rgba(126, 40, 224, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;">Magicka Cycle</span>`;
                        tags.push(cycled);
                        spellRestraint = 0 - (2 * Math.floor(this.actor.data.data.characteristics.wp.total/10));
                    }


                    //If spell has damage value it outputs to Chat, otherwise no damage will be shown in Chat Output
                    const damageRoll = new Roll(spellToCast.data.data.damage);
                    let damageEntry = "";

                    if (spellToCast.data.data.damage != '' && spellToCast.data.data.damage != 0){
                        damageRoll.roll({async: false});
                        damageEntry = `<tr>
                                            <td style="font-weight: bold;">Damage</td>
                                            <td style="font-weight: bold; text-align: center;">[[${damageRoll.result}]]</td>
                                            <td style="text-align: center;">${damageRoll.formula}</td>
                                        </tr>`
                    }

                    const hitLocRoll = new Roll("1d10");
                    hitLocRoll.roll({async: false});
                    let hitLoc = "";

                    if (hitLocRoll.result <= 5) {
                        hitLoc = "Body"
                      } else if (hitLocRoll.result == 6) {
                        hitLoc = "Right Leg"
                      } else if (hitLocRoll.result == 7) {
                        hitLoc = "Left Leg"
                      } else if (hitLocRoll.result == 8) {
                        hitLoc = "Right Arm"
                      } else if (hitLocRoll.result == 9) {
                        hitLoc = "Left Arm"
                      } else if (hitLocRoll.result == 10) {
                        hitLoc = "Head"
                      }

                    let displayCost = 0;
                    let actualCost = spellToCast.data.data.cost + spellRestraint + stackCostMod;

                    //Double Cost of Spell if Overcharge Talent is used
                    if (isOvercharged){
                        actualCost = actualCost * 2;
                        let overcharge = `<span style="border: none; border-radius: 30px; background-color: rgba(219, 135, 0, 0.8); color: white; text-align: center; font-size: xx-small; padding: 5px;">Overcharge</span>`;
                        tags.push(overcharge);
                    }

                    if (actualCost < 1){
                        displayCost = 1;
                    } else {
                        displayCost = actualCost;
                    }

                    // Stop The Function if the user does not have enough Magicka to Cast the Spell
                    if (game.settings.get("uesrpg-d100", "automateMagicka")) {
                      if (displayCost > this.actor.data.data.magicka.value) {
                        return ui.notifications.info(`You do not have enough Magicka to cast this spell: Cost: ${spellToCast.data.data.cost} || Restraint: ${spellRestraint} || Other: ${stackCostMod}`)
                      }
                    }

                    let contentString = `<h2><img src=${spellToCast.img}></im>${spellToCast.name}</h2>
                                            <table>
                                                <thead style="background: rgba(161, 149, 149, 0.486);">
                                                    <tr>
                                                        <th style="min-width: 80px; text-align: center;">Name</th>
                                                        <th style="min-width: 80px; text-align: center;">Result</th>
                                                        <th style="min-width: 80px; text-align: center;">Detail</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${damageEntry}
                                                    <tr>
                                                        <td style="font-weight: bold;">Hit Location</td>
                                                        <td style="font-weight: bold; text-align: center;">[[${hitLocRoll.result}]]</td>
                                                        <td style="text-align: center;">${hitLoc}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="font-weight: bold;">Spell Cost</td>
                                                        <td style="font-weight: bold; text-align: center;">[[${displayCost}]]</td>
                                                        <td title="Cost/Restraint Modifier/Other" style="text-align: center;">${spellToCast.data.data.cost} / ${spellRestraint} / ${stackCostMod}</td>
                                                    </tr>
                                                    <tr style="border-top: double 1px;">
                                                        <td style="font-weight: bold;">Attributes</td>
                                                        <td colspan="2">${spellToCast.data.data.attributes}</td>
                                                    </tr>
                                                </tbody>
                                            </table>`
                                            
                    damageRoll.toMessage({
                        user: game.user.id,
                        speaker: ChatMessage.getSpeaker(),
                        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                        flavor: tags.join(""),
                        content: contentString
                    })

                    // If Automate Magicka Setting is on, reduce the character's magicka by the calculated output cost
                    if (game.settings.get("uesrpg-d100", "automateMagicka")) {this.actor.update({'data.magicka.value': this.actor.data.data.magicka.value - displayCost})}
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

    m.position.width = 450;
    m.render(true);
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
          
          let contentString = "";
          let roll = new Roll("1d100");
          roll.roll({async:false});

          if (roll.total == this.actor.data.data.lucky_numbers.ln1 || roll.total == this.actor.data.data.lucky_numbers.ln2 || roll.total == this.actor.data.data.lucky_numbers.ln3 || roll.total == this.actor.data.data.lucky_numbers.ln4 || roll.total == this.actor.data.data.lucky_numbers.ln5) {
            contentString = `<h2>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            contentString = `<h2>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else {
            contentString = `<h2>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total<=(this.actor.data.data.resistance[element.id] + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
          }
           roll.toMessage({
            async: false,
            type: CONST.CHAT_MESSAGE_TYPES.ROLL,
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

  _onAmmoRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    const contentString = `<h2 style='font-size: large;'>${item.name}</h2><p>
      <b>Damage Bonus:</b> ${item.data.data.damage}<p>
      <b>Qualities</b> ${item.data.data.qualities}`

      if (item.data.data.quantity > 0){
         ChatMessage.create({
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
       item.update({"data.quantity" : item.data.data.quantity})
  }

   _onToggle2H(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.data.data.weapon2H === false) {
      item.data.data.weapon2H = true;
    } else if (item.data.data.weapon2H === true) {
      item.data.data.weapon2H = false;
    }
     item.update({"data.weapon2H" : item.data.data.weapon2H})
  }

   _onPlusQty(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity + 1;

     item.update({"data.quantity" : item.data.data.quantity})
  }

  async _onMinusQty(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity - 1;
    if (item.data.data.quantity <= 0){
      item.data.data.quantity = 0;
      ui.notifications.info(`You have used your last ${item.name}!`);
    }

    await item.update({"data.quantity" : item.data.data.quantity})
  }

  async _onItemEquip(event) {
    let toggle = $(event.currentTarget);
    const li = toggle.closest(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.data.data.equipped === false) {
      item.data.data.equipped = true;
    } else if (item.data.data.equipped === true) {
      item.data.data.equipped = false;
    }
    await item.update({"data.equipped" : item.data.data.equipped})
  }

   _onItemCreate(event) {
    event.preventDefault()
    const element = event.currentTarget

    const itemData = [{
      name: element.id,
      type: element.id,
    }]

     this.actor.createEmbeddedDocuments("Item", itemData);
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

  _setResourceBars() {
    const data = this.actor.data.data

    if (data) {
        for (let bar of [...document.querySelectorAll('.currentBar')]) {
          let resource = data[bar.dataset.resource]

          if (resource.max !== 0) {
              let resourceElement = document.querySelector(`#${bar.id}`)
              let proportion = Number((100 * (resource.value / resource.max)).toFixed(0))

              // if greater than 100 or lower than 20, set values to fit bars correctly
              proportion < 100 ? proportion = proportion : proportion = 100
              proportion < 20 ? proportion = 20 : proportion = proportion

              // Apply the proportion to the width of the resource bar
              resourceElement.style.width = `${proportion}%`
          }
        }
      }
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

  _setWoundIcon() {
    let woundIcon = document.querySelector('.woundIcon')
    this.actor.data.data.wounded ? woundIcon.style.visibility = 'visible' : woundIcon.style.visibility = 'hidden'
  }

  _setWoundBackground() {
    if (this.actor.data.data.wounded) {
      document.querySelector('.paperDollContainer').classList.add('wounded')
    }
    else {
      document.querySelector('.paperDollContainer').classList.remove('wounded')
    }
  }

  _setPaperDoll(event) {
    event.preventDefault()
    if (this.actor.data.data.paperDoll === 'systems/uesrpg-d100/images/paperDoll_Male_Outline_White.png') {
      this.actor.update({'data.paperDoll': 'systems/uesrpg-d100/images/paperDoll_Female_Outline_White.png'})
    } 
    else {
      this.actor.update({'data.paperDoll': 'systems/uesrpg-d100/images/paperDoll_Male_Outline_White.png'})
    }
  }

  _saveScrollPosition(event) {
    sessionStorage.setItem('scrollPosition.combatItemContainer', document.querySelector('.combatItemContainer').scrollTop)
    sessionStorage.setItem('scrollPosition.attributeList', document.querySelector('.attributeList').scrollTop)
  }

  _setScrollPosition() {
    document.querySelector('.combatItemContainer').scrollTop = sessionStorage.getItem('scrollPosition.combatItemContainer')
    document.querySelector('.attributeList').scrollTop = sessionStorage.getItem('scrollPosition.attributeList')
  }

  _createSpellFilterOptions() {
    for (let spell of this.actor.items.filter(item => item.type === 'spell')) {
      if ([...document.querySelectorAll('#spellFilter option')].some(i => i.innerHTML === spell.data.data.school)) {continue}
      else {
        let option = document.createElement('option')
        option.innerHTML = spell.data.data.school
        document.querySelector('#spellFilter').append(option)
      }
    }
  }

  _filterSpells(event) {
    event.preventDefault()
    let filterBy = event.currentTarget.value
    
    for (let spellItem of [...document.querySelectorAll(".spellList tbody .item")]) {
      switch (filterBy) {
        case 'All':
          spellItem.classList.add('active')
          sessionStorage.setItem('savedSpellFilter', filterBy)
          break
          
        case `${filterBy}`:
          filterBy == spellItem.dataset.spellSchool ? spellItem.classList.add('active') : spellItem.classList.remove('active')
          sessionStorage.setItem('savedSpellFilter', filterBy)
          break
      }
    }
  }

  _setDefaultSpellFilter() {
      let filterBy = sessionStorage.getItem('savedSpellFilter')

      if (filterBy !== null||filterBy !== undefined) {
        document.querySelector('#spellFilter').value = filterBy
        for (let spellItem of [...document.querySelectorAll('.spellList tbody .item')]) {
          switch (filterBy) {
            case 'All':
              spellItem.classList.add('active')
              break

            case `${filterBy}`:
              filterBy == spellItem.dataset.spellSchool ? spellItem.classList.add('active') : spellItem.classList.remove('active')
              break
          }
        }
      }
  }

  _setEquippedArmor() {
    for (let armor of this.actor.items.filter(item => item.data.data.equipped)) {
      let tableEntry = document.createElement('tr')
      tableEntry.classList.add('item')
      tableEntry.dataset.itemId = armor.id
      tableEntry.innerHTML = `
                              <td><input type="checkbox" class="itemEquip" ${armor.data.data.equipped ? 'checked' : ''}></td>
                              <td class="armorName" data-item-id="${armor.id}">
                                  <div class="item-name" style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                    <img class="item-img" src="${armor.img}">
                                    ${armor.name}
                                  </div>
                              </td>
                              <td>${armor.data.data.armor}</td>
                              <td>${armor.data.data.magic_ar}</td>\
                              <td>${armor.data.data.blockRating}</td>
                              `
      tableEntry.querySelector('.itemEquip').addEventListener('click', (event) => {this._onItemEquip(event)})
      this.form.querySelector('#equippedItemTableBody').append(tableEntry)
    }
  }

  _selectWornArmor(event) {
    event.preventDefault()
    let armorList = this.actor.items.filter(armor => armor.type === 'armor'||armor.data.data.wearable)

    let armorEntries = []
    for (let armor of armorList) {
      let tableEntry = `<tr>
                            <td data-item-id="${armor.data._id}">
                                <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                  <img class="item-img" src="${armor.img}" height="24" width="24">
                                  ${armor.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${armor.data.data.armor}</td>
                            <td style="text-align: center;">${armor.data.data.magic_ar}</td>
                            <td style="text-align: center;">${armor.data.data.blockRating}</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="armorSelect" data-item-id="${armor.data._id}" ${armor.data.data.equipped ? 'checked' : ''}>
                            </td>
                        </tr>`

      armorEntries.push(tableEntry)
    }

    let d = new Dialog({
      title: "Armor List",
      content: `<div>
                    <div style="padding: 5px 0;">
                        <label>Selecting nothing will unequip all armor</label>
                    </div>

                    <div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Armor</th>
                                    <th>AR</th>
                                    <th>MR</th>
                                    <th>BR</th>
                                    <th>Equipped</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${armorEntries.join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`,

      buttons: {
        one: {
          label: "Cancel",
          callback: html => console.log('Cancelled')
        },
        two: {
          label: "Submit",
          callback: async html => {
                let selectedArmor = [...document.querySelectorAll('.armorSelect')].filter(armor => armor.checked)

                // Unequip all existing armors
                for (let armor of this.actor.items.filter(item => item.type === 'armor')) {
                  await armor.update({'data.equipped': false})
                }

                for (let wearable of this.actor.items.filter(item => item.data.data.wearable)) {
                  await wearable.update({'data.equipped': false})
                }

                // Equip all selected armors
                for (let armor of selectedArmor) {
                  let thisArmor = this.actor.items.filter(item => item.id == armor.dataset.itemId)[0]
                  await thisArmor.update({'data.equipped': true})
                }
          }
        }
      },
      default: "two",
      close: html => console.log()
    })
    
    d.position.width = 500
    d.render(true)
  }

  _toggleResistanceColumn(event) {
    event.preventDefault()
    let leftColumn = this.form.querySelector('.leftColumn')

    if ([...leftColumn.classList].some(string => string === 'collapsed')) {
      leftColumn.classList.remove('collapsed')
      sessionStorage.setItem('columnCollapsed', 'false')
    }
    else {
      leftColumn.classList.add('collapsed')
      sessionStorage.setItem('columnCollapsed', 'true')
    }
  }

  _setResistanceColumnToggle() {
    let leftColumn = this.form.querySelector('.leftColumn')
    let columnCollapsed = sessionStorage.getItem('columnCollapsed')

    switch (columnCollapsed) {
      case 'true': 
        leftColumn.classList.add('collapsed')
        break

      case 'false': 
        leftColumn.classList.remove('collapsed')
        break
    }
  }

  _selectWeaponMenu(event) {
    event.preventDefault()
    let element = event.currentTarget
    let weaponEntries = []
    let slot = [...element.classList].some(string => string === 'primaryWeapon') ? "primaryWeapon" : 'secondaryWeapon'

    for (let weapon of this.actor.items.filter(item => item.type === 'weapon')) {
        let checked = weapon.id === this.actor.data.data.equippedWeapons[slot].id ? 'checked' : ''
        let entry = `<tr class="item flex-row" data-item-id="${weapon.id}">
                          <td style="min-width: 50px;"><input type="checkbox" class="selectedWeapon" data-weapon-id="${weapon.id}" ${checked}></td>
                          <td>
                              <div style="display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 5px; text-align: left;">
                                  <img class="item-img" src="${weapon.img}" height=24 width=24>
                                  <div class="item-name">${weapon.name}</div>
                              </div>
                          </td>
                          <td style="min-width: 50px;">${weapon.data.data.reach}</td>
                          <td style="min-width: 50px;">${weapon.data.data.damage}</td>
                          <td style="min-width: 50px;">${weapon.data.data.damage2}</td>
                          <td>${weapon.data.data.qualities}</td>
                      </tr>`
        weaponEntries.push(entry)
    }

    let d = new Dialog({
      title: `Select ${[...element.classList].some(string => string === 'primaryWeapon') ? 'Primary' : 'Secondary'} Weapon`,
      content: `<div>
                    <div>
                        <h2>Select a weapon to bind to this button</h2>
                    </div>

                    <div style="padding: 10px; margin-top: 10px; background: rgba(161, 149, 149, 0.486); border: black 1px; font-style: italic;">
                          To clear/reset the hotkey to no bindings, de-select any weapons and hit the submit button.
                    </div>

                    <div>
                        <table style="text-align: center;">
                            <thead>
                                <tr>
                                    <th>Select</th>
                                    <th style="text-align: left;">Weapon</th>
                                    <th>Reach</th>
                                    <th>Damage</th>
                                    <th>2H</th>
                                    <th>Qualities</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${weaponEntries.join('')}
                            </tbody>
                        </table>
                    </div>

                </div>`,
      buttons: {
        one: {
          label: 'Cancel',
          callback: html => console.log('Cancelled')
        },
        two: {
          label: 'Submit',
          callback: html => {
              const checkedBox = [...document.querySelectorAll('.selectedWeapon')].filter(item => item.checked)[0]

              if (checkedBox === null || checkedBox === undefined) {
                ui.notifications.info("Cleared weapon hotkey")
                this.actor.update({
                  'data.equippedWeapons.primaryWeapon.name': "None: Right click to bind weapon",
                  'data.equippedWeapons.primaryWeapon.img': 'icons/svg/sword.svg',
                  'data.equippedWeapons.primaryWeapon.id': ""
                })

                this.actor.update({
                  'data.equippedWeapons.secondaryWeapon.name': "None: Right click to bind weapon",
                  'data.equippedWeapons.secondaryWeapon.img': 'icons/svg/sword.svg',
                  'data.equippedWeapons.secondaryWeapon.id': ""
                })
              }

              else {
                const selectedWeapon = this.actor.getEmbeddedDocument('Item', checkedBox.dataset.weaponId)

                switch ([...element.classList].some(i => i === 'primaryWeapon')) {
                  case true: 
                      this.actor.update({
                        'data.equippedWeapons.primaryWeapon.name': selectedWeapon.name,
                        'data.equippedWeapons.primaryWeapon.img': selectedWeapon.img,
                        'data.equippedWeapons.primaryWeapon.id': selectedWeapon.id
                      })
                      break

                  case false: 
                      this.actor.update({
                        'data.equippedWeapons.secondaryWeapon.name': selectedWeapon.name,
                        'data.equippedWeapons.secondaryWeapon.img': selectedWeapon.img,
                        'data.equippedWeapons.secondaryWeapon.id': selectedWeapon.id
                      })
                      break
                }
              }
          }
        }
      },
      default: 'two',
      close: html => console.log()
    })

    d.position.width = 500;
    d.render(true)
  }

  _onWeaponShortcut(event) {
    event.preventDefault()
    let element = event.currentTarget
    let shortcutWeapon
    switch ([...element.classList].some(i => i === 'primaryWeapon')) {
      case true: 
          shortcutWeapon = this.actor.getEmbeddedDocument('Item', this.actor.data.data.equippedWeapons.primaryWeapon.id)
          break

      case false: 
          shortcutWeapon = this.actor.getEmbeddedDocument('Item', this.actor.data.data.equippedWeapons.secondaryWeapon.id)
          break
    }

    if (shortcutWeapon === null || shortcutWeapon === undefined) {
      return ui.notifications.info("No weapon bound to this hotkey. Right click the hotkey to bind a weapon.")
    }

    let hit_loc = ""
    let hit = new Roll("1d10")
    hit.roll({async: false})

    switch (hit.result) {
      case "1":
        hit_loc = "Body"
        break

      case "2":
        hit_loc = "Body"
        break

      case "3":
        hit_loc = "Body"
        break

      case "4":
        hit_loc = "Body"
        break

      case "5":
        hit_loc = "Body"
        break

      case "6":
        hit_loc = "Right Leg"
        break

      case "7":
        hit_loc = "Left Leg"
        break
      
      case "8":
        hit_loc = "Right Arm"
        break

      case "9":
        hit_loc = "Left Arm"
        break

      case "10":
        hit_loc = "Head"
        break
    }

    let damageString
    shortcutWeapon.data.data.weapon2H ? damageString = shortcutWeapon.data.data.damage2 : damageString = shortcutWeapon.data.data.damage
    let weaponRoll = new Roll(damageString)
    weaponRoll.roll({async: false})
    
    // Superior Weapon Roll
    let maxRoll = 0

    if (shortcutWeapon.data.data.superior) {
      let superiorRoll = new Roll(damageString)
      superiorRoll.roll({async: false})
      maxRoll = weaponRoll.result > superiorRoll.result ? weaponRoll.result : superiorRoll.result
    }

    else {maxRoll = weaponRoll.result}

    let contentString = `<div>
                              <h2>
                                  <img src="${shortcutWeapon.img}">
                                  <div>${shortcutWeapon.name}</div>
                              </h2>

                              <table>
                                  <thead>
                                      <tr>
                                          <th>Damage</th>
                                          <th class="tableCenterText">Result</th>
                                          <th class="tableCenterText">Detail</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      <tr>
                                          <td class="tableAttribute">Damage</td>
                                          <td class="tableCenterText">[[${maxRoll}]]</td>
                                          <td class="tableCenterText">${damageString}</td>
                                      </tr>
                                      <tr>
                                          <td class="tableAttribute">Hit Location</td>
                                          <td class="tableCenterText">${hit_loc}</td>
                                          <td class="tableCenterText">[[${hit.result}]]</td>
                                      </tr>
                                      <tr>
                                          <td class="tableAttribute">Qualities</td>
                                          <td class="tableCenterText" colspan="2">${shortcutWeapon.data.data.qualities}</td>
                                      </tr>
                                  </tbody>
                              </table>
                          <div>`


    // tags for flavor on chat message
    let tags = [];

    if (shortcutWeapon.data.data.superior){
        let tagEntry = `<span style="border: none; border-radius: 30px; background-color: rgba(29, 97, 187, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;" title="Damage was rolled twice and output was highest of the two">Superior</span>`;
        tags.push(tagEntry);
    }

    ChatMessage.create({
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      flavor: tags.join(''),
      content: contentString,
      roll: weaponRoll
    })
  }

  _refreshWeaponShortcuts() {
    this.actor.update({
      'data.equippedWeapons.primaryWeapon.name': this.actor.data.data.equippedWeapons.primaryWeapon.name,
      'data.equippedWeapons.primaryWeapon.img': this.actor.data.data.equippedWeapons.primaryWeapon.img,
      'data.equippedWeapons.primaryWeapon.id': this.actor.data.data.equippedWeapons.primaryWeapon.id
    })

    this.actor.update({
      'data.equippedWeapons.secondaryWeapon.name': this.actor.data.data.equippedWeapons.secondaryWeapon.name,
      'data.equippedWeapons.secondaryWeapon.img': this.actor.data.data.equippedWeapons.secondaryWeapon.img,
      'data.equippedWeapons.secondaryWeapon.id': this.actor.data.data.equippedWeapons.secondaryWeapon.id
    })
  }

}
