/**
 * Group Actor Sheet
 * Enhanced sheet for managing group members with travel, rest automation, and deployment
 * @extends {ActorSheet}
 */
export class GroupSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["uesrpg", "sheet", "actor", "group"],
      width: 720,
      height: 700,
      tabs: [{
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: "members",
      }],
      dragDrop: [{
        dragSelector: ".member-item",
        dropSelector: ".member-drop-zone"
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

    // Map "item" type to "gear" for template compatibility
    data.actor.gear = data.actor.item || [];

    // Resolve member UUIDs to actor data
    data.resolvedMembers = await this._resolveMembers(data.actor.system.members);

    // Calculate average speed from visible members
    const speeds = data.resolvedMembers.filter(m => m.canView && m.speed).map(m => m.speed);
    data.averageSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;

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
    data.currentPace = data.actor.system.travel?.pace || "normal";

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

    // Member management
    html.find(".member-name").click(this._onViewMember.bind(this));
    html.find(".member-portrait").click(this._onViewMember.bind(this));
    html.find(".member-portrait-clickable").click(this._onViewMember.bind(this));
    html.find(".member-delete").click(this._onRemoveMember.bind(this));

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

  async _onChangePace(event) {
    event.preventDefault();
    const paces = ["slow", "normal", "fast"];
    const current = this.actor.system.travel?.pace || "normal";
    const currentIndex = paces.indexOf(current);
    const newIndex = (currentIndex + 1) % paces.length;
    await this.actor.update({ "system.travel.pace": paces[newIndex] });
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
    
    ui.notifications.info(`Click on the canvas to place each group member. Right-click to cancel.`);
    
    // Deploy members sequentially with ghost placement
    let deployedCount = 0;
    
    for (const member of deployable) {
      const actor = member.actor;
      
      try {
        // Create token document data
        const tokenData = await actor.getTokenDocument();
        
        // Show preview and wait for user placement
        const placed = await this._placeTokenWithPreview(tokenData, actor.name);
        
        if (placed) {
          deployedCount++;
        } else {
          // User cancelled - stop deploying
          break;
        }
      } catch (err) {
        console.error(`UESRPG | Failed to deploy ${actor.name}`, err);
        ui.notifications.error(`Failed to deploy ${actor.name}. See console.`);
      }
    }
    
    if (deployedCount > 0) {
      ui.notifications.info(`Deployed ${deployedCount} of ${deployable.length} group members.`);
    } else {
      ui.notifications.warn("No members were deployed.");
    }
  }

  /**
   * Place a single token with interactive ghost preview.
   * Returns true if placed, false if cancelled.
   */
  async _placeTokenWithPreview(tokenData, actorName) {
    const GHOST_ALPHA = 0.6; // Semi-transparent preview
    
    return new Promise((resolve) => {
      let settled = false;
      
      const settle = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };
      
      // Create preview token
      const preview = new CONFIG.Token.objectClass(tokenData);
      preview.alpha = GHOST_ALPHA;
      
      canvas.tokens.preview.addChild(preview);
      
      // Track mouse movement
      const onMouseMove = (event) => {
        if (!event.interactionData) return;
        
        const position = event.interactionData.getLocalPosition(canvas.tokens);
        const snapped = canvas.grid.getSnappedPosition(position.x, position.y, 1);
        
        preview.document.x = snapped.x;
        preview.document.y = snapped.y;
        preview.refresh();
      };
      
      // Left-click to place
      const onLeftClick = async (event) => {
        if (!event.interactionData) return;
        
        const position = event.interactionData.getLocalPosition(canvas.tokens);
        const snapped = canvas.grid.getSnappedPosition(position.x, position.y, 1);
        
        try {
          // Create real token at this position
          await canvas.scene.createEmbeddedDocuments("Token", [{
            ...tokenData.toObject(),
            x: snapped.x,
            y: snapped.y,
            hidden: false
          }]);
          
          settle(true);
        } catch (err) {
          console.error("UESRPG | Token placement failed", err);
          ui.notifications.error(`Failed to place ${actorName}.`);
          settle(false);
        }
      };
      
      // Right-click to cancel
      const onRightClick = () => {
        ui.notifications.info(`Cancelled placement of ${actorName}.`);
        settle(false);
      };
      
      // Cleanup function
      const cleanup = () => {
        canvas.tokens.preview.removeChild(preview);
        canvas.stage.off("mousemove", onMouseMove);
        canvas.stage.off("click", onLeftClick);
        canvas.stage.off("rightclick", onRightClick);
      };
      
      // Register event listeners
      canvas.stage.on("mousemove", onMouseMove);
      canvas.stage.on("click", onLeftClick);
      canvas.stage.on("rightclick", onRightClick);
      
      // Show instruction
      ui.notifications.info(`Place ${actorName} on the canvas. Right-click to cancel.`);
    });
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
