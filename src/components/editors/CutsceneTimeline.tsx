import { useMemo, useRef, useState } from "react";
import { X, Eye, EyeOff, Lock, Unlock, ChevronDown, ChevronRight, Flag, Plus, Scissors, Magnet } from "lucide-react";
import type { AudioFxClip, CameraClip, CharacterClip, CutsceneDialogueClip, Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { cutsceneTotalDurationMs, resolveCamera, resolveCharacters } from "../../lib/cutscenePreview";
import { nextId } from "../../lib/mapDefaults";
import { themedPrompt } from "../../lib/modals";
import { CHARACTER_DRAG_MIME, DIALOGUE_DRAG_MIME } from "./CutsceneExplorerPanel";
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
  const boundMap = allEntries.find((e) => e.id === entry.cutsceneMapId);
  const mapCenterCell = boundMap?.map ? { x: boundMap.map.width / 2, y: boundMap.map.height / 2 } : { x: 0, y: 0 };

  const [pxPerMs, setPxPerMs] = useState(0.08);
  // Collapsing the whole "Персонажи" group is a purely visual/session convenience (like
  // collapsing a folder) -- not persisted, matches the mockup's Characters > Name grouping idea
  // without needing a real generic nested-track-folder system.
  const [charsCollapsed, setCharsCollapsed] = useState(false);
  // Snap-to-frame is an editing-session convenience (like pxPerMs zoom) rather than persisted
  // project data -- when on, dragging/resizing a clip rounds its start/duration to the nearest
  // whole-frame boundary (1000/fps ms) instead of an arbitrary pixel-derived ms value.
  const [snapToFrame, setSnapToFrame] = useState(true);
  const laneAreaRef = useRef<HTMLDivElement>(null);
  const fps = entry.cutsceneFps ?? 60;
  const frameMs = 1000 / fps;
  const snap = (ms: number) => (snapToFrame ? Math.round(ms / frameMs) * frameMs : ms);

  const totalMs = cutsceneTotalDurationMs(entry);
  const timelineWidth = Math.max(400, totalMs * pxPerMs + 120);

  const cast = entry.cutsceneCastCharacterIds ?? [];
  const cameraTrack = entry.cutsceneCameraTrack ?? [];
  const charTrack = entry.cutsceneCharacterTrack ?? [];
  const dlgTrack = entry.cutsceneDialogueTrack ?? [];
  const fxTrack = entry.cutsceneAudioFxTrack ?? [];
  const markers = entry.cutsceneMarkers ?? [];
  const charColors = entry.cutsceneCharacterTrackColors ?? {};

  const setCameraTrack = (next: CameraClip[]) => updateEntry(entry.id, { cutsceneCameraTrack: next });
  const setCharTrack = (next: CharacterClip[]) => updateEntry(entry.id, { cutsceneCharacterTrack: next });
  const setDlgTrack = (next: CutsceneDialogueClip[]) => updateEntry(entry.id, { cutsceneDialogueTrack: next });
  const setFxTrack = (next: AudioFxClip[]) => updateEntry(entry.id, { cutsceneAudioFxTrack: next });
  const setCharColor = (characterId: string, color: string) =>
    updateEntry(entry.id, { cutsceneCharacterTrackColors: { ...charColors, [characterId]: color } });

  const addMarker = async () => {
    const label = await themedPrompt("Название маркера", "");
    if (label === null) return;
    updateEntry(entry.id, { cutsceneMarkers: [...markers, { id: nextId("marker"), atMs: Math.round(t), label: label || "Маркер" }] });
  };
  const removeMarker = (id: string) => updateEntry(entry.id, { cutsceneMarkers: markers.filter((m) => m.id !== id) });

  // Generic split-at-time helper for the scissors tool below -- works identically across all
  // four track kinds since they all reduce to "a clip with some start time and some duration".
  // Returns null (no-op) if the given time doesn't fall STRICTLY inside the clip's own window
  // (splitting exactly on a boundary would just produce a zero-length sliver).
  function splitTrack<T extends { id: string }>(
    track: T[],
    clipId: string,
    at: number,
    getRange: (c: T) => { start: number; dur: number },
    withRange: (c: T, start: number, dur: number) => T
  ): T[] | null {
    const idx = track.findIndex((c) => c.id === clipId);
    if (idx === -1) return null;
    const c = track[idx];
    const { start, dur } = getRange(c);
    if (at <= start || at >= start + dur) return null;
    const first = withRange(c, start, at - start);
    const second = withRange({ ...c, id: nextId("split") }, at, start + dur - at);
    const next = [...track];
    next.splice(idx, 1, first, second);
    return next;
  }

  const splitSelected = () => {
    if (!selected) return;
    if (selected.trackKind === "camera") {
      const next = splitTrack(
        cameraTrack,
        selected.id,
        t,
        (c) => ({ start: c.startMs, dur: c.durationMs }),
        (c, start, dur) => ({ ...c, startMs: start, durationMs: dur })
      );
      if (next) setCameraTrack(next);
    } else if (selected.trackKind === "character") {
      const next = splitTrack(
        charTrack,
        selected.id,
        t,
        (c) => ({ start: c.startMs, dur: c.durationMs }),
        (c, start, dur) => ({ ...c, startMs: start, durationMs: dur })
      );
      if (next) setCharTrack(next);
    } else if (selected.trackKind === "dialogue") {
      const next = splitTrack(
        dlgTrack,
        selected.id,
        t,
        (c) => ({ start: c.atMs, dur: c.durationMs }),
        (c, start, dur) => ({ ...c, atMs: start, durationMs: dur })
      );
      if (next) setDlgTrack(next);
    } else if (selected.trackKind === "audiofx") {
      const next = splitTrack(
        fxTrack,
        selected.id,
        t,
        (c) => ({ start: c.atMs, dur: c.durationMs ?? 500 }),
        (c, start, dur) => ({ ...c, atMs: start, durationMs: dur })
      );
      if (next) setFxTrack(next);
    }
  };

  const canSplit = (() => {
    if (!selected) return false;
    const find = (arr: { id: string }[]) => arr.find((c) => c.id === selected.id);
    if (selected.trackKind === "camera") {
      const c = find(cameraTrack) as CameraClip | undefined;
      return !!c && t > c.startMs && t < c.startMs + c.durationMs;
    }
    if (selected.trackKind === "character") {
      const c = find(charTrack) as CharacterClip | undefined;
      return !!c && t > c.startMs && t < c.startMs + c.durationMs;
    }
    if (selected.trackKind === "dialogue") {
      const c = find(dlgTrack) as CutsceneDialogueClip | undefined;
      return !!c && t > c.atMs && t < c.atMs + c.durationMs;
    }
    const c = find(fxTrack) as AudioFxClip | undefined;
    const dur = c?.durationMs ?? 500;
    return !!c && t > c.atMs && t < c.atMs + dur;
  })();

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
          {renderTrackHeader(cameraTrackKey(), "Камера")}
          {cast.length > 0 && (
            <div
              style={{ height: LANE_H }}
              className="flex items-center gap-1 px-2 text-[10px] text-[var(--op-45)] border-t border-[var(--op-7)] cursor-pointer hover:text-[var(--op-70)]"
              onClick={() => setCharsCollapsed((v) => !v)}
            >
              {charsCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              <span className="truncate flex-1">Персонажи ({cast.length})</span>
            </div>
          )}
          {!charsCollapsed &&
            cast.map((charId) => {
              const ch = allEntries.find((e) => e.id === charId);
              return (
                <div
                  key={charId}
                  style={{ height: LANE_H }}
                  className="flex items-center gap-1 pl-4 pr-2 text-[10px] text-[var(--op-50)] border-t border-[var(--op-7)]"
                >
                  {headerToggleButtons(characterTrackKey(charId))}
                  <input
                    type="color"
                    value={charColors[charId] ?? TRACK_COLOR.character}
                    onChange={(e) => setCharColor(charId, e.target.value)}
                    title="Цвет дорожки"
                    className="w-3.5 h-3.5 rounded-sm border-0 bg-transparent shrink-0 cursor-pointer p-0"
                  />
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

        <div
          ref={laneAreaRef}
          className="flex-1 overflow-x-auto relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const characterId = e.dataTransfer.getData(CHARACTER_DRAG_MIME);
            if (characterId) addCastMember(characterId);
          }}
        >
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

            <div
              style={{ height: LANE_H }}
              className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(cameraTrackKey()) ? "opacity-40" : ""}`}
              onDoubleClick={(e) => {
                if (lockedTracks.has(cameraTrackKey())) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                // Default to wherever the camera ALREADY resolves to at this time, not a
                // hardcoded 0,0 (map corner) -- so adding a keyframe doesn't make the camera
                // visually jump anywhere until you actually drag it.
                const resolved = resolveCamera(cameraTrack, ms, mapCenterCell);
                setCameraTrack([...cameraTrack, { id: nextId("cam"), startMs: ms, durationMs: 1000, kind: "move", x: resolved.x, y: resolved.y }]);
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

            {cast.length > 0 && <div style={{ height: LANE_H }} className="border-t border-[var(--op-7)]" />}

            {!charsCollapsed &&
              cast.map((charId) => {
              const ch = allEntries.find((e) => e.id === charId);
              const clips = charTrack.filter((c) => c.characterId === charId);
              const color = charColors[charId] ?? TRACK_COLOR.character;
              return (
                <div
                  key={charId}
                  style={{ height: LANE_H }}
                  className={`relative border-t border-[var(--op-7)] ${hiddenTracks.has(characterTrackKey(charId)) ? "opacity-40" : ""}`}
                  onDoubleClick={(e) => {
                    if (lockedTracks.has(characterTrackKey(charId))) return;
                    const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                    // Same "don't jump to 0,0" fix as the camera lane -- default to wherever
                    // THIS character already resolves to at this time.
                    const resolved = resolveCharacters(
                      charTrack.filter((c) => c.characterId === charId),
                      ms,
                      mapCenterCell
                    );
                    const pos = resolved.find((r) => r.characterId === charId) ?? mapCenterCell;
                    setCharTrack([
                      ...charTrack,
                      { id: nextId("cclip"), startMs: ms, durationMs: 1000, kind: "move", characterId: charId, x: pos.x, y: pos.y },
                    ]);
                  }}
                >
                  {clips.map((c) =>
                    renderClip(
                      c.id,
                      { trackKind: "character", id: c.id },
                      c.startMs,
                      c.durationMs,
                      `${ch?.name ?? "?"} — ${c.kind === "move" ? "движение" : "анимация"}`,
                      color,
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
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (lockedTracks.has(dialogueTrackKey())) return;
                const dialogueId = e.dataTransfer.getData(DIALOGUE_DRAG_MIME);
                if (!dialogueId) return;
                const ms = Math.max(0, Math.round(msFromClientX(e.clientX)));
                setDlgTrack([...dlgTrack, { id: nextId("dclip"), atMs: ms, durationMs: 3000, dialogueId }]);
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
