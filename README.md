# UESRPG 3e v4
This system is a fork of the original uesrpg d100 system created by DogBoneZone at https://gitlab.com/DogBoneZone/uesrpg-3e.

A system and a few compendiums used to play the UESRPG game. Special thanks to 2Minute Tabletop and to drhodesw for the tokens and help creating the compendiums.

Express permission to use the artwork and tokens included in the compendiums of this system was given by 2MinuteTabletop and the copyright holder.

You can find the lively UESRPG Discord Community here: https://discord.gg/KAkXdf9

## Installing

### Option A: Install from the Foundry VTT Repository (recommended)

1. Open Foundry and go to the **Setup** screen.
2. Click **Game Systems**.
3. Click **Install System**.
4. In the search box, type **UESRPG**.
5. Find **“UESRPG 3e v4”** and click **Install**
6. Follow the on-screen instructions

---
<img width="1678" height="993" alt="image" src="https://github.com/user-attachments/assets/8708f887-ae6d-4d58-87f4-57367e82234e" />

---
<img width="991" height="848" alt="image" src="https://github.com/user-attachments/assets/99403732-f860-49da-8f60-c9efe8bc2b88" />

---

#### If your search returns no results
* Double-check your search spelling (**UESRPG**).
* Make sure  **All Packages** is selected in the left pane.
* As a last resort, try **Option B**.

### Option B: Install with a Manifest URL (if search doesn’t find it)

1. From **Game Systems**, click **Install System**.
2. At the bottom of the Install System dialog, paste this into **Manifest URL**:
   ```
   https://raw.githubusercontent.com/jamesjtb/uesrpg-3ev4/refs/heads/master/system.json
   ```
3. Click **Install** and follow the remaining on-screen instructions.

## Contributing
### Data Entry
This guide is written for those who would like to help with the entry of content data, but don't necessarily have the skillset to contribute to the project directly.

#### Requirements
- Basic ability to navigate your computer's files
- A file archiving utility (winzip, 7-zip, winrar, etc)
- The latest version of Foundry VTT, locally installed
  - *while this guide can be followed using the remote files on a hosted foundry server, you will need to rely on the host's documentation for file exploration and manipulation*
- The latest version of uesrpg-3ev4 system module (see [Installing](#installing))
- A Foundry world that you can use as your work environment

#### Making and Submitting Compendium Changes
**IMPORTANT!!** You should be starting from the latest unmodified version of the uesrpg-3ev4 system. If you've modified your system compendiums prior to starting a new set of work, you will need to uninstall and reinstall the uesrpg-3ev4 system in foundry. If you do not, you could cause data corruption once you've handed off your changes to a developer.

1. Find your \<foundry data folder\>, and take note of its path for later. On Windows, this can usually be found in `C:\Users\<username>\AppData\Local\FoundryVTT`.
  <img width="1131" height="640" alt="image" src="https://github.com/user-attachments/assets/776cb3c8-1d93-40d9-af3b-489f923a90b6" />

  Hint: if you're unable to find the folders in this path, make sure you "show hidden files" in Windows File Explorer.
  <img width="1139" height="651" alt="image" src="https://github.com/user-attachments/assets/ed5f40e8-b2d2-42a6-a70e-ad5edf786405" />

2. Navigate to your system folder: `<foundry data folder>\Data\systems\uesrpg-3ev4`

3. Open your work environment world in Foundry VTT.

4. Make your changes to the compendium content:
   - Open the compendium you want to modify
   - Create, edit, or delete items/actors/journal entries as needed
   - Test your changes in the world to make sure everything works correctly

5. Once you're satisfied with your changes, find the modified compendium folders:
   - Navigate to: `<foundry data folder>\Data\systems\uesrpg-3ev4\packs\`
   - The compendiums are in folders like `items-revised`, `spells-revised`, `talents-revised`, etc.

6. Create a ZIP file containing your modified compendium folders:
   - Select only the folder(s) you modified (e.g., `items-revised`)
   - Right-click and create a ZIP archive
   - Name it descriptively (e.g., `items-revised-update-YYYY-MM-DD.zip`)

7. Submit your changes:
   - Create an issue on the [GitHub repository](https://github.com/jamesjtb/uesrpg-3ev4/issues)
   - Title it clearly (e.g., "Compendium Update: Items Revised - Added Missing Equipment")
   - Describe what you changed, added, or removed
   - Attach your ZIP file to the issue
   - Include any relevant notes about your changes

8. A developer will review your submission, extract the packs to YAML format for version control, and merge your changes if approved.

**Tips for Data Entry:**
- Work on one compendium at a time to keep submissions manageable
- Test all your changes in-game before submitting
- Include clear descriptions in your GitHub issue
- If you're unsure about something, ask in the [UESRPG Discord](https://discord.gg/KAkXdf9) first 

### Automated Release Process
For maintainers creating new releases:

1. **Update Version**: Run `npm version <version>` to update the version in `package.json` and `system.json`
   ```bash
   npm version 1.0.0-RC.78
   ```

2. **Push Tag**: The version script automatically pushes the tag, which triggers the release workflow
   
3. **Automated Steps**: The GitHub Actions workflow will automatically:
   - Compile compendium packs from source
   - Create a properly structured ZIP bundle
   - Verify the bundle contents and structure
   - Generate release notes with installation instructions
   - Create a GitHub release with the bundle attached
   - Register the release with Foundry VTT

4. **Manual Verification**: Test the release bundle by downloading and installing it in a Foundry VTT instance

The release process ensures:
- ✓ All necessary files are included (system.json, modules, styles, packs, LICENSE)
- ✓ Development files are excluded (node_modules, .git, automation scripts)
- ✓ ZIP structure is compatible with Foundry VTT
- ✓ Release notes include installation instructions
- ✓ Semantic versioning is maintained
