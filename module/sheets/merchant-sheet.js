/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { getDamageTypeFromWeapon } from "../combat/combat-utils.js";

export class merchantSheet extends foundry.appv1.sheets.ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "npc"],
      width: 780,
      height: 860,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "merchant",
        },
      ],
      dragDrop: [
        {
          dragSelector: [
            ".merchant-item-list .item",
            ".armor-table .item",
            ".ammunition-table .item",
            ".weapon-table .item",
            ".spellList .item",
            ".skillList .item",
            ".factionContainer .item",
            ".languageContainer .item",
            ".talent-container .item",
            ".trait-container .item",
            ".power-container .item",
            ".containerList .item",
          ],
          dropSelector: null,
        },
      ],
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const data = super.getData();
    data.dtypes = ["String", "Number", "Boolean"];
    data.isGM = game.user.isGM;
    data.editable = data.options.editable;
    if (this.actor.type === "NPC") {
      //Prepare character items
      this._prepareCharacterItems(data);
    }

    data.actor.system.enrichedBio = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.actor.system.bio, {async: true});


    return data;
  }

  _prepareCharacterItems(sheetData) {
    const actorData = sheetData.actor.system;

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
    const container = [];

    //Iterate through items, allocating to containers
    //let totaWeight = 0;
    for (let i of sheetData.items) {
      let item = i.system;
      i.img = i.img || DEFAULT_TOKEN;
      //Append to item
      if (i.type === "item") {
        merchantItem.push(i);
      }
      //Append to weapons
      else if (i.type === "weapon") {
        merchantItem.push(i);
      }
      //Append to armor
      else if (i.type === "armor") {
        merchantItem.push(i);
      }
      //Append to power
      else if (i.type === "power") {
        power.push(i);
      }
      //Append to trait
      else if (i.type === "trait") {
        trait.push(i);
      }
      //Append to talent
      else if (i.type === "talent") {
        talent.push(i);
      }
      //Append to combatStyle
      else if (i.type === "combatStyle") {
        combatStyle.push(i);
      }
      //Append to spell
      else if (i.type === "spell") {
        spell.push(i);
      }
      //Append to skill
      else if (i.type === "skill") {
        skill.push(i);
      }
      //Append to magicSkill
      else if (i.type === "magicSkill") {
        magicSkill.push(i);
      }
      //Append to ammunition
      else if (i.type === "ammunition") {
        merchantItem.push(i);
      } else if (i.type === "language") {
        language.push(i);
      }
      //Append to faction
      else if (i.type === "faction") {
        faction.push(i);
      }
      //Append to container
      else if (i.type === "container") {
        merchantItem.push(i);
      }
    }

    // Alphabetically sort all item lists
    if (game.settings.get("uesrpg-3ev4", "sortAlpha")) {
      const itemCats = [
        merchantItem,
        power,
        trait,
        talent,
        combatStyle,
        spell,
        skill,
        magicSkill,
        language,
        faction,
        container,
      ];
      for (let category of itemCats) {
        if (category.length > 1 && category != spell) {
          category.sort((a, b) => {
            let nameA = a.name.toLowerCase();
            let nameB = b.name.toLowerCase();
            if (nameA > nameB) {
              return 1;
            } else {
              return -1;
            }
          });
        } else if (category == spell) {
          if (category.length > 1) {
            category.sort((a, b) => {
              let nameA = a.system.school;
              let nameB = b.system.school;
              if (nameA > nameB) {
                return 1;
              } else {
                return -1;
              }
            });
          }
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
    actorData.container = container;
  }

  get template() {
    const path = "systems/uesrpg-3ev4/templates";
    if (!game.user.isGM)
      return "systems/uesrpg-3ev4/templates/limited-merchant-sheet.html";
    return `${path}/merchant-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  async activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons
    html
      .find(".characteristic-roll")
      .click(await this._onClickCharacteristic.bind(this));
    html
      .find(".professions-roll")
      .click(await this._onProfessionsRoll.bind(this));
    html.find(".damage-roll").click(await this._onDamageRoll.bind(this));
    html
      .find(".unconventional-roll")
      .click(await this._onUnconventionalRoll.bind(this));
    html.find(".magic-roll").click(await this._onSpellRoll.bind(this));
    html
      .find(".resistance-roll")
      .click(await this._onResistanceRoll.bind(this));
    html.find(".armor-roll").click(await this._onArmorRoll.bind(this));
    html.find(".ammo-roll").click(await this._onAmmoRoll.bind(this));
    html
      .find(".ability-list .item-img")
      .click(await this._onTalentRoll.bind(this));
    html
      .find(".talents-list .item-img")
      .click(await this._onTalentRoll.bind(this));
    html
      .find(".spell-list .item-img")
      .click(await this._onTalentRoll.bind(this));
    html
      .find(".combat-list .item-img")
      .click(await this._onTalentRoll.bind(this));
    html
      .find(".item-list .item-img")
      .click(await this._onTalentRoll.bind(this));
    html
      .find(".merchant-list .item-img")
      .click(await this._onTalentRoll.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(await this._onToggle2H.bind(this));
    html.find(".plusQty").click(await this._onPlusQty.bind(this));
    html.find(".minusQty").contextmenu(await this._onMinusQty.bind(this));
    html.find(".itemEquip").click(await this._onItemEquip.bind(this));
    html.find(".wealthCalc").click(await this._onWealthCalc.bind(this));
    html
      .find(".setBaseCharacteristics")
      .click(await this._onSetBaseCharacteristics.bind(this));

    //Item Create Buttons
    html.find(".item-create").click(this._onItemCreate.bind(this));

    //Merchant Buttons
    html
      .find(".increasePriceMod")
      .click(await this._onIncreasePriceMod.bind(this));
    html
      .find(".decreasePriceMod")
      .click(await this._onDecreasePriceMod.bind(this));
    html.find(".buyButton").click(await this._onBuyItem.bind(this));
    html.find("#itemFilter").click(this._filterItems.bind(this));

    // Constants
    this._updateModPrice();
    this._createItemFilterOptions();
    this._setDefaultItemFilter();
    this._createStatusTags();

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Update Inventory Item
    html.find(".item-name").contextmenu(async (ev) => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      this._duplicateItem(item);
    });

    html.find(".item-name").click(async (ev) => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      item.sheet.render(true);
      await item.update({ "system.value": item.system.value });
    });

    // Open Container of item
    html.find(".fa-backpack").click(async (ev) => {
      const li = ev.currentTarget.dataset.containerId;
      const item = this.actor.items.get(li);
      item.sheet.render(true);
      await item.update({ "system.value": item.system.value });
    });

    // Delete Inventory Item
    html.find(".item-delete").click((ev) => {
      const li = ev.currentTarget.closest(".item");
      // Detect if the deleted item is a container OR is contained in one
      // Before deleting the item, update the container or contained item to remove the linking
      let itemToDelete = this.actor.items.find(
        (item) => item._id == li.dataset.itemId
      );

      // Logic for removing container linking if deleted item is the container
      if (itemToDelete.type == "container") {
        // Defensive guard: ensure contained_items exists and is an array
        const containedItems = itemToDelete?.system?.contained_items || [];
        containedItems.forEach((item) => {
          let sourceItem = this.actor.items.find((i) => i._id == item._id);
          if (sourceItem) {
            sourceItem.update({
              "system.containerStats.container_id": "",
              "system.containerStats.container_name": "",
              "system.containerStats.contained": false,
            });
          }
        });

        itemToDelete.update({ "system.contained_items": [] });
      }

      // Logic for removing container linking if deleted item is in a container
      if (
        itemToDelete?.system?.isPhysicalObject &&
        itemToDelete.type != "container" &&
        itemToDelete?.system?.containerStats?.contained
      ) {
        let containerObject = this.actor.items.find(
          (item) => item._id == itemToDelete?.system?.containerStats?.container_id
        );
        if (containerObject && Array.isArray(containerObject?.system?.contained_items)) {
          let indexToRemove = containerObject.system.contained_items.indexOf(
            containerObject.system.contained_items.find(
              (i) => i._id == itemToDelete._id
            )
          );
          containerObject.system.contained_items.splice(indexToRemove, 1);
          containerObject.update({
            "system.contained_items": containerObject.system.contained_items,
          });

          itemToDelete.update({
            "system.containerStats.container_id": "",
            "system.containerStats.container_name": "",
            "system.containerStats.contained": false,
          });
        }
      }

      this.actor.deleteEmbeddedDocuments("Item", [li.dataset.itemId]);
    });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */

  _duplicateItem(item) {
    let d = new Dialog({
      title: "Duplicate Item",
      content: `<div style="padding: 10px; display: flex; flex-direction: row; align-items: center; justify-content: center;">
                  <div>Duplicate Item?</div>
              </div>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
        two: {
          label: "Duplicate",
          callback: async (html) => {
            let newItem = await this.actor.createEmbeddedDocuments("Item", [
              item.toObject(),
            ]);
            await newItem[0].sheet.render(true);
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });

    d.render(true);
  }

  _updateModPrice() {
    // Defensive guard: filter items with modPrice using safe hasOwnProperty
    for (let item of this.actor.items.filter((item) =>
      item?.system && Object.prototype.hasOwnProperty.call(item.system, "modPrice")
    )) {
      const price = Number(item?.system?.price ?? 0);
      const priceMod = Number(this.actor?.system?.priceMod ?? 0);
      item.system.modPrice = Math.round(price + price * (priceMod / 100));
      item.update({
        "system.modPrice": item.system.modPrice,
        "system.price": item.system.price,
      });
    }
  }

  async _onBuyItem(event) {
    event.preventDefault();
    const merchant = this.actor.system;
    const button = event.currentTarget;
    const li = button.closest(".item");
    const merchantItem = this.actor.items.get(li?.dataset.itemId);
    // Guard: defensive check for merchantItem existence
    if (!merchantItem) {
      ui.notifications.warn("Item not found");
      return;
    }
    const itemPrice = Number(merchantItem?.system?.modPrice ?? 0);

    //{--- Start of the GM Buy Item Function ---}

    //Designate Buyer as Active Token if user is GM
    if (game.user.isGM) {
      const controlledToken = game.canvas.tokens.controlled[0];
      // Guard: defensive check for controlledToken and actor
      if (!controlledToken || !controlledToken.actor) {
        ui.notifications.warn("No token selected or token has no actor");
        return;
      }
      const buyer = controlledToken.actor;
      const buyerData = controlledToken.actor.system;

      if (Number(merchantItem?.system?.quantity ?? 0) <= 0) {
        ui.notifications.info(
          "This Merchant is out of stock! How unfortunate..."
        );
      } else if (Number(buyerData?.wealth ?? 0) < itemPrice) {
        ui.notifications.info(
          "You cannot afford this item. Try coming back with more jingle in your pockets."
        );
      } else {
        //Create Purchased Item on Buyer's Sheet
        const itemDuplicate = merchantItem.toObject();
        itemDuplicate.system = itemDuplicate.system || {};
        itemDuplicate.system.quantity = 1;
        itemDuplicate.system.equipped = false;
        const qtyUpdateItem = buyer.items.find(
          (i) => i.name === itemDuplicate.name
        );

        if (
          itemDuplicate.type === "weapon" ||
          itemDuplicate.type === "armor" ||
          qtyUpdateItem == undefined
        ) {
          buyer.createEmbeddedDocuments("Item", [itemDuplicate]);
        } else {
          const currentQty = Number(qtyUpdateItem?.system?.quantity ?? 0);
          qtyUpdateItem.system.quantity = currentQty + 1;
          qtyUpdateItem.update({
            "system.quantity": qtyUpdateItem.system.quantity,
          });
        }

        //Update Transaction Values on Merchant/Buyer
        const currentMerchantQty = Number(merchantItem?.system?.quantity ?? 0);
        merchantItem.system.quantity = currentMerchantQty - 1;
        merchantItem.update({
          "system.quantity": merchantItem.system.quantity,
        });

        const currentMerchantWealth = Number(merchant?.wealth ?? 0);
        merchant.wealth = currentMerchantWealth + itemPrice;
        this.actor.update({ "system.wealth": merchant.wealth });

        const currentBuyerWealth = Number(buyerData?.wealth ?? 0);
        buyerData.wealth = currentBuyerWealth - itemPrice;
        buyer.update({ "system.wealth": buyerData.wealth });

        //Output Chat Message
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: `<h2 style='font-size: large'><img src="${merchantItem.img}" height=20 width=20 style='margin-right: 5px;'</img>${merchantItem.name}</h2><p></p>
              <i>${buyer.name} spent ${Number(merchantItem?.system?.modPrice ?? 0)} on this ${merchantItem.type}</i>`,
          sound: "systems/uesrpg-3ev4/sounds/coinJingle.mp3",
        });
      }

      //{ --- Start of the Player Buy Item Function ---}
    } else {
      //Designate Buyer as owned character if Player
      const buyer = game.user.character;
      // Guard: defensive check for buyer existence
      if (!buyer) {
        ui.notifications.warn("No character assigned to player");
        return;
      }
      const buyerData = game.user.character.system;

      //Chat and Notification Outputs on Purchase
      if (Number(merchantItem?.system?.quantity ?? 0) === 0) {
        ui.notifications.info(
          "This Merchant is out of stock! How unfortunate..."
        );
      } else if (Number(buyerData?.wealth ?? 0) < itemPrice) {
        ui.notifications.info(
          "You cannot afford this item. Try coming back with more jingle in your pockets."
        );
      } else {
        //Create Purchased Item and Update Buyer Wealth
        const itemDuplicate = merchantItem.toObject();
        itemDuplicate.system = itemDuplicate.system || {};
        itemDuplicate.system.quantity = 1;
        itemDuplicate.system.equipped = false;
        const qtyUpdateItem = game.user.character.items.find(
          (i) => i.name === itemDuplicate.name
        );

        if (
          itemDuplicate.type === "weapon" ||
          itemDuplicate.type === "armor" ||
          qtyUpdateItem == undefined
        ) {
          game.user.character.createEmbeddedDocuments("Item", [itemDuplicate]);
        } else {
          const currentQty = Number(qtyUpdateItem?.system?.quantity ?? 0);
          qtyUpdateItem.system.quantity = currentQty + 1;
          qtyUpdateItem.update({
            "system.quantity": qtyUpdateItem.system.quantity,
          });
        }

        //Update Transaction Values on Merchant/Buyer
        const currentMerchantQty = Number(merchantItem?.system?.quantity ?? 0);
        merchantItem.system.quantity = currentMerchantQty - 1;
        merchantItem.update({ "system.quantity": merchantItem.system.quantity });

        const currentMerchantWealth = Number(merchant?.wealth ?? 0);
        merchant.wealth = currentMerchantWealth + itemPrice;
        this.actor.update({ "system.wealth": merchant.wealth });

        const currentBuyerWealth = Number(buyerData?.wealth ?? 0);
        buyerData.wealth = currentBuyerWealth - itemPrice;
        game.user.character.update({
          "system.wealth": Number(buyerData?.wealth ?? 0),
        });

        //Output Chat Message
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: `<h2 style='font-size: large'><img src="${merchantItem.img}" height=20 width=20 style='margin-right: 5px;'</img>${merchantItem.name}</h2><p></p>
          <i>${game.user.character.name} spent ${Number(merchantItem?.system?.modPrice ?? 0)} on this ${merchantItem.type}</i>`,
          sound: "systems/uesrpg-3ev4/sounds/coinJingle.mp3",
        });
      }
    }
  }

  async _onIncreasePriceMod(event) {
    event.preventDefault();
    // Defensive guard: filter items using safe hasOwnProperty
    const merchantItems = this.actor.items.filter((item) =>
      item?.system && Object.prototype.hasOwnProperty.call(item.system, "modPrice")
    );
    // Guard and safely increment priceMod
    const currentPriceMod = Number(this.actor?.system?.priceMod ?? 0);
    this.actor.system.priceMod = currentPriceMod + 5;
    this.actor.update({ "system.priceMod": this.actor.system.priceMod });

    for (let item of merchantItems) {
      const price = Number(item?.system?.price ?? 0);
      const priceMod = Number(this.actor?.system?.priceMod ?? 0);
      item.system.modPrice = Math.round(price + price * (priceMod / 100));
      await item.update({ "system.modPrice": item.system.modPrice });
    }
  }

  async _onDecreasePriceMod(event) {
    event.preventDefault();
    // Defensive guard: filter items using safe hasOwnProperty
    const merchantItems = this.actor.items.filter((item) =>
      item?.system && Object.prototype.hasOwnProperty.call(item.system, "modPrice")
    );
    // Guard and safely decrement priceMod
    const currentPriceMod = Number(this.actor?.system?.priceMod ?? 0);
    this.actor.system.priceMod = currentPriceMod - 5;
    this.actor.update({ "system.priceMod": this.actor.system.priceMod });

    for (let item of merchantItems) {
      const price = Number(item?.system?.price ?? 0);
      const priceMod = Number(this.actor?.system?.priceMod ?? 0);
      item.system.modPrice = Math.round(price + price * (priceMod / 100));
      await item.update({ "system.modPrice": item.system.modPrice });
    }
  }

  async _onSetBaseCharacteristics(event) {
    event.preventDefault();
    const strBonusArray = [];
    const endBonusArray = [];
    const agiBonusArray = [];
    const intBonusArray = [];
    const wpBonusArray = [];
    const prcBonusArray = [];
    const prsBonusArray = [];
    const lckBonusArray = [];

    // Defensive guard: safe hasOwnProperty for characteristicBonus
    const bonusItems = this.actor.items.filter((item) =>
      item?.system && Object.prototype.hasOwnProperty.call(item.system, "characteristicBonus")
    );

    for (let item of bonusItems) {
      // Defensive guard: safe access to characteristicBonus properties
      const charBonus = item?.system?.characteristicBonus ?? {};
      if ((charBonus.strChaBonus ?? 0) !== 0) {
        let name = item.name;
        strBonusArray.push(name);
      } else if ((charBonus.endChaBonus ?? 0) !== 0) {
        let name = item.name;
        endBonusArray.push(name);
      } else if ((charBonus.agiChaBonus ?? 0) !== 0) {
        let name = item.name;
        agiBonusArray.push(name);
      } else if ((charBonus.intChaBonus ?? 0) !== 0) {
        let name = item.name;
        intBonusArray.push(name);
      } else if ((charBonus.wpChaBonus ?? 0) !== 0) {
        let name = item.name;
        wpBonusArray.push(name);
      } else if ((charBonus.prcChaBonus ?? 0) !== 0) {
        let name = item.name;
        prcBonusArray.push(name);
      } else if ((charBonus.prsChaBonus ?? 0) !== 0) {
        let name = item.name;
        prsBonusArray.push(name);
      } else if ((charBonus.lckChaBonus ?? 0) !== 0) {
        let name = item.name;
        lckBonusArray.push(name);
      }
    }

    async _onSetBaseCharacteristics(event) {
  event.preventDefault();
  const strBonusArray = [];
  const endBonusArray = [];
  const agiBonusArray = [];
  const intBonusArray = [];
  const wpBonusArray = [];
  const prcBonusArray = [];
  const prsBonusArray = [];
  const lckBonusArray = [];

  // Defensive guard: safe hasOwnProperty for characteristicBonus
  const bonusItems = this.actor.items.filter((item) =>
    item?.system && Object.prototype.hasOwnProperty.call(item.system, "characteristicBonus")
  );

  for (let item of bonusItems) {
    // Defensive guard: safe access to characteristicBonus properties
    const charBonus = item?.system?.characteristicBonus ?? {};
    if ((charBonus.strChaBonus ?? 0) !== 0) {
      let name = item.name;
      strBonusArray.push(name);
    } else if ((charBonus.endChaBonus ?? 0) !== 0) {
      let name = item.name;
      endBonusArray.push(name);
    } else if ((charBonus.agiChaBonus ?? 0) !== 0) {
      let name = item.name;
      agiBonusArray.push(name);
    } else if ((charBonus.intChaBonus ?? 0) !== 0) {
      let name = item.name;
      intBonusArray.push(name);
    } else if ((charBonus.wpChaBonus ?? 0) !== 0) {
      let name = item.name;
      wpBonusArray.push(name);
    } else if ((charBonus.prcChaBonus ?? 0) !== 0) {
      let name = item.name;
      prcBonusArray.push(name);
    } else if ((charBonus.prsChaBonus ?? 0) !== 0) {
      let name = item.name;
      prsBonusArray.push(name);
    } else if ((charBonus.lckChaBonus ?? 0) !== 0) {
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
                    ${
                      Number(this.actor?.system?.characteristics?.str?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.end?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.agi?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.int?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.wp?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.prc?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.prs?.base ?? 0) +
                      Number(this.actor?.system?.characteristics?.lck?.base ?? 0)
                    }
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
                        <td><input type="number" id="strInput" value="${
                          Number(this.actor?.system?.characteristics?.str?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="endInput" value="${
                          Number(this.actor?.system?.characteristics?.end?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="agiInput" value="${
                          Number(this.actor?.system?.characteristics?.agi?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="intInput" value="${
                          Number(this.actor?.system?.characteristics?.int?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="wpInput" value="${
                          Number(this.actor?.system?.characteristics?.wp?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="prcInput" value="${
                          Number(this.actor?.system?.characteristics?.prc?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="prsInput" value="${
                          Number(this.actor?.system?.characteristics?.prs?.base ?? 0)
                        }"></td>
                        <td><input type="number" id="lckInput" value="${
                          Number(this.actor?.system?.characteristics?.lck?.base ?? 0)
                        }"></td>
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

          //Shortcut for characteristics - with defensive guard
          const chaPath = this.actor?.system?.characteristics || {};

          //Assign values to characteristics
          chaPath.str.base = strInput;
          chaPath.str.total = strInput;
          await this.actor.update({
            "system.characteristics.str.base": strInput,
            "system.characteristics.str.total": chaPath.str.total,
          });

          chaPath.end.base = endInput;
          chaPath.end.total = endInput;
          await this.actor.update({
            "system.characteristics.end.base": endInput,
            "system.characteristics.end.total": chaPath.end.total,
          });

          chaPath.agi.base = agiInput;
          chaPath.agi.total = agiInput;
          await this.actor.update({
            "system.characteristics.agi.base": agiInput,
            "system.characteristics.agi.total": chaPath.agi.total,
          });

          chaPath.int.base = intInput;
          chaPath.int.total = intInput;
          await this.actor.update({
            "system.characteristics.int.base": intInput,
            "system.characteristics.int.total": chaPath.int.total,
          });

          chaPath.wp.base = wpInput;
          chaPath.wp.total = wpInput;
          await this.actor.update({
            "system.characteristics.wp.base": wpInput,
            "system.characteristics.wp.total": chaPath.wp.total,
          });

          chaPath.prc.base = prcInput;
          chaPath.prc.total = prcInput;
          await this.actor.update({
            "system.characteristics.prc.base": prcInput,
            "system.characteristics.prc.total": chaPath.prc.total,
          });

          chaPath.prs.base = prsInput;
          chaPath.prs.total = prsInput;
          await this.actor.update({
            "system.characteristics.prs.base": prsInput,
            "system.characteristics.prs.total": chaPath.prs.total,
          });

          chaPath.lck.base = lckInput;
          chaPath.lck.total = lckInput;
          await this.actor.update({
            "system.characteristics.lck.base": lckInput,
            "system.characteristics.lck.total": chaPath.lck.total,
          });
        },
      },
      two: {
        label: "Cancel",
        callback: async (html) => console.log("Cancelled"),
      },
    },
    default: "one",
    close: async (html) => console.log(),
  });
  d.render(true);
}
  }

async _onClickCharacteristic(event) {
  event.preventDefault();
  const element = event.currentTarget;
  // Defensive guards for actor/system and nested properties
  const actorSys = this.actor?.system || {};
  const charTotal = Number(actorSys?.characteristics?.[element.id]?.total ?? 0);
  const woundPenalty = Number(actorSys?.woundPenalty ?? 0);
  const fatiguePenalty = Number(actorSys?.fatigue?.penalty ?? 0);
  const carryPenalty = Number(actorSys?.carry_rating?.penalty ?? 0);
  const woundedValue = charTotal + woundPenalty + fatiguePenalty + carryPenalty;
  const regularValue = charTotal + fatiguePenalty + carryPenalty;
  const lucky = actorSys.lucky_numbers || {};
  const unlucky = actorSys.unlucky_numbers || {};
  let tags = [];
  if (actorSys?.wounded) {
    tags.push(`<span class="tag wound-tag">Wounded ${woundPenalty}</span>`);
  }
  if (fatiguePenalty !== 0) {
    tags.push(`<span class="tag fatigue-tag">Fatigued ${fatiguePenalty}</span>`);
  }

  let d = new Dialog({
    title: "Apply Roll Modifier",
    content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.getAttribute(
                    "name"
                  )} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text">[...]
                </form>`,
    buttons: {
      one: {
        label: "Roll!",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val());

          let contentString = "";
          let roll = new Roll("1d100");
          await roll.evaluate();

          if (actorSys?.wounded == true) {
            if (
              roll.total == lucky.ln1 ||
              roll.total == lucky.ln2 ||
              roll.total == lucky.ln3 ||
              roll.total == lucky.ln4 ||
              roll.total == lucky.ln5 ||
              roll.total == lucky.ln6 ||
              roll.total == lucky.ln7 ||
              roll.total == lucky.ln8 ||
              roll.total == lucky.ln9 ||
              roll.total == lucky.ln10
            ) {
              contentString = `<h2>${element.getAttribute("name")}</h2
                <p></p><b>Target Number: [[${
                  woundedValue + playerInput
                }]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (
              roll.total == unlucky.ul1 ||
              roll.total == unlucky.ul2 ||
              roll.total == unlucky.ul3 ||
              roll.total == unlucky.ul4 ||
              roll.total == unlucky.ul5 ||
              roll.total == unlucky.ul6
            ) {
              contentString = `<h2>${element.getAttribute("name")}</h2
                <p></p><b>Target Number: [[${
                  woundedValue + playerInput
                }]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h2>${element.getAttribute("name")}</h2
                <p></p><b>Target Number: [[${
                  woundedValue + playerInput
                }]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <b>${
                  roll.total <= woundedValue + playerInput
                    ? "<span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                    : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                }`;
            }
          } else {
            if (
              roll.total == lucky.ln1 ||
              roll.total == lucky.ln2 ||
              roll.total == lucky.ln3 ||
              roll.total == lucky.ln4 ||
              roll.total == lucky.ln5 ||
              roll.total == lucky.ln6 ||
              roll.total == lucky.ln7 ||
              roll.total == lucky.ln8 ||
              roll.total == lucky.ln9 ||
              roll.total == lucky.ln10
            ) {
              contentString = `<h2>${element.getAttribute("name")}</h2
              <p></p><b>Target Number: [[${
                regularValue + playerInput
              }]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (
              roll.total == unlucky.ul1 ||
              roll.total == unlucky.ul2 ||
              roll.total == unlucky.ul3 ||
              roll.total == unlucky.ul4 ||
              roll.total == unlucky.ul5 ||
              roll.total == unlucky.ul6
            ) {
              contentString = `<h2>${element.getAttribute("name")}</h2
              <p></p><b>Target Number: [[${
                regularValue + playerInput
              }]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h2>${element.getAttribute("name")}</h2
              <p></p><b>Target Number: [[${
                regularValue + playerInput
              }]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <b>${
                roll.total <= regularValue + playerInput
                  ? "<span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                  : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
              }`;
            }
          }

          ChatMessage.create({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            roll: roll,
            content: contentString,
            flavor: `<div class="tag-container">${tags.join("")}</div>`,
          });
        },
      },
      two: {
        label: "Cancel",
        callback: (html) => console.log("Cancelled"),
      },
    },
    default: "one",
    close: (html) => console.log(),
  });
  d.render(true);
}

  _onProfessionsRoll(event) {
  const actorSys = this.actor?.system || {};
  event.preventDefault();
  const element = event.currentTarget;
  let tags = [];
  if (actorSys?.wounded) { tags.push(`<span class="tag wound-tag">Wounded ${Number(actorSys?.woundPenalty ?? 0)}</span>`); }
  if (Number(actorSys?.fatigue?.penalty ?? 0) !== 0) { tags.push(`<span class="tag fatigue-tag">Fatigued ${Number(actorSys?.fatigue?.penalty ?? 0)}</span>`); }

  let d = new Dialog({
    title: "Apply Roll Modifier",
    content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.getAttribute(
                    "name"
                  )} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></[...]
                </form>`,
    buttons: {
      one: {
        label: "Roll!",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val());

          let contentString = "";
          let roll = new Roll("1d100");
          await roll.evaluate();

          const lucky = actorSys.lucky_numbers || {};
          const unlucky = actorSys.unlucky_numbers || {};

          if (
            roll.result == lucky.ln1 ||
            roll.result == lucky.ln2 ||
            roll.result == lucky.ln3 ||
            roll.result == lucky.ln4 ||
            roll.result == lucky.ln5 ||
            roll.result == lucky.ln6 ||
            roll.result == lucky.ln7 ||
            roll.result == lucky.ln8 ||
            roll.result == lucky.ln9 ||
            roll.result == lucky.ln10
          ) {
            contentString = `<h2>${element.getAttribute("name")}</h2>
              <p></p><b>Target Number: [[${
                Number(actorSys?.professionsWound?.[element.getAttribute("id")] ?? 0)
              } + ${playerInput} + ${Number(actorSys?.fatigue?.penalty ?? 0)}]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
          } else if (
            roll.result == unlucky.ul1 ||
            roll.result == unlucky.ul2 ||
            roll.result == unlucky.ul3 ||
            roll.result == unlucky.ul4 ||
            roll.result == unlucky.ul5 ||
            roll.result == unlucky.ul6
          ) {
            contentString = `<h2>${element.getAttribute("name")}</h2>
                  <p></p><b>Target Number: [[${
                    Number(actorSys?.professionsWound?.[element.getAttribute("id")] ?? 0)
                  } + ${playerInput}  + ${
              Number(actorSys?.fatigue?.penalty ?? 0)
            } + ${Number(actorSys?.carry_rating?.penalty ?? 0)}]]</b> <p></p>
                  <b>Result: [[${roll.result}]]</b><p></p>
                  <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
          } else {
            contentString = `<h2>${element.getAttribute("name")}</h2>
                  <p></p><b>Target Number: [[${
                    Number(actorSys?.professionsWound?.[element.getAttribute("id")] ?? 0)
                  } + ${playerInput} + ${Number(actorSys?.fatigue?.penalty ?? 0)} + ${Number(actorSys?.carry_rating?.penalty ?? 0)}]]</b> <p></p>
                  <b>Result: [[${roll.result}]]</b><p></p>
                  <b>${
                    roll.result <=
                    Number(actorSys?.professionsWound?.[element.getAttribute("id")] ?? 0) +
                      playerInput +
                      Number(actorSys?.fatigue?.penalty ?? 0) +
                      Number(actorSys?.carry_rating?.penalty ?? 0)
                      ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                      : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                  }`;
          }

          ChatMessage.create({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            roll: roll,
            content: contentString,
            flavor: `<div class="tag-container">${tags.join("")}</div>`,
          });
        },
      },
      two: {
        label: "Cancel",
        callback: (html) => console.log("Cancelled"),
      },
    },
    default: "one",
    close: (html) => console.log(),
  });
  d.render(true);
}

  _onUnconventionalRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const actorSys = this.actor?.system || {};

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

            let contentString = "";
            let roll = new Roll("1d100");
            await roll.evaluate();

            const lucky = actorSys.lucky_numbers || {};
            const unlucky = actorSys.unlucky_numbers || {};

            if (
              roll.total == lucky.ln1 ||
              roll.total == lucky.ln2 ||
              roll.total == lucky.ln3 ||
              roll.total == lucky.ln4 ||
              roll.total == lucky.ln5 ||
              roll.total == lucky.ln6 ||
              roll.total == lucky.ln7 ||
              roll.total == lucky.ln8 ||
              roll.total == lucky.ln9 ||
              roll.total == lucky.ln10
            ) {
              contentString = `<h2 style='font-size: large'>${element.name}</h2>
              <p></p><b>Target Number: [[${
                Number(actorSys?.skills?.[element.id]?.bonus ?? 0)
              } + ${playerInput}]]</b> <p></p>
              <b>Result: [[${roll.result}]]</b><p></p>
              <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (
              roll.total == unlucky.ul1 ||
              roll.total == unlucky.ul2 ||
              roll.total == unlucky.ul3 ||
              roll.total == unlucky.ul4 ||
              roll.total == unlucky.ul5 ||
              roll.total == unlucky.ul6
            ) {
              contentString = `<h2 style='font-size: large'>${element.name}</h2>
                <p></p><b>Target Number: [[${
                  Number(actorSys?.skills?.[element.id]?.bonus ?? 0)
                } + ${playerInput}]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h2 style='font-size: large'>${element.name}</h2>
                <p></p><b>Target Number: [[${
                  Number(actorSys?.skills?.[element.id]?.bonus ?? 0)
                } + ${playerInput}]]</b> <p></p>
                <b>Result: [[${roll.result}]]</b><p></p>
                <b>${
                  roll.total <=
                  Number(actorSys?.skills?.[element.id]?.bonus ?? 0) + playerInput
                    ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                    : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                }`;
            }
            ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              content: contentString,
            });
          },
        },
        two: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
      },
      default: "one",
      close: (html) => console.log(),
    });
    d.render(true);
  }

  async _onDamageRoll(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.actor.items.get(li?.dataset.itemId);
    const d1 = this.actor.items.get(li?.dataset.itemId).system.damage;
    const d2 = this.actor.items.get(li?.dataset.itemId).system.damage2;

    let hit_loc = "";

    let hit = new Roll("1d100");
    await hit.evaluate();

    // Updated hit location table (1d100)
    const hitResult = hit.total;
    if (hitResult <= 15) {
      hit_loc = "Head";
    } else if (hitResult <= 35) {
      hit_loc = "Right Arm";
    } else if (hitResult <= 55) {
      hit_loc = "Left Arm";
    } else if (hitResult <= 80) {
      hit_loc = "Body";
    } else if (hitResult <= 90) {
      hit_loc = "Right Leg";
    } else {
      hit_loc = "Left Leg";
    }

    let roll = new Roll(d1);
    let supRoll = new Roll(d1);
    let roll2H = new Roll(d2);
    let supRoll2H = new Roll(d2);
    let contentString = "";
    await roll.evaluate();
    await supRoll.evaluate();
    await roll2H.evaluate();
    await supRoll2H.evaluate();

    // Get targeted actors for damage application
    const targets = game.user.targets;
    const damageType = getDamageTypeFromWeapon(item);
    let applyDamageButtons = "";

    if (item.system.weapon2H) {
      const finalDamage = item.system.superior 
        ? Math.max(roll2H.result, supRoll2H.result)
        : roll2H.result;

      if (targets.size > 0) {
        targets.forEach(target => {
          applyDamageButtons += `
            <button class="apply-damage-btn" 
                    data-actor-id="${target.actor.id}" 
                    data-damage="${finalDamage}" 
                    data-type="${damageType}" 
                    data-location="${hit_loc}"
                    style="margin: 0.25rem;">
              Apply ${finalDamage} damage to ${target.name}
            </button>`;
        });
      }

      if (item.system.superior) {
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
          <p></p>
          <b>Damage:</b> <b> [[${roll2H.result}]] [[${supRoll2H.result}]]</b> ${roll2H._formula}<p></p>
          <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
          <b>Qualities:</b> ${item.system.qualities}
          ${applyDamageButtons ? `<div style="margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.5rem;">${applyDamageButtons}</div>` : ''}`;
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: contentString,
          roll: supRoll2H,
          roll2H,
        });
      } else {
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p>
            <b>Damage:</b> <b> [[${roll2H.result}]]</b> ${roll2H._formula}<p></p>
            <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
            <b>Qualities:</b> ${item.system.qualities}
            ${applyDamageButtons ? `<div style="margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.5rem;">${applyDamageButtons}</div>` : ''}`;
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: contentString,
          roll: roll2H,
        });
      }
    } else {
      const finalDamage = item.system.superior 
        ? Math.max(roll.result, supRoll.result)
        : roll.result;

      if (targets.size > 0) {
        targets.forEach(target => {
          applyDamageButtons += `
            <button class="apply-damage-btn" 
                    data-actor-id="${target.actor.id}" 
                    data-damage="${finalDamage}" 
                    data-type="${damageType}" 
                    data-location="${hit_loc}"
                    style="margin: 0.25rem;">
              Apply ${finalDamage} damage to ${target.name}
            </button>`;
        });
      }

      if (item.system.superior) {
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p>
            <b>Damage:</b> <b> [[${roll.result}]] [[${supRoll.result}]]</b> ${roll._formula}<p></p>
            <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
            <b>Qualities:</b> ${item.system.qualities}
            ${applyDamageButtons ? `<div style="margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.5rem;">${applyDamageButtons}</div>` : ''}`;
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: contentString,
          roll: roll,
          supRoll,
        });
      } else {
        contentString = `<h2 style='font-size: large'><img src="${item.img}" height=20 width=20 style='margin-right: 5px;'</img>${item.name}</h2>
            <p></p>
            <b>Damage:</b> <b> [[${roll.result}]]</b> ${roll._formula}<p></p>
            <b>Hit Location:</b> <b> [[${hit.total}]] </b> ${hit_loc}<p></p>
            <b>Qualities:</b> ${item.system.qualities}
            ${applyDamageButtons ? `<div style="margin-top: 0.5rem; border-top: 1px solid #ddd; padding-top: 0.5rem;">${applyDamageButtons}</div>` : ''}`;
        ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker(),
          content: contentString,
          roll: roll,
        });
      }
    }
  }

  _onSpellRoll(event) {
    //Search for Talents that affect Spellcasting Costs
    let spellToCast;

    if (
      event.currentTarget.closest(".item") != null ||
      event.currentTarget.closest(".item") != undefined
    ) {
      spellToCast = this.actor.items.find(
        (spell) =>
          spell.id === event.currentTarget.closest(".item").dataset.itemId
      );
    } else {
      spellToCast = this.actor.getEmbeddedDocument(
        "Item",
        this.actor.system.favorites[event.currentTarget.dataset.hotkey].id
      );
    }

    // const spellToCast = this.actor.items.find(spell => spell.id === event.currentTarget.closest('.item').dataset.itemId)
    const hasCreative = this.actor.items.find(
      (i) => i.type === "talent" && i.name === "Creative"
    )
      ? true
      : false;
    const hasForceOfWill = this.actor.items.find(
      (i) => i.type === "talent" && i.name === "Force of Will"
    )
      ? true
      : false;
    const hasMethodical = this.actor.items.find(
      (i) => i.type === "talent" && i.name === "Methodical"
    )
      ? true
      : false;
    const hasOvercharge = this.actor.items.find(
      (i) => i.type === "talent" && i.name === "Overcharge"
    )
      ? true
      : false;
    const hasMagickaCycling = this.actor.items.find(
      (i) => i.type === "talent" && i.name === "Magicka Cycling"
    )
      ? true
      : false;

    //Add options in Dialog based on Talents and Traits
    let overchargeOption = "";
    let magickaCyclingOption = "";

    if (hasOvercharge) {
      overchargeOption = `<tr>
                                <td><input type="checkbox" id="Overcharge"/></td>
                                <td><strong>Overcharge</strong></td>
                                <td>Roll damage twice and use the highest value (spell cost is doubled)</td>
                            </tr>`;
    }

    if (hasMagickaCycling) {
      magickaCyclingOption = `<tr>
                                    <td><input type="checkbox" id="MagickaCycling"/></td>
                                    <td><strong>Magicka Cycling</strong></td>
                                    <td>Double Restraint Value, but backfires on failure</td>
                                </tr>`;
    }

    // If Description exists, put into the dialog for reference
    let spellDescriptionDiv = "";
    if (
      spellToCast.system.description != "" &&
      spellToCast.system.description != undefined
    ) {
      spellDescriptionDiv = `<div style="padding: 10px;">
                                  ${spellToCast.system.description}
                              </div>`;
    }

    const m = new Dialog({
      title: "Cast Spell",
      content: `<form>
                    <div>

                        <div>
                            <h2 style="text-align: center; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 5px; font-size: xx-large;">
                                <img src="${
                                  spellToCast.img
                                }" class="item-img" height=35 width=35>
                                <div>${spellToCast.name}</div>
                            </h2>

                            <table>
                                <thead>
                                    <tr>
                                        <th>Magicka Cost</th>
                                        <th>Spell Restraint Base</th>
                                        <th>Spell Level</th>
                                    </tr>
                                </thead>
                                <tbody style="text-align: center;">
                                    <tr>
                                        <td>${spellToCast.system.cost}</td>
                                        <td>${Math.floor(
                                          this.actor.system.characteristics.wp
                                            .total / 10
                                        )}</td>
                                        <td>${spellToCast.system.level}</td>
                                    </tr>
                                </tbody>
                            </table>

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

            if (hasMagickaCycling) {
              isMagickaCycled = html.find(`[id="MagickaCycling"]`)[0].checked;
            }

            if (hasOvercharge) {
              isOvercharged = html.find(`[id="Overcharge"]`)[0].checked;
            }

            const tags = [];

            //Functions for Spell Modifiers
            if (isRestrained) {
              let restraint = `<span style="border: none; border-radius: 30px; background-color: rgba(29, 97, 187, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;">Restraint</span>`;
              tags.push(restraint);

              //Determine cost mod based on talents and other modifiers
              if (
                hasCreative &&
                spellToCast.system.spellType === "unconventional"
              ) {
                stackCostMod = stackCostMod - 1;
              }

              if (
                hasMethodical &&
                spellToCast.system.spellType === "conventional"
              ) {
                stackCostMod = stackCostMod - 1;
              }

              if (hasForceOfWill) {
                stackCostMod = stackCostMod - 1;
              }

              spellRestraint =
                0 - Math.floor(this.actor.system.characteristics.wp.total / 10);
            }

            if (isOverloaded) {
              let overload = `<span style="border: none; border-radius: 30px; background-color: rgba(161, 2, 2, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;">Overload</span>`;
              tags.push(overload);
            }

            if (isMagickaCycled) {
              let cycled = `<span style="border: none; border-radius: 30px; background-color: rgba(126, 40, 224, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;">Magicka Cycle</span>`;
              tags.push(cycled);
              spellRestraint =
                0 -
                2 * Math.floor(this.actor.system.characteristics.wp.total / 10);
            }

            //If spell has damage value it outputs to Chat, otherwise no damage will be shown in Chat Output
            const damageRoll = new Roll(spellToCast.system.damage);
            let damageEntry = "";

            if (
              spellToCast.system.damage != "" &&
              spellToCast.system.damage != 0
            ) {
              await damageRoll.evaluate();
              damageEntry = `<tr>
                                            <td style="font-weight: bold;">Damage</td>
                                            <td style="font-weight: bold; text-align: center;">[[${damageRoll.result}]]</td>
                                            <td style="text-align: center;">${damageRoll.formula}</td>
                                        </tr>`;
            }

            const hitLocRoll = new Roll("1d10");
            await hitLocRoll.evaluate();
            let hitLoc = "";

            if (hitLocRoll.result <= 5) {
              hitLoc = "Body";
            } else if (hitLocRoll.result == 6) {
              hitLoc = "Right Leg";
            } else if (hitLocRoll.result == 7) {
              hitLoc = "Left Leg";
            } else if (hitLocRoll.result == 8) {
              hitLoc = "Right Arm";
            } else if (hitLocRoll.result == 9) {
              hitLoc = "Left Arm";
            } else if (hitLocRoll.result == 10) {
              hitLoc = "Head";
            }

            let displayCost = 0;
            let actualCost =
              spellToCast.system.cost + spellRestraint + stackCostMod;

            //Double Cost of Spell if Overcharge Talent is used
            if (isOvercharged) {
              actualCost = actualCost * 2;
              let overcharge = `<span style="border: none; border-radius: 30px; background-color: rgba(219, 135, 0, 0.8); color: white; text-align: center; font-size: xx-small; padding: 5px;">Overcharge</span>`;
              tags.push(overcharge);
            }

            if (actualCost < 1) {
              displayCost = 1;
            } else {
              displayCost = actualCost;
            }

            // Stop The Function if the user does not have enough Magicka to Cast the Spell
            if (game.settings.get("uesrpg-3ev4", "automateMagicka")) {
              if (displayCost > this.actor.system.magicka.value) {
                return ui.notifications.info(
                  `You do not have enough Magicka to cast this spell: Cost: ${spellToCast.system.cost} || Restraint: ${spellRestraint} || Other: ${stackCostMod}`
                );
              }
            }

            let contentString = `<h2><img src=${spellToCast.img}></im>${spellToCast.name}</h2>
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th style="min-width: 80px;">Name</th>
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
                                                        <td title="Cost/Restraint Modifier/Other" style="text-align: center;">${spellToCast.system.cost} / ${spellRestraint} / ${stackCostMod}</td>
                                                    </tr>
                                                    <tr style="border-top: double 1px;">
                                                        <td style="font-weight: bold;">Attributes</td>
                                                        <td colspan="2">${spellToCast.system.attributes}</td>
                                                    </tr>
                                                </tbody>
                                            </table>`;

            damageRoll.toMessage({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              flavor: tags.join(""),
              content: contentString,
            });

            // If Automate Magicka Setting is on, reduce the character's magicka by the calculated output cost
            if (game.settings.get("uesrpg-3ev4", "automateMagicka")) {
              this.actor.update({
                "system.magicka.value":
                  this.actor.system.magicka.value - displayCost,
              });
            }
          },
        },
        two: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
      },
      default: "one",
      close: (html) => console.log(),
    });

    m.position.width = 450;
    m.render(true);
  }

  _onResistanceRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;

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

            let contentString = "";
            let roll = new Roll("1d100");
            await roll.evaluate();

            if (
              roll.total == this.actor.system.lucky_numbers.ln1 ||
              roll.total == this.actor.system.lucky_numbers.ln2 ||
              roll.total == this.actor.system.lucky_numbers.ln3 ||
              roll.total == this.actor.system.lucky_numbers.ln4 ||
              roll.total == this.actor.system.lucky_numbers.ln5
            ) {
              contentString = `<h2 style='font-size: large;'${
                element.name
              } Resistance</h2>
            <p></p><b>Target Number: [[${
              this.actor.system.resistance[element.id]
            } + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (
              roll.total == this.actor.system.unlucky_numbers.ul1 ||
              roll.total == this.actor.system.unlucky_numbers.ul2 ||
              roll.total == this.actor.system.unlucky_numbers.ul3 ||
              roll.total == this.actor.system.unlucky_numbers.ul4 ||
              roll.total == this.actor.system.unlucky_numbers.ul5
            ) {
              contentString = `<h4>${element.name} Resistance</h4>
            <p></p><b>Target Number: [[${
              this.actor.system.resistance[element.id]
            } + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h4>${element.name} Resistance</h4>
            <p></p><b>Target Number: [[${
              this.actor.system.resistance[element.id]
            } + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${
              roll.total <=
              this.actor.system.resistance[element.id] + playerInput
                ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
            }`;
            }
            roll.toMessage({
              async: false,
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              content: contentString,
            });
          },
        },
        two: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
      },
      default: "one",
      close: (html) => console.log(),
    });
    d.render(true);
  }

  _onArmorRoll(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    const content = `<h2 style='font-size: large;'>${item.name}</h2><p>
      <b>AR:</b> ${item.system.armor}<p>
      <b>Magic AR:</b> ${item.system.magic_ar}<p>
      <b>Qualities</b> ${item.system.qualities}`;
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: content,
    });
  }

  _onAmmoRoll(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    const contentString = `<h2 style='font-size: large;'>${item.name}</h2><p>
      <b>Damage Bonus:</b> ${item.system.damage}<p>
      <b>Qualities</b> ${item.system.qualities}`;

    if (item.system.quantity > 0) {
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content: contentString,
      });
    }

    item.system.quantity = item.system.quantity - 1;
    if (item.system.quantity < 0) {
      item.system.quantity = 0;
      ui.notifications.info("Out of Ammunition!");
    }
    item.update({ "system.quantity": item.system.quantity });
  }

  _onToggle2H(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.system.weapon2H === false) {
      item.system.weapon2H = true;
    } else if (item.system.weapon2H === true) {
      item.system.weapon2H = false;
    }
    item.update({ "system.weapon2H": item.system.weapon2H });
  }

  _onPlusQty(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.system.quantity = item.system.quantity + 1;

    item.update({ "system.quantity": item.system.quantity });
  }

  async _onMinusQty(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.system.quantity = item.system.quantity - 1;
    if (item.system.quantity <= 0) {
      item.system.quantity = 0;
      ui.notifications.info(`You have used your last ${item.name}!`);
    }

    await item.update({ "system.quantity": item.system.quantity });
  }

  _onItemEquip(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.system.equipped === false) {
      item.system.equipped = true;
    } else if (item.system.equipped === true) {
      item.system.equipped = false;
    }
    item.update({ "system.equipped": item.system.equipped });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const element = event.currentTarget;
    let itemData;

    if (element.id === "createSelect") {
      let d = new Dialog({
        title: "Create Item",
        content: `<div style="padding: 10px 0;">
                      <h2>Select an Item Type</h2>
                      <label>Create an item on this sheet</label>
                  </div>`,

        buttons: {
          one: {
            label: "Item",
            callback: async (html) => {
              const itemData = [{ name: "item", type: "item" }];
              let newItem = await this.actor.createEmbeddedDocuments(
                "Item",
                itemData
              );
              await newItem[0].sheet.render(true);
            },
          },
          two: {
            label: "Ammunition",
            callback: async (html) => {
              const itemData = [{ name: "ammunition", type: "ammunition" }];
              let newItem = await this.actor.createEmbeddedDocuments(
                "Item",
                itemData
              );
              await newItem[0].sheet.render(true);
            },
          },
          three: {
            label: "Armor",
            callback: async (html) => {
              const itemData = [{ name: "armor", type: "armor" }];
              let newItem = await this.actor.createEmbeddedDocuments(
                "Item",
                itemData
              );
              await newItem[0].sheet.render(true);
            },
          },
          four: {
            label: "Weapon",
            callback: async (html) => {
              const itemData = [{ name: "weapon", type: "weapon" }];
              let newItem = await this.actor.createEmbeddedDocuments(
                "Item",
                itemData
              );
              await newItem[0].sheet.render(true);
            },
          },
          five: {
            label: "Cancel",
            callback: (html) => console.log("Cancelled"),
          },
        },
        default: "one",
        close: (html) => console.log(),
      });

      d.render(true);
    } else {
      itemData = [
        {
          name: element.id,
          type: element.id,
        },
      ];

      let newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
      await newItem[0].sheet.render(true);
    }
  }

  async _onTalentRoll(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    let contentString = `<h2>${item.name}</h2><p>
    <i><b>${item.type}</b></i><p>
      <i>${item.system.description}</i>`;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      content: contentString,
    });
  }

  async _onWealthCalc(event) {
    event.preventDefault();

    let d = new Dialog({
      title: "Add/Subtract Wealth",
      content: `<form>
                <div class="dialogForm">
                <label><i class="fas fa-coins"></i><b> Add/Subtract: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
        two: {
          label: "Submit",
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());
            let wealth = this.actor.system.wealth;

            wealth = wealth + playerInput;
            this.actor.update({ "system.wealth": wealth });
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });
    d.render(true);
  }

  _createItemFilterOptions() {
    // Defensive guard: safe hasOwnProperty for price
    for (let item of this.actor.items.filter((i) =>
      i?.system && Object.prototype.hasOwnProperty.call(i.system, "price")
    )) {
      if (
        [...this.form.querySelectorAll("#itemFilter option")].some(
          (i) => i.innerHTML === item.type
        )
      ) {
        continue;
      } else {
        let option = document.createElement("option");
        option.innerHTML = item.type === "ammunition" ? "ammo" : item.type;
        option.value = item.type;
        this.form.querySelector("#itemFilter").append(option);
      }
    }
  }

  _filterItems(event) {
    event.preventDefault();
    let filterBy = event.currentTarget.value;

    for (let item of [
      ...this.form.querySelectorAll(".merchant-item-list tbody .item"),
    ]) {
      switch (filterBy) {
        case "All":
          item.classList.add("active");
          sessionStorage.setItem("savedMerchantFilter", filterBy);
          break;

        case `${filterBy}`:
          filterBy == item.dataset.itemType
            ? item.classList.add("active")
            : item.classList.remove("active");
          sessionStorage.setItem("savedMerchantFilter", filterBy);
          break;
      }
    }
  }

  _setDefaultItemFilter() {
    let filterBy = sessionStorage.getItem("savedMerchantItemFilter");

    if (filterBy !== null || filterBy !== undefined) {
      document.querySelector("#itemFilter").value = filterBy;
      for (let merchantItem of [
        ...document.querySelectorAll(".merchant-item-list tbody .item"),
      ]) {
        switch (filterBy) {
          case "All":
            merchantItem.classList.add("active");
            break;

          case `${filterBy}`:
            filterBy == merchantItem.dataset.itemType
              ? merchantItem.classList.add("active")
              : merchantItem.classList.remove("active");
            break;
        }
      }
    }
  }

_createStatusTags() {
  const actorSys = this.actor?.system || {};
  actorSys?.wounded
    ? this.form.querySelector("#wound-icon").classList.add("active")
    : this.form.querySelector("#wound-icon").classList.remove("active");
  // this.actor.system.carry_rating.current > this.actor.system.carry_rating.max ? this.form.querySelector('#enc-icon').classList.add('active') : this.form.querySelector('#enc-icon').classList[...]
  Number(actorSys?.fatigue?.level ?? 0) > 0
    ? this.form.querySelector("#fatigue-icon").classList.add("active")
    : this.form.querySelector("#fatigue-icon").classList.remove("active");
}
