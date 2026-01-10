/**
 * Group Actor Sheet
 * Simple container sheet for managing group members
 * @extends {ActorSheet}
 */
export class GroupSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["worldbuilding", "sheet", "actor", "group"],
      width: 600,
      height: 700,
      tabs: [{
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: "members",
      }],
      dragDrop: [{
        dragSelector: ".member-list .member-item",
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

    // Enrich HTML fields
    data.actor.system.enrichedDescription = await TextEditor.enrichHTML(
      data.actor.system.description, {async: true}
    );
    data.actor.system.enrichedNotes = await TextEditor.enrichHTML(
      data.actor.system.notes, {async: true}
    );

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
        actor: canView ? actor : null
      });
    }

    return resolved;
  }

  async activateListeners(html) {
    super.activateListeners(html);

    html.find(".member-name").click(this._onViewMember.bind(this));
    html.find(".member-portrait").click(this._onViewMember.bind(this));
    html.find(".member-delete").click(this._onRemoveMember.bind(this));
    html.find(".member-move-up").click(this._onMoveMember.bind(this, -1));
    html.find(".member-move-down").click(this._onMoveMember.bind(this, 1));

    if (!this.options.editable) return;
  }

  async _onViewMember(event) {
    event.preventDefault();
    const memberElement = event.currentTarget.closest(".member-item");
    const uuid = memberElement.dataset.uuid;

    const actor = await fromUuid(uuid);
    if (actor && actor.testUserPermission(game.user, "OBSERVER")) {
      actor.sheet.render(true);
    } else {
      ui.notifications.warn("You do not have permission to view this actor.");
    }
  }

  async _onRemoveMember(event) {
    event.preventDefault();
    const memberElement = event.currentTarget.closest(".member-item");
    const uuid = memberElement.dataset.uuid;

    const members = foundry.utils.duplicate(this.actor.system.members);
    const index = members.findIndex(m => m.id === uuid);

    if (index !== -1) {
      members.splice(index, 1);
      await this.actor.update({ "system.members": members });
    }
  }

  async _onMoveMember(direction, event) {
    event.preventDefault();
    const memberElement = event.currentTarget.closest(".member-item");
    const uuid = memberElement.dataset.uuid;

    const members = foundry.utils.duplicate(this.actor.system.members);
    const index = members.findIndex(m => m.id === uuid);

    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= members.length) return;

    // Swap elements
    [members[index], members[newIndex]] = [members[newIndex], members[index]];

    // Update sort orders
    members.forEach((m, i) => m.sortOrder = i);

    await this.actor.update({ "system.members": members });
  }

  async _onDrop(event) {
    event.preventDefault();

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      return false;
    }

    if (data.type !== "Actor") return;

    const actor = await fromUuid(data.uuid);
    if (!actor) {
      ui.notifications.error("Could not find the dropped actor.");
      return false;
    }

    // Prevent self-reference
    if (actor.uuid === this.actor.uuid) {
      ui.notifications.warn("A group cannot contain itself.");
      return false;
    }

    // Check for circular references
    if (actor.type === 'Group') {
      const wouldBeCircular = await this.actor._wouldCreateCircularReference(actor.uuid);
      if (wouldBeCircular) {
        ui.notifications.warn("Cannot add this group - it would create a circular reference.");
        return false;
      }
    }

    // Check if already a member
    const members = this.actor.system.members || [];
    if (members.some(m => m.id === actor.uuid)) {
      ui.notifications.info(`${actor.name} is already a member of this group.`);
      return false;
    }

    // Add the member
    const newMember = {
      id: actor.uuid,
      name: actor.name,
      img: actor.img,
      type: actor.type,
      sortOrder: members.length
    };

    const updatedMembers = [...members, newMember];
    await this.actor.update({ "system.members": updatedMembers });

    ui.notifications.info(`Added ${actor.name} to ${this.actor.name}.`);
    return true;
  }

  async _onDropActor(event, data) {
    return this._onDrop(event);
  }
}
