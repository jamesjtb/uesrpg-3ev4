# Stamina System Integration Notes

## Overview
The stamina automation system is now implemented with dialog, effect creation, and integration for several core features. Some advanced combat integrations require deeper coupling with the combat workflow system.

## Completed Integrations

### ✓ Physical Exertion (1 SP)
- **Location**: `module/sheets/actor-sheet.js`
- **Functions**: `_onClickCharacteristic()`, `_onSkillRoll()`
- **Implementation**: Applies +20 bonus to STR/END characteristic and skill tests (excluding Combat Style)
- **Consumption**: Automatic on test execution

### ✓ Power Attack (1-3 SP)
- **Location**: `module/sheets/actor-sheet.js`
- **Function**: `_onDamageRoll()`
- **Implementation**: Adds damage bonus (+2 per SP, max +6) to damage rolls
- **Consumption**: Automatic on damage roll execution

### ✓ Sprint (1 SP)
- **Location**: `module/sheets/actor-sheet.js`
- **Function**: `_onCombatQuickAction()` case "dash"
- **Implementation**: Doubles movement speed for next Dash action
- **Consumption**: Automatic when Dash action is used

### ✓ Heroic Action (1 SP)
- **Location**: `module/stamina/stamina-dialog.js`
- **Implementation**: Immediate effect, grants 1 AP instantly
- **Tracking**: Creates round marker effect to prevent multiple uses per round

## Pending Integrations

### ⚠ Power Draw (1 SP)
**Purpose**: Reduce reload time by 1 for next ranged weapon shot

**Helper Function**: `applyPowerDrawBonus(actor, weapon)` in `stamina-integration-hooks.js`

**Integration Points** (recommended):
1. `module/combat/opposed-workflow.js`
   - Function: `_deductAmmunitionForRangedAttack()` or similar reload handling
   - Call `applyPowerDrawBonus()` before calculating reload time
   - Apply the reduction to the weapon's reload calculation

**Implementation Guidance**:
```javascript
// In opposed-workflow.js, where reload is calculated:
const powerDrawReduction = await applyPowerDrawBonus(actor, weapon);
const effectiveReload = Math.max(0, baseReload - powerDrawReduction);
```

### ⚠ Power Block (1 SP)
**Purpose**: Double shield BR for physical damage mitigation

**Helper Function**: `applyPowerBlockBonus(actor, originalBR)` in `stamina-integration-hooks.js`

**Integration Points** (recommended):
1. `module/combat/defense-options.js` or damage mitigation code
   - Look for shield BR calculation during block resolution
   - Call `applyPowerBlockBonus()` when calculating effective BR
   - Only apply to physical damage types

**Implementation Guidance**:
```javascript
// In defense resolution, where BR is applied:
let effectiveBR = shieldBR;
if (isPhysicalDamage) {
  effectiveBR = await applyPowerBlockBonus(actor, shieldBR);
}
const mitigatedDamage = Math.max(0, incomingDamage - effectiveBR);
```

## Effect Persistence
All stamina effects use `duration: {}` (empty object) to ensure they persist indefinitely until consumed by the appropriate action. This is critical for the system to work correctly:

- Effects DO NOT expire based on time/rounds
- Effects ONLY disappear when consumed by their trigger action
- Effects persist across combat rounds, turns, and even out of combat

## Effect Flags Schema
```javascript
flags: {
  uesrpg: {
    key: "stamina-<effect-type>",      // e.g., "stamina-physical-exertion"
    spentSP: <number>,                 // Amount of SP spent
    consumeOn: "<trigger-action>",     // What action consumes this
    description: "<effect description>",
    // Optional fields:
    damageBonus: <number>              // For Power Attack
  }
}
```

## Global API
The stamina system is exposed via `game.uesrpg.stamina`:

```javascript
game.uesrpg.stamina = {
  openDialog,                    // Open stamina spending dialog
  getActiveEffect,               // Get active effect by key
  consumeEffect,                 // Manually consume effect
  applyPhysicalExertion,         // Apply to characteristic test
  applyPhysicalExertionToSkill,  // Apply to skill test
  applyPowerAttack,              // Apply to damage roll
  applySprint,                   // Apply to dash action
  applyPowerDraw,                // Apply to ranged attack (ready)
  applyPowerBlock,               // Apply to block (ready)
  hasEffect                      // Check if effect is active
};
```

## Testing Checklist
- [ ] Dialog opens when clicking Stamina button
- [ ] All 6 options display correctly
- [ ] Power Attack allows 1-3 SP selection
- [ ] Warning shows when SP ≤ 0
- [ ] Effects appear in Active Effects tab
- [ ] Effects persist across rounds
- [ ] Physical Exertion applies to STR/END tests only
- [ ] Physical Exertion does NOT apply to Combat Style
- [ ] Power Attack bonus shows in damage roll
- [ ] Sprint doubles movement in Dash action
- [ ] Heroic Action grants 1 AP immediately
- [ ] Heroic Action can only be used once per round
- [ ] Chat messages post for spending and consumption
- [ ] Effects auto-delete after consumption
- [ ] Replacing same effect removes old effect

## Future Enhancements
1. Complete Power Draw integration with ranged attack workflow
2. Complete Power Block integration with damage mitigation
3. Add visual indicators in UI for active stamina effects
4. Consider adding sound effects for stamina spending
5. Add configuration options for stamina effect icons
