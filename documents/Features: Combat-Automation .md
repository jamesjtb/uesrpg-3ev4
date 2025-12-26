# Combat and Damage Automation

This system provides comprehensive automation for combat and damage in UESRPG 3e v4.

## Features

### Automatic Damage Calculation
- Calculates damage reduction from armor, resistances, and toughness
- Supports multiple damage types: physical, fire, frost, shock, poison, magic, silver, sunlight
- Handles Degree of Success (DoS) bonus damage
- Armor penetration support

### Damage Application
- One-click damage application from chat messages
- Automatic HP tracking and updates
- Wound status tracking (wounded, critically wounded, unconscious)
- Visual feedback in chat

### Hit Locations
- Automatic hit location rolls (1d100)
- Distribution: Head (15%), Arms (40%), Body (25%), Legs (20%)

### Enhanced Combat Rolls
- Integrated damage calculation with opposed rolls
- Critical success/failure handling
- Superior weapon support (uses highest of two rolls)

## Usage

### Basic Weapon Attack

1. **Select your token** on the map
2. **Target an enemy** (right-click → Target)
3. **Click the damage icon** (⚔️) on your weapon in the character sheet

The system will:
- Roll weapon damage
- Roll hit location
- Display "Apply Damage" buttons for each target
- Click button to apply damage with all reductions calculated

### Opposed Rolls with Damage

Use the OpposedRoll API for contested attacks:

```javascript
// Import the opposed roll module
import { OpposedRoll } from "./module/combat/opposed-rolls.js";

// Get tokens
const attacker = canvas.tokens.controlled[0];
const defender = Array.from(game.user.targets)[0];

// Get weapon
const weapon = attacker.actor.items.find(i => i.name === "Longsword");

// Perform opposed attack roll
await OpposedRoll.perform(attacker, defender, {
  attackerTarget: 65,  // Combat skill
  defenderTarget: 60,  // Evade skill
  weapon: weapon,
  damageRoll: weapon.system.damage,
  damageType: 'physical',
  autoApplyDamage: false  // Set to true for automatic damage
});
```

### Manual Damage Application

Apply damage directly to an actor:

```javascript
const actor = game.actors.getName("Character Name");

// Apply 10 fire damage
await actor.applyDamage(10, 'fire', {
  source: "Fireball",
  hitLocation: "Body"
});

// Apply healing
await actor.applyHealing(5, {
  source: "Potion"
});
```

### Quick Attack Macro

For quick attacks from macros:

```javascript
// Attack with currently selected weapon
await Uesrpg3e.combat.quickAttack("Longsword");

// Attack with specific options
await Uesrpg3e.combat.quickAttack("Bow", {
  defenseType: 'evade',
  flavor: "Sneak attack!"
});
```

### Calculate Damage Without Applying

Preview damage calculations:

```javascript
const actor = game.actors.getName("Character Name");
const damageCalc = Uesrpg3e.damage.calculateDamage(
  15,           // Raw damage
  'physical',   // Damage type
  actor,        // Target
  {
    penetration: 3,  // Armor penetration
    dosBonus: 2      // DoS bonus
  }
);

console.log(damageCalc);
// {
//   rawDamage: 15,
//   dosBonus: 2,
//   totalRawDamage: 17,
//   reduction: { armor: 2, resistance: 0, toughness: 3, total: 5 },
//   finalDamage: 12,
//   damageType: 'physical',
//   prevented: 5
// }
```

## Settings

Configure automation behavior in **Game Settings → System Settings**:

### Auto-Apply Damage
- **Enabled**: Damage automatically applied when attacker wins opposed roll
- **Disabled**: Show "Apply Damage" button for manual confirmation (default)

### Degree of Success Bonus
- **Enabled**: Half of attacker's DoS added as bonus damage (default)
- **Disabled**: No DoS bonus damage

### Action Point Automation
- **Round-Based**: Reset AP at start of each round
- **Turn-Based**: Reset AP at start of each turn
- **None**: No automation

## Damage Types and Resistances

### Physical Damage
Reduced by:
- Armor rating (from equipped armor)
- Toughness (END bonus)
- Natural Toughness resistance

### Elemental Damage (Fire, Frost, Shock)
Reduced by:
- Type-specific resistance only
- No armor or toughness

### Poison Damage
Reduced by:
- Poison resistance only
- Argonians have high poison resistance

### Magic Damage
Reduced by:
- Magic resistance only
- Bretons have natural magic resistance

### Silver/Sunlight Damage
- Used against undead, werewolves, vampires
- Reduced by type-specific resistance

## Advanced Usage

### Custom Damage Calculation

```javascript
// Get damage reduction breakdown
const reduction = actor.getDamageReduction('fire');
console.log(reduction);
// { armor: 0, resistance: 3, toughness: 0, total: 3 }

// Apply damage ignoring reductions
await actor.applyDamage(20, 'magic', {
  ignoreReduction: true,
  source: "Pure Magic"
});
```

### Weapon Attack Helper

```javascript
const attackerToken = canvas.tokens.controlled[0];
const defenderToken = Array.from(game.user.targets)[0];
const weapon = attackerToken.actor.items.find(i => i.name === "Greatsword");

const result = await Uesrpg3e.combat.performWeaponAttack(
  attackerToken,
  defenderToken,
  weapon,
  {
    defenseType: 'block',  // or 'evade', 'parry'
    flavor: "Power attack!"
  }
);
```

## Troubleshooting

### Damage Not Applying
- Ensure target has valid HP values
- Check console (F12) for errors
- Verify actor has system.health.value and system.health.max

### Wrong Damage Reduction
- Check equipped armor items
- Verify resistance values in character sheet
- Confirm damage type is correct

### "Apply Damage" Button Not Working
- Ensure you're GM or have permission to modify the actor
- Check that chat handlers are initialized (reload if needed)

## API Reference

### Global Namespace: `Uesrpg3e`

#### `Uesrpg3e.damage`
- `DAMAGE_TYPES` - Enum of damage types
- `calculateDamage(raw, type, target, options)` - Calculate damage
- `applyDamage(actor, damage, type, options)` - Apply damage
- `applyHealing(actor, healing, options)` - Apply healing
- `getDamageReduction(actor, type)` - Get reduction values

#### `Uesrpg3e.combat`
- `performWeaponAttack(attacker, defender, weapon, options)` - Full attack
- `quickAttack(weaponName, options)` - Quick attack macro

#### `Uesrpg3e.roll`
- `doTestRoll(actor, options)` - Perform skill test
- `resolveOpposed(aResult, dResult)` - Resolve opposed test

## Example Macros

### Quick Sword Attack
```javascript
await Uesrpg3e.combat.quickAttack("Sword");
```

### Apply Damage to Selected
```javascript
const targets = Array.from(game.user.targets);
for (let target of targets) {
  await target.actor.applyDamage(10, 'fire', {
    source: "Area of Effect Spell"
  });
}
```

### Heal Selected Character
```javascript
const token = canvas.tokens.controlled[0];
if (token) {
  await token.actor.applyHealing(20, {
    source: "Healing Potion"
  });
}
```
