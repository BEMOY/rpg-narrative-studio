import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Play, Pause, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import type { Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { cutsceneTotalDurationMs } from "../../lib/cutscenePreview";
import { SearchSelect } from "../dialogue/SearchSelect";
import { CutsceneTimeline } from "./CutsceneTimeline";
import type { ClipRef } from "./CutsceneTimeline";
import { CutscenePreview } from "./CutscenePreview";
import { ClipInspector } from "./ClipInspector";

// The standalone Cutscene editor WINDOW (Dynarain Phase 2) -- a full-screen modal, same
// architectural pattern as MapEditorModal.tsx, rather than settings buried inside the Entry
// card. Owns the one shared piece of state every collaborating panel is really just a view
// onto (playhead t / playing / loop / fps / which clip is selected / which tracks are
// hidden-from-preview or locked-from-editing) -- CutsceneTimeline, ClipInspector and
// CutscenePreview are all "dumb" components driven by props from here, the same way a real
// NLE's timeline, effect-controls panel and program monitor are three views onto one project.
//
// Rendered through a portal straight to <body> (see EquipmentPresetsModal's doc comment for
// why -- the entry card this opens from lives inside `.glass` Sections, whose backdrop-filter
// would otherwise break "fixed inset-0" positioning).
export function CutsceneEditorModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const allEntries = useProjectStore((s) => s.project.entries);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const showDialogues = useProjectStore((s) => s.showDialogues);

  const locations = allEntries.filter((e) => e.category === "location");
  const fps = entry.cutsceneFps ?? 60;

  const totalMs = cutsceneTotalDurationMs(entry);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [selected, setSelected] = useState<ClipRef | null>(null);
  const [hiddenTracks, setHiddenTracks] = useState<Set<string>>(new Set());
  const [lockedTracks, setLockedTracks] = useState<Set<string>>(new Set());
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
        if (next >= totalMs) next = loop ? (totalMs <= 0 ? 0 : next % totalMs) : totalMs;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stepFrame = (dir: -1 | 1) => {
    setPlaying(false);
    setT((prev) => Math.max(0, Math.min(totalMs, prev + (dir * 1000) / fps)));
  };

  const toggleHidden = (key: string) =>
    setHiddenTracks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleLocked = (key: string) =>
    setLockedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openDialogueInEditor = (dialogueId: string) => {
    setActiveDialogue(dialogueId);
    showDialogues();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
      <div className="glass rounded-lg w-full h-full max-w-[1500px] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm font-medium px-1">Редактор катсцены — {entry.name}</div>
          <div className="flex-1" />
          <button onClick={onClose} title="Закрыть (Esc)" className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] shrink-0 flex-wrap">
          <div className="w-56">
            <SearchSelect
              value={entry.cutsceneMapId}
              onChange={(id) => updateEntry(entry.id, { cutsceneMapId: id })}
              options={locations.map((l) => ({ id: l.id, label: l.name }))}
              placeholder="Локация…"
            />
          </div>
          <div className="w-px h-5 bg-[var(--op-10)] mx-1" />
          <button onClick={() => stepFrame(-1)} title="Предыдущий кадр" className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button onClick={() => stepFrame(1)} title="Следующий кадр" className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setLoop((v) => !v)}
            title="Циклическое воспроизведение"
            className={`w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)] ${loop ? "text-accent" : "text-[var(--op-40)]"}`}
          >
            <Repeat size={14} />
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
            className="flex-1 min-w-[160px]"
          />
          <span className="text-[10px] mono text-[var(--op-40)] w-28 text-right shrink-0">
            {Math.round(t)} / {totalMs} мс
          </span>
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1 shrink-0">
            FPS
            <input
              type="number"
              className="input text-xs w-14"
              value={fps}
              min={1}
              onChange={(e) => updateEntry(entry.id, { cutsceneFps: Math.max(1, Number(e.target.value)) })}
            />
          </label>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              <CutscenePreview entry={entry} t={t} hiddenTracks={hiddenTracks} />
            </div>
            <div className="shrink-0 overflow-x-auto p-3 border-t border-[var(--op-10)]">
              <CutsceneTimeline
                entry={entry}
                t={t}
                onScrub={(ms) => {
                  setPlaying(false);
                  setT(ms);
                }}
                selected={selected}
                onSelect={setSelected}
                hiddenTracks={hiddenTracks}
                lockedTracks={lockedTracks}
                onToggleHidden={toggleHidden}
                onToggleLocked={toggleLocked}
              />
            </div>
          </div>
          <div className="w-72 shrink-0 border-l border-[var(--op-10)] overflow-y-auto p-3">
            <ClipInspector entry={entry} selected={selected} onClose={() => setSelected(null)} onOpenDialogue={openDialogueInEditor} />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
