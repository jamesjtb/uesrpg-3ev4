const NS = "uesrpg-3ev4";

/**
 * Run all world migrations (idempotent).
 */
export async function runMigrations() {
  await migrateArmorLocV1();
}

/**
 * armorLocV1:
 * - Normalize baked NPC per-location armor structure (system.armor.<slot>)
 * - Set a flag so it runs once per actor
 *
 * This does NOT create items and does NOT delete baked armor.
 * It simply ensures a consistent schema so your new armor logic can safely read it.
 */
async function migrateArmorLocV1() {
  const slots = ["head", "body", "r_arm", "l_arm", "r_leg", "l_leg"];

  const blankLoc = () => ({
    name: "",
    enc: 0,
    ar: 0,
    magic_ar: "",
    class: ""
  });

  const blankShield = () => ({
    name: "",
    enc: 0,
    br: 0,
    magic_br: "",
    class: "",
    qualities: ""
  });

  const actors = game.actors?.contents ?? [];
  let migrated = 0;

  for (const actor of actors) {
    if (actor.type !== "NPC") continue;

    // already migrated?
    if (actor.getFlag(NS, "migrations.armorLocV1")) continue;

    const sys = actor.system ?? {};
    const armor = sys.armor ?? {};
    const shield = sys.shield ?? {};

    // Build normalized armor structure
    const nextArmor = {};
    for (const s of slots) {
      const a = armor?.[s] ?? {};
      nextArmor[s] = {
        ...blankLoc(),
        name: String(a.name ?? ""),
        enc: Number(a.enc ?? 0) || 0,
        ar: Number(a.ar ?? 0) || 0,
        magic_ar: (a.magic_ar ?? "") === 0 ? "" : String(a.magic_ar ?? ""),
        class: String(a.class ?? sys.armor_class ?? "")
      };
    }

    const nextShield = {
      ...blankShield(),
      name: String(shield.name ?? ""),
      enc: Number(shield.enc ?? 0) || 0,
      br: Number(shield.br ?? 0) || 0,
      magic_br: (shield.magic_br ?? "") === 0 ? "" : String(shield.magic_br ?? ""),
      class: String(shield.class ?? sys.armor_class ?? ""),
      qualities: String(shield.qualities ?? "")
    };

    await actor.update({
      "system.armor": nextArmor,
      "system.shield": nextShield,
      [`flags.${NS}.migrations.armorLocV1`]: true
    });

    migrated += 1;
  }

  if (migrated > 0) {
    console.log(`UESRPG | Migration armorLocV1 completed: ${migrated} NPC(s) normalized`);
  } else {
    console.log(`UESRPG | Migration armorLocV1: nothing to do`);
  }
}

