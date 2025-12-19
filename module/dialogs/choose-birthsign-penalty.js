import { capitalizeFirstLetter } from "../helpers/stringHelpers.js";
import { systemRootPath } from "../constants.js";

const handleDialogResult = (html) => {
  return $(html).find('input[type="radio"]:checked').val();
};

const getUserChoice = (choices, penalty, defaultChoice) => {
  return new Promise(async (resolve) => {
const choiceTemplatePath = `${systemRootPath}/templates/partials/dialogs/choose-birthsign-penalty.hbs`;
const choiceTemplateHtml = await foundry.applications.handlebars.renderTemplate(choiceTemplatePath, {
  choices,
  penalty,
  chosen: defaultChoice,
  groupName: "penaltyChoices"
});
    const dialog = new Dialog({
      title: "Choose Birthsign Penalty",
      content: choiceTemplateHtml,
      buttons: {
        one: {
          label: "Cancel",
          callback: () => resolve(null),
        },
        two: {
          label: "Submit",
          callback: (html) => resolve(handleDialogResult(html)),
        },
      },
    });
    dialog.render(true);
  });
};

export default async function chooseBirthsignPenalty(attributes, penalty) {
  const choices = {};
  for (const attribute of attributes) {
    choices[attribute] = capitalizeFirstLetter(attribute);
  }
  return await getUserChoice(choices, penalty, attributes[0]);
}
