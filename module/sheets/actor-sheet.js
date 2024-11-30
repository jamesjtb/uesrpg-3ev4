/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { isLucky } from "../helpers/skillCalcHelper.js";
import { isUnlucky } from "../helpers/skillCalcHelper.js";
import chooseBirthsignPenalty from "../dialogs/choose-birthsign-penalty.js";
import { characteristicAbbreviations } from "../maps/characteristics.js";
import renderErrorDialog from '../dialogs/error-dialog.js';
import coreRaces from "./racemenu/data/core-races.js";
import coreVariants from "./racemenu/data/core-variants.js";
import { renderRaceCards } from "./racemenu/render-race-cards.js";
import khajiitFurstocks from './racemenu/data/khajiit-furstocks.js';

export class SimpleActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor"],
      template: "systems/uesrpg-3ev4/templates/actor-sheet.html",
      width: 780,
      height: 860,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "description",
        },
      ],
      dragDrop: [
        {
          dragSelector: [
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
            ".equipmentList .item",
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

    data.actor.system.enrichedBio = await TextEditor.enrichHTML(data.actor.system.bio, { async: true });

    // Prepare Items
    if (this.actor.type === 'Player Character') {
      this._prepareCharacterItems(data);
    }

    return data;
  }

  _prepareCharacterItems(sheetData) {
    const actorData = sheetData.actor;

    //Initialize containers
    const gear = {
      equipped: [],
      unequipped: [],
    };
    const weapon = {
      equipped: [],
      unequipped: [],
    };
    const armor = {
      equipped: [],
      unequipped: [],
    };
    const power = [];
    const trait = [];
    const talent = [];
    const combatStyle = [];
    const spell = [];
    const skill = [];
    const magicSkill = [];
    const ammunition = {
      equipped: [],
      unequipped: [],
    };
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
        i.system.equipped ? gear.equipped.push(i) : gear.unequipped.push(i);
      }
      //Append to weapons
      else if (i.type === "weapon") {
        i.system.equipped ? weapon.equipped.push(i) : weapon.unequipped.push(i);
      }
      //Append to armor
      else if (i.type === "armor") {
        i.system.equipped ? armor.equipped.push(i) : armor.unequipped.push(i);
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
        i.system.equipped
          ? ammunition.equipped.push(i)
          : ammunition.unequipped.push(i);
      } else if (i.type === "language") {
        language.push(i);
      }
      //Append to faction
      else if (i.type === "faction") {
        faction.push(i);
      }
      //Append to container
      else if (i.type === "container") {
        container.push(i);
      }
    }

    // Alphabetically sort all item lists
    if (game.settings.get("uesrpg-3ev4", "sortAlpha")) {
      const itemCats = [
        gear.equipped,
        gear.unequipped,
        weapon.equipped,
        weapon.unequipped,
        armor.equipped,
        armor.unequipped,
        power,
        trait,
        talent,
        combatStyle,
        spell,
        skill,
        magicSkill,
        ammunition.equipped,
        ammunition.unequipped,
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
    actorData.container = container;
  }

  /* -------------------------------------------- */

  /** @override */
  async activateListeners(html) {
    super.activateListeners(html);

    // Rollable Buttons & Menus
    html
      .find(".characteristic-roll")
      .click(await this._onClickCharacteristic.bind(this));
    html.find(".skill-roll").click(await this._onSkillRoll.bind(this));
    html.find(".combat-roll").click(await this._onCombatRoll.bind(this));
    html.find(".magic-roll").click(await this._onSpellRoll.bind(this));
    html.find(".resistance-roll").click(this._onResistanceRoll.bind(this));
    html.find(".damage-roll").click(this._onDamageRoll.bind(this));
    html.find(".ammo-roll").click(await this._onAmmoRoll.bind(this));
    html.find(".item-img").click(await this._onTalentRoll.bind(this));
    html.find("#luckyMenu").click(this._onLuckyMenu.bind(this));
    html.find("#raceMenu").click(this._onRaceMenu.bind(this));
    html.find("#birthSignMenu").click(this._onBirthSignMenu.bind(this));
    html.find("#xpMenu").click(this._onXPMenu.bind(this));
    html.find(".rank-select").click(this._selectCombatRank.bind(this));

    //Update Item Attributes from Actor Sheet
    html.find(".toggle2H").click(await this._onToggle2H.bind(this));
    html.find(".plusQty").click(await this._onPlusQty.bind(this));
    html.find(".minusQty").contextmenu(await this._onMinusQty.bind(this));
    html.find(".itemEquip").click(await this._onItemEquip.bind(this));
    html.find(".wealthCalc").click(await this._onWealthCalc.bind(this));
    html
      .find(".setBaseCharacteristics")
      .click(await this._onSetBaseCharacteristics.bind(this));
    html.find(".carryBonus").click(await this._onCarryBonus.bind(this));
    html.find(".incrementResource").click(this._onIncrementResource.bind(this));
    html.find(".resourceLabel button").click(this._onResetResource.bind(this));
    html.find("#spellFilter").click(this._filterSpells.bind(this));
    html.find("#itemFilter").click(this._filterItems.bind(this));
    html.find(".incrementFatigue").click(this._incrementFatigue.bind(this));
    html.find(".equip-items").click(this._onEquipItems.bind(this));

    //Item Create Buttons
    html.find(".item-create").click(await this._onItemCreate.bind(this));

    // Checks for UI Elements on Sheets and Updates
    this._createSpellFilterOptions();
    this._createItemFilterOptions();
    this._setDefaultSpellFilter();
    this._setDefaultItemFilter();
    this._setResourceBars();
    this._createStatusTags();
    this._setDefaultCombatRank();

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
        // resets contained items status and then sets contained_items array to empty
        itemToDelete.system.contained_items.forEach((item) => {
          let sourceItem = this.actor.items.find((i) => i._id == item._id);
          sourceItem.update({
            "system.containerStats.container_id": "",
            "system.containerStats.container_name": "",
            "system.containerStats.contained": false,
          });
        });

        itemToDelete.update({ "system.contained_items": [] });
      }

      // Logic for removing container linking if deleted item is in a container
      if (
        itemToDelete.system.isPhysicalObject &&
        itemToDelete.type != "container" &&
        itemToDelete.system.containerStats.contained
      ) {
        let containerObject = this.actor.items.find(
          (item) => item._id == itemToDelete.system.containerStats.container_id
        );
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

      this.actor.deleteEmbeddedDocuments("Item", [li.dataset.itemId]);
    });
  }

  /**
   * Handle clickable rolls.
   * @param event   The originating click event
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

  async _onSetBaseCharacteristics(event) {
    event.preventDefault();
    const strBonusArray = [];
    const endBonusArray = [];
    const agiBonusArray = [];
    const intBonusArray = [];
    // Willpower is set as wpC (instead of just 'wp' because the item value only contains 2 initial letters vs. 3 for all others... an inconsistency that is easier to resolve this way)
    const wpCBonusArray = [];
    const prcBonusArray = [];
    const prsBonusArray = [];
    const lckBonusArray = [];

    const bonusItems = this.actor.items.filter((item) =>
      item.system.hasOwnProperty("characteristicBonus")
    );

    for (let item of bonusItems) {
      for (let key in item.system.characteristicBonus) {
        let itemBonus = item.system.characteristicBonus[key];
        if (itemBonus !== 0) {
          let itemButton = `<button style="width: auto;" onclick="getItem(this.id, this.dataset.actor)" id="${item.id
            }" data-actor="${item.actor.id}">${item.name} ${itemBonus >= 0 ? `+${itemBonus}` : itemBonus
            }</button>`;
          let bonusName = eval([...key].splice(0, 3).join("") + "BonusArray");
          bonusName.push(itemButton);
        }
      }
    }
    let d = new Dialog({
      title: "Set Base Characteristics",
      content: `<form>
                    <script>
                      function getItem(itemID, actorID) {
                          let actor = game.actors.find(actor => actor.id === actorID)
                          let tokenActor = game.scenes.find(scene => scene.active === true)?.tokens?.find(token => token.actorId === actorID)
                          if (!tokenActor?.actorLink) {
                            let actorBonusItems = actor.items.filter(item => item.system.hasOwnProperty('characteristicBonus'))
                            let item = actorBonusItems.find(i => i.id === itemID)
                            item.sheet.render(true)
                          }
                          else {
                            let tokenBonusItems = tokenActor._actor.items.filter(item => item.system.hasOwnProperty('characteristicBonus'))
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
                      <label><b>Points Total (without Luck): </b></label>
                      <label>
                      ${this.actor.system.characteristics.str.base +
        this.actor.system.characteristics.end.base +
        this.actor.system.characteristics.agi.base +
        this.actor.system.characteristics.int.base +
        this.actor.system.characteristics.wp.base +
        this.actor.system.characteristics.prc.base +
        this.actor.system.characteristics.prs.base
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
                          <td><input type="number" id="strInput" value="${this.actor.system.characteristics.str.base
        }"></td>
                          <td><input type="number" id="endInput" value="${this.actor.system.characteristics.end.base
        }"></td>
                          <td><input type="number" id="agiInput" value="${this.actor.system.characteristics.agi.base
        }"></td>
                          <td><input type="number" id="intInput" value="${this.actor.system.characteristics.int.base
        }"></td>
                          <td><input type="number" id="wpInput" value="${this.actor.system.characteristics.wp.base
        }"></td>
                          <td><input type="number" id="prcInput" value="${this.actor.system.characteristics.prc.base
        }"></td>
                          <td><input type="number" id="prsInput" value="${this.actor.system.characteristics.prs.base
        }"></td>
                          <td><input type="number" id="lckInput" value="${this.actor.system.characteristics.lck.base
        }"></td>
                        </tr>
                      </table>
                    </div>

                    <div class="modifierBox">
                      <h2>STR Modifiers</h2>
                      <span style="font-size: small">${strBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>END Modifiers</h2>
                      <span style="font-size: small">${endBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>AGI Modifiers</h2>
                      <span style="font-size: small">${agiBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>INT Modifiers</h2>
                      <span style="font-size: small">${intBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>WP Modifiers</h2>
                      <span style="font-size: small">${wpCBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>PRC Modifiers</h2>
                      <span style="font-size: small">${prcBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>PRS Modifiers</h2>
                      <span style="font-size: small">${prsBonusArray.join(
          ""
        )}</span>
                    </div>

                    <div class="modifierBox">
                      <h2>LCK Modifiers</h2>
                      <span style="font-size: small">${lckBonusArray.join(
          ""
        )}</span>
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
            const chaPath = this.actor.system.characteristics;

            //Assign values to characteristics
            chaPath.str.base = strInput;
            chaPath.str.total = strInput + chaPath.str.bonus;

            chaPath.end.base = endInput;
            chaPath.end.total = endInput + chaPath.end.bonus;

            chaPath.agi.base = agiInput;
            chaPath.agi.total = agiInput + chaPath.agi.bonus;

            chaPath.int.base = intInput;
            chaPath.int.total = intInput + chaPath.int.bonus;

            chaPath.wp.base = wpInput;
            chaPath.wp.total = wpInput + chaPath.wp.bonus;

            chaPath.prc.base = prcInput;
            chaPath.prc.total = prcInput + chaPath.prc.bonus;

            chaPath.prs.base = prsInput;
            chaPath.prs.total = prsInput + chaPath.prs.bonus;

            chaPath.lck.base = lckInput;
            chaPath.lck.total = lckInput + chaPath.lck.bonus;

            await this.actor.update({
              system: {
                characteristics: {
                  str: { base: strInput, total: chaPath.str.total },
                  end: { base: endInput, total: chaPath.end.total },
                  agi: { base: agiInput, total: chaPath.agi.total },
                  int: { base: intInput, total: chaPath.int.total },
                  wp: { base: wpInput, total: chaPath.wp.total },
                  prc: { base: prcInput, total: chaPath.prc.total },
                  prs: { base: prsInput, total: chaPath.prs.total },
                  lck: { base: lckInput, total: chaPath.lck.total },
                },
              },
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

  async _onClickCharacteristic(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const woundedValue =
      this.actor.system.characteristics[element.id].total +
      this.actor.system.woundPenalty +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty;
    const regularValue =
      this.actor.system.characteristics[element.id].total +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty;
    let tags = [];
    if (this.actor.system.wounded) {
      tags.push(
        `<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`
      );
    }
    if (this.actor.system.fatigue.penalty != 0) {
      tags.push(
        `<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`
      );
    }
    if (this.actor.system.carry_rating.penalty != 0) {
      tags.push(
        `<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`
      );
    }

    // Dialog Menu
    let d = new Dialog({
      title: "Apply Roll Modifier",
      content: `<form>
                  <div class="dialogForm">
                  <label><b>${element.getAttribute(
        "name"
      )} Modifier: </b></label><input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                </form>`,
      buttons: {
        one: {
          label: "Roll!",
          callback: async (html) => {
            const playerInput = parseInt(html.find('[id="playerInput"]').val());

            let contentString = "";
            let roll = new Roll("1d100");
            await roll.evaluate();

            if (this.actor.system.wounded == true) {
              if (isLucky(this.actor, roll.result)) {
                contentString = `<h2>${element.getAttribute("name")}</h2
          <p></p><b>Target Number: [[${woundedValue + playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
              } else if (isUnlucky(this.actor, roll.result)) {
                contentString = `<h2>${element.getAttribute("name")}</h2
          <p></p><b>Target Number: [[${woundedValue + playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
              } else {
                contentString = `<h2>${element.getAttribute("name")}</h2
          <p></p><b>Target Number: [[${woundedValue + playerInput}]]</b> <p></p>
          <b>Result: [[${roll.result}]]</b><p></p>
          <b>${roll.total <= woundedValue + playerInput
                    ? "<span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                    : " <span style='color:rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                  }`;
              }
            } else {
              if (isLucky(this.actor, roll.result)) {
                contentString = `<h2>${element.getAttribute("name")}</h2
        <p></p><b>Target Number: [[${regularValue + playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
              } else if (isUnlucky(this.actor, roll.result)) {
                contentString = `<h2>${element.getAttribute("name")}</h2
        <p></p><b>Target Number: [[${regularValue + playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
              } else {
                contentString = `<h2>${element.getAttribute("name")}</h2
        <p></p><b>Target Number: [[${regularValue + playerInput}]]</b> <p></p>
        <b>Result: [[${roll.result}]]</b><p></p>
        <b>${roll.total <= regularValue + playerInput
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

  async _onSkillRoll(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const li = button.closest(".item");
    const item = this.actor.items.get(li?.dataset.itemId);

    const woundedValue =
      item.system.value +
      this.actor.system.woundPenalty +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty;
    const regularValue =
      item.system.value +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty;
    let tags = [];
    if (this.actor.system.wounded) {
      tags.push(
        `<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`
      );
    }
    if (this.actor.system.fatigue.penalty != 0) {
      tags.push(
        `<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`
      );
    }
    if (this.actor.system.carry_rating.penalty != 0) {
      tags.push(
        `<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`
      );
    }

    // Skill Roll Dialog Menu
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
            await roll.evaluate();

            if (isLucky(this.actor, roll.result)) {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${regularValue} + ${playerInput} + ${this.actor.system.wounded ? this.actor.system.woundPenalty : 0
                }]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (isUnlucky(this.actor, roll.result)) {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${regularValue} + ${playerInput} + ${this.actor.system.wounded ? this.actor.system.woundPenalty : 0
                }]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else if (this.actor.system.wounded === true) {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${woundedValue + playerInput
                }]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total <= woundedValue + playerInput
                  ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                  : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                }`;
            } else {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${regularValue + playerInput
                }]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total <= regularValue + playerInput
                  ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                  : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
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
                                <img src="${spellToCast.img
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
                system: {
                  magicka: {
                    value: this.actor.system.magicka.value - displayCost,
                  },
                },
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

  async _onCombatRoll(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));
    const woundedValue =
      item.system.value +
      this.actor.system.woundPenalty +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty;
    const regularValue =
      item.system.value +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty;
    let tags = [];
    if (this.actor.system.wounded) {
      tags.push(
        `<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`
      );
    }
    if (this.actor.system.fatigue.penalty != 0) {
      tags.push(
        `<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`
      );
    }
    if (this.actor.system.carry_rating.penalty != 0) {
      tags.push(
        `<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`
      );
    }

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
            await roll.evaluate();
            let contentString = "";

            if (isLucky(this.actor, roll.result)) {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${regularValue} + ${playerInput} + ${this.actor.system.wounded ? this.actor.system.woundPenalty : 0
                }]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (isUnlucky(this.actor, roll.result)) {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${regularValue} + ${playerInput} + ${this.actor.system.wounded ? this.actor.system.woundPenalty : 0
                }]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else if (this.actor.system.wounded === true) {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${woundedValue} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total <= woundedValue + playerInput
                  ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                  : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                }`;
            } else {
              contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
            <p></p><b>Target Number: [[${regularValue} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total <= regularValue + playerInput
                  ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                  : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
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

  async _onResistanceRoll(event) {
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

            let roll = new Roll("1d100");
            roll.evaluate();
            let contentString = "";

            if (isLucky(this.actor, roll.result)) {
              contentString = `<h2>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.system.resistance[element.id]
                } + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>`;
            } else if (isLucky(this.actor, roll.result)) {
              contentString = `<h2>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.system.resistance[element.id]
                } + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h2>${element.name} Resistance</h2>
            <p></p><b>Target Number: [[${this.actor.system.resistance[element.id]
                } + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.result}]]</b><p></p>
            <b>${roll.total <=
                  this.actor.system.resistance[element.id] + playerInput
                  ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                  : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
                }`;
            }
            await roll.toMessage({
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

  async _onDamageRoll(event) {
    event.preventDefault();
    let itemElement = event.currentTarget.closest(".item");
    let shortcutWeapon = this.actor.getEmbeddedDocument(
      "Item",
      itemElement.dataset.itemId
    );

    let hit_loc = "";
    let hit = new Roll("1d10");
    await hit.evaluate();

    switch (hit.result) {
      case "1":
        hit_loc = "Body";
        break;

      case "2":
        hit_loc = "Body";
        break;

      case "3":
        hit_loc = "Body";
        break;

      case "4":
        hit_loc = "Body";
        break;

      case "5":
        hit_loc = "Body";
        break;

      case "6":
        hit_loc = "Right Leg";
        break;

      case "7":
        hit_loc = "Left Leg";
        break;

      case "8":
        hit_loc = "Right Arm";
        break;

      case "9":
        hit_loc = "Left Arm";
        break;

      case "10":
        hit_loc = "Head";
        break;
    }

    let damageString;
    shortcutWeapon.system.weapon2H
      ? (damageString = shortcutWeapon.system.damage2)
      : (damageString = shortcutWeapon.system.damage);
    let weaponRoll = new Roll(damageString);
    await weaponRoll.evaluate();

    // Superior Weapon Roll
    let supRollTag = ``;
    let superiorRoll = new Roll(damageString);
    await superiorRoll.evaluate();

    if (shortcutWeapon.system.superior) {
      supRollTag = `[[${superiorRoll.result}]]`;
    }

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
                                          <td class="tableCenterText">[[${weaponRoll.result}]] ${supRollTag}</td>
                                          <td class="tableCenterText">${damageString}</td>
                                      </tr>
                                      <tr>
                                          <td class="tableAttribute">Hit Location</td>
                                          <td class="tableCenterText">${hit_loc}</td>
                                          <td class="tableCenterText">[[${hit.result}]]</td>
                                      </tr>
                                      <tr>
                                          <td class="tableAttribute">Qualities</td>
                                          <td class="tableCenterText" colspan="2">${shortcutWeapon.system.qualities}</td>
                                      </tr>
                                  </tbody>
                              </table>
                          <div>`;

    // tags for flavor on chat message
    let tags = [];

    if (shortcutWeapon.system.superior) {
      let tagEntry = `<span style="border: none; border-radius: 30px; background-color: rgba(29, 97, 187, 0.80); color: white; text-align: center; font-size: xx-small; padding: 5px;" title="Damage was rolled twice and output was highest of the two">Superior</span>`;
      tags.push(tagEntry);
    }

    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      flavor: tags.join(""),
      content: contentString,
      roll: weaponRoll,
    });
  }

  async _onAmmoRoll(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    const contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
      <b>Damage Bonus:</b> ${item.system.damage}<p>
      <b>Qualities</b> ${item.system.qualities}`;

    if (item.system.quantity > 0) {
      await ChatMessage.create({
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

    await item.update({ system: { quantity: item.system.quantity } });
  }

  async _onToggle2H(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.update({ "system.weapon2H": !item.system.weapon2H });
  }

  async _onPlusQty(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    item.system.quantity = item.system.quantity + 1;
    await item.update({ "system.quantity": item.system.quantity });
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

  async _onItemEquip(event) {
    let toggle = $(event.currentTarget);
    const li = toggle.closest(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));
    console.log(item)
    if (item.system.equipped === false) {
      item.update({ "system.equipped": true });
    } else if (item.system.equipped === true) {
      item.update({ "system.equipped": false });
    }
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const element = event.currentTarget;
    let itemData = [
      { name: element.id, type: element.id, "system.baseCha": "str" },
    ];

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
      if (element.id === "combatStyle") {

        itemData = [
          {
            name: 'Combat Style Name',
            type: element.id,
            img: 'systems/uesrpg-3ev4/images/Icons/backToBack.webp',
            "system.governingCha": "Str, Agi",
            "system.baseCha":
              this.actor.system.characteristics.str.total >=
                this.actor.system.characteristics.agi.total
                ? "str"
                : "agi",
          },
        ];
      }

      if (element.id === "magicSkill") {
        itemData = [
          {
            name: "Magic School Name",
            type: element.id,
            img: 'systems/uesrpg-3ev4/images/spell-compendium/mysticism_spellbook.webp',
            "system.governingCha": "Wp",
            "system.baseCha":
              this.actor.system.characteristics.int.total >=
                this.actor.system.characteristics.wp.total
                ? "wp"
                : "int",
          },
        ];
      }

      let newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
      await newItem[0].sheet.render(true);
    }
  }

  async _onTalentRoll(event) {
    event.preventDefault();
    let button = $(event.currentTarget);
    const li = button.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    let contentString = `<h2><img src="${item.img}"</img>${item.name}</h2>
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
                  <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
                    <label><i class="fas fa-coins"></i><b> Add/Subtract: </b></label>
                    <input placeholder="ex. -20, +10" id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                  </div>
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

  async _onCarryBonus(event) {
    event.preventDefault();

    let d = new Dialog({
      title: "Carry Rating Bonus",
      content: `<form>
                  <div class="dialogForm">
                    <div style="margin: 5px; display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
                      <label><b>Current Carry Rating Bonus: </b></label>
                      <label style=" text-align: center; float: right; width: 50%;">${this.actor.system.carry_rating.bonus}</label>
                    </div>

                    <div style="margin: 5px; display: flex; flex-direction: row; justify-content: space-between; align-items: center;">
                      <label><b> Set Carry Weight Bonus:</b></label>
                      <input placeholder="10, -10, etc." id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text"></input></div>
                    </div>

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
            this.actor.system.carry_rating.bonus = playerInput;
            this.actor.update({
              "system.carry_rating.bonus": this.actor.system.carry_rating.bonus,
            });
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });
    d.render(true);
  }

  _onLuckyMenu(event) {
    event.preventDefault();
    let d;

    if (
      this.actor.items.filter(
        (item) =>
          item.type === "trait" &&
          (item.name === "The Thief" || item.name === "The Star-Cursed Thief")
      ).length > 0
    ) {
      d = new Dialog({
        title: "Lucky & Unlucky Numbers",
        content: `<form style="padding: 10px">
                      <div style="background: rgba(180, 180, 180, 0.562); border: solid 1px; padding: 10px; font-style: italic;">
                          Input your character's lucky and unlucky numbers and click submit to register them. You can change them at any point.
                      </div>

                      <div>
                        <h2 style="text-align: center;">
                          Lucky Numbers
                        </h2>
                        <div style="display: flex; justify-content: space-around; align-items: center; text-align: center;">
                            <input class="luckyNum" id="ln1" type="number" value="${this.actor.system.lucky_numbers.ln1}">
                            <input class="luckyNum" id="ln2" type="number" value="${this.actor.system.lucky_numbers.ln2}">
                            <input class="luckyNum" id="ln3" type="number" value="${this.actor.system.lucky_numbers.ln3}">
                            <input class="luckyNum" id="ln4" type="number" value="${this.actor.system.lucky_numbers.ln4}">
                            <input class="luckyNum" id="ln5" type="number" value="${this.actor.system.lucky_numbers.ln5}">
                            <input class="luckyNum thiefNum" id="ln6" type="number" value="${this.actor.system.lucky_numbers.ln6}">
                        </div>
                      </div>

                      <div>
                        <h2 style="text-align: center;">
                          Unlucky Numbers
                        </h2>
                        <div style="display: flex; justify-content: space-around; align-items: center; text-align: center;">
                            <input class="unluckyNum" id="ul1" type="number" value="${this.actor.system.unlucky_numbers.ul1}">
                            <input class="unluckyNum" id="ul2" type="number" value="${this.actor.system.unlucky_numbers.ul2}">
                            <input class="unluckyNum" id="ul3" type="number" value="${this.actor.system.unlucky_numbers.ul3}">
                            <input class="unluckyNum" id="ul4" type="number" value="${this.actor.system.unlucky_numbers.ul4}">
                            <input class="unluckyNum" id="ul5" type="number" value="${this.actor.system.unlucky_numbers.ul5}">
                        </div>
                      </div>
                    </form>`,
        buttons: {
          one: {
            label: "Cancel",
            callback: (html) => console.log("Cancelled"),
          },
          two: {
            label: "Submit",
            callback: (html) => {
              // Create input arrays
              const luckyNums = [...document.querySelectorAll(".luckyNum")];
              const unluckyNums = [...document.querySelectorAll(".unluckyNum")];

              // Assign input values to appropriate actor fields
              for (let num of luckyNums) {
                let numPath = `system.lucky_numbers.${num.id}`;
                this.actor.update({ [numPath]: Number(num.value) });
              }

              for (let num of unluckyNums) {
                let numPath = `system.unlucky_numbers.${num.id}`;
                this.actor.update({ [numPath]: Number(num.value) });
              }
            },
          },
        },
        default: "two",
        close: (html) => console.log(),
      });
    } else {
      d = new Dialog({
        title: "Lucky & Unlucky Numbers",
        content: `<form style="padding: 10px">
                    <div style="background: rgba(180, 180, 180, 0.562); border: solid 1px; padding: 10px; font-style: italic;">
                        Input your character's lucky and unlucky numbers and click submit to register them. You can change them at any point.
                    </div>

                    <div>
                      <h2 style="text-align: center;">
                        Lucky Numbers
                      </h2>
                      <div style="display: flex; justify-content: space-around; align-items: center; text-align: center;">
                          <input class="luckyNum" id="ln1" type="number" value=${this.actor.system.lucky_numbers.ln1}>
                          <input class="luckyNum" id="ln2" type="number" value=${this.actor.system.lucky_numbers.ln2}>
                          <input class="luckyNum" id="ln3" type="number" value=${this.actor.system.lucky_numbers.ln3}>
                          <input class="luckyNum" id="ln4" type="number" value=${this.actor.system.lucky_numbers.ln4}>
                          <input class="luckyNum" id="ln5" type="number" value=${this.actor.system.lucky_numbers.ln5}>
                      </div>
                    </div>

                    <div>
                      <h2 style="text-align: center;">
                        Unlucky Numbers
                      </h2>
                      <div style="display: flex; justify-content: space-around; align-items: center; text-align: center;">
                          <input class="unluckyNum" id="ul1" type="number" value=${this.actor.system.unlucky_numbers.ul1}>
                          <input class="unluckyNum" id="ul2" type="number" value=${this.actor.system.unlucky_numbers.ul2}>
                          <input class="unluckyNum" id="ul3" type="number" value=${this.actor.system.unlucky_numbers.ul3}>
                          <input class="unluckyNum" id="ul4" type="number" value=${this.actor.system.unlucky_numbers.ul4}>
                          <input class="unluckyNum" id="ul5" type="number" value=${this.actor.system.unlucky_numbers.ul5}>
                      </div>
                    </div>
                  </form>`,
        buttons: {
          one: {
            label: "Cancel",
            callback: (html) => console.log("Cancelled"),
          },
          two: {
            label: "Submit",
            callback: (html) => {
              // Create input arrays
              const luckyNums = [...document.querySelectorAll(".luckyNum")];
              const unluckyNums = [...document.querySelectorAll(".unluckyNum")];

              // Assign input values to appropriate actor fields
              for (let num of luckyNums) {
                let numPath = `system.lucky_numbers.${num.id}`;
                this.actor.update({ [numPath]: Number(num.value) });
              }

              for (let num of unluckyNums) {
                let numPath = `system.unlucky_numbers.${num.id}`;
                this.actor.update({ [numPath]: Number(num.value) });
              }
            },
          },
        },
        default: "two",
        close: (html) => console.log(),
      });
    }
    d.render(true);
  }

  _onRaceMenu(event) {
    event.preventDefault();

    const coreRaceCards = renderRaceCards(coreRaces);
    const variantRaceCards = renderRaceCards(coreVariants);
    const khajiitFurstockRaceCards = renderRaceCards(khajiitFurstocks);

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
                      <img src="systems/uesrpg-3ev4/images/Races_Oblivion.webp" title="Races of Elder Scrolls" style="border: none;">
                  </div>

                  <div style="height: 500px; overflow-y: scroll;">
                      <h1 style="padding-top: 10px;">Core Races</h1>
                      <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-content: center; width: 100%;">
                        ${coreRaceCards.join("")}
                      </div>
                      <h1 style="padding-top: 10px;">Core Race Variants</h1>
                      <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-content: center; width: 100%;">
                        ${variantRaceCards.join("")}
                      </div>
                      <h1 style="padding-top: 10px;">Khajiit Furstocks</h1>
                      <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-content: center; width: 100%;">
                        ${khajiitFurstockRaceCards.join("")}
                      </div>
                  </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
        two: {
          label: "Submit",
          callback: async (html) => {
            // Check for a selection, or show error instead
            let raceSelection = [
              ...document.querySelectorAll(".raceSelect"),
            ].filter((i) => i.checked);
            let customRaceLabel = document.querySelector("#customRace").value;

            if (raceSelection.length < 1 && customRaceLabel === "") {
              ui.notifications.error(
                "Please select a race or input a custom race label"
              );
            }

            // Logic for setting Race Name and Other factors
            else {
              let raceName;

              const races = { ...coreRaces, ...coreVariants, ...khajiitFurstocks };

              if (customRaceLabel !== "") {
                raceName = customRaceLabel;
              } else {
                raceName = raceSelection[0].id;
                let selectedRace = races[raceName];

                // Loop through and update actor base characteristics with race object baselines
                for (let value in this.actor.system.characteristics) {
                  let baseChaPath = `system.characteristics.${value}.base`;
                  let totalChaPath = `system.characteristics.${value}.total`;
                  this.actor.update({
                    [baseChaPath]: selectedRace.baseline[value],
                    [totalChaPath]:
                      selectedRace.baseline[value] +
                      this.actor.system.characteristics[value].bonus,
                  });
                }

                // Loop through and add Racial items to the actor sheet
                for (let item of selectedRace.items) {
                  const itemData = {
                    name: item.name,
                    type: item.type,
                    img: item.img,
                    "system.description": item.desc,
                    [item.dataPath]: item.value,
                    [item.dataPath2]: item.qualities,
                  };

                  // Create the item
                  let created = await Item.create(itemData, {
                    parent: this.actor,
                  });
                  if (item.type === "weapon") {
                    created.sheet.render(true);
                  }
                }
              }
              // Update Actor with Race Label
              this.actor.update({ "system.race": raceName });
            }
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });

    d.position.width = 600;
    d.position.height = 775;
    d.render(true);
  }

  _onBirthSignMenu(event) {
    event.preventDefault();

    let signCards = [];
    const imgPath = "systems/uesrpg-3ev4/images";
    const signs = {
      apprentice: {
        name: "Apprentice",
        img: `${imgPath}/sign-apprentice.webp`,
        description: `The Apprentice’s Season is Sun’s Height. Those born under the sign of the apprentice have a special
                      affinity for magick of all kinds, but are more vulnerable to magick as well.`,
        traits: [
          "Power Well (25) and Weakness (Magic, 2)",
          "Star-Cursed Apprentice: Gain Power Well (50) instead, and also gain Weakness(Magic, 3)",
        ],
        items: ["The Apprentice"],
        starCursed: ["The Star-Cursed Apprentice"],
      },
      atronach: {
        name: "Atronach",
        img: `${imgPath}/sign-atronach.webp`,
        description: `The Atronach (often called the Golem) is one of the Mage’s Charges. Its season is Sun’s Dusk.
                      Those born under this sign are natural sorcerers with deep reserves of magicka, but they cannot
                      generate magicka of their own.`,
        traits: [
          "Power Well (50)",
          "Spell Absorption (5)",
          "Stunted Magicka: Cannot naturally regenerate Magicka",
          "Star-Cursed Atronach: As above, but gain Power Well (75) instead and -5 to either Agility OR Endurance",
        ],
        items: ["The Atronach", "Spell Absorption (5)", "Stunted Magicka"],
        starCursed: [
          "The Star-Cursed Atronach",
          "Spell Absorption (5)",
          "Stunted Magicka",
        ],
        starCursedChoices: {
          attributes: ["agility", "endurance"],
          modifier: -5,
        }
      },
      lady: {
        name: "Lady",
        img: `${imgPath}/sign-lady.webp`,
        description: `The Lady is one of the Warrior's Charges and her Season is Hearthfire. Those born under the sign
                      of the Lady are kind and tolerant.`,
        traits: [
          "+5 Personality",
          "Star Cursed Lady: As above, but also gain +5 Endurance and -5 Strength",
        ],
        items: ["The Lady"],
        starCursed: ["The Star-Cursed Lady"],
      },
      lord: {
        name: "Lord",
        img: `${imgPath}/sign-lord.webp`,
        description: `The Lord’s Season is First Seed and he oversees all of Tamriel during the planting. Those born under the sign
                      of the Lord are stronger and healthier than those born under other signs.`,
        traits: [
          "Healing Rate is doubled",
          "Star-Cursed Lord: As above, but also gain +5 Endurance and Weakness (Fire, 2)",
        ],
        items: ["The Lord"],
        starCursed: ["The Star-Cursed Lord"],
      },
      lover: {
        name: "Lover",
        img: `${imgPath}/sign-lover.webp`,
        description: `The Lover is one of the Thief ’s Charges and her season is Sun’s Dawn. Those born under the sign of the Lover are graceful and passionate.`,
        traits: [
          "+5 Agility",
          "Star-Cursed Lover: As above, but also gain +5 Personality and -5 Willpower OR Strength",
        ],
        items: ["The Lover"],
        starCursed: ["The Star-Cursed Lover"],
        starCursedChoices: {
          attributes: ["willpower", "strength"],
          modifier: -5,
        },
      },
      mage: {
        name: "Mage",
        img: `${imgPath}/sign-mage.webp`,
        description: `The Mage is a Guardian Constellation whose Season is Rain’s Hand when magicka was first used by men.
                      His Charges are the Apprentice, the Golem, and the Ritual. Those born under the Mage have more magicka
                      and talent for all kinds of spellcasting, but are often arrogant and absent-minded.`,
        traits: [
          "Power Well (10)",
          "Star-Cursed Mage: Gain Power Well (25) instead and one of the following (your choice) receives -5 (Perception, Strength, or Personality)",
        ],
        items: ["The Mage"],
        starCursed: ["The Star-Cursed Mage"],
        starCursedChoices: {
          attributes: ["perception", "strength", "personality"],
          modifier: -5,
        },
      },
      ritual: {
        name: "Ritual",
        img: `${imgPath}/sign-ritual.webp`,
        description: `The Ritual is one of the Mage’s Charges and its Season is Morning Star. Those born under this sign have
                      a variety of abilities depending on the aspects of the moons and the Divines.`,
        traits: [
          "At the start of each day, select a Power to gain until the start of the next day, where you can choose again.",
          "Blessed Touch OR Blessed Word OR Mara's Gift",
          "Star-Cursed Ritual: Gain all three powers permanently but receive -5 Luck",
        ],
        items: ["The Ritual", "Blessed Touch", "Blessed Word", "Mara's Gift"],
        starCursed: [
          "The Star-Cursed Ritual",
          "Blessed Touch",
          "Blessed Word",
          "Mara's Gift",
        ],
      },
      shadow: {
        name: "Shadow",
        img: `${imgPath}/sign-shadow.webp`,
        description: `The Shadow’s Season is Second Seed. The Shadow grants those born under her sign the ability to hide in shadows.`,
        traits: [
          "Moonshadow Power: See Powers section of the Rules Compendium",
          "Star-Cursed Shadow: As Above, but also gain +5 Perception and -5 Personality OR Strength",
        ],
        items: ["The Shadow", "Moonshadow"],
        starCursed: ["The Star-Cursed Shadow", "Moonshadow"],
        starCursedChoices: {
          attributes: ["personality", "strength"],
          modifier: -5,
        },
      },
      steed: {
        name: "Steed",
        img: `${imgPath}/sign-steed.webp`,
        description: `The Steed is one of the Warrior’s Charges, and her Season is Mid Year. Those born under the sign of the Steed are impatient and
                      always hurrying from one place to another.”`,
        traits: [
          "+2 Speed",
          "Star-Cursed Steed: As above, but also gain +5 Agility and -5 Willpower OR Perception",
        ],
        items: ["The Steed"],
        starCursed: ["The Star-Cursed Steed"],
        starCursedChoices: {
          attributes: ["willpower", "perception"],
          modifier: -5,
        },
      },
      thief: {
        name: "Thief",
        img: `${imgPath}/sign-thief.webp`,
        description: `The Thief is the last Guardian Constellation, and her Season is the darkest month of Evening Star. Her Charges are the Lover,
                      the Shadow, and the Tower. Those born under the sign of the Thief are not typically thieves, though they take risks more often
                      and only rarely come to harm.`,
        traits: [
          "Roll an extra Lucky Number that cannot be lost, regardless of Luck Score",
          "Star-Cursed Thief: As above, but replace their rolled Luck Score with 50, gain the Akiviri Danger Sense Power, and the Running Out of Luck trait.",
        ],
        items: ["The Thief"],
        starCursed: [
          "The Star-Cursed Thief",
          "Akaviri Danger-Sense",
          "Running Out of Luck",
        ],
      },
      tower: {
        name: "Tower",
        img: `${imgPath}/sign-tower.webp`,
        description: `The Tower is one of the Thief ’s Charges and its Season is Frostfall. Those born under the sign of the Tower have a knack for finding gold
                      and can open locks of all kinds.`,
        traits: [
          "Treasure Seeker: See Powers section in the Rules Compendium",
          "+5 Perception",
          "Star-Cursed Tower: As above, but also gain +5 Agility and -5 Willpower OR Strength",
        ],
        items: ["The Tower", "Treasure Seeker"],
        starCursed: ["The Star-Cursed Tower", "Treasure Seeker"],
        starCursedChoices: {
          attributes: ["willpower", "strength"],
          modifier: -5,
        },
      },
      warrior: {
        name: "Warrior",
        img: `${imgPath}/sign-warrior.webp`,
        description: `The Warrior is the first Guardian Constellation and he protects his charges during their Seasons.
                      The Warrior’s own season is Last Seed when his Strength is needed for the harvest. His Charges are
                      the Lady, the Steed, and the Lord. Those born under the sign of the Warrior are skilled with weapons
                      of all kinds, but prone to short tempers.`,
        traits: [
          "Increase Stamina Point Maximum by +1",
          "Star-Cursed Warrior: As above but also +5 Strength and -5 Willpower",
        ],
        items: ["The Warrior"],
        starCursed: ["The Star-Cursed Warrior"],
      },
    };

    // Create sign cards
    for (let sign in signs) {
      const signObject = signs[sign];

      // Create trait list items
      let traitListItems = [];
      for (let trait of signObject.traits) {
        const traitItem = `<li>${trait}</li>`;
        traitListItems.push(traitItem);
      }

      const card =
        `<div style="display: flex; flex-direction: column; justify-content: flex-start; align-items: center; width: 49%; height: 510px; border: 1px solid; padding: 5px;">
          <div>
            <img src="${signObject.img}" alt="${sign.name}" width="175" height="175">
          </div>
          <h2 style="text-align: center;">${signObject.name}</h2>
          <div style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; border-bottom: 1px solid; border-top: 1px solid; width: 100%;">
            <div style="display: flex; flex-direction: row; align-items: center;">
              <input type="checkbox" id="${signObject.name
        }" class="signSelect">
              <div>${signObject.name}</div>
            </div>

            <div>OR</div>

            <div style="display: flex; flex-direction: row; align-items: center;">
                <div>Star-Cursed</div>
                <input type="checkbox" id="${signObject.name
        }" class="signSelect cursedSelect">
            </div>
          </div>
          <div style="padding: 10px 0 0 0;">
              ${signObject.description}
          </div>
          <div>
              <ul>
                  ${traitListItems.join("")}
              </ul>
          </div>
      </div>`;

      signCards.push(card);
    }

    let d = new Dialog({
      title: "Birthsign Menu",
      content: `<form style="padding: 10px 0;">
                    <div>
                        <div style="border: 1px solid; background: rgba(85, 85, 85, 0.40); font-style:italic; padding: 5px; text-align: center;">
                            Select a birthsign or roll to select using the rules from the Core Rulebook. Alternatively, you may enter in a custom birthsign label below:
                            <div>
                                <input type="text" id="customSign" style="width: 200px;">
                            </div>
                        </div>

                        <div style="height: 500px; overflow-y: scroll;">
                            <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-items: center; width: 100%;">
                                ${signCards.join("")}
                            </div>
                        </div>
                    </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
        two: {
          label: "Submit",
          callback: async (html) => {
            // Check for a selection, or show error instead
            let signSelection = [
              ...document.querySelectorAll(".signSelect"),
            ].filter((i) => i.checked);
            let starCursedSelection = [
              ...document.querySelectorAll(".cursedSelect"),
            ].filter((i) => i.checked);
            let customSignLabel = document.querySelector("#customSign").value;

            if (signSelection.length < 1 && customSignLabel === "") {
              ui.notifications.error(
                "Please select a race or input a custom race label"
              );
            }

            // Assign selected sign to actor object
            else {
              if (customSignLabel === "") {
                const signObject = signs[signSelection[0].id.toLowerCase()];
                this.actor.update({ "system.birthsign": signObject.name });

                // Loop through selected Sign Object  and add items from compendium
                const signCompendium = await game.packs
                  .get("uesrpg-3ev4.signs")
                  .getDocuments();

                if (starCursedSelection.length > 0) {
                  for (let item of signObject.starCursed) {
                    let docItem = signCompendium.find((i) => i.name === item);
                    const newDocItem = docItem.toObject();
                    if (signObject.starCursedChoices && docItem.name.includes('Star-Cursed')) {
                      const penaltyAttribute = await chooseBirthsignPenalty(signObject.starCursedChoices.attributes, signObject.starCursedChoices.modifier);
                      if (!penaltyAttribute) {
                        renderErrorDialog(`Choosing a penalty is required for the ${signObject.name} birthsign. Please try again.`);
                        this.actor.update({ "system.birthsign": "" });
                        return;
                      }
                      const penalty = signObject.starCursedChoices.modifier;
                      const chaAbbreviation = characteristicAbbreviations[penaltyAttribute];
                      newDocItem.system.characteristicBonus[`${chaAbbreviation}ChaBonus`] = penalty;
                    }
                    newDocItem.system.source = `The Star-Cursed ${signObject.name}`;
                    Item.create(newDocItem, { parent: this.actor });
                  }
                } else if (signSelection.length > 0) {
                  for (let item of signObject.items) {
                    let docItem = signCompendium.find((i) => i.name === item);
                    newDocItem.system.source = `The ${signObject.name}`;
                    Item.create(docItem.toObject(), { parent: this.actor });
                  }
                }
              } else {
                this.actor.update({ "system.birthsign": customSignLabel });
              }
            }
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });

    d.position.width = 600;
    d.render(true);
  }

  _onIncrementResource(event) {
    event.preventDefault();
    const resource = this.actor.system[event.currentTarget.dataset.resource];
    const action = event.currentTarget.dataset.action;
    let dataPath = `system.${event.currentTarget.dataset.resource}.value`;

    // Update and increment resource
    action == "increase"
      ? this.actor.update({ [dataPath]: resource.value + 1 })
      : this.actor.update({ [dataPath]: resource.value - 1 });
  }

  _onResetResource(event) {
    event.preventDefault();
    const resourceLabel = event.currentTarget.dataset.resource;
    const resource = this.actor.system[resourceLabel];
    let dataPath = `system.${resourceLabel}.value`;

    this.actor.update({ [dataPath]: (resource.value = resource.max) });
  }

  _onXPMenu(event) {
    event.preventDefault();
    let currentXP = this.actor.system.xp;
    let totalXP = this.actor.system.xpTotal;

    // Rank Objects
    const ranks = {
      apprentice: { name: "Apprentice", xp: 1000 },
      journeyman: { name: "Journeyman", xp: 2500 },
      adept: { name: "Adept", xp: 4000 },
      expert: { name: "Expert", xp: 5500 },
      master: { name: "Master", xp: 7000 },
    };

    // Create Rank table rows
    const rankRows = [];
    for (let rank in ranks) {
      const rankObject = ranks[rank];
      const row = `<tr>
                      <td>${rankObject.name}</td>
                      <td>${rankObject.xp}</td>
                  </tr>`;
      rankRows.push(row);
    }

    let d = new Dialog({
      title: "Experience Menu",
      content: `<form>
                    <div style="display: flex; flex-direction: column;">

                        <div style="padding: 10px;">
                            <div style="display: flex; flex-direction: row; justify-content: space-around; background: rgba(180, 180, 180, 0.562); padding: 10px; text-align: center; border: 1px solid;">
                                <div style="width: 33.33%">
                                    <div>Current XP</div>
                                    <input type="number" id="xp" value="${this.actor.system.xp
        }">
                                </div>
                                <div style="width: 33.33%">
                                    <div>Total XP</div>
                                    <input type="number" id="xpTotal" value="${this.actor.system.xpTotal
        }">
                                </div>
                                <div style="width: 33.33%">
                                    <div>Campaign Rank</div>
                                    <div style="padding: 5px 0;">${this.actor.system.campaignRank
        }</div>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: row; justify-content: space-around; align-items: center;">
                            <div style="width: 50%">
                                <p>Depending on how much total XP your character has, they may only purchase Ranks appropriate to their Campaign Skill Experience.</p>
                                <p>Increase your total XP to select higher Skill Ranks.</p>
                            </div>
                            <div>
                                <table style="text-align: center;">
                                    <tr>
                                        <th>Skill Rank</th>
                                        <th>Total XP</th>
                                    </tr>
                                    ${rankRows.join("")}
                                </table>
                            </div>
                        </div>

                    </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
        two: {
          label: "Submit",
          callback: (html) => {
            // Grab Input Values
            const currentXP = document.querySelector("#xp").value;
            const totalXP = document.querySelector("#xpTotal").value;

            // Update XP Values on Actor
            this.actor.update({
              "system.xp": currentXP,
              "system.xpTotal": totalXP,
            });
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });

    d.render(true);
  }

  _setResourceBars() {
    const data = this.actor.system;

    if (data) {
      for (let bar of [...this.form.querySelectorAll(".currentBar")]) {
        let resource = data[bar.dataset.resource];

        if (resource.max !== 0) {
          let resourceElement = this.form.querySelector(`#${bar.id}`);
          let proportion = Number(
            (100 * (resource.value / resource.max)).toFixed(0)
          );

          // if greater than 100 or lower than 20, set values to fit bars correctly
          proportion < 100 ? (proportion = proportion) : (proportion = 100);
          proportion < 0 ? (proportion = 0) : (proportion = proportion);

          // Apply the proportion to the width of the resource bar
          resourceElement.style.width = `${proportion}%`;
        }
      }
    }
  }

  _createSpellFilterOptions() {
    for (let spell of this.actor.items.filter(
      (item) => item.type === "spell"
    )) {
      if (
        [...this.form.querySelectorAll("#spellFilter option")].some(
          (i) => i.innerHTML === spell.system.school
        )
      ) {
        continue;
      } else {
        let option = document.createElement("option");
        option.innerHTML = spell.system.school;
        this.form.querySelector("#spellFilter").append(option);
      }
    }
  }

  _createItemFilterOptions() {
    for (let item of this.actor.items.filter(
      (i) => i.system.hasOwnProperty("equipped") && i.system.equipped === false
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

  _filterSpells(event) {
    event.preventDefault();
    let filterBy = event.currentTarget.value;

    for (let spellItem of [
      ...this.form.querySelectorAll(".spellList tbody .item"),
    ]) {
      switch (filterBy) {
        case "All":
          spellItem.classList.add("active");
          sessionStorage.setItem("savedSpellFilter", filterBy);
          break;

        case `${filterBy}`:
          filterBy == spellItem.dataset.spellSchool
            ? spellItem.classList.add("active")
            : spellItem.classList.remove("active");
          sessionStorage.setItem("savedSpellFilter", filterBy);
          break;
      }
    }
  }

  _filterItems(event) {
    event.preventDefault();
    let filterBy = event.currentTarget.value;

    for (let item of [
      ...this.form.querySelectorAll(".equipmentList tbody .item"),
    ]) {
      switch (filterBy) {
        case "All":
          item.classList.add("active");
          sessionStorage.setItem("savedItemFilter", filterBy);
          break;

        case `${filterBy}`:
          filterBy == item.dataset.itemType
            ? item.classList.add("active")
            : item.classList.remove("active");
          sessionStorage.setItem("savedItemFilter", filterBy);
          break;
      }
    }
  }

  _setDefaultItemFilter() {
    let filterBy = sessionStorage.getItem("savedItemFilter");

    if (filterBy !== null || filterBy !== undefined) {
      this.form.querySelector("#itemFilter").value = filterBy;
      for (let item of [
        ...this.form.querySelectorAll(".equipmentList tbody .item"),
      ]) {
        switch (filterBy) {
          case "All":
            item.classList.add("active");
            break;

          case `${filterBy}`:
            filterBy == item.dataset.itemType
              ? item.classList.add("active")
              : item.classList.remove("active");
            break;
        }
      }
    }
  }

  _setDefaultSpellFilter() {
    let filterBy = sessionStorage.getItem("savedSpellFilter");

    if (filterBy !== null || filterBy !== undefined) {
      this.form.querySelector("#spellFilter").value = filterBy;
      for (let spellItem of [
        ...this.form.querySelectorAll(".spellList tbody .item"),
      ]) {
        switch (filterBy) {
          case "All":
            spellItem.classList.add("active");
            break;

          case `${filterBy}`:
            filterBy == spellItem.dataset.spellSchool
              ? spellItem.classList.add("active")
              : spellItem.classList.remove("active");
            break;
        }
      }
    }
  }

  _createStatusTags() {
    this.actor.system.wounded
      ? this.form.querySelector("#wound-icon").classList.add("active")
      : this.form.querySelector("#wound-icon").classList.remove("active");
    this.actor.system.carry_rating.current > this.actor.system.carry_rating.max
      ? this.form.querySelector("#enc-icon").classList.add("active")
      : this.form.querySelector("#enc-icon").classList.remove("active");
    this.actor.system.fatigue.level > 0
      ? this.form.querySelector("#fatigue-icon").classList.add("active")
      : this.form.querySelector("#fatigue-icon").classList.remove("active");
  }

  _selectCombatRank(event) {
    event.preventDefault();
    let element = event.currentTarget;

    let combatStyle = this.actor.getEmbeddedDocument("Item", element.id);
    combatStyle.update({ "system.rank": element.value });
    element.querySelector(`[value="${element.value}"]`).selected = true;
  }

  _setDefaultCombatRank() {
    for (let rankElement of [...this.form.querySelectorAll(".rank-select")]) {
      let item = this.actor.getEmbeddedDocument("Item", rankElement.id);
      let option = rankElement.querySelector(`[value="${item.system.rank}"]`);
      option.selected = true;
    }
  }

  _incrementFatigue(event) {
    event.preventDefault();
    let element = event.currentTarget;
    let action = element.dataset.action;
    let fatigueLevel = this.actor.system.fatigue.level;
    let fatigueBonus = this.actor.system.fatigue.bonus;

    if (action === "increase" && fatigueLevel < 5) {
      this.actor.update({ "system.fatigue.bonus": fatigueBonus + 1 });
    } else if (action === "decrease" && fatigueLevel > 0) {
      this.actor.update({ "system.fatigue.bonus": fatigueBonus - 1 });
    }
  }

  _onEquipItems(event) {
    event.preventDefault();
    let element = event.currentTarget;
    let itemList = this.actor.items.filter(
      (item) =>
        item.type === element.id ||
        (item.type === element.dataset.altType && item.system.wearable)
    );

    let itemEntries = [];
    let tableHeader = "";
    let tableEntry = "";

    // Loop through Item List and create table rows
    for (let item of itemList) {
      switch (item.type) {
        case "armor":
        case "item":
          tableEntry = `<tr>
                            <td data-item-id="${item._id}">
                                <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                  <img class="item-img" src="${item.img
            }" height="24" width="24">
                                  ${item.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${item.system.armor
            }</td>
                            <td style="text-align: center;">${item.system.magic_ar
            }</td>
                            <td style="text-align: center;">${item.system.blockRating
            }</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${item._id
            }" ${item.system.equipped ? "checked" : ""}>
                            </td>
                        </tr>`;
          break;

        case "weapon":
          tableEntry = `<tr>
                            <td data-item-id="${item._id}">
                                <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                  <img class="item-img" src="${item.img
            }" height="24" width="24">
                                  ${item.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${item.system.damage
            }</td>
                            <td style="text-align: center;">${item.system.damage2
            }</td>
                            <td style="text-align: center;">${item.system.reach
            }</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${item._id
            }" ${item.system.equipped ? "checked" : ""}>
                            </td>
                        </tr>`;
          break;

        case "ammunition":
          tableEntry = `<tr>
                            <td data-item-id="${item._id}">
                                <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                  <img class="item-img" src="${item.img
            }" height="24" width="24">
                                  ${item.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${item.system.quantity
            }</td>
                            <td style="text-align: center;">${item.system.damage
            }</td>
                            <td style="text-align: center;">${item.system.enchant_level
            }</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${item._id
            }" ${item.system.equipped ? "checked" : ""}>
                            </td>
                        </tr>`;
          break;
      }

      itemEntries.push(tableEntry);
    }

    // Find first entry and determine item type to create appropriate item header
    if (itemList.length === 0) {
      return ui.notifications.info(
        `${this.actor.name} does not have any items of this type to equip.`
      );
    }
    switch (itemList[0].type) {
      case "armor":
      case "item":
        tableHeader = `<div>
                          <div style="padding: 5px 0;">
                              <label>Selecting nothing will unequip all items</label>
                          </div>

                          <div>
                              <table>
                                  <thead>
                                      <tr>
                                          <th>Name</th>
                                          <th>AR</th>
                                          <th>MR</th>
                                          <th>BR</th>
                                          <th>Equipped</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${itemEntries.join("")}
                                  </tbody>
                              </table>
                          </div>
                      </div>`;
        break;

      case "weapon":
        tableHeader = `<div>
                          <div style="padding: 5px 0;">
                              <label>Selecting nothing will unequip all items</label>
                          </div>

                          <div>
                              <table>
                                  <thead>
                                      <tr>
                                          <th>Name</th>
                                          <th>1H</th>
                                          <th>2H</th>
                                          <th>Reach</th>
                                          <th>Equipped</th>
                                      </tr>
                                  </thead>
                                  <tbody>
                                      ${itemEntries.join("")}
                                  </tbody>
                              </table>
                          </div>
                      </div>`;
        break;

      case "ammunition":
        tableHeader = `<div>
                        <div style="padding: 5px 0;">
                            <label>Selecting nothing will unequip all items</label>
                        </div>

                        <div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Qty</th>
                                        <th>Damage</th>
                                        <th>Enchant</th>
                                        <th>Equipped</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemEntries.join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>`;
    }

    let d = new Dialog({
      title: "Item List",
      content: tableHeader,
      buttons: {
        one: {
          label: "Cancel",
          callback: (html) => console.log("Cancelled"),
        },
        two: {
          label: "Submit",
          callback: async (html) => {
            let selectedArmor = [...document.querySelectorAll(".itemSelect")];

            for (let armorItem of selectedArmor) {
              let thisArmor = this.actor.items.filter(
                (item) => item.id == armorItem.dataset.itemId
              )[0];
              const shouldEquip = !!armorItem.checked;
              await thisArmor.update({ system: { equipped: shouldEquip } });
            }
          },
        },
      },
      default: "two",
      close: (html) => console.log(),
    });

    d.position.width = 500;
    d.render(true);
  }
}
