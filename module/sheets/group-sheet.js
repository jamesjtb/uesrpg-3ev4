import { prepareCharacterItems } from "./sheet-prepare-items.js";
import { bindCommonSheetListeners, bindCommonEditableInventoryListeners } from "./sheet-listeners.js";

/**
 * Group Actor Sheet
 * Enhanced sheet for managing group members with travel, rest automation, and deployment
 * @extends {ActorSheet}
 */
export class GroupSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["uesrpg", "sheet", "actor", "group", "worldbuilding"],
      width: 720,
      height: 700,
      tabs: [{
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: "members",
      }],
      dragDrop: [{
        dragSelector: ".member-item",
        dropSelector: null
      }],
    });
  }

  get template() {
    const path = "systems/uesrpg-3ev4/templates";
    if (!game.user.isGM && this.actor.limited) {
      return `${path}/limited-group-sheet.html`;
    }
    return `${path}/group-sheet.html`;
  }

  async getData() {
    const data = super.getData();
    data.dtypes = ["String", "Number", "Boolean"];
    data.isGM = game.user.isGM;
    data.editable = data.options.editable;

    // Prepare character items (inventory structure)
    prepareCharacterItems(data);

    // Map "item" type to "gear" for template compatibility (fallback)
    if (!data.actor.gear) {
      data.actor.gear = { equipped: [], unequipped: [] };
    }

    // Resolve member UUIDs to actor data
    data.resolvedMembers = await this._resolveMembers(data.actor.system.members);

    // Calculate base average speed from visible members
    const speeds = data.resolvedMembers.filter(m => m.canView && m.speed).map(m => m.speed);
    const baseAverageSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
    
    // Apply travel pace multiplier
    const currentPace = data.actor.system.travelPace || "normal";
    let speedMultiplier = 1.0;
    if (currentPace === "slow") {
      speedMultiplier = 0.6;  // 3 km/h ÷ 5 km/h
    } else if (currentPace === "fast") {
      speedMultiplier = 1.4;  // 7 km/h ÷ 5 km/h
    }
    
    // Display values with pace multiplier applied
    data.displayAverageSpeed = Math.round(baseAverageSpeed * speedMultiplier);
    // UESRPG conversion: 1 round = 6 seconds, so 600 rounds/hour
    // Therefore: (m/round × 600 rounds/hour) ÷ 1000 = km/h, simplified to m/round × 0.6
    data.displayAverageSpeedKmh = (data.displayAverageSpeed * 0.6).toFixed(1);
    
    // Keep legacy fields for backward compatibility
    data.averageSpeed = data.displayAverageSpeed;
    data.averageSpeedKmh = data.displayAverageSpeedKmh;

    // Enrich HTML fields using exact jamesjtb pattern
    data.actor.system.enrichedDescription = await TextEditor.enrichHTML(
      data.actor.system.description, { async: true }
    );
    data.actor.system.enrichedNotes = await TextEditor.enrichHTML(
      data.actor.system.notes, { async: true }
    );

    // Travel pace data (UESRPG RAW Chapter 1)
    data.travelPaces = {
      fast: { speed: 7, daily: 56, penalty: "−20 to Observe" },
      normal: { speed: 5, daily: 40, penalty: "—" },
      slow: { speed: 3, daily: 24, penalty: "Can move stealthily" }
    };
    data.currentPace = currentPace;

    return data;
  }

  /**
   * Get GM user IDs for whispered chat messages
   */
  _getGMUserIds() {
    return game.users.filter(u => u.isGM).map(u => u.id);
  }

  /**
   * Resolve member UUIDs to actual actor data
   */
  async _resolveMembers(members) {
    const resolved = [];

    for (const member of members) {
      const actor = await fromUuid(member.id);

      if (!actor) {
        // Actor deleted or unavailable
        resolved.push({
          ...member,
          missing: true,
          canView: false,
          name: member.name || "Unknown Actor",
          img: member.img || "icons/svg/mystery-man.svg"
        });
        continue;
      }

      const canView = actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);

      resolved.push({
        id: member.id,
        uuid: member.id,
        name: actor.name,
        img: actor.img,
        type: actor.type,
        sortOrder: member.sortOrder || 0,
        missing: false,
        canView: canView,
        actor: canView ? actor : null,
        // UESRPG-specific stats
        hp: canView ? { value: actor.system.hp.value, max: actor.system.hp.max } : null,
        stamina: canView ? { value: actor.system.stamina.value, max: actor.system.stamina.max } : null,
        speed: canView ? actor.system.speed.value : null,
        fatigue: canView ? actor.system.fatigue.level : 0
      });
    }

    return resolved;
  }

  async activateListeners(html) {
    super.activateListeners(html);

    // Bind common sheet listeners (item interactions, effects, etc.)
    bindCommonSheetListeners(this, html);

    // Bind inventory listeners (if editable)
    if (this.options.editable) {
      bindCommonEditableInventoryListeners(this, html);
      
      // Additional inventory handlers
      html.find(".itemEquip").click(this._onItemEquip.bind(this));
      html.find(".plusQty").click(this._onPlusQty.bind(this));
      html.find(".minusQty").contextmenu(this._onMinusQty.bind(this));
    }

    // Member management
    html.find(".member-name").click(this._onViewMember.bind(this));
    html.find(".member-portrait").click(this._onViewMember.bind(this));
    html.find(".member-portrait-clickable").click(this._onViewMember.bind(this));
    html.find(".member-delete").click(this._onRemoveMember.bind(this));

    // Item management (kept for backward compatibility with simple inventory view)
    html.find(".item-image").click(this._onItemShow.bind(this));
    html.find(".item-name").click(this._onItemShow.bind(this));
    html.find(".item-delete").click(this._onItemDelete.bind(this));

    // Travel
    html.find(".change-pace").click(this._onChangePace.bind(this));

    // Rest
    html.find(".short-rest").click(this._onShortRest.bind(this));
    html.find(".long-rest").click(this._onLongRest.bind(this));

    // Token deployment (GM only)
    if (game.user.isGM) {
      html.find(".deploy-group").click(this._onDeployGroup.bind(this));
    }

    if (!this.options.editable) return;
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const itemType = element.id;

    // Handle "createSelect" which should open a dialog for item type selection
    if (itemType === "createSelect") {
      const d = new Dialog({
        title: "Create Item",
        content: `<div style="padding: 10px 0;">
                    <h2>Select an Item Type</h2>
                    <label>Create an item in group inventory</label>
                  </div>`,
        buttons: {
          one: {
            label: "Item",
            callback: async () => {
              const itemData = [{ name: "New Item", type: "item" }];
              const newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
              await newItem[0].sheet.render(true);
            },
          },
          two: {
            label: "Ammunition",
            callback: async () => {
              const itemData = [{ name: "New Ammunition", type: "ammunition" }];
              const newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
              await newItem[0].sheet.render(true);
            },
          },
          three: {
            label: "Armor",
            callback: async () => {
              const itemData = [{ name: "New Armor", type: "armor" }];
              const newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
              await newItem[0].sheet.render(true);
            },
          },
          four: {
            label: "Weapon",
            callback: async () => {
              const itemData = [{ name: "New Weapon", type: "weapon" }];
              const newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
              await newItem[0].sheet.render(true);
            },
          },
          five: {
            label: "Cancel",
            callback: () => {},
          },
        },
        default: "one",
        close: () => {},
      });

      d.render(true);
    } else {
      // Create item of the specified type directly
      const itemData = [{ name: `New ${itemType}`, type: itemType }];
      const newItem = await this.actor.createEmbeddedDocuments("Item", itemData);
      await newItem[0].sheet.render(true);
    }
  }

  /**
   * Duplicate an item
   * @param {Item} item The item to duplicate
   * @private
   */
  async _duplicateItem(item) {
    const d = new Dialog({
      title: "Duplicate Item",
      content: `<div style="padding: 10px; display: flex; flex-direction: row; align-items: center; justify-content: center;">
                  <div>Duplicate Item?</div>
                </div>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: () => {},
        },
        two: {
          label: "Duplicate",
          callback: async () => {
            const newItem = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
            await newItem[0].sheet.render(true);
          },
        },
      },
      default: "two",
      close: () => {},
    });

    d.render(true);
  }

  /**
   * Handle toggling item equipped state
   * @param {Event} event The originating click event
   * @private
   */
  async _onItemEquip(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const itemId = li?.dataset?.itemId;
    if (!itemId) return;

    const item = this.actor.items.get(itemId);
    if (!item) return;

    const current = Boolean(item?.system?.equipped);
    await item.update({ "system.equipped": !current });
  }

  /**
   * Handle incrementing item quantity
   * @param {Event} event The originating click event
   * @private
   */
  async _onPlusQty(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;

    const currentQty = Number(item.system.quantity ?? 0);
    await item.update({ "system.quantity": currentQty + 1 });
  }

  /**
   * Handle decrementing item quantity
   * @param {Event} event The originating contextmenu event
   * @private
   */
  async _onMinusQty(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    const item = this.actor.items.get(li.dataset.itemId);
    if (!item) return;

    const currentQty = Number(item.system.quantity ?? 0);
    const newQty = Math.max(currentQty - 1, 0);

    if (newQty === 0 && currentQty > 0) {
      ui.notifications.info(`You have used your last ${item.name}!`);
    }

    await item.update({ "system.quantity": newQty });
  }

  async _onViewMember(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset?.uuid || event.currentTarget.closest(".member-item")?.dataset?.uuid;
    if (!uuid) return;
    
    const actor = await fromUuid(uuid);
    if (actor) actor.sheet.render(true);
  }

  async _onRemoveMember(event) {
    event.preventDefault();
    if (!this.actor.isOwner) return;

    const uuid = event.currentTarget.closest(".member-item").dataset.uuid;
    const members = this.actor.system.members.filter(m => m.id !== uuid);
    await this.actor.update({ "system.members": members });
  }

  async _onItemShow(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }

  async _onItemDelete(event) {
    event.preventDefault();
    if (!this.actor.isOwner) return;

    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Show confirmation dialog
    const itemNameEscaped = item.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    const confirmed = await Dialog.confirm({
      title: "Delete Item",
      content: `<p>Are you sure you want to delete <strong>${itemNameEscaped}</strong>?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      await item.delete();
      ui.notifications.info(`${item.name} deleted from group inventory.`);
    }
  }

  async _onChangePace(event) {
    event.preventDefault();
    const paces = ["slow", "normal", "fast"];
    const current = this.actor.system.travelPace || "normal";
    const currentIndex = paces.indexOf(current);
    const newIndex = (currentIndex + 1) % paces.length;
    await this.actor.update({ "system.travelPace": paces[newIndex] });
  }

  async _onShortRest(event) {
    event.preventDefault();

    const members = await this._resolveMembers(this.actor.system.members);
    const visibleMembers = members.filter(m => m.canView && m.actor);

    if (!visibleMembers.length) {
      ui.notifications.warn("No members available for rest.");
      return;
    }

    let content = "<h3>Short Rest (1 hour)</h3><ul>";

    for (const member of visibleMembers) {
      const actor = member.actor;
      const fatigueLevel = actor.system.fatigue?.level || 0;
      const currentSP = actor.system.stamina?.value || 0;
      const maxSP = actor.system.stamina?.max || 0;
      const currentMP = actor.system.magicka?.value || 0;
      const maxMP = actor.system.magicka?.max || 0;

      // RAW: Remove 1 fatigue OR recover 1 SP
      if (fatigueLevel > 0) {
        await actor.update({ "system.fatigue.level": fatigueLevel - 1 });
        content += `<li><b>${actor.name}</b>: Removed 1 fatigue (now ${fatigueLevel - 1})</li>`;
      } else if (currentSP < maxSP) {
        await actor.update({ "system.stamina.value": currentSP + 1 });
        content += `<li><b>${actor.name}</b>: Recovered 1 SP (now ${currentSP + 1}/${maxSP})</li>`;
      } else {
        content += `<li><b>${actor.name}</b>: No recovery needed</li>`;
      }

      // RAW: Recover MP = floor(maxMP / 10)
      const mpRecover = Math.floor(maxMP / 10);
      if (mpRecover > 0 && currentMP < maxMP) {
        const newMP = Math.min(currentMP + mpRecover, maxMP);
        await actor.update({ "system.magicka.value": newMP });
        content += ` (+${mpRecover} MP)`;
      }
    }

    content += "</ul>";

    // Update last rest timestamp
    await this.actor.update({ "system.lastRest.short": game.time.worldTime });

    // Post to chat
    await ChatMessage.create({
      user: game.user.id,
      speaker: { alias: this.actor.name },
      content: content,
      whisper: this._getGMUserIds()
    });

    ui.notifications.info("Short rest completed.");
  }

  async _onLongRest(event) {
    event.preventDefault();

    const members = await this._resolveMembers(this.actor.system.members);
    const visibleMembers = members.filter(m => m.canView && m.actor);

    if (!visibleMembers.length) {
      ui.notifications.warn("No members available for rest.");
      return;
    }

    let content = "<h3>Long Rest (8 hours)</h3><ul>";

    for (const member of visibleMembers) {
      const actor = member.actor;
      const endBonus = Math.floor((actor.system.characteristics?.end?.total || 0) / 10);
      const fatigueLevel = actor.system.fatigue?.level || 0;
      const currentHP = actor.system.hp?.value || 0;
      const maxHP = actor.system.hp?.max || 0;
      const maxSP = actor.system.stamina?.max || 0;
      const maxMP = actor.system.magicka?.max || 0;
      const hasWounds = actor.system.wounded || false;

      let recoveryText = "";

      // RAW: Remove END bonus fatigue levels
      if (fatigueLevel > 0) {
        const fatigueRemoved = Math.min(fatigueLevel, endBonus);
        await actor.update({ "system.fatigue.level": fatigueLevel - fatigueRemoved });
        recoveryText += `Removed ${fatigueRemoved} fatigue; `;
      }

      // RAW: Heal END bonus HP (only if no wounds)
      if (!hasWounds && currentHP < maxHP) {
        const hpHealed = Math.min(endBonus, maxHP - currentHP);
        await actor.update({ "system.hp.value": currentHP + hpHealed });
        recoveryText += `Healed ${hpHealed} HP; `;
      } else if (hasWounds) {
        recoveryText += "Cannot heal HP (wounded); ";
      }

      // RAW: Recover all SP and MP
      await actor.update({
        "system.stamina.value": maxSP,
        "system.magicka.value": maxMP
      });
      recoveryText += `Recovered all SP and MP`;

      content += `<li><b>${actor.name}</b>: ${recoveryText}</li>`;
    }

    content += "</ul>";

    // Update last rest timestamp
    await this.actor.update({ "system.lastRest.long": game.time.worldTime });

    // Post to chat
    await ChatMessage.create({
      user: game.user.id,
      speaker: { alias: this.actor.name },
      content: content,
      whisper: this._getGMUserIds()
    });

    ui.notifications.info("Long rest completed.");
  }

  async _onDeployGroup(event) {
    event.preventDefault();
    
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can deploy groups.");
      return;
    }
    
    if (!canvas.ready || !canvas.scene) {
      ui.notifications.warn("Canvas is not ready or no scene is active.");
      return;
    }
    
    const members = await this._resolveMembers(this.actor.system.members);
    const deployable = members.filter(m => m.actor && !m.missing);
    
    if (!deployable.length) {
      ui.notifications.warn("No members to deploy.");
      return;
    }
    
    // Calculate grid layout
    const memberCount = deployable.length;
    const cols = Math.ceil(Math.sqrt(memberCount));
    const rows = Math.ceil(memberCount / cols);
    
    // Get grid size
    const gridSize = canvas.grid.size;
    const spacing = gridSize; // One grid square spacing
    
    // Calculate center position on canvas with boundary checks
    const canvasRect = canvas.dimensions.sceneRect;
    const gridWidth = cols * spacing;
    const gridHeight = rows * spacing;
    
    // Ensure grid fits within canvas bounds, default to top-left if too large
    let startX = canvasRect.x + (canvasRect.width / 2) - (gridWidth / 2);
    let startY = canvasRect.y + (canvasRect.height / 2) - (gridHeight / 2);
    
    // Clamp to canvas boundaries with padding
    const padding = gridSize;
    startX = Math.max(canvasRect.x + padding, Math.min(startX, canvasRect.x + canvasRect.width - gridWidth - padding));
    startY = Math.max(canvasRect.y + padding, Math.min(startY, canvasRect.y + canvasRect.height - gridHeight - padding));
    
    // Create token documents for batch creation
    const tokenDocuments = [];
    
    for (let i = 0; i < deployable.length; i++) {
      const member = deployable[i];
      const actor = member.actor;
      
      // Calculate position in grid
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + (col * spacing);
      const y = startY + (row * spacing);
      
      // Snap to grid
      const snapped = canvas.grid.getSnappedPosition(x, y, 1);
      
      try {
        // Get token data from actor
        const tokenData = await actor.getTokenDocument();
        
        // Create token document data
        tokenDocuments.push({
          ...tokenData.toObject(),
          x: snapped.x,
          y: snapped.y,
          hidden: false
        });
      } catch (err) {
        console.error(`UESRPG | Failed to prepare token for ${actor.name}`, err);
        ui.notifications.warn(`Could not prepare token for ${actor.name}.`);
      }
    }
    
    // Batch create all tokens
    if (tokenDocuments.length > 0) {
      try {
        await canvas.scene.createEmbeddedDocuments("Token", tokenDocuments);
        ui.notifications.info(`Deployed ${tokenDocuments.length} group members in a ${cols}×${rows} grid.`);
      } catch (err) {
        console.error("UESRPG | Failed to deploy group tokens", err);
        ui.notifications.error("Failed to deploy group. See console for details.");
      }
    } else {
      ui.notifications.warn("No tokens could be deployed.");
    }
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    
    // Handle Actor drops (add to members)
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor) {
        ui.notifications.warn("Could not find actor.");
        return;
      }
      
      if (actor.type === "Group") {
        ui.notifications.warn("Cannot add a group to a group.");
        return;
      }
      
      const members = this.actor.system.members || [];
      if (members.some(m => m.id === actor.uuid)) {
        ui.notifications.warn("This actor is already a member.");
        return;
      }
      
      members.push({
        id: actor.uuid,
        uuid: actor.uuid,
        sortOrder: members.length
      });
      
      await this.actor.update({ "system.members": members });
      ui.notifications.info(`${actor.name} added to group.`);
      return;
    }
    
    // Handle Item drops (add to group inventory)
    if (data.type === "Item") {
      const ALLOWED_ITEM_TYPES = ["weapon", "armor", "ammunition", "item"];
      const STACKABLE_TYPES = ["ammunition"];
      const DEFAULT_QUANTITY = 1;
      
      if (!this.actor.isOwner) {
        ui.notifications.warn("You do not have permission to modify this group's inventory.");
        return;
      }
      
      const item = await fromUuid(data.uuid);
      if (!item) {
        ui.notifications.warn("Could not find item.");
        return;
      }
      
      // Accept weapon, armor, ammunition, and generic items
      if (!ALLOWED_ITEM_TYPES.includes(item.type)) {
        ui.notifications.warn(`Cannot add ${item.type} items to group inventory.`);
        return;
      }
      
      // Create a copy of the item in the group's inventory
      const itemData = item.toObject();
      
      // Reset quantity to 1 for single-drop unless it's stackable
      if (itemData.system?.quantity !== undefined && !STACKABLE_TYPES.includes(itemData.type)) {
        itemData.system.quantity = DEFAULT_QUANTITY;
      }
      
      await this.actor.createEmbeddedDocuments("Item", [itemData]);
      ui.notifications.info(`${item.name} added to group inventory.`);
      return;
    }
    
    // Fall back to default drop handler
    return super._onDrop(event);
  }
}
