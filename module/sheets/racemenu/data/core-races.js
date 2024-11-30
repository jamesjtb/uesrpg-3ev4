const imgPath = "systems/uesrpg-3ev4/images";

export const coreRaces = {
  altmer: {
    name: "Altmer",
    img: `${imgPath}/altmer.webp`,
    baseline: {
      str: 20,
      end: 23,
      agi: 23,
      int: 30,
      wp: 28,
      prc: 25,
      prs: 25,
    },
    traits: [
      "Disease Resistance (50%)",
      "Power Well (20)",
      "Weakness (Magic, 2)",
      "Mental Strength: Ignores penalties to Willpower tests made to resist paralysis",
      "During character creation, Altmer characters may pick one of the traditional magic skills to begin trained at Novice rank for free.",
    ],
    items: [
      {
        name: "Disease Resistance (50%) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/diseaseResistance.webp",
        type: "trait",
        dataPath: "system.diseaseR",
        value: 50,
        desc: `This character has a 50% chance to resist disease. Whenever the\
          character would be infected by a common disease, roll a d100. If the\
          roll is less than or equal to 50, the character doesn’t get the disease.`,
      },
      {
        name: "Power Well (20) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/powerWell.webp",
        type: "trait",
        dataPath: "system.mpBonus",
        value: 20,
        desc: "This character has extra reserves of magicka available.",
      },
      {
        name: "Weakness (Magic, 2) (Racial)",
        img: "icons/magic/defensive/shield-barrier-blue.webp",
        type: "trait",
        dataPath: "system.magicR",
        value: -2,
      },
      {
        name: "Mental Strength (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/Skill_203.webp",
        type: "trait",
        desc: "Altmer ignore penalties to Willpower made to resist paralysis.",
      },
    ],
  },

  argonian: {
    name: "Argonian",
    img: `${imgPath}/argonian.webp`,
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
      "Disease Resistance (75%)",
      "Immunity (Poison)",
      "Amphibious: Can breathe water and ignores skill cap placed on Combat rolls by their Athletics skill",
      "Inscrutable: -10 penalty on Persuade tests vs. Non-Argonians & others receive -10 penalty on Observe tests to determine an Argonians motives",
    ],
    items: [
      {
        name: "Disease Resistance (75%) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/diseaseResistance.webp",
        type: "trait",
        dataPath: "system.diseaseR",
        value: 75,
        desc: "This character has a chance to resist disease.",
      },
      {
        name: "Immunity (Poison) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/poison.webp",
        type: "trait",
        dataPath: "system.poisonR",
        value: 200,
        desc: "This character does not take damage from Poison effects.",
      },
      {
        name: "Amphibious (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/amphibious.webp",
        type: "trait",
        desc: "Can breathe water and ignores skill-cap placed on Combat rolls by their Athletics Skill when fighting in water.",
      },
      {
        name: "Inscrutable (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/Assassinskill_31.webp",
        type: "trait",
        desc: "Argonians receive a -10 penalty to Persuade tests made to interact with non-Argonians. However, Observe tests made to try to distingush their motives are made with -10 penalty.",
      },
    ],
  },

  bosmer: {
    name: "Bosmer",
    img: `${imgPath}/bosmer.webp`,
    baseline: {
      str: 21,
      end: 21,
      agi: 31,
      int: 25,
      wp: 23,
      prc: 26,
      prs: 24,
    },
    traits: [
      "Disease Resistance (50%)",
      "Resistance (Poison, 1)",
      "Natural Archers: May add shortbows to any Combat Style (does not count towards weapon max)",
      "Beast Tongue: Can speak with animals",
    ],
    items: [
      {
        name: "Disease Resistance (50%) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/diseaseResistance.webp",
        type: "trait",
        dataPath: "system.diseaseR",
        value: 50,
        desc: "This character has a chance to resist disease.",
      },
      {
        name: "Resistance (Poison, 1) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/poison.webp",
        type: "trait",
        dataPath: "system.poisonR",
        value: 1,
        desc: "This character reduces any incoming Poison damage by 1 and receives +10 bonus to resist non-damaging Poison effects.",
      },
      {
        name: "Natural Archer (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/Archerskill_04.webp",
        type: "trait",
        desc: "Bosmer add shortbows to any combat style they use. This does not count towards that combat style's maximum trained weapon count.",
      },
      {
        name: "Beast Tongue (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/beastAbility.webp",
        type: "power",
        desc: "Bosmer can speak to, and understand the speech of, animals. How exactly this functions is left to the GM’s discretion, though it is recommended the GM call for a Perception test when the Bosmer encounters the speech of an unfamiliar animal to determine if they can understand it and communicate back. Additionally, the character receives a +20 bonus to any Profession [Animal Training] skill tests they make.",
      },
    ],
  },

  breton: {
    name: "Breton",
    img: `${imgPath}/breton.webp`,
    baseline: {
      str: 23,
      end: 21,
      agi: 22,
      int: 28,
      wp: 30,
      prc: 25,
      prs: 25,
    },
    traits: [
      "Resistance (Magic, 2)",
      "Power Well (10)",
      "During character creation, Breton characters may pick one of the traditional magic skills to begin trained at Novice rank for free.",
    ],
    items: [
      {
        name: "Resistance (Magic, 2) (Racial)",
        img: "icons/magic/defensive/shield-barrier-blue.webp",
        type: "trait",
        dataPath: "system.magicR",
        value: 2,
        desc: "This character reduces incoming Magic damage by 2 and receives +20 bonus to resist any non-damaging magic effects",
      },
      {
        name: "Power Well (10) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/powerWell.webp",
        type: "trait",
        dataPath: "system.mpBonus",
        value: 10,
        desc: "This character has extra reserves of magicka available to them.",
      },
    ],
  },

  dunmer: {
    name: "Dunmer",
    img: `${imgPath}/dunmer.webp`,
    baseline: {
      str: 25,
      end: 24,
      agi: 29,
      int: 25,
      wp: 24,
      prc: 25,
      prs: 23,
    },
    traits: [
      "Resistance (Fire, 3)",
      "Ancestor Guardian: See Powers section of Rules Compendium",
      "During Character Creation, Dunmer may begin with the Destruction skill trained to Novice rank for free",
    ],
    items: [
      {
        name: "Resistance (Fire, 3) (Racial)",
        img: "icons/magic/defensive/shield-barrier-glowing-triangle-red.webp",
        type: "trait",
        dataPath: "system.fireR",
        value: 3,
        desc: "This character reduces any incoming fire damage by 3 and receives +30 bonus to resist non-damaging fire effects",
      },
      {
        name: "Ancestor Guardian (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/ancestorGuardian.webp",
        type: "power",
        desc: "The Dunmer can, once per Long Rest, cast Sanctuary (3) on themselves that lasts for 3 rounds as a Free Action that costs no magicka and requires no test. Additionally, the Dunmer can perform a ritual that costs 10 drakes worth of incense and powders during a Long Rest to consult with an ancestor, asking up to 1d4+1 questions. The ancestor replies with a voice only the Dunmer can hear or sends imagery or signs to be interpreted.",
      },
    ],
  },

  imperial: {
    name: "Imperial (Colovian)",
    img: `${imgPath}/imperial.webp`,
    baseline: {
      str: 26,
      end: 27,
      agi: 24,
      int: 24,
      wp: 25,
      prc: 25,
      prs: 25,
    },
    traits: [
      "Star of the West: Increase Stamina Points max by 1",
      "Voice of the Emperor: They may choose to use Willpower in place of the base characteristic for a Persuade, Command, or Deceive skill test.",
      "During Character Creation, may choose either Commerce, Persuade, or Deceive to begin at Novice rank for free",
    ],
    items: [
      {
        name: "Star of the West (Racial)",
        img: "icons/environment/settlement/gazebo.webp",
        type: "trait",
        desc: "Imperials increase their Stamina Point max by 1",
        dataPath: "system.spBonus",
        value: 1,
      },
      {
        name: "Voice of the Emperor (Racial)",
        img: "icons/skills/social/diplomacy-peace-alliance.webp",
        type: "trait",
        desc: "Imperials speak with a small bit of the power and majesty of the Emperors. They may choose to use Willpower in place of the base characteristic for a Persuade, Command, or Deceive skill test.",
      },
    ],
  },

  khajiit: {
    name: "Khajiit",
    img: `${imgPath}/khajiit.webp`,
    baseline: {
      str: 22,
      end: 22,
      agi: 29,
      int: 25,
      wp: 21,
      prc: 28,
      prs: 24,
    },
    traits: [
      "Dark Sight: Can see normally even in areas with total darkness",
      "Natural Weapons: (Claws; 1d4; Slashing)",
    ],
    items: [
      {
        name: "Dark Sight (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/darkSight.webp",
        type: "trait",
        desc: "A Khajiit can see normally even in areas with total darkness and never takes penalties for acting in areas with dim or no lighting.",
      },
      {
        name: "Claws",
        img: "systems/uesrpg-3ev4/images/Icons/claw_strike.webp",
        type: "weapon",
        dataPath: "system.damage",
        value: "1d4",
        dataPath2: "system.qualities",
        qualities: "Slashing",
      },
    ],
  },

  nord: {
    name: "Nord",
    img: `${imgPath}/nord.webp`,
    baseline: {
      str: 30,
      end: 28,
      agi: 23,
      int: 21,
      wp: 24,
      prc: 25,
      prs: 23,
    },
    traits: [
      "Tough: Increase the character's Wound Threshold by 1. (If using optional wounds rule, gain +10 bonus to Shock Tests instead)",
      "Resistance (Frost, 2)",
      "Resistance (Shock, 1)",
      "War Cry: See Powers section of the Rules Compendium",
    ],
    items: [
      {
        name: "Tough (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/unarmedProwess.webp",
        type: "trait",
        dataPath: "system.wound_threshold",
        value: 1,
        desc: "A Nord has their Wound Threshold increased by 1. (If using optional wounds rule, gain +10 bonus to Shock Tests instead)",
      },
      {
        name: "Resistance (Frost, 2) (Racial)",
        img: "icons/magic/water/snowflake-ice-blue.webp",
        type: "trait",
        dataPath: "system.frostR",
        value: 2,
        desc: "The character reduces all incoming frost damage by 2 and gains +20 bonus to resist non-damaging frost/cold effects.",
      },
      {
        name: "Resistance (Shock, 1) (Racial)",
        img: "icons/magic/lightning/bolt-blue.webp",
        type: "trait",
        dataPath: "system.shockR",
        value: 1,
        desc: "The character reduces all incoming shock damage by 1 and gains +10 bonus to resist non-damaging shock effects.",
      },
      {
        name: "War Cry (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/godOfWar.webp",
        type: "power",
        desc: "Nords are able to call on a very simple form of the Thu'um and harness it to frighten their enemies. As an action, they can issue a mighty war cry that forces all enemies who hear it to make a Panic (+30) test. If a character passes, they are immune to this effect for the remainder of the encounter. Can only be used once per Long Rest.",
      },
    ],
  },

  orsimer: {
    name: "Orsimer",
    img: `${imgPath}/orc.webp`,
    baseline: {
      str: 28,
      end: 30,
      agi: 22,
      int: 23,
      wp: 26,
      prc: 24,
      prs: 22,
    },
    traits: [
      "Resilient: Increase HP max by +3",
      "Tough: Increase the character's Wound Threshold by 1. (If using optional wounds rule, gain +10 bonus to Shock Tests instead)",
      "Resistance (Magic, 1)",
      "During Character Creation, may choose to begin with Profession (Smithing) at Novice rank for free",
    ],
    items: [
      {
        name: "Resilient (3) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/Warriorskill_44.webp",
        type: "trait",
        dataPath: "system.hpBonus",
        value: 3,
        desc: "Increase the character's HP maximum by 3",
      },
      {
        name: "Tough (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/Warriorskill_44.webp",
        type: "trait",
        dataPath: "system.wound_threshold",
        value: 1,
        desc: "An Orc has their Wound Threshold increased by 1. (If using newer rules, gain +10 bonus to Shock Tests instead)",
      },
      {
        name: "Resistance (Magic, 1) (Racial)",
        img: "icons/magic/defensive/shield-barrier-blue.webp",
        type: "trait",
        datPath: "system.magicR",
        value: 1,
        desc: "This character reduces all incoming Magic damage by 1 and gains +10 bonus to tests made to resist non-damaging magic effects.",
      },
    ],
  },

  redguard: {
    name: "Redguard",
    img: `${imgPath}/redguard.webp`,
    baseline: {
      str: 27,
      end: 28,
      agi: 26,
      int: 22,
      wp: 23,
      prc: 25,
      prs: 24,
    },
    traits: [
      "Disease Resistance (75%)",
      "Resistance (Poison, 3)",
      "Adrenaline Rush: See Powers section of the Rules Compendium",
      "During Character Creation, may choose to begin with a Combat Style skill at Novice rank for free",
    ],
    items: [
      {
        name: "Disease Resistance (75%) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/diseaseResistance.webp",
        type: "trait",
        dataPath: "system.diseaseR",
        value: 75,
        desc: "Characters with this trait have a chance to resist disease.",
      },
      {
        name: "Resistance (Poison, 3) (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/poison.webp",
        type: "trait",
        dataPath: "system.poisonR",
        value: 3,
        desc: "This character reduces all incoming Poison damage by 3 and gains +30 bonus to resist non-damaging Poison effects.",
      },
      {
        name: "Adrenaline Rush (Racial)",
        img: "systems/uesrpg-3ev4/images/Icons/champion.webp",
        type: "power",
        desc: "Redguards may choose to gain 1 Stamina Point at any time. If the character is fatigued when this power is used then then remove a level of fatigue instead. This Stamina Point persists for only that encounter and may only be used once per Long Rest.",
      },
    ],
  },
};

