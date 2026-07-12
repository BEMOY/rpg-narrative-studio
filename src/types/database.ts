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

// Matches the real engine's quest_define() objectives array exactly: every objective has a
// numeric current/max (a simple "reach 1 of 1" checkbox is just max:1). `done` is kept only
// for backward compatibility with older saved projects that only stored a boolean — new code
// should read progress via objectiveProgress() in lib/questCompile.ts, which derives
// current/max from `done` when they're missing. `objId` matches quest_progress()'s optional
// per-objective flag id (sets flag "obj_<objId>" when that objective reaches max).
export interface Objective {
  text: string;
  done: boolean;
  current?: number;
  max?: number;
  objId?: string;
}

export interface QuestRewardItem {
  id: string; // references another Project entry (item/equipment)
  count: number;
}

// Codex-only planning aid — NOT part of the real engine's quest_define() shape (there's no
// "dependency" concept in scr_quests.gml). Lets the writer sketch out "on completing THIS
// quest, quest X becomes available / quest Y becomes locked" and see it laid out in the
// Quests roadmap graph, with an interactive "what if this were completed" toggle per quest.
export type QuestDependencyKind = "unlocks" | "blocks";

export interface QuestDependency {
  id: string;
  questId: string; // the OTHER quest this relationship targets
  kind: QuestDependencyKind; // completing THIS quest unlocks/blocks the target quest
}

// Matches quest_define()'s optional `rewards` struct exactly: any subset of these fields.
export interface QuestRewards {
  coins?: number;
  xp?: number;
  affinity?: number;
  items?: QuestRewardItem[];
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
  // isQuest(category): overrides the exported quest_define() "type" — our Category only has
  // main_quest/side_quest, but the real engine also has a third "story" type (see quest_define
  // examples like "talk_elder"); defaults to main/side derived from category when unset.
  questType?: "main" | "side" | "story";
  rewards?: QuestRewards; // isQuest(category) — matches quest_define()'s optional rewards struct
  questDependencies?: QuestDependency[]; // isQuest(category) — Codex-only, see QuestDependency
  slot?: EquipSlot; // isEquip(category)

  // isEquip(category) — preset-driven stat/resistance bonuses (see StatPreset). Keyed by the
  // StatPreset's own id, value is the slider's current position (0..preset.max). Kept
  // separate from the older free-form `stats` field above, which stays in place for
  // character/item/object entries.
  statsEnabled?: boolean;
  statValues?: Record<string, number>;
  resistValues?: Record<string, number>;

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

// A reusable, project-wide equipment stat/resistance definition — created once via the
// preset library modal, then assignable (with its own per-entry value) on any equipment
// card. Two separate libraries exist (Project.statPresets / resistPresets) since "Параметры"
// (flat bonuses like attack/defense) and "Сопротивления" (elemental resist %) are visually and
// conceptually distinct groups, even though they share this exact same shape.
export interface StatPreset {
  id: string;
  name: string;
  icon: string; // key into STAT_ICONS (src/lib/statIcons.ts)
  max: number; // slider upper bound; lower bound is always 0
}

export type DialogueFlagType = "bool" | "number";

// Registered per flag (see Flags manager) — missing entries default to type "bool", default
// "false". Lets flag-value pickers show the exact right control (on/off switch or a
// slider+number field within [0, max]) instead of a generic true/false/number select, and lets
// the manager itself display/edit each flag's own default value.
export interface DialogueFlagDef {
  type: DialogueFlagType;
  default: string; // "true"/"false" for bool, a numeric string for number
  max?: number; // number type only — slider upper bound (lower bound is always 0)
}

export interface Project {
  name: string;
  entries: Entry[];
  rarities: RarityObject[];
  chapters: string[];
  dialogueFolders: DialogueFolder[];
  dialogues: Dialogue[];
  dialogueFlags: string[];
  dialogueFlagDefs: Record<string, DialogueFlagDef>;
  colorStyles: DialogueColorStyle[];
  statPresets: StatPreset[];
  resistPresets: StatPreset[];
}

// Mirrors the real engine's color_lookup()/color_eval()/color_eval_glyph() system
// (global.colors[$ name] = { mode, a, b, speed }) — confirmed by the user's own pasted GML:
//  - "solid": always color `a`.
//  - "gradient": static blend of a->b across the letters of the [c=...] span (no animation).
//  - "pulse": whole span pulses between a and b together, driven by time only.
//  - "gradient_anim": blend factor depends on BOTH letter position and time (a moving band).
//  - "rainbow": built-in HSV cycle depending on letter position + time (no a/b needed).
// `a`/`b` are stored here as CSS hex so the Studio can preview them; the exporter turns them
// into make_colour_rgb(r,g,b) when generating a colors_init()-equivalent script.
export type ColorStyleMode = "solid" | "gradient" | "pulse" | "gradient_anim" | "rainbow";

export interface DialogueColorStyle {
  name: string; // the key used in [c=name] tags AND in global.colors[$ name]
  mode: ColorStyleMode;
  a: string; // CSS hex color
  b: string; // CSS hex color (ignored for "solid"/"rainbow")
  speed: number; // matches _spec.speed in color_eval — multiplies current_time
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
  // Optional escape hatch: if `condition` fails, jump the whole conversation to this node
  // instead of just silently skipping the line — lets the writer branch to an alternative
  // node/reply for the "condition not met" case rather than only being able to omit content.
  elseNodeId?: string;
}

// Direct quest-system calls a choice can trigger — confirmed against the real scr_quests.gml
// (quest_start/quest_progress/quest_mark_done) rather than any flag-based convention, since
// those are real, callable function names, not something that needs a magic flag like
// goto_dialogue.
export type QuestActionKind = "start" | "advance" | "complete";

export interface QuestAction {
  id: string;
  kind: QuestActionKind;
  questId: string;
  objectiveIndex?: number; // "advance" only — which objective in quest_progress(id, index, amount)
  amount?: number; // "advance" only — defaults to 1
}

export interface DialogueChoice {
  id: string;
  text: string;
  condition?: DialogueCondition;
  flagSets: DialogueFlagSet[];
  questActions: QuestAction[];
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
