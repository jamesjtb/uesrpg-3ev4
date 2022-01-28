/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class merchantSheet extends ActorSheet {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "npc"],
      width: 680,
      height: 720,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "merchant"}],
      dragDrop: [{dragSelector: [
        ".item-list .item", 
        ".combat-list .item", 
        ".ability-list .item", 
        ".spell-list .item",
        ".talents-list .item",
        ".merchant-list .item"
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
    if (this.actor.data.type === 'npc') {

      //Prepare character items
      this._prepareCharacterItems(data);
    }

    return data;
    }

  
    _prepareCharacterItems(sheetData) {
      const actorData = sheetData.actor.data;
  
      //Initialize containers
      const merchantItem = [];
      const power = [];
      const trait = [];
      const talent = [];
      const combatStyle = [];
      const spell = [];
      const skill = [];
      const magicSkill = [];
      const language = [];
      const faction = [];
  
      //Iterate through items, allocating to containers
      //let totaWeight = 0;
      for (let i of sheetData.items) {
        let item = i.data;
        i.img = i.img || DEFAULT_TOKEN;
        //Append to item
        if (i.type === 'item') {
          merchantItem.push(i);
        }
        //Append to weapons
        else if (i.type === 'weapon') {
            merchantItem.push(i);
        }
        //Append to armor
        else if (i.type === 'armor') {
          merchantItem.push(i);
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
          merchantItem.push(i);
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
      const itemCats = [merchantItem, power, trait, talent, combatStyle, spell, skill, magicSkill, language, faction]
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
      actorData.merchantItem = merchantItem;
      actorData.power = power;
      actorData.trait = trait;
      actorData.talent = talent;
      actorData.combatStyle = combatStyle;
      actorData.spell = spell;
      actorData.skill = skill;
      actorData.magicSkill = magicSkill;
      actorData.language = language;
      actorData.faction = faction;
  
    }

    get template() {
      const path = "systems/uesrpg-d100/templates";
      if (!game.user.isGM) return "systems/uesrpg-d100/templates/limited-merchant-sheet.html"; 
      return `${path}/merchant-sheet.html`;
    }

  /* -------------------------------------------- */

  /** @override */
	async activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons
    html.find(".characteristic-roll").click(await this._onClickCharacteristic.bind(this));
    html.find(".professions-roll").click(await this._onProfessionsRoll.bind(this));
    html.find(".damage-roll").click(await this._onDamageRoll.bind(this));
    html.find(".unconventional-roll").click(await this._onUnconventionalRoll.bind(this));
    // html.find(".commerce-roll").click(await this._onUnconventionalRoll.bind(this));
    html.find(".magic-roll").click(await this._onSpellRoll.bind(this));
    html.find(".resistance-roll").click(await this._onResistanceRoll.bind(this));
    html.find(".armor-roll").click(await this._onArmorRoll.bind(this));
    html.find(".ammo-roll").click(await this._onAmmoRoll.bind(this));
    html.find(".ability-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".talents-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".spell-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".combat-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".item-list .item-img").click(await this._onTalentRoll.bind(this));
    html.find(".merchant-list .item-img").click(await this._onTalentRoll.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(await this._onToggle2H.bind(this));
    html.find(".ammo-plus").click(await this._onPlusAmmo.bind(this));
    html.find(".ammo-minus").click(await this._onMinusAmmo.bind(this));
    html.find(".itemEquip").click(await this._onItemEquip.bind(this));
    html.find(".wealthCalc").click(await this._onWealthCalc.bind(this));
    html.find(".setBaseCharacteristicsNPC").click(await this._onSetBaseCharacteristics.bind(this));

    //Item Create Buttons
    html.find('.item-create').click(this._onItemCreate.bind(this))

    //Merchant Buttons
    html.find(".increasePriceMod").click(await this._onIncreasePriceMod.bind(this));
    html.find(".decreasePriceMod").click(await this._onDecreasePriceMod.bind(this));
    html.find(".buyButton").click(await this._onBuyItem.bind(this));
    html.find("#itemFilter").click(this._filterItems.bind(this));

    // Constants
    this._updateModPrice()
    this._createItemFilterOptions()
    this._setDefaultItemFilter()

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

  _updateModPrice() {
    for (let item of this.actor.items.filter(item => item.hasOwnProperty('modPrice'))) {
      item.data.data.modPrice = (item.data.data.price + (item.data.data.price * (this.actor.data.data.priceMod/100))).toFixed(0);
      item.update({"data.modPrice" : item.data.data.modPrice, "data.price": item.data.data.price});
    }
  }

  async _onBuyItem(event) {
    event.preventDefault()
    const merchant = this.actor.data.data;
    const button = event.currentTarget;
    const li = button.closest(".item");
    const merchantItem = this.actor.items.get(li?.dataset.itemId);
    const itemPrice = Number(merchantItem.data.data.modPrice);

    //{--- Start of the GM Buy Item Function ---}

    //Designate Buyer as Active Token if user is GM
    if (game.user.isGM) {
      const controlledToken = game.canvas.tokens.controlled[0];
      const buyer = controlledToken.actor;
      const buyerData = controlledToken.actor.data.data;

      if (merchantItem.data.data.quantity <= 0) {
        ui.notifications.info("This Merchant is out of stock! How unfortunate...")
      } else if (buyerData.wealth < itemPrice) {
          ui.notifications.info("You cannot afford this item. Try coming back with more jingle in your pockets.");
      } else {

        //Create Purchased Item on Buyer's Sheet
          const itemDuplicate = merchantItem.toObject();
          itemDuplicate.data.quantity = 1;
          const qtyUpdateItem = buyer.items.find(i => i.name === itemDuplicate.name);

          if (itemDuplicate.type === "weapon" || itemDuplicate.type === "armor" || qtyUpdateItem == undefined) {
            buyer.createEmbeddedDocuments("Item", [itemDuplicate]);
          } else {
              qtyUpdateItem.data.data.quantity = qtyUpdateItem.data.data.quantity + 1;
              qtyUpdateItem.update({"data.quantity" : qtyUpdateItem.data.data.quantity});
          }

          //Update Transaction Values on Merchant/Buyer
          merchantItem.data.data.quantity = merchantItem.data.data.quantity - 1;
          merchantItem.update({"data.quantity" : merchantItem.data.data.quantity});

          merchant.wealth = merchant.wealth + itemPrice;
          this.actor.update({"data.wealth" : merchant.wealth});

          buyerData.wealth = buyerData.wealth - itemPrice;
          buyer.update({"data.wealth" : buyerData.wealth});

          //Output Chat Message
          ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: `<h2 style='font-size: large'><img src="${merchantItem.img}" height=20 width=20 style='margin-right: 5px;'</img>${merchantItem.name}</h2><p></p>
              <i>${buyer.name} spent ${merchantItem.data.data.modPrice} on this ${merchantItem.type}</i>`,
            sound: "systems/uesrpg-d100/sounds/coinJingle.mp3"
            })

        }


      //{ --- Start of the Player Buy Item Function ---}
      
    } 
    
    else {

    //Designate Buyer as owned character if Player
    const buyer = game.user.character;
    const buyerData = game.user.character.data.data;

    //Chat and Notification Outputs on Purchase
    if (merchantItem.data.data.quantity === 0) {
      ui.notifications.info("This Merchant is out of stock! How unfortunate...")
    } else if (buyerData.wealth < itemPrice) {
        ui.notifications.info("You cannot afford this item. Try coming back with more jingle in your pockets.");
    } else {

    //Create Purchased Item and Update Buyer Wealth
      const itemDuplicate = merchantItem.toObject();
      itemDuplicate.data.quantity = 1;
      const qtyUpdateItem = game.user.character.items.find(i => i.name === itemDuplicate.name);

      if (itemDuplicate.type === "weapon" || itemDuplicate.type === "armor" || qtyUpdateItem == undefined) {
        game.user.character.createEmbeddedDocuments("Item", [itemDuplicate]);
      } else {
          qtyUpdateItem.data.data.quantity = qtyUpdateItem.data.data.quantity + 1;
          qtyUpdateItem.update({"data.quantity" : qtyUpdateItem.data.data.quantity});
      }

      //Update Transaction Values on Merchant/Buyer
      merchantItem.data.data.quantity = merchantItem.data.data.quantity - 1;
      merchantItem.update({"data.quantity" : merchantItem.data.data.quantity});

      merchant.wealth = merchant.wealth + itemPrice;
      this.actor.update({"data.wealth" : merchant.wealth});

      buyerData.wealth = buyerData.wealth - itemPrice;
      game.user.character.update({"data.wealth" : game.user.character.data.data.wealth});

      //Output Chat Message
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content: `<h2 style='font-size: large'><img src="${merchantItem.img}" height=20 width=20 style='margin-right: 5px;'</img>${merchantItem.name}</h2><p></p>
          <i>${game.user.character.name} spent ${merchantItem.data.data.modPrice} on this ${merchantItem.type}</i>`,
        sound: "systems/uesrpg-d100/sounds/coinJingle.mp3"
        }) 
    }
    
    }
  }
    
  async _onIncreasePriceMod(event) {
    event.preventDefault()
    const merchantItems = this.actor.items.filter(item => item.data.data.hasOwnProperty("modPrice"));
    this.actor.data.data.priceMod = Number(this.actor.data.data.priceMod + 5);
    this.actor.update({"data.priceMod" : this.actor.data.data.priceMod});

    for (let item of merchantItems) {
      item.data.data.modPrice = (item.data.data.price + (item.data.data.price * (this.actor.data.data.priceMod/100))).toFixed(0);
      await item.update({"data.modPrice" : item.data.data.modPrice});
    }

    }

  async _onDecreasePriceMod(event) {
    event.preventDefault()
    const merchantItems = this.actor.items.filter(item => item.data.data.hasOwnProperty("modPrice"));
    this.actor.data.data.priceMod = Number(this.actor.data.data.priceMod - 5);
    this.actor.update({"data.priceMod" : this.actor.data.data.priceMod});

    for (let item of merchantItems) {
      item.data.data.modPrice = (item.data.data.price + (item.data.data.price * (this.actor.data.data.priceMod/100))).toFixed(0);
      await item.update({"data.modPrice" : item.data.data.modPrice});
    }

    }
  
    async _onSetBaseCharacteristics(event) {
      event.preventDefault()
      const strBonusArray = [];
      const endBonusArray = [];
      const agiBonusArray = [];
      const intBonusArray = [];
      const wpBonusArray = [];
      const prcBonusArray = [];
      const prsBonusArray = [];
      const lckBonusArray = [];
  
      const bonusItems = this.actor.items.filter(item => item.data.data.hasOwnProperty("characteristicBonus"));
  
      for (let item of bonusItems) {
        if (item.data.data.characteristicBonus.strChaBonus !==0) {
          let name = item.name;
          strBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.endChaBonus !==0) {
            let name = item.name;
            endBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.agiChaBonus !==0) {
            let name = item.name;
            agiBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.intChaBonus !==0) {
            let name = item.name;
            intBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.wpChaBonus !==0) {
            let name = item.name;
            wpBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.prcChaBonus !==0) {
            let name = item.name;
            prcBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.prsChaBonus !==0) {
            let name = item.name;
            prsBonusArray.push(name);
        } else if (item.data.data.characteristicBonus.lckChaBonus !==0) {
            let name = item.name;
            lckBonusArray.push(name);
        }
      }
  
      let d = new Dialog({
        title: "Set Base Characteristics",
        content: `<form>
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
                      <span style="font-size: small">${strBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">END Modifiers</h2>
                      <span style="font-size: small">${endBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">AGI Modifiers</h2>
                      <span style="font-size: small">${agiBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">INT Modifiers</h2>
                      <span style="font-size: small">${intBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">WP Modifiers</h2>
                      <span style="font-size: small">${wpBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">PRC Modifiers</h2>
                      <span style="font-size: small">${prcBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">PRS Modifiers</h2>
                      <span style="font-size: small">${prsBonusArray}</span>
                    </div>
  
                    <div style="border: inset; padding: 5px;">
                      <h2 style="font-size: small; font-weight: bold;">LCK Modifiers</h2>
                      <span style="font-size: small">${lckBonusArray}</span>
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

          let contentString = "";
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
              contentString = `<h2 style='font-size: large'>${element.name}</h2>
              <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].bonus} + ${playerInput}]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`

            } else if (roll.total == this.actor.data.data.unlucky_numbers.ul1 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul2 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul3 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul4 || 
              roll.total == this.actor.data.data.unlucky_numbers.ul5 ||
              roll.total == this.actor.data.data.unlucky_numbers.ul6) 
              {
                contentString = `<h2 style='font-size: large'>${element.name}</h2>
                <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].bonus} + ${playerInput}]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`

              } else {
                contentString = `<h2 style='font-size: large'>${element.name}</h2>
                <p></p><b>Target Number: [[${this.actor.data.data.skills[element.id].bonus} + ${playerInput}]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <b>${roll.total<=(this.actor.data.data.skills[element.id].bonus + playerInput) ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>" : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"}`

              }
               ChatMessage.create({
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
    let itemData

    if (element.id === 'createSelect') {
      let d = new Dialog({
        title: "Create Item",
        content: `<div style="padding: 10px 0;">
                      <h2>Select an Item Type</h2>
                      <label>Create an item on this sheet</label>
                  </div>`,

        buttons: {
          one: {
            label: "Item",
            callback: html => {
                const itemData = [{name: 'item', type: 'item'}]
                this.actor.createEmbeddedDocuments("Item", itemData);
            }
          },
          two: {
            label: "Ammunition",
            callback: html => {
                const itemData = [{name: 'ammunition', type: 'ammunition'}]
                this.actor.createEmbeddedDocuments("Item", itemData);
            }
          },
          three: {
            label: "Armor",
            callback: html => {
                const itemData = [{name: 'armor', type: 'armor'}]
                this.actor.createEmbeddedDocuments("Item", itemData);
            }
          },
          four: {
            label: "Weapon",
            callback: html => {
              const itemData = [{name: 'weapon', type: 'weapon'}]
              this.actor.createEmbeddedDocuments("Item", itemData);
            }
          },
          five: {
            label: "Cancel",
            callback: html => console.log('Cancelled')
          }
        },
        default: "one",
        close: html => console.log()
      })

      d.render(true)
    }

    else {
      itemData = [{
        name: element.id,
        type: element.id,
      }]
    }

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

  _createItemFilterOptions() {
    for (let merchantItem of this.actor.items.filter(item => item.type === 'ammunition'||item.type === 'weapon'||item.type === 'armor'||item.type === 'item')) {
      if ([...document.querySelectorAll('#itemFilter option')].some(i => i.innerHTML === merchantItem.type)) {continue}
      else {
        let option = document.createElement('option')
        option.innerHTML = merchantItem.type
        document.querySelector('#itemFilter').append(option)
      }
    }
  }

  _filterItems(event) {
    event.preventDefault()
    let filterBy = event.currentTarget.value
    
    for (let merchantItem of [...document.querySelectorAll("#merchantItemList .item")]) {
      switch (filterBy) {
        case 'All':
          merchantItem.classList.add('active')
          sessionStorage.setItem('savedMerchantItemFilter', filterBy)
          break
          
        case `${filterBy}`:
          filterBy == merchantItem.dataset.itemType ? merchantItem.classList.add('active') : merchantItem.classList.remove('active')
          sessionStorage.setItem('savedMerchantItemFilter', filterBy)
          break
      }
    }
  }

  _setDefaultItemFilter() {
      let filterBy = sessionStorage.getItem('savedMerchantItemFilter')

      if (filterBy !== null||filterBy !== undefined) {
        document.querySelector('#itemFilter').value = filterBy
        for (let merchantItem of [...document.querySelectorAll('#merchantItemList .item')]) {
          switch (filterBy) {
            case 'All':
              merchantItem.classList.add('active')
              break

            case `${filterBy}`:
              filterBy == merchantItem.dataset.itemType ? merchantItem.classList.add('active') : merchantItem.classList.remove('active')
              break
          }
        }
      }
  }

}
