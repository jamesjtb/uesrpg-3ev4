/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
import { getDamageTypeFromWeapon } from "../combat/combat-utils.js";
import { requireUserCanRollActor } from "../helpers/permissions.js";
import { doTestRoll, formatDegree } from "../helpers/degree-roll-helper.js";
import { computeSkillTN, SKILL_DIFFICULTIES } from "../skills/skill-tn.js";
import { buildSkillRollRequest, normalizeSkillRollOptions } from "../skills/roll-request.js";
import { SkillOpposedWorkflow } from "../skills/opposed-workflow.js";
import { OpposedWorkflow } from "../combat/opposed-workflow.js";
import { postItemToChat } from "./shared-handlers.js";
import {
  buildCombatQuickContext,
  buildCollapsedActionCardHtml,
  getAimStateFromEffect,
  getEnabledEffectByKey,
  resolveFirstTargetedToken,
  resolveTokenForActor,
  spendActionPoints
} from "./combat-actions-utils.js";
import { buildSpecialActionsForActor, getActiveCombatStyleId, getExplicitActiveCombatStyleItem, isSpecialActionUsableNow } from "../combat/combat-style-utils.js";
import { AimAudit } from "../combat/aim-audit.js";
import { createOrUpdateStatusEffect } from "../effects/status-effect.js";
import { getSpecialActionById } from "../config/special-actions.js";
import {
  getCollapsedGroups,
  setGroupCollapsed,
  getLoadoutsForActor,
  saveLoadoutForActor,
  deleteLoadout,
  applyLoadoutToActor
} from "./sheet-ui-state.js";
import { bindCommonSheetListeners, bindCommonEditableInventoryListeners } from "./sheet-listeners.js";
import { shouldHideFromMainInventory } from "./sheet-inventory.js";
import { prepareCharacterItems } from "./sheet-prepare-items.js";
import { registerHPButtonHandler } from "./actor-sheet-hp-integration.js";
import { classifySpellForRouting, getUserSpellTargets, shouldUseTargetedSpellWorkflow, shouldUseModernSpellWorkflow, debugMagicRoutingLog } from "../magic/spell-routing.js";
import { filterTargetsBySpellRange, getSpellRangeType, placeAoETemplateAndCollectTargets } from "../magic/spell-range.js";

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
  async getData(options = {}) {
    const data = await super.getData(options);
    data.dtypes = ["String", "Number", "Boolean"];
    data.isGM = game.user.isGM;

    data.editable =
      this.isEditable ??
      this.options?.editable ??
      data.options?.editable ??
      false;

    // Prepare Items
    if (this.actor.type === "NPC") {
      this._prepareCharacterItems(data);
    }

    // Combat tab quick actions + equipped summary (template-friendly)
    try {
      data.actor.sheetCombatQuick = buildCombatQuickContext(data.actor);
    } catch (e) {
      data.actor.sheetCombatQuick = {
        combatStyleName: null,
        meleeWeaponId: null,
        meleeWeaponName: null,
        rangedWeaponId: null,
        rangedWeaponName: null,
        equippedAmmo: [],
        equippedArmor: [],
        equippedShields: [],
      };
    }

    
    // Combat tab: Active Combat Style selection + Special Actions registry
    try {
      const combatStyles = this.actor?.items?.filter?.(i => i.type === "combatStyle") ?? [];
      const activeCombatStyleId = getActiveCombatStyleId(this.actor);
      const activeStyleItem = getExplicitActiveCombatStyleItem(this.actor);

      const specialActions = buildSpecialActionsForActor(this.actor).map(sa => ({
        ...sa,
        usableNow: isSpecialActionUsableNow(this.actor, sa.actionType),
        usableAsAdvantage: Boolean(sa.known)
      }));

      data.actor.sheetCombatActions = {
        activeCombatStyleId: activeCombatStyleId ?? "",
        combatStyles: combatStyles.map(cs => ({ id: cs.id, name: cs.name, isActive: Boolean(activeCombatStyleId && cs.id === activeCombatStyleId) })),
        activeCombatStyleName: activeStyleItem?.name ?? null,
        specialActions,
        canCastMagic: Boolean(this.actor?.items?.some?.(i => i.type === "spell"))
      ,
      canCastInstantMagic: Boolean(this.actor?.items?.some?.(i => i.type === "spell" && i?.system?.isInstant === true))};
    } catch (_e) {
      data.actor.sheetCombatActions = { activeCombatStyleId: "", combatStyles: [], activeCombatStyleName: null, specialActions: [], canCastMagic: false };
    }
// Disable attack quick actions while Defensive Stance is active (RAW: Attack limit 0 until next Turn).
    try {
      const hasDefensiveStance = this.actor?.effects?.some((e) => !e.disabled && e?.flags?.uesrpg?.key === "defensiveStance");
      if (hasDefensiveStance && data?.actor?.sheetCombatQuick) {
        data.actor.sheetCombatQuick.quickAttacksDisabled = true;
        data.actor.sheetCombatQuick.quickAttacksDisabledReason = "Defensive Stance: attacks disabled until your next Turn.";
      }
    } catch (_e) {
      /* no-op */
    }

    // Sheet UI toggles (no actor schema changes)
    const enableLoadouts = Boolean(game?.settings?.get?.("uesrpg-3ev4", "enableLoadouts"));
    const showDiagnostics = Boolean(game?.settings?.get?.("uesrpg-3ev4", "sheetDiagnostics"));
    const loadouts = enableLoadouts ? await getLoadoutsForActor(this.actor.id) : [];
    data.sheetUi = {
      enableLoadouts,
      showDiagnostics,
      loadouts,
    };

    // Enrich biography using Foundry v13 namespaced TextEditor API (AppV1-safe)
    const enrichFn = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    const bio =
      (data.actor && data.actor.system && typeof data.actor.system.bio === "string")
        ? data.actor.system.bio
        : "";
    data.actor.system.enrichedBio = await enrichFn(bio, { async: true });
    // Active Effects (for Effects tab templates)
    if (this.actor && this.actor.effects) {
      data.effects = this.actor.effects.contents.map(e => e.toObject());
    } else {
      data.effects = [];
    }


    return data;
  }

  _prepareCharacterItems(sheetData) {
    return prepareCharacterItems(sheetData, { includeSkills: false, includeMagicSkills: false });
  }

  get template() {
    const path = "systems/uesrpg-3ev4/templates";
    return `${path}/${this.actor.type.toLowerCase()}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
async activateListeners(html) {
  super.activateListeners(html);

  // Rollable Buttons
  html.find(".characteristic-roll").click(this._onClickCharacteristic.bind(this));
  if (typeof this._onProfessionsRoll === "function") html.find(".professions-roll").click(this._onProfessionsRoll.bind(this));
  html.find(".damage-roll").click(this._onDamageRoll.bind(this));
  html.find(".magic-roll").click(this._onMagicSkillRoll.bind(this));
  html.find(".resistance-roll").click(this._onResistanceRoll.bind(this));
  html.find(".ammo-roll").click(this._onAmmoRoll.bind(this));
  html.find(".defend-roll").click(this._onDefendRoll.bind(this));
  html.find(".uesrpg-cast-magic").click(this._onCastMagicAction.bind(this));
  
  // Item image click handler with debounce protection for talents/traits/powers
  html.find(".item-img").on("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const li = $(event.currentTarget).closest(".item, tr, li");
    const itemId = li.data("itemId");
    const item = this.actor.items.get(itemId);
    
    if (!item) return;
    
    // For talent, trait, and power: send to chat ONCE (use shared handler)
    if (["talent", "trait", "power"].includes(item.type)) {
      // Debounce protection
      const sendKey = `_sending_${itemId}`;
      if (this[sendKey]) return;
      this[sendKey] = true;
      
      try {
        await postItemToChat(event, this.actor, { includeImage: this.actor.type === "Player Character" });
      } finally {
        setTimeout(() => delete this[sendKey], 500);
      }
      return;
    }
    
    // For other items, show the sheet
    if (item.sheet) item.sheet.render(true);
  });

  // Spell item click to open sheet (matching PC behavior)
  html.find('.spell-row .item-img, .spell-row .item-name').on('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const row = ev.currentTarget.closest('.spell-row');
    const itemId = row?.dataset?.itemId;
    if (!itemId) return;
    
    const item = this.actor.items.get(itemId);
    if (item) {
      item.sheet.render(true);
    }
  });

  // Update Item Attributes from Actor Sheet
  html.find(".toggle2H").click(this._onToggle2H.bind(this));
  html.find(".plusQty").click(this._onPlusQty.bind(this));
  html.find(".minusQty").contextmenu(this._onMinusQty.bind(this));
  html.find(".itemEquip").click(this._onItemEquip.bind(this));

  html.find(".itemTabInfo .wealthCalc").click(this._onWealthCalc.bind(this));
  html.find(".setBaseCharacteristics, .characteristics-config").click(this._onSetBaseCharacteristics.bind(this));
  html.find(".characteristics-config").keydown((ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._onSetBaseCharacteristics(ev);
    }
  });
  html.find(".carryBonus").click(this._onCarryBonus.bind(this));
  html.find(".wealthCalc").click(this._onWealthCalc.bind(this));

  html.find(".incrementResource").click(this._onIncrementResource.bind(this));
  // Resource restore (migrated from label button)
  html.find(".restoreResource").click(this._onResetResource.bind(this));
  
  // Register HP button handler to open HP/Temp HP dialog
  registerHPButtonHandler(this, html);
  
  // html.find("#spellFilter").click(this._filterSpells.bind(this)); // REMOVED: Spell filter dropdown removed in spell school categorization
  html.find("#itemFilter").click(this._filterItems.bind(this));
  html.find(".incrementFatigue").click(this._incrementFatigue.bind(this));
  html.find(".equip-items").click(this._onEquipItems.bind(this));

  // Checks UI Elements for update
  // this._createSpellFilterOptions(); // REMOVED: Spell filter dropdown removed in spell school categorization
  this._createItemFilterOptions();
  // this._setDefaultSpellFilter(); // REMOVED: Spell filter dropdown removed in spell school categorization
  this._setDefaultItemFilter();
  this._setResourceBars();
  this._createStatusTags();

  // Common listener binding (PC + NPC)
  bindCommonSheetListeners(this, html);
  bindCommonEditableInventoryListeners(this, html);
}

  /**
   * Handle Combat tab quick-action buttons.
   * Delegates to existing combat helpers where applicable.
   *
   * Supported actions:
   * - attack (requires weaponId + targeted token)
   * - disengage (chat card)
   * - delay (chat card)
   * - defensive-stance (chat card + AE)
   * - aim (chat card + AE)
   * - dash (chat card)
   * - hide (chat card)
   * - use-item (dialog + chat card)
   *
   * @param {Event} event
   * @private
   */
  async _onCombatQuickAction(event) {
    event.preventDefault();

    const btn = event.currentTarget;
    const action = btn?.dataset?.action;
    if (!action) return;

    // Preserve the currently selected Actions subtab across any actor updates
    // triggered by this quick action (AP spend, effect application, etc.).
    try {
      const active = this.element?.find?.(".uesrpg-actions-subtab.active")?.[0];
      const tab = active?.dataset?.actionstab;
      if (tab) this._uesrpgActionsSubtab = tab;
    } catch (_e) {
      // no-op
    }

    // Local helpers (kept within the sheet class to avoid new global utilities).
    const postActionCard = async (title, bodyHtml) => {
      const speaker = ChatMessage.getSpeaker({ actor: this.actor });
      const content = buildCollapsedActionCardHtml(title, bodyHtml);
      return ChatMessage.create({ user: game.user.id, speaker, content });
    };

    const requireAP = async (title, apCost = 1) => {
      return spendActionPoints(this.actor, apCost, { reason: title });
    };

    const upsertSimpleEffect = async ({ key, name, icon, changes, flags = {}, statusId = null, duration = null }) => {
      const mergedFlags = {
        ...(flags ?? {}),
        uesrpg: { ...(flags?.uesrpg ?? {}), key }
      };

      return createOrUpdateStatusEffect(this.actor, {
        statusId,
        name,
        img: icon,
        duration: duration ?? {},
        changes: Array.isArray(changes) ? changes : [],
        flags: mergedFlags
      });
    };



    const buildTemporaryDuration = ({ rounds = null, seconds = null } = {}) => {
      const combat = game.combat ?? null;
      if (combat && combat.started) {
        const r = Number(rounds);
        const out = {
          startRound: Number(combat.round ?? 0) || 0,
          startTurn: Number(combat.turn ?? 0) || 0,
        };
        if (Number.isFinite(r) && r > 0) out.rounds = r;
        return out;
      }

      const s = Number(seconds);
      const startTime = Number(game?.time?.worldTime ?? 0) || 0;
      if (Number.isFinite(s) && s > 0) return { startTime, seconds: s };
      return {};
    };

    const _deleteEffect = async (effect) => {
      if (!effect) return;
      try {
        await this.actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      } catch (err) {
        console.warn("UESRPG | NPC sheet quick action failed to delete effect", { actor: this.actor?.uuid, effectId: effect?.id, err });
      }
    };

    const breakAimChainIfPresent = async () => {
      const ef = getEnabledEffectByKey(this.actor, "aim");
      if (!ef) return;
      await _deleteEffect(ef);
    };

    switch (action) {
      case "specialAction": {
        const specialId = btn?.dataset?.specialId;
        const at = String(btn?.dataset?.actionType ?? "").toLowerCase();
        const def = getSpecialActionById(specialId);
        const title = def ? `Special Action: ${def.name}` : "Special Action";

        if (!def) {
          ui.notifications?.warn?.("Unknown Special Action.");
          return;
        }

        if (at === "primary" && !isSpecialActionUsableNow(this.actor, "primary")) {
          ui.notifications?.warn?.("This Primary Special Action is only available on your Turn.");
          return;
        }

        // Consume AP
        const ok = await requireAP(title, 1);
        if (!ok) return;

        // Resolve tokens
        let actorToken = canvas.tokens?.controlled?.[0] ?? null;
        if (!actorToken) {
          actorToken = canvas.tokens?.placeables?.find(t => t.actor?.id === this.actor.id) ?? null;
        }

        const targets = Array.from(game.user.targets ?? []);
        const targetToken = targets[0] ?? null;

        if (!targetToken && specialId !== "arise") {
          ui.notifications.warn(`${def.name} requires a targeted token.`);
          return;
        }

        // Arise doesn't need opposed test
        if (specialId === "arise") {
          const { executeSpecialAction } = await import("../combat/special-actions-helper.js");
          const result = await executeSpecialAction({
            specialActionId: specialId,
            actor: this.actor,
            target: null,
            isAutoWin: false,
            opposedResult: { winner: "attacker" }
          });

          if (result.success) {
            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: `<div class="uesrpg-special-action-outcome"><b>Special Action:</b><p>${result.message}</p></div>`,
              style: CONST.CHAT_MESSAGE_STYLES.OTHER
            });
          }
          return;
        }

        // Create skill opposed test WITHOUT pre-selecting skill
        // Let user choose from dropdown in card (includes Combat Styles)
        const message = await SkillOpposedWorkflow.createPending({
          attackerTokenUuid: actorToken?.document?.uuid ?? actorToken?.uuid,
          defenderTokenUuid: targetToken?.document?.uuid ?? targetToken?.uuid,
          attackerSkillUuid: null,  // Let user choose from dropdown in card
          attackerSkillLabel: `${def.name} (Special Action)`
        });

        // Tag with Special Action metadata
        const state = message?.flags?.["uesrpg-3ev4"]?.skillOpposed?.state;
        if (state) {
          state.specialActionId = specialId;
          state.allowCombatStyle = true; // Allow Combat Style as a test option

          await message.update({
            flags: {
              "uesrpg-3ev4": {
                skillOpposed: {
                  version: state.version ?? 1,
                  state
                }
              }
            }
          });
        }

        return;
      }

      case "attack": {
        // Defensive Stance: Attack limit reduced to 0 until next Turn.
        if (this.actor?.effects?.some((e) => !e.disabled && e?.flags?.uesrpg?.key === "defensiveStance")) {
          ui.notifications?.warn?.("Defensive Stance is active: you cannot attack until your next Turn.");
          return;
        }
        if (!requireUserCanRollActor(game.user, this.actor)) return;
        const weaponId = btn?.dataset?.weaponId;
        if (!weaponId) {
          ui.notifications.warn("No weapon configured for this action.");
          return;
        }

        const weapon = this.actor.items.get(weaponId);
        if (!weapon) {
          ui.notifications.warn("Selected weapon could not be found on this actor.");
          return;
        }

        const attackerToken = resolveTokenForActor(this.actor);
        if (!attackerToken) {
          ui.notifications.warn("Please place and select a token for this actor.");
          return;
        }

        const defenderToken = resolveFirstTargetedToken();
        if (!defenderToken) {
          ui.notifications.warn("Please target an enemy token.");
          return;
        }

        const base = Number(this.actor.system?.professions?.combat ?? 0) || 0;
        const fatiguePenalty = Number(this.actor.system?.fatigue?.penalty ?? 0) || 0;
        const carryPenalty = Number(this.actor.system?.carry_rating?.penalty ?? 0) || 0;
        const woundPenalty = Number(this.actor.system?.woundPenalty ?? 0) || 0;
        const tn = base + fatiguePenalty + carryPenalty + woundPenalty;

        const label = String(btn?.dataset?.label ?? "Attack");
        const attackMode = label.toLowerCase().includes("ranged") ? "ranged" : "melee";

        await OpposedWorkflow.createPending({
          attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
          defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
          attackerActorUuid: this.actor.uuid,
          defenderActorUuid: defenderToken.actor?.uuid ?? null,
          attackerItemUuid: "prof:combat",
          attackerLabel: `${label} — Combat (Profession)`,
          attackerTarget: tn,
          mode: "attack",
          attackMode,
          weaponUuid: weapon.uuid
        });
        return;
      }

      case "disengage": {
        if (!(await requireAP("Disengage", 1))) return;
        await breakAimChainIfPresent();
        await postActionCard(
          "Disengage",
          "<p>The character can use this action to retreat from combat with an enemy. If they move out of an enemy’s engagement range during this Turn then the attack of opportunity reaction or other delayed actions/reactions may not be taken against them.</p>"
        );
        return;
      }

      case "delay": {
        if (!(await requireAP("Delay Turn", 1))) return;
        await breakAimChainIfPresent();
        await postActionCard(
          "Delay Turn",
          "<p>The character declares a set of circumstances in which they will act. The character then skips their Turn and may insert their delayed Turn into the order as a reaction if the conditions are met.</p>"
        );
        return;
      }

      case "defensive-stance": {
        if (!(await requireAP("Defensive Stance", 1))) return;
        await breakAimChainIfPresent();
        // RAW: +10 defensive tests until next Turn; Attack limit reduced to 0 until next Turn.
        await postActionCard(
          "Defensive Stance",
          "<p><strong>Effect:</strong> +10 on defensive tests until your next Turn. Your Attack limit is reduced to 0 until your next Turn.</p>"
        );

        const ADD = globalThis?.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
        const combat = game.combat ?? null;
        const combatant = combat?.combatants?.find?.((c) => c?.actor?.id === this.actor.id) ?? null;
        const expiresFlags = (() => {
          if (!(combat && combat.started && combatant)) return {};
          const combatId = String(combat.id ?? "");
          const combatantId = String(combatant.id ?? "");
          const turns = Array.isArray(combat.turns) ? combat.turns : [];
          const idx = turns.findIndex((t) => String(t?.id ?? "") === combatantId);
          const currentTurn = Number(combat.turn ?? 0);
          const currentRound = Number(combat.round ?? 0);

          // Expire at the start of this actor's next turn (same round if not yet acted; otherwise next round).
          const expiresTurn = idx >= 0 ? idx : currentTurn;
          const expiresRound =
            (idx >= 0 && Number.isFinite(currentTurn) && Number.isFinite(currentRound) && idx <= currentTurn)
              ? (currentRound + 1)
              : currentRound;

          return {
            expiresOnTurnStart: true,
            expiresCombatId: combatId,
            expiresRound,
            expiresTurn,
            expiresCombatantId: combatantId
          };
        })();
        await upsertSimpleEffect({
          key: "defensiveStance",
          name: "Defensive Stance",
          icon: "systems/uesrpg-3ev4/images/Icons/heroicDefense.webp",
          statusId: "uesrpg-action-defensive-stance",
          duration: {}, // Turn-ticker managed; avoid duration races with external modules
          changes: [
            { key: "system.modifiers.combat.defenseTN.total", mode: ADD, value: 10, priority: 20 },
          ],
          flags: {
            uesrpg: {
              source: "action",
              ...expiresFlags
            }
          }
        });
        return;
      }

      case "aim": {
        const ADD = globalThis?.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;

        // RAW: The character must continuously Aim at the same weapon/spell.
        // Always prompt to select what is being aimed.
        const candidates = [];
        try {
          const weapons = (this.actor.items ?? []).filter((i) => i?.type === "weapon" && Boolean(i?.system?.equipped));

          const isThrownWeapon = (w) => {
            try {
              const kind = String(w?.system?.rangeBandsDerivedEffective?.kind ?? w?.system?.rangeBandsDerived?.kind ?? "").toLowerCase();
              if (kind === "thrown") return true;

              const norm = (v) => String(v ?? "").toLowerCase().replace(/[\s_-]+/g, "");
              const target = "thrown";

              const structured = Array.isArray(w?.system?.qualitiesStructuredInjected)
                ? w.system.qualitiesStructuredInjected
                : Array.isArray(w?.system?.qualitiesStructured)
                  ? w.system.qualitiesStructured
                  : null;
              if (structured) {
                for (const q of structured) {
                  const k = norm(q?.key ?? q);
                  if (k && k == target) return true;
                }
              }

              const traits = Array.isArray(w?.system?.qualitiesTraitsInjected)
                ? w.system.qualitiesTraitsInjected
                : Array.isArray(w?.system?.qualitiesTraits)
                  ? w.system.qualitiesTraits
                  : null;
              if (traits) {
                for (const t of traits) {
                  const k = norm(t);
                  if (k && k == target) return true;
                }
              }

              const legacy = Array.isArray(w?.system?.qualities) ? w.system.qualities : null;
              if (legacy) {
                for (const q of legacy) {
                  const k = norm(q?.key ?? q);
                  if (k && k == target) return true;
                }
              }

              const legacyTraits = Array.isArray(w?.system?.qualitiesTraitsLegacy) ? w.system.qualitiesTraitsLegacy : null;
              if (legacyTraits) {
                for (const t of legacyTraits) {
                  const k = norm(t);
                  if (k && k == target) return true;
                }
              }
            } catch (_e) {
              // no-op
            }
            return false;
          };

          const rangedOrThrownWeapons = weapons.filter((w) => {
            const mode = String(w?.system?.attackMode ?? "").toLowerCase();
            if (mode === "ranged") return true;
            return isThrownWeapon(w);
          });

          for (const w of rangedOrThrownWeapons) {
            const labelPrefix = isThrownWeapon(w) && String(w?.system?.attackMode ?? "").toLowerCase() !== "ranged" ? "Weapon (Thrown)" : "Weapon";
            candidates.push({ uuid: w.uuid, label: `${labelPrefix}: ${w.name}`, kind: "weapon" });
          }
        } catch (_e) {
          // no-op
        }

        try {
          const spells = (this.actor.items ?? []).filter((i) => i?.type === "spell");
          const boltSpells = spells.filter((s) => String(s.system?.form ?? "").toLowerCase().includes("bolt"));
          for (const s of boltSpells) candidates.push({ uuid: s.uuid, label: `Bolt Spell: ${s.name}`, kind: "spell" });
        } catch (_e) {
          // no-op
        }

        if (!candidates.length) {
          ui.notifications?.warn?.("No ranged weapons or Bolt spells are available to Aim.");
          return;
        }

        const existing = getEnabledEffectByKey(this.actor, "aim");
        const prevState = getAimStateFromEffect(existing);
        const prevItemUuid = String(prevState.itemUuid ?? "");
        const prevStacks = Number(prevState.stacks ?? 0) || 0;

        const options = candidates.map((c) => {
          const selected = prevItemUuid && c.uuid === prevItemUuid ? " selected" : "";
          return `<option value="${c.uuid}"${selected}>${c.label}</option>`;
        }).join("");

        const content = `
          <form class="uesrpg-aim-form">
            <div class="form-group">
              <label>Aim At</label>
              <select name="aimItemUuid">${options}</select>
            </div>
          </form>
        `;

        const selectedUuid = await new Promise((resolve) => {
          new Dialog({
            title: "Aim",
            content,
            buttons: {
              ok: {
                label: "Aim",
                callback: (html) => {
                  const uuid = html.find("select[name='aimItemUuid']").val();
                  resolve(String(uuid ?? "").trim() || null);
                }
              },
              cancel: { label: "Cancel", callback: () => resolve(null) }
            },
            default: "ok",
            close: () => resolve(null)
          }).render(true);
        });

        if (!selectedUuid) return;

        // Spend AP only after the selection dialog completes.
        if (!(await requireAP("Aim", 1))) return;

        // Determine next stack value (cap at 3 stacks / +30).
        const isContinuingSame = prevItemUuid && selectedUuid === prevItemUuid;
        const nextStacks = Math.min(3, (isContinuingSame ? prevStacks : 0) + 1);
        const nextBonus = nextStacks * 10;

        AimAudit.applyStack(this.actor, { stacks: nextStacks, itemUuid: selectedUuid });

        await postActionCard(
          "Aim",
          `<p><strong>Effect:</strong> +${nextBonus} to the next ranged attack with the aimed weapon/spell (stacks up to +30 if you continue aiming consecutively). If you take any other action or reaction (other than continuing to Aim or firing the aimed weapon/spell), the Aim chain is broken and the bonus is lost.</p>`
        );

        const duration = buildTemporaryDuration({ rounds: 9999, seconds: 604800 });
        await upsertSimpleEffect({
          key: "aim",
          name: "Aim",
          icon: "systems/uesrpg-3ev4/images/Icons/hardTarget.webp",
          statusId: "uesrpg-action-aim",
          duration,
          changes: [
            { key: "system.modifiers.combat.attackTN", mode: ADD, value: nextBonus, priority: 20 },
          ],
          flags: {
            uesrpg: {
              source: "action",
              aim: { stacks: nextStacks, itemUuid: selectedUuid },
              conditions: { attackMode: "ranged", itemUuid: selectedUuid }
            }
          }
        });
        return;
      }

      case "dash": {
        if (!(await requireAP("Dash", 1))) return;
        await breakAimChainIfPresent();
        await postActionCard(
          "Dash",
          "<p>The character can use this action in order to move up to their Speed. If this is done on their Turn, this movement is added to their base movement for that Turn. This action can be used to allow a character to move several times their Speed during a round.</p>"
        );
        return;
      }

      case "hide": {
        if (!(await requireAP("Hide", 1))) return;
        await breakAimChainIfPresent();
        await postActionCard(
          "Hide",
          "<p>The character can use this action to attempt to hide from foes. If anyone might detect them while they do this, they must make a Stealth skill test opposed by the Observe of anyone who might spot them. On success, they gain the Hidden condition.</p>"
        );
        return;
      }

      case "use-item": {
        // Minimal deterministic wiring: pick a consumable item (if any) and post a chat note.
        const candidates = this.actor.items.filter(i => {
          const consumable = Boolean(i?.system?.consumable);
          // Prefer physical items; avoid weapons/armor/ammo by default.
          const type = String(i?.type ?? "");
          const isPhysical = type === "item" || type === "container";
          return consumable && isPhysical;
        });

        if (!candidates.length) {
          await postActionCard(
            "Use Item",
            "<p>No consumable Items were found on this actor.</p>"
          );
          return;
        }

        const options = candidates.map(i => `<option value="${i.id}">${i.name}</option>`).join("");
        const content = `
          <form class="uesrpg-use-item-form">
            <div class="form-group">
              <label>Item</label>
              <select name="itemId">${options}</select>
            </div>
          </form>
        `;

        const actor = this.actor;
        return new Dialog({
          title: "Use Item",
          content,
          buttons: {
            use: {
              label: "Use",
              callback: async (html) => {
                const itemId = html.find("select[name='itemId']").val();
                const item = actor.items.get(itemId);
                if (!item) {
                  ui.notifications.warn("Selected item could not be found.");
                  return;
                }
                if (!(await spendActionPoints(actor, 1, { reason: "Use Item" }))) return;
                // Aim chain breaks when taking any action other than Aim/firing the aimed weapon/spell.
                await breakAimChainIfPresent();
                await postActionCard("Use Item", `<p>${item.name}</p>`);
              }
            },
            cancel: { label: "Cancel" }
          },
          default: "use"
        }).render(true);
      }

      case "reload-weapon": {
        event.preventDefault();
        
        // Get equipped ranged weapon
        const rangedWeapon = this.actor.items.find(i => 
          i.type === "weapon" && 
          i.system?.equipped === true && 
          i.system?.attackMode === "ranged"
        );
        
        if (!rangedWeapon) {
          ui.notifications.warn("No equipped ranged weapon to reload.");
          return;
        }
        
        const reloadState = rangedWeapon.system?.reloadState ?? {};
        const reloadCost = Number(reloadState.reloadAPCost ?? 0);
        
        if (!reloadState.requiresReload || reloadCost === 0) {
          ui.notifications.info(`${rangedWeapon.name} does not require reloading.`);
          return;
        }
        
        // Check if already loaded (optional, non-blocking)
        if (reloadState.isLoaded) {
          ui.notifications.info(`${rangedWeapon.name} is already loaded.`);
          return;
        }
        
        // Check for Power Draw stamina effect
        const { applyPowerDrawBonus } = await import("../stamina/stamina-integration-hooks.js");
        const powerDrawReduction = await applyPowerDrawBonus(this.actor, rangedWeapon);
        let effectiveReloadCost = Math.max(0, reloadCost - powerDrawReduction);
        
        // Check AP availability
        const currentAP = Number(this.actor.system?.action_points?.value ?? 0);
        if (currentAP < effectiveReloadCost) {
          ui.notifications.warn(`Reload requires ${effectiveReloadCost} AP, but you only have ${currentAP} AP remaining.`);
          return;
        }
        
        // Consume AP
        const newAP = currentAP - effectiveReloadCost;
        await this.actor.update({
          "system.action_points.value": newAP
        });
        
        // Mark weapon as loaded
        await rangedWeapon.update({
          "system.reloadState.isLoaded": true
        });
        
        // Build chat message content
        const powerDrawNote = powerDrawReduction > 0 
          ? `<p><em>Power Draw bonus: -${powerDrawReduction} AP</em></p>` 
          : "";
        
        // Send chat message
        await ChatMessage.create({
          user: game.user.id,
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: `
            <div class="uesrpg-chat-card">
              <header class="card-header">
                <img src="${rangedWeapon.img}" width="36" height="36"/>
                <h3>Reload Weapon</h3>
              </header>
              <div class="card-content">
                <p><strong>${this.actor.name}</strong> reloads <strong>${rangedWeapon.name}</strong>.</p>
                <p><em>AP Cost: ${effectiveReloadCost}${powerDrawReduction > 0 ? ` (${reloadCost} - ${powerDrawReduction})` : ""}</em></p>
                ${powerDrawNote}
                <p>Remaining AP: ${newAP}</p>
              </div>
            </div>
          `,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
        
        ui.notifications.info(`${rangedWeapon.name} reloaded for ${effectiveReloadCost} AP.`);
        return;
      }

      case "attack-of-opportunity": {
        if (!requireUserCanRollActor(game.user, this.actor)) return;
        
        const weaponId = this.actor.sheetCombatQuick?.meleeWeaponId ?? null;
        if (!weaponId) {
          ui.notifications.warn("No melee weapon equipped for Attack of Opportunity.");
          return;
        }

        const weapon = this.actor.items.get(weaponId);
        if (!weapon) {
          ui.notifications.warn("Equipped weapon could not be found.");
          return;
        }

        const attackerToken = resolveTokenForActor(this.actor);
        if (!attackerToken) {
          ui.notifications.warn("Please place and select a token for this actor.");
          return;
        }

        const defenderToken = resolveFirstTargetedToken();
        if (!defenderToken) {
          ui.notifications.warn("Please target an enemy token for Attack of Opportunity.");
          return;
        }

        const hasAP = await requireAP("Attack of Opportunity", 1);
        if (!hasAP) return;

        const attackMode = "melee";
        
        // For PC: use combat style
        if (this.actor.type === "Player Character") {
          const style = this.actor.itemTypes?.combatStyle?.[0] ?? this.actor.items.find(i => i.type === "combatStyle");
          if (!style) {
            ui.notifications.warn("No Combat Style found on this actor.");
            return;
          }
          const base = Number(style.system?.value ?? 0) || 0;
          const fatiguePenalty = Number(this.actor.system?.fatigue?.penalty ?? 0) || 0;
          const carryPenalty = Number(this.actor.system?.carry_rating?.penalty ?? 0) || 0;
          const woundPenalty = Number(this.actor.system?.woundPenalty ?? 0) || 0;
          const attackTN = base + fatiguePenalty + carryPenalty + woundPenalty;

          await OpposedWorkflow.createPending({
            attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
            defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
            attackerActorUuid: this.actor.uuid,
            defenderActorUuid: defenderToken.actor?.uuid ?? null,
            attackerItemUuid: style.uuid,
            attackerLabel: "Attack of Opportunity",
            attackerTarget: attackTN,
            mode: "attack",
            attackMode,
            weaponUuid: weapon.uuid,
            skipAttackerAPDeduction: true
          });
        } else {
          // For NPC: use combat profession
          const base = Number(this.actor.system?.professions?.combat ?? 0) || 0;
          const fatiguePenalty = Number(this.actor.system?.fatigue?.penalty ?? 0) || 0;
          const carryPenalty = Number(this.actor.system?.carry_rating?.penalty ?? 0) || 0;
          const woundPenalty = Number(this.actor.system?.woundPenalty ?? 0) || 0;
          const attackTN = base + fatiguePenalty + carryPenalty + woundPenalty;

          await OpposedWorkflow.createPending({
            attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
            defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
            attackerActorUuid: this.actor.uuid,
            defenderActorUuid: defenderToken.actor?.uuid ?? null,
            attackerItemUuid: "prof:combat",
            attackerLabel: "Attack of Opportunity",
            attackerTarget: attackTN,
            mode: "attack",
            attackMode,
            weaponUuid: weapon.uuid,
            skipAttackerAPDeduction: true
          });
        }
        return;
      }

      default:
        return;
    }
  }


  /**
   * Apply per-user collapsed group state after render.
   * This does not mutate actor data.
   */
  async _applyCollapsedGroups(html) {
    try {
      const groups = await getCollapsedGroups();
      const toggles = html.find(".uesrpg-group-toggle");
      toggles.each((_i, el) => {
        const key = el?.dataset?.group;
        if (!key) return;
        const collapsed = Boolean(groups?.[key]);
        this._setGroupCollapsedInDom(el, collapsed);
      });
    } catch (e) {
      // No-op
    }
  }

  _setGroupCollapsedInDom(toggleEl, collapsed) {
    if (!toggleEl) return;

    const icon = toggleEl.querySelector("i");
    if (icon) {
      // Check if this is a caret icon (used for spell schools) or chevron icon
      const isCaret = icon.classList.contains("fa-caret-down") || icon.classList.contains("fa-caret-right");
      
      if (isCaret) {
        icon.classList.remove("fa-caret-down", "fa-caret-right");
        icon.classList.add(collapsed ? "fa-caret-right" : "fa-caret-down");
      } else {
        icon.classList.remove("fa-chevron-down", "fa-chevron-right");
        icon.classList.add(collapsed ? "fa-chevron-right" : "fa-chevron-down");
      }
    }

    // Spell school sections - updated to use new template structure
    const spellSchool = toggleEl.closest(".spell-school-section");
    if (spellSchool) {
      const table = spellSchool.querySelector(".spell-school-table");
      if (table) table.style.display = collapsed ? "none" : "";
      return;
    }

    // Generic collapsible blocks: hide/show an explicit collapse body
    const collapsible = toggleEl.closest(".uesrpg-collapsible");
    if (collapsible) {
      const body = collapsible.querySelector(".uesrpg-collapse-body");
      if (body) body.style.display = collapsed ? "none" : "";
      return;
    }

    const table = toggleEl.closest("table");
    if (table) {
      const tbody = table.querySelector("tbody");
      if (tbody) tbody.style.display = collapsed ? "none" : "";
      return;
    }

    const section = toggleEl.closest(".languageContainer, .factionContainer, .trait-container, .talent-container, .power-container");
    if (section) {
      const list = section.querySelector("ol, ul");
      if (list) list.style.display = collapsed ? "none" : "";
    }
  }

  async _onToggleGroupCollapse(event) {
    event.preventDefault();
    event.stopPropagation();

    const el = event.currentTarget;
    const groupKey = el?.dataset?.group;
    if (!groupKey) return;

    const groups = await getCollapsedGroups();
    const next = !Boolean(groups?.[groupKey]);
    await setGroupCollapsed(groupKey, next);
    this._setGroupCollapsedInDom(el, next);
  }

  _onItemSearch(event) {
    const input = event.currentTarget;
    const query = String(input?.value ?? "").trim().toLowerCase();
    const root = this.element?.[0];
    if (!root) return;

    const tab = root.querySelector(".tab.equipment");
    if (!tab) return;

    const items = tab.querySelectorAll("tr.item, li.item");
    for (const row of items) {
      const nameEl = row.querySelector(".item-name");
      const name = String(nameEl?.textContent ?? "").trim().toLowerCase();
      const match = !query || name.includes(query);
      row.style.display = match ? "" : "none";
    }
  }

  async _onLoadoutSave(event) {
    event.preventDefault();
    if (!this.actor?.isOwner) return;
    if (!game.settings.get("uesrpg-3ev4", "enableLoadouts")) return;

    const equippedIds = this.actor.items
      .filter(i => typeof i?.system?.equipped === "boolean" && i.system.equipped)
      .map(i => i.id);

    const name = await Dialog.prompt({
      title: "Save Loadout",
      content: `<p>Enter a name for this loadout:</p><input type="text" name="uesrpgLoadoutName" style="width:100%" />`,
      label: "Save",
      callback: (html) => String(html.find("input[name='uesrpgLoadoutName']").val() ?? "").trim()
    });

    if (!name) return;
    await saveLoadoutForActor(this.actor.id, name, equippedIds);
    this.render(false);
  }

  async _onLoadoutApply(event) {
    event.preventDefault();
    if (!this.actor?.isOwner) return;
    if (!game.settings.get("uesrpg-3ev4", "enableLoadouts")) return;

    const select = this.element?.find?.("#uesrpg-loadout-select")?.[0];
    const loadoutId = select?.value;
    if (!loadoutId) return;

    const loadouts = await getLoadoutsForActor(this.actor.id);
    const loadout = loadouts.find(l => l.id === loadoutId);
    if (!loadout) return;
    await applyLoadoutToActor(this.actor, loadout.equippedIds);
    this.render(false);
  }

  async _onLoadoutDelete(event) {
    event.preventDefault();
    if (!this.actor?.isOwner) return;
    if (!game.settings.get("uesrpg-3ev4", "enableLoadouts")) return;

    const select = this.element?.find?.("#uesrpg-loadout-select")?.[0];
    const loadoutId = select?.value;
    if (!loadoutId) return;

    const confirmed = await Dialog.confirm({
      title: "Delete Loadout",
      content: "<p>Delete the selected loadout?</p>"
    });
    if (!confirmed) return;

    await deleteLoadout(this.actor.id, loadoutId);
    this.render(false);
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async _duplicateItem(item) {
    let d = new Dialog({
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
          callback: async (html) => {
            let newItem = await this.actor.createEmbeddedDocuments("Item", [
              item.toObject(),
            ]);
            await newItem[0].sheet.render(true);
          },
        },
      },
      default: "two",
      close: () => {},
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

  const renderModBox = (label, arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    return `
      <div class="modifierBox">
        <h2>${label} Modifiers</h2>
        <span style="font-size: small">${arr.join("")}</span>
      </div>
    `;
  };

  const modifiersHtml = [
    renderModBox("STR", strBonusArray),
    renderModBox("END", endBonusArray),
    renderModBox("AGI", agiBonusArray),
    renderModBox("INT", intBonusArray),
    renderModBox("WP", wpCBonusArray),
    renderModBox("PRC", prcBonusArray),
    renderModBox("PRS", prsBonusArray),
    renderModBox("LCK", lckBonusArray)
  ].join("");

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

                  ${modifiersHtml}

                    <div style="margin-bottom: 10px;">
                      <h3 style="margin: 0 0 6px 0;">Favored Characteristics</h3>
                      <div style="border: inset; margin-bottom: 10px; padding: 5px;">
                        <i>Move favored toggles here to keep the sheet compact. These match the toggles previously shown next to each characteristic.</i>
                      </div>

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
                          <td><input type="checkbox" id="strFav" ${this.actor.system.characteristics.str.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="endFav" ${this.actor.system.characteristics.end.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="agiFav" ${this.actor.system.characteristics.agi.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="intFav" ${this.actor.system.characteristics.int.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="wpFav" ${this.actor.system.characteristics.wp.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="prcFav" ${this.actor.system.characteristics.prc.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="prsFav" ${this.actor.system.characteristics.prs.favored ? 'checked' : ''}></td>
                          <td><input type="checkbox" id="lckFav" ${this.actor.system.characteristics.lck.favored ? 'checked' : ''}></td>
                        </tr>
                      </table>
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
        callback: () => {},
      },
    },
    default: "one",
    close: () => {},
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
  const hasWoundPenalty = woundPenalty !== 0;
  let tags = [];
  if (hasWoundPenalty) {
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

          if (hasWoundPenalty) {
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
        callback: () => {},
      },
    },
    default: "one",
    close: () => {},
  });
  d.render(true);
  }

async _onProfessionsRoll(event) {
  event.preventDefault();

  if (!requireUserCanRollActor(game.user, this.actor)) return;

  const element = event.currentTarget;
  const key = String(element?.id ?? "").trim();
  if (!key) return;

  const actorSystem = this.actor?.system ?? {};

  // Profession display name
  const getProfessionLabel = (k) => {
    if (k === "profession1" || k === "profession2" || k === "profession3") {
      const spec = String(actorSystem?.skills?.[k]?.specialization ?? "").trim();
      return spec || k.replace("profession", "Profession ");
    }
    const fromAttr = String(element.getAttribute?.("name") ?? "").trim();
    if (fromAttr) return fromAttr;
    return k.charAt(0).toUpperCase() + k.slice(1);
  };

  const label = getProfessionLabel(key);

  // --- Targeted -> opposed workflow ---
  const targets = [...(game.user.targets ?? [])];
  if (targets.length > 0) {
    const attackerToken =
      canvas?.tokens?.controlled?.find(t => t.actor?.id === this.actor.id) ??
      this.actor.getActiveTokens?.()[0] ??
      null;

    if (!attackerToken) {
      ui.notifications.warn("No attacker token found on the canvas. Select your token and try again.");
      return;
    }

    // Combat profession routes into combat opposed workflow (same as combat style click).
    if (key === "combat") {
      for (const defenderToken of targets) {
        await OpposedWorkflow.createPending({
          attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
          defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
          attackerLabel: "Combat (Profession)",
          attackerItemUuid: "prof:combat"
        });
      }
      return;
    }

    // All other professions use skill opposed workflow.
    for (const defenderToken of targets) {
      const msg = await SkillOpposedWorkflow.createPending({
        attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
        defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
        attackerSkillUuid: `prof:${key}`,
        attackerSkillLabel: label
      });

      // Mirror PC behavior: attacker rolls immediately from the created card.
      await SkillOpposedWorkflow.handleAction(msg, "attacker-roll", { event });
    }
    return;
  }

  // --- Untargeted -> same UI + pipeline as PC skill tests ---
  const baseValue = Number(actorSystem?.professions?.[key] ?? 0);
  const profSkillItem = {
    uuid: `prof:${key}`,
    id: `prof:${key}`,
    name: label,
    img: this.actor.img,
    system: {
      value: baseValue,
      // These are stored on the NPC Actor (system.skills.<key>.*) and may be modified by Actor Active Effects.
      bonus: Number(actorSystem?.skills?.[key]?.bonus ?? 0),
      miscValue: 0
    },
    _professionKey: key
  };

  const hasSpec = Boolean(String(actorSystem?.skills?.[key]?.specialization ?? "").trim());

  // Pull last used defaults if present (falls back to PC defaults shape).
  const defaults = { difficultyKey: "average", manualMod: 0, useSpec: false };

  const difficultyOptions = SKILL_DIFFICULTIES.map(d => {
    const sign = d.mod >= 0 ? "+" : "";
    const sel = d.key === defaults.difficultyKey ? "selected" : "";
    return `<option value="${d.key}" ${sel}>${d.label} (${sign}${d.mod})</option>`;
  }).join("\n");

  const content = `
    <form class="uesrpg-skill-roll">
      <div class="form-group">
        <label><b>Difficulty</b></label>
        <select name="difficultyKey" style="width:100%;">${difficultyOptions}</select>
      </div>

      <div class="form-group" style="margin-top:8px;">
        <label><b>Manual Modifier</b></label>
        <input name="manualMod" type="text" value="0" placeholder="e.g. -20, +10" style="width:100%; text-align:center;" />
      </div>

      ${hasSpec ? `
      <div class="form-group" style="margin-top:8px; display:flex; gap:8px; align-items:center;">
        <input type="checkbox" name="useSpec" />
        <label style="margin:0;">Use Specialization (+10)</label>
      </div>
      ` : ``}
    </form>
  `;

  const decl = await Dialog.prompt({
    title: `${label} — Roll Options`,
    content,
    label: "Roll",
    callback: (html) => {
      const root = html instanceof HTMLElement ? html : html?.[0];
      const difficultyKey = root?.querySelector('select[name="difficultyKey"]')?.value ?? "average";
      const useSpec = Boolean(root?.querySelector('input[name="useSpec"]')?.checked);
      const rawManual = root?.querySelector('input[name="manualMod"]')?.value ?? "0";
      const manualMod = Number.parseInt(String(rawManual), 10) || 0;
      return normalizeSkillRollOptions({ difficultyKey, useSpec, manualMod }, defaults);
    },
    rejectClose: false
  }).catch(() => null);

  if (!decl) return;

  const normalized = normalizeSkillRollOptions(decl, defaults);

  // Build request for debug symmetry (no side effects).
  buildSkillRollRequest({
    actor: this.actor,
    skillItem: profSkillItem,
    targetToken: null,
    options: { difficultyKey: normalized.difficultyKey, manualMod: normalized.manualMod, useSpec: Boolean(normalized.useSpec) },
    context: { source: "npc-sheet", quick: false }
  });

  const tn = computeSkillTN({
    actor: this.actor,
    skillItem: profSkillItem,
    difficultyKey: normalized.difficultyKey,
    manualMod: normalized.manualMod,
    useSpecialization: hasSpec && normalized.useSpec
  });

  const res = await doTestRoll(this.actor, {
    rollFormula: "1d100",
    target: tn.finalTN,
    allowLucky: true,
    allowUnlucky: true
  });

  const degreeLine = res.isSuccess
    ? `<b style="color:green;">SUCCESS — ${formatDegree(res)}</b>`
    : `<b style="color:rgb(168, 5, 5);">FAILURE — ${formatDegree(res)}</b>`;

  const breakdownRows = (tn.breakdown ?? []).map((b) => {
    const v = Number(b.value ?? 0);
    const sign = v >= 0 ? "+" : "";
    const labelTxt = String(b.label ?? "");
    return `<div style="display:flex; justify-content:space-between; gap:10px;"><span>${labelTxt}</span><span>${sign}${v}</span></div>`;
  }).join("");

  const declaredParts = [];
  if (tn?.difficulty?.label) declaredParts.push(`${tn.difficulty.label} (${tn.difficulty.mod >= 0 ? "+" : ""}${tn.difficulty.mod})`);
  if (hasSpec && normalized.useSpec) declaredParts.push("Spec +10");
  if (normalized.manualMod) declaredParts.push(`Mod ${normalized.manualMod >= 0 ? "+" : ""}${normalized.manualMod}`);

  // Tag bar (kept consistent with PC sheet tags)
  const tags = [];
  if (Number(this.actor?.system?.woundPenalty ?? 0) !== 0) tags.push(`<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`);
  if (Number(this.actor?.system?.fatigue?.penalty ?? 0) !== 0) tags.push(`<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`);
  if (Number(this.actor?.system?.carry_rating?.penalty ?? 0) !== 0) tags.push(`<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`);

  const armorMods = (tn.breakdown ?? []).filter(b => String(b.label || "").startsWith("Armor:") && Number(b.value) !== 0);
  for (const m of armorMods) {
    const v = Number(m.value) || 0;
    tags.push(`<span class="tag armor-tag">${m.label} ${v}</span>`);
  }

  if (tn?.difficulty?.mod) tags.push(`<span class="tag">${tn.difficulty.label} ${tn.difficulty.mod >= 0 ? "+" : ""}${tn.difficulty.mod}</span>`);
  if (hasSpec && normalized.useSpec) tags.push(`<span class="tag">Specialization +10</span>`);
  if (normalized.manualMod) tags.push(`<span class="tag">Mod ${normalized.manualMod >= 0 ? "+" : ""}${normalized.manualMod}</span>`);

  const flavor = `
    <div>
      <h2 style="margin:0 0 6px 0;"><img src="${profSkillItem.img}" style="height:24px; vertical-align:middle; margin-right:6px;"/>${label}</h2>
      <div><b>Target Number:</b> ${tn.finalTN}</div>
      ${declaredParts.length ? `<div style="margin-top:2px; font-size:12px; opacity:0.85;"><b>Options:</b> ${declaredParts.join("; ")}</div>` : ""}
      <div style="margin-top:4px;">${degreeLine}${res.isCriticalSuccess ? ' <span style="color:green;">(CRITICAL)</span>' : ''}${res.isCriticalFailure ? ' <span style="color:red;">(CRITICAL FAIL)</span>' : ''}</div>
      <details style="margin-top:6px;"><summary style="cursor:pointer; user-select:none;">TN breakdown</summary><div style="margin-top:4px; font-size:12px; opacity:0.9;">${breakdownRows}</div></details>
      <div class="tag-container" style="margin-top:6px;">${tags.join("")}</div>
    </div>`;

  await res.roll.toMessage({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    flavor,
    rollMode: game.settings.get("core", "rollMode")
  });

}

async _onDefendRoll(event) {
  event.preventDefault();

  if (!requireUserCanRollActor(game.user, this.actor)) return;

  const defenseType = String(event.currentTarget?.dataset?.defense ?? "evade").trim().toLowerCase();

  // Resolve the defense skill/item.
  let skillItem = null;
  let label = "Defense";

  if (defenseType === "evade") {
    label = "Evade";
    skillItem = this.actor.items.find(i => i.type === "skill" && String(i.name || "").trim().toLowerCase() === "evade") ?? null;
  } else if (defenseType === "block") {
    label = "Block";
    // Prefer an explicit Block skill if present; otherwise, fall back to a block-focused combat style.
    skillItem = this.actor.items.find(i => i.type === "skill" && String(i.name || "").trim().toLowerCase() === "block")
      ?? this.actor.items.find(i => i.type === "combatStyle" && String(i.name || "").toLowerCase().includes("block"))
      ?? null;
  } else {
    label = defenseType.charAt(0).toUpperCase() + defenseType.slice(1);
    skillItem = this.actor.items.find(i => i.type === "skill" && String(i.name || "").trim().toLowerCase() === defenseType) ?? null;
  }

  if (!skillItem) {
    ui.notifications.warn(`No ${label} skill/style found on ${this.actor.name}.`);
    return;
  }

  // Default roll options (quick roll parity with PC sheet without additional dialogs).
  const difficultyKey = "average";
  const manualMod = 0;
  const hasSpec = Boolean(String(skillItem?.system?.specialization ?? "").trim());
  const useSpec = false;

  const request = buildSkillRollRequest({
    actor: this.actor,
    skillItem,
    targetToken: null,
    options: { difficultyKey, manualMod, useSpec: false },
    context: { source: "npc-sheet", quick: true, defenseType }
  });

  const tn = computeSkillTN({
    actor: this.actor,
    skillItem,
    difficultyKey,
    manualMod,
    useSpecialization: hasSpec && useSpec
  });

  const tags = [];
  if (Number(this.actor.system?.woundPenalty ?? 0) !== 0) tags.push(`<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`);
  if (this.actor.system.fatigue?.penalty != 0) tags.push(`<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`);
  if (this.actor.system.carry_rating?.penalty != 0) tags.push(`<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`);

  const armorMods = (tn.breakdown ?? []).filter(b => String(b.label || "").startsWith("Armor:") && Number(b.value) !== 0);
  for (const m of armorMods) {
    const v = Number(m.value) || 0;
    tags.push(`<span class="tag armor-tag">${m.label} ${v}</span>`);
  }

  const res = await doTestRoll(this.actor, {
    rollFormula: "1d100",
    target: tn.finalTN,
    allowLucky: true,
    allowUnlucky: true
  });

  const degreeLine = res.isSuccess
    ? `<b style="color:green;">SUCCESS — ${formatDegree(res)}</b>`
    : `<b style="color:rgb(168, 5, 5);">FAILURE — ${formatDegree(res)}</b>`;

  const breakdownRows = (tn.breakdown ?? []).map(b => {
    const v = Number(b.value ?? 0);
    const sign = v >= 0 ? "+" : "";
    return `<div style="display:flex; justify-content:space-between; gap:10px;"><span>${b.label}</span><span>${sign}${v}</span></div>`;
  }).join("");

  const flavor = `
    <div>
      <h2 style="margin:0 0 6px 0;"><img src="${skillItem.img}" style="height:24px; vertical-align:middle; margin-right:6px;"/>${label}</h2>
      <div><b>Target Number:</b> ${tn.finalTN}</div>
      <div style="margin-top:4px;">${degreeLine}${res.isCriticalSuccess ? ' <span style="color:green;">(CRITICAL)</span>' : ''}${res.isCriticalFailure ? ' <span style="color:red;">(CRITICAL FAIL)</span>' : ''}</div>
      <details style="margin-top:6px;"><summary style="cursor:pointer; user-select:none;">TN breakdown</summary><div style="margin-top:4px; font-size:12px; opacity:0.9;">${breakdownRows}</div></details>
      <div class="tag-container" style="margin-top:6px;">${tags.join("")}</div>
    </div>`;

  await res.roll.toMessage({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    flavor,
    flags: { uesrpg: { rollRequest: request }, "uesrpg-3ev4": { rollRequest: request } },
    rollMode: game.settings.get("core", "rollMode")
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
  // RAW: Hit Location is the 1s digit of the attack roll, but can also be rolled as 1d10 (10 counts as 0).
  // This NPC weapon card rolls hit location directly.
  const hitLocRoll = new Roll("1d10");
  await hitLocRoll.evaluate();
  const hit_loc = window.Uesrpg3e?.utils?.getHitLocationFromRoll
    ? window.Uesrpg3e.utils.getHitLocationFromRoll(Number(hitLocRoll.total))
    : "Body";

  // Roll damage
  const roll = new Roll(damageRoll);
  await roll.evaluate();
  let resolvedSupRoll = null;
  if (item.system?.superior) {
    resolvedSupRoll = new Roll(damageRoll);
    await resolvedSupRoll.evaluate();
  }

  const finalDamage = resolvedSupRoll ? Math.max(roll.total, resolvedSupRoll.total) : roll.total;
  
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
  const damageDisplay = resolvedSupRoll 
    ? `[[${roll.total}]] [[${resolvedSupRoll.total}]]` 
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
    rolls: resolvedSupRoll ? [roll, resolvedSupRoll] : [roll],
    rollMode: game.settings.get("core", "rollMode")
  });
}

/**
   * Handle clicking spell dice icon on Magic tab.
   * Routes to new magic casting engine instead of legacy rolling.
   */
  async _onMagicSkillRoll(event) {
    event.preventDefault();
    
    const button = event.currentTarget;
    const li = button.closest(".item");
    const spell = li ? this.actor.items.get(li.dataset.itemId) : null;
    
    if (!spell) {
      ui.notifications.warn("Spell not found.");
      return;
    }
    
    // Route to new casting engine
    await this._onCastMagicAction(event, spell);
  }

/**
   * Handle Cast Magic button click.
   * Shows spell picker, then routes to attack spell workflow or existing spell dialog.
   * @param {Event} event - The triggering event (optional if preselectedSpell provided)
   * @param {Item} preselectedSpell - Pre-selected spell to cast (optional)
   */
  async _onCastMagicAction(event, preselectedSpell = null) {
    event?.preventDefault?.();
    
    
    const castActionType = String(event?.currentTarget?.dataset?.actionType ?? "primary");
let spell = preselectedSpell;
    
    // If no spell provided, show picker
    if (!spell) {
      // 1. Get all spells owned by actor
      const spellsAll = this.actor.items.filter(i => i.type === "spell");
      const spells = (castActionType === "secondary")
        ? spellsAll.filter(s => s?.system?.isInstant === true)
        : spellsAll;
      if (!spells.length) {
        ui.notifications.warn(castActionType === "secondary" ? "No Instant spells available to cast as a Secondary action." : "No spells available to cast.");
        return;
      }
      
      // 2. Show spell selection dialog
      const spellOptions = spells.map(s => 
        `<option value="${s.id}">${s.name} (${s.system.school} L${s.system.level}, ${s.system.cost} MP)</option>`
      ).join("");
      
      const content = `
        <form class="uesrpg-cast-magic-form">
          <div class="form-group">
            <label><b>Select Spell to Cast</b></label>
            <select name="spellId" style="width:100%;">${spellOptions}</select>
          </div>
        </form>`;
      
      const selectedSpellId = await Dialog.wait({
        title: castActionType === "secondary" ? "Cast Magic (Instant)" : "Cast Magic",
        content,
        buttons: {
          cast: {
            label: "Cast",
            callback: (html) => {
              const root = html instanceof HTMLElement ? html : html?.[0];
              return root?.querySelector('select[name="spellId"]')?.value;
            }
          },
          cancel: { label: "Cancel", callback: () => null }
        },
        default: "cast"
      }, { width: 420 });
      
      if (!selectedSpellId) return;
      
      spell = this.actor.items.get(selectedSpellId);
      if (!spell) return;
    }
    
	    // 3. Centralized routing: modern casting engine for attack/healing spells.
	    const targets = getUserSpellTargets();
	    debugMagicRoutingLog({ source: "NpcSheet._onCastMagicAction", actor: this.actor, spell, targets });
	    
    // Range gating and AoE template placement (Package 3 follow-up)
    // - Ranged/Melee: reject out-of-range targets before any rolls.
    // - AoE: place a MeasuredTemplate and derive targets from the template area.
    const rangeType = getSpellRangeType(spell);
    const attackerToken = this.token?.object ?? this.token;

    // Token is only required for range-gated spells.
    if ((rangeType === "ranged" || rangeType === "melee" || rangeType === "aoe") && !attackerToken) {
      ui.notifications.warn("You must have an active token selected to cast this spell (range-gated).");
      return;
    }

    let workingTargets = Array.from(targets ?? []);

    if (rangeType === "aoe") {
      const placed = await placeAoETemplateAndCollectTargets({
        casterToken: attackerToken,
        spell,
        includeCaster: Boolean(spell?.system?.aoePulse)
      });
      if (!placed) return;

      // If we can compute affected tokens, use them; otherwise fall back to manual targets.
      if (placed.targets?.length) workingTargets = placed.targets;
      else workingTargets = workingTargets;
      if (!workingTargets.length) {
        // Allow AoE spells to be cast into empty space.
        // This keeps template placement usable even when no tokens are within the area.
        ui.notifications?.info?.("No tokens are affected by the spell template.");
        workingTargets = [];
      }
    } else if (rangeType === "ranged" || rangeType === "melee") {
      // If no targets are selected, do not hard-stop casting here.
      // This is required for untargeted casting and any flows that derive targets later.
      if (workingTargets.length) {
        const res = filterTargetsBySpellRange({
          casterToken: attackerToken,
          targets: workingTargets,
          spell
        }) ?? {};

        const validTargets = Array.isArray(res.validTargets) ? res.validTargets : [];
        const rejected = Array.isArray(res.rejected) ? res.rejected : [];
        const maxRange = Number.isFinite(Number(res.maxRange)) ? Number(res.maxRange) : null;

        if (rejected.length) {
          const names = rejected
            .map(r => `${r.token?.name ?? "?"} (${Math.round((r.distance ?? 0) * 10) / 10}m)`) 
            .join(", ");
          ui.notifications.warn(`Out of range: ${names}${maxRange ? ` (max ${maxRange}m)` : ""}.`);
        }

        workingTargets = validTargets;
        if (!workingTargets.length) return;
      }
    }
if (shouldUseTargetedSpellWorkflow(spell, workingTargets)) {
      // Attack spell with target -> show spell options dialog then opposed workflow
      const spellOptions = await this._showSpellOptionsDialog(spell);
      if (spellOptions === null) return; // Cancelled
      
      // Targeted spells (attack OR healing) route through the MagicOpposedWorkflow.
      // Healing is handled as an unopposed "direct" cast inside the workflow when detected.
      await this._castAttackSpell(spell, workingTargets, spellOptions, castActionType);
	    } else if (shouldUseModernSpellWorkflow(spell)) {
	      const spellOptions = await this._showSpellOptionsDialog(spell);
	      if (spellOptions === null) return;
	      const { MagicOpposedWorkflow } = await import("../magic/opposed-workflow.js");
	      await MagicOpposedWorkflow.castUnopposed({
	        attackerActorUuid: this.actor.uuid,
	        attackerTokenUuid: this.token?.document?.uuid ?? this.token?.uuid ?? null,
	        spellUuid: spell.uuid,
	        spellOptions,
	        castActionType
	      });
	      return;
	    } else {
	      // Non-attack/non-healing spells keep legacy behavior.
	      const fakeEvent = { currentTarget: { closest: () => ({ dataset: { itemId: spell.id } }) } };
	      await this._onSpellRoll.call(this, fakeEvent);
	    }
  }

  /**
   * Show spell options dialog for Restraint/Overload
   */
  async _showSpellOptionsDialog(spell) {
    const wpBonus = Math.floor(Number(this.actor.system?.characteristics?.wp?.total ?? 0) / 10);
    const hasOverload = Boolean(spell.system?.hasOverload);
    // Scaffolding for future talent-based spell options (no mechanical effects applied in Package 3).
    const hasOverchargeTalent = this.actor.items?.some(i => i.type === "talent" && i.name === "Overcharge") ?? false;
    const hasMagickaCyclingTalent = this.actor.items?.some(i => i.type === "talent" && i.name === "Magicka Cycling") ?? false;
    const baseCost = Number(spell.system?.cost ?? 0);
    
    const content = `
      <form class="uesrpg-spell-options">
        <h3>${spell.name}</h3>
        <div class="form-group">
          <label>MP Cost: <b>${baseCost}</b></label>
        </div>
        <div class="form-group" style="margin-bottom:8px; margin-top:8px;">
          <label style="display:block;"><b>Difficulty</b></label>
          <select name="difficultyKey" style="width:100%;">
            ${SKILL_DIFFICULTIES.map(df => {
              const sign = df.mod >= 0 ? "+" : "";
              const sel = df.key === "average" ? "selected" : "";
              return `<option value="${df.key}" ${sel}>${df.label} (${sign}${df.mod})</option>`;
            }).join("\n")}
          </select>
        </div>
        <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <label style="margin:0;"><b>Manual Modifier</b></label>
          <input type="number" name="manualModifier" value="0" style="width:120px; text-align:center;" />
        </div>
        <hr style="margin: 10px 0;"/>
        <div class="form-group" style="margin-top: 8px;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" name="restrain" checked />
            <span><b>Spell Restraint</b> (reduce cost by ${wpBonus} to min 1)</span>
          </label>
        </div>
	        ${hasOverload ? `
        <div class="form-group" style="margin-top: 8px;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" name="overload" />
            <span><b>Overload</b> (${spell.system.overloadEffect || 'double cost for enhanced effect'})</span>
          </label>
        </div>` : ''}
	        ${hasOverchargeTalent ? `
	        <div class="form-group" style="margin-top: 8px;">
	          <label style="display: flex; align-items: center; gap: 8px;">
	            <input type="checkbox" name="overcharge" />
	            <span><b>Overcharge</b> (talent option; not yet implemented)</span>
	          </label>
	        </div>` : ''}
	        ${hasMagickaCyclingTalent ? `
	        <div class="form-group" style="margin-top: 8px;">
	          <label style="display: flex; align-items: center; gap: 8px;">
	            <input type="checkbox" name="magickaCycling" />
	            <span><b>Magicka Cycling</b> (talent option; not yet implemented)</span>
	          </label>
	        </div>` : ''}
      </form>
    `;
    
    return Dialog.wait({
      title: "Spell Options",
      content,
      buttons: {
        cast: {
          label: "Cast",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html?.[0];
            const form = root?.querySelector("form");

            const difficultyKey = String(form?.difficultyKey?.value ?? "average");
            const manualModifierRaw = form?.manualModifier?.value ?? "0";
            const manualModifier = Number.parseInt(String(manualModifierRaw ?? "0"), 10) || 0;
            return {
              isRestrained: form?.restrain?.checked ?? false,
              isOverloaded: form?.overload?.checked ?? false,
              useOvercharge: form?.overcharge?.checked ?? false,
              useMagickaCycling: form?.magickaCycling?.checked ?? false,
              difficultyKey,
              manualModifier,
              restraintValue: wpBonus,
              baseCost
            };
          }
        },
        cancel: { label: "Cancel", callback: () => null }
      },
      default: "cast"
    }, { width: 420 });
  }

  /**
   * Cast an attack spell using the magic opposed workflow.
   */
  async _castAttackSpell(spell, targets, spellOptions = {}, castActionType = "primary") {
    // Import MagicOpposedWorkflow
    const { MagicOpposedWorkflow } = await import("../magic/opposed-workflow.js");
    
    // Get attacker token
    const attackerToken = canvas?.tokens?.controlled?.find(t => t.actor?.id === this.actor.id) 
      ?? this.actor.getActiveTokens?.()[0];
    
    if (!attackerToken) {
      ui.notifications.warn("No attacker token found. Select your token and try again.");
      return;
    }
    
    // Create opposed workflow for each target
    for (const defenderToken of targets) {
      await MagicOpposedWorkflow.createPending({
        attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
        defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
        spellUuid: spell.uuid,
        spellOptions,
        castActionType
      });
    }
  }

async _onSpellRoll(event) {
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

	  // Centralized routing for targeted spells invoked via legacy entry points (e.g. favorites/hotkeys).
	  const targets = getUserSpellTargets();
	  debugMagicRoutingLog({ source: "NpcSheet._onSpellRoll", actor: this.actor, spell: spellToCast, targets });
	  if (shouldUseTargetedSpellWorkflow(spellToCast, targets)) {
	    const spellOptions = await this._showSpellOptionsDialog(spellToCast);
	    if (spellOptions === null) return;
	    await this._castAttackSpell(spellToCast, targets, spellOptions, "primary");
	    return;
	  }
	  if (shouldUseModernSpellWorkflow(spellToCast)) {
	    const spellOptions = await this._showSpellOptionsDialog(spellToCast);
	    if (spellOptions === null) return;
	    const { MagicOpposedWorkflow } = await import("../magic/opposed-workflow.js");
	    await MagicOpposedWorkflow.castUnopposed({
	      attackerActorUuid: this.actor.uuid,
	      attackerTokenUuid: this.token?.document?.uuid ?? this.token?.uuid ?? null,
	      spellUuid: spellToCast.uuid,
	      spellOptions,
	      castActionType: "primary"
	    });
	    return;
	  }
    // Legacy spell casting path removed - all spells now use modern pipeline via shouldUseModernSpellWorkflow()
}

 async _onResistanceRoll(event) {
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
      two: { label: "Cancel", callback: () => {} },
    },
    default: "one",
    close: () => {},
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
    event.preventDefault();
    const toggle = $(event.currentTarget);
    const li = toggle.closest(".item");
    const itemId = li?.data("itemId");
    if (!itemId) return;
    const item = this.actor.getEmbeddedDocument("Item", itemId);
    if (!item) return;
    const current = Boolean(item?.system?.equipped);
    await item.update({ "system.equipped": !current });
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
            callback: () => {},
          },
        },
        default: "one",
        close: () => {},
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
    await postItemToChat(event, this.actor, { includeImage: false });
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
      one: { label: "Cancel", callback: () => {} },
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
    close: () => {},
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
      one: { label: "Cancel", callback: () => {} },
      two: {
        label: "Submit",
        callback: async (html) => {
          const playerInput = parseInt(html.find('[id="playerInput"]').val()) || 0;
          await this.actor.update({ "system.carry_rating.bonus": playerInput });
        },
      },
    },
    default: "two",
    close: () => {},
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

  // REMOVED: _createSpellFilterOptions() - no longer used with spell school categorization
  // The spell filter dropdown (#spellFilter) was removed when migrating to spell schools
  // _createSpellFilterOptions() {
  //   for (let spell of this.actor.items.filter(
  //     (item) => item.type === "spell"
  //   )) {
  //     if (
  //       [...this.form.querySelectorAll("#spellFilter option")].some(
  //         (i) => i.innerHTML === spell.system.school
  //       )
  //     ) {
  //       continue;
  //     } else {
  //       let option = document.createElement("option");
  //       option.innerHTML = spell.system.school;
  //       this.form.querySelector("#spellFilter").append(option);
  //     }
  //   }
  // }
  _createItemFilterOptions() {
    const filterEl = this.form?.querySelector?.("#itemFilter");
    if (!filterEl) return;

    for (let item of this.actor.items.filter(
      (i) => i?.system && Object.prototype.hasOwnProperty.call(i.system, "equipped") && i.system.equipped === false
    )) {
      if ([...filterEl.querySelectorAll("option")].some((i) => i.innerHTML === item.type)) continue;

      const option = document.createElement("option");
      option.innerHTML = item.type === "ammunition" ? "ammo" : item.type;
      option.value = item.type;
      filterEl.append(option);
    }
  }

  // REMOVED: _filterSpells() - no longer used with spell school categorization
  // The spell filter dropdown (#spellFilter) was removed when migrating to spell schools
  // _filterSpells(event) {
  //   event.preventDefault();
  //   let filterBy = event.currentTarget.value;
  //
  //   for (let spellItem of [
  //     ...this.form.querySelectorAll(".spellList tbody .item"),
  //   ]) {
  //     switch (filterBy) {
  //       case "All":
  //         spellItem.classList.add("active");
  //         sessionStorage.setItem("savedSpellFilter", filterBy);
  //         break;
  //
  //       case `${filterBy}`:
  //         filterBy == spellItem.dataset.spellSchool
  //           ? spellItem.classList.add("active")
  //           : spellItem.classList.remove("active");
  //         sessionStorage.setItem("savedSpellFilter", filterBy);
  //         break;
  //     }
  //   }
  // }

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
    const filterEl = this.form?.querySelector?.("#itemFilter");
    if (!filterEl) return;

    let filterBy = sessionStorage.getItem("savedItemFilter");
    if (filterBy !== null && filterBy !== undefined) {
      filterEl.value = filterBy;
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
  }

  // REMOVED: _setDefaultSpellFilter() - no longer used with spell school categorization
  // The spell filter dropdown (#spellFilter) was removed when migrating to spell schools
  // _setDefaultSpellFilter() {
  //   let filterBy = sessionStorage.getItem("savedSpellFilter");
  //
  //   if (filterBy !== null || filterBy !== undefined) {
  //     this.form.querySelector("#spellFilter").value = filterBy;
  //     for (let spellItem of [
  //       ...this.form.querySelectorAll(".spellList tbody .item"),
  //     ]) {
  //       switch (filterBy) {
  //         case "All":
  //           spellItem.classList.add("active");
  //           break;
  //
  //         case `${filterBy}`:
  //           filterBy == spellItem.dataset.spellSchool
  //             ? spellItem.classList.add("active")
  //             : spellItem.classList.remove("active");
  //           break;
  //       }
  //     }
  //   }
  // }

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

  async _onEquipItems(event) {
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
          callback: () => {},
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
      close: () => {},
    });

    d.position.width = 500;
    d.render(true);
  }

_createStatusTags() {
  const actorSys = this.actor?.system || {};
  Number(actorSys?.woundPenalty ?? 0) !== 0
    ? this.form.querySelector("#wound-icon").classList.add("active")
    : this.form.querySelector("#wound-icon").classList.remove("active");
  Number(actorSys?.fatigue?.level ?? 0) > 0
    ? this.form.querySelector("#fatigue-icon").classList.add("active")
    : this.form.querySelector("#fatigue-icon").classList.remove("active");
  // Optionally guard encumbrance/icon logic similarly
}
/* -------------------------------------------- */
/* Active Effects                                */
/* -------------------------------------------- */

/**
 * Handle Active Effect controls from the Effects tab.
 */
async _onEffectControl(event) {
  event.preventDefault();
  const el = event.currentTarget;
  if (!el || !el.dataset) return;

  const action = el.dataset.action;
  const effectId = el.dataset.effectId;
  if (!action) return;
  if (!this.actor || !this.actor.effects) return;

  if (action === "create") {
    const effectData = {
      name: "New Effect",
      img: "icons/svg/aura.svg",
      changes: [],
      disabled: false,
      transfer: false,
      duration: {}
    };
    const created = await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    const eff = (created && created.length) ? created[0] : null;
    if (eff && eff.sheet) eff.sheet.render(true);
    return;
  }

  const effect = this.actor.effects.get(effectId);
  if (!effect) return;

  switch (action) {
    case "edit":
      if (effect.sheet) effect.sheet.render(true);
      break;
    case "delete":
      await effect.delete();
      break;
    case "toggle":
      await effect.update({ disabled: !effect.disabled });
      break;
    default:
      break;
  }
}
}