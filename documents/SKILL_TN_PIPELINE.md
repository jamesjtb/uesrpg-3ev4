# Skill TN Pipeline (UESRPG 3ev4)

This document describes how Skill Test Target Numbers (TN) are computed in the system,
and how armor mobility penalties flow from equipped armor to skill rolls.

The intent is to provide an internal reference for future rules updates and debugging.

## Source of truth

* **TN computation**: `module/skills/skill-tn.js`
  * `computeSkillTN(...)` (document-aware wrapper)
  * `computeSkillTNFromData(...)` (pure function; operates on plain objects)

* **Armor mobility derivation**: `module/entities/actor.js`
  * Mobility penalties are derived during `Actor.prepareData()` and stored on:
    `actor.system.mobility`

## Data flow overview

1. Actor prepares derived data
   * During `Actor.prepareData()` the system computes derived values.
   * Armor mobility penalties are computed from currently worn armor (excluding shields).
   * Results are stored to `actor.system.mobility`.

2. Skill roll initiates
   * A workflow (untargeted or opposed) collects roll options:
     difficulty, manual modifier, specialization toggle.
   * The workflow calls `computeSkillTN({ actor, skillItem, ...options })`.

3. TN returned with breakdown
   * `computeSkillTN(...)` returns:
     * `finalTN`
     * `breakdown[]` (label/value/source)
     * `difficulty` (resolved difficulty object)
   * Chat cards render the `breakdown[]` for transparency.

## Breakdown composition

The breakdown is additive. The current order is:

1. **Base Skill**
   * Uses the embedded skill item's `system.value`.

2. **Item Bonus** (skill-linked item automation)
   * The system aggregates equipped item bonuses into `actor.system.professions[skillName]`.
   * If that value differs from the embedded skill value, the delta is treated as an item/tool
     modifier and added as a separate breakdown row.

3. **Fatigue**
   * `actor.system.fatigue.penalty` (if non-zero).

4. **Encumbrance**
   * `actor.system.carry_rating.penalty` (if non-zero).

5. **Armor mobility penalties** (derived)
   * Uses `actor.system.mobility`.
   * Supported penalty channels:
     * `mobility.allTestPenalty` (e.g., crippling)
     * `mobility.skillTestPenalties[skillNameLower]` (skill-specific)
     * `mobility.agilityTestPenalty` (agility-based skills, excluding Combat Style)

6. **Wounded**
   * Applied when `actor.system.wounded === true` using `actor.system.woundPenalty`.

7. **Environment** (scaffolding)
   * Optional: `actor.system.environment.skillPenalties[skillNameLower]`.
   * This field is not required by the system, but provides a safe integration point for
     modules/effects (e.g., darkness → Perception).

8. **Difficulty**
   * From `SKILL_DIFFICULTIES` (Chapter 1) via `difficultyKey`.

9. **Specialization**
   * +10 when toggled and the skill has specialization support.

10. **Manual Modifier**
    * User-entered numeric modifier.

## Agility-based skill detection

Agility-based skills are detected by the skill’s governing characteristic field.
Because the skill data may encode governing characteristics as a list (e.g., `"Str, Agi"`),
the system treats a skill as agility-based if the governing field contains the token
`agi` or `agility` (case-insensitive).

This affects whether `actor.system.mobility.agilityTestPenalty` is applied.

## Debugging

Enable the client setting:
* **Debug: Skill TN Macro**

This exposes a GM-only helper:

```js
await game.uesrpg.debugSkillTN({ skill: "Acrobatics" })
await game.uesrpg.debugSkillTN({ skill: "Acrobatics", difficultyKey: "hard", manualMod: -20, useSpec: true })
```

Behavior:
* Uses selected token’s actor (or `game.user.character`) by default.
* Logs TN inputs and a breakdown table to the console.
* Returns the full TN object.