// Add variants
coreRaces.bosmer.variants = [{
    name: "Bosmer: The Unglamoured",
    traits: [
        ...coreRaces.bosmer.traits,
        "One With the Wild",
        "The Beast Within",
        "Wild Shape"
    ],
    items: [
        ...coreRaces.bosmer.items,
        {
            name: "One With the Wild (Racial)",
            img: "systems/uesrpg-3ev4/images/Icons/OnewithWild.webp",
            type: "trait",
            desc: "Being more in touch with the world than their brethren, the Unglamoured have no trouble surviving in the wilderness. They receive a +10 bonus on all Survival tests and gain a +20 on all Survival tests relating to the traits chosen on their Wild Shape racial trait.",
        },
        {
            name: "The Beast Within (Racial)",
            img: "systems/uesrpg-3ev4/images/Icons/beastAbility.webp",
            type: "trait",
            desc: "The Unglamoured are on the verge of the Wild Hunt, which can be seen and felt by others in their presence. As a result of this uncanny aura, Unglamoured receive a -10 penalty on all social skill tests and a -20 on all social skill tests involving other Bosmer.",
        },
        {
            name: "Wild Shape (Racial)",
            img: "icons/creatures/abilities/fangs-teeth-bite.webp",
            trait: "trait",
            desc: "During character creation, the Unglamoured must pick one trait associated with their wild shape: Amphibious, Climber (AB x 2), Crawler, Dark Sight, Natural Toughness (1), Natural Weapons (Horns or Claws, 1d6 Slashing or Crushing, 1m), Natural Weapons (Fangs, 1d4 Slashing, 1m) and Strong Jaws., Quadruped, Regeneration (1), Swimmer However, their altered form is also a curse. They must also select one weakness:, Silver-Scarred (2), Sun-Scarred (2), Weakness (Fire, 2), Weak Bones(1)",
        }
    ]
}];

