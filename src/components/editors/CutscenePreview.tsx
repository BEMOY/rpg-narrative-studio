import { useEffect, useRef, useState } from "react";
import type { Dialogue, DialogueColorStyle, Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { MapThumbnail } from "../mapeditor/MapThumbnail";
import { SpriteAnimator } from "../common/SpriteAnimator";
import { activeDialogueClip, anchorOffset, resolveCamera, resolveCharacters, resolveOverlay } from "../../lib/cutscenePreview";
import { audioFxTrackKey, cameraTrackKey, characterTrackKey, dialogueTrackKey } from "./CutsceneTimeline";
import { CHARACTER_DRAG_MIME, DIALOGUE_DRAG_MIME } from "./CutsceneExplorerPanel";
import { nextId } from "../../lib/mapDefaults";
import { useDialoguePlayer } from "../../lib/useDialoguePlayer";
import { DialoguePlayArea } from "../dialogue/DialoguePlayArea";

// The game's actual base resolution (see the project brief: 320x180, top-down pixel art) --
// used as the camera's "native" viewport so zoom/pan in this preview means the same thing it
// will in-engine, not an arbitrary made-up preview scale. STAGE_DISPLAY_W used to be a fixed
// constant; the stage now sizes itself responsively (see useStageWidth below) between MIN and
// MAX so it fills however much room the editor window actually gives it instead of always
// rendering at a fixed 480px-wide box.
const NATIVE_W = 320;
const NATIVE_H = 180;
const MIN_STAGE_W = 420;
const MAX_STAGE_W = 1040;
const DEFAULT_STAGE_W = 480;

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
// uploaded yet in CharacterSpritesSection), applies a CSS transform for camera pan/zoom/shake,
// and layers a dialogue box + fade/flash overlay on top in screen-space (outside the transformed
// "world" layer, same as real game UI staying put while the camera moves under it).
//
// Two different dialogue presentations share the stage:
//  - while merely SCRUBBING (not gated on a blocking clip), a lightweight non-interactive raw
//    first-line preview is shown -- good enough for "what's roughly on screen at this time"
//    without spinning up a full stateful conversation on every scrub tick.
//  - while the cutscene is actually PLAYING and has paused on a blocking dialogue clip
//    (`awaitingDialogueEntry` prop, set by CutsceneEditorModal), the REAL interactive dialogue
//    box (useDialoguePlayer + DialoguePlayArea, the exact same core used by the standalone
//    Test-Play modal) is rendered directly over the live scene with no dark backdrop -- exactly
//    how it will look in the actual game, not a separate floating window.
export function CutscenePreview({
  entry,
  t,
  hiddenTracks = new Set(),
  awaitingDialogueEntry,
  onDialogueDone,
}: {
  entry: Entry;
  t: number;
  hiddenTracks?: Set<string>;
  awaitingDialogueEntry?: Dialogue;
  onDialogueDone?: () => void;
}) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const boundMap = allEntries.find((e) => e.id === entry.cutsceneMapId);
  const worldRef = useRef<HTMLDivElement>(null);
  const { containerRef, stageW } = useStageWidth();

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
  const dialogueClips = hiddenTracks.has(dialogueTrackKey()) ? [] : entry.cutsceneDialogueTrack ?? [];
  const fxClips = hiddenTracks.has(audioFxTrackKey()) ? [] : entry.cutsceneAudioFxTrack ?? [];

  const camera = resolveCamera(cameraClips, t, mapCenterCell);
  const resolvedChars = resolveCharacters(characterClips, t, mapCenterCell);
  const activeDlgClip = awaitingDialogueEntry ? undefined : activeDialogueClip(dialogueClips, t);
  const activeDialogue = activeDlgClip ? dialogues.find((d) => d.id === activeDlgClip.dialogueId) : undefined;
  const firstLine = activeDialogue?.nodes.find((n) => n.id === activeDialogue.startNodeId)?.lines[0];
  const overlay = resolveOverlay(fxClips, t);

  // Camera window into the world, in native (320x180-based) px -- zoom=2 shows a 160x90 window
  // (things look 2x bigger/closer), matching how a real in-game camera zoom would behave.
  const viewW = NATIVE_W / Math.max(0.1, camera.zoom);
  const viewH = NATIVE_H / Math.max(0.1, camera.zoom);
  const gridSize = map.gridSize;
  const cameraPxX = camera.x * gridSize;
  const cameraPxY = camera.y * gridSize;
  const displayScale = stageW / viewW;
  const stageDisplayH = viewH * displayScale;
  const translateX = -(cameraPxX - viewW / 2) * displayScale;
  const translateY = -(cameraPxY - viewH / 2) * displayScale;

  const worldDisplayW = map.width * gridSize * displayScale;
  const worldDisplayH = map.height * gridSize * displayScale;

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

  return (
    <div ref={containerRef} className="glass rounded-lg p-5 space-y-3 w-full h-full flex flex-col overflow-hidden">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)] shrink-0">Живое превью</div>

      <div
        className="relative overflow-hidden rounded-md border border-[var(--op-10)] mx-auto shrink-0"
        style={{ width: stageW, height: stageDisplayH, background: "#000" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div
          ref={worldRef}
          className="absolute top-0 left-0"
          style={{ width: worldDisplayW, height: worldDisplayH, transform: `translate(${translateX}px, ${translateY}px)` }}
        >
          <MapThumbnail map={map} entries={allEntries} />
          {resolvedChars.map((rc) => {
            const character = allEntries.find((e) => e.id === rc.characterId);
            if (!character) return null;
            const strip = character.spriteAnimations?.[rc.anim];
            const size = Math.max(12, gridSize * displayScale);
            const { ox, oy } = anchorOffset(rc.anchor);
            const leftPx = rc.x * gridSize * displayScale - size * ox;
            const topPx = rc.y * gridSize * displayScale - size * oy;
            return (
              <div
                key={rc.characterId}
                className="absolute"
                style={{
                  left: leftPx,
                  top: topPx,
                  width: size,
                  height: size,
                  zIndex: rc.zIndex,
                  opacity: rc.opacity / 100,
                  transform: rc.flipX ? "scaleX(-1)" : undefined,
                }}
              >
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
        </div>

        {overlay.opacity > 0.01 && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: overlay.color, opacity: overlay.opacity }} />
        )}

        {awaitingDialogueEntry ? (
          <div className="absolute inset-x-0 bottom-0">
            <EmbeddedDialoguePlayer dialogue={awaitingDialogueEntry} colorStyles={colorStyles} onDone={onDialogueDone} />
          </div>
        ) : (
          firstLine && (
            <div className="absolute left-2 right-2 bottom-2 rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] text-white">
              {firstLine.speaker && <div className="font-medium text-[10px] text-white/70">{firstLine.speaker}</div>}
              <div>{firstLine.text}</div>
            </div>
          )
        )}
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
