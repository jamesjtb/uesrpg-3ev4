/**
 * Extend the basic foundry.appv1.sheets.ActorSheet with some very simple modifications
 * @extends {foundry.appv1.sheets.ActorSheet}
 */
import { isLucky } from "../helpers/skillCalcHelper.js";
import { SYSTEM_ROLL_FORMULA, UESRPG } from "../constants.js";
import { isUnlucky } from "../helpers/skillCalcHelper.js";
import chooseBirthsignPenalty from "../dialogs/choose-birthsign-penalty.js";
import { characteristicAbbreviations } from "../maps/characteristics.js";
import renderErrorDialog from '../dialogs/error-dialog.js';
import { applyPhysicalExertionBonus, applyPhysicalExertionToSkill, applyPowerAttackBonus } from "../stamina/stamina-integration-hooks.js";
import coreRaces from "./racemenu/data/core-races.js";
import coreVariants from "./racemenu/data/core-variants.js";
import { renderRaceCards } from "./racemenu/render-race-cards.js";
import khajiitFurstocks from './racemenu/data/khajiit-furstocks.js';
import expandedRaces from "./racemenu/data/expanded-races.js";
import { calculateDegrees } from "../helpers/diceHelper.js";
import { getDamageTypeFromWeapon, getHitLocationFromRoll } from "../combat/combat-utils.js";
import { OpposedRoll } from "../combat/opposed-rolls.js";
import { OpposedWorkflow } from "../combat/opposed-workflow.js";
import { classifySpellForRouting, getUserSpellTargets, shouldUseTargetedSpellWorkflow, shouldUseModernSpellWorkflow, debugMagicRoutingLog } from "../magic/spell-routing.js";
import { filterTargetsBySpellRange, getSpellRangeType, placeAoETemplateAndCollectTargets } from "../magic/spell-range.js";
import { SkillOpposedWorkflow } from "../skills/opposed-workflow.js";
import { computeSkillTN, SKILL_DIFFICULTIES } from "../skills/skill-tn.js";
import { isItemEffectActive } from "../ae/transfer.js";
import { getSpecialActionById } from "../config/special-actions.js";
import { doTestRoll, formatDegree } from "../helpers/degree-roll-helper.js";
import { requireUserCanRollActor } from "../helpers/permissions.js";
import { buildSkillRollRequest, normalizeSkillRollOptions, skillRollDebug } from "../skills/roll-request.js";
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
import { AimAudit } from "../combat/aim-audit.js";
import { createOrUpdateStatusEffect } from "../effects/status-effect.js";
import { buildSpecialActionsForActor, getActiveCombatStyleId, getExplicitActiveCombatStyleItem, isSpecialActionUsableNow } from "../combat/combat-style-utils.js";
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
import { registerStaminaButtonHandler } from "./actor-sheet-stamina-integration.js";

