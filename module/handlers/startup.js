import { systemRootPath } from '../constants.js';

export default async function startupHandler() {
  if (game.settings.get('uesrpg-3ev4', 'noStartUpDialog') === false) {
    const changelogTemplatePath = `${systemRootPath}/templates/partials/startup/changelog.html`;
    const changelogHtml = await renderTemplate(changelogTemplatePath);

    const startupDialogTemplatePath = `${systemRootPath}/templates/partials/startup/startup-dialog.html`;
    const startupDialogHtml = await renderTemplate(startupDialogTemplatePath, {
      discordInviteUrl: "https://discord.gg/pBRJwy3Ec5",
      githubUrl: "https://github.com/jamesjtb/uesrpg-3ev4",
      contentModLink: "https://github.com/95Gman/UESRPG-revised",
      changelogHtml,
    });

    const popup = new Dialog({
      title: "Welcome to the UESRPG Foundry System!",
      content: startupDialogHtml,
      buttons: {
            one: {
              label: "Close"
            }
          },
      default: "one",
      close: () => console.log()
    });
    popup.position.width = 650;
    popup.position.height = 760;
    popup.render(true);
  }
}
