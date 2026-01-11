# Group Actor Sheet - Testing Guide

## Overview
This document provides manual testing procedures for the enhanced Group Actor Sheet feature.

## Prerequisites
- Foundry VTT v12 or v13
- UESRPG 3ev4 system installed
- At least 2 test actors (Player Character or NPC type) created

## Test Cases

### 1. Group Creation
**Steps:**
1. Click "Create Actor" in the Actors directory
2. Select "Group" as the actor type
3. Enter a name (e.g., "Adventuring Party")
4. Click "Create New Actor"

**Expected Result:**
- Group actor is created successfully
- Group sheet opens with 4 tabs: Members, Inventory, Travel, Details
- Default travel pace is "normal"
- No members in the group initially

### 2. Member Management - Add Members
**Steps:**
1. Open the Group sheet
2. Drag an actor from the Actors directory to the "Drag actors here" drop zone
3. Repeat with another actor

**Expected Result:**
- Each actor is added to the members list
- Member portrait displays correctly
- Member stats show: HP, Stamina, Speed
- Fatigue level displays if > 0
- No duplicate warning if same actor dragged again

### 3. Member Management - View Member
**Steps:**
1. Click on a member's name or portrait in the group sheet

**Expected Result:**
- Member's actor sheet opens

### 4. Member Management - Remove Member
**Steps:**
1. Click the compact × (delete) button (24×24px) on a member

**Expected Result:**
- Member is removed from the group
- Group sheet updates immediately
- Delete button is properly sized and aligned

### 5. Travel Pace - Average Speed Calculation
**Steps:**
1. Add 2+ members to the group
2. Navigate to the Travel tab
3. Check the "Average Speed" display

**Expected Result:**
- Average speed is calculated from all visible members
- Display shows "X m/round" and "Y km/h"
- km/h value is calculated as: (m/round × 600) / 1000

### 6. Travel Pace - Cycle Pace
**Steps:**
1. Navigate to Travel tab
2. Click the "Travel Pace" button multiple times

**Expected Result:**
- Pace cycles: Normal → Fast → Slow → Normal
- Current pace is highlighted in the reference table
- Button text updates to show current pace

### 7. Short Rest Automation
**Steps:**
1. Add members to the group
2. Manually reduce one member's stamina or add fatigue
3. Click "Short Rest" button on Members tab
4. Check the chat log

**Expected Result:**
- Chat message appears (GM-whispered) showing:
  - "Short Rest (1 hour)" header
  - For each member: fatigue removed OR stamina recovered
  - Magicka recovery (floor(maxMP/10))
- Member stats update on the sheet
- Notification: "Short rest completed."

### 8. Long Rest Automation
**Steps:**
1. Add members to the group
2. Manually reduce HP, stamina, magicka, and/or add fatigue to members
3. Click "Long Rest" button on Members tab
4. Check the chat log

**Expected Result:**
- Chat message appears (GM-whispered) showing:
  - "Long Rest (8 hours)" header
  - For each member: fatigue removed, HP healed, SP/MP recovered
  - Notes if HP cannot heal due to wounds
- Member stats fully restored (except wounded members)
- Notification: "Long rest completed."

### 9. Token Deployment (GM Only)
**Steps:**
1. Log in as GM
2. Create/open a scene
3. Open Group sheet with 2+ members
4. Click "Deploy Group" button

**Expected Result:**
- Tokens for all group members are created on the scene automatically
- Tokens are arranged in an optimal grid pattern (cols = √memberCount)
- Tokens are centered on the scene with boundary checking
- Notification: "Deployed X group members in a Y×Z grid."
- No interactive placement required

### 10. Inventory Tab - Add Items
**Steps:**
1. Open Group sheet
2. Navigate to Inventory tab
3. Drag a weapon, armor, ammunition, or gear item to the group sheet

**Expected Result:**
- Item is added to the group's inventory
- Item displays in the appropriate section (Weapons/Armor/Ammunition/Gear)
- Quantity displays for items that support it
- Delete button appears for editable sheets

### 10a. Inventory Tab - View Items
**Steps:**
1. Click on an item's name or image in the inventory

**Expected Result:**
- Item sheet opens in a new window
- Can view and edit item details (if permissions allow)

### 10b. Inventory Tab - Delete Items
**Steps:**
1. Click the delete (trash) icon on an item
2. Confirm deletion in the dialog

**Expected Result:**
- Confirmation dialog appears with item name
- Item name is properly escaped (no XSS vulnerability)
- Clicking "Yes" deletes the item
- Clicking "No" cancels the operation
- Notification appears: "X deleted from group inventory."

### 11. Details Tab - Text Enrichment
**Steps:**
1. Navigate to Details tab
2. Enter text in Description field with formatting (@Actor[uuid], @Item[uuid], etc.)
3. Save and re-open the sheet

**Expected Result:**
- Text is enriched (links are clickable)
- ProseMirror editor works correctly
- Notes field works the same way

### 12. Limited Permission Sheet
**Steps:**
1. Log in as a non-GM player
2. Open a Group actor with LIMITED permission
3. Verify the limited sheet displays

**Expected Result:**
- Limited sheet shows only:
  - Group portrait
  - Group name
  - Known members (only those player has OBSERVER+ permission on)
  - Description (if any)
- No edit controls
- Clicking member portraits opens their sheets (if permission allows)

### 13. Group Stats Display - CSS Grid Layout
**Steps:**
1. Add members with varying HP, Stamina, Speed values
2. Add a member with fatigue

**Expected Result:**
- Each member item uses CSS Grid layout (2 rows × 3 columns)
- Portrait (40×40px) spans rows 1-2, column 1
- Member name in row 1, column 2
- Stats (HP, Stamina, Speed) in row 2, column 2
- Compact delete button (24×24px) spans rows 1-2, column 3
- No overflow or misalignment issues
- Each member shows current/max HP
- Each member shows current/max Stamina
- Each member shows speed
- Members with fatigue show red fatigue indicator
- Missing actors show "(Missing)" label and greyed-out portrait

## RAW Compliance Tests

### Short Rest (RAW Chapter 1)
- ✓ Duration: 1 hour (displayed in chat)
- ✓ Removes 1 fatigue OR recovers 1 SP
- ✓ Recovers MP = floor(maxMP/10)

### Long Rest (RAW Chapter 1)
- ✓ Duration: 8 hours (displayed in chat)
- ✓ Removes END bonus fatigue levels
- ✓ Heals END bonus HP (only if not wounded)
- ✓ Recovers all SP and MP

### Travel Pace (RAW Chapter 1)
- ✓ Fast: 7 km/h, 56 km/day, −20 to Observe
- ✓ Normal: 5 km/h, 40 km/day, no penalty
- ✓ Slow: 3 km/h, 24 km/day, can move stealthily

## Known Limitations
1. Encumbrance is not tracked for the group
2. Group-in-group is prevented (by design)
3. Circular references are not explicitly checked (simplified from original design)
4. Quantity tracking removed (simplified from original design)

## Regression Tests
1. Verify existing Player Character and NPC sheets still work
2. Verify existing actor sheets can be dragged to groups
3. Verify system settings still load correctly
4. Verify combat tracker integration still works

## Performance Tests
1. Create a group with 10+ members
2. Verify sheet renders quickly
3. Verify rest automation completes in reasonable time
4. Verify token deployment handles large groups
