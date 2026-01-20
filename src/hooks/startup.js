import { systemRootPath } from "../core/constants.js";

/**
 * Startup dialog (Foundry VTT v13.351, classic API).
 *
 * Goals:
 * - NO ApplicationV2 usage (project constraint).
 * - Do NOT set fixed height or mutate popup.position.* (avoid UI stretching interactions).
 * - Keep the existing Handlebars templates and context fields.
 * - Allow closing via:
 *   - Dialog "Close" button
 *   - A close element inside the template (data-action="close", .startup-close, .close-button)
 */
export default async function startupHandler() {
  // The system setting is inverted: if it's false, show the dialog.
  if (game.settings.get("uesrpg-3ev4", "noStartUpDialog") !== false) return;

  const changelogTemplatePath = `${systemRootPath}/templates/partials/startup/changelog.html`;
  const startupDialogTemplatePath = `${systemRootPath}/templates/partials/startup/startup-dialog.html`;

  let changelogHtml = "";
  try {
    // Use classic renderTemplate for maximum compatibility.
    changelogHtml = await renderTemplate(changelogTemplatePath, {});
  } catch (error) {
    const msg = (error && error.message) ? error.message : String(error);
    console.warn(`UESRPG | Startup dialog: Failed to load changelog template: ${msg}`);
    changelogHtml = `<div class="changelog-error"><p>Changelog unavailable</p></div>`;
  }

  const startupDialogHtml = await renderTemplate(startupDialogTemplatePath, {
    discordInviteUrl: "https://discord.gg/pBRJwy3Ec5",
    githubUrl: "https://github.com/jamesjtb/uesrpg-3ev4",
    contentModLink: "https://github.com/95Gman/UESRPG-revised",
    changelogHtml
  });

  let dlg;

  dlg = new Dialog(
    {
      title: "Welcome to the UESRPG Foundry System!",
      content: startupDialogHtml,
      buttons: {
        close: {
          label: "Close",
          callback: () => {}
        }
      },
      default: "close",

      /**
       * Wire up an internal template close control if present.
       * This keeps parity with your experimental branch behavior,
       * without injecting absolute-positioned footer DOM.
       */
      render: (html) => {
        try {
          const root = html?.[0];
          if (!root) return;

          const closeEl = root.querySelector(
            '[data-action="close"], .startup-close, .close-button'
          );

          if (closeEl) {
            // Avoid duplicate listeners if something re-renders.
            closeEl.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              dlg?.close();
            }, { once: true });
          }
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          console.warn(`UESRPG | Startup dialog: render hook error: ${msg}`);
        }
      }
    },
    {
      classes: ["uesrpg-startup", "dialog"],
      width: 650,
      resizable: false

      // Intentionally no fixed height and no `position` option.
      // Let content determine height; internal template regions should scroll.
    }
  );

  dlg.render(true);
}
