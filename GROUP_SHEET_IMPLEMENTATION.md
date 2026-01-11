# Enhanced Group Actor Sheet - Implementation Summary

## Overview
This implementation adds a production-ready Group actor type to the UESRPG 3ev4 Foundry VTT system with modern UI, joint inventory management, travel mechanics, and automated rest system following UESRPG 3ev4 RAW (Chapter 1).

## Features Implemented

### 1. Group Actor Type Schema
**File:** `template.json`
- Added `Group` actor type (already existed in base system)
- Enhanced with `travel` object containing:
  - `pace`: Current travel pace (slow/normal/fast)
  - `averageSpeed`: Calculated average speed of group members
- Enhanced with `lastRest` object containing:
  - `short`: Timestamp of last short rest
  - `long`: Timestamp of last long rest

### 2. Group Sheet Module
**File:** `module/sheets/group-sheet.js`

#### Core Features
- Extends `ActorSheet` with group-specific logic
- 4-tab interface: Members, Inventory, Travel, Details
- Drag-and-drop support for adding actors
- Limited permission sheet for non-GM players

#### Member Resolution
- Resolves member UUIDs to actual actor data
- Handles missing actors gracefully
- Tracks UESRPG-specific stats:
  - HP (current/max)
  - Stamina (current/max)
  - Speed
  - Fatigue level

#### Travel Mechanics
- Average speed calculation from all visible members
- Travel pace cycling (slow → normal → fast)
- RAW-compliant travel pace data:
  - Fast: 7 km/h, 56 km daily, −20 to Observe
  - Normal: 5 km/h, 40 km daily, no penalty
  - Slow: 3 km/h, 24 km daily, can move stealthily

#### Rest Automation (RAW Chapter 1)
**Short Rest (1 hour):**
- Removes 1 fatigue OR recovers 1 SP (priority to fatigue)
- Recovers MP = floor(maxMP/10)
- Posts GM-whispered chat message with results
- Updates `lastRest.short` timestamp

**Long Rest (8 hours):**
- Removes END bonus fatigue levels
- Heals END bonus HP (only if not wounded)
- Recovers all SP and MP
- Posts GM-whispered chat message with results
- Updates `lastRest.long` timestamp

#### Token Deployment (GM Only)
- Deploys all group members to active scene automatically
- Calculates optimal grid layout based on member count (cols = √memberCount)
- Centers deployment on scene with boundary checking
- Uses batch token creation for efficiency
- Foundry v13 API compatible

#### Event Handlers
- `_onViewMember`: Opens member's actor sheet
- `_onRemoveMember`: Removes member from group
- `_onItemShow`: Opens item sheet when clicking item name/image
- `_onItemDelete`: Deletes item with confirmation dialog
- `_onChangePace`: Cycles through travel paces
- `_onShortRest`: Executes short rest automation
- `_onLongRest`: Executes long rest automation
- `_onDeployGroup`: Deploys tokens to scene in grid pattern
- `_onDrop`: Handles actor and item drag-and-drop

### 3. Templates

#### Main Sheet Template
**File:** `templates/group-sheet.html`

**Members Tab:**
- Drop zone for adding actors
- Member list with CSS Grid layout (compact, no overflow)
- Control buttons: Deploy Group, Short Rest, Long Rest
- Member stats display (HP, SP, Speed, Fatigue)
- Compact 24×24px remove member button

**Inventory Tab:**
- Sections for Weapons, Armor, Ammunition, Gear
- Item drag-and-drop support
- Quantity display
- Delete controls with confirmation
- Click item name/image to open item sheet

**Travel Tab:**
- Average speed display (m/round and km/h)
- Travel pace selector with cycling
- RAW travel pace reference table
- Current pace highlighting

**Details Tab:**
- ProseMirror-enriched Description field
- ProseMirror-enriched Notes field

#### Limited Permission Sheet
**File:** `templates/limited-group-sheet.html`

- Read-only view for non-GM players
- Shows only visible members (OBSERVER+ permission)
- Displays group description
- Clickable member portraits

### 4. Styling
**File:** `styles/group-sheet.css`

- Compact, modern UI design
- Hover effects for interactivity
- Consistent color scheme
- Responsive layout
- Stat card styling
- Travel pace table styling
- Inventory list styling

### 5. System Integration

#### Handlebars Helpers
**File:** `module/handlers/init.js`
- Added `eq` helper for equality comparisons in templates

#### System Configuration
**File:** `system.json`
- Added `styles/group-sheet.css` to styles array

#### Sheet Registration
**File:** `module/handlers/init.js`
- Group sheet registered for "Group" actor type
- Set as default sheet for Group actors
- CSS classes: `["uesrpg", "sheet", "actor", "group"]`

## Technical Implementation Details

### Permission Handling
- Uses `testUserPermission(game.user, "OBSERVER")` for member visibility
- Gracefully handles missing actors
- Limited sheet for non-owner/non-GM users

### Data Flow
1. `getData()` resolves members and enriches text
2. Template renders with resolved data
3. Event handlers modify actor/member data
4. Sheet auto-refreshes on updates

### Error Handling
- Missing actors shown with "(Missing)" label
- Prevents group-in-group addition
- Handles undefined/null values safely
- Canvas readiness checks for token deployment

### Chat Integration
- Rest automation posts to chat
- GM-whispered messages for party actions
- Structured HTML output with lists
- Actor name as speaker alias

## Differences from Original Specification

### Simplified Features
1. **Quantity Tracking:** Removed from member schema (was in original design, not in spec)
2. **Circular Reference Detection:** Removed complex checking (simplified to basic group-in-group prevention)
3. **Sort Order Controls:** Removed move up/down buttons (simplified UI)

### Maintained Features
- All RAW compliance requirements
- All rest automation rules
- All travel mechanics
- Token deployment
- Text enrichment
- Limited permission handling

## Files Modified

1. `template.json` - Added travel and lastRest fields to Group schema
2. `module/sheets/group-sheet.js` - Complete rewrite with all features
3. `templates/group-sheet.html` - New 4-tab layout
4. `templates/limited-group-sheet.html` - Updated limited view
5. `styles/group-sheet.css` - New styling (created)
6. `system.json` - Added group-sheet.css to styles
7. `module/handlers/init.js` - Added eq Handlebars helper

## Testing
See `GROUP_SHEET_TESTING.md` for comprehensive manual testing procedures.

## RAW Compliance
All rest and travel mechanics follow UESRPG 3ev4 RAW Chapter 1:
- ✓ Short rest (1 hour): 1 fatigue OR 1 SP + MP recovery
- ✓ Long rest (8 hours): END bonus fatigue/HP + full SP/MP
- ✓ Travel paces with correct speeds and penalties

## Future Enhancements (Not in Scope)
- Encumbrance tracking for group inventory
- Group-level wealth management
- Automated travel time calculation
- Rest scheduling/timers
- Group initiative handling
