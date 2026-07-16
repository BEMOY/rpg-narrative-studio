import { useEffect, useMemo, useRef, useState } from "react";
import { X, Eye, EyeOff, Lock, Unlock, ChevronDown, ChevronRight, Flag, Scissors, Magnet } from "lucide-react";
import type { CharacterPositionAxis, CharacterPositionKeyframe, CutsceneClip, CutsceneEventKind, CutsceneTrackKind, Entry, Keyframe } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { cutsceneTotalDurationMs, resolveActiveChannel, resolveChannel } from "../../lib/cutscenePreview";
import {
  addCastMember as addCastMemberToList,
  castLabel,
  ensureCharacterTrack,
  findClipAnywhere,
  removeCastMember as removeCastMemberFromList,
  removeCharacterTrack,
  trackClips,
  withTrackClips,
} from "../../lib/cutsceneTracks";
import { nextId } from "../../lib/mapDefaults";
import { themedPrompt } from "../../lib/modals";
import { ACTOR_DRAG_MIME, DIALOGUE_DRAG_MIME } from "./CutsceneExplorerPanel";
import { SearchSelect } from "../dialogue/SearchSelect";

// Identifies exactly one selectable thing on the timeline -- either a clip (camera shake,
// character appearance/anim, dialogue, audio/fx -- all still duration-based regions, each now a
// generic CutsceneClip tagged by a typed `component`, see CutsceneTrackKind in types/database.ts)
// or a single KEYFRAME on one of the position/zoom channels (camera X/Y/zoom, or one character's
// X/Y -- channels are a separate concept from tracks/clips, unaffected by the Track+Clip+
// Component rework). Routes both drag/edit gestures here and the ClipInspector panel's
// selected-item display to the right data. Note "character"/"camera" clip refs carry only a clip
// id, not which specific track owns it (a given clip id only ever exists on ONE track of that
// kind) -- see findClipAnywhere in lib/cutsceneTracks.ts for how callers resolve that back.
export type ClipRef =
  | { trackKind: "camera"; id: string }
  | { trackKind: "character"; id: string }
  | { trackKind: "dialogue"; id: string }
  | { trackKind: "audiofx"; id: string }
  | { trackKind: "event"; id: string }
  | { trackKind: "cameraKey"; channel: "x" | "y" | "zoom"; id: string }
  | { trackKind: "characterKey"; characterId: string; axis: CharacterPositionAxis; id: string };

const LANE_H = 30;
const RULER_H = 22;
const LABEL_W = 136;
const MIN_PX_PER_MS = 0.02;
const MAX_PX_PER_MS = 0.6;
const DIAMOND = 9;

const TRACK_COLOR = {
  camera: "#5b8dd6",
  character: "#59b37a",
  dialogue: "#c98a4b",
  audiofx: "#a06bc9",
} as const;

// A real multi-track timeline widget (Dynarain Phase 2, Cutscene). Track-label column on the
// left, a horizontally-scrollable/zoomable ruler+lanes area on the right. Two visually different
// row types share this same lane area:
//  - CLIP rows (camera shake, character appearance/anim, dialogue, audio/fx) -- colored bars,
//    draggable (move) and resizable (drag the right edge), same "mousedown starts a drag, window
//    listens for mousemove/mouseup" pattern used for freehand brush strokes in MapEditorModal.tsx.
//    Under the hood each bar is one generic CutsceneClip on one of the four CutsceneTrackKinds
//    (see lib/cutsceneTracks.ts for the read/write helpers all of this goes through) --
//    everything track-specific about a clip lives in its typed `component` field.
//  - KEYFRAME rows (camera X/Y/zoom, each character's X/Y) -- small diamond markers at a single
//    point in time, draggable only in TIME (their VALUE is edited in the Inspector, or by
//    dragging the actual object/camera on the live preview stage -- see CutscenePreview.tsx).
//    These are channels, a different concept from tracks/clips (see resolveChannel in
//    lib/cutscenePreview.ts) -- untouched by the Track+Clip+Component rework. A click-drag on a
//    channel row's EMPTY background draws a marquee/rubber-band box (same interaction as the
//    Dialogue graph editor's node canvas) selecting every key it overlaps, in time AND across
//    however many channel rows the box vertically spans; dragging any one of the selected
//    diamonds afterwards moves the whole group together, and Delete/Backspace removes them all.
// Both the Camera group and each individual character can be collapsed down to just their own
// header row (hiding their X/Y/Zoom/Animation sub-rows) to keep the timeline from growing too
// tall once several characters are in the cast.
// The overall timeline LENGTH is always derived live from cutsceneTotalDurationMs (the furthest
// any clip or keyframe reaches) -- there is no separately-stored "cutscene duration".
// Track visibility/lock is ephemeral editing-session UI state (not persisted to project data).
export function cameraTrackKey() {
  return "camera";
}
export function cameraPosXKey() {
  return "cameraPosX";
}
export function cameraPosYKey() {
  return "cameraPosY";
}
export function cameraZoomKey() {
  return "cameraZoom";
}
export function characterTrackKey(characterId: string) {
  return `character:${characterId}`;
}
export function characterPosXKey(characterId: string) {
  return `characterPosX:${characterId}`;
}
export function characterPosYKey(characterId: string) {
  return `characterPosY:${characterId}`;
}
export function characterPosActiveKey(characterId: string) {
  return `characterPosActive:${characterId}`;
}
export function dialogueTrackKey() {
  return "dialogue";
}
export function audioFxTrackKey() {
  return "audiofx";
}
export function eventTrackKey() {
  return "event";
}

export const EVENT_KIND_LABEL: Record<CutsceneEventKind, string> = {
  setFlag: "Флаг",
  teleport: "Телепорт",
  spawnObject: "Создать объект",
  destroyObject: "Удалить объект",
  startBattle: "Начать бой",
  runScript: "Скрипт",
};

// One registered keyframe channel row -- everything the marquee/group-drag/delete logic needs to
// read and write that row's keys, keyed by the same row-key strings used for hidden/locked track
// state (cameraPosXKey(), characterPosYKey(id), ...).
interface ChannelReg {
  keys: Keyframe[];
  setKeys: (next: Keyframe[]) => void;
  makeRef: (id: string) => ClipRef;
}

function rowKeyForRef(ref: ClipRef): string | undefined {
  if (ref.trackKind === "cameraKey") return ref.channel === "x" ? cameraPosXKey() : ref.channel === "y" ? cameraPosYKey() : cameraZoomKey();
  if (ref.trackKind === "characterKey")
    return ref.axis === "x" ? characterPosXKey(ref.characterId) : ref.axis === "y" ? characterPosYKey(ref.characterId) : characterPosActiveKey(ref.characterId);
  return undefined;
}

