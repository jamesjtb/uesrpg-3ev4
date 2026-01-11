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

      const canView = actor.testUserPermission(game.user, "OBSERVER");

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
    const uuid = event.currentTarget.closest(".member-item").dataset.uuid;
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
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
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
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    ui.notifications.info("Long rest completed.");
  }

  async _onDeployGroup(event) {
    event.preventDefault();

    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can deploy groups.");
      return;
    }

    if (!canvas.ready) {
      ui.notifications.warn("Canvas is not ready.");
      return;
    }

    const members = await this._resolveMembers(this.actor.system.members);
    const deployable = members.filter(m => m.actor && !m.missing);

    if (!deployable.length) {
      ui.notifications.warn("No members to deploy.");
      return;
    }

    // Center point of scene
    const centerX = canvas.scene.dimensions.width / 2;
    const centerY = canvas.scene.dimensions.height / 2;
    const gridSize = canvas.scene.grid.size;
    const spacing = gridSize * 1.5;

    // Grid layout: calculate positions
    const cols = Math.ceil(Math.sqrt(deployable.length));
    const rows = Math.ceil(deployable.length / cols);

    const startX = centerX - ((cols - 1) * spacing) / 2;
    const startY = centerY - ((rows - 1) * spacing) / 2;

    const tokenData = [];

    for (let i = 0; i < deployable.length; i++) {
      const member = deployable[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      tokenData.push({
        actorId: member.actor.id,
        x: startX + (col * spacing),
        y: startY + (row * spacing),
        hidden: false
      });
    }

    await canvas.scene.createEmbeddedDocuments("Token", tokenData);

    ui.notifications.info(`Deployed ${deployable.length} group members.`);
  }

  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);

    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor) return;

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
    } else {
      return super._onDrop(event);
    }
  }
}
