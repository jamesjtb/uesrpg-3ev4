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
  },
  Ohmes: {
    name: 'Ohmes',
    baseline: {
      str: 20,
      end: 20,
      agi: 27,
      int: 27,
      wp: 24,
      prc: 26,
      prs: 27,
    },
    traits: [
      'Dark Sight (Racial)',
      'Natural Weapons (Claws, 1d4 Slashing) (Racial)',
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Ohmes can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Claws',
        img: `${imgPath}/Icons/claw_strike.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d4',
        dataPath2: 'system.qualities',
        qualities: 'Slashing',
      }
    ]
  },
  'Ohmes-Raht': {
    name: 'Ohmes-Raht',
    baseline: {
      str: 22,
      end: 22,
      agi: 25,
      int: 26,
      wp: 21,
      prc: 28,
      prs: 27,
    },
    traits: [
      'Dark Sight (Racial)',
      'Natural Weapons (Claws, 1d4 Slashing) (Racial)',
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Ohmes-Raht can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Claws',
        img: `${imgPath}/Icons/claw_strike.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d4',
        dataPath2: 'system.qualities',
        qualities: 'Slashing',
      }
    ]
  },
  'Dagi-Raht': {
    name: 'Dagi-Raht',
    baseline: {
      str: 20,
      end: 20,
      agi: 28,
      int: 26,
      wp: 26,
      prc: 27,
      prs: 22,
    },
    traits: [
      'Dark Sight',
      'Natural Weapons (Claws, 1d4 Slashing)',
      'Power Well (20)',
      'During character creation, the Dagi-Raht may start with the Acrobatics skill trained to Novice, thay can take the Catfall talent for free, or both together for 100 XP.'
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Dagi-Raht can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Claws',
        img: `${imgPath}/Icons/claw_strike.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d4',
        dataPath2: 'system.qualities',
        qualities: 'Slashing',
      },
      {
        name: 'Power Well (20)',
        img: `${imgPath}/Icons/powerWell.webp`,
        type: 'trait',
        dataPath: 'system.mpBonus',
        value: 20,
        desc: 'This character has extra reserves of magicka available.',
      }
    ]
  },
  Pahmar: {
    name: 'Pahmar',
    baseline: {
      str: 30,
      end: 28,
      agi: 25,
      int: 15,
      wp: 20,
      prc: 30,
      prs: 15,
    },
    traits: [
      'Dark Sight',
      'Quadruped',
      'Natural Weapons (Claws, 1d10 Slashing)',
      'Natural Weapons (Fangs, 1d8 Splitting)',
      'Strong Jaws',
      'During character creation, the Pahmar may learn the Catfall talent for free.',
      'Looted armor must be modified by a smith before the Pahmar can equip it.',
      'The Pahmar does not have opposable thumbs, and will suffer penalties to any tasks requiring fine motor skills or grip, such as using a weapon. This is left to GM arbitration.',
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Pahmar can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Quadruped (Racial)',
        img: `icons/creatures/abilities/cougar-pounce-stalk-black.webp`,
        type: 'trait',
        desc: 'The Pahmar moves up to twice their speed when they use the Dash action and three times their speed when they use the Sprint stamina ability.',
      },
      {
        name: 'Claws',
        img: `${imgPath}/Icons/claw_strike.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d10',
        dataPath2: 'system.qualities',
        qualities: 'Slashing',
      },
      {
        name: 'Fangs',
        img: `${imgPath}/Icons/skill_143.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d8',
        dataPath2: 'system.qualities',
        qualities: 'Splitting',
      },
      {
        name: 'Strong Jaws (Racial)',
        img: `${imgPath}/Icons/Druideskill_23.webp`,
        type: 'trait',
        desc: 'Automatically start grapple with fangs. Target tests against the original Attack test to resolve the grapple. Counter-Attacks with fang attacks bypass AR.',
      }
    ]
  },
  Senche: {
    name: 'Senche',
    baseline: {
      str: 30,
      end: 28,
      agi: 25,
      int: 15,
      wp: 20,
      prc: 30,
      prs: 15,
    },
    traits: [
      'Dark Sight',
      'Quadruped',
      'Natural Weapons (Claws, 1d10 Slashing)',
      'Natural Weapons (Fangs, 1d8 Splitting)',
      'Viscious (SB + 1)',
      'Strong Jaws',
      'During character creation, the Senche may learn the Catfall talent for free.',
      'Looted armor must be modified by a smith before the Senche can equip it.',
      'The Senche does not have opposable thumbs, and will suffer penalties to any tasks requiring fine motor skills or grip, such as using a weapon. This is left to GM arbitration.',
      'Senche are Large sized creatures. Attempts to hit the character with ranged attacks gain a +10 bonus.',
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Senche can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Quadruped (Racial)',
        img: `icons/creatures/abilities/cougar-pounce-stalk-black.webp`,
        type: 'trait',
        desc: 'The Senche moves up to twice their speed when they use the Dash action and three times their speed when they use the Sprint stamina ability.',
      },
      {
        name: 'Claws',
        img: `${imgPath}/Icons/claw_strike.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d10',
        dataPath2: 'system.qualities',
        qualities: 'Slashing',
      },
      {
        name: 'Fangs',
        img: `${imgPath}/Icons/skill_143.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d8',
        dataPath2: 'system.qualities',
        qualities: 'Splitting',
      },
      {
        name: 'Viscious (SB + 1) (Racial)',
        img: `${imgPath}/Icons/viscious.webp`,
        type: 'trait',
        desc: 'The Senche treats their Strength Bonus as 1 point higher for resolving damage.',
      },
      {
        name: 'Strong Jaws (Racial)',
        img: `${imgPath}/Icons/Druideskill_23.webp`,
        type: 'trait',
        desc: 'Automatically start grapple with fangs. Target tests against the original Attack test to resolve the grapple. Counter-Attacks with fang attacks bypass AR.',
      }
    ]
  },
  Tojay: {
    name: 'Tojay',
    baseline: {
      str: 25,
      end: 24,
      agi: 28,
      int: 27,
      wp: 24,
      prc: 25,
      prs: 22,
    },
    traits: [
      'Dark Sight',
      'Natural Weapons (Fangs, 1d4 Splitting)',
      'Disease Resistance (50%)',
      'Resistance (Poison, 2)',
    ],
    items: [
      {
        name: 'Dark Sight (Racial)',
        img: `${imgPath}/Icons/darkSight.webp`,
        type: 'trait',
        desc: 'The Tojay can see normally even in areas with total darkness, and never takes penalties for acting in areas with dim or no lighting.',
      },
      {
        name: 'Fangs',
        img: `${imgPath}/Icons/skill_143.webp`,
        type: 'weapon',
        dataPath: 'system.damage',
        value: '1d4',
        dataPath2: 'system.qualities',
        qualities: 'Splitting',
      },
      {
        name: "Disease Resistance (50%) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/diseaseResistance.webp",
        type: "trait",
        dataPath: "system.diseaseR",
        value: 50,
        desc: "Characters with this trait have a chance to resist disease.",
      },
      {
        name: "Resistance (Poison, 2) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/poison.webp",
        type: "trait",
        dataPath: "system.poisonR",
        value: 2,
        desc: "This character reduces all incoming Poison damage by 3 and gains +30 bonus to resist non-damaging Poison effects.",
      }
    ]
  },
};
