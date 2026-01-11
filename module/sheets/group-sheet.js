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
      (data.actor.system.description ?? ""), {async: true}
    );
    data.actor.system.enrichedNotes = await TextEditor.enrichHTML(
      (data.actor.system.notes ?? ""), {async: true}
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
          img: member.img || "icons/svg/mystery-man.svg",
          qty: member.qty || 1
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
        qty: member.qty || 1,
        missing: false,
        canView: canView,
        actor: canView ? actor : null
      });
    }

    return resolved;
  }

  async activateListeners(html) {
    super.activateListeners(html);

    html.find(".member-name, .member-name-limited").click(this._onViewMember.bind(this));
    html.find(".member-portrait, .member-portrait-limited").click(this._onViewMember.bind(this));
    html.find(".member-delete").click(this._onRemoveMember.bind(this));
    html.find(".member-move-up").click(this._onMoveMember.bind(this, -1));
    html.find(".member-move-down").click(this._onMoveMember.bind(this, 1));
    html.find(".member-qty-increment").click(this._onChangeQty.bind(this, 1));
    html.find(".member-qty-decrement").click(this._onChangeQty.bind(this, -1));
    html.find(".member-qty-input").change(this._onQtyInputChange.bind(this));

    if (!this.options.editable) return;
  }
  async _onViewMember(event) {
    event.preventDefault();

    const uuid = event.currentTarget?.dataset?.uuid
      ?? event.currentTarget?.closest?.(".member-item")?.dataset?.uuid;

    if (!uuid) return;

    const member = this.resolvedMembers.find(m => m.uuid === uuid);
    if (!member || !member.actor) return;

    return member.actor.sheet.render(true);
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

  async _onChangeQty(delta, event) {
    event.preventDefault();
    const memberElement = event.currentTarget.closest(".member-item");
    const uuid = memberElement.dataset.uuid;

    const members = foundry.utils.duplicate(this.actor.system.members);
    const member = members.find(m => m.id === uuid);

    if (!member) return;

    const newQty = Math.max(1, (member.qty || 1) + delta);

    if (newQty === member.qty) return;

    member.qty = newQty;
    await this.actor.update({ "system.members": members });
  }

  async _onQtyInputChange(event) {
    event.preventDefault();
    const memberElement = event.currentTarget.closest(".member-item");
    const uuid = memberElement.dataset.uuid;
    const newQty = Math.max(1, parseInt(event.currentTarget.value) || 1);

    const members = foundry.utils.duplicate(this.actor.system.members);
    const member = members.find(m => m.id === uuid);

    if (!member) return;

    if (newQty === member.qty) return;

    member.qty = newQty;
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
    const members = foundry.utils.duplicate(this.actor.system.members || []);
    const existingIndex = members.findIndex(m => m.id === actor.uuid);

    if (existingIndex !== -1) {
      // Actor already exists, increment qty
      members[existingIndex].qty = (members[existingIndex].qty || 1) + 1;
      await this.actor.update({ "system.members": members });
      ui.notifications.info(`Increased ${actor.name} quantity to ${members[existingIndex].qty}.`);
      return true;
    }

    // Add the member with qty of 1
    const newMember = {
      id: actor.uuid,
      name: actor.name,
      img: actor.img,
      type: actor.type,
      sortOrder: members.length,
      qty: 1
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