coreRaces.breton.variants = [{
    name: "Bretic Reachman",
    traits: [
        "Fury of the Old Gods",
        "Accustomed to the Profane",
        "During character creation, a Reachman may choose to being with the Survival skill, or one of the traditional hedge magics (Alteration, Destruction, or Mysticism) trained to Novice rank for free.",
        "Reachmen do not count as their parent race for the purpose of Elite Advances (example: Tongue advance for Nords), but can still take the Racial Talents of their parent race.",
    ],
    items: [
        {
            name: "Fury of the Old Gods (Racial)",
            img: "systems/uesrpg-3ev4/images/Icons/godOfWar.webp",
            type: "trait",
            desc: "The witch-men of the reach are blessed by the Old Gods with a righteous fury towards any and all invaders, and will not helm until every last one of them are dead at their feet. Any social interaction test except Intimidation with people not sympathetic with the Reachmen suffers a -10 penalty as their native language and culture is difficult for outsiders to interpret. However, the Reachmen gain a +10 bonus to all Combat Style tests made while Frenzied or using the All Out Attack action as they fight with the fervor of the Old Gods themselves.",
        },
        {
            name: "Accustomed to the Profane (Racial)",
            img: "icons/magic/control/fear-fright-mask-yellow.webp",
            type: "trait",
            desc: "The men and women of the reach are raised in tribal societies, surrounded by profane practices and dark rites, which has tempered their wills against the petty horrors of the world. They gain a +30 bonus to resist Panic Tests, and a +20 bonus to resist Horror Tests."
        }
    ]
}];

