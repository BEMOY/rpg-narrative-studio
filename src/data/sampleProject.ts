import type { Entry, Project, RarityObject, StatPreset } from "../types/database";

// Seeded from the user's existing scr_rarity_init GML — see docs/12_Editors.md (Rarity Editor)
const rarities: RarityObject[] = [
  { uuid: "r-common", id: "common", name: "COMMON", order: 0, style: { kind: "solid", c1: "#c8cdd7" } },
  { uuid: "r-uncommon", id: "uncommon", name: "UNCOMMON", order: 1, style: { kind: "solid", c1: "#78e68c" } },
  { uuid: "r-rare", id: "rare", name: "RARE", order: 2, style: { kind: "solid", c1: "#5fafff" } },
  { uuid: "r-epic", id: "epic", name: "EPIC", order: 3, style: { kind: "gradient", c1: "#be82ff", c2: "#965ae6" } },
  {
    uuid: "r-legendary",
    id: "legendary",
    name: "LEGENDARY",
    order: 4,
    style: { kind: "gradient_anim", c1: "#ffd25a", c2: "#ff8c28", speed: 0.004 },
  },
  { uuid: "r-cursed", id: "cursed", name: "CURSED", order: 6, style: { kind: "pulse", c1: "#aa46dc", c2: "#501478", speed: 0.004 } },
];

// A sensible starter library so a fresh project isn't a totally blank slate — freely
// editable/removable from the equipment stats preset modal (see EquipmentPresetsModal.tsx).
const statPresets: StatPreset[] = [
  { id: "stat_attack", name: "Атака", icon: "sword", max: 100 },
  { id: "stat_defense", name: "Защита", icon: "shield", max: 100 },
  { id: "stat_magic", name: "Магия", icon: "sparkles", max: 100 },
  { id: "stat_speed", name: "Скорость", icon: "wind", max: 100 },
  { id: "stat_luck", name: "Удача", icon: "clover", max: 100 },
  { id: "stat_crit", name: "Крит %", icon: "target", max: 100 },
  { id: "stat_dodge", name: "Уклон %", icon: "footprints", max: 100 },
  { id: "stat_health", name: "Здоровье", icon: "heart", max: 999 },
  { id: "stat_mana", name: "Мана", icon: "droplet", max: 999 },
];

const resistPresets: StatPreset[] = [
  { id: "res_fire", name: "Огонь", icon: "flame", max: 100 },
  { id: "res_ice", name: "Лёд", icon: "snowflake", max: 100 },
  { id: "res_lightning", name: "Молния", icon: "zap", max: 100 },
  { id: "res_poison", name: "Яд", icon: "biohazard", max: 100 },
];

function base(partial: Partial<Entry> & Pick<Entry, "uuid" | "id" | "category" | "name">): Entry {
  return {
    version: 1,
    description: "",
    created: "",
    modified: "",
    tags: [],
    references: [],
    notes: "",
    props: [],
    ...partial,
  };
}

