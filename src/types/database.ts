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
  referenceNotes?: Record<string, string>; // optional short description per reference, keyed by target entry id
  notes: string;
  chapter?: string;

  // location-only: attached map image (data URL), see docs/13_Asset_System.md
  mapImage?: string;
  // location-only: structured map built in the in-app Map Editor (Phase 1)
  map?: MapData;

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

  // character-only: mirrors the real engine's speaker_define(key, {...}) shape (see
  // scr_dialogue_data / speakers_init in the user's project) so a GML speakers script can be
  // generated straight from Character entries. Every field is optional — the exporter fills in
  // sensible placeholders (display_name -> entry name, color -> c_white, blip -> -1, side ->
  // left, text_speed -> 0.3, box -> spr_dlg_box) for anything left blank.
  dialogueSpeaker?: DialogueSpeakerData;
}

export interface DialogueSpeakerPortrait {
  emotion: string; // e.g. "neutral" / "happy" / "angry" — matches the keys in speaker_define's portraits struct
  sprite: string; // GML sprite asset name, e.g. spr_port_test_neutral
}

export interface DialogueSpeakerData {
  displayName?: string;
  portraits: DialogueSpeakerPortrait[];
  color?: string; // GML color constant or hex, e.g. c_white
  blip?: string; // sound asset name, or "-1" for none
  side?: DialogueSide;
  textSpeed?: number;
  box?: string; // sprite asset name for this speaker's dialogue-box skin override
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
  dialogueFolders: DialogueFolder[];
  dialogues: Dialogue[];
  dialogueFlags: string[];
}

// --- Map Editor (Phase 1) — see docs/13_Asset_System.md / 12_Editors.md conventions ---
// Structured, editable map data for location entries, distinct from the plain `mapImage`
// snapshot above (which stays as a quick upload/paste fallback for a premade map picture).

export interface MapTileValue {
  color: string;
  label?: string;
}

interface MapLayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
}

export interface MapTileLayer extends MapLayerBase {
  kind: "tile";
  cells: Record<string, MapTileValue>; // key: "x:y"
}

export interface MapObjectInstance {
  id: string;
  entryId: string; // references another Project entry (NPC, item, chest, door...)
  x: number;
  y: number;
  properties: [string, string][]; // instance-level overrides
}

export interface MapObjectLayer extends MapLayerBase {
  kind: "object";
  objects: MapObjectInstance[];
}

export interface MapZone {
  id: string;
  label: string;
  tag: string; // free-form, e.g. "battle", "music", "teleport"
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  notes?: string;
}

export interface MapZoneLayer extends MapLayerBase {
  kind: "zone";
  zones: MapZone[];
}

// Freehand raster layer — not snapped to the cell grid, drawn pixel-by-pixel with the pen tool.
export interface MapFreehandLayer extends MapLayerBase {
  kind: "freehand";
  bitmap: string | null; // data URL (PNG), full canvas size (width*gridSize x height*gridSize at creation time)
}

// Freely placed/resized pictures (decorations, backgrounds, reference art) — position and size
// are stored in fractional cell units so they are NOT locked to the grid like tile/object layers.
export interface MapImageInstance {
  id: string;
  src: string; // data URL
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapImageLayer extends MapLayerBase {
  kind: "image";
  images: MapImageInstance[];
}

export type MapLayer = MapTileLayer | MapObjectLayer | MapZoneLayer | MapFreehandLayer | MapImageLayer;

export interface MapPaletteColor {
  color: string;
  label: string;
}

export interface MapData {
  version: number;
  gridSize: number; // px per cell at zoom = 1
  width: number; // cells
  height: number; // cells
  layers: MapLayer[];
  palette: MapPaletteColor[];
}

// --- Dialogue system — ported from the user's Codex tool's graph-based dialogue editor ---
// Dialogues live in their own folder tree (independent of the Entry categories above), each
// one a small directed graph of nodes. A node holds one or more sequential reply lines and,
// optionally, a set of player choices; choices carry their own branch target and can gate
// themselves on a condition and/or set flags when picked. A node with no choices instead has
// a single "continuation" link (linear, drag-to-connect) to the next node.

export interface DialogueFolder {
  id: string;
  name: string;
  parentId: string | null; // null = root
}

export type DialogueSide = "left" | "default" | "right" | "none";

// v1 condition model: pick a kind, then a key (flag name / quest entry id / any entry id)
// and an operator. "flag" compares a flag's stored value; "quest" compares a quest entry's
// derived status; "entry" checks whether that entry is referenced/owned (has/not_has) —
// deliberately loose since the underlying "owns item" / "met character" bookkeeping is up
// to the game, this only records intent for the writer.
export interface DialogueCondition {
  kind: "flag" | "quest" | "entry";
  key: string;
  op: "eq" | "neq" | "has" | "not_has";
  value?: string;
}

export interface DialogueFlagSet {
  key: string;
  value: string;
}

export interface DialogueLine {
  id: string;
  speaker: string;
  speakerEntryId?: string; // optional link to a Character entry, so name/side/emotion can follow it
  side: DialogueSide;
  emotion?: string;
  text: string;
  condition?: DialogueCondition;
  noSkip: boolean;
}

export interface DialogueChoice {
  id: string;
  text: string;
  condition?: DialogueCondition;
  flagSets: DialogueFlagSet[];
  targetNodeId?: string;
}

export interface DialogueNode {
  id: string;
  x: number;
  y: number;
  lines: DialogueLine[];
  choices: DialogueChoice[];
  continueTo?: string; // only meaningful/used when choices.length === 0
}

export interface Dialogue {
  id: string;
  name: string;
  folderId: string | null;
  startNodeId: string;
  nodes: DialogueNode[];
}

// MARKUP_TAGS moved to src/lib/dialogueMarkup.ts (now alongside the parser/renderer it drives).