export class SimpleActorSheet extends foundry.appv1.sheets.ActorSheet {
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

async getData(options = {}) {
    // v13 migration / data normalization: legacy typos in rank values
    const normalizeRankValue = (rank) => {
      if (rank == null) return rank;
      const r = String(rank).toLowerCase();
      if (r === "journeymain") return "journeyman";
      return r;
    };

  // In modern Foundry versions, super.getData is async
  const data = await super.getData(options);

  // Safe defaults
  data.dtypes = ["String", "Number", "Boolean"];
  data.isGM = game.user.isGM;

  // Editable flags differ by Foundry generation; make it robust
  data.editable =
    this.isEditable ??
    this.options?.editable ??
    data.options?.editable ??
    false;

  // Prepare character items (only if actor type matches)
  if (this.actor.type === "Player Character") {
    this._prepareCharacterItems(data);
  }

  // Combat tab quick actions + equipped summary (template-friendly)
  // Safe for any actor; uses prepared sheet data containers when present.
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

    // "Special Actions" sheet surface always shows the full list; known/unknown sourced from active style.
    data.actor.sheetCombatActions = {
      activeCombatStyleId: activeCombatStyleId ?? "",
      combatStyles: combatStyles.map(cs => ({
        id: cs.id,
        name: cs.name,
        isActive: Boolean(activeCombatStyleId && cs.id === activeCombatStyleId)
      })),
      activeCombatStyleName: activeStyleItem?.name ?? null,
      specialActions,
      // Spell availability drives the Cast Magic quick action enablement.
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
  const bio = (data.actor && data.actor.system && typeof data.actor.system.bio === "string") ? data.actor.system.bio : "";
  data.actor.system.enrichedBio = await enrichFn(bio, { async: true });
    // Normalize rank values for rendering (prevents UI defaulting to 'untrained' due to legacy typos)
    try {
      const items = data?.items || [];
      for (const it of items) {
        if (it?.type === "combatStyle" && it?.system) {
          it.system.rank = normalizeRankValue(it.system.rank);
        }
      }
    } catch (e) { /* no-op */ }


  
    // Active Effects list for templates (plain objects).
    // We render these inside the Magic tab (AE-first UI) instead of a dedicated Effects tab.
    data.effects = (this.actor?.effects?.contents ?? []).map(e => e.toObject());

return data;
}


  _prepareCharacterItems(sheetData) {
    return prepareCharacterItems(sheetData, { includeSkills: true, includeMagicSkills: true });
  }

  /* -------------------------------------------- */

  /** @override */
async activateListeners(html) {
  super.activateListeners(html);

  // Rollable Buttons & Menus
  html.find(".characteristic-roll").click(this._onClickCharacteristic.bind(this));
  html.find(".skill-roll").click(this._onSkillRoll.bind(this));
  html.find(".combat-roll").click(this._onCombatRoll.bind(this));
  html.find(".magic-roll").click(this._onMagicSkillRoll.bind(this));
  html.find(".resistance-roll").click(this._onResistanceRoll.bind(this));
  html.find(".damage-roll").click(this._onDamageRoll.bind(this));
  html.find(".ammo-roll").click(this._onAmmoRoll.bind(this));
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
  
  html.find("#luckyMenu").click(this._onLuckyMenu.bind(this));
  html.find("#raceMenu").click(this._onRaceMenu.bind(this));
  html.find("#birthSignMenu").click(this._onBirthSignMenu.bind(this));
  html.find("#xpMenu").click(this._onXPMenu.bind(this));
  html.find(".rank-select").click(this._selectCombatRank.bind(this));

  // Update Item Attributes from Actor Sheet
  html.find(".toggle2H").click(this._onToggle2H.bind(this));
  html.find(".plusQty").click(this._onPlusQty.bind(this));
  html.find(".minusQty").contextmenu(this._onMinusQty.bind(this));
  html.find(".itemEquip").click(this._onItemEquip.bind(this));
  html.find(".wealthCalc").click(this._onWealthCalc.bind(this));
  html.find(".setBaseCharacteristics, .characteristics-config").click(this._onSetBaseCharacteristics.bind(this));
  html.find(".characteristics-config").keydown((ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._onSetBaseCharacteristics(ev);
    }
  });
  html.find(".carryBonus").click(this._onCarryBonus.bind(this));
  html.find(".incrementResource").click(this._onIncrementResource.bind(this));
  // Resource restore (migrated from label button)
  html.find(".restoreResource").click(this._onResetResource.bind(this));
  
  // Register stamina button handler after incrementResource
  registerStaminaButtonHandler(this, html);
  
  // html.find("#spellFilter").click(this._filterSpells.bind(this)); // DISABLED: Spell filter dropdown removed
  html.find("#itemFilter").click(this._filterItems.bind(this));
  html.find(".incrementFatigue").click(this._incrementFatigue.bind(this));
  html.find(".equip-items").click(this._onEquipItems.bind(this));

  // Item Create Buttons
  // (common handler binding happens via bindCommonSheetListeners)
  // Checks for UI Elements on Sheets and Updates
  // this._createSpellFilterOptions(); // DISABLED: Spell filter dropdown removed in school-based categorization
  this._createItemFilterOptions();
  // this._setDefaultSpellFilter(); // DISABLED: Spell filter dropdown removed in school-based categorization
  this._setDefaultItemFilter();
  this._setResourceBars();

  // Spell item click to open sheet
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
      const combatant = combat?.combatants?.find?.((c) => c?.actor?.id === this.actor.id) ?? null;
      const inStartedCombat = Boolean(combat && combat.started && combatant);

      if (inStartedCombat) {
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
        console.warn("UESRPG | Sheet quick action failed to delete effect", { actor: this.actor?.uuid, effectId: effect?.id, err });
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

        // Get active combat style UUID to pre-select it (if available)
        const activeCombatStyle = getExplicitActiveCombatStyleItem(this.actor);
        const attackerSkillUuid = activeCombatStyle?.uuid ?? null;

        // Create skill opposed test with combat style pre-selected if available
        const message = await SkillOpposedWorkflow.createPending({
          attackerTokenUuid: actorToken?.document?.uuid ?? actorToken?.uuid,
          defenderTokenUuid: targetToken?.document?.uuid ?? targetToken?.uuid,
          attackerSkillUuid,  // Pre-select active combat style if available
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

        const style = (this.actor.itemTypes?.combatStyle?.[0] ?? this.actor.items.find(i => i.type === "combatStyle")) ?? null;
        if (!style) {
          ui.notifications.warn("No Combat Style found on this actor.");
          return;
        }

        const base = Number(style.system?.value ?? 0) || 0;
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
          attackerItemUuid: style.uuid,
          attackerLabel: `${label} — ${style.name}`,
          attackerTarget: tn,
          mode: "attack",
          attackMode,
          weaponUuid: weapon.uuid
        });
        return;
      }

      case "disengage": {
        if (!(await requireAP("Disengage", 1))) return;
        // Aim chain breaks if any action other than Aim or firing the aimed weapon/spell is taken.
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
        const duration = {}; // Turn-ticker managed; avoid duration races with external modules
        await upsertSimpleEffect({
          key: "defensiveStance",
          name: "Defensive Stance",
          icon: "systems/uesrpg-3ev4/images/Icons/heroicDefense.webp",
          statusId: "uesrpg-action-defensive-stance",
          duration,
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
        
        // Check for Sprint stamina effect
        const { applySprintBonus } = await import("../stamina/stamina-integration-hooks.js");
        const sprintEffect = await applySprintBonus(this.actor);
        const speed = this.actor.system?.speed?.value ?? 0;
        const movement = sprintEffect ? speed * 2 : speed;
        
        // Build Dash description
        const baseDescription = "The character can use this action in order to move up to their Speed";
        const sprintNote = sprintEffect ? " (2× Speed from Sprint effect)" : "";
        const turnDescription = "If this is done on their Turn, this movement is added to their base movement for that Turn. This action can be used to allow a character to move several times their Speed during a round.";
        const sprintDetails = sprintEffect ? `<p><b>Sprint Active:</b> Movement up to ${movement} meters</p>` : "";
        
        await postActionCard(
          "Dash",
          `<p>${baseDescription}${sprintNote}. ${turnDescription}</p>${sprintDetails}`
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

        // AP consumption removed here - will be handled in OpposedWorkflow
        // Check AP availability without consuming
        const currentAP = Number(this.actor?.system?.action_points?.value ?? 0);
        if (currentAP < 1) {
          ui.notifications.warn(`${this.actor.name} does not have enough Action Points (${currentAP}/1).`);
          return;
        }

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
            skipAttackerAPDeduction: false // AP will be consumed during attack commitment
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
            skipAttackerAPDeduction: false // AP will be consumed during attack commitment
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
      // No-op: UI state is optional
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

    // Generic collapsible blocks (non-table, non-list)
    const collapsible = toggleEl.closest(".uesrpg-collapsible");
    if (collapsible) {
      const body = collapsible.querySelector(".uesrpg-collapse-body");
      if (body) body.style.display = collapsed ? "none" : "";
      return;
    }
    // Tables: hide/show tbody
    const table = toggleEl.closest("table");
    if (table) {
      const tbody = table.querySelector("tbody");
      if (tbody) tbody.style.display = collapsed ? "none" : "";
      return;
    }

    // Lists: hide/show the next list within the same section container
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
   * @param event   The originating click event
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
            const strFav = Boolean(html.find('[id="strFav"]').prop("checked"));
            const endFav = Boolean(html.find('[id="endFav"]').prop("checked"));
            const agiFav = Boolean(html.find('[id="agiFav"]').prop("checked"));
            const intFav = Boolean(html.find('[id="intFav"]').prop("checked"));
            const wpFav  = Boolean(html.find('[id="wpFav"]').prop("checked"));
            const prcFav = Boolean(html.find('[id="prcFav"]').prop("checked"));
            const prsFav = Boolean(html.find('[id="prsFav"]').prop("checked"));
            const lckFav = Boolean(html.find('[id="lckFav"]').prop("checked"));

            //Shortcut for characteristics
            const chaPath = this.actor.system.characteristics;

            //Assign values to characteristics
            chaPath.str.base = strInput;
            chaPath.str.total = strInput;

            chaPath.end.base = endInput;
            chaPath.end.total = endInput;

            chaPath.agi.base = agiInput;
            chaPath.agi.total = agiInput;

            chaPath.int.base = intInput;
            chaPath.int.total = intInput;

            chaPath.wp.base = wpInput;
            chaPath.wp.total = wpInput;

            chaPath.prc.base = prcInput;
            chaPath.prc.total = prcInput;

            chaPath.prs.base = prsInput;
            chaPath.prs.total = prsInput;

            chaPath.lck.base = lckInput;
            chaPath.lck.total = lckInput;

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
              "system.characteristics.str.favored": strFav,
              "system.characteristics.end.favored": endFav,
              "system.characteristics.agi.favored": agiFav,
              "system.characteristics.int.favored": intFav,
              "system.characteristics.wp.favored": wpFav,
              "system.characteristics.prc.favored": prcFav,
              "system.characteristics.prs.favored": prsFav,
              "system.characteristics.lck.favored": lckFav,
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

    // Check for Physical Exertion stamina effect
    const staminaBonus = await applyPhysicalExertionBonus(this.actor, element.id);

    // Mobility: Heavy armor imposes -20 to Agility-based tests (except Combat Style).
    // For characteristic rolls, apply only when rolling Agility.
    const mobilityAgiPenalty = (String(element?.id || "").toLowerCase() === "agi")
      ? Number(this.actor?.system?.mobility?.agilityTestPenalty || 0)
      : 0;
    const woundedValue =
      this.actor.system.characteristics[element.id].total +
      this.actor.system.woundPenalty +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty +
      mobilityAgiPenalty +
      staminaBonus;
    const regularValue =
      this.actor.system.characteristics[element.id].total +
      this.actor.system.fatigue.penalty +
      this.actor.system.carry_rating.penalty +
      mobilityAgiPenalty +
      staminaBonus;
    let tags = [];
    const hasWoundPenalty = Number(this.actor.system?.woundPenalty ?? 0) !== 0;
    if (hasWoundPenalty) {
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
    if (mobilityAgiPenalty !== 0) {
      tags.push(
        `<span class="tag armor-tag">Heavy Armor ${mobilityAgiPenalty}</span>`
      );
    }

    if (mobilityAgiPenalty !== 0) {
      tags.push(
        `<span class="tag armor-mobility-tag">Armor Mobility ${mobilityAgiPenalty}</span>`
      );
    }

    if (staminaBonus > 0) {
      tags.push(
        `<span class="tag">Physical Exertion +${staminaBonus}</span>`
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
  const playerInputRaw = html.find('[id="playerInput"]').val();
  const playerInput = Number.parseInt(playerInputRaw, 10) || 0;

  const roll = new Roll("1d100");
  await roll.evaluate();

  let contentString = "";

           const tn = hasWoundPenalty
  ? woundedValue + playerInput
  : regularValue + playerInput;
const { isSuccess, doS, doF } = calculateDegrees(Number(roll.total), tn);
let degreesLine = `<br><b>${isSuccess ? "Degrees of Success" : "Degrees of Failure"}: ${isSuccess ? doS : doF}</b>`;

if (isLucky(this.actor, roll.result)) {
  contentString = `<h2>${element.getAttribute("name")}</h2>
    <p></p><b>Target Number: [[${tn}]]</b> <p></p>
    <b>Result: [[${roll.total}]]</b><p></p>
    <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>${degreesLine}`;
} else if (isUnlucky(this.actor, roll.result)) {
  contentString = `<h2>${element.getAttribute("name")}</h2>
    <p></p><b>Target Number: [[${tn}]]</b> <p></p>
    <b>Result: [[${roll.total}]]</b><p></p>
    <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>${degreesLine}`;
} else {
  contentString = `<h2>${element.getAttribute("name")}</h2>
    <p></p><b>Target Number: [[${tn}]]</b> <p></p>
    <b>Result: [[${roll.total}]]</b><p></p>
    <b>${roll.total <= tn
      ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
      : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
    }</b>${degreesLine}`;
}

          await roll.toMessage({
  user: game.user.id,
  speaker: ChatMessage.getSpeaker(),
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


  async _onSkillRoll(event) {
    event.preventDefault();

    if (!requireUserCanRollActor(game.user, this.actor)) {
      return;
    }

    const button = event.currentTarget;
    const li = button.closest(".item");
    const skillItem = this.actor.items.get(li?.dataset.itemId);

    if (!skillItem) {
      ui.notifications.warn("Skill item not found.");
      return;
    }

    const quickShift = Boolean(event.shiftKey) && game.settings.get("uesrpg-3ev4", "skillRollQuickShift");

    const getLast = () => {
      try { return game.settings.get("uesrpg-3ev4", "skillRollLastOptions") ?? {}; } catch (_e) { return {}; }
    };
    const setLast = async (patch={}) => {
      const prev = getLast();
      const next = { ...prev, ...patch };
      next.lastSkillUuidByActor = { ...(prev.lastSkillUuidByActor||{}), ...(patch.lastSkillUuidByActor||{}) };
      try { await game.settings.set("uesrpg-3ev4", "skillRollLastOptions", next); } catch (_e) {}
    };

    // --- Targeted -> opposed workflow (supports multi-target deterministically) ---
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

      // One opposed card per target (deterministic and transparent).
      const created = [];
      for (const defenderToken of targets) {
        const msg = await SkillOpposedWorkflow.createPending({
          attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
          defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
          attackerActorUuid: this.actor.uuid,
          defenderActorUuid: defenderToken.actor?.uuid ?? null,
          attackerSkillUuid: skillItem.uuid,
          attackerSkillLabel: skillItem.name
        });
        if (msg) created.push(msg);

        // Shift-click: quick roll for the attacker using defaults/remembered options.
        if (msg && quickShift) {
          await SkillOpposedWorkflow.handleAction(msg, "attacker-roll", { event });
        }
      }

      // If multiple targets are selected, it is intentional; no extra warning required.
      return;
    }

    // --- Untargeted -> single skill test (dialog unless Shift quick-roll) ---
    const hasSpec = String(skillItem?.system?.trainedItems ?? "").trim().length > 0;
    const last = getLast();

    const defaults = normalizeSkillRollOptions(last, { difficultyKey: "average", manualMod: 0, useSpec: false });

    let decl = null;

    if (quickShift) {
      decl = { difficultyKey: defaults.difficultyKey, manualMod: defaults.manualMod, useSpec: defaults.useSpec };
    } else {
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
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" name="useSpec" ${hasSpec ? "" : "disabled"} ${defaults.useSpec ? "checked" : ""} />
              <span><b>Use Specialization</b> (+10)${hasSpec ? "" : ' <span style="opacity:0.75;">(none on this skill)</span>'}</span>
            </label>
          </div>
          <div class="form-group" style="margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <label style="margin:0;"><b>Manual Modifier</b></label>
            <input name="manualMod" type="number" value="${Number(defaults.manualMod) || 0}" style="width:120px;" />
          </div>
        </form>`;

      try {
        decl = await Dialog.wait({
          title: `${skillItem.name} — Roll Options`,
          content,
          buttons: {
            ok: {
              label: "Roll",
              callback: (html) => {
                const root = html instanceof HTMLElement ? html : html?.[0];
                const difficultyKey = root?.querySelector('select[name="difficultyKey"]')?.value ?? "average";
                const useSpec = Boolean(root?.querySelector('input[name="useSpec"]')?.checked);
                const rawManual = root?.querySelector('input[name="manualMod"]')?.value ?? "0";
                const manualMod = Number.parseInt(String(rawManual), 10) || 0;
                return normalizeSkillRollOptions({ difficultyKey, useSpec, manualMod }, defaults);
              }
            },
            cancel: { label: "Cancel", callback: () => null }
          },
          default: "ok"
        }, { width: 420 });
      } catch (_e) {
        decl = null;
      }
    }

    if (!decl) return;

    // Normalize + clamp UI inputs (and also normalizes the difficulty key).
    decl = normalizeSkillRollOptions(decl, defaults);

    await setLast({
      difficultyKey: decl.difficultyKey,
      manualMod: decl.manualMod,
      useSpec: Boolean(decl.useSpec),
      lastSkillUuidByActor: { [this.actor.uuid]: skillItem.uuid }
    });

    // Check for Physical Exertion stamina effect for STR/END skills
    const staminaBonus = await applyPhysicalExertionToSkill(this.actor, skillItem);

    const request = buildSkillRollRequest({
      actor: this.actor,
      skillItem,
      targetToken: null,
      options: { difficultyKey: decl.difficultyKey, manualMod: decl.manualMod + staminaBonus, useSpec: Boolean(decl.useSpec) },
      context: { source: "sheet", quick: quickShift }
    });
    skillRollDebug("untargeted request", request);

    const tn = computeSkillTN({
      actor: this.actor,
      skillItem,
      difficultyKey: decl.difficultyKey,
      manualMod: decl.manualMod + staminaBonus,
      useSpecialization: hasSpec && decl.useSpec
    });

    skillRollDebug("untargeted TN", { finalTN: tn.finalTN, breakdown: tn.breakdown });

    // Tag bar (kept consistent with existing tags)
    const tags = [];
    if (Number(this.actor.system?.woundPenalty ?? 0) !== 0) tags.push(`<span class="tag wound-tag">Wounded ${this.actor.system.woundPenalty}</span>`);
    if (this.actor.system.fatigue.penalty != 0) tags.push(`<span class="tag fatigue-tag">Fatigued ${this.actor.system.fatigue.penalty}</span>`);
    if (this.actor.system.carry_rating.penalty != 0) tags.push(`<span class="tag enc-tag">Encumbered ${this.actor.system.carry_rating.penalty}</span>`);

    const armorMods = (tn.breakdown ?? []).filter(b => String(b.label || "").startsWith("Armor:") && Number(b.value) !== 0);
    for (const m of armorMods) {
      const v = Number(m.value) || 0;
      tags.push(`<span class="tag armor-tag">${m.label} ${v}</span>`);
    }

    if (tn?.difficulty?.mod) tags.push(`<span class="tag">${tn.difficulty.label} ${tn.difficulty.mod >= 0 ? "+" : ""}${tn.difficulty.mod}</span>`);
    if (hasSpec && decl.useSpec) tags.push(`<span class="tag">Specialization +10</span>`);
    if (decl.manualMod) tags.push(`<span class="tag">Mod ${decl.manualMod >= 0 ? "+" : ""}${decl.manualMod}</span>`);
    if (staminaBonus > 0) tags.push(`<span class="tag">Physical Exertion +${staminaBonus}</span>`);

    const res = await doTestRoll(this.actor, { rollFormula: SYSTEM_ROLL_FORMULA, target: tn.finalTN, allowLucky: true, allowUnlucky: true });

    skillRollDebug("untargeted result", { rollTotal: res.rollTotal, target: res.target, isSuccess: res.isSuccess, degree: res.degree, critS: res.isCriticalSuccess, critF: res.isCriticalFailure });

    const degreeLine = res.isSuccess
      ? `<b style="color:green;">SUCCESS — ${formatDegree(res)}</b>`
      : `<b style="color:rgb(168, 5, 5);">FAILURE — ${formatDegree(res)}</b>`;

    const breakdownRows = (tn.breakdown ?? []).map(b => {
      const v = Number(b.value ?? 0);
      const sign = v >= 0 ? "+" : "";
      return `<div style="display:flex; justify-content:space-between; gap:10px;"><span>${b.label}</span><span>${sign}${v}</span></div>`;
    }).join("");

    const declaredParts = [];
    if (tn?.difficulty?.label) declaredParts.push(`${tn.difficulty.label} (${tn.difficulty.mod >= 0 ? "+" : ""}${tn.difficulty.mod})`);
    if (hasSpec && decl.useSpec) declaredParts.push("Spec +10");
    if (decl.manualMod) declaredParts.push(`Mod ${decl.manualMod >= 0 ? "+" : ""}${decl.manualMod}`);

    const flavor = `
      <div>
        <h2 style="margin:0 0 6px 0;"><img src="${skillItem.img}" style="height:24px; vertical-align:middle; margin-right:6px;"/>${skillItem.name}</h2>
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
      flags: { uesrpg: { rollRequest: request }, "uesrpg-3ev4": { rollRequest: request } },
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
	debugMagicRoutingLog({ source: "SimpleActorSheet._onCastMagicAction", actor: this.actor, spell, targets });
	
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
      // If the user has not selected any targets, do not hard-stop casting here.
      // This is critical for spells which may be cast untargeted (including some upkeep-capable spells)
      // and for any casting flows that derive targets later.
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
	  // Untargeted attack/healing spells: use modern unopposed casting engine (no defense, no application).
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
    } else {
      // Non-attack or no target -> use existing spell dialog
      // Trigger the existing _onSpellRoll with the spell item
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

	    // Centralized routing for targeted spells invoked via legacy entry points (e.g. favorites/hotkeys).
	    // If this spell is an attack OR healing spell and a target is selected, route into MagicOpposedWorkflow.
	    const targets = getUserSpellTargets();
	    debugMagicRoutingLog({ source: "SimpleActorSheet._onSpellRoll", actor: this.actor, spell: spellToCast, targets });
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

async _onCombatRoll(event) {
  event.preventDefault();

  const button = $(event.currentTarget);
  const li = button.parents(".item");
  const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

  if (!item) {
    ui.notifications.warn("Combat item not found.");
    return;
  }

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
  const hasWoundPenalty = Number(this.actor.system?.woundPenalty ?? 0) !== 0;
  if (hasWoundPenalty) {
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

  // IMPORTANT WORKFLOW:
  // If the user has a target selected, we start an opposed test immediately WITHOUT prompting for modifiers.
  // All attack options + manual modifier are declared later from the chat card "Roll Attack" button.
  const targets = [...(game.user.targets ?? [])];
  if (targets.length > 1) {
    ui.notifications.warn("Multiple targets selected. Using the first targeted token for this opposed roll.");
  }
  const defenderToken = targets[0] ?? null;
  if (defenderToken) {
    const attackerToken =
      canvas?.tokens?.controlled?.find(t => t.actor?.id === this.actor.id) ??
      this.actor.getActiveTokens?.()[0] ??
      null;

    if (!attackerToken) {
      ui.notifications.warn("No attacker token found on the canvas. Select your token and try again.");
      return;
    }

    const tn = hasWoundPenalty ? woundedValue : regularValue;

    await OpposedWorkflow.createPending({
      attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
      defenderTokenUuid: defenderToken.document?.uuid ?? defenderToken.uuid,
      attackerActorUuid: this.actor.uuid,
      defenderActorUuid: defenderToken.actor?.uuid ?? null,
      attackerItemUuid: item.uuid,
      attackerLabel: item.name,
      attackerTarget: tn,
      mode: "attack"
    });

    return;
  }

  // No target selected -> standard single roll with a manual modifier dialog.
  // UI: match the unopposed skill roll card information density (Target Number, Options, DoS/DoF, TN breakdown).
  const d = new Dialog({
    title: `${item.name} — Roll Options`,
    content: `<form>
                <div class="form-group" style="margin-bottom:8px;">
                  <label style="display:block;"><b>Difficulty</b></label>
                  <select id="difficultyKey" style="width:100%;">
                    ${SKILL_DIFFICULTIES.map(df => {
                      const sign = df.mod >= 0 ? "+" : "";
                      const sel = df.key === "average" ? "selected" : "";
                      return `<option value="${df.key}" ${sel}>${df.label} (${sign}${df.mod})</option>`;
                    }).join("\n")}
                  </select>
                </div>
                <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                  <label style="margin:0;"><b>Manual Modifier</b></label>
                  <input id="playerInput" type="number" value="0" style="width:120px; text-align:center;" />
                </div>
              </form>`,
    buttons: {
      one: {
        label: "Roll",
        callback: async (html) => {
          const playerInputRaw = html.find('[id="playerInput"]').val();
          const playerInput = Number.parseInt(String(playerInputRaw ?? "0"), 10) || 0;

          const difficultyKey = String(html.find('[id="difficultyKey"]').val() ?? "average");
          const diff = (SKILL_DIFFICULTIES ?? []).find(dv => dv.key === difficultyKey) ?? { key: "average", label: "Average", mod: 0 };
          const difficultyMod = Number(diff.mod ?? 0) || 0;

          // Preserve existing TN semantics:
          // - item.system.value is the Combat Style base (with its own internal bonuses)
          // - add Wound/Fatigue/Encumbrance (as previously implemented)
          const base = Number(item.system?.value ?? 0);
          const fatigue = Number(this.actor.system?.fatigue?.penalty ?? 0);
          const enc = Number(this.actor.system?.carry_rating?.penalty ?? 0);
          const wound = this.actor.system?.wounded ? Number(this.actor.system?.woundPenalty ?? 0) : 0;

          const breakdown = [];
          breakdown.push({ label: "Base TN", value: base });
          breakdown.push({ label: `Difficulty: ${diff.label}`, value: difficultyMod });
          if (fatigue) breakdown.push({ label: "Fatigue", value: fatigue });
          if (enc) breakdown.push({ label: "Encumbrance", value: enc });
          if (wound) breakdown.push({ label: "Wounded", value: wound });
          if (playerInput) breakdown.push({ label: "Manual Modifier", value: playerInput });

                    // Active Effects combat modifiers (attack TN) for unopposed Combat Style rolls.
          // This mirrors the opposed combat TN pipeline.
          const aeBreakdown = [];
          let aeTotal = 0;

          // Actor effects
          for (const ef of (this.actor?.effects ?? [])) {
            if (ef?.disabled) continue;
            const changes = Array.isArray(ef?.changes) ? ef.changes : [];
            let v = 0;
            for (const ch of changes) {
              if (!ch) continue;
              if (ch.key !== "system.modifiers.combat.attackTN") continue;
              if (ch.mode !== (CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2)) continue;
              v += Number(ch.value) || 0;
            }
            if (v) {
              aeBreakdown.push({ label: ef?.name ?? "Effect", value: v });
              aeTotal += v;
            }
          }

          // Item transfer effects (Apply Effect to Actor)
          for (const it of (this.actor?.items ?? [])) {
            for (const ef of (it?.effects ?? [])) {
              if (!ef?.transfer) continue;
              if (!isItemEffectActive(this.actor, it, ef)) continue;
              if (ef?.disabled) continue;

              const changes = Array.isArray(ef?.changes) ? ef.changes : [];
              let v = 0;
              for (const ch of changes) {
                if (!ch) continue;
                if (ch.key !== "system.modifiers.combat.attackTN") continue;
                if (ch.mode !== (CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2)) continue;
                v += Number(ch.value) || 0;
              }
              if (v) {
                const label = ef?.name ? `${it.name}: ${ef.name}` : (it.name ?? "Item");
                aeBreakdown.push({ label, value: v });
                aeTotal += v;
              }
            }
          }

          for (const e of aeBreakdown) breakdown.push(e);

          const tn = base + difficultyMod + fatigue + enc + wound + playerInput + aeTotal;

          const res = await doTestRoll(this.actor, {
            rollFormula: SYSTEM_ROLL_FORMULA,
            target: tn,
            allowLucky: true,
            allowUnlucky: true
          });

          const degreeLine = res.isSuccess
            ? `<b style="color:green;">SUCCESS — ${formatDegree(res)}</b>`
            : `<b style="color:rgb(168, 5, 5);">FAILURE — ${formatDegree(res)}</b>`;

          const breakdownRows = breakdown.map(b => {
            const v = Number(b.value ?? 0);
            const sign = v >= 0 ? "+" : "";
            return `<div style="display:flex; justify-content:space-between; gap:10px;"><span>${b.label}</span><span>${sign}${v}</span></div>`;
          }).join("");

          const declaredParts = [];
          {
            const sign = difficultyMod >= 0 ? "+" : "";
            declaredParts.push(`${diff.label} (${sign}${difficultyMod})`);
          }
          if (playerInput) declaredParts.push(`Mod ${playerInput >= 0 ? "+" : ""}${playerInput}`);

          const flavor = `
            <div>
              <h2 style="margin:0 0 6px 0;">
                ${item.img ? `<img src="${item.img}" style="height:24px; vertical-align:middle; margin-right:6px;"/>` : ""}
                ${item.name}
              </h2>
              <div><b>Target Number:</b> ${tn}</div>
              <div style="margin-top:2px; font-size:12px; opacity:0.85;"><b>Options:</b> ${declaredParts.join("; ")}</div>
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
      },
      two: {
        label: "Cancel",
        callback: () => null
      }
    },
    default: "one"
  }, { width: 420 });

  d.render(true);
}

  async _onResistanceRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
	let tags = [];
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
            await roll.evaluate();
            const tn = this.actor.system.resistance[element.id] + playerInput;
const { isSuccess, doS, doF } = calculateDegrees(Number(roll.total), tn);

const degreesLine = `<br><b>${
  isSuccess ? "Degrees of Success" : "Degrees of Failure"
}: ${isSuccess ? doS : doF}</b>`;
let contentString = "";
            if (isLucky(this.actor, roll.result)) {
 contentString = `<h2>${element.getAttribute("name")}</h2>
            <p></p><b>Target Number: [[${this.actor.system.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.total}]]</b><p></p>
            <span style='color:green; font-size:120%;'> <b>LUCKY NUMBER!</b></span>
            ${degreesLine}`;
            } else if (isUnlucky(this.actor, roll.result)) {
             contentString = `<h2>${element.getAttribute("name")}</h2>
            <p></p><b>Target Number: [[${this.actor.system.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.total}]]</b><p></p>
            <span style='color:rgb(168, 5, 5); font-size:120%;'> <b>UNLUCKY NUMBER!</b></span>
            ${degreesLine}`;
            } else {
              contentString = `<h2>${element.getAttribute("name")}</h2>
            <p></p><b>Target Number: [[${this.actor.system.resistance[element.id]} + ${playerInput}]]</b> <p></p>
            <b>Result: [[${roll.total}]]</b><p></p>
            <b>${
              roll.total <= this.actor.system.resistance[element.id] + playerInput
                ? " <span style='color:green; font-size: 120%;'> <b>SUCCESS!</b></span>"
                : " <span style='color: rgb(168, 5, 5); font-size: 120%;'> <b>FAILURE!</b></span>"
            }</b>
            ${degreesLine}`;
            }
            
            await roll.toMessage({
  user: game.user.id,
  speaker: ChatMessage.getSpeaker(),
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


async _onDamageRoll(event) {
  event.preventDefault();

  const button = event.currentTarget;
  const li = button.closest(".item");
  const weapon = this.actor.items.get(li?.dataset?.itemId);

  if (!weapon) {
    ui.notifications.warn("Weapon not found for damage roll.");
    return;
  }

  const shortcutWeapon = weapon;

  // RAW: Hit Location is usually the 1s digit of the attack roll, but can also be determined by rolling 1d10 (10 counts as 0).
  // This weapon card currently rolls hit location directly (opposed-roll wiring will supply the attack roll later).
  const hit = new Roll("1d10");
  await hit.evaluate();
  const hitResult = Number(hit.total);
  const hit_loc = getHitLocationFromRoll(hitResult);

  // Damage roll (prefer derived effective dice expressions)
  const damageString =
    (shortcutWeapon.system.damage3Effective ?? shortcutWeapon.system.damage3 ?? shortcutWeapon.system.damage2Effective ?? shortcutWeapon.system.damage2 ?? shortcutWeapon.system.damageEffective ?? shortcutWeapon.system.damage) || "0";

  // Resolve structured qualities to support Proven/Primitive and later automation.
  const structured = Array.isArray(shortcutWeapon.system.qualitiesStructuredInjected)
    ? shortcutWeapon.system.qualitiesStructuredInjected
    : Array.isArray(shortcutWeapon.system.qualitiesStructured)
      ? shortcutWeapon.system.qualitiesStructured
      : [];
  const hasQ = (key) => structured.some(q => String(q?.key ?? q ?? "").toLowerCase() === key);

  const weaponRoll = new Roll(damageString);
  await weaponRoll.evaluate();
  let altRoll = null;
  let baseDamage = Number(weaponRoll.total);

  // Superior quality level (legacy boolean) and Proven/Primitive qualities (structured)
  const wantsProven = hasQ("proven");
  const wantsPrimitive = hasQ("primitive");
  const wantsSuperior = !!shortcutWeapon.system.superior;

  if (wantsSuperior || wantsProven || wantsPrimitive) {
    altRoll = new Roll(damageString);
    await altRoll.evaluate();
    const altTotal = Number(altRoll.total);

    if (wantsPrimitive && !wantsProven) baseDamage = Math.min(baseDamage, altTotal);
    else baseDamage = Math.max(baseDamage, altTotal);
  }

  // Final damage (Power Attack will be applied by damage resolver when Apply Damage is clicked)
  const finalDamage = baseDamage;

  const supRollTag = altRoll
    ? `<div style="margin-top:0.25rem;font-size:x-small;line-height:1.2;">Roll A: ${weaponRoll.total}<br>Roll B: ${altRoll.total}</div>`
    : "";

  // Render qualities from Structured Qualities + Traits (no journal links).
  const labelIndex = (() => {
    const core = UESRPG?.QUALITIES_CORE_BY_TYPE?.weapon ?? UESRPG?.QUALITIES_CATALOG ?? [];
    const traits = UESRPG?.TRAITS_BY_TYPE?.weapon ?? [];
    const idx = new Map();
    for (const q of [...core, ...traits, ...(UESRPG?.QUALITIES_CATALOG ?? [])]) {
      if (!q?.key) continue;
      idx.set(String(q.key).toLowerCase(), String(q.label ?? q.key));
    }
    return idx;
  })();

  const qualitiesHtml = (() => {
    const pills = [];
    const injected = Array.isArray(shortcutWeapon.system.qualitiesStructuredInjected)
      ? shortcutWeapon.system.qualitiesStructuredInjected
      : Array.isArray(shortcutWeapon.system.qualitiesStructured)
        ? shortcutWeapon.system.qualitiesStructured
        : [];

    for (const q of injected) {
      const key = String(q?.key ?? q ?? "").toLowerCase().trim();
      if (!key) continue;
      const label = labelIndex.get(key) ?? key;
      const v = (q?.value !== undefined && q?.value !== null && q?.value !== "") ? Number(q.value) : null;
      pills.push(`<span class="tag">${v != null && !Number.isNaN(v) ? `${label} (${v})` : label}</span>`);
    }

    const traits = Array.isArray(shortcutWeapon.system.qualitiesTraits) ? shortcutWeapon.system.qualitiesTraits : [];
    for (const t of traits) {
      const key = String(t ?? "").toLowerCase().trim();
      if (!key) continue;
      const label = labelIndex.get(key) ?? key;
      pills.push(`<span class="tag">${label}</span>`);
    }

    if (!pills.length) return "<span style=\"opacity:0.75;\">—</span>";
    return `<span class="uesrpg-inline-tags">${pills.join("")}</span>`;
  })();

  const damageType = getDamageTypeFromWeapon(shortcutWeapon);

  // Optional: include target apply buttons if the user has one or more targets selected.
  const targets = Array.from(game.user.targets ?? []);
  const applyButtons = targets.length
    ? `<div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;">
        ${targets.map(t => {
          const uuid = t?.actor?.uuid;
          if (!uuid) return "";
          return `<button type="button" class="apply-damage-btn" 
                    data-target-uuid="${uuid}"
                    data-attacker-actor-uuid="${this.actor.uuid}"
                    data-weapon-uuid="${shortcutWeapon.uuid}"
                    data-damage="${finalDamage}"
                    data-damage-type="${damageType}"
                    data-hit-location="${hit_loc}"
                    data-dos-bonus="0"
                    data-penetration="0"
                    data-source="${shortcutWeapon.name}">
                    Apply Damage → ${t.name}
                  </button>`;
        }).join("")}
      </div>`
    : "";


  const contentString = `
    <div class="uesrpg-weapon-damage-card">
      <h2 style="display:flex;gap:0.5rem;align-items:center;">
        <img src="${shortcutWeapon.img}" style="height:32px;width:32px;">
        <div>${shortcutWeapon.name}</div>
      </h2>

      <table class="uesrpg-weapon-damage-table">
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
            <td class="tableCenterText">${finalDamage}${supRollTag}</td>
            <td class="tableCenterText">
              <div>${damageString}</div>
              <div style="margin-top:0.35rem;">${qualitiesHtml}</div>
            </td>
          </tr>
          <tr>
            <td class="tableAttribute">Hit Location</td>
            <td class="tableCenterText">${hit_loc}</td>
            <td class="tableCenterText">[[${hit.total}]]</td>
          </tr>
        </tbody>
      </table>
      ${applyButtons}
    </div>
  `;

  const rollsToSend = [weaponRoll, hit];
  if (altRoll) rollsToSend.push(altRoll);

  await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker(),
    content: contentString,
    rolls: rollsToSend,
    rollMode: game.settings.get("core", "rollMode"),
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

const currentQty = Number(item.system.quantity ?? 0);
const newQty = Math.max(currentQty - 1, 0);

if (newQty === 0) ui.notifications.info("Out of Ammunition!");

await item.update({ "system.quantity": newQty });

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

const currentQty = Number(item.system.quantity ?? 0);
await item.update({ "system.quantity": currentQty + 1 });
  }

  async _onMinusQty(event) {
    event.preventDefault();
    let toggle = $(event.currentTarget);
    const li = toggle.parents(".item");
    const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));

const currentQty = Number(item.system.quantity ?? 0);
const newQty = Math.max(currentQty - 1, 0);

if (newQty === 0 && currentQty > 0) {
  ui.notifications.info(`You have used your last ${item.name}!`);
}

await item.update({ "system.quantity": newQty });

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
            callback: () => {},
          },
        },
        default: "one",
        close: () => {},
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
    await postItemToChat(event, this.actor, { includeImage: true });
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
          callback: () => {},
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
      close: () => {},
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
          callback: () => {},
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
      close: () => {},
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
            callback: () => {},
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
        close: () => {},
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
            callback: () => {},
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
        close: () => {},
      });
    }
    d.render(true);
  }

  async _onRaceMenu(event) {
    event.preventDefault();

    const coreRaceCards = renderRaceCards(coreRaces);
    const variantRaceCards = renderRaceCards(coreVariants);
    const khajiitFurstockRaceCards = renderRaceCards(khajiitFurstocks);
    const expandedRaceCards = renderRaceCards(expandedRaces);

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
                      <h1 style="padding-top: 10px;">Expanded Races</h1>
                      <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-between; align-content: center; width: 100%;">
                        ${expandedRaceCards.join("")}
                      </div>
                  </div>
                </form>`,
      buttons: {
        one: {
          label: "Cancel",
          callback: () => {},
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

              const races = { ...coreRaces, ...coreVariants, ...khajiitFurstocks, ...expandedRaces };

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
      close: () => {},
    });

    d.position.width = 600;
    d.position.height = 775;
    d.render(true);
  }

  async _onBirthSignMenu(event) {
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
          callback: () => {},
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
                    const newDocItem = docItem.toObject();
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
      close: () => {},
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
    const resourceLabel = event.currentTarget?.dataset?.resource;
    if (!resourceLabel) return;
    const resource = this.actor.system?.[resourceLabel];
    if (!resource || typeof resource.max !== "number") return;
    const dataPath = `system.${resourceLabel}.value`;
    return this.actor.update({ [dataPath]: resource.max });
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
          callback: () => {},
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

  _setDefaultSpellFilter() {
    // Spell filter dropdown removed in school-based categorization
    // Method retained for backward compatibility but is now a no-op
    const filterElement = this.form?.querySelector("#spellFilter");
    if (!filterElement) return;
    // Early return: filter element doesn't exist in new template
  }

  _createStatusTags() {
    const hasWoundPenalty = Number(this.actor.system?.woundPenalty ?? 0) !== 0;
    hasWoundPenalty
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
          {
            const mode = String(item.system?.attackMode ?? "melee").toLowerCase();
            const rr = (mode === "ranged")
              ? (String(item.system?.range ?? item.system?.rangeBandsDerivedEffective?.display ?? item.system?.rangeBandsDerived?.display ?? "").trim())
              : (String(item.system?.reach ?? "").trim());
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
                            <td style="text-align: center;">${rr}</td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="itemSelect" data-item-id="${item._id
            }" ${item.system.equipped ? "checked" : ""}>
                            </td>
                        </tr>`;
          }
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
                                          <th>Reach/Range</th>
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
              const shouldEquip = !!armorItem.checked;
              await thisArmor.update({ "system.equipped": shouldEquip });
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