const entries: Entry[] = [
  // --- characters --- seeded from scr_dialogue_data / scr_dialogue_content GML
  base({
    uuid: "c-bromli",
    id: "bromli",
    category: "character",
    name: "Бромли",
    description: "Начальный NPC, диалог bromli_intro просит помочь с квестом.",
    relationship: "friend",
    props: [
      ["Side", "left"],
      ["Text speed", "0.3"],
    ],
    stats: { level: 1 },
  }),
  base({
    uuid: "c-test",
    id: "test",
    category: "character",
    name: "Тест",
    description: "Служебный дефолтный спикер из speakers_init().",
    relationship: "neutral",
  }),

  // --- locations ---
  base({
    uuid: "l-library",
    id: "old_library",
    category: "location",
    name: "Старая библиотека",
    description: "Место, где появился ржавый ключ (rusty_key).",
    props: [
      ["Регион", "Городок"],
      ["Опасность", "Низкая"],
    ],
  }),

  // --- main quests --- seeded from scr_quests GML
  base({
    uuid: "q-find_key",
    id: "find_key",
    category: "main_quest",
    name: "The Strange Door",
    description: "A locked door waits in the old library. Find what opens it.",
    objectives: [],
  }),
  base({
    uuid: "q-lost_supplies",
    id: "lost_supplies",
    category: "main_quest",
    name: "Lost Supplies",
    description: "A merchant dropped several supply crates while fleeing from bandits.",
    objectives: [
      { text: "Find Supply Crates", done: false },
      { text: "Return to the Merchant", done: false },
    ],
  }),

  // --- side quests ---
  base({
    uuid: "q-gather_herbs",
    id: "gather_herbs",
    category: "side_quest",
    name: "Herbalist's Request",
    description: "Collect ingredients for the village healer.",
    objectives: [
      { text: "Red herbs", done: true },
      { text: "Blue petals", done: true },
    ],
  }),
  base({
    uuid: "q-wolf_hunt",
    id: "wolf_hunt",
    category: "side_quest",
    name: "Wolf Hunt",
    description: "Wolves have been attacking travelers on the forest road.",
    objectives: [
      { text: "Defeat Wolves", done: false },
      { text: "Collect Wolf Pelts", done: false },
    ],
  }),

  // --- equipment --- seeded from scr_items GML
  base({
    uuid: "e-iron_sword",
    id: "iron_sword",
    category: "equipment",
    name: "Iron sword",
    description: "Reliable and balanced.",
    slot: "weapon",
    rarityId: "rare",
    value: 45,
    stack: 1,
    quest: false,
    stats: { attack: 18, crit: 5 },
  }),
  base({
    uuid: "e-knight_helm",
    id: "knight_helm",
    category: "equipment",
    name: "Knight helm",
    description: "Heavy protective helm.",
    slot: "head",
    rarityId: "rare",
    value: 60,
    stack: 1,
    quest: false,
    stats: { defense: 9, magic: 3, speed: -99999, luck: 5, crit: 12 },
  }),
  base({
    uuid: "e-crown",
    id: "crown",
    category: "equipment",
    name: "Old crown",
    description: "Once royal, still shiny.",
    slot: "head",
    rarityId: "legendary",
    value: 200,
    stack: 1,
    quest: false,
    overlay: "spr_overlay_iron_helm",
    stats: { defense: 4, magic: 8, luck: 5 },
  }),
  base({
    uuid: "e-travel_pack",
    id: "travel_pack",
    category: "equipment",
    name: "Travel pack",
    description: "Carry more loot.",
    slot: "offhand",
    rarityId: "uncommon",
    value: 30,
    stack: 1,
    quest: false,
    stats: { capacity: 6 },
  }),

  // --- items ---
  base({
    uuid: "i-potion",
    id: "potion",
    category: "item",
    name: "potion",
    description: "Heals some healthpoints.",
    rarityId: "cursed",
    value: 10,
    stack: 12,
    quest: false,
    stats: {},
  }),
  base({
    uuid: "i-rusty_key",
    id: "rusty_key",
    category: "item",
    name: "Rusty key",
    description: "The key appeared on a rainy Thursday morning. No one knew where it came from.",
    rarityId: "cursed",
    value: 999999,
    stack: 1,
    quest: true,
  }),

  // --- objects ---
  base({
    uuid: "o-old_table",
    id: "library_table",
    category: "object",
    name: "Старый стол",
    description: "Стол в библиотеке, на котором нашли ключ.",
    props: [["Назначение", "Декорация / точка сюжета"]],
  }),

  // --- lore ---
  base({
    uuid: "lo-the_key",
    id: "lore_the_key",
    category: "lore",
    name: "Легенда о ключе",
    description: "Дверь появляется только тогда, когда мир готов задать правильный вопрос.",
    props: [["Эпоха", "Неизвестна"]],
  }),
];

export const sampleProject: Project = {
  name: "Snowfall",
  entries,
  rarities,
  chapters: ["Пролог"],
  dialogueFolders: [],
  dialogues: [],
  dialogueFlags: [],
  dialogueFlagDefs: {},
  colorStyles: [],
  statPresets,
  resistPresets,
};
