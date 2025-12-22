export class AdvantageDialog extends Dialog {
  static async show(attacker, defender, advantageCount, weapon) {
    const options = this._getAdvantageOptions(attacker, advantageCount);
    
    return new Promise((resolve) => {
      new Dialog({
        title: "Use Advantage",
        content: this._buildContent(options, advantageCount),
        buttons: {
          confirm: {
            label: "Apply",
            callback: (html) => {
              const selected = html.find('input[name="advantage"]:checked').val();
              resolve(selected);
            }
          }
        },
        default: "confirm"
      }).render(true);
    });
  }

  static _getAdvantageOptions(attacker, count) {
    return [
      { id: 'precision', name: 'Precision Strike', desc: 'Choose hit location' },
      { id:  'penetrate', name: 'Penetrate Armor', desc: 'Full→Partial, Partial→None' },
      { id: 'press', name: 'Press Advantage', desc: '+10 next attack' },
      // Add Special Advantages from Combat Style
      ... this._getSpecialAdvantages(attacker)
    ];
  }
}
