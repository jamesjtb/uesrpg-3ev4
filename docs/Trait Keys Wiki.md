# Trait Keys Wiki

This file lists trait keys, parameters, and values used by the automation layer.
Set these on Trait/Talent/Power items via `system.traitKey`, `system.traitParam`, and `system.traitValue`.

## Damage type categories
- `resistance.<type>` (traitValue = X)
- `weakness.<type>` (traitValue = X)
- `immunity.<type>` (traitValue ignored, boolean)

Types:
- `fire`
- `frost`
- `shock`
- `poison`
- `magic`
- `silver`
- `sunlight`
- `disease`

Notes:
- Resistance values also feed the Resistance Bonus checkboxes in roll dialogs (+10 per X).
- You can also use `traitKey: resistance` with `traitParam: <type>` (same for weakness/immunity).

## Boolean traits (traitValue ignored)
- `incorporeal` (defender: non-magic sources deal 0 damage; attacker: physical attacks ignore non-magic armor)
- `undead` (standard undead immunities)
- `undead` + `traitParam: bloodless` (disables bleeding/blood loss)
- `skeletal` (applies undead immunities and ranged attack penalty)

## Numeric traits (traitValue used)
- `diseaseResistance` (percent; stacks with `system.resistance.diseaseR`)
- `diseased` (Endurance TN modifier; triggers after natural weapon damage > 0)
- `regeneration` (heal amount on successful round-start Endurance test)
- `resistNormalWeapons` (flat reduction after mitigation vs non-magic sources)
- `silverScarred` (flat bonus damage after mitigation if source counts as silver)
- `sunScarred` (flat bonus damage after mitigation if source counts as sunlight)
- `spellAbsorption` (d10 threshold; on success, magic typed components are negated and MP is restored up to spell cost)
- `vicious` (overrides STR bonus for Crushing/Splitting/Slashing bonus damage)
- `weakBones` (reduces wound threshold by X)

## Item tokens / qualities used by trait automation
These tokens are read from item qualities, tags, and activation traits.
- `handToHand` (marks natural weapons for Diseased)
- `magic` (counts as a magic source)
- `silver` / `silvered` (counts as magic source; triggers Silver-Scarred)
- `sunlight` (triggers Sun-Scarred)
