import { systemRootPath } from '../constants.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// A small ApplicationV2-based startup popup using the HandlebarsApplicationMixin.
class StartupDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    (typeof super.DEFAULT_OPTIONS !== "undefined" ? super.DEFAULT_OPTIONS : {}),
    {
      classes: ["uesrpg-startup", "dialog"],
      position: { width: 650, height: 760 },
      window: { resizable: false, title: "Welcome to the UESRPG Foundry System!" }
    }
  );

  // The template used for the main body
  static PARTS = {
    main: { template: `${systemRootPath}/templates/partials/startup/startup-dialog.html` }
  };

  // Prepare the context for the template (equivalent to v1 renderTemplate usage)
  async _prepareContext(options = {}) {
    const changelogTemplatePath = `${systemRootPath}/templates/partials/startup/changelog.html`;
    let changelogHtml;
    try {
      changelogHtml = await foundry.applications.handlebars.renderTemplate(changelogTemplatePath);
    } catch (error) {
      console.warn(`Failed to load changelog template: ${error && error.message ? error.message : error}`);
      changelogHtml = `<div class="changelog-error"><p>Changelog unavailable</p></div>`;
    }

    // Provide the same context used previously by v1 renderTemplate call
    const base = (typeof super._prepareContext === "function") ? await super._prepareContext(options) : {};
    return Object.assign({}, base, {
      discordInviteUrl: "https://discord.gg/pBRJwy3Ec5",
      githubUrl: "https://github.com/jamesjtb/uesrpg-3ev4",
      contentModLink: "https://github.com/95Gman/UESRPG-revised",
      changelogHtml
    });
  }

  // When rendered, wire up a close button inside the template (if present).
  // The startup template may include a button with data-action="close" or similar;
  // if not, the user can close via the window titlebar.
  _onRender(context, options) {
    // Use DOM API to find a close control within the template and hook it up.
    const closeEl = this.element && this.element.querySelector ? this.element.querySelector('[data-action="close"], .startup-close, .close-button') : null;
    if (closeEl) {
      this._closeHandler = () => this.close();
      closeEl.addEventListener('click', this._closeHandler);
    }

    // Inject a small footer Close button if the template doesn't include one.
    if (this.element && this.element.querySelector && !this.element.querySelector('.startup-footer')) {
      const footer = document.createElement('div');
      footer.className = 'startup-footer';
      footer.style.cssText = 'position: absolute; left: 0; right: 0; bottom: 0; padding: 12px; text-align: center; background: transparent; z-index: 20;';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'startup-close btn';
      btn.textContent = 'Close';
      btn.style.cssText = 'min-width: 120px; padding: 8px 14px; font-weight: bold;';

      this._injectedCloseHandler = () => this.close();
      btn.addEventListener('click', this._injectedCloseHandler);

      footer.appendChild(btn);
      this.element.appendChild(footer);

      // Ensure the scrollable main template content has a bottom padding so content isn't hidden behind the injected footer
      const content = this.element.querySelector('.window-content, .app-body, .startup-content, .application') || this.element;
      if (content && content.style) {
        const currentPad = parseInt(window.getComputedStyle(content).paddingBottom || "0", 10);
        if (currentPad < 80) content.style.paddingBottom = (currentPad + 80) + 'px';
      }
    }
  }

  // Clean up event listeners on close
  _onClose(options) {
    try {
      const closeEl = this.element && this.element.querySelector ? this.element.querySelector('[data-action="close"], .startup-close, .close-button') : null;
      if (closeEl && this._closeHandler) closeEl.removeEventListener('click', this._closeHandler);

      const injectedBtn = this.element && this.element.querySelector ? this.element.querySelector('.startup-close') : null;
      if (injectedBtn && this._injectedCloseHandler) injectedBtn.removeEventListener('click', this._injectedCloseHandler);
    } catch (err) {
      console.debug("StartupDialog cleanup error", err);
    }
    if (typeof super._onClose === "function") super._onClose(options);
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
