/**
 * World migrations for uesrpg-3ev4
 * Runs at world startup (Hooks.once('ready')) via entrypoint.js.
 */

const NS = "uesrpg-3ev4";

export async function runMigrations() {
  await migrateArmorLocV1();          // existing NPC baked armor normalization
  await migrateArmorItemsCategoryV1(); // NEW: armor Item category defaults + normalization
}

/**
 * armorLocV1:
 * Normalizes baked NPC per-location armor structure so your new armor logic can safely read it.
 *
 * - Does NOT create items
 * - Does NOT delete baked armor
 * - Does NOT change numeric values except normalization/coercion
 * - Sets a per-actor flag so it runs only once per NPC
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

    // Build normalized shield structure
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

  console.log(`UESRPG | Migration armorLocV1: ${migrated} NPC(s) normalized`);
}

/**
 * armorItemsCategoryV1:
 * Ensures embedded Armor items have a valid per-location category for actor.js bucketing.
 *
 * - Sets missing/blank system.category to "body"
 * - Normalizes system.magic_ar from 0 to "" (optional but consistent with your armor parsing approach)
 * - Sets a per-actor flag so it runs only once per actor
 */
async function migrateArmorItemsCategoryV1() {
  const actors = game.actors?.contents ?? [];
  let updatedItems = 0;

  for (const actor of actors) {
    if (actor.getFlag(NS, "migrations.armorItemsCategoryV1")) continue;

    const armorItems = actor.items?.filter(i => i.type === "armor") ?? [];
    if (!armorItems.length) {
      await actor.setFlag(NS, "migrations.armorItemsCategoryV1", true);
      continue;
    }

    const updates = [];

    for (const item of armorItems) {
      const cat = item.system?.category;
      const magicAr = item.system?.magic_ar;

      const patch = { _id: item.id };
      let needsUpdate = false;

      if (!cat || cat === "") {
        patch["system.category"] = "body";
        needsUpdate = true;
      }

      // Optional normalization
      if (magicAr === 0) {
        patch["system.magic_ar"] = "";
        needsUpdate = true;
      }

      if (needsUpdate) updates.push(patch);
    }

    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      updatedItems += updates.length;
    }

    await actor.setFlag(NS, "migrations.armorItemsCategoryV1", true);
  }

  console.log(`UESRPG | Migration armorItemsCategoryV1: updated ${updatedItems} armor item(s)`);
}
