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
  | "lore"
  // Dynarain Phase 1: Scene is a peer of Quest, not a child of it — see the doc comment on
  // SceneStep/SceneTransition below and the Dynarain spec (2026-07-15) for why. Cutscene and
  // Battle are added now too (as bare placeholder categories with no special fields yet beyond
  // name/description) purely so Scene's flow-step editor has real entities to reference via the
  // normal entry-picker UI instead of a raw free-text id field — their own dedicated editors
  // (multi-track timeline / tactical grid + minigame designer) are Phase 2 and Phase 3 work.
  | "scene"
  | "cutscene"
  | "battle";

export const CAT_ORDER: Category[] = [
  "character",
  "location",
  "main_quest",
  "side_quest",
  "equipment",
  "item",
  "object",
  "lore",
  "scene",
  "cutscene",
  "battle",
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
  scene: "Сцены",
  cutscene: "Катсцены",
  battle: "Бои",
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
  scene: "#d68fb0",
  cutscene: "#e0a458",
  battle: "#c0605d",
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
export function isScene(c: Category): boolean {
  return c === "scene";
}
export function isCutscene(c: Category): boolean {
  return c === "cutscene";
}
export function isBattle(c: Category): boolean {
  return c === "battle";
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
// How an objective's progress value is sourced/edited — purely a Codex planning aid (like
// QuestDependency above), doesn't change quest_define()'s exported shape at all: current/max
// are still what gets exported, this just controls how the WRITER edits/visualizes them.
//   "checkbox" (default/legacy) — plain done/not-done, max is always 1.
//   "flag"     — mirrors an existing project dialogue flag (see Project.dialogueFlags /
//                dialogueFlagDefs); bool flags render as a checkbox, number flags as a slider,
//                auto-detected from that flag's own DialogueFlagDef.
//   "custom"   — writer manually picks bool/number plus a max and a default/reset value,
//                independent of any dialogue flag.
export type ObjectiveValueMode = "checkbox" | "flag" | "custom";

export interface Objective {
  text: string;
  done: boolean;
  current?: number;
  max?: number;
  objId?: string;
  valueMode?: ObjectiveValueMode; // undefined = "checkbox", for backward compatibility
  boundFlagName?: string; // valueMode === "flag" — key into Project.dialogueFlagDefs
  customType?: "bool" | "number"; // valueMode === "custom"
  customDefault?: number; // valueMode === "custom", number type only — reset/starting value
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

  // isScene(category) -- the cinematic/spatial content layer described in the Dynarain spec
  // (2026-07-15): a Scene is one location plus a branching flow of cutscene/dialogue/battle
  // steps, and is a PEER of Quest (not a child of it) -- a Scene's dialogue can branch into
  // starting a Quest, and a Quest's objective can point at a Scene's dialogue node, the same
  // way objectives already link to dialogue nodes today, but neither owns the other.
  sceneMapId?: string; // the one Entry of category "location" this scene is bound to
  sceneFlow?: SceneStep[]; // ordered; a scene always has exactly one location, see sceneMapId
  sceneTransitions?: SceneTransition[]; // "on finishing this scene, hand off to Scene X"

  // category === "character" only -- per-state overworld animation strip, used by the Cutscene
  // Timeline's live preview (Dynarain Phase 2) to actually animate a character's movement
  // instead of just sliding the static `image` portrait around. Optional and additive: a
  // character with none of these uploaded keeps working everywhere else exactly as before, the
  // preview just falls back to the static image for that character.
  spriteAnimations?: Partial<Record<CharacterAnimState, SpriteStrip>>;

  // isCutscene(category) -- see the doc comment above CutsceneTrackKind for the full model. A Cutscene
  // is bound to one location (same "one location" simplification as Scene) purely so the live
  // preview has a map to render behind the action; standalone and reusable, referenced by id
  // from Scene steps, never owned by one Scene.
  cutsceneMapId?: string;
  cutsceneFps?: number; // frame-step granularity for the editor's transport controls; defaults to 60
  // LEGACY (pre-v75) -- which characters have their own track/lane in the timeline editor.
  // Replaced by cutsceneCast below (each cast slot is now its own INSTANCE, distinct from the
  // Entry id, so the same character/object/item can be added more than once). Old projects are
  // migrated once at load time into cutsceneCast with instanceId === the old raw id, so every
  // existing character-track/keyframe/color record (which are all keyed by this same id string
  // already) keeps resolving correctly with zero further migration needed. Kept only for that
  // migration; do not write to this field going forward.
  cutsceneCastCharacterIds?: string[];
  // Which actors (characters, objects, or items -- see the "Персонажи + Объекты/Предметы"
  // writer decision) have their own track/lane in the timeline editor, kept separate from the
  // actual clips for the same reason as the old field above. `instanceId` is what every
  // character-kind CutsceneTrack/CharacterPositionKeyframe/color entry is actually keyed by --
  // it is a freshly generated id distinct from `entryId` (the underlying Codex Entry this
  // instance represents) specifically so the SAME Entry can be placed on the stage more than
  // once (e.g. two independent "Bandit" object instances), each moving/animating/appearing
  // fully independently. Order here is also the lane's on-screen display order.
  cutsceneCast?: CutsceneCastMember[];
  // Generic Track+Clip+Component model (v71) -- one flat list of tracks, each holding its own
  // ordered clips (see the doc comment above CutsceneTrackKind for the full rationale). Replaces
  // the four separately-typed cutsceneCameraTrack/cutsceneCharacterTrack/cutsceneDialogueTrack/
  // cutsceneAudioFxTrack fields from before this rework -- old projects are migrated once at
  // load time (see normalizeCutsceneTracks in lib/cutsceneDefaults.ts).
  cutsceneTracks?: CutsceneTrack[];
  // -- Keyframe-channel position data (replaces the old "move"/"zoom" clip kinds) --
  // Per writer design decision: POSITION (and zoom) are continuous properties best expressed as
  // classic point-in-time keyframes, each independently interpolating only against its own two
  // neighbors -- inserting/moving/deleting one key affects just the two segments touching it,
  // never the whole sequence, unlike the old clip-chain "settle then tween" model. ANIMATION
  // STATE (idle/walk/run) stays clip-based on purpose (see the "animation" CutsceneComponent) -- it's a discrete
  // state that holds until changed, not something you'd ever want to smoothly interpolate.
  cutsceneCameraPosX?: Keyframe[];
  cutsceneCameraPosY?: Keyframe[];
  cutsceneCameraZoomKeys?: Keyframe[];
  // Single toggle for the whole camera position/zoom channel set (default true, respects a
  // blocking dialogue elsewhere) -- courser-grained than the old per-clip flag since there's
  // only one camera and channels don't have a natural "current clip" to hang a flag off of.
  // "shake" clips (still in cutsceneCameraTrack) keep their own per-clip pausesForDialogue.
  cutsceneCameraPausesForDialogue?: boolean;
  // Flat list (matches the existing cutsceneCharacterTrack convention) tagged by characterId +
  // axis rather than a nested per-character map -- simpler to spread/update immutably.
  cutsceneCharacterPositionKeys?: CharacterPositionKeyframe[];
  // Per-character track color (keyed by character Entry id) -- lets each character's lane and
  // clips stand out from the others instead of every character sharing one fixed color.
  cutsceneCharacterTrackColors?: Record<string, string>;
  // Named points in time on the timeline ruler, purely for quick navigation (click a marker to
  // jump the playhead there) -- e.g. "Boss Intro" / "Explosion" / "Music Drop" from the mockup.
  cutsceneMarkers?: CutsceneMarker[];

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
  // v77 emotions pipeline: an actual uploaded portrait PICTURE for this emotion (data URL,
  // lossless — pixel-art portraits must not go through the lossy resize path). Optional and
  // additive: the GML `sprite` name above stays the export source of truth, this image only
  // drives the Studio's own previews (dialogue node thumbnails + Live Preview portrait swap).
  image?: string;
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
//
// Characters get their OWN separate pair of libraries (Project.characterStatPresets /
// characterResistPresets) rather than sharing the equipment ones — a character's "Параметры"
// (e.g. charisma, endurance) and an equipment's "Параметры" (e.g. attack, defense bonus) are
// conceptually different pools even though the UI/data shape (this same StatPreset type) is
// identical, so mixing them into one shared list would let the wrong kind of preset show up
// when assigning stats to the other kind of entry.
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

// --- v77: project-wide image tilesets (real 16px-grid PNG tilesets for the Map Editor) ---
// One imported PNG sliced on a configurable square grid (default 16 — the game's own tile
// size at 320x180). Tilesets are PROJECT-level (shared across every location's map, matching
// the Shared_Assets idea from the vision) rather than per-map, so a forest tileset drawn once
// is paintable on every forest map.
export interface TilesetAutotile {
  id: string;
  name: string;
  // Index (row-major, y * cols + x) of the TOP-LEFT tile of this autotile's 4x4 block inside
  // the tileset image. The 16 sub-tiles cover every N/E/S/W neighbor bitmask: for mask m
  // (bit 1 = North neighbor same, 2 = East, 4 = South, 8 = West) the drawn tile is at
  // (baseCol + m % 4, baseRow + floor(m / 4)). See autotileSubIndex in lib/mapDefaults.ts.
  baseIndex: number;
}

export interface Tileset {
  id: string;
  name: string;
  image: string; // data URL, imported losslessly — slicing math needs exact source pixels
  tileSize: number; // px per tile in the SOURCE image (configurable at import, default 16)
  cols: number; // derived from the image dimensions at import, stored for fast math
  rows: number;
  autotiles: TilesetAutotile[];
}

// v77: settings for the exact-resolution (320x180) dialogue Live Preview — how big the
// in-game dialogue box is, in REAL game pixels, so the Studio can both render a faithful
// preview and statically flag lines that won't fit (see estimateDialogueOverflow in
// lib/dialoguePreview.ts + the Problems scan). All optional; defaults live in that lib.
export interface DialoguePreviewSettings {
  boxWidthPx?: number; // dialogue box width on the 320x180 screen, default 300
  boxHeightPx?: number; // text area height, default 46
  fontSizePx?: number; // pixel font size, default 8
  lineHeightPx?: number; // default 10
  paddingPx?: number; // box inner padding, default 6
  portraitSizePx?: number; // portrait square, default 32
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
  // Character-specific preset pools — see the StatPreset doc comment above for why these are
  // kept separate from the equipment ones instead of sharing statPresets/resistPresets.
  characterStatPresets: StatPreset[];
  characterResistPresets: StatPreset[];
  // User-dragged node positions in the Quests roadmap graph, keyed by the graph's own node id
  // (e.g. "q:<questId>", "d:<dialogueId>") — only written once a node is actually dragged (see
  // pinnedRef in QuestsView.tsx), so the force layout still runs freely for anything nobody has
  // manually placed. Persisted here instead of on Entry itself since flag/dialogue nodes have
  // no Entry to hang a position off of.
  questGraphPositions?: Record<string, { x: number; y: number }>;
  questGraphGridEnabled?: boolean;
  // Writer-resized width for each chapter's frame in the roadmap graph, keyed by chapter name
  // ("" = the "Без главы" bucket). Only chapters the writer has actually dragged get an entry —
  // everything else uses the default full-width frame. Height already auto-scales with quest
  // count (see chapterBand in QuestsView.tsx); width is manual since "how much horizontal room
  // this chapter's dependency chain needs" isn't something a formula can guess well.
  questGraphChapterWidths?: Record<string, number>;
  // Writer-stretched height for a chapter's frame, ON TOP of its auto-computed proportional
  // height (see chapterBand in QuestsView.tsx) — this only ever GROWS a band beyond its fair
  // share, never shrinks it below (unlike width, which can be narrowed down to a fit-content
  // minimum too), since height already has a sensible auto-computed default.
  questGraphChapterHeights?: Record<string, number>;
  uiSettings?: UiSettings;
  // v77 — see the doc comments on Tileset / DialoguePreviewSettings above. Both optional so
  // every pre-v77 saved project loads unchanged (normalize fills [] / defaults lazily).
  tilesets?: Tileset[];
  previewSettings?: DialoguePreviewSettings;
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
  // v77 image tilesets: when set, this cell renders a real tile sliced out of a project
  // Tileset image instead of the flat `color` (which stays as a fallback for the minimap,
  // legacy cells, and cells whose tileset got deleted). Exactly ONE of tileIndex / autotileId
  // is meaningful at a time:
  //   tileIndex  — plain tile: index into the tileset's grid, row-major (y * cols + x).
  //   autotileId — autotile group: the DRAWN sub-tile is resolved at render time from the
  //                4-neighbor bitmask (see autotileSubIndex in lib/mapDefaults.ts), so
  //                painting/erasing a neighbor automatically restitches the edges with no
  //                repaint pass needed.
  tilesetId?: string;
  tileIndex?: number;
  autotileId?: string;
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
  // v77 location transitions — meaningful when tag === "transition": which OTHER location
  // Entry this door/road leads to, and (optionally) which spawn zone (tag === "spawn") inside
  // that location's own map the player appears at. Reuses the existing zone tooling (draw,
  // drag, properties panel) instead of inventing a parallel "transition object" concept —
  // a transition IS a zone, it just carries a destination. These also drive the automatic
  // location-to-location arrows in the Relationship Graph (see GraphView).
  targetMapId?: string;
  targetSpawnZoneId?: string;
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

// v77 collision painting — the "красный полупрозрачный слой" from the Dynarain vision. A cell
// key's presence means "solid / impassable". Kept as its own layer KIND (not a flag on tile
// cells) so collision is drawn/erased/exported independently of what the ground art looks like,
// and so a map can keep collision hidden while painting scenery. Exports straight into the
// map's JSON like every other layer — a GMS2 importer turns each cell into its collision grid.
export interface MapCollisionLayer extends MapLayerBase {
  kind: "collision";
  cells: Record<string, true>; // key: "x:y"
}

export type MapLayer = MapTileLayer | MapObjectLayer | MapZoneLayer | MapFreehandLayer | MapImageLayer | MapCollisionLayer;

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
  // Same flag_set()/quest_start()/quest_progress()/quest_mark_done() side effects a choice can
  // trigger (see DialogueChoice below), but firing the moment this REPLICA is shown rather than
  // waiting for a player choice — e.g. "set flag met_npc when this line displays". Purely
  // additive in the GML export (see renderLinePage in dialogueCompile.ts): a line with neither
  // populated compiles to the exact same page object as before this field existed.
  flagSets: DialogueFlagSet[];
  questActions: QuestAction[];
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

// One beat in a Scene's flow (see Entry.sceneFlow / isScene). "dialogue" points at a
// project.dialogues entry (dialogues are their own collection, not Entry-based); "cutscene" and
// "battle" point at Entry ids of those categories (standalone, reusable — the same cutscene or
// battle can be referenced from more than one scene, per the Dynarain spec); "trigger-zone"
// points at a MapZone id living inside the scene's own bound map (Entry.sceneMapId) — scoped to
// that one map since a Scene only ever has one location.
export type SceneStepKind = "cutscene" | "dialogue" | "battle" | "trigger-zone";

// A Scene's flow is a branching graph, not a flat sequence — a step can lead to DIFFERENT next
// steps depending on what happened (which dialogue choice the player picked, whether a battle
// was won or lost), matching how the actual game would route the player. Every step gets at
// least one outcome, but how many and whether they're user-editable depends on the kind (see the
// outcome-management logic in ScenePanel, EntryEditor.tsx):
//   - "cutscene" / "trigger-zone": always exactly one outcome ("Далее") — neither branches on its
//     own, so there's nothing for the writer to add or remove, just where it leads next.
//   - "battle": always exactly two fixed outcomes ("Победа" / "Поражение"), each independently
//     routable.
//   - "dialogue": the writer adds as many outcomes as they need, one per branch they care about
//     (e.g. "Пощадить" / "Сражаться") — free-text labels chosen by the writer rather than
//     mechanically derived from the referenced dialogue's actual node/choice graph, since that
//     graph can have many possible terminal points with no single clean mapping onto "the"
//     branches a scene cares about. sourceChoiceId is an optional loose cross-reference to a
//     DialogueChoice.id, for the writer's own bookkeeping — not something the flow logic reads.
export interface SceneOutcome {
  id: string;
  label: string; // e.g. "Далее", "Победа", "Поражение", or a free-text dialogue branch name
  sourceChoiceId?: string; // dialogue steps only, optional — see note above
  targetStepId?: string; // continue the flow at this OTHER SceneStep in the same scene...
  endTransitionId?: string; // ...OR end the scene via this SceneTransition (mutually exclusive with targetStepId)
}

export interface SceneStep {
  id: string;
  kind: SceneStepKind;
  refId?: string; // dialogueId / cutsceneId / battleId / zoneId depending on kind
  note?: string; // free-text label shown on the step card, e.g. "Босс появляется"
  outcomes: SceneOutcome[];
}

// "On finishing this scene, hand off to Scene X" — fired from whichever SceneOutcome across the
// flow points at it (endTransitionId), rather than being one flat list disconnected from the
// flow. A scene that needs to move somewhere else (forest -> cave) ends with one of these instead
// of trying to model multiple locations inside a single Scene (see the Dynarain spec's "one Scene
// = one location" decision).
export interface SceneTransition {
  id: string;
  targetSceneId?: string;
  label?: string;
}

// A single overworld animation state for a Character (see Entry.spriteAnimations). The uploaded
// image is expected to be ONE HORIZONTAL ROW of equally-sized frames, left to right -- frame i
// is read from source rect (i * frameWidth, 0, frameWidth, frameHeight). This is a deliberate v1
// simplification (matches how these strips are typically exported from GMS2 one state at a
// time) rather than supporting arbitrary multi-row sprite sheets/atlases.
export type CharacterAnimState = "idle" | "walk" | "run";

export interface SpriteStrip {
  image: string; // data URL, uploaded losslessly (see readImageFileLossless in lib/image.ts) --
                  // frame math depends on exact source pixel dimensions, so this must NOT go
                  // through the app's usual lossy/resizing image pipeline.
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
}

// --- Cutscene (Dynarain Phase 2) ---
// A Cutscene is a standalone, reusable Entry (category "cutscene"), referenced by id from one or
// more Scene steps (see SceneStep) -- never owned by a single Scene. It's a multi-track timeline:
// Camera (move/zoom/shake), Character (move/animate, one flat list of clips each tagged with a
// characterId rather than a nested per-character map -- simpler to edit as one list, grouped by
// character only for display), Dialogue (drop an existing dialogue graph on the timeline), and
// Audio/FX (sound/music cue markers, screen fade/flash). All positions (camera x/y, character
// x/y) are in the SAME map cell-unit coordinate space as MapZone/MapObjectInstance, so a writer
// can eyeball a clip's target against the bound location's zones/objects. Time is always
// milliseconds from the start of the cutscene.
//
// Scoping note: the editor below (CutscenePanel, EntryEditor.tsx) presents these as ordered
// lists with numeric start/duration fields rather than a draggable/resizable horizontal timeline
// UI -- the same "lower engineering risk than a novel drag/canvas interaction, same underlying
// data" call made for the Scene flow editor. The DATA model here already fully supports a
// proper visual timeline being layered on top later without a migration.

// How a keyframe eases IN from its previous neighbor -- matches the standard set any
// keyframe-based animation tool offers. Applied in resolveChannel (see lib/cutscenePreview.ts).
export type ClipEasing = "linear" | "easeIn" | "easeOut" | "bounce";

// A single point-in-time value on an animatable scalar property channel (camera X/Y/zoom,
// character X/Y). `easing` describes the interpolation used for the SEGMENT arriving at this
// key from whichever key precedes it (the very first key in a channel has no incoming segment,
// so its own easing is unused). See resolveChannel's doc comment in lib/cutscenePreview.ts for
// the full interpolation rules (holds constant before the first / after the last key).
export interface Keyframe {
  id: string;
  atMs: number;
  value: number;
  easing?: ClipEasing;
}

// Per-character position keyframe -- flat list (see cutsceneCharacterPositionKeys), tagged by
// which character and which axis this point belongs to, rather than a nested
// Record<characterId, {x,y}> structure (flat lists are simpler to spread/update immutably, and
// match the existing cutsceneCharacterTrack convention in this file).
export type CharacterPositionAxis = "x" | "y" | "active";
// "active" axis keyframes are a STEP channel (hold at the last key's value, never
// interpolated -- see resolveActiveChannel in lib/cutscenePreview.ts), reusing this same
// Keyframe shape purely to plug into the existing per-character channel machinery (marquee
// select, group-drag, delete, timeline rendering) for free. `value` is 1 (active/visible) or 0
// (inactive/hidden); `easing` is ignored for this axis. No keys at all => always active (keeps
// every pre-existing cutscene's cast rendering exactly as before this feature was added). If
// keys exist, the actor is INACTIVE before the first key (hasn't appeared yet), then follows
// whichever key was most recently crossed -- this is what lets a writer make an actor "appear"
// and "disappear" at specific times on the timeline instead of being present for the whole
// cutscene.
export interface CharacterPositionKeyframe {
  id: string;
  characterId: string;
  axis: CharacterPositionAxis;
  atMs: number;
  value: number;
  easing?: ClipEasing;
}

// Where a clip's x/y position refers to within the character's sprite box -- mirrors the
// classic 3x3 "anchor/pivot" grid (top-left ... bottom-right), defaulting to "center". This is a
// per-CLIP placement convenience (e.g. "bottom-center" so x/y tracks the character's feet on a
// walk clip), NOT the permanent per-sprite origin-point editor the user explicitly flagged as a
// separate "future, not now" item -- that would live on the sprite asset itself, not a clip.
export type CharacterAnchor =
  | "top-left" | "top-center" | "top-right"
  | "middle-left" | "center" | "middle-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type AudioFxKind = "sound" | "music" | "fade" | "flash";

// --- Generic Track + Clip + Component model (v71 architecture rework) ---
// Every clip on every cutscene track used to be its own hard-coded TS type (CameraClip,
// CharacterClip, CutsceneDialogueClip, AudioFxClip) living in its own dedicated Entry field
// (cutsceneCameraTrack, cutsceneCharacterTrack, ...). That meant adding any new capability (an
// Events track, a Particle track, a future Weather system) meant inventing a whole new Entry
// field and re-plumbing it through every file that touches cutscenes. Per writer design
// decision, this is replaced by ONE generic shape: a Track holds an ordered list of Clips, and
// each Clip carries exactly one typed "component" payload (its actual behavior/data) tagged by
// `kind`. Adding a new capability later (e.g. "weather") means adding ONE new variant to
// CutsceneComponent -- it then automatically has a place in the track/clip data, the Action
// Palette, the Inspector, search, and export, without inventing new plumbing.
//
// Position/zoom are deliberately NOT modeled as components here -- per the earlier keyframe
// rework, those are continuous, interpolated CHANNELS (Keyframe[] on camera X/Y/zoom, character
// X/Y), a fundamentally different shape from a clip (no start/duration, just points in time).
// They stay on their own Entry fields (cutsceneCameraPosX/PosY/ZoomKeys,
// cutsceneCharacterPositionKeys) exactly as before -- this mirrors the reference architecture's
// own phasing (Tracks/Clips come first, Channels/Keys are unlocked once a track exists).
export type CutsceneTrackKind = "camera" | "character" | "dialogue" | "audiofx" | "event";

// Game-logic actions a cutscene can trigger -- this is what actually turns a cutscene from "a
// clip that plays" into a piece of game script (per the reference architecture's Events phase).
// Each is data-only for now (captured for a future GML export, same "no code-gen yet" philosophy
// as the "audio" component's assetName field) -- nothing here is executed live by this preview,
// the same way an audio clip doesn't actually play a sound file.
export type CutsceneEventKind = "setFlag" | "teleport" | "spawnObject" | "destroyObject" | "startBattle" | "runScript";

export type CutsceneComponent =
  | {
      kind: "shake";
      intensity?: number; // jitter amplitude, map cell units
      // Default true (respects the pause): while the cutscene is paused waiting on a blocking
      // dialogue clip, this clip's own resolution freezes along with the rest of the timeline.
      // Set to false so THIS clip keeps animating using real elapsed time even while everything
      // else is held for the dialogue (e.g. a shake that should keep rumbling during a
      // conversation).
      pausesForDialogue?: boolean;
    }
  | {
      // A character's APPEARANCE STATE over some span of time -- which sprite animation is
      // playing, draw order, opacity, flip, anchor, and reference-only metadata. Position lives
      // on the channel keyframes, not here (see the doc comment above CutsceneTrackKind).
      kind: "animation";
      anim?: CharacterAnimState; // which sprite state plays during this clip, default "idle"
      pausesForDialogue?: boolean;
      speed?: number; // playback speed of the sprite animation itself, percent, default 100
      zIndex?: number; // draw order among characters on the same frame, default 0 (higher draws later/on top)
      anchor?: CharacterAnchor; // default "center"
      opacity?: number; // 0-100, default 100
      flipX?: boolean; // mirror the sprite horizontally, default false
      conditionExpr?: string; // free-text flag/condition expression (data-only -- captured for the writer's own reference and for a future GML export, not evaluated live in this preview)
      tags?: string[];
      notes?: string;
    }
  | {
      // Reaching this clip while actually PLAYING (not just scrubbing) the cutscene ALWAYS
      // pauses the timeline and shows the real interactive dialogue box embedded on the preview
      // stage (see CutscenePreview.tsx's EmbeddedDialoguePlayer) until the conversation
      // finishes. The exception mechanism for "something should keep going WHILE this dialogue
      // plays" lives on the OTHER clip that should keep going (its own `pausesForDialogue`), not
      // here -- simpler to reason about per element than as a single blanket toggle.
      kind: "dialogue";
      dialogueId?: string;
    }
  | {
      kind: "audio";
      audioKind: AudioFxKind;
      assetName?: string; // "sound"/"music" -- GML sound asset name reference (data-only, matches the
                           // rest of this tool's "no code-gen" export philosophy; no real audio file
                           // is uploaded or played back in the preview, this is just a marker)
      color?: string; // "flash" -- overlay color, e.g. "#ffffff"
      direction?: "in" | "out"; // "fade" -- fade to black ("out") or from black ("in")
      pausesForDialogue?: boolean;
    }
  | {
      // A single game-logic action, triggered the instant playback crosses this clip's start
      // (an "event" clip is conceptually a point in time -- durationMs is kept only for
      // consistency with every other clip shape and for the timeline's "instant" bar-width
      // convention, same as an "audio" sound/music cue). Which fields apply depends on
      // `eventKind` -- see each field's own comment.
      kind: "event";
      eventKind: CutsceneEventKind;
      flagName?: string; // "setFlag"
      flagValue?: boolean; // "setFlag", default true
      targetMapId?: string; // "teleport" -- Entry id, category "location"
      targetX?: number; // "teleport" -- map cell coordinates
      targetY?: number; // "teleport"
      objectId?: string; // "spawnObject"/"destroyObject" -- Entry id (object/item/character)
      battleId?: string; // "startBattle" -- Entry id, category "battle"
      script?: string; // "runScript" -- free-text GML snippet reference/marker, data-only
      pausesForDialogue?: boolean;
    };

// One region of time on a track. `durationMs` is meaningful for every kind now (previously
// dialogue/audiofx used a separate `atMs` + optional durationMs convention) -- "instant" events
// like a sound cue or a dialogue trigger just use a small/zero duration, same as any other point
// event on a real NLE timeline.
export interface CutsceneClip {
  id: string;
  startMs: number;
  durationMs: number;
  component: CutsceneComponent;
}

export interface CutsceneTrack {
  id: string;
  kind: CutsceneTrackKind;
  characterId?: string; // set only when kind === "character" -- holds a cast INSTANCE id (see
                         // CutsceneCastMember), not necessarily an Entry id directly
  clips: CutsceneClip[];
}

// One "actor" slot placed on the cutscene stage -- a character, object, or item Entry, tagged
// with its own instanceId so the exact same Entry can be added more than once (each instance
// gets fully independent position keys, animation clips, active/presence keys, and color, all
// keyed by instanceId the same way they were previously keyed directly by the character's Entry
// id). See the doc comment on Entry.cutsceneCast for the full rationale.
export interface CutsceneCastMember {
  instanceId: string;
  entryId: string; // the character/object/item Entry this instance represents
}

export interface CutsceneMarker {
  id: string;
  atMs: number;
  label: string;
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
  // "Don't ask me again" for the Delete-key confirmation modal in THIS dialogue only — the
  // global equivalent lives on Project.uiSettings.skipDeleteConfirmGlobal instead. Both are
  // recoverable from the new Settings panel's "reset dismissed warnings" action.
  skipDeleteConfirm?: boolean;
  // Last camera (pan + zoom) the writer left this dialogue's canvas at, so reopening it resumes
  // exactly where they left off instead of falling back to whatever pan/zoom the PREVIOUSLY
  // open dialogue happened to be at (DialogueCanvas isn't remounted per-dialogue, so its pan/zoom
  // state used to just carry over unchanged — this is what made the view look "random").
  camera?: { x: number; y: number; zoom: number };
  // Chapter + location apply to the whole dialogue "file", not to individual nodes — a
  // conversation happens in one place at one point in the story in the overwhelming majority
  // of cases. `chapter` mirrors Entry.chapter (a plain string matching one of project.chapters,
  // "" / undefined = no chapter). `locationEntryId` links to an actual Entry of category
  // "location" (reusing the existing location/map-editor entity) rather than a free-text
  // field, so it stays consistent with everywhere else locations are referenced. The rare case
  // of the SAME dialogue content playing out in different chapters/locations isn't modeled
  // structurally — the writer would duplicate the dialogue for that instead, same as any other
  // per-file metadata in this app.
  chapter?: string;
  locationEntryId?: string;
}

// App/Codex-wide UI preferences that aren't really "project content" (nothing here affects any
// exported GML) — tutorial on/off + which ones have been dismissed, and the global delete
// confirmation suppression. Grouped under one object on Project so the new Settings panel
// (gear icon in the dialogue toolbar) has one place to read/reset everything from.
export interface UiSettings {
  tutorialsEnabled?: boolean; // default true when undefined
  dismissedTutorials?: string[]; // tour ids the writer dismissed with "не показывать снова"
  skipDeleteConfirmGlobal?: boolean;
  // Background grid on/off for the Dialogues canvas — deliberately a single window-wide switch
  // (not per-Dialogue) per the writer's request, unlike the per-dialogue camera above.
  dialoguesGridEnabled?: boolean;
  // v77 Explorer tree mode: "categories" (default — one group per entity type, chapters
  // inside) or "story" (Глава → Сцена → everything that scene actually uses, plus a Shared
  // Assets bucket for entries no scene references). Pure view preference, no data change.
  explorerMode?: "categories" | "story";
}

// MARKUP_TAGS moved to src/lib/dialogueMarkup.ts (now alongside the parser/renderer it drives).
