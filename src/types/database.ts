// Universal Entry model — see docs/05_Database.md (Base Object, Object Categories)
// Category set ported 1:1 from the user's existing Codex tool (CATS/CAT_ORDER), which had
// already converged, independently, on the same object shape the docs describe.

export type Category =
  | "character"
  | "location"
  | "main_quest"
  | "side_quest"
  | "equipment"
  | "item"
  | "object"
  | "lore";

export const CAT_ORDER: Category[] = [
  "character",
  "location",
  "main_quest",
  "side_quest",
  "equipment",
  "item",
  "object",
  "lore",
];

export const CAT_LABEL: Record<Category, string> = {
  character: "Персонажи",
  location: "Локации",
  main_quest: "Основные квесты",
  side_quest: "Побочные квесты",
  equipment: "Экипировка",
  item: "Предметы",
  object: "Игровые объекты",
  lore: "Лор",
};

// hex accent per category — same palette family as Codex, remapped onto the glass/dark design system
export const CAT_COLOR: Record<Category, string> = {
  character: "#65a3a0",
  location: "#cd7d54",
  main_quest: "#cda559",
  side_quest: "#9fb867",
  equipment: "#9a85c4",
  item: "#c77b9e",
  object: "#5e9bb5",
  lore: "#6f93c4",
};

export function isQuest(c: Category): boolean {
  return c === "main_quest" || c === "side_quest";
}
export function hasRelationship(c: Category): boolean {
  return c === "character";
}
export function canHaveStats(c: Category): boolean {
  return c === "character" || c === "equipment" || c === "item" || c === "object";
}
export function isEquip(c: Category): boolean {
  return c === "equipment";
}

export type EquipSlot = "head" | "body" | "weapon" | "offhand";
export type Relationship = "friend" | "neutral" | "enemy";
export type QuestStatus = "todo" | "active" | "done";

export interface Stats {
  level?: number;
  xp?: number;
  xp_max?: number;
  attack?: number;
  defense?: number;
  magic?: number;
  speed?: number;
  luck?: number;
  crit?: number;
  dodge?: number;
  capacity?: number;
  [key: string]: number | undefined;
}

export interface Objective {
  text: string;
  done: boolean;
  objId?: string; // matches quest_progress()'s objective flag id (obj_<id>) — see docs/12_Editors.md
}

// Base Object shape — see docs/05_Database.md
export interface Entry {
  uuid: string;
  id: string; // readable id, snake_case, immutable
  category: Category;
  version: number;
  name: string;
  description: string;
  image?: string; // data URL (uploaded) or asset ref (engineSymbol) — resolved on export, see docs/13_Asset_System.md
  created: string;
  modified: string;
  tags: string[];
  references: string[];
  notes: string;
  chapter?: string;

  // location-only: attached map image (data URL), see docs/13_Asset_System.md
  mapImage?: string;

  // generic key/value props (Codex "SCHEMA" panel) — free-form per-category fields that don't need a typed slot
  props: [string, string][];

  // category-conditional
  stats?: Stats; // canHaveStats(category)
  relationship?: Relationship; // hasRelationship(category)
  objectives?: Objective[]; // isQuest(category)
  slot?: EquipSlot; // isEquip(category)

  // equip/item economy + export fields — see docs/14_Export_System.md Field Mapping: Items
  value?: number;
  stack?: number;
  quest?: boolean; // "quest item" flag, not to be confused with category main_quest/side_quest
  overlay?: string;
  rarityId?: string;
}

export type ColorStyleKind = "solid" | "gradient" | "gradient_anim" | "rainbow" | "pulse";

export interface ColorStyle {
  kind: ColorStyleKind;
  c1: string;
  c2?: string;
  speed?: number;
}

export interface RarityObject {
  uuid: string;
  id: string;
  name: string;
  order: number;
  style: ColorStyle;
}

export interface Project {
  name: string;
  entries: Entry[];
  rarities: RarityObject[];
  chapters: string[];
}