export function CutsceneTimeline({
  entry,
  t,
  onScrub,
  selected,
  onSelect,
  hiddenTracks,
  lockedTracks,
  onToggleHidden,
  onToggleLocked,
}: {
  entry: Entry;
  t: number;
  onScrub: (ms: number) => void;
  selected: ClipRef | null;
  onSelect: (ref: ClipRef | null) => void;
  hiddenTracks: Set<string>;
  lockedTracks: Set<string>;
  onToggleHidden: (key: string) => void;
  onToggleLocked: (key: string) => void;
}) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const boundMap = allEntries.find((e) => e.id === entry.cutsceneMapId);
  const mapCenterCell = boundMap?.map ? { x: boundMap.map.width / 2, y: boundMap.map.height / 2 } : { x: 0, y: 0 };

  const [pxPerMs, setPxPerMs] = useState(0.08);
  // Collapsing the whole "Персонажи" group is a purely visual/session convenience (like
  // collapsing a folder) -- not persisted, matches the mockup's Characters > Name grouping idea
  // without needing a real generic nested-track-folder system. Collapsing the Camera group or ONE
  // individual character (collapsedObjects) is finer-grained -- hides just that object's own
  // X/Y/Zoom/Animation sub-rows so a busy cast doesn't force the whole timeline to keep growing.
  const [charsCollapsed, setCharsCollapsed] = useState(false);
  const [collapsedObjects, setCollapsedObjects] = useState<Set<string>>(new Set());
  const toggleObjectCollapsed = (key: string) =>
    setCollapsedObjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Snap-to-frame is an editing-session convenience (like pxPerMs zoom) rather than persisted
  // project data -- when on, dragging/resizing a clip OR keyframe rounds its time to the nearest
  // whole-frame boundary (1000/fps ms) instead of an arbitrary pixel-derived ms value.
  const [snapToFrame, setSnapToFrame] = useState(true);
  const laneAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // DOM element for every currently-rendered channel row, keyed by its row-key string -- used to
  // hit-test the marquee box against each row's live on-screen vertical extent.
  const channelRowEls = useRef(new Map<string, HTMLDivElement>());
  const fps = entry.cutsceneFps ?? 60;
  const frameMs = 1000 / fps;
  const snap = (ms: number) => (snapToFrame ? Math.round(ms / frameMs) * frameMs : ms);

  const totalMs = cutsceneTotalDurationMs(entry);
  const timelineWidth = Math.max(400, totalMs * pxPerMs + 120);

  const cast = entry.cutsceneCast ?? [];
  const tracks = entry.cutsceneTracks ?? [];
  const cameraClips = trackClips(tracks, "camera");
  const dlgClips = trackClips(tracks, "dialogue");
  const fxClips = trackClips(tracks, "audiofx");
  const evtClips = trackClips(tracks, "event");
  const markers = entry.cutsceneMarkers ?? [];
  const charColors = entry.cutsceneCharacterTrackColors ?? {};
  const camPosX = entry.cutsceneCameraPosX ?? [];
  const camPosY = entry.cutsceneCameraPosY ?? [];
  const camZoom = entry.cutsceneCameraZoomKeys ?? [];
  const charPosKeys = entry.cutsceneCharacterPositionKeys ?? [];

  const setTracks = (next: typeof tracks) => updateEntry(entry.id, { cutsceneTracks: next });
  const setClipsFor = (kind: CutsceneTrackKind, clips: CutsceneClip[], characterId?: string) =>
    setTracks(withTrackClips(tracks, kind, clips, characterId));
  const setCharColor = (characterId: string, color: string) =>
    updateEntry(entry.id, { cutsceneCharacterTrackColors: { ...charColors, [characterId]: color } });

  // Marquee/rubber-band multi-select over KEYFRAMES only (clip bars keep their existing single-
  // select), same interaction as DialogueCanvas's node marquee: left-drag on empty channel-row
  // background draws a box in content-local (scroll-independent) coordinates; every key whose
  // time falls in the box's ms range AND whose row vertically overlaps it gets selected live as
  // the box grows. `boxSelection` is also what a *single* keyframe click sets (as a one-element
  // array) so Delete/Backspace and group-drag work uniformly whether one key or many are selected.
  const [marqueeBox, setMarqueeBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [boxSelection, setBoxSelection] = useState<ClipRef[]>([]);

  const addMarker = async () => {
    const label = await themedPrompt("Название маркера", "");
    if (label === null) return;
    updateEntry(entry.id, { cutsceneMarkers: [...markers, { id: nextId("marker"), atMs: Math.round(t), label: label || "Маркер" }] });
  };
  const removeMarker = (id: string) => updateEntry(entry.id, { cutsceneMarkers: markers.filter((m) => m.id !== id) });

  // Splits a clip at time `at`, keeping its component untouched on both halves -- works
  // identically across every clip kind now that they all share the same startMs/durationMs shape
  // (previously dialogue/audiofx used a separate atMs+optional-durationMs convention).
  function splitClip(clips: CutsceneClip[], clipId: string, at: number): CutsceneClip[] | null {
    const idx = clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return null;
    const c = clips[idx];
    if (at <= c.startMs || at >= c.startMs + c.durationMs) return null;
    const first = { ...c, durationMs: at - c.startMs };
    const second = { ...c, id: nextId("split"), startMs: at, durationMs: c.startMs + c.durationMs - at };
    const next = [...clips];
    next.splice(idx, 1, first, second);
    return next;
  }

  const splitSelected = () => {
    if (!selected) return;
    if (selected.trackKind === "camera") {
      const next = splitClip(cameraClips, selected.id, t);
      if (next) setClipsFor("camera", next);
    } else if (selected.trackKind === "character") {
      const found = findClipAnywhere(tracks, "character", selected.id);
      if (!found) return;
      const next = splitClip(found.track.clips, selected.id, t);
      if (next) setClipsFor("character", next, found.track.characterId);
    } else if (selected.trackKind === "dialogue") {
      const next = splitClip(dlgClips, selected.id, t);
      if (next) setClipsFor("dialogue", next);
    } else if (selected.trackKind === "audiofx") {
      const next = splitClip(fxClips, selected.id, t);
      if (next) setClipsFor("audiofx", next);
    } else if (selected.trackKind === "event") {
      const next = splitClip(evtClips, selected.id, t);
      if (next) setClipsFor("event", next);
    }
  };

  const canSplit = (() => {
    if (!selected) return false;
    let clip: CutsceneClip | undefined;
    if (selected.trackKind === "camera") clip = cameraClips.find((c) => c.id === selected.id);
    else if (selected.trackKind === "character") clip = findClipAnywhere(tracks, "character", selected.id)?.clip;
    else if (selected.trackKind === "dialogue") clip = dlgClips.find((c) => c.id === selected.id);
    else if (selected.trackKind === "audiofx") clip = fxClips.find((c) => c.id === selected.id);
    else if (selected.trackKind === "event") clip = evtClips.find((c) => c.id === selected.id);
    return !!clip && t > clip.startMs && t < clip.startMs + clip.durationMs;
  })();

  // Always creates a brand-new cast INSTANCE, even for an entryId already placed elsewhere in
  // the cast -- this is what makes adding the same character/object/item twice ("даже
  // дублированно") work without any special-casing: each instance gets its own independent
  // track/keys/color, keyed by its own instanceId (see CutsceneCastMember in types/database.ts).
  const addCastMember = (entryId: string | undefined) => {
    if (!entryId) return;
    const { cast: nextCast, instanceId } = addCastMemberToList(cast, entryId);
    updateEntry(entry.id, {
      cutsceneCast: nextCast,
      cutsceneTracks: ensureCharacterTrack(tracks, instanceId),
    });
  };
  const removeCastMember = (instanceId: string) => {
    updateEntry(entry.id, {
      cutsceneCast: removeCastMemberFromList(cast, instanceId),
      cutsceneTracks: removeCharacterTrack(tracks, instanceId),
      cutsceneCharacterPositionKeys: charPosKeys.filter((k) => k.characterId !== instanceId),
    });
    if (
      (selected?.trackKind === "character" && findClipAnywhere(tracks, "character", selected.id)?.track.characterId === instanceId) ||
      (selected?.trackKind === "characterKey" && selected.characterId === instanceId)
    ) {
      onSelect(null);
    }
  };

  const msFromClientX = (clientX: number) => {
    const rect = laneAreaRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const scrollLeft = laneAreaRef.current?.scrollLeft ?? 0;
    return Math.max(0, (clientX - rect.left + scrollLeft) / pxPerMs);
  };

  const scrubStart = (e: React.MouseEvent) => {
    e.preventDefault(); // otherwise the browser starts a native text-selection drag on mousedown
    onScrub(msFromClientX(e.clientX));
    const onMove = (ev: MouseEvent) => onScrub(msFromClientX(ev.clientX));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Shared drag/resize starter for every CLIP block below -- mirrors the mousedown-then-window-
  // listeners pattern from MapEditorModal's brush stroke handling (onStrokeStart/onMove/onEnd).
  const startClipDrag = (
    e: React.MouseEvent,
    mode: "move" | "resize",
    origStart: number,
    origDur: number,
    onChange: (p: { start?: number; dur?: number }) => void
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => {
      const deltaMs = (ev.clientX - startX) / pxPerMs;
      if (mode === "move") onChange({ start: Math.max(0, Math.round(snap(origStart + deltaMs))) });
      else onChange({ dur: Math.max(50, Math.round(snap(origDur + deltaMs))) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Dragging a single KEYFRAME diamond only ever changes WHEN it happens, never its value --
  // value is edited in the Inspector (or by dragging the actual object/camera on the live preview
  // stage).
  const startKeyDrag = (e: React.MouseEvent, origAtMs: number, onChange: (atMs: number) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => {
      const deltaMs = (ev.clientX - startX) / pxPerMs;
      onChange(Math.max(0, Math.round(snap(origAtMs + deltaMs))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Dragging any diamond that's part of a multi-key box selection moves EVERY selected key by the
  // same delta, each relative to its own original time -- so the whole group keeps its shape
  // instead of collapsing onto the one you grabbed.
  const startGroupKeyDrag = (e: React.MouseEvent, registry: Record<string, ChannelReg>, group: ClipRef[]) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origins: { ref: ClipRef; atMs: number }[] = [];
    for (const ref of group) {
      const rowKey = rowKeyForRef(ref);
      const reg = rowKey ? registry[rowKey] : undefined;
      const key = reg?.keys.find((k) => "id" in ref && k.id === ref.id);
      if (reg && key) origins.push({ ref, atMs: key.atMs });
    }
    // Calling each row's own reg.setKeys(...) independently here used to be the culprit behind
    // "some selected keys don't move": every row's setKeys (e.g. setAxisKeys) recomputes its
    // "everything except this row" slice from the SAME shared render-time snapshot
    // (camPosX/camPosY/charPosKeys/...), so when a single drag tick touches more than one row
    // (e.g. X keys AND Y keys selected together, or an X key and a Y key from two different
    // characters), each row's updateEntry call overwrites the entry with a patch computed
    // BEFORE the previous row's call landed -- only the last row processed in a tick actually
    // kept its new position, every other row silently snapped back. Fixed by computing every
    // affected top-level field's next array in one pass and writing them all in ONE updateEntry
    // call per tick instead.
    const applyToArray = <K extends { id: string; atMs: number }>(arr: K[], items: { id: string; atMs: number }[] | undefined, deltaMs: number): K[] => {
      if (!items || items.length === 0) return arr;
      const origMap = new Map(items.map((i) => [i.id, i.atMs]));
      return arr.map((k) => (origMap.has(k.id) ? { ...k, atMs: Math.max(0, Math.round(snap(origMap.get(k.id)! + deltaMs))) } : k));
    };
    const apply = (deltaMs: number) => {
      const byRow = new Map<string, { id: string; atMs: number }[]>();
      for (const o of origins) {
        const rowKey = rowKeyForRef(o.ref);
        if (!rowKey || !("id" in o.ref)) continue;
        if (!byRow.has(rowKey)) byRow.set(rowKey, []);
        byRow.get(rowKey)!.push({ id: o.ref.id, atMs: o.atMs });
      }

      const patch: { cutsceneCameraPosX?: Keyframe[]; cutsceneCameraPosY?: Keyframe[]; cutsceneCameraZoomKeys?: Keyframe[]; cutsceneCharacterPositionKeys?: CharacterPositionKeyframe[] } = {};

      const camXItems = byRow.get(cameraPosXKey());
      if (camXItems) patch.cutsceneCameraPosX = applyToArray(camPosX, camXItems, deltaMs);
      const camYItems = byRow.get(cameraPosYKey());
      if (camYItems) patch.cutsceneCameraPosY = applyToArray(camPosY, camYItems, deltaMs);
      const camZoomItems = byRow.get(cameraZoomKey());
      if (camZoomItems) patch.cutsceneCameraZoomKeys = applyToArray(camZoom, camZoomItems, deltaMs);

      // Every character row (X/Y/Активен, for every cast member) shares ONE combined array
      // field (cutsceneCharacterPositionKeys), so all their touched ids merge into a single
      // next-array computed in one shot, rather than one updateEntry call per row/axis.
      const charRowKeys = [...byRow.keys()].filter(
        (rk) => rk.startsWith("characterPosX:") || rk.startsWith("characterPosY:") || rk.startsWith("characterPosActive:")
      );
      if (charRowKeys.length > 0) {
        const allItems: { id: string; atMs: number }[] = [];
        for (const rk of charRowKeys) allItems.push(...byRow.get(rk)!);
        patch.cutsceneCharacterPositionKeys = applyToArray(charPosKeys, allItems, deltaMs);
      }

      if (Object.keys(patch).length > 0) updateEntry(entry.id, patch);
    };
    const onMove = (ev: MouseEvent) => apply((ev.clientX - startX) / pxPerMs);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Marquee drag: mousedown directly on a channel row's own empty background (never fires when
  // the mousedown target is a child element like a keyframe diamond, since those call
  // stopPropagation on their own onMouseDown already, and this also double-checks via the
  // target===currentTarget guard) starts a rubber-band box in content-local coordinates --
  // content-local because contentRef IS the horizontally-scrolled element itself, so subtracting
  // its own live bounding rect automatically accounts for scroll position with no extra math.
  const startMarquee = (e: React.MouseEvent, registry: Record<string, ChannelReg>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const contentRect = contentRef.current?.getBoundingClientRect();
    if (!contentRect) return;
    e.preventDefault();
    onSelect(null);
    const startX = e.clientX - contentRect.left;
    const startY = e.clientY - contentRect.top;
    const initial = { x0: startX, y0: startY, x1: startX, y1: startY };

    const compute = (box: typeof initial): ClipRef[] => {
      const minX = Math.min(box.x0, box.x1);
      const maxX = Math.max(box.x0, box.x1);
      const minY = Math.min(box.y0, box.y1);
      const maxY = Math.max(box.y0, box.y1);
      const minMs = minX / pxPerMs;
      const maxMs = maxX / pxPerMs;
      const picked: ClipRef[] = [];
      channelRowEls.current.forEach((el, rowKey) => {
        if (lockedTracks.has(rowKey)) return;
        const r = el.getBoundingClientRect();
        const top = r.top - contentRect.top;
        const bottom = r.bottom - contentRect.top;
        if (bottom < minY || top > maxY) return;
        const reg = registry[rowKey];
        if (!reg) return;
        for (const k of reg.keys) {
          if (k.atMs >= minMs && k.atMs <= maxMs) picked.push(reg.makeRef(k.id));
        }
      });
      return picked;
    };

    setMarqueeBox(initial);
    setBoxSelection(compute(initial));
    const onMove = (ev: MouseEvent) => {
      const next = { ...initial, x1: ev.clientX - contentRect.left, y1: ev.clientY - contentRect.top };
      setMarqueeBox(next);
      setBoxSelection(compute(next));
    };
    const onUp = () => {
      setMarqueeBox(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const ticks = useMemo(() => {
    const arr: { ms: number; label: string }[] = [];
    const MAX_TICKS = 1000;
    let stepMs = pxPerMs > 0.25 ? 500 : pxPerMs > 0.1 ? 1000 : pxPerMs > 0.04 ? 2000 : 5000;
    if (totalMs / stepMs > MAX_TICKS) stepMs = totalMs / MAX_TICKS;
    for (let ms = 0; ms <= totalMs + stepMs; ms += stepMs) {
      arr.push({ ms, label: `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` });
    }
    return arr;
  }, [totalMs, pxPerMs]);

  const renderClip = (
    key: string,
    ref: ClipRef,
    startMs: number,
    durationMs: number,
    label: string,
    color: string,
    resizable: boolean,
    locked: boolean,
    onChange: (p: { start?: number; dur?: number }) => void
  ) => {
    const isSel = selected?.trackKind === ref.trackKind && "id" in selected && selected.id === (ref as { id: string }).id;
    return (
      <div
        key={key}
        onMouseDown={(e) => {
          onSelect(ref);
          setBoxSelection([]);
          if (!locked) startClipDrag(e, "move", startMs, durationMs, onChange);
        }}
        className={`absolute top-1 bottom-1 rounded-md px-1.5 flex items-center text-[10px] text-white overflow-hidden select-none ${
          locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
        } ${isSel ? "ring-2 ring-white" : ""}`}
        style={{ left: startMs * pxPerMs, width: Math.max(8, durationMs * pxPerMs), background: color }}
        title={label}
      >
        <span className="truncate pointer-events-none">{label}</span>
        {resizable && !locked && (
          <div
            onMouseDown={(e) => {
              onSelect(ref);
              setBoxSelection([]);
              startClipDrag(e, "resize", startMs, durationMs, onChange);
            }}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/25 hover:bg-white/40"
          />
        )}
      </div>
    );
  };

  // A single diamond keyframe marker -- rotated square, centered on its atMs. Dragging moves it
  // in TIME only; if it's part of a multi-key box selection, dragging it moves the whole group
  // instead (see startGroupKeyDrag).
  const renderKeyframe = (
    keyStr: string,
    ref: ClipRef,
    atMs: number,
    color: string,
    locked: boolean,
    onDrag: (atMs: number) => void,
    registry: Record<string, ChannelReg>
  ) => {
    const inBoxSelection = boxSelection.some((r) => "id" in r && "id" in ref && r.id === ref.id);
    const isSel = (selected?.trackKind === ref.trackKind && "id" in selected && "id" in ref && selected.id === ref.id) || inBoxSelection;
    return (
      <div
        key={keyStr}
        onMouseDown={(e) => {
          e.stopPropagation();
          const groupDrag = inBoxSelection && boxSelection.length > 1;
          if (!groupDrag) {
            onSelect(ref);
            setBoxSelection([ref]);
          }
          if (locked) return;
          if (groupDrag) startGroupKeyDrag(e, registry, boxSelection);
          else startKeyDrag(e, atMs, onDrag);
        }}
        title={`${(atMs / 1000).toFixed(2)}s`}
        className={`absolute top-1/2 select-none ${locked ? "cursor-not-allowed" : "cursor-ew-resize"}`}
        style={{
          left: atMs * pxPerMs - DIAMOND / 2,
          width: DIAMOND,
          height: DIAMOND,
          marginTop: -DIAMOND / 2,
          background: color,
          transform: "rotate(45deg)",
          border: isSel ? "1.5px solid white" : "1px solid rgba(0,0,0,0.3)",
          borderRadius: 2,
          boxShadow: inBoxSelection ? "0 0 0 2px var(--accent, #8b7bff)" : undefined,
        }}
      />
    );
  };

  const headerToggleButtons = (key: string) => {
    const hidden = hiddenTracks.has(key);
    const locked = lockedTracks.has(key);
    return (
      <>
        <button
          onClick={() => onToggleHidden(key)}
          title={hidden ? "Показать в превью" : "Скрыть из превью"}
          className={`shrink-0 ${hidden ? "opacity-30" : "opacity-60 hover:opacity-100"}`}
        >
          {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
        <button
          onClick={() => onToggleLocked(key)}
          title={locked ? "Разблокировать дорожку" : "Заблокировать дорожку от изменений"}
          className={`shrink-0 ${locked ? "text-accent opacity-80" : "opacity-40 hover:opacity-100"}`}
        >
          {locked ? <Lock size={10} /> : <Unlock size={10} />}
        </button>
      </>
    );
  };

  const renderTrackHeader = (key: string, label: string, indent = false) => (
    <div
      key={key}
      style={{ height: LANE_H }}
      className={`flex items-center gap-1.5 ${indent ? "pl-5" : "px-2"} pr-2 text-[10px] text-[var(--op-50)] border-t border-[var(--op-7)]`}
    >
      {headerToggleButtons(key)}
      <span className="truncate select-none">{label}</span>
    </div>
  );

  // Collapsible group header row (Камера / one character's name) -- a chevron toggling whether
  // that object's own X/Y/Zoom/Animation sub-rows are shown at all, independent of the master
  // "Персонажи" group collapse (which folds every character at once).
  const renderObjectHeader = (objectKey: string, content: React.ReactNode) => {
    const collapsed = collapsedObjects.has(objectKey);
    return (
      <div
        style={{ height: LANE_H }}
        className="flex items-center gap-1 px-1 border-t border-[var(--op-7)] cursor-pointer select-none"
        onClick={() => toggleObjectCollapsed(objectKey)}
        title={collapsed ? "Развернуть каналы" : "Свернуть каналы"}
      >
        <span className="shrink-0 text-[var(--op-45)]">{collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}</span>
        <div className="flex-1 min-w-0">{content}</div>
      </div>
    );
  };

  // Shared row for a keyframe channel lane (camera X/Y/zoom or one character's X/Y) -- handles
  // both the header cell AND the lane cell for a given Keyframe[] array + setter, so camera and
  // character channels can reuse the exact same rendering/interaction code. Also registers the
  // row's ChannelReg (for marquee/group-drag/delete) and its live DOM element (for marquee hit
  // testing) into the maps passed in.
  const renderChannelRow = (
    trackKeyStr: string,
    label: string,
    keys: Keyframe[],
    setKeys: (next: Keyframe[]) => void,
    makeRef: (id: string) => ClipRef,
    color: string,
    defaultValue: number,
    registry: Record<string, ChannelReg>,
    indent = false
  ) => {
    registry[trackKeyStr] = { keys, setKeys, makeRef };
    const locked = lockedTracks.has(trackKeyStr);
    const header = renderTrackHeader(trackKeyStr, label, indent);
    const lane = (
      <div
        key={trackKeyStr}
        ref={(el) => {
          if (el) channelRowEls.current.set(trackKeyStr, el);
          else channelRowEls.current.delete(trackKeyStr);
        }}
        style={{ height: LANE_H }}
        className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(trackKeyStr) ? "opacity-40" : ""}`}
        onMouseDown={(e) => startMarquee(e, registry)}
        onDoubleClick={(e) => {
          if (locked) return;
          const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
          // Default to whatever this channel already resolves to at this time -- don't jump.
          const value = resolveChannel(keys, ms, defaultValue);
          setKeys([...keys, { id: nextId("key"), atMs: ms, value }]);
        }}
      >
        {keys.map((k) => renderKeyframe(k.id, makeRef(k.id), k.atMs, color, locked, (atMs) => setKeys(keys.map((kk) => (kk.id === k.id ? { ...kk, atMs } : kk))), registry))}
      </div>
    );
    return { header, lane };
  };

  // Delete/Backspace removes every key in the current box selection (works for both a single
  // click-selected key and a real multi-key marquee selection, since both populate boxSelection
  // the same way) -- skipped while focus is inside a text input/textarea so normal text editing
  // elsewhere in the app is unaffected.
  useEffect(() => {
    if (boxSelection.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      e.preventDefault();
      const byRow = new Map<string, Set<string>>();
      for (const ref of boxSelection) {
        const rowKey = rowKeyForRef(ref);
        if (!rowKey || !("id" in ref)) continue;
        if (!byRow.has(rowKey)) byRow.set(rowKey, new Set());
        byRow.get(rowKey)!.add(ref.id);
      }
      if (byRow.has(cameraPosXKey())) updateEntry(entry.id, { cutsceneCameraPosX: camPosX.filter((k) => !byRow.get(cameraPosXKey())!.has(k.id)) });
      if (byRow.has(cameraPosYKey())) updateEntry(entry.id, { cutsceneCameraPosY: camPosY.filter((k) => !byRow.get(cameraPosYKey())!.has(k.id)) });
      if (byRow.has(cameraZoomKey())) updateEntry(entry.id, { cutsceneCameraZoomKeys: camZoom.filter((k) => !byRow.get(cameraZoomKey())!.has(k.id)) });
      const charRowKeys = [...byRow.keys()].filter(
        (rk) => rk.startsWith("characterPosX:") || rk.startsWith("characterPosY:") || rk.startsWith("characterPosActive:")
      );
      if (charRowKeys.length > 0) {
        const idsToDelete = new Set<string>();
        byRow.forEach((ids, rk) => {
          if (rk.startsWith("characterPosX:") || rk.startsWith("characterPosY:") || rk.startsWith("characterPosActive:")) ids.forEach((id) => idsToDelete.add(id));
        });
        updateEntry(entry.id, { cutsceneCharacterPositionKeys: charPosKeys.filter((k) => !idsToDelete.has(k.id)) });
      }
      setBoxSelection([]);
      onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxSelection, camPosX, camPosY, camZoom, charPosKeys]);

  const registry: Record<string, ChannelReg> = {};

  const camPosXRow = renderChannelRow(
    cameraPosXKey(),
    "X",
    camPosX,
    (next) => updateEntry(entry.id, { cutsceneCameraPosX: next }),
    (id) => ({ trackKind: "cameraKey", channel: "x", id }),
    TRACK_COLOR.camera,
    mapCenterCell.x,
    registry,
    true
  );
  const camPosYRow = renderChannelRow(
    cameraPosYKey(),
    "Y",
    camPosY,
    (next) => updateEntry(entry.id, { cutsceneCameraPosY: next }),
    (id) => ({ trackKind: "cameraKey", channel: "y", id }),
    TRACK_COLOR.camera,
    mapCenterCell.y,
    registry,
    true
  );
  const camZoomRow = renderChannelRow(
    cameraZoomKey(),
    "Zoom",
    camZoom,
    (next) => updateEntry(entry.id, { cutsceneCameraZoomKeys: next }),
    (id) => ({ trackKind: "cameraKey", channel: "zoom", id }),
    TRACK_COLOR.camera,
    1,
    registry,
    true
  );
  const cameraCollapsed = collapsedObjects.has(cameraTrackKey());

  return (
    <div className="glass rounded-lg p-4 space-y-2 select-none">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)] flex-1">Таймлайн</div>
        <button
          onClick={() => setPxPerMs((z) => Math.max(MIN_PX_PER_MS, z * 0.8))}
          className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] text-xs"
        >
          −
        </button>
        <button
          onClick={() => setPxPerMs((z) => Math.min(MAX_PX_PER_MS, z * 1.25))}
          className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] text-xs"
        >
          +
        </button>
        <div className="w-64">
          <SearchSelect
            value={undefined}
            onChange={addCastMember}
            options={allEntries
              .filter((e) => e.category === "character" || e.category === "object" || e.category === "item")
              .map((e) => ({
                id: e.id,
                label: e.name,
                sublabel: e.category === "character" ? "Персонаж" : e.category === "object" ? "Объект" : "Предмет",
              }))}
            placeholder="+ Добавить модуль…"
            searchPlaceholder="Поиск персонажа/объекта/предмета…"
            allowClear={false}
          />
        </div>
        <button
          onClick={addMarker}
          title="Добавить маркер в текущей позиции плейхеда"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-55)]"
        >
          <Flag size={11} /> Маркер
        </button>
        <button
          onClick={splitSelected}
          disabled={!canSplit}
          title="Разрезать выбранный клип по текущей позиции плейхеда"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-55)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Scissors size={11} /> Разрезать
        </button>
        <button
          onClick={() => setSnapToFrame((v) => !v)}
          title={`Привязка к кадру (${fps} FPS): ${snapToFrame ? "включена" : "выключена"}`}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md glass hover:bg-[var(--op-10)] ${
            snapToFrame ? "text-accent" : "text-[var(--op-40)]"
          }`}
        >
          <Magnet size={11} /> Привязка к кадру
        </button>
      </div>

      <div className="flex border border-[var(--op-10)] rounded-md overflow-hidden">
        <div className="shrink-0 bg-[var(--op-4)] border-r border-[var(--op-10)]" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} />
          {renderObjectHeader(cameraTrackKey(), <span className="truncate select-none">Камера</span>)}
          {!cameraCollapsed && (
            <>
              {renderTrackHeader(cameraTrackKey(), "Тряска", true)}
              {camPosXRow.header}
              {camPosYRow.header}
              {camZoomRow.header}
            </>
          )}
          {cast.length > 0 && (
            <div
              style={{ height: LANE_H }}
              className="flex items-center gap-1 px-2 text-[10px] text-[var(--op-45)] border-t border-[var(--op-7)] cursor-pointer hover:text-[var(--op-70)] select-none"
              onClick={() => setCharsCollapsed((v) => !v)}
            >
              {charsCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              <span className="truncate flex-1">Персонажи ({cast.length})</span>
            </div>
          )}
          {!charsCollapsed &&
            cast.map((member) => {
              const charId = member.instanceId;
              const label = castLabel(cast, allEntries, charId);
              const objCollapsed = collapsedObjects.has(characterTrackKey(charId));
              return (
                <div key={charId}>
                  {renderObjectHeader(
                    characterTrackKey(charId),
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={charColors[charId] ?? TRACK_COLOR.character}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setCharColor(charId, e.target.value)}
                        title="Цвет дорожки"
                        className="w-3.5 h-3.5 rounded-sm border-0 bg-transparent shrink-0 cursor-pointer p-0"
                      />
                      <span className="truncate flex-1 font-medium select-none" title={label}>
                        {label}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCastMember(charId);
                        }}
                        title="Убрать из состава катсцены (не путать со скрытием через ключи «Активен»)"
                        className="opacity-40 hover:opacity-100 shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                  {!objCollapsed && (
                    <>
                      {renderTrackHeader(characterPosXKey(charId), "X", true)}
                      {renderTrackHeader(characterPosYKey(charId), "Y", true)}
                      {renderTrackHeader(characterPosActiveKey(charId), "Активен", true)}
                      {renderTrackHeader(characterTrackKey(charId), "Анимация", true)}
                    </>
                  )}
                </div>
              );
            })}
          {renderTrackHeader(dialogueTrackKey(), "Диалоги")}
          {renderTrackHeader(audioFxTrackKey(), "Аудио/FX")}
          {renderTrackHeader(eventTrackKey(), "События")}
        </div>

        <div
          ref={laneAreaRef}
          className="flex-1 overflow-x-auto relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            // Dropping an actor (character/object/item) directly onto the timeline -- rather than
            // the preview stage -- creates its track AND a single "Активен" appear-key at
            // whichever moment in time the cursor landed on, so the object shows up on stage
            // starting exactly there instead of being present for the whole cutscene. This is
            // the drag-and-drop replacement for a "create object" button (see the doc comment on
            // Entry.cutsceneCast for why a hard create/delete button doesn't make sense here).
            const entryId = e.dataTransfer.getData(ACTOR_DRAG_MIME);
            if (!entryId) return;
            const ms = Math.max(0, Math.round(snap(msFromClientX(e.clientX))));
            const { cast: nextCast, instanceId } = addCastMemberToList(cast, entryId);
            updateEntry(entry.id, {
              cutsceneCast: nextCast,
              cutsceneTracks: ensureCharacterTrack(tracks, instanceId),
              cutsceneCharacterPositionKeys: [...charPosKeys, { id: nextId("ckey"), characterId: instanceId, axis: "active", atMs: ms, value: 1 }],
            });
          }}
        >
          <div ref={contentRef} style={{ width: timelineWidth, position: "relative" }}>
            <div onMouseDown={scrubStart} style={{ height: RULER_H }} className="relative border-b border-[var(--op-10)] cursor-pointer bg-[var(--op-3)] select-none">
              {ticks.map((tick) => (
                <div
                  key={tick.ms}
                  className="absolute top-0 bottom-0 border-l border-[var(--op-10)] text-[9px] text-[var(--op-30)] pl-1"
                  style={{ left: tick.ms * pxPerMs }}
                >
                  {tick.label}
                </div>
              ))}
              {markers.map((m) => (
                <button
                  key={m.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onScrub(m.atMs)}
                  onDoubleClick={async (e) => {
                    e.stopPropagation();
                    const label = await themedPrompt("Название маркера (пусто -- удалить)", m.label);
                    if (label === null) return;
                    if (label === "") removeMarker(m.id);
                    else updateEntry(entry.id, { cutsceneMarkers: markers.map((mm) => (mm.id === m.id ? { ...mm, label } : mm)) });
                  }}
                  title={`${m.label} (${(m.atMs / 1000).toFixed(1)}s) -- двойной клик: переименовать/удалить`}
                  className="absolute top-0 flex items-center gap-0.5 text-[9px] text-amber-200 hover:text-amber-100 z-10"
                  style={{ left: m.atMs * pxPerMs }}
                >
                  <Flag size={10} className="fill-amber-400/70 shrink-0" />
                  <span className="truncate max-w-[70px]">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Spacer aligning with the "Камера" object-header row (renderObjectHeader) in the
                label column, which has no clips/keys of its own -- without this, every row below
                would render one row too high relative to its header, the exact bug reported after
                v72 (X/Y keys appearing to sit on the name/X rows above where they belong). */}
            <div style={{ height: LANE_H }} className="border-t border-[var(--op-7)]" />
            {!cameraCollapsed && (
              <>
                <div
                  style={{ height: LANE_H }}
                  className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(cameraTrackKey()) ? "opacity-40" : ""}`}
                  onDoubleClick={(e) => {
                    if (lockedTracks.has(cameraTrackKey())) return;
                    const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                    setClipsFor("camera", [...cameraClips, { id: nextId("cam"), startMs: ms, durationMs: 1000, component: { kind: "shake" } }]);
                  }}
                >
                  {cameraClips.map((c) =>
                    renderClip(
                      c.id,
                      { trackKind: "camera", id: c.id },
                      c.startMs,
                      c.durationMs,
                      "Тряска",
                      TRACK_COLOR.camera,
                      true,
                      lockedTracks.has(cameraTrackKey()),
                      (p) =>
                        setClipsFor(
                          "camera",
                          cameraClips.map((cc) =>
                            cc.id === c.id
                              ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                              : cc
                          )
                        )
                    )
                  )}
                </div>
                {camPosXRow.lane}
                {camPosYRow.lane}
                {camZoomRow.lane}
              </>
            )}

            {cast.length > 0 && <div style={{ height: LANE_H }} className="border-t border-[var(--op-7)]" />}

            {!charsCollapsed &&
              cast.map((member) => {
                const charId = member.instanceId;
                const label = castLabel(cast, allEntries, charId);
                const clips = trackClips(tracks, "character", charId);
                const color = charColors[charId] ?? TRACK_COLOR.character;
                const xKeys = charPosKeys.filter((k) => k.characterId === charId && k.axis === "x");
                const yKeys = charPosKeys.filter((k) => k.characterId === charId && k.axis === "y");
                const activeKeys = charPosKeys.filter((k) => k.characterId === charId && k.axis === "active");
                const setAxisKeys = (axis: CharacterPositionAxis, next: Keyframe[]) => {
                  const others = charPosKeys.filter((k) => !(k.characterId === charId && k.axis === axis));
                  updateEntry(entry.id, {
                    cutsceneCharacterPositionKeys: [
                      ...others,
                      ...next.map((k) => ({ ...k, characterId: charId, axis })),
                    ],
                  });
                };
                const xLocked = lockedTracks.has(characterPosXKey(charId));
                const yLocked = lockedTracks.has(characterPosYKey(charId));
                const activeLocked = lockedTracks.has(characterPosActiveKey(charId));
                registry[characterPosXKey(charId)] = { keys: xKeys, setKeys: (next) => setAxisKeys("x", next), makeRef: (id) => ({ trackKind: "characterKey", characterId: charId, axis: "x", id }) };
                registry[characterPosYKey(charId)] = { keys: yKeys, setKeys: (next) => setAxisKeys("y", next), makeRef: (id) => ({ trackKind: "characterKey", characterId: charId, axis: "y", id }) };
                registry[characterPosActiveKey(charId)] = {
                  keys: activeKeys,
                  setKeys: (next) => setAxisKeys("active", next),
                  makeRef: (id) => ({ trackKind: "characterKey", characterId: charId, axis: "active", id }),
                };
                const objCollapsed = collapsedObjects.has(characterTrackKey(charId));
                return (
                  <div key={charId}>
                    <div style={{ height: LANE_H }} className="border-t border-[var(--op-7)]" />
                    {!objCollapsed && (
                      <>
                        <div
                          ref={(el) => {
                            if (el) channelRowEls.current.set(characterPosXKey(charId), el);
                            else channelRowEls.current.delete(characterPosXKey(charId));
                          }}
                          style={{ height: LANE_H }}
                          className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(characterPosXKey(charId)) ? "opacity-40" : ""}`}
                          onMouseDown={(e) => startMarquee(e, registry)}
                          onDoubleClick={(e) => {
                            if (xLocked) return;
                            const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                            const value = resolveChannel(xKeys, ms, mapCenterCell.x);
                            setAxisKeys("x", [...xKeys, { id: nextId("ckey"), atMs: ms, value }]);
                          }}
                        >
                          {xKeys.map((k) =>
                            renderKeyframe(
                              k.id,
                              { trackKind: "characterKey", characterId: charId, axis: "x", id: k.id },
                              k.atMs,
                              color,
                              xLocked,
                              (atMs) => setAxisKeys("x", xKeys.map((kk) => (kk.id === k.id ? { ...kk, atMs } : kk))),
                              registry
                            )
                          )}
                        </div>
                        <div
                          ref={(el) => {
                            if (el) channelRowEls.current.set(characterPosYKey(charId), el);
                            else channelRowEls.current.delete(characterPosYKey(charId));
                          }}
                          style={{ height: LANE_H }}
                          className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(characterPosYKey(charId)) ? "opacity-40" : ""}`}
                          onMouseDown={(e) => startMarquee(e, registry)}
                          onDoubleClick={(e) => {
                            if (yLocked) return;
                            const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                            const value = resolveChannel(yKeys, ms, mapCenterCell.y);
                            setAxisKeys("y", [...yKeys, { id: nextId("ckey"), atMs: ms, value }]);
                          }}
                        >
                          {yKeys.map((k) =>
                            renderKeyframe(
                              k.id,
                              { trackKind: "characterKey", characterId: charId, axis: "y", id: k.id },
                              k.atMs,
                              color,
                              yLocked,
                              (atMs) => setAxisKeys("y", yKeys.map((kk) => (kk.id === k.id ? { ...kk, atMs } : kk))),
                              registry
                            )
                          )}
                        </div>
                        <div
                          ref={(el) => {
                            if (el) channelRowEls.current.set(characterPosActiveKey(charId), el);
                            else channelRowEls.current.delete(characterPosActiveKey(charId));
                          }}
                          style={{ height: LANE_H }}
                          className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(characterPosActiveKey(charId)) ? "opacity-40" : ""}`}
                          onMouseDown={(e) => startMarquee(e, registry)}
                          onDoubleClick={(e) => {
                            if (activeLocked) return;
                            const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                            // Double-click toggles: default the new key's value to the OPPOSITE
                            // of whatever this actor already resolves to at this moment, so a
                            // click on an "active" stretch adds a disappear-key and vice versa.
                            const currentlyActive = resolveActiveChannel(activeKeys, ms);
                            setAxisKeys("active", [...activeKeys, { id: nextId("ckey"), atMs: ms, value: currentlyActive ? 0 : 1 }]);
                          }}
                          title="Ключи появления/исчезновения -- двойной клик добавляет переключатель в этот момент"
                        >
                          {activeKeys.map((k) =>
                            renderKeyframe(
                              k.id,
                              { trackKind: "characterKey", characterId: charId, axis: "active", id: k.id },
                              k.atMs,
                              k.value >= 0.5 ? "#59b37a" : "#8b8b8b",
                              activeLocked,
                              (atMs) => setAxisKeys("active", activeKeys.map((kk) => (kk.id === k.id ? { ...kk, atMs } : kk))),
                              registry
                            )
                          )}
                        </div>
                        <div
                          style={{ height: LANE_H }}
                          className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(characterTrackKey(charId)) ? "opacity-40" : ""}`}
                          onDoubleClick={(e) => {
                            if (lockedTracks.has(characterTrackKey(charId))) return;
                            const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                            setClipsFor(
                              "character",
                              [...clips, { id: nextId("cclip"), startMs: ms, durationMs: 1000, component: { kind: "animation", anim: "idle" } }],
                              charId
                            );
                          }}
                        >
                          {clips.map((c) => {
                            const anim = c.component.kind === "animation" ? c.component.anim ?? "idle" : "idle";
                            return renderClip(
                              c.id,
                              { trackKind: "character", id: c.id },
                              c.startMs,
                              c.durationMs,
                              `${label} — ${anim}`,
                              color,
                              true,
                              lockedTracks.has(characterTrackKey(charId)),
                              (p) =>
                                setClipsFor(
                                  "character",
                                  clips.map((cc) =>
                                    cc.id === c.id
                                      ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                                      : cc
                                  ),
                                  charId
                                )
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

            <div
              style={{ height: LANE_H }}
              className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(dialogueTrackKey()) ? "opacity-40" : ""}`}
              onDoubleClick={(e) => {
                if (lockedTracks.has(dialogueTrackKey())) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                setClipsFor("dialogue", [...dlgClips, { id: nextId("dclip"), startMs: ms, durationMs: 3000, component: { kind: "dialogue" } }]);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (lockedTracks.has(dialogueTrackKey())) return;
                const dialogueId = e.dataTransfer.getData(DIALOGUE_DRAG_MIME);
                if (!dialogueId) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                setClipsFor("dialogue", [
                  ...dlgClips,
                  { id: nextId("dclip"), startMs: ms, durationMs: 3000, component: { kind: "dialogue", dialogueId } },
                ]);
              }}
            >
              {dlgClips.map((c) => {
                const dialogueId = c.component.kind === "dialogue" ? c.component.dialogueId : undefined;
                const d = dialogues.find((dd) => dd.id === dialogueId);
                return renderClip(
                  c.id,
                  { trackKind: "dialogue", id: c.id },
                  c.startMs,
                  c.durationMs,
                  d?.name ?? "Диалог",
                  TRACK_COLOR.dialogue,
                  true,
                  lockedTracks.has(dialogueTrackKey()),
                  (p) =>
                    setClipsFor(
                      "dialogue",
                      dlgClips.map((cc) =>
                        cc.id === c.id
                          ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                          : cc
                      )
                    )
                );
              })}
            </div>

            <div
              style={{ height: LANE_H }}
              className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(audioFxTrackKey()) ? "opacity-40" : ""}`}
              onDoubleClick={(e) => {
                if (lockedTracks.has(audioFxTrackKey())) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                setClipsFor("audiofx", [
                  ...fxClips,
                  { id: nextId("fx"), startMs: ms, durationMs: 0, component: { kind: "audio", audioKind: "sound" } },
                ]);
              }}
            >
              {fxClips.map((c) => {
                if (c.component.kind !== "audio") return null;
                const audio = c.component;
                const resizable = audio.audioKind === "fade" || audio.audioKind === "flash";
                return renderClip(
                  c.id,
                  { trackKind: "audiofx", id: c.id },
                  c.startMs,
                  resizable ? c.durationMs : 200,
                  audio.audioKind === "sound"
                    ? "Звук"
                    : audio.audioKind === "music"
                      ? "Музыка"
                      : audio.audioKind === "fade"
                        ? "Затемнение"
                        : "Вспышка",
                  TRACK_COLOR.audiofx,
                  resizable,
                  lockedTracks.has(audioFxTrackKey()),
                  (p) =>
                    setClipsFor(
                      "audiofx",
                      fxClips.map((cc) =>
                        cc.id === c.id
                          ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                          : cc
                      )
                    )
                );
              })}
            </div>

            <div
              style={{ height: LANE_H }}
              className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(eventTrackKey()) ? "opacity-40" : ""}`}
              onDoubleClick={(e) => {
                if (lockedTracks.has(eventTrackKey())) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                setClipsFor("event", [...evtClips, { id: nextId("evt"), startMs: ms, durationMs: 0, component: { kind: "event", eventKind: "setFlag" } }]);
              }}
            >
              {evtClips.map((c) => {
                if (c.component.kind !== "event") return null;
                const evt = c.component;
                return renderClip(
                  c.id,
                  { trackKind: "event", id: c.id },
                  c.startMs,
                  200,
                  EVENT_KIND_LABEL[evt.eventKind],
                  "#c95b6b",
                  false,
                  lockedTracks.has(eventTrackKey()),
                  (p) =>
                    setClipsFor(
                      "event",
                      evtClips.map((cc) =>
                        cc.id === c.id ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}) } : cc
                      )
                    )
                );
              })}
            </div>

            <div className="absolute top-0 bottom-0 w-px bg-red-400 pointer-events-none z-10" style={{ left: t * pxPerMs }} />

            {marqueeBox && (
              <div
                className="absolute border border-accent/70 bg-accent/10 pointer-events-none z-20"
                style={{
                  left: Math.min(marqueeBox.x0, marqueeBox.x1),
                  top: Math.min(marqueeBox.y0, marqueeBox.y1),
                  width: Math.abs(marqueeBox.x1 - marqueeBox.x0),
                  height: Math.abs(marqueeBox.y1 - marqueeBox.y0),
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="text-[10px] text-[var(--op-30)]">
        {boxSelection.length > 1
          ? `Выделено ключей: ${boxSelection.length} — тянуть один из них — сдвинуть всю группу, Delete/Backspace — удалить все.`
          : "Ромбики — ключи (двойной клик по дорожке X/Y/Zoom — новый ключ, тянуть — сдвинуть по времени, тянуть по пустому месту — выделить область). Полоски — клипы (тряска/анимация/диалог/аудио): двойной клик — новый, тянуть целиком — сдвинуть, тянуть правый край — растянуть длительность."}
      </div>
    </div>
  );
}