coreRaces.dunmer.variants = [{
    name: "Ashlander",
    traits: [
      ...coreRaces.dunmer.traits,
      "Life in the Wasteland",
      "Pride and Prejudice",
      "During character creation, Ashlanders may choose to begin with the Survival skill trained to Novice rank for free instead of Destruction."
    ],
    items: [
      ...coreRaces.dunmer.items,
      {
        name: "Life in the Wasteland (Racial)",
        img: "icons/environment/wilderness/cave-entrance-vulcano.webp",
        type: "trait",
        desc: "Ashlanders are adapted to life in the volcanic grasslands and deserts around Red Mountain, and as a result gain a +10 bonus on all Survival tests made in hot climates, and count their Resistance (Fire) trait as being one point higher while in these environments."
      },
      {
        name: "Pride and Prejudice (Racial)",
        img: "icons/sundries/flags/banner-standard-brown.webp",
        type: "trait",
        desc: "Any social test except Intimidation made by or towards an Ashlander suffers a -10 penalty unless the other character is familiar with Ashlander customs and traditions. Additionally, Ashlander characters should keep in mind that most slights are resolved in their society by ritualized duels, often to first blood, but sometimes to the death if the perceived insult is grave enough to warrant it."
      }
    ]
}];

coreRaces.imperial.variants = [{
    name: "Imperial (Nibenese)",
    baseline: {
        str: 24,
        end: 23,
        agi: 23,
        int: 27,
        wp: 23,
        prc: 25,
        prs: 28,
    }
}];

