/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { getDamageTypeFromWeapon } from "../combat/combat-utils.js";

export class npcSheet extends foundry.appv1.sheets.ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "NPC"],
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

    // Prepare Items
    if (this.actor.type === "NPC") {
      this._prepareCharacterItems(data);
    }

    data.actor.system.enrichedBio = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.actor.system.bio, {async: true});

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
    actorData.ammunition = ammunition;
    actorData.language = language;
    actorData.faction = faction;
    actorData.container = container;
  }

  get template() {
    const path = "systems/uesrpg-3ev4/templates";
    if (!game.user.isGM && this.actor.limited)
      return "systems/uesrpg-3ev4/templates/limited-npc-sheet.html";
    return `${path}/${this.actor.type.toLowerCase()}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
async activateListeners(html) {
  super.activateListeners(html);

  // Rollable Buttons
  html.find(".characteristic-roll").click(this._onClickCharacteristic.bind(this));
  html.find(".professions-roll").click(this._onProfessionsRoll.bind(this));
  html.find(".damage-roll").click(this._onDamageRoll.bind(this));
  html.find(".magic-roll").click(this._onSpellRoll.bind(this));
  html.find(".resistance-roll").click(this._onResistanceRoll.bind(this));
  html.find(".ammo-roll").click(this._onAmmoRoll.bind(this));
  html.find(".defend-roll").click(this._onDefendRoll.bind(this));
  html.find(".ability-list .item-img").click(this._onTalentRoll.bind(this));
  html.find(".talent-container .item-img").click(this._onTalentRoll.bind(this));
  html.find(".trait-container .item-img").click(this._onTalentRoll.bind(this));
  html.find(".power-container .item-img").click(this._onTalentRoll.bind(this));
  html.find(".spellList .item-img").click(this._onTalentRoll.bind(this));
  html.find(".weapon-table .item-img").click(this._onTalentRoll.bind(this));
  html.find(".ammunition-table .item-img").click(this._onTalentRoll.bind(this));
  html.find(".armor-table .item-img").click(this._onTalentRoll.bind(this));
  html.find(".equipmentList .item-img").click(this._onTalentRoll.bind(this));
  html.find(".languageContainer .item-img").click(this._onTalentRoll.bind(this));
  html.find(".factionContainer .item-img").click(this._onTalentRoll.bind(this));

  // Update Item Attributes from Actor Sheet
  html.find(".toggle2H").click(this._onToggle2H.bind(this));
  html.find(".plusQty").click(this._onPlusQty.bind(this));
  html.find(".minusQty").contextmenu(this._onMinusQty.bind(this));
  html.find(".itemEquip").click(this._onItemEquip.bind(this));

  html.find(".itemTabInfo .wealthCalc").click(this._onWealthCalc.bind(this));
  html.find(".setBaseCharacteristics").click(this._onSetBaseCharacteristics.bind(this));
  html.find(".carryBonus").click(this._onCarryBonus.bind(this));
  html.find(".wealthCalc").click(this._onWealthCalc.bind(this));

  html.find(".incrementResource").click(this._onIncrementResource.bind(this));
  html.find(".resourceLabel button").click(this._onResetResource.bind(this));
  html.find("#spellFilter").click(this._filterSpells.bind(this));
  html.find("#itemFilter").click(this._filterItems.bind(this));
  html.find(".incrementFatigue").click(this._incrementFatigue.bind(this));
  html.find(".equip-items").click(this._onEquipItems.bind(this));

  // Checks UI Elements for update
  this._createSpellFilterOptions();
  this._createItemFilterOptions();
  this._setDefaultSpellFilter();
  this._setDefaultItemFilter();
  this._setResourceBars();
  this._createStatusTags();

  // Item Create Buttons
  html.find(".item-create").click(this._onItemCreate.bind(this));

  // NEW: Handle apply damage button clicks in chat (avoid duplicate registrations)
  $(document)
    .off("click.uesrpgApplyDamage")
    .on("click.uesrpgApplyDamage", ".apply-damage-btn", async (ev) => {
      const button = ev.currentTarget;

      // Match your chat button attributes: data-actor-id, data-damage, data-type, data-location
      const actorId = button.dataset.actorId;
      const damage = Number(button.dataset.damage);
      const damageType = button.dataset.type || "physical";
      const hitLocation = button.dataset.location;

      const targetActor = game.actors.get(actorId);
      if (!targetActor) {
        ui.notifications.warn("Target actor not found");
        return;
      }

      // Import damage helper (adjust path if needed for your module structure)
      const { applyDamageToActor } = await import("../helpers/damageHelper.js");

      const result = await applyDamageToActor(
        targetActor,
        damage,
        hitLocation,
        damageType,
        { penetrateArmor: false }
      );

      ui.notifications.info(
        `${targetActor.name} takes ${result.finalDamage} damage (${result.ar} AR) to ${hitLocation}. HP: ${result.newHP}`
      );

      // Disable button after use
      button.disabled = true;
      button.textContent = "✓ Applied";
    });

  // Everything below here is only needed if the sheet is editable
  if (!this.options.editable) return;

  // Update Inventory Item
  html.find(".item-name").contextmenu(async (ev) => {
    const li = ev.currentTarget.closest(".item");
    const item = this.actor.items.get(li?.dataset?.itemId);
    if (!item) return;
    this._duplicateItem(item);
  });

  html.find(".item-name").click(async (ev) => {
    const li = ev.currentTarget.closest(".item");
    const item = this.actor.items.get(li?.dataset?.itemId);
    if (!item) return;
    item.sheet.render(true);
    await item.update({ "system.value": item.system.value });
  });

  // Open Container of item
  html.find(".fa-backpack").click(async (ev) => {
    const containerId = ev.currentTarget?.dataset?.containerId;
    if (!containerId) return;
    const item = this.actor.items.get(containerId);
    if (!item) return;
    item.sheet.render(true);
    await item.update({ "system.value": item.system.value });
  });

  // Delete Inventory Item
  html.find(".item-delete").click(async (ev) => {
    const li = ev.currentTarget.closest(".item");
    const itemId = li?.dataset?.itemId;
    if (!itemId) return;

    const itemToDelete = this.actor.items.find((i) => i._id == itemId);
    if (!itemToDelete) return;

    // If deleted item is the container: unlink all contained items, then clear list
    if (itemToDelete.type === "container") {
      const containedItems = Array.isArray(itemToDelete?.system?.contained_items)
        ? itemToDelete.system.contained_items
        : [];

      for (const item of containedItems) {
        const sourceItem = this.actor.items.find((i) => i._id == item._id);
        if (!sourceItem) continue;

        await sourceItem.update({
          "system.containerStats.container_id": "",
          "system.containerStats.container_name": "",
          "system.containerStats.contained": false,
        });
      }

      await itemToDelete.update({ "system.contained_items": [] });
    }

    // If deleted item is in a container: unlink from container and clear its containerStats
    if (
      itemToDelete?.system?.isPhysicalObject &&
      itemToDelete.type !== "container" &&
      itemToDelete?.system?.containerStats?.contained
    ) {
      const containerObject = this.actor.items.find(
        (i) => i._id == itemToDelete?.system?.containerStats?.container_id
      );

      if (containerObject && Array.isArray(containerObject?.system?.contained_items)) {
        const indexToRemove = containerObject.system.contained_items.findIndex(
          (i) => i._id == itemToDelete._id
        );

        if (indexToRemove !== -1) {
          containerObject.system.contained_items.splice(indexToRemove, 1);
          await containerObject.update({
            "system.contained_items": containerObject.system.contained_items,
          });
        }
      }

      await itemToDelete.update({
        "system.containerStats.container_id": "",
        "system.containerStats.container_name": "",
        "system.containerStats.contained": false,
      });
    }

    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
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

  // Defensive guard: safe hasOwnProperty for characteristicBonus
  const bonusItems = this.actor.items.filter((item) =>
    item?.system && Object.prototype.hasOwnProperty.call(item.system, "characteristicBonus")
  );

  for (let item of bonusItems) {
    for (let key in item?.system?.characteristicBonus ?? {}) {
      let itemBonus = item?.system?.characteristicBonus?.[key] ?? 0;
      if (itemBonus !== 0) {
        let itemButton = `<button style="width: auto;" onclick="getItem(this.id, this.dataset.actor)" id="${
          item.id
        }" data-actor="${item.actor.id}">${item.name} ${
          itemBonus >= 0 ? `+${itemBonus}` : itemBonus
        }</button>`;
        // Map the key to the target array safely
        const mapped = {
          strChaBonus: strBonusArray,
          endChaBonus: endBonusArray,
          agiChaBonus: agiBonusArray,
          intChaBonus: intBonusArray,
          wpChaBonus: wpCBonusArray,
          prcChaBonus: prcBonusArray,
          prsChaBonus: prsBonusArray,
          lckChaBonus: lckBonusArray
        }[key];
        if (mapped) mapped.push(itemButton);
      }
    }
  }

  let d = new Dialog({
    title: "Set Base Characteristics",
    content: `<form>
                  <script>
                    function getItem(itemID, actorID) {
                        let actor = game.actors.find(actor => actor.id === actorID)
                        let tokenActor = game.scenes.find(scene => scene.active === true)?.tokens?.find(token => token.system.actorId === actorID)

                        if (!tokenActor?.actorLink) {
                          let actorBonusItems = actor.items.filter(item => item?.system && Object.prototype.hasOwnProperty.call(item.system, 'characteristicBonus'))
                          let item = actorBonusItems.find(i => i.id === itemID)
                          item.sheet.render(true)
                        }
                        else {
                          let tokenBonusItems = tokenActor._actor.items.filter(item => item?.system && Object.prototype.hasOwnProperty.call(item.system, 'characteristicBonus'))
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

                  <div class="modifierBox">
                    <h2>STR Modifiers</h2>
                    <span style="font-size: small">${strBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>END Modifiers</h2>
                    <span style="font-size: small">${endBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>AGI Modifiers</h2>
                    <span style="font-size: small">${agiBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>INT Modifiers</h2>
                    <span style="font-size: small">${intBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>WP Modifiers</h2>
                    <span style="font-size: small">${wpCBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>PRC Modifiers</h2>
                    <span style="font-size: small">${prcBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>PRS Modifiers</h2>
                    <span style="font-size: small">${prsBonusArray.join("")}</span>
                  </div>

                  <div class="modifierBox">
                    <h2>LCK Modifiers</h2>
                    <span style="font-size: small">${lckBonusArray.join("")}</span>
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

          // Shortcut for characteristics (ensure path exists) - with defensive guard
          const chaPath = this.actor?.system?.characteristics || {};

          // Use Number(...) with nullish fallback to avoid NaN
          await this.actor.update({
            "system.characteristics.str.base": Number(strInput || 0),
            "system.characteristics.str.total": Number(strInput || 0),
            "system.characteristics.end.base": Number(endInput || 0),
            "system.characteristics.end.total": Number(endInput || 0),
            "system.characteristics.agi.base": Number(agiInput || 0),
            "system.characteristics.agi.total": Number(agiInput || 0),
            "system.characteristics.int.base": Number(intInput || 0),
            "system.characteristics.int.total": Number(intInput || 0),
            "system.characteristics.wp.base": Number(wpInput || 0),
            "system.characteristics.wp.total": Number(wpInput || 0),
            "system.characteristics.prc.base": Number(prcInput || 0),
            "system.characteristics.prc.total": Number(prcInput || 0),
            "system.characteristics.prs.base": Number(prsInput || 0),
            "system.characteristics.prs.total": Number(prsInput || 0),
            "system.characteristics.lck.base": Number(lckInput || 0),
            "system.characteristics.lck.total": Number(lckInput || 0),
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
  if (carryPenalty !== 0) {
    tags.push(`<span class="tag enc-tag">Encumbered ${carryPenalty}</span>`);
  }

  let d = new Dialog({
    title: "Apply Roll Modifier",
    content: `<form>
                <div class="dialogForm">
                <label><b>${element.getAttribute("name")} Modifier: </b></label>
                <input placeholder="ex. -20, +10" id="playerInput" value="0" style="text-align: center; width: 50%; border-style: groove; float: right;" type="text">
                </div>
              </form>`,
    buttons: {
      one: {
        label: "Roll!",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;

          let contentString = "";
          let roll = new Roll("1d100");
          await roll.evaluate();

          const isLucky = [lucky.ln1, lucky.ln2, lucky.ln3, lucky.ln4, lucky.ln5, lucky.ln6, lucky.ln7, lucky.ln8, lucky.ln9, lucky.ln10].includes(roll.total);
          const isUnlucky = [unlucky.ul1, unlucky.ul2, unlucky.ul3, unlucky.ul4, unlucky.ul5, unlucky.ul6].includes(roll.total);

          if (actorSys?.wounded == true) {
            const target = woundedValue + playerInput;
            if (isLucky) {
              contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p><span style='color:green; font-size:120%;'><b>LUCKY NUMBER!</b></span>`;
            } else if (isUnlucky) {
              contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p><span style='color:rgb(168, 5, 5); font-size:120%;'><b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p>${roll.total <= target ? "<span style='color:green; font-size:120%;'><b>SUCCESS!</b></span>" : "<span style='color:rgb(168, 5, 5); font-size:120%;'><b>FAILURE!</b></span>"}`;
            }
          } else {
            const target = regularValue + playerInput;
            if (isLucky) {
              contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p><span style='color:green; font-size:120%;'><b>LUCKY NUMBER!</b></span>`;
            } else if (isUnlucky) {
              contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p><span style='color:rgb(168, 5, 5); font-size:120%;'><b>UNLUCKY NUMBER!</b></span>`;
            } else {
              contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p>${roll.total <= target ? "<span style='color:green; font-size:120%;'><b>SUCCESS!</b></span>" : "<span style='color:rgb(168, 5, 5); font-size:120%;'><b>FAILURE!</b></span>"}`;
            }
          }

          await roll.toMessage({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            roll: roll,
            content: contentString,
            flavor: `<div class="tag-container">${tags.join("")}</div>`,
            rollMode: game.settings.get("core", "rollMode"),
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
  event.preventDefault();
  const element = event.currentTarget;
  const actorSys = this.actor?.system || {};
  let tags = [];
  if (actorSys?.wounded) {
    tags.push(`<span class="tag wound-tag">Wounded ${Number(actorSys?.woundPenalty ?? 0)}</span>`);
  }
  if (Number(actorSys?.fatigue?.penalty ?? 0) !== 0) {
    tags.push(`<span class="tag fatigue-tag">Fatigued ${Number(actorSys?.fatigue?.penalty ?? 0)}</span>`);
  }
  if (Number(actorSys?.carry_rating?.penalty ?? 0) !== 0) {
    tags.push(`<span class="tag enc-tag">Encumbered ${Number(actorSys?.carry_rating?.penalty ?? 0)}</span>`);
  }

  let d = new Dialog({
    title: "Apply Roll Modifier",
    content: `<form>
                <div class="dialogForm">
                <label><b>${element.getAttribute("name")} Modifier: </b></label>
                <input placeholder="ex. -20, +10" id="playerInput" value="0" style="text-align:center; width:50%; border-style: groove; float:right;" type="text">
                </div>
              </form>`,
    buttons: {
      one: {
        label: "Roll!",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;

          let roll = new Roll("1d100");
          await roll.evaluate();

          const lucky = actorSys.lucky_numbers || {};
          const unlucky = actorSys.unlucky_numbers || {};
          const isLucky = [lucky.ln1, lucky.ln2, lucky.ln3, lucky.ln4, lucky.ln5, lucky.ln6, lucky.ln7, lucky.ln8, lucky.ln9, lucky.ln10].includes(roll.result);
          const isUnlucky = [unlucky.ul1, unlucky.ul2, unlucky.ul3, unlucky.ul4, unlucky.ul5, unlucky.ul6].includes(roll.result);

          const base = Number(this.actor.system?.professionsWound?.[element.getAttribute("id")] ?? this.actor.system?.professions?.[element.getAttribute("id")] ?? 0);
          const fatigue = Number(actorSys?.fatigue?.penalty ?? 0);
          const carry = Number(actorSys?.carry_rating?.penalty ?? 0);
          const target = base + playerInput + fatigue + carry;

          let contentString = "";
          if (isLucky) {
            contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p><span style='color:green; font-size:120%;'><b>LUCKY NUMBER!</b></span>`;
          } else if (isUnlucky) {
            contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p><span style='color:rgb(168, 5, 5); font-size:120%;'><b>UNLUCKY NUMBER!</b></span>`;
          } else {
            contentString = `<h2>${element.getAttribute("name")}</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p>${roll.result <= target ? "<span style='color:green; font-size:120%;'><b>SUCCESS!</b></span>" : "<span style='color:rgb(168,5,5); font-size:120%;'><b>FAILURE!</b></span>"}`;
          }

          await roll.toMessage({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            roll: roll,
            content: contentString,
            flavor: `<div class="tag-container">${tags.join("")}</div>`,
            rollMode: game.settings.get("core", "rollMode"),
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

async _onDefendRoll(event) {
  event.preventDefault();
  
  const defenseType = event.currentTarget.dataset.defense || 'evade';
  const actorSys = this.actor?.system || {};
  
  // Get defense skill value
  let defenseTN = 50;
  if (defenseType === 'evade') {
    const evadeSkill = this.actor.items.find(i => i.type === 'skill' && i.name.toLowerCase() === 'evade');
    defenseTN = Number(evadeSkill?.system?.value ??  Number(actorSys?.characteristics?.agi?.total ?? 50));
  } else if (defenseType === 'block') {
    const blockSkill = this.actor.items.find(i => i.type === 'combatStyle' && i.name.toLowerCase().includes('block'));
    defenseTN = Number(blockSkill?.system?.value ?? Number(actorSys?.characteristics?.str?.total ?? 50));
  }
  
  // Roll defense
  const roll = new Roll("1d100");
  await roll.evaluate({async:  true});
  
  const success = roll.total <= defenseTN;
  const dos = success ? Math.floor((defenseTN - roll.total) / 10) : 0;
  
  // Chat message
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor: this.actor}),
    content: `
      <h3>${defenseType.toUpperCase()} Defense</h3>
      <p><b>Target:</b> ${defenseTN}</p>
      <p><b>Roll:</b> [[${roll.total}]]</p>
      <p><b>${success ? 'SUCCESS' : 'FAILURE'}</b> (${dos} DoS)</p>
    `
  });
}
  
  async _onDamageRoll(event) {
  event.preventDefault();
  const button = event.currentTarget;
  const li = button.closest(".item");
  const item = this.actor.items.get(li?.dataset.itemId);
  
  if (!item) return;

  // ✅ Import helper functions at top of file if not already
  // import { rollHitLocation, getDamageTypeFromWeapon } from "../combat/combat-utils.js";
  
  // Determine damage formula
  const damageRoll = item.system?.weapon2H ?  item.system?.damage2 : item.system?.damage;
  
  // Roll hit location
  const hitLocRoll = await new Roll("1d100").evaluate({ async: true });
  const hitResult = hitLocRoll.total;
  let hit_loc = "";
  if (hitResult <= 15) hit_loc = "Head";
  else if (hitResult <= 35) hit_loc = "Right Arm";
  else if (hitResult <= 55) hit_loc = "Left Arm";
  else if (hitResult <= 80) hit_loc = "Body";
  else if (hitResult <= 90) hit_loc = "Right Leg";
  else hit_loc = "Left Leg";

  // Roll damage
  const roll = await new Roll(damageRoll).evaluate({ async: true });
  const supRoll = item.system?.superior ?  await new Roll(damageRoll).evaluate({ async: true }) : null;
  
  const finalDamage = supRoll ? Math.max(roll.total, supRoll.total) : roll.total;
  
  // Get damage type from weapon
  const damageType = window.Uesrpg3e?.utils?.getDamageTypeFromWeapon(item) || 'physical';
  
  // Get targeted actors for damage application
  const targets = Array.from(game.user.targets || []);
  let applyDamageButtons = "";

  if (targets.length > 0) {
    targets.forEach(target => {
      applyDamageButtons += `
        <button class="apply-damage-btn" 
                data-actor-id="${target.actor.id}" 
                data-damage="${finalDamage}" 
                data-type="${damageType}" 
                data-location="${hit_loc}"
                style="margin:  0.25rem; padding: 0.25rem 0.5rem; background: #8b0000; color: white; border:  none; border-radius: 3px; cursor: pointer;">
          Apply ${finalDamage} ${damageType} damage to ${target.name} (${hit_loc})
        </button>`;
    });
  }

  // Build chat message
  const damageDisplay = supRoll 
    ? `[[${roll.total}]] [[${supRoll.total}]]` 
    : `[[${roll.total}]]`;
  
  const contentString = `
    <div class="uesrpg-damage-card">
      <h2><img src="${item.img}" height="20" width="20" style="margin-right: 5px;"/>${item.name}</h2>
      <p><b>Damage:</b> ${damageDisplay} (${damageRoll})</p>
      <p><b>Hit Location:</b> [[${hitLocRoll.total}]] ${hit_loc}</p>
      <p><b>Damage Type: </b> ${damageType}</p>
      <p><b>Qualities:</b> ${item.system?.qualities || 'None'}</p>
      ${applyDamageButtons ?  `<div style="margin-top: 0.5rem; border-top: 1px solid #666; padding-top: 0.5rem;">${applyDamageButtons}</div>` : ''}
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: contentString,
    rolls: supRoll ? [roll, supRoll] : [roll],
    rollMode: game.settings.get("core", "rollMode")
  });
}

_onSpellRoll(event) {
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
    const fav = this.actor?.system?.favorites?.[event.currentTarget.dataset.hotkey];
    spellToCast = this.actor.getEmbeddedDocument?.("Item", fav?.id);
  }

  const actorSys = this.actor?.system || {};
  const hasCreative = this.actor.items.find((i) => i.type === "talent" && i.name === "Creative") ? true : false;
  const hasForceOfWill = this.actor.items.find((i) => i.type === "talent" && i.name === "Force of Will") ? true : false;
  const hasMethodical = this.actor.items.find((i) => i.type === "talent" && i.name === "Methodical") ? true : false;
  const hasOvercharge = this.actor.items.find((i) => i.type === "talent" && i.name === "Overcharge") ? true : false;
  const hasMagickaCycling = this.actor.items.find((i) => i.type === "talent" && i.name === "Magicka Cycling") ? true : false;

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

  let spellDescriptionDiv = "";
  if (spellToCast?.system?.description) {
    spellDescriptionDiv = `<div style="padding: 10px;">${spellToCast.system.description}</div>`;
  }

  // Safely read WP total for restraint base
  const wpTotal = Number(actorSys?.characteristics?.wp?.total ?? 0);
  const spellRestraintBase = Math.floor(wpTotal / 10);

  const m = new Dialog({
    title: "Cast Spell",
    content: `<form> ... (keep your existing HTML, but ensure any interpolation uses safe values like ${spellToCast?.system?.cost ?? 0} and ${spellRestraintBase}) ... </form>`,
    buttons: {
      one: {
        label: "Cast Spell",
        callback: async (html) => {
          const playerChecks = {
            isRestrained: Boolean(html.find(`[id="Restraint"]`)[0]?.checked),
            isOverloaded: Boolean(html.find(`[id="Overload"]`)[0]?.checked),
            isMagickaCycled: hasMagickaCycling ? Boolean(html.find(`[id="MagickaCycling"]`)[0]?.checked) : false,
            isOvercharged: hasOvercharge ? Boolean(html.find(`[id="Overcharge"]`)[0]?.checked) : false
          };

          let spellRestraint = 0;
          let stackCostMod = 0;
          const tags = [];

          if (playerChecks.isRestrained) {
            tags.push(`<span style="...">Restraint</span>`);
            if (hasCreative && spellToCast?.system?.spellType === "unconventional") stackCostMod -= 1;
            if (hasMethodical && spellToCast?.system?.spellType === "conventional") stackCostMod -= 1;
            if (hasForceOfWill) stackCostMod -= 1;
            spellRestraint = -spellRestraintBase;
          }

          if (playerChecks.isOverloaded) {
            tags.push(`<span style="...">Overload</span>`);
          }
          if (playerChecks.isMagickaCycled) {
            tags.push(`<span style="...">Magicka Cycle</span>`);
            spellRestraint = -2 * spellRestraintBase;
          }
          if (playerChecks.isOvercharged) {
            tags.push(`<span style="...">Overcharge</span>`);
          }

          const damageFormula = spellToCast?.system?.damage ?? "";
          const damageRoll = damageFormula ? new Roll(damageFormula) : null;
              // --- NEW: Check for advantage/penetration ---
    const hasPenetration = false; // TODO: wire to advantage from opposed roll or talent
    let arMultiplier = 1.0;
    
    if (hasPenetration) {
      arMultiplier = 0.5; // Penetrate Armor:  treat full as partial
      ui.notifications.info("Armor Penetration active - AR halved!");
    }
    // --- END NEW ---
          if (damageRoll) await damageRoll.evaluate();
          

          const hitLocRoll = new Roll("1d10");
          await hitLocRoll.evaluate();
          let hitLoc = "";
          if (hitLocRoll.result <= 5) hitLoc = "Body";
          else if (hitLocRoll.result == 6) hitLoc = "Right Leg";
          else if (hitLocRoll.result == 7) hitLoc = "Left Leg";
          else if (hitLocRoll.result == 8) hitLoc = "Right Arm";
          else if (hitLocRoll.result == 9) hitLoc = "Left Arm";
          else if (hitLocRoll.result == 10) hitLoc = "Head";

          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;
          const baseCost = Number(spellToCast?.system?.cost ?? 0);
          let actualCost = baseCost + spellRestraint + stackCostMod;
          if (playerChecks.isOvercharged) actualCost *= 2;
          const displayCost = actualCost < 1 ? 1 : actualCost;

          // Check magicka safely
          const magickaValue = Number(actorSys?.magicka?.value ?? 0);
          if (game.settings.get("uesrpg-3ev4", "automateMagicka") && displayCost > magickaValue) {
            return ui.notifications.info(`You do not have enough Magicka to cast this spell: Cost: ${baseCost} || Restraint: ${spellRestraint} || Other: ${stackCostMod}`);
          }

          // Build content string safely using optional chaining and nullish coalescing
          let contentString = `<h2><img src=${spellToCast?.img ?? ""}></im>${spellToCast?.name ?? "Spell"}</h2>
            <table> ... ${damageRoll ? `[[${damageRoll.result}]]` : ""} ... </table>`;

          if (damageRoll) {
            await damageRoll.toMessage({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              flavor: tags.join(""),
              content: contentString,
            });
          } else {
            ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker(),
              content: contentString,
              flavor: tags.join(""),
            });
          }

          if (game.settings.get("uesrpg-3ev4", "automateMagicka")) {
            await this.actor.update({
              "system.magicka.value": magickaValue - displayCost,
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
  const actorSys = this.actor?.system || {};
  const lucky = actorSys.lucky_numbers || {};
  const unlucky = actorSys.unlucky_numbers || {};
  const baseRes = Number(actorSys?.resistance?.[element.id] ?? 0);

  let d = new Dialog({
    title: "Apply Roll Modifier",
    content: `<form><div class="dialogForm">
                <label><b>${element.name} Resistance Modifier: </b></label>
                <input placeholder="ex. -20, +10" id="playerInput" value="0" style="text-align:center; width:50%; border-style: groove; float:right;" type="text">
              </div></form>`,
    buttons: {
      one: {
        label: "Roll!",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;
          let roll = new Roll("1d100");
          await roll.evaluate();

          const isLucky = [lucky.ln1, lucky.ln2, lucky.ln3, lucky.ln4, lucky.ln5].includes(roll.total);
          const isUnlucky = [unlucky.ul1, unlucky.ul2, unlucky.ul3, unlucky.ul4, unlucky.ul5].includes(roll.total);

          const target = baseRes + playerInput;
          let contentString = `<h2>${element.name} Resistance</h2><p></p><b>Target Number: [[${target}]]</b><p></p><b>Result: [[${roll.result}]]</b><p></p>`;

          if (isLucky) {
            contentString += `<span style='color:green; font-size:120%;'><b>LUCKY NUMBER!</b></span>`;
          } else if (isUnlucky) {
            contentString += `<span style='color:rgb(168, 5, 5); font-size:120%;'><b>UNLUCKY NUMBER!</b></span>`;
          } else {
            contentString += roll.total <= target
              ? "<span style='color:green; font-size:120%;'><b>SUCCESS!</b></span>"
              : "<span style='color: rgb(168, 5, 5); font-size:120%;'><b>FAILURE!</b></span>";
          }

          await roll.toMessage({
            async: false,
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: contentString,
            rollMode: game.settings.get("core", "rollMode"),
          });
        },
      },
      two: { label: "Cancel", callback: (html) => console.log("Cancelled") },
    },
    default: "one",
    close: (html) => console.log(),
  });
  d.render(true);
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

  async _onItemEquip(event) {
    let toggle = $(event.currentTarget);
    const li = toggle.closest(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

    if (item.system.equipped === false) {
      item.system.equipped = true;
    } else if (item.system.equipped === true) {
      item.system.equipped = false;
    }
    await item.update({ "system.equipped": item.system.equipped });
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
    content: `<form><div class="dialogForm">
                <label><i class="fas fa-coins"></i><b> Add/Subtract: </b></label>
                <input placeholder="ex. -20, +10" id="playerInput" value="0" style="text-align:center; width:50%; border-style: groove; float:right;" type="text">
              </div></form>`,
    buttons: {
      one: { label: "Cancel", callback: (html) => console.log("Cancelled") },
      two: {
        label: "Submit",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;
          const currentWealth = Number(this.actor?.system?.wealth ?? 0);
          await this.actor.update({ "system.wealth": currentWealth + playerInput });
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
  const actorSys = this.actor?.system || {};
  const currentBonus = Number(actorSys?.carry_rating?.bonus ?? 0);

  let d = new Dialog({
    title: "Carry Rating Bonus",
    content: `<form>
                <div class="dialogForm">
                <div style="margin: 5px;">
                  <label><b>Current Carry Rating Bonus: </b></label>
                  <label style=" text-align: center; float: right; width: 50%;">${currentBonus}</label>
                </div>
                <div style="margin: 5px;">
                  <label><b> Set Carry Weight Bonus:</b></label>
                  <input placeholder="10, -10, etc." id="playerInput" value="0" style=" text-align: center; width: 50%; border-style: groove; float: right;" type="text">
                </div>
                </div>
              </form>`,
    buttons: {
      one: { label: "Cancel", callback: (html) => console.log("Cancelled") },
      two: {
        label: "Submit",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;
          await this.actor.update({ "system.carry_rating.bonus": playerInput });
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

 _onIncrementResource(event) {
  event.preventDefault();
  const actorSys = this.actor?.system || {};
  const resourceKey = event.currentTarget.dataset.resource;
  const action = event.currentTarget.dataset.action;
  const resource = actorSys?.[resourceKey] || { value: 0 };
  const dataPath = `system.${resourceKey}.value`;

  if (action === "increase") {
    this.actor.update({ [dataPath]: Number(resource.value ?? 0) + 1 });
  } else {
    this.actor.update({ [dataPath]: Number(resource.value ?? 0) - 1 });
  }
}

_onResetResource(event) {
  event.preventDefault();
  const actorSys = this.actor?.system || {};
  const resourceLabel = event.currentTarget.dataset.resource;
  const resource = actorSys?.[resourceLabel] || { value: 0, max: 0 };
  const dataPath = `system.${resourceLabel}.value`;
  this.actor.update({ [dataPath]: Number(resource.max ?? 0) });
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
    // Defensive guard: safe hasOwnProperty for equipped
    for (let item of this.actor.items.filter(
      (i) => i?.system && Object.prototype.hasOwnProperty.call(i.system, "equipped") && i.system.equipped === false
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

  _incrementFatigue(event) {
    event.preventDefault();
    let element = event.currentTarget;
    let action = element.dataset.action;
    const actorSys = this.actor?.system || {};
    let fatigueLevel = Number(actorSys?.fatigue?.level ?? 0);
    let fatigueBonus = Number(actorSys?.fatigue?.bonus ?? 0);

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
                                  <img class="item-img" src="${
                                    item.img
                                  }" height="24" width="24">
                                  ${item.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${
                              item.system.armor
                            }</td>
                            <td style="text-align: center;">${
                              item.system.magic_ar
                            }</td>
                            <td style="text-align: center;">${
                              item.system.blockRating
                            }</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${
                                  item._id
                                }" ${item.system.equipped ? "checked" : ""}>
                            </td>
                        </tr>`;
          break;

        case "weapon":
          tableEntry = `<tr>
                            <td data-item-id="${item._id}">
                                <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                  <img class="item-img" src="${
                                    item.img
                                  }" height="24" width="24">
                                  ${item.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${
                              item.system.damage
                            }</td>
                            <td style="text-align: center;">${
                              item.system.damage2
                            }</td>
                            <td style="text-align: center;">${
                              item.system.reach
                            }</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${
                                  item._id
                                }" ${item.system.equipped ? "checked" : ""}>
                            </td>
                        </tr>`;
          break;

        case "ammunition":
          tableEntry = `<tr>
                            <td data-item-id="${item._id}">
                                <div style="display: flex; flex-direction: row; align-items: center; gap: 5px;">
                                  <img class="item-img" src="${
                                    item.img
                                  }" height="24" width="24">
                                  ${item.name}
                                </div>
                            </td>
                            <td style="text-align: center;">${
                              item.system.quantity
                            }</td>
                            <td style="text-align: center;">${
                              item.system.damage
                            }</td>
                            <td style="text-align: center;">${
                              item.system.enchant_level
                            }</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${
                                  item._id
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
              armorItem.checked
                ? await thisArmor.update({ "system.equipped": true })
                : await thisArmor.update({ "system.equipped": false });
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

_createStatusTags() {
  const actorSys = this.actor?.system || {};
  actorSys?.wounded
    ? this.form.querySelector("#wound-icon").classList.add("active")
    : this.form.querySelector("#wound-icon").classList.remove("active");
  Number(actorSys?.fatigue?.level ?? 0) > 0
    ? this.form.querySelector("#fatigue-icon").classList.add("active")
    : this.form.querySelector("#fatigue-icon").classList.remove("active");
  // Optionally guard encumbrance/icon logic similarly
}
}
