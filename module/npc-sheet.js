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
      const armor = {
        Equipped: [],
        Unequipped: []
      };
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
    // html.find(".unconventional-roll").click(await this._onUnconventionalRoll.bind(this));
    html.find(".magic-roll").click(await this._onSpellRoll.bind(this));
    html.find(".resistance-roll").click(await this._onResistanceRoll.bind(this));
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
    html.find(".itemTabInfo .wealthCalc").click(await this._onWealthCalc.bind(this));
    html.find(".setBaseCharacteristics").click(await this._onSetBaseCharacteristics.bind(this));
    html.find(".carryBonus").click(await this._onCarryBonus.bind(this));
    html.find(".wealthCalc").click(await this._onWealthCalc.bind(this));
    html.find(".incrementResource").click(this._onIncrementResource.bind(this))
    html.find(".resourceLabel button").click(this._onResetResource.bind(this))
    html.find(".swapContainer button").click(this._setPaperDoll.bind(this))
    html.find("#spellFilter").click(this._filterSpells.bind(this))

    // Checks UI Elements for update
    this._createSpellFilterOptions()
    this._setResourceBars()
    this._setWoundIcon()
    this._setWoundBackground()

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
            roll.roll();

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
              contentString = `<h2 style='font-size: large'>${element.getAttribute('name')}</h2>
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
                  contentString = `<h2 style='font-size: large'>${element.getAttribute('name')}</h2>
                  <p></p><b>Target Number: [[${this.actor.data.data.professionsWound[element.getAttribute('id')]} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.result}]]</b><p></p>
                  <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

                } else {
                  contentString = `<h2 style='font-size: large'>${element.getAttribute('name')}</h2>
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

   _onSpellRoll(event) {
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
    
      const content = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
       <p></p>
       <b>Damage: [[${roll.result}]]</b> ${roll._formula}<b>
      <p></p>
      Hit Location: [[${hit.total}]]</b> ${hit_loc}<b>
       <p></p>
       MP Cost: [[${item.data.data.cost}]]
      <p></p>
       Attributes:</b> ${item.data.data.attributes}`
      
       roll.toMessage({
         async:false, 
         type: CONST.CHAT_MESSAGE_TYPES.ROLL, 
         user: game.user.id, 
         speaker: ChatMessage.getSpeaker(), 
         content: content});
  }
      
   _onCombatRoll(event) {
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
            callback: html => {
              const playerInput = parseInt(html.find('[id="playerInput"]').val());
      
            let contentString = "";
            let roll = new Roll("1d100");
            roll.roll({async:false});
      
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
      
                } else {
                  contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
                  <p></p><b>Target Number: [[${item.data.data.value} + ${playerInput}]]</b> <p></p>
                  <b>Result: [[${roll.result}]]</b><p></p>
                  <b>${roll.total<=(item.data.data.value + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`
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
            contentString = `<h2 style='font-size: large;'${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

          } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || roll.total == this.actor.data.data.unlucky_numbers.ul2 || roll.total == this.actor.data.data.unlucky_numbers.ul3 || roll.total == this.actor.data.data.unlucky_numbers.ul4 || roll.total == this.actor.data.data.unlucky_numbers.ul5) {
            contentString = `<h4>${element.name} Resistance</h4>
            <p></p><b>Target Number: [[${this.actor.data.data.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

          } else {
            contentString = `<h4>${element.name} Resistance</h4>
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

   _onArmorRoll(event) {
    event.preventDefault()
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    const content = `<h2 style='font-size: large;'>${item.name}</h2><p>
      <b>AR:</b> ${item.data.data.armor}<p>
      <b>Magic AR:</b> ${item.data.data.magic_ar}<p>
      <b>Qualities</b> ${item.data.data.qualities}`
      ChatMessage.create(
        {user: game.user.id, 
          speaker: ChatMessage.getSpeaker(), 
          content: content});
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

   _onPlusAmmo(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity + 1;

     item.update({"data.quantity" : item.data.data.quantity})
  }

   _onMinusAmmo(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.data.data.quantity = item.data.data.quantity - 1;
    if (item.data.data.quantity < 0){
      item.data.data.quantity = 0;
      ui.notifications.info("Out of Ammunition!");
    }

     item.update({"data.quantity" : item.data.data.quantity})
  }

   _onItemEquip(event) {
    event.preventDefault()
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

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
          break
          
        case `${filterBy}`:
          filterBy == spellItem.dataset.spellSchool ? spellItem.classList.add('active') : spellItem.classList.remove('active')
          break
      }
    }
  }

}