coreRaces.nord.variants = [{
  name: "Bretic Reachman",
  traits: [
      "Fury of the Old Gods",
      "Accustomed to the Profane",
      "During character creation, a Reachman may choose to being with the Survival skill, or one of the traditional hedge magics (Alteration, Destruction, or Mysticism) trained to Novice rank for free.",
      "Reachmen do not count as their parent race for the purpose of Elite Advances (example: Tongue advance for Nords), but can still take the Racial Talents of their parent race.",
  ],
  items: [
      {
          name: "Fury of the Old Gods (Racial)",
          img: "systems/uesrpg-3ev4/images/Icons/godOfWar.webp",
          type: "trait",
          desc: "The witch-men of the reach are blessed by the Old Gods with a righteous fury towards any and all invaders, and will not helm until every last one of them are dead at their feet. Any social interaction test except Intimidation with people not sympathetic with the Reachmen suffers a -10 penalty as their native language and culture is difficult for outsiders to interpret. However, the Reachmen gain a +10 bonus to all Combat Style tests made while Frenzied or using the All Out Attack action as they fight with the fervor of the Old Gods themselves.",
      },
      {
          name: "Accustomed to the Profane (Racial)",
          img: "icons/magic/control/fear-fright-mask-yellow.webp",
          type: "trait",
          desc: "The men and women of the reach are raised in tribal societies, surrounded by profane practices and dark rites, which has tempered their wills against the petty horrors of the world. They gain a +30 bonus to resist Panic Tests, and a +20 bonus to resist Horror Tests."
      }
  ]
}];

coreRaces.redguard.variants = [
  {
    name: "Redguard (Crown)",
    baseline: {
      str: 27,
      end: 26,
      agi: 26,
      int: 22,
      wp: 23,
      prc: 25,
      prs: 25,
    },
    traits:  [
      ...coreRaces.redguard.traits,
      "The character can replace Combat Style with Commerce or Persuade as their free starting skill.",
    ],
  },
  {
    name: "Redguard (Forebear)",
    baseline: {
      str: 27,
      end: 28,
      agi: 26,
      int: 22,
      wp: 24,
      prc: 25,
      prs: 22,
    },
    traits: [
      ...coreRaces.redguard.traits,
      "The character picks one additional weapon for their Combat Style at character creation, but it must be a Sword or variant of a Sword such as a Sabre or Dagger.",
    ],
  },
]