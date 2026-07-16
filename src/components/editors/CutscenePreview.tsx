import { useEffect, useRef, useState } from "react";
import { Crosshair, Grid3x3, ZoomIn, ZoomOut } from "lucide-react";
import type { Dialogue, DialogueColorStyle, Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { MapThumbnail } from "../mapeditor/MapThumbnail";
import { SpriteAnimator } from "../common/SpriteAnimator";
import { anchorOffset, resolveCamera, resolveCharacters, resolveOverlay } from "../../lib/cutscenePreview";
import { audioFxTrackKey, cameraTrackKey, characterTrackKey, dialogueTrackKey } from "./CutsceneTimeline";
import { CHARACTER_DRAG_MIME, DIALOGUE_DRAG_MIME } from "./CutsceneExplorerPanel";
import { nextId } from "../../lib/mapDefaults";
import { useDialoguePlayer } from "../../lib/useDialoguePlayer";
import { DialoguePlayArea } from "../dialogue/DialoguePlayArea";
import { ThemedSelect } from "../common/ThemedSelect";

// The game's actual base resolution (see the project brief: 320x180, top-down pixel art) --
// still what the CAMERA CLIP's own zoom means (zoom=2 => a 160x90 in-game window), but the
// EDITOR's own view of the stage is now independent of that (see the `view` state below) so a
// writer can pan/zoom around a location bigger than whatever the camera currently frames.
const NATIVE_W = 320;
const NATIVE_H = 180;
const MIN_STAGE_W = 420;
const MAX_STAGE_W = 1040;
const DEFAULT_STAGE_W = 480;
const MIN_VIEW_ZOOM = 0.25;
const MAX_VIEW_ZOOM = 4;
const GRID_SIZE_OPTIONS = [1, 2, 4, 8];

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
// the cutscene's own camera clips (`view` state below) -- editing convenience only, never
// written to the project. The camera's real resolved frame is drawn as a dashed rectangle so you
// can always see what the player will actually see vs. what you can currently pan around to.
//
// While the cutscene is actually PLAYING and has paused on a blocking dialogue clip
// (`awaitingDialogueEntry` prop, set by CutsceneEditorModal), the real interactive dialogue box
// (useDialoguePlayer + DialoguePlayArea, the exact same core used by the standalone Test-Play
// modal) is rendered directly over the live scene with no dark backdrop -- exactly how it will
// look in the actual game, not a separate floating window. There is no more lightweight
// scrub-only raw-text preview box (removed per feedback) -- while merely scrubbing (not gated),
// the stage just shows nothing dialogue-related, matching how the real game has no dialogue box
// on screen outside of an actual conversation.
export function CutscenePreview({
  entry,
  t,
  tLive,
  hiddenTracks = new Set(),
  awaitingDialogueEntry,
  onDialogueDone,
}: {
  entry: Entry;
  t: number;
  tLive?: number;
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

  // Editor-only viewport (pan/zoom), fully independent of the cutscene's own camera clips --
  // initializes to the map's center the first time a map is bound, then only moves in response
  // to the writer explicitly dragging/zooming/resetting (the Crosshair button snaps it to
  // wherever the camera currently resolves to, on demand).
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
  // a near-duplicate keyframe a couple ms away instead of adjusting the one you meant, which is
  // exactly the kind of thing that makes dragging feel unpredictable.
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

  const cameraClips = hiddenTracks.has(cameraTrackKey()) ? [] : entry.cutsceneCameraTrack ?? [];
  const characterClips = (entry.cutsceneCharacterTrack ?? []).filter(
    (c) => !c.characterId || !hiddenTracks.has(characterTrackKey(c.characterId))
  );
  const fxClips = hiddenTracks.has(audioFxTrackKey()) ? [] : entry.cutsceneAudioFxTrack ?? [];

  const camera = resolveCamera(cameraClips, t, mapCenterCell, tLive);
  const resolvedChars = resolveCharacters(characterClips, t, mapCenterCell, tLive);
  const overlay = resolveOverlay(fxClips, t, tLive);

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

  // Drag a character/dialogue from CutsceneExplorerPanel straight onto the stage -- a character
  // gets placed at the drop point (added to the cast if it isn't already, plus a "move" clip at
  // the CURRENT playhead time so it appears exactly where dropped); a dialogue is dropped in at
  // the current time regardless of x/y, since dialogue clips have no stage position.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const worldRect = worldRef.current?.getBoundingClientRect();
    if (!worldRect) return;
    const cellX = (e.clientX - worldRect.left) / (gridSize * displayScale);
    const cellY = (e.clientY - worldRect.top) / (gridSize * displayScale);

    const characterId = e.dataTransfer.getData(CHARACTER_DRAG_MIME);
    if (characterId) {
      const cast = entry.cutsceneCastCharacterIds ?? [];
      const charTrack = entry.cutsceneCharacterTrack ?? [];
      updateEntry(entry.id, {
        cutsceneCastCharacterIds: cast.includes(characterId) ? cast : [...cast, characterId],
        cutsceneCharacterTrack: [
          ...charTrack,
          { id: nextId("cclip"), startMs: Math.max(0, Math.round(t)), durationMs: 1000, kind: "move", characterId, x: cellX, y: cellY },
        ],
      });
      return;
    }
    const dialogueId = e.dataTransfer.getData(DIALOGUE_DRAG_MIME);
    if (dialogueId) {
      const dlgTrack = entry.cutsceneDialogueTrack ?? [];
      updateEntry(entry.id, {
        cutsceneDialogueTrack: [...dlgTrack, { id: nextId("dclip"), atMs: Math.max(0, Math.round(t)), durationMs: 3000, dialogueId }],
      });
    }
  };

  // Panning the editor's own view -- mousedown on the stage BACKGROUND (not on a character,
  // which stops propagation and starts its own reposition drag instead, see below). Standard
  // window-mousemove/mouseup drag pattern used everywhere else in this codebase.
  const startPan = (e: React.MouseEvent) => {
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

  // Dragging a character already placed on stage repositions it AND sets/updates a keyframe at
  // the current playhead time -- if a clip starts WITHIN keyMatchToleranceMs of `t` for this
  // character, its x/y are updated in place (the tolerance absorbs tiny scrub/float imprecision
  // instead of silently creating a near-duplicate stray keyframe a couple ms away); otherwise a
  // brand-new one-frame "move" clip is created there (short enough to read as a keyframe/snap,
  // not a slow tween).
  const startCharacterDrag = (e: React.MouseEvent, characterId: string, origX: number, origY: number) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    setDragChar({ characterId, x: origX, y: origY });
    const onMove = (ev: MouseEvent) => {
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      setDragChar({ characterId, x: origX + dxCells, y: origY + dyCells });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      const newX = origX + dxCells;
      const newY = origY + dyCells;
      const charTrack = entry.cutsceneCharacterTrack ?? [];
      const roundedT = Math.round(t);
      const existing = charTrack.find((c) => c.characterId === characterId && Math.abs(c.startMs - roundedT) <= keyMatchToleranceMs);
      if (existing) {
        updateEntry(entry.id, {
          cutsceneCharacterTrack: charTrack.map((c) => (c.id === existing.id ? { ...c, x: newX, y: newY } : c)),
        });
      } else {
        updateEntry(entry.id, {
          cutsceneCharacterTrack: [
            ...charTrack,
            { id: nextId("cclip"), startMs: Math.max(0, roundedT), durationMs: oneFrameMs, kind: "move", characterId, x: newX, y: newY },
          ],
        });
      }
      setDragChar(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Same drag-to-key pattern as characters, applied to the camera's own frame rectangle --
  // mousedown+drag on the dashed rect updates/creates a camera "move" clip at the current
  // playhead time instead of x/y number fields.
  const startCameraDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = camera.x;
    const origY = camera.y;
    setDragCam({ x: origX, y: origY });
    const onMove = (ev: MouseEvent) => {
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      setDragCam({ x: origX + dxCells, y: origY + dyCells });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const dxCells = (ev.clientX - startX) / (gridSize * displayScale);
      const dyCells = (ev.clientY - startY) / (gridSize * displayScale);
      const newX = origX + dxCells;
      const newY = origY + dyCells;
      const camTrack = entry.cutsceneCameraTrack ?? [];
      const roundedT = Math.round(t);
      const existing = camTrack.find((c) => c.kind === "move" && Math.abs(c.startMs - roundedT) <= keyMatchToleranceMs);
      if (existing) {
        updateEntry(entry.id, {
          cutsceneCameraTrack: camTrack.map((c) => (c.id === existing.id ? { ...c, x: newX, y: newY } : c)),
        });
      } else {
        updateEntry(entry.id, {
          cutsceneCameraTrack: [
            ...camTrack,
            { id: nextId("cam"), startMs: Math.max(0, roundedT), durationMs: oneFrameMs, kind: "move", x: newX, y: newY },
          ],
        });
      }
      setDragCam(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={containerRef} className="glass rounded-lg p-5 space-y-3 w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)] flex-1">Живое превью</div>
        <button onClick={() => zoomView(0.8)} title="Отдалить вид" className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
          <ZoomOut size={12} />
        </button>
        <button onClick={() => zoomView(1.25)} title="Приблизить вид" className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
          <ZoomIn size={12} />
        </button>
        <button
          onClick={resetViewToCamera}
          title="Вернуть вид к текущей позиции камеры"
          className="w-6 h-6 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
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
        className="relative overflow-hidden rounded-md border border-[var(--op-10)] mx-auto shrink-0"
        style={{ width: stageW, height: stageDisplayH, background: "#000", cursor: "grab" }}
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
                onMouseDown={(e) => startCharacterDrag(e, rc.characterId, rc.x, rc.y)}
                title="Перетащите, чтобы переместить и поставить ключ в текущем времени"
                className="absolute cursor-move"
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
        Перетащите фон — панорама вида. Перетащите персонажа или пунктирную рамку камеры — переместить и поставить ключ в текущем времени (координаты видны над тем, что тащите).
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
