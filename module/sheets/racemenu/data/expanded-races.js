const imgPath = 'systems/uesrpg-3ev4/images/';

export default {
    Ayleid: {
        name: 'Ayleid',
        baseline: {
            str: 20,
            end: 23,
            agi: 25,
            int: 28,
            wp: 27,
            prc: 25,
            prs: 26,
        },
        traits: [
            'Weakness (Magic, 1)',
            'Power Well (5)',
            'Empowered by Starlight: treat their Willpower Bonus as being 2 higher for restraint while under starlight. They can choose to forfeit this bonus as a free action for the rest of the night to regain 15 Magicka Points instantly.',
            'Flesh Shaper: can choose to inflict damage instead of healing for spells. Can use the stabilize spell to treat wounds.',
            'During character creation, Ayleid characters can choose to begin with the Restoration or Enchanting skill trained to Novice rank for free.',
        ],
        items: [
            {
                name: "Weakness (Magic, 1) (Racial)",
                img: "icons/magic/defensive/shield-barrier-blue.webp",
                type: "trait",
                dataPath: "system.magicR",
                value: -1,
            },
            {
                name: "Power Well (5) (Racial)",
                img: `${imgPath}/Icons/powerWell.webp`,
                type: "trait",
                dataPath: "system.mpBonus",
                value: 5,
                desc: "This character has extra reserves of magicka available.",
            },
            {
                name: "Empowered by Starlight (Racial)",
                img: `${imgPath}/Icons/starCursed.webp`,
                type: "trait",
                desc: "Ayleid characters treat their Willpower Bonus as being 2 higher for the purpose of spell restraint while under direct starlight. The Ayleid can choose to forfeit this bonus as a free action for the rest of the night in order to absorb some of the radiating magicka, regaining 15 Magicka Points instantly.",
            },
            {
                name: "Flesh Shaper (Racial)",
                img: `${imgPath}/Icons/control.webp`,
                type: "trait",
                desc: "When an Ayleid uses any Restoration spell that regenerates a target’s health, they can choose to inflict the specified amount as Magic damage instead. Any spells used in this way count as attacks. Additionally, an Ayleid can use the Stabilize spell to Treat wounds.",
            },

        ]
    },
    Dwemer: {
        name: 'Dwemer',
        baseline: {
            str: 24,
            end: 24,
            agi: 22,
            int: 30,
            wp: 28,
            prc: 25,
            prs: 21,
        },
        traits: [
            'Power Well (5)',
            'Weakness (Frost, 1)',
            'The Calling: See Powers section of the Rules Compendium',
            'Depth-Dweller: Dwemer characters suffer a -10 penalty to Survival skill tests made while above ground.',
            'During character creation, Dwemer characters may choose to begin with the Logic skill trained to Novice rank for free.'
        ],
        items: [
            {
                name: "Power Well (5) (Racial)",
                img: `${imgPath}/Icons/powerWell.webp`,
                type: "trait",
                dataPath: "system.mpBonus",
                value: 5,
                desc: "This character has extra reserves of magicka available.",
            },
            {
                name: "Weakness (Frost, 1) (Racial)",
                img: "icons/magic/water/heart-ice-freeze.webp",
                type: "trait",
                dataPath: "system.frostR",
                value: -1,
            },
            {
                name: "The Calling (Racial)",
                img: `${imgPath}/Icons/Skill_203.webp`,
                type: 'power',
                desc: 'The Dwemer have developed the capability to form connections with the minds of others, allowing silent and instant communication across great distances. A Dwemer may do this at any time, though they may not attempt to contact someone they have not met. Forming a mental connection requires the character to pass a Willpower test or gain a level of fatigue. Once a connection is formed the two minds may communicate as they see fit. Every minute of communication beyond the first imposes another Willpower test, where failure incurs a level of fatigue. Alternatively, they may form a connection with a number of others equal to their Willpower bonus, but doing so causes them to automatically fail the Willpower tests imposed by normal communication.',
            },
            {
                name: "Depth-Dweller (Racial)",
                img: `icons/environment/wilderness/mine-interior-dungeon-door.webp`,
                type: "trait",
                desc: "Dwemer characters suffer a -10 penalty to Survival skill tests made while above ground.",
            }
        ]
    },
    Falmer: {
        name: 'Falmer',
        baseline: {
            str: 20,
            end: 23,
            agi: 25,
            int: 28,
            wp: 27,
            prc: 25,
            prs: 26,
        },
        traits: [
            'Weakness (Fire, 2)',
            'Resistance (Frost, 3)',
            'Power Well (10)',
            'Chillhearted Fury:  Frost damage from spells or enchantments is increased by 1.'
        ],
        items: [
            {
                name: 'Weakness (Fire, 2) (Racial)',
                img: `${imgPath}/Icons/fire.webp`,
                type: 'trait',
                dataPath: 'system.fireR',
                value: -2,
            },
            {
                name: 'Resistance (Frost, 3) (Racial)',
                img: `icons/magic/water/snowflake-ice-snow-white.webp`,
                type: 'trait',
                dataPath: 'system.frostR',
                value: 3,
            },
            {
                name: 'Power Well (10) (Racial)',
                img: `${imgPath}/Icons/powerWell.webp`,
                type: 'trait',
                dataPath: 'system.mpBonus',
                value: 10,
                desc: 'This character has extra reserves of magicka available.',
            },
            {
                name: 'Chillhearted Fury (Racial)',
                img: `icons/magic/water/heart-ice-freeze.webp`,
                type: 'trait',
                desc: ' Frost damage dealt by the Falmer using spells or enchantments is increased by 1.'
            }
        ]
    },
    Maormer: {
        name: 'Maormer',
        baseline: {
            str: 23,
            end: 20,
            agi: 25,
            int: 29,
            wp: 28,
            prc: 25,
            prs: 22,
        },
        traits: [
            'Weakness (Shock, 1)',
            'Power Well (5)',
            'Swimmer: Swim speed is doubled',
            'Chameleon Skin: +10 bonus to stealth tests made to blend into their environment visually.',
            'Sorcerous Serpent Speech: Can speak to and understand the speech of land and sea serpents.',
            'During character creation, Maormer characters may choose to begin with the Athletics skill trained to Novice for free.',
        ],
        items: [
            {
                name: 'Weakness (Shock, 1) (Racial)',
                img: `icons/magic/lightning/bolt-forked-blue.webp`,
                type: 'trait',
                dataPath: 'system.shockR',
                value: -1,
            },
            {
                name: 'Power Well (5) (Racial)',
                img: `${imgPath}/Icons/powerWell.webp`,
                type: 'trait',
                dataPath: 'system.mpBonus',
                value: 5,
                desc: 'This character has extra reserves of magicka available.',
            },
            {
                name: 'Swimmer (Racial)',
                img: `${imgPath}/Icons/amphibious.webp`,
                type: 'trait',
                desc: 'The Maormer\'s Swim Speed is doubled.',
            },
            {
                name: 'Chameleon Skin (Racial)',
                img: `${imgPath}/Icons/blending.webp`,
                type: 'trait',
                desc: 'The Maormer receives a +10 bonus to any Stealth skills made to blend into their environment visually.',
            },
            {
                name: 'Sorcerous Serpent Speech (Racial)',
                img: `icons/creatures/reptiles/snake-fangs-bite-green.webp`,
                type: 'trait',
                desc: 'Maormer can speak to, and understand, the speech of serpents, both land and sea. How exactly this functions is left to the GM\'s discretion.',
            }
        ]
    },
    Sload: {
        name: 'Sload',
        baseline: {
            str: 23,
            end: 20,
            agi: 25,
            int: 29,
            wp: 28,
            prc: 25,
            prs: 22,
        },
        traits: [
            'Power Well (10)',
            'Aboninable: receive -20 on social tests with non-Sload. +20 to Persuade tests made to intimidate.',
            'Perfect Memory: never need to roll to remember something they\'ve seen or heard. +1 DoS to successful lore tests.',
            'During character creation, the Sload may choose to begin Necromancy, Mysticism, or Alteration skill trained to Novice for free, or have all three trained to Novice for 100 XP.'
        ],
        items: [
            {
                name: 'Power Well (10) (Racial)',
                img: `${imgPath}/Icons/powerWell.webp`,
                type: 'trait',
                dataPath: 'system.mpBonus',
                value: 10,
                desc: 'This character has extra reserves of magicka available.',
            },
            {
                name: 'Abominable (Racial)',
                img: `${imgPath}/Icons/blessingOfMadgod.webp`,
                type: 'trait',
                desc: 'Sload receive a -20 penalty on all social skill based tests with non-Sload. Additionally, they gain a +20 bonus to Persuade tests made to intimidate.',
            },
            {
                name: 'Perfect Memory (Racial)',
                img: `${imgPath}/Icons/summoned.webp`,
                type: 'trait',
                desc: 'Sload characters are blessed with flawless memory, and never need any kind of roll to remember anything they have seen or heard, and gain +1 bonus DoS on any successful Lore tests they make.',
            }
        ]
    }
};