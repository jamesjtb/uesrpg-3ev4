UESRPG 3ev4 — Active Effects Guide (Foundry VTT v13.351)

This document describes the Active Effects (AE) framework implemented for the UESRPG 3ev4 system in Foundry VTT v13.351.It serves as:
- A reference for content creators (items, talents, traits)
- A debugging guide for maintainers
- A roadmap marker distinguishing implemented vs deferred AE lanes
- All listed effects are deterministic, stack-safe, and tested, unless explicitly marked otherwise.

**1 Core Design Principles **
1.1  Deterministic evaluation
- The system does not rely on Foundry auto-applying AE changes
- All AE changes are explicitly read and evaluated by the system
- Results are derived at roll-time or prepare-data time, never stored permanently

1.2 ADD vs OVERRIDE semantics
For every supported modifier key:
ADD: stack-safe summation
OVERRIDE: deterministic replacement
!!! Highest-priority OVERRIDE wins !!!
OVERRIDE suppresses all ADD for the same key
OVERRIDE is API-correct and normalized across numeric and string modes.

1.3 Transfer semantics (locked)
Weapons / Armor: effects apply only if item.system.equipped === true
Talents / Traits: effects always apply
Spells: intentionally deferred; not part of this guide

**2. Combat & Rolls Attribute Keys**

2.1 Combat Target Numbers (TN)
Attacker
system.modifiers.combat.attackTN

Defender
system.modifiers.combat.defenseTN.total
system.modifiers.combat.defenseTN.evade
system.modifiers.combat.defenseTN.block
system.modifiers.combat.defenseTN.parry
system.modifiers.combat.defenseTN.counter

Applies to:
- Opposed combat
- Unopposed combat style rolls (parity guaranteed)
- Shown in UI: Full provenance in TN breakdown (collapsible)

2.2 Skills Attribute Keys
Global
system.modifiers.skills._all

Per-skill
system.modifiers.skills.<skillKey>

!!! Applies at roll-time only, never mutates stored skill values. !!!

**3. Damage System Attribute Keys**
3.1 Attacker-side modifiers
Bonus damage
system.modifiers.combat.damage.dealt

Supports:
Numeric: +3
Typed: 3[fire], 2[frost], etc.
Typed bonus damage:

Is applied as part of the same damage workflow and uses the correct damage type. It is reduced by resistances and toughness and is shown in the damage breakdown

Penetration
system.modifiers.combat.penetration

Note: Penetration effectively reduces target armor by increasing penetration.
This behavior is consistent and deterministic, even if not strictly RAW in all interpretations.

3.2 Defender-side modifiers Attribute Keys
Damage taken
system.modifiers.combat.damage.taken

Flat mitigation
system.modifiers.combat.mitigation.flat

3.3 Damage types, armor & resistance Attribute Keys
Armor Rating
system.modifiers.combat.armorRating
system.modifiers.combat.armorRating.<LocationKey>

Resistances
system.modifiers.resistance.fireR
system.modifiers.resistance.frostR
system.modifiers.resistance.shockR
system.modifiers.resistance.poisonR
system.modifiers.resistance.magicR
system.modifiers.resistance.silverR
system.modifiers.resistance.sunlightR

Natural Toughness (RAW-aligned)
system.modifiers.resistance.natToughness

Important (RAW):
Natural Toughness reduces all damage types. It functions like AR but does not count as armor

**4. Derived Stats Attribute Keys**
4.1 Initiative
system.modifiers.initiative.base
system.modifiers.initiative.bonus

Not supported:
initiative.value (by design; initiative is derived)

4.2 Speed Attribute Keys

system.modifiers.speed.base
system.modifiers.speed.bonus

**5. Resources Attribute Keys (Max values only)**
Supported
system.modifiers.hp.max
system.modifiers.magicka.max
system.modifiers.stamina.max
system.modifiers.luck_points.max

Behavior: Max values are derived. Current values are clamped only if exceeding max. No direct mutation of current values via AE

**6. Wound Threshold Attribute Keys**
system.modifiers.wound_threshold.bonus
system.modifiers.wound_threshold.value
Applies after form/trait adjustments.

**7. Carry & Encumbrance Attribute Keys**
7.1 Carry capacity

system.modifiers.carry.base
system.modifiers.carry.bonus
system.modifiers.carry.override

7.2 Encumbrance penalty lanes Attribute Keys (RAW-aligned)
Test penalty
system.modifiers.encumbrance.testPenalty

Legacy alias (still supported):
system.modifiers.encumbrance.penalty

Speed penalty
system.modifiers.encumbrance.speedPenalty

Stamina penalty
system.modifiers.encumbrance.staminaPenalty

These modify post-bracket penalties, not the bracket selection itself.

[[ Encumbrance → Fatigue conversion (RAW) : 

If encumbrance penalties would reduce Stamina max below 0:
- Stamina max is clamped to 0
- Excess converts into fatigue bonus
- Conversion is derived-only and reversible ]]

**8. Fatigue / Exhaustion Attribute Keys**
Bonus lane
system.modifiers.fatigue.bonus
Alias: system.modifiers.exhaustion.bonus

Penalty lane
system.modifiers.fatigue.penalty
Alias: system.modifiers.exhaustion.penalty

!!! Application order: Encumbrance overflow (derived) => Fatigue bonus AE => Fatigue level calculation => Base fatigue penalty => Fatigue penalty AE !!!

**9. OVERRIDE support (global)**
OVERRIDE is supported and tested for all keys listed above.

Rules:
OVERRIDE replaces ADD for the same key. Deterministic resolution via priority

Works for:
- TN
- Skills
- Damage
- Derived stats
- Resources
- Encumbrance
- Fatigue

**10. Deferred / Not Implemented (by design)**

These are explicitly not implemented yet and safe to ignore until future updates:

- Spell targeting & spell AE transfer logic
- Economy modifiers
- Armor mobility penalties as explicit AE lanes (currently handled internally, not AE-exposed)
- Initiative “current value” overrides

- Any AE mutating stored document data
