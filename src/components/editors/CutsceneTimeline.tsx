import { useMemo, useRef, useState } from "react";
import { X, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { AudioFxClip, CameraClip, CharacterClip, CutsceneDialogueClip, Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { cutsceneTotalDurationMs } from "../../lib/cutscenePreview";
import { nextId } from "../../lib/mapDefaults";
import { SearchSelect } from "../dialogue/SearchSelect";

// Identifies exactly one clip on exactly one track kind -- used both to track which clip is
// currently selected (highlighted here, and shown in the ClipInspector panel rendered alongside
// this component in CutscenePanel/EntryEditor.tsx) and to route drag/resize edits to the right
// track's array.
export type ClipRef =
  | { trackKind: "camera"; id: string }
  | { trackKind: "character"; id: string }
  | { trackKind: "dialogue"; id: string }
  | { trackKind: "audiofx"; id: string };

const LANE_H = 34;
const RULER_H = 22;
const LABEL_W = 136;
const MIN_PX_PER_MS = 0.02;
const MAX_PX_PER_MS = 0.6;

const TRACK_COLOR = {
  camera: "#5b8dd6",
  character: "#59b37a",
  dialogue: "#c98a4b",
  audiofx: "#a06bc9",
} as const;

// A real multi-track timeline widget (Dynarain Phase 2, Cutscene) -- track-label column on the
// left, a horizontally-scrollable/zoomable ruler+lanes area on the right. Clips are draggable
// (move) and resizable (drag the right edge) using the same "mousedown starts a drag, window
// listens for mousemove/mouseup" pattern already used for freehand brush strokes in
// MapEditorModal.tsx, rather than the newer Pointer Capture API, to stay consistent with an
// already-proven interaction in this codebase. Camera/Dialogue/Audio-FX are single fixed lanes;
// Character lanes are added/removed per character via cutsceneCastCharacterIds, so a character
// can have a lane reserved for them even before they have any clips yet. The overall timeline
// LENGTH is always derived live from cutsceneTotalDurationMs (the furthest any clip on any
// track reaches) -- there is no separately-stored "cutscene duration", it's computed, so it's
// always in sync with what's actually on the tracks, per the "автоматическое определение
// времени катсцены" requirement.
// Track visibility/lock is ephemeral editing-session UI state (not persisted to project data)
// -- "hidden" means skipped when CutscenePreview composites the stage (see its hiddenTracks
// prop), "locked" means this component itself refuses to start a drag or add a new clip on it.
// Matches the eye/lock icons real NLEs put in their track header column.
export function cameraTrackKey() {
  return "camera";
}
export function characterTrackKey(characterId: string) {
  return `character:${characterId}`;
}
export function dialogueTrackKey() {
  return "dialogue";
}
export function audioFxTrackKey() {
  return "audiofx";
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
  const characters = allEntries.filter((e) => e.category === "character");

  const [pxPerMs, setPxPerMs] = useState(0.08);
  const laneAreaRef = useRef<HTMLDivElement>(null);

  const totalMs = cutsceneTotalDurationMs(entry);
  const timelineWidth = Math.max(400, totalMs * pxPerMs + 120);

  const cast = entry.cutsceneCastCharacterIds ?? [];
  const cameraTrack = entry.cutsceneCameraTrack ?? [];
  const charTrack = entry.cutsceneCharacterTrack ?? [];
  const dlgTrack = entry.cutsceneDialogueTrack ?? [];
  const fxTrack = entry.cutsceneAudioFxTrack ?? [];

  const setCameraTrack = (next: CameraClip[]) => updateEntry(entry.id, { cutsceneCameraTrack: next });
  const setCharTrack = (next: CharacterClip[]) => updateEntry(entry.id, { cutsceneCharacterTrack: next });
  const setDlgTrack = (next: CutsceneDialogueClip[]) => updateEntry(entry.id, { cutsceneDialogueTrack: next });
  const setFxTrack = (next: AudioFxClip[]) => updateEntry(entry.id, { cutsceneAudioFxTrack: next });

  const addCastMember = (characterId: string | undefined) => {
    if (!characterId || cast.includes(characterId)) return;
    updateEntry(entry.id, { cutsceneCastCharacterIds: [...cast, characterId] });
  };
  const removeCastMember = (characterId: string) => {
    updateEntry(entry.id, {
      cutsceneCastCharacterIds: cast.filter((id) => id !== characterId),
      cutsceneCharacterTrack: charTrack.filter((c) => c.characterId !== characterId),
    });
    if (selected?.trackKind === "character") {
      const clip = charTrack.find((c) => c.id === selected.id);
      if (clip?.characterId === characterId) onSelect(null);
    }
  };

  const msFromClientX = (clientX: number) => {
    const rect = laneAreaRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const scrollLeft = laneAreaRef.current?.scrollLeft ?? 0;
    return Math.max(0, (clientX - rect.left + scrollLeft) / pxPerMs);
  };

  const scrubStart = (e: React.MouseEvent) => {
    onScrub(msFromClientX(e.clientX));
    const onMove = (ev: MouseEvent) => onScrub(msFromClientX(ev.clientX));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Shared drag/resize starter for every clip block below -- mirrors the mousedown-then-window-
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
      if (mode === "move") onChange({ start: Math.max(0, Math.round(origStart + deltaMs)) });
      else onChange({ dur: Math.max(50, Math.round(origDur + deltaMs)) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const ticks = useMemo(() => {
    const arr: { ms: number; label: string }[] = [];
    // A stray huge startMs/durationMs typed into the inspector (fat-finger, extra zero) could
    // otherwise balloon this into tens of thousands of DOM nodes -- cap how far we bother
    // drawing ticks regardless of totalMs, safe since nothing meaningful is lost past ~1000
    // ticks (the ruler just stops gaining labels, it doesn't stop scrolling/working).
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
    const isSel = selected?.trackKind === ref.trackKind && selected.id === ref.id;
    return (
      <div
        key={key}
        onMouseDown={(e) => {
          onSelect(ref);
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
              startClipDrag(e, "resize", startMs, durationMs, onChange);
            }}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/25 hover:bg-white/40"
          />
        )}
      </div>
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

  const renderTrackHeader = (key: string, label: string) => (
    <div
      key={key}
      style={{ height: LANE_H }}
      className="flex items-center gap-1.5 px-2 text-[10px] text-[var(--op-50)] border-t border-[var(--op-7)]"
    >
      {headerToggleButtons(key)}
      <span className="truncate">{label}</span>
    </div>
  );

  return (
    <div className="glass rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
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
        <div className="w-56">
          <SearchSelect
            value={undefined}
            onChange={addCastMember}
            options={characters.filter((c) => !cast.includes(c.id)).map((c) => ({ id: c.id, label: c.name }))}
            placeholder="+ Дорожка персонажа…"
            allowClear={false}
          />
        </div>
      </div>

      <div className="flex border border-[var(--op-10)] rounded-md overflow-hidden">
        <div className="shrink-0 bg-[var(--op-4)] border-r border-[var(--op-10)]" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} />
          {renderTrackHeader(cameraTrackKey(), "Камера")}
          {cast.map((charId) => {
            const ch = allEntries.find((e) => e.id === charId);
            return (
              <div
                key={charId}
                style={{ height: LANE_H }}
                className="flex items-center gap-1 px-2 text-[10px] text-[var(--op-50)] border-t border-[var(--op-7)]"
              >
                {headerToggleButtons(characterTrackKey(charId))}
                <span className="truncate flex-1">{ch?.name ?? "?"}</span>
                <button onClick={() => removeCastMember(charId)} className="opacity-40 hover:opacity-100 shrink-0">
                  <X size={10} />
                </button>
              </div>
            );
          })}
          {renderTrackHeader(dialogueTrackKey(), "Диалоги")}
          {renderTrackHeader(audioFxTrackKey(), "Аудио/FX")}
        </div>

        <div ref={laneAreaRef} className="flex-1 overflow-x-auto relative">
          <div style={{ width: timelineWidth, position: "relative" }}>
            <div onMouseDown={scrubStart} style={{ height: RULER_H }} className="relative border-b border-[var(--op-10)] cursor-pointer bg-[var(--op-3)]">
              {ticks.map((tick) => (
                <div
                  key={tick.ms}
                  className="absolute top-0 bottom-0 border-l border-[var(--op-10)] text-[9px] text-[var(--op-30)] pl-1"
                  style={{ left: tick.ms * pxPerMs }}
                >
                  {tick.label}
                </div>
              ))}
            </div>

            <div
              style={{ height: LANE_H }}
              className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(cameraTrackKey()) ? "opacity-40" : ""}`}
              onDoubleClick={(e) => {
                if (lockedTracks.has(cameraTrackKey())) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                setCameraTrack([...cameraTrack, { id: nextId("cam"), startMs: ms, durationMs: 1000, kind: "move", x: 0, y: 0 }]);
              }}
            >
              {cameraTrack.map((c) =>
                renderClip(
                  c.id,
                  { trackKind: "camera", id: c.id },
                  c.startMs,
                  c.durationMs,
                  c.kind === "move" ? "Движение" : c.kind === "zoom" ? "Зум" : "Тряска",
                  TRACK_COLOR.camera,
                  true,
                  lockedTracks.has(cameraTrackKey()),
                  (p) =>
                    setCameraTrack(
                      cameraTrack.map((cc) =>
                        cc.id === c.id
                          ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                          : cc
                      )
                    )
                )
              )}
            </div>

            {cast.map((charId) => {
              const ch = allEntries.find((e) => e.id === charId);
              const clips = charTrack.filter((c) => c.characterId === charId);
              return (
                <div
                  key={charId}
                  style={{ height: LANE_H }}
                  className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(characterTrackKey(charId)) ? "opacity-40" : ""}`}
                  onDoubleClick={(e) => {
                    if (lockedTracks.has(characterTrackKey(charId))) return;
                    const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                    setCharTrack([...charTrack, { id: nextId("cclip"), startMs: ms, durationMs: 1000, kind: "move", characterId: charId, x: 0, y: 0 }]);
                  }}
                >
                  {clips.map((c) =>
                    renderClip(
                      c.id,
                      { trackKind: "character", id: c.id },
                      c.startMs,
                      c.durationMs,
                      `${ch?.name ?? "?"} — ${c.kind === "move" ? "движение" : "анимация"}`,
                      TRACK_COLOR.character,
                      true,
                      lockedTracks.has(characterTrackKey(charId)),
                      (p) =>
                        setCharTrack(
                          charTrack.map((cc) =>
                            cc.id === c.id
                              ? { ...cc, ...(p.start !== undefined ? { startMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                              : cc
                          )
                        )
                    )
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
                setDlgTrack([...dlgTrack, { id: nextId("dclip"), atMs: ms, durationMs: 3000 }]);
              }}
            >
              {dlgTrack.map((c) => {
                const d = dialogues.find((dd) => dd.id === c.dialogueId);
                return renderClip(
                  c.id,
                  { trackKind: "dialogue", id: c.id },
                  c.atMs,
                  c.durationMs,
                  d?.name ?? "Диалог",
                  TRACK_COLOR.dialogue,
                  true,
                  lockedTracks.has(dialogueTrackKey()),
                  (p) =>
                    setDlgTrack(
                      dlgTrack.map((cc) =>
                        cc.id === c.id
                          ? { ...cc, ...(p.start !== undefined ? { atMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
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
                setFxTrack([...fxTrack, { id: nextId("fx"), atMs: ms, kind: "sound" }]);
              }}
            >
              {fxTrack.map((c) => {
                const resizable = c.kind === "fade" || c.kind === "flash";
                return renderClip(
                  c.id,
                  { trackKind: "audiofx", id: c.id },
                  c.atMs,
                  resizable ? c.durationMs ?? 500 : 200,
                  c.kind === "sound" ? "Звук" : c.kind === "music" ? "Музыка" : c.kind === "fade" ? "Затемнение" : "Вспышка",
                  TRACK_COLOR.audiofx,
                  resizable,
                  lockedTracks.has(audioFxTrackKey()),
                  (p) =>
                    setFxTrack(
                      fxTrack.map((cc) =>
                        cc.id === c.id
                          ? { ...cc, ...(p.start !== undefined ? { atMs: p.start } : {}), ...(p.dur !== undefined ? { durationMs: p.dur } : {}) }
                          : cc
                      )
                    )
                );
              })}
            </div>

            <div className="absolute top-0 bottom-0 w-px bg-red-400 pointer-events-none z-10" style={{ left: t * pxPerMs }} />
          </div>
        </div>
      </div>

      <div className="text-[10px] text-[var(--op-30)]">
        Двойной клик по дорожке — добавить клип. Тяните клип целиком, чтобы сдвинуть его во времени; тяните правый край — чтобы растянуть длительность.
      </div>
    </div>
  );
}
