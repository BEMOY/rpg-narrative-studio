import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import type { Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { MapThumbnail } from "../mapeditor/MapThumbnail";
import { SpriteAnimator } from "../common/SpriteAnimator";
import { activeDialogueClip, cutsceneTotalDurationMs, resolveCamera, resolveCharacters, resolveOverlay } from "../../lib/cutscenePreview";

// The game's actual base resolution (see the project brief: 320x180, top-down pixel art) --
// used as the camera's "native" viewport so zoom/pan in this preview means the same thing it
// will in-engine, not an arbitrary made-up preview scale. STAGE_DISPLAY_W is purely a "make it
// big enough to look at" CSS upscale on top of that, independent of the native math below.
const NATIVE_W = 320;
const NATIVE_H = 180;
const STAGE_DISPLAY_W = 480;

// Live preview canvas for a Cutscene's timeline (Dynarain Phase 2) -- renders the bound
// location's existing MapThumbnail SVG as the world background, overlays animated character
// sprites (falling back to a static portrait, then a plain initial-letter dot, if a character
// has no sprite strip uploaded for CharacterSpritesSection yet), applies a CSS transform for
// camera pan/zoom/shake, and layers a dialogue text box + fade/flash overlay on top in
// screen-space (outside the transformed "world" layer, same as real game UI would stay put
// while the camera moves under it).
//
// Known v1 limitation: the dialogue box shows the raw text of the dialogue's first line
// (including any [c=...] color markup literally, unparsed) rather than running the full
// dialogue markup renderer used elsewhere in the app -- pulling that renderer in here for a
// small preview label was judged not worth the extra surface area this round.
export function CutscenePreview({ entry }: { entry: Entry }) {
  const allEntries = useProjectStore((s) => s.project.entries);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const boundMap = allEntries.find((e) => e.id === entry.cutsceneMapId);

  const totalMs = cutsceneTotalDurationMs(entry);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = 0;
    const step = (ts: number) => {
      if (lastRef.current === 0) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      setT((prev) => {
        let next = prev + dt;
        if (next >= totalMs) {
          if (loop) next = totalMs <= 0 ? 0 : next % totalMs;
          else next = totalMs;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalMs, loop]);

  useEffect(() => {
    if (playing && t >= totalMs && !loop) setPlaying(false);
  }, [playing, t, totalMs, loop]);

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

  const camera = resolveCamera(entry.cutsceneCameraTrack ?? [], t, mapCenterCell);
  const resolvedChars = resolveCharacters(entry.cutsceneCharacterTrack ?? [], t, mapCenterCell);
  const activeDlgClip = activeDialogueClip(entry.cutsceneDialogueTrack ?? [], t);
  const activeDialogue = activeDlgClip ? dialogues.find((d) => d.id === activeDlgClip.dialogueId) : undefined;
  const firstLine = activeDialogue?.nodes.find((n) => n.id === activeDialogue.startNodeId)?.lines[0];
  const overlay = resolveOverlay(entry.cutsceneAudioFxTrack ?? [], t);

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

  return (
    <div className="glass rounded-lg p-5 space-y-3">
      <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Живое превью</div>

      <div
        className="relative overflow-hidden rounded-md border border-[var(--op-10)] mx-auto"
        style={{ width: STAGE_DISPLAY_W, height: stageDisplayH, background: "#000" }}
      >
        <div
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

      <div className="flex items-center gap-2">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)] shrink-0"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <input
          type="range"
          min={0}
          max={totalMs}
          value={Math.min(t, totalMs)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          className="flex-1"
        />
        <span className="text-[10px] mono text-[var(--op-40)] w-24 text-right shrink-0">
          {Math.round(t)} / {totalMs} мс
        </span>
        <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1 shrink-0">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Цикл
        </label>
      </div>
    </div>
  );
}
