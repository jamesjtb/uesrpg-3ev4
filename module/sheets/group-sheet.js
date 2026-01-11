/**
 * Group actor sheet for managing party groups
 * @extends {foundry.appv1.sheets.ActorSheet}
 */
export class GroupSheet extends foundry.appv1.sheets.ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "group"],
      template: "systems/uesrpg-3ev4/templates/group-sheet.html",
      width: 720,
      height: 680,
      tabs: [
        {
          navSelector: ".sheet-tabs",
          contentSelector: ".sheet-body",
          initial: "members",
        },
      ],
      dragDrop: [{ dragSelector: ".directory-item", dropSelector: ".member-drop-zone" }],
    });
  }

  get template() {
    const path = "systems/uesrpg-3ev4/templates";
    if (!game.user.isGM && this.actor.limited) {
      return `${path}/limited-group-sheet.html`;
    }
    return `${path}/group-sheet.html`;
  }

  /** @override */
  async getData(options = {}) {
    const data = await super.getData(options);
    data.dtypes = ["String", "Number", "Boolean"];
    data.isGM = game.user.isGM;

    data.editable =
      this.isEditable ??
      this.options?.editable ??
      data.options?.editable ??
      false;

    // Enrich HTML fields
    const enrichFn = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    const description = (data.actor && data.actor.system && typeof data.actor.system.description === "string") 
      ? data.actor.system.description 
      : "";
    data.actor.system.enrichedDescription = await enrichFn(description, { async: true });
    
    const notes = (data.actor && data.actor.system && typeof data.actor.system.notes === "string") 
      ? data.actor.system.notes 
      : "";
    data.actor.system.enrichedNotes = await enrichFn(notes, { async: true });

    // Resolve members
    data.members = await this._resolveMembers();

    return data;
  }

  /**
   * Resolve member UUIDs to actor documents
   * @returns {Promise<Array>} Array of member data objects
   * @private
   */
  async _resolveMembers() {
    const members = this.actor.system.members || [];
    const resolved = [];

    for (const member of members) {
      try {
        const actor = await fromUuid(member.uuid);
        if (actor && (game.user.isGM || !actor.limited)) {
          resolved.push({
            uuid: member.uuid,
            actor: actor,
            name: actor.name,
            img: actor.img,
            type: actor.type,
            sortOrder: member.sortOrder || 0,
          });
        }
      } catch (err) {
        console.warn(`UESRPG | Failed to resolve member ${member.uuid}`, err);
      }
    }

    return resolved.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Remove member
    html.find(".member-remove").click(this._onRemoveMember.bind(this));

    // Member portrait click - open sheet
    html.find(".member-portrait").click(this._onMemberPortraitClick.bind(this));
  }

  /**
   * Handle dropping an actor onto the group sheet
   * @param {DragEvent} event
   * @private
   */
  async _onDrop(event) {
    event.preventDefault();

    // Get the dropped data
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (err) {
      return;
    }

    // Only handle Actor drops
    if (data.type !== "Actor") return;

    // Resolve the actor
    const actor = await fromUuid(data.uuid);
    if (!actor) return;

    // Don't add self or other groups
    if (actor.id === this.actor.id || actor.type === "Group") {
      ui.notifications.warn("Cannot add this actor to the group.");
      return;
    }

    // Check if already a member
    const members = this.actor.system.members || [];
    if (members.some(m => m.uuid === actor.uuid)) {
      ui.notifications.info(`${actor.name} is already a member of this group.`);
      return;
    }

    // Add to members array
    const newMember = {
      uuid: actor.uuid,
      sortOrder: members.length,
    };

    await this.actor.update({
      "system.members": [...members, newMember],
    });

    ui.notifications.info(`Added ${actor.name} to the group.`);
  }

  /**
   * Handle removing a member from the group
   * @param {Event} event
   * @private
   */
  async _onRemoveMember(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;

    const members = this.actor.system.members || [];
    const filtered = members.filter(m => m.uuid !== uuid);

    await this.actor.update({ "system.members": filtered });
  }

  /**
   * Handle clicking a member portrait to open their sheet
   * @param {Event} event
   * @private
   */
  async _onMemberPortraitClick(event) {
    event.preventDefault();
    const uuid = event.currentTarget.dataset.uuid;

    try {
      const actor = await fromUuid(uuid);
      if (actor && actor.sheet) {
        actor.sheet.render(true);
      }
    } catch (err) {
      console.warn(`UESRPG | Failed to open member sheet ${uuid}`, err);
    }
  }
}
