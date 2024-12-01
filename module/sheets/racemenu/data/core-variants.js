import coreRaces from './core-races.js';

export default {
    "Bosmer: The Unglamoured": {
        ...coreRaces.Bosmer,
        name: "Bosmer: The Unglamoured",
        traits: [
            ...coreRaces.Bosmer.traits,
            "One With the Wild",
            "The Beast Within",
            "Wild Shape"
        ],
        items: [
            ...coreRaces.Bosmer.items,
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
    },
    "Bosmer: The Unglamoured": {
        ...coreRaces.Breton,
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

    },
    "Dunmer (Ashlander)": {
        ...coreRaces.Dunmer,
        name: "Dunmer (Ashlander)",
        traits: [
            ...coreRaces.Dunmer.traits,
            "Life in the Wasteland",
            "Pride and Prejudice",
            "During character creation, Ashlanders may choose to begin with the Survival skill trained to Novice rank for free instead of Destruction."
        ],
        items: [
            ...coreRaces.Dunmer.items,
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
    },
    "Imperial (Nibenese)": {
        ...coreRaces['Imperial (Colovian)'],
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
    },
    "Nordic Reachman": {
        ...coreRaces.Nord,
        name: "Nordic Reachman",
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
    },
    "Redguard (Crown)": {
        ...coreRaces.Redguard,
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
        traits: [
            ...coreRaces.Redguard.traits,
            "The character can replace Combat Style with Commerce or Persuade as their free starting skill.",
        ],
    },
    "Redguard (Forebear)": {
        ...coreRaces.Redguard,
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
            ...coreRaces.Redguard.traits,
            "The character picks one additional weapon for their Combat Style at character creation, but it must be a Sword or variant of a Sword such as a Sabre or Dagger.",
        ],
    }
};