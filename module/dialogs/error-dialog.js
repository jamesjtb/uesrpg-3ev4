export default function renderErrorDialog(message) {
  const errorDialog = new Dialog({
    title: "Error",
    content: `<div style="padding: 10px">${message}</div>`,
    buttons: {
      one: {
        label: "Dismiss"
      }
    },
  });
  errorDialog.render(true);
};
