import { useEffect, useRef, useState } from "react";
import { Crosshair, Grid3x3, ZoomIn, ZoomOut } from "lucide-react";
import type { Dialogue, DialogueColorStyle, Entry, Keyframe } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { MapThumbnail } from "../mapeditor/MapThumbnail";
import { SpriteAnimator } from "../common/SpriteAnimator";
import { anchorOffset, resolveCamera, resolveCharacters, resolveOverlay } from "../../lib/cutscenePreview";
import { trackClips, withTrackClips } from "../../lib/cutsceneTracks";
import {
  audioFxTrackKey,
  cameraPosXKey,
  cameraPosYKey,
  cameraTrackKey,
  cameraZoomKey,
  characterPosXKey,
  characterPosYKey,
  characterTrackKey,
  dialogueTrackKey,
  eventTrackKey,
} from "./CutsceneTimeline";
import { CHARACTER_DRAG_MIME, DIALOGUE_DRAG_MIME } from "./CutsceneExplorerPanel";
import { nextId } from "../../lib/mapDefaults";
import { useDialoguePlayer } from "../../lib/useDialoguePlayer";
import { DialoguePlayArea } from "../dialogue/DialoguePlayArea";
import { ThemedSelect } from "../common/ThemedSelect";

// The game's actual base resolution (see the project brief: 320x180, top-down pixel art) --
// still what the CAMERA's own zoom means (zoom=2 => a 160x90 in-game window), but the EDITOR's
// own view of the stage is now independent of that (see the `view` state below) so a writer can
// pan/zoom around a location bigger than whatever the camera currently frames.
const NATIVE_W = 320;
const NATIVE_H = 180;
const MIN_STAGE_W = 420;
const MAX_STAGE_W = 1040;
const DEFAULT_STAGE_W = 480;
const MIN_VIEW_ZOOM = 0.25;
const MAX_VIEW_ZOOM = 4;
const GRID_SIZE_OPTIONS = [1, 2, 4, 8];
// A drag shorter than this (in screen px) never creates or moves a keyframe -- it's read as a
// plain click-to-select instead. Fixes keys appearing "spontaneously" from a hand's natural
// tremor on mousedown/mouseup, and matches the Unity-style "select is not drag" split the writer
// asked for.
const MIN_DRAG_PX = 4;

