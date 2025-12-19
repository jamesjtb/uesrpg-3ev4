import { systemRootPath } from '../constants.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// A small ApplicationV2-based startup popup using the HandlebarsApplicationMixin.
class StartupDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS ?? {}, {
    classes: ["uesrpg-startup", "dialog"],
    position: { width: 650, height: 760 },
    window: { resizable: false, title: "Welcome to the UESRPG Foundry System!" }
  });

  // The template used for the main body
  static PARTS = {
    main: { template: `${systemRootPath}/templates/partials/startup/startup-dialog.html` }
  };

  // Prepare the context for the template (equivalent to v1 renderTemplate usage)
  async _prepareContext(options = {}) {
    const changelogTemplatePath = `${systemRootPath}/templates/partials/startup/changelog.html`;
    const changelogHtml = await foundry.applications.handlebars.renderTemplate(changelogTemplatePath);

    // Provide the same context used previously by v1 renderTemplate call
    return {
      discordInviteUrl: "https://discord.gg/pBRJwy3Ec5",
      githubUrl: "https://github.com/jamesjtb/uesrpg-3ev4",
      contentModLink: "https://github.com/95Gman/UESRPG-revised",
      changelogHtml
    };
  }

  // When rendered, wire up a close button inside the template (if present).
  // The startup template may include a button with data-action="close" or similar;
  // if not, the user can close via the window titlebar.
  _onRender(context, options) {
    // Use DOM API to find a close control within the template and hook it up.
    const closeEl = this.element.querySelector('[data-action="close"], .startup-close, .close-button');
    if (closeEl) closeEl.addEventListener('click', () => this.close());
  }
}

export default async function startupHandler() {
  if (game.settings.get('uesrpg-3ev4', 'noStartUpDialog') === false) {
    // Show changelog and startup popup using the new ApplicationV2 class.
    const dlg = new StartupDialog();
    // render(true) shows as a pop-out window
    dlg.render(true);
  }
}
