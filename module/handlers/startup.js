import { systemRootPath } from "../constants.js";

/**
 * Startup dialog (Foundry VTT v13.351)
 *
 * Isolated patch based on the reported behavior:
 * - Do NOT mutate `popup.position` (removes fixed sizing side-effects).
 * - Keep implementation on classic Dialog (no ApplicationV2).
 * - Constrain width via Application options; allow height to auto-size.
 */
export default async function startupHandler() {
  if (game.settings.get("uesrpg-3ev4", "noStartUpDialog") !== false) return;

  const changelogTemplatePath = `${systemRootPath}/templates/partials/startup/changelog.html`;

  let changelogHtml = "";
  try {
    // Original file called renderTemplate with a single argument; keep compatible.
    changelogHtml = await renderTemplate(changelogTemplatePath);
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.warn(`UESRPG | Startup dialog: failed to render changelog: ${msg}`);
    changelogHtml = `<div class="changelog-error"><p>Changelog unavailable.</p></div>`;
  }

  const startupDialogTemplatePath = `${systemRootPath}/templates/partials/startup/startup-dialog.html`;
  const startupDialogHtml = await renderTemplate(startupDialogTemplatePath, {
    discordInviteUrl: "https://discord.gg/pBRJwy3Ec5",
    githubUrl: "https://github.com/jamesjtb/uesrpg-3ev4",
    contentModLink: "https://github.com/95Gman/UESRPG-revised",
    changelogHtml
  });

  const popup = new Dialog(
    {
      title: "Welcome to the UESRPG Foundry System!",
      content: startupDialogHtml,
      buttons: {
        one: { label: "Close" }
      },
      default: "one",
      close: () => {}
    },
    {
      width: 650,
      resizable: true,
      classes: ["uesrpg-startup", "dialog"]
    }
  );

  // IMPORTANT: No `popup.position.width/height` mutation.
  popup.render(true);
}