// Measures the available space around the stage (via ResizeObserver on the wrapping panel) and
// picks the largest stage width that still fits both the panel's width AND its height without
// the 16:9 (320:180) native aspect overflowing -- so the preview grows to fill a bigger editor
// window/monitor column instead of sitting at a small fixed size.
function useStageWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(DEFAULT_STAGE_W);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const byWidth = r.width - 16;
      const byHeight = (r.height - 48) * (NATIVE_W / NATIVE_H);
      const w = Math.min(byWidth, byHeight);
      if (w > 0) setStageW(Math.max(MIN_STAGE_W, Math.min(MAX_STAGE_W, w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { containerRef, stageW };
}

// Upserts a value into a single Keyframe[] channel: if a key already sits within
// toleranceMs of atMs, its value (and atMs, snapped to atMs) is updated in place; otherwise a
// brand-new keyframe is appended. This is the ONE place that decides "am I editing an existing
// key or placing a new one", shared by every draggable channel (camera x/y/zoom, each
// character's x/y) so they all behave identically.
function upsertKeyframe(keys: Keyframe[], atMs: number, value: number, toleranceMs: number): Keyframe[] {
  const existing = keys.find((k) => Math.abs(k.atMs - atMs) <= toleranceMs);
  if (existing) return keys.map((k) => (k.id === existing.id ? { ...k, value } : k));
  return [...keys, { id: nextId("key"), atMs: Math.max(0, atMs), value }];
}

// Live preview STAGE for a Cutscene's timeline (Dynarain Phase 2) -- a "dumb" component driven
// entirely by the `t` (playhead, ms) prop, so it can stay in perfect sync with the
// CutsceneTimeline editor's own playhead/scrubbing (both are views onto the same shared
// play/pause/scrub state one level up, in CutsceneEditorModal.tsx -- same idea as a real NLE's
// timeline and preview monitor being the same instrument). Renders the bound location's existing
// MapThumbnail SVG as the world background, overlays animated character sprites (falling back to
// a static portrait, then a plain initial-letter dot, if a character has no sprite strip
// uploaded yet in CharacterSpritesSection), and layers a dialogue box + fade/flash overlay on
// top in screen-space (outside the transformed "world" layer, same as real game UI staying put
// while the camera moves under it).
//
// The stage's own displayed VIEWPORT (pan via dragging the background, zoom via the +/- buttons,
// "Crosshair" button to snap back to wherever the actual camera currently is) is independent of
// the cutscene's own camera position -- BUT only while paused/scrubbing. While `playing` is true
// the view is forced to track the camera's resolved x/y/zoom every frame (per writer design
// decision: "когда я нажимаю на проигрывание катсцены должен показываться тот вид что видит
// камера"), so pressing Play always shows exactly what the in-game camera would show. The
// camera's real resolved frame is ALSO always drawn as a dashed rectangle so you can see it even
// while free-panning during pause.
//
// Camera x/y/zoom and each character's x/y are now true point keyframes (see
// cutsceneCameraPosX/PosY/ZoomKeys, cutsceneCharacterPositionKeys in types/database.ts) --
// dragging on stage always works (even mid-interpolation) and either nudges the nearest existing
// key (within a small time tolerance) or places a brand-new one at the current playhead time, per
// the writer's explicit "перетаскивание должно работать всегда" design mandate. A drag shorter
// than MIN_DRAG_PX is treated as a plain click (select only, no key created/moved).
//
// While the cutscene is actually PLAYING and has paused on a blocking dialogue clip
// (`awaitingDialogueEntry` prop, set by CutsceneEditorModal), the real interactive dialogue box
// (useDialoguePlayer + DialoguePlayArea, the exact same core used by the standalone Test-Play
// modal) is rendered directly over the live scene with no dark backdrop -- exactly how it will
// look in the actual game, not a separate floating window.
export function CutscenePreview({
  entry,
  t,
  tLive,
  playing = false,
  hiddenTracks = new Set(),
  awaitingDialogueEntry,
  onDialogueDone,
}: {
  entry: Entry;
  t: number;
  tLive?: number;
  playing?: boolean;
  hiddenTracks?: Set<string>;
  awaitingDialogueEntry?: Dialogue;
  onDialogueDone?: () => void;
}) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const boundMap = allEntries.find((e) => e.id === entry.cutsceneMapId);
  const worldRef = useRef<HTMLDivElement>(null);
  const { containerRef, stageW } = useStageWidth();

  // Editor-only viewport (pan/zoom) -- free while paused, force-synced to the camera's resolved
  // frame every frame while playing (see the effect below).
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [viewInitFor, setViewInitFor] = useState<string | undefined>(undefined);
  const [showGrid, setShowGrid] = useState(false);
  const [gridCells, setGridCells] = useState(1);
  const [dragChar, setDragChar] = useState<{ characterId: string; x: number; y: number } | null>(null);
  const [dragCam, setDragCam] = useState<{ x: number; y: number } | null>(null);
  const fps = entry.cutsceneFps ?? 60;
  const oneFrameMs = Math.max(1, Math.round(1000 / fps));
  // Half a frame's worth of tolerance when deciding whether a drag should UPDATE an existing
  // keyframe vs. create a brand new one -- without this, scrubbing to "roughly" a keyframe's
  // time (rounding/float drift from the playback clock) and then dragging would silently create
  // a near-duplicate keyframe a couple ms away instead of adjusting the one you meant.
  const keyMatchToleranceMs = oneFrameMs / 2;

  useEffect(() => {
    if (!boundMap?.map || viewInitFor === boundMap.id) return;
    setView({ x: boundMap.map.width / 2, y: boundMap.map.height / 2, zoom: 1 });
    setViewInitFor(boundMap.id);
  }, [boundMap, viewInitFor]);

  if (!boundMap?.map) {
    return (
      <div className="glass rounded-lg p-5 space-y-2 w-full h-full flex flex-col">
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Живое превью</div>
        <div className="text-xs text-[var(--op-30)]">Выберите локацию выше (со структурированной картой), чтобы увидеть превью катсцены.</div>
      </div>
    );
  }

  const map = boundMap.map;
  const mapCenterCell = { x: map.width / 2, y: map.height / 2 };

  const tracks = entry.cutsceneTracks ?? [];
  // Hiding a track from the preview (the eye icon in CutsceneTimeline) just means "don't let its
  // clips affect what's resolved this frame" -- filter it out of the tracks list the resolve
  // functions see, same effect as before this rework, just expressed generically over one list
  // instead of four separate hidden-clip-array computations.
  const visibleTracks = tracks.filter((tr) => {
    if (tr.kind === "camera") return !hiddenTracks.has(cameraTrackKey());
    if (tr.kind === "dialogue") return !hiddenTracks.has(dialogueTrackKey());
    if (tr.kind === "audiofx") return !hiddenTracks.has(audioFxTrackKey());
    if (tr.kind === "event") return !hiddenTracks.has(eventTrackKey());
    return !tr.characterId || !hiddenTracks.has(characterTrackKey(tr.characterId));
  });
  const camPosX = hiddenTracks.has(cameraPosXKey()) ? [] : entry.cutsceneCameraPosX ?? [];
  const camPosY = hiddenTracks.has(cameraPosYKey()) ? [] : entry.cutsceneCameraPosY ?? [];
  const camZoom = hiddenTracks.has(cameraZoomKey()) ? [] : entry.cutsceneCameraZoomKeys ?? [];
  const positionKeys = (entry.cutsceneCharacterPositionKeys ?? []).filter((k) => {
    const key = k.axis === "x" ? characterPosXKey(k.characterId) : characterPosYKey(k.characterId);
    return !hiddenTracks.has(key);
  });

  const camera = resolveCamera(camPosX, camPosY, camZoom, visibleTracks, t, mapCenterCell, entry.cutsceneCameraPausesForDialogue, tLive);
  const resolvedChars = resolveCharacters(positionKeys, visibleTracks, entry.cutsceneCastCharacterIds ?? [], t, mapCenterCell, tLive);
  const overlay = resolveOverlay(visibleTracks, t, tLive);

  const gridSize = map.gridSize; // px per map cell, native resolution
  const viewW = NATIVE_W / Math.max(0.1, view.zoom);
  const viewH = NATIVE_H / Math.max(0.1, view.zoom);
  const viewPxX = view.x * gridSize;
  const viewPxY = view.y * gridSize;
  const displayScale = stageW / viewW;
  const stageDisplayH = viewH * displayScale;
  const translateX = -(viewPxX - viewW / 2) * displayScale;
  const translateY = -(viewPxY - viewH / 2) * displayScale;

  const worldDisplayW = map.width * gridSize * displayScale;
  const worldDisplayH = map.height * gridSize * displayScale;

  // While playing, the editor viewport always tracks the camera's own resolved frame -- pressing
  // Play shows exactly what the in-game camera sees, per writer design decision. Runs as an
  // effect (not inline in render) so it doesn't fight the free-pan drag handlers while paused.
  useEffect(() => {
    if (!playing) return;
    setView({ x: camera.x, y: camera.y, zoom: camera.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, camera.x, camera.y, camera.zoom]);

  // The camera's OWN frame (what the player actually sees), drawn as a dashed rectangle inside
  // the same world layer -- independent of the editor's pan/zoom above. Follows dragCam while
  // the rectangle itself is being dragged, same idea as dragChar overriding a character's
  // displayed position.
  const camViewW = NATIVE_W / Math.max(0.1, camera.zoom);
  const camViewH = NATIVE_H / Math.max(0.1, camera.zoom);
  const camRectW = camViewW * displayScale;
  const camRectH = camViewH * displayScale;
  const camDisplayX = dragCam ? dragCam.x : camera.x;
  const camDisplayY = dragCam ? dragCam.y : camera.y;
  const camRectLeft = camDisplayX * gridSize * displayScale - camRectW / 2;
  const camRectTop = camDisplayY * gridSize * displayScale - camRectH / 2;

  const gridCellPx = gridCells * gridSize * displayScale;

  // Converts a raw client (screen) coordinate to a world CELL coordinate -- reads the world
  // layer's OWN on-screen rect (post pan/zoom transform) rather than re-deriving it from `view`,
  // so this stays correct regardless of how the transform is expressed. This is the single
  // source of truth for "where in the world did the pointer land", used by both the
  // Explorer-drop handler and (as a sanity cross-check) nowhere else -- drag-to-reposition below
  // intentionally works from POINTER DELTAS instead (see startCharacterDrag/startCameraDrag),
  // since deltas are immune to any transform-origin/rounding mismatch that an absolute
  // client-to-world conversion could introduce.
  const clientToCell = (clientX: number, clientY: number) => {
    const worldRect = worldRef.current?.getBoundingClientRect();
    if (!worldRect) return { x: 0, y: 0 };
    return {
      x: (clientX - worldRect.left) / (gridSize * displayScale),
      y: (clientY - worldRect.top) / (gridSize * displayScale),
    };
  };

  // Drag a character/dialogue from CutsceneExplorerPanel straight onto the stage -- a character
  // gets placed at the drop point (added to the cast if it isn't already, plus one X and one Y
  // keyframe at the CURRENT playhead time so it appears exactly where dropped); a dialogue is
  // dropped in at the current time regardless of x/y, since dialogue clips have no stage
  // position.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const { x: cellX, y: cellY } = clientToCell(e.clientX, e.clientY);

    const characterId = e.dataTransfer.getData(CHARACTER_DRAG_MIME);
    if (characterId) {
      const cast = entry.cutsceneCastCharacterIds ?? [];
      const posKeys = entry.cutsceneCharacterPositionKeys ?? [];
      const roundedT = Math.max(0, Math.round(t));
      updateEntry(entry.id, {
        cutsceneCastCharacterIds: cast.includes(characterId) ? cast : [...cast, characterId],
        cutsceneCharacterPositionKeys: [
          ...posKeys,
          { id: nextId("ckey"), characterId, axis: "x", atMs: roundedT, value: cellX },
          { id: nextId("ckey"), characterId, axis: "y", atMs: roundedT, value: cellY },
        ],
      });
      return;
    }
    const dialogueId = e.dataTransfer.getData(DIALOGUE_DRAG_MIME);
    if (dialogueId) {
      const dlgClips = trackClips(tracks, "dialogue");
      updateEntry(entry.id, {
        cutsceneTracks: withTrackClips(tracks, "dialogue", [
          ...dlgClips,
          { id: nextId("dclip"), startMs: Math.max(0, Math.round(t)), durationMs: 3000, component: { kind: "dialogue", dialogueId } },
        ]),
      });
    }
  };

  // Panning the editor's own view -- mousedown on the stage BACKGROUND (not on a character,
  // which stops propagation and starts its own reposition drag instead, see below). Disabled
  // while playing (view is locked to the camera then). Standard window-mousemove/mouseup drag
  // pattern used everywhere else in this codebase.
  const startPan = (e: React.MouseEvent) => {
    if (playing) return;
    e.preventDefault(); // otherwise the browser starts a native text-selection drag on mousedown
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = view.x;
    const origY = view.y;
    const onMove = (ev: MouseEvent) => {
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      setView((v) => ({ ...v, x: origX - dxCells, y: origY - dyCells }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const zoomView = (factor: number) =>
    setView((v) => ({ ...v, zoom: Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, v.zoom * factor)) }));
  const resetViewToCamera = () => setView({ x: camera.x, y: camera.y, zoom: camera.zoom });

  // Dragging a character already placed on stage: ALWAYS repositions it (even mid-interpolation
  // between two other keys, per writer design decision that dragging must always work) and
  // upserts one keyframe per axis at the current playhead time -- within keyMatchToleranceMs of
  // an existing key on that axis, that key's value is updated in place; otherwise a new one is
  // inserted (which is exactly the "recompute the two neighboring segments" behavior, since
  // resolveChannel only ever interpolates between a key and its immediate neighbors). A drag
  // shorter than MIN_DRAG_PX total movement is treated as a plain click (select only) and never
  // touches the data -- this is what stops keys from appearing "spontaneously".
  const startCharacterDrag = (e: React.MouseEvent, characterId: string, origX: number, origY: number) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dxPx = ev.clientX - startX;
      const dyPx = ev.clientY - startY;
      if (!moved && Math.hypot(dxPx, dyPx) < MIN_DRAG_PX) return;
      moved = true;
      const dxCells = dxPx / (gridSize * displayScale);
      const dyCells = dyPx / (gridSize * displayScale);
      setDragChar({ characterId, x: origX + dxCells, y: origY + dyCells });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) {
        setDragChar(null);
        return;
      }
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      const newX = origX + dxCells;
      const newY = origY + dyCells;
      const roundedT = Math.max(0, Math.round(t));
      const posKeys = entry.cutsceneCharacterPositionKeys ?? [];
      const xKeys = posKeys.filter((k) => k.characterId === characterId && k.axis === "x");
      const yKeys = posKeys.filter((k) => k.characterId === characterId && k.axis === "y");
      const others = posKeys.filter((k) => k.characterId !== characterId);
      const nextX = upsertKeyframe(xKeys, roundedT, newX, keyMatchToleranceMs).map((k) => ({ ...k, characterId, axis: "x" as const }));
      const nextY = upsertKeyframe(yKeys, roundedT, newY, keyMatchToleranceMs).map((k) => ({ ...k, characterId, axis: "y" as const }));
      updateEntry(entry.id, { cutsceneCharacterPositionKeys: [...others, ...nextX, ...nextY] });
      setDragChar(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Same always-works drag-to-key pattern as characters, applied to the camera's own frame
  // rectangle -- upserts a keyframe on cutsceneCameraPosX/PosY at the current playhead time.
  const startCameraDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = camera.x;
    const origY = camera.y;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dxPx = ev.clientX - startX;
      const dyPx = ev.clientY - startY;
      if (!moved && Math.hypot(dxPx, dyPx) < MIN_DRAG_PX) return;
      moved = true;
      const dxCells = dxPx / (gridSize * displayScale);
      const dyCells = dyPx / (gridSize * displayScale);
      setDragCam({ x: origX + dxCells, y: origY + dyCells });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!moved) {
        setDragCam(null);
        return;
      }
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      const newX = origX + dxCells;
      const newY = origY + dyCells;
      const roundedT = Math.max(0, Math.round(t));
      updateEntry(entry.id, {
        cutsceneCameraPosX: upsertKeyframe(entry.cutsceneCameraPosX ?? [], roundedT, newX, keyMatchToleranceMs),
        cutsceneCameraPosY: upsertKeyframe(entry.cutsceneCameraPosY ?? [], roundedT, newY, keyMatchToleranceMs),
      });
      setDragCam(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={containerRef} className="glass rounded-lg p-5 space-y-3 w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)] flex-1">Живое превью</div>
        {playing && <div className="text-[10px] text-accent">Вид камеры (во время игры)</div>}
        <button
          onClick={() => zoomView(0.8)}
          disabled={playing}
          title="Отдалить вид"
          className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-30"
        >
          <ZoomOut size={12} />
        </button>
        <button
          onClick={() => zoomView(1.25)}
          disabled={playing}
          title="Приблизить вид"
          className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-30"
        >
          <ZoomIn size={12} />
        </button>
        <button
          onClick={resetViewToCamera}
          disabled={playing}
          title="Вернуть вид к текущей позиции камеры"
          className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] disabled:opacity-30"
        >
          <Crosshair size={12} />
        </button>
        <button
          onClick={() => setShowGrid((v) => !v)}
          title="Показать/скрыть сетку"
          className={`w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] ${showGrid ? "text-accent" : ""}`}
        >
          <Grid3x3 size={12} />
        </button>
        {showGrid && (
          <div className="w-16">
            <ThemedSelect
              className="input text-xs"
              value={String(gridCells)}
              onChange={(v) => setGridCells(Number(v))}
              options={GRID_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n}` }))}
            />
          </div>
        )}
      </div>

      <div
        className="relative overflow-hidden rounded-md border border-[var(--op-10)] mx-auto shrink-0 select-none"
        style={{ width: stageW, height: stageDisplayH, background: "#000", cursor: playing ? "default" : "grab" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onMouseDown={startPan}
      >
        <div
          ref={worldRef}
          className="absolute top-0 left-0"
          style={{ width: worldDisplayW, height: worldDisplayH, transform: `translate(${translateX}px, ${translateY}px)` }}
        >
          <MapThumbnail map={map} entries={allEntries} />

          {showGrid && gridCellPx > 2 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
                backgroundSize: `${gridCellPx}px ${gridCellPx}px`,
              }}
            />
          )}

          {resolvedChars.map((rc) => {
            const character = allEntries.find((e) => e.id === rc.characterId);
            if (!character) return null;
            const isDragging = dragChar?.characterId === rc.characterId;
            const cx = isDragging ? dragChar!.x : rc.x;
            const cy = isDragging ? dragChar!.y : rc.y;
            const strip = character.spriteAnimations?.[rc.anim];
            const size = Math.max(12, gridSize * displayScale);
            const { ox, oy } = anchorOffset(rc.anchor);
            const leftPx = cx * gridSize * displayScale - size * ox;
            const topPx = cy * gridSize * displayScale - size * oy;
            return (
              <div
                key={rc.characterId}
                onMouseDown={(e) => !playing && startCharacterDrag(e, rc.characterId, rc.x, rc.y)}
                title="Перетащите, чтобы переместить и поставить ключ в текущем времени"
                className={playing ? "absolute" : "absolute cursor-move"}
                style={{
                  left: leftPx,
                  top: topPx,
                  width: size,
                  height: size,
                  zIndex: rc.zIndex,
                  opacity: rc.opacity / 100,
                  transform: rc.flipX ? "scaleX(-1)" : undefined,
                  outline: isDragging ? "2px solid white" : undefined,
                }}
              >
                {isDragging && (
                  <div className="absolute left-1/2 -translate-x-1/2 -top-5 whitespace-nowrap text-[10px] font-mono bg-black/80 text-white px-1.5 py-0.5 rounded pointer-events-none">
                    {character.name}: {cx.toFixed(1)}, {cy.toFixed(1)}
                  </div>
                )}
                {strip ? (
                  <SpriteAnimator strip={strip} size={size} speedMultiplier={rc.speed / 100} />
                ) : character.image ? (
                  <img
                    src={character.image}
                    alt=""
                    className="w-full h-full object-cover rounded-sm"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-[var(--op-20)] grid place-items-center text-[9px] text-[var(--op-70)]">
                    {character.name[0] ?? "?"}
                  </div>
                )}
              </div>
            );
          })}

          {!playing && (
            <div
              onMouseDown={startCameraDrag}
              title="Перетащите, чтобы переместить камеру и поставить ключ в текущем времени"
              className="absolute border border-dashed border-white/50 cursor-move"
              style={{ left: camRectLeft, top: camRectTop, width: camRectW, height: camRectH }}
            >
              {dragCam && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-5 whitespace-nowrap text-[10px] font-mono bg-black/80 text-white px-1.5 py-0.5 rounded pointer-events-none">
                  Камера: {dragCam.x.toFixed(1)}, {dragCam.y.toFixed(1)}
                </div>
              )}
            </div>
          )}
        </div>

        {overlay.opacity > 0.01 && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: overlay.color, opacity: overlay.opacity }} />
        )}

        {awaitingDialogueEntry && (
          <div className="absolute inset-x-0 bottom-0">
            <EmbeddedDialoguePlayer dialogue={awaitingDialogueEntry} colorStyles={colorStyles} onDone={onDialogueDone} />
          </div>
        )}
      </div>
      <div className="text-[10px] text-[var(--op-30)] shrink-0">
        {playing
          ? "Идёт проигрывание — вид показывает то, что видит камера."
          : "Перетащите фон — панорама вида. Перетащите персонажа или пунктирную рамку камеры — переместить и поставить ключ в текущем времени."}
      </div>
    </div>
  );
}

// Thin adapter: runs the real dialogue state machine for the clip the cutscene is currently
// blocked on, renders it via the shared <DialoguePlayArea variant="embedded">, and calls
// onDone() the instant the conversation actually finishes (no more lines/choices/continueTo) --
// that's the cutscene's cue to unpause and keep playing, mirroring how dialogue works in the
// real game (the box just disappears and gameplay continues, nothing to manually close).
function EmbeddedDialoguePlayer({
  dialogue,
  colorStyles,
  onDone,
}: {
  dialogue: Dialogue;
  colorStyles: DialogueColorStyle[];
  onDone?: () => void;
}) {
  const player = useDialoguePlayer(dialogue);
  useEffect(() => {
    if (player.ended) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ended]);
  return <DialoguePlayArea player={player} colorStyles={colorStyles} variant="embedded" />;
}
