const imgPath = "systems/uesrpg-3ev4/images";

export default {
  Alfiq: {
    name: "Alfiq",
    baseline: {
      str: 10,
      end: 15,
      agi: 30,
      int: 28,
      wp: 27,
      prc: 30,
      prs: 20,
    },
    traits: [
      "Dark Sight (Racial)",
      "Quadruped (Racial)",
      "Telepathy (3) (Racial)",
      "During character creation, the Alfiq may learn the Catfall talent for free.",
      "Alfiq can purchase the Thought Caster talent without meeting any talent or characteristic prerequisites.",
      "Alfiq are Tiny sized characters. Attempts to hit the Alfiq suffer a -20 penalty. However, the character’s Carry Rating and total HP are halved.",
      "The Alfiq cannot speak normally, and must communicate telepathically. Additionally, the Alfiq does not have opposable thumbs, and will suffer penalties to any tasks requiring fine motor skills or grip, such as using a weapon. This is left to GM arbitration."
    ],
    items: [
      {
        name: "Dark Sight (Racial)",
        img: `${imgPath}/Icons/darkSight.webp`,
        type: "trait",
        desc: "The Alfiq can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.",
      },
      {
        name: "Quadruped (Racial)",
        img: `icons/creatures/abilities/cougar-pounce-stalk-black.webp`,
        type: "trait",
        desc: "The Alfiq moves up to twice their speed when they use the Dash action and three times their speed when they use the Sprint stamina ability.",
      },
      {
        name: "Telepathy (3) (Racial)",
        img: `${imgPath}/Icons/prediction.webp`,
        type: "trait",
        desc: "The Alfiq can broadcast a complex sentence each round as a free action to all characters within WB x 100m.",
      },
    ],
  },
  Cathay: {
    name: 'Cathay',
    baseline: {
      str: 27,
      end: 26,
      agi: 25,
      int: 20,
      wp: 21,
      prc: 27,
      prs: 22,
    },
    traits: [
      'Dark Sight (Racial)',
      'Natural Weapons (Claws, 1d6 Slashing) (Racial)',
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Cathay can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Claws',
        img: `${imgPath}/Icons/claw_strike.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d6',
        dataPath2: 'system.qualities',
        qualities: 'Slashing',
      }
    ]
  }
};
