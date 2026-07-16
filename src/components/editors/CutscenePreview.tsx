import { useRef } from "react";
import type { Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { MapThumbnail } from "../mapeditor/MapThumbnail";
import { SpriteAnimator } from "../common/SpriteAnimator";
import { activeDialogueClip, resolveCamera, resolveCharacters, resolveOverlay } from "../../lib/cutscenePreview";
import { audioFxTrackKey, cameraTrackKey, characterTrackKey, dialogueTrackKey } from "./CutsceneTimeline";
import { CHARACTER_DRAG_MIME, DIALOGUE_DRAG_MIME } from "./CutsceneExplorerPanel";
import { nextId } from "../../lib/mapDefaults";

// The game's actual base resolution (see the project brief: 320x180, top-down pixel art) --
// used as the camera's "native" viewport so zoom/pan in this preview means the same thing it
// will in-engine, not an arbitrary made-up preview scale. STAGE_DISPLAY_W is purely a "make it
// big enough to look at" CSS upscale on top of that, independent of the native math below.
const NATIVE_W = 320;
const NATIVE_H = 180;
const STAGE_DISPLAY_W = 480;

// Live preview STAGE for a Cutscene's timeline (Dynarain Phase 2) -- a "dumb" component driven
// entirely by the `t` (playhead, ms) prop, so it can stay in perfect sync with the
// CutsceneTimeline editor's own playhead/scrubbing (both are views onto the same shared
// play/pause/scrub state one level up, in CutscenePanel, EntryEditor.tsx -- same idea as a real
// NLE's timeline and preview monitor being the same instrument). Renders the bound location's
// existing MapThumbnail SVG as the world background, overlays animated character sprites
// (falling back to a static portrait, then a plain initial-letter dot, if a character has no
// sprite strip uploaded yet in CharacterSpritesSection), applies a CSS transform for camera
// pan/zoom/shake, and layers a dialogue text box + fade/flash overlay on top in screen-space
// (outside the transformed "world" layer, same as real game UI staying put while the camera
// moves under it).
//
// Known v1 limitation: the dialogue box shows the raw text of the dialogue's first line
// (including any [c=...] color markup literally, unparsed) rather than running the full
// dialogue markup renderer used elsewhere in the app.
export function CutscenePreview({
  entry,
  t,
  hiddenTracks = new Set(),
}: {
  entry: Entry;
  t: number;
  hiddenTracks?: Set<string>;
}) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const boundMap = allEntries.find((e) => e.id === entry.cutsceneMapId);
  const worldRef = useRef<HTMLDivElement>(null);

  if (!boundMap?.map) {
    return (
      <div className="glass rounded-lg p-5 space-y-2">
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
  const activeDlgClip = activeDialogueClip(dialogueClips, t);
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
  const displayScale = STAGE_DISPLAY_W / viewW;
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
    <div className="glass rounded-lg p-5 space-y-3">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Живое превью</div>

      <div
        className="relative overflow-hidden rounded-md border border-[var(--op-10)] mx-auto"
        style={{ width: STAGE_DISPLAY_W, height: stageDisplayH, background: "#000" }}
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
            const leftPx = rc.x * gridSize * displayScale - size / 2;
            const topPx = rc.y * gridSize * displayScale - size / 2;
            return (
              <div key={rc.characterId} className="absolute" style={{ left: leftPx, top: topPx, width: size, height: size }}>
                {strip ? (
                  <SpriteAnimator strip={strip} size={size} />
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

        {firstLine && (
          <div className="absolute left-2 right-2 bottom-2 rounded-md bg-black/70 px-2.5 py-1.5 text-[11px] text-white">
            {firstLine.speaker && <div className="font-medium text-[10px] text-white/70">{firstLine.speaker}</div>}
            <div>{firstLine.text}</div>
          </div>
        )}
      </div>
    </div>
  );
}
