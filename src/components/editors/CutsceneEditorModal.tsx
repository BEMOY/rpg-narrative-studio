import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Play, Pause, Square, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Repeat, SkipBack, SkipForward } from "lucide-react";
import type { CutsceneClip, Entry } from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { allClipBoundaries, cutsceneTotalDurationMs } from "../../lib/cutscenePreview";
import { trackClips } from "../../lib/cutsceneTracks";
import { SearchSelect } from "../dialogue/SearchSelect";
import { CutsceneTimeline } from "./CutsceneTimeline";
import type { ClipRef } from "./CutsceneTimeline";
import { CutscenePreview } from "./CutscenePreview";
import { ClipInspector } from "./ClipInspector";
import { CutsceneDebugPanel } from "./CutsceneDebugPanel";

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
  const dialogues = useProjectStore((s) => s.project.dialogues);
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
  // Collapsing the timeline gives the preview stage the full window -- a "big screen" mode for
  // when you just want to watch/scrub without the dorожки taking up half the height. Session-only
  // UI state, not persisted.
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  // Set while PLAYING (not while just scrubbing the slider) has just reached a dialogue clip
  // whose `blocking` flag is true (default) -- the timeline stops advancing and the real
  // dialogue Test-Play window (see TestPlayModal.tsx, rendered further down, byte-identical to
  // the one in the Dialogue editor) takes over until the player closes it.
  const [awaitingDialogue, setAwaitingDialogue] = useState<CutsceneClip | null>(null);
  // A second, independently free-running clock -- while `awaitingDialogue` is set, `t` itself
  // is frozen (see the raf loop below, gated on `playing`), but any individual clip whose own
  // `pausesForDialogue` is explicitly false is meant to keep animating on REAL elapsed time
  // regardless. `tLive` starts counting from the freeze point the instant a dialogue gate
  // begins and is what those specific clips get resolved against instead of the frozen `t` (see
  // CutscenePreview's use of the `tLive` prop, threaded into resolveCamera/resolveCharacters).
  const [tLive, setTLive] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef(0);
  const tLiveRafRef = useRef<number | undefined>(undefined);
  const tLiveLastRef = useRef(0);
  const prevTRef = useRef(-1); // sentinel below 0 so a dialogue clip sitting at atMs===0 still gates correctly on the very first tick

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

  // Runs only while gated on a blocking dialogue -- resets to the freeze point the instant
  // gating begins, then free-runs on real elapsed time until the dialogue ends (awaitingDialogue
  // goes back to null, at which point normal playback resumes from the still-frozen `t`, and any
  // clip that WAS following tLive simply holds at wherever tLive left it, same as any other clip
  // holds at its own last resolved value once its window has passed).
  useEffect(() => {
    if (!awaitingDialogue) return;
    setTLive(t);
    tLiveLastRef.current = 0;
    const step = (ts: number) => {
      if (tLiveLastRef.current === 0) tLiveLastRef.current = ts;
      const dt = ts - tLiveLastRef.current;
      tLiveLastRef.current = ts;
      setTLive((prev) => prev + dt);
      tLiveRafRef.current = requestAnimationFrame(step);
    };
    tLiveRafRef.current = requestAnimationFrame(step);
    return () => {
      if (tLiveRafRef.current !== undefined) cancelAnimationFrame(tLiveRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingDialogue]);

  // Dialogue gating -- only while actually playing (auto-advancing), never while the user is
  // just dragging the scrub slider by hand. Detects "just crossed into a blocking clip's atMs
  // since the last check" by comparing against prevTRef, rather than reacting inside setT's own
  // updater (which must stay a pure function of its previous value).
  useEffect(() => {
    if (!playing) {
      prevTRef.current = t;
      return;
    }
    const hit = trackClips(entry.cutsceneTracks ?? [], "dialogue")
      .filter((c) => {
        if (c.component.kind !== "dialogue") return false;
        const dialogueId = c.component.dialogueId;
        return dialogues.some((d) => d.id === dialogueId);
      })
      .find((c) => prevTRef.current < c.startMs && t >= c.startMs);
    if (hit) {
      setPlaying(false);
      setAwaitingDialogue(hit);
    }
    prevTRef.current = t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, playing, entry.cutsceneTracks, dialogues]);

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

  // Real STOP (not pause) -- ends the cutscene entirely and snaps everything back to 0, unlike
  // Play/Pause which just freezes wherever the playhead happens to be. Also immediately tears
  // down any dialogue currently blocking playback (rather than letting the player finish reading
  // it) -- awaitingDialogue going back to null unmounts the embedded dialogue player in
  // CutscenePreview on the very next render, so the dialogue box disappears instantly along with
  // everything else resetting to t=0.
  const stopCutscene = () => {
    setPlaying(false);
    setAwaitingDialogue(null);
    setTLive(0);
    setT(0);
  };

  // Coarser than stepFrame -- jumps straight to the nearest previous/next clip boundary (start
  // or end of ANY clip on ANY track) instead of moving one frame at a time, matching a real
  // NLE's "jump to next edit point" transport buttons.
  const jumpToBoundary = (dir: -1 | 1) => {
    setPlaying(false);
    const bounds = allClipBoundaries(entry);
    if (dir === 1) {
      const next = bounds.find((b) => b > t + 0.5);
      if (next !== undefined) setT(next);
    } else {
      const prev = [...bounds].reverse().find((b) => b < t - 0.5);
      if (prev !== undefined) setT(prev);
    }
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

  const awaitingDialogueId = awaitingDialogue?.component.kind === "dialogue" ? awaitingDialogue.component.dialogueId : undefined;
  const awaitingDialogueEntry = awaitingDialogueId ? dialogues.find((d) => d.id === awaitingDialogueId) : undefined;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3">
      <div className="glass rounded-lg w-full h-full max-w-[1500px] flex flex-col overflow-hidden select-none">
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
          <button
            onClick={() => jumpToBoundary(-1)}
            title="К предыдущей границе клипа"
            className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)]"
          >
            <SkipBack size={13} />
          </button>
          <button onClick={() => stepFrame(-1)} title="Предыдущий кадр" className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]"
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button
            onClick={stopCutscene}
            title="Стоп — закончить катсцену и вернуться к 0"
            className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)] text-[var(--op-55)]"
          >
            <Square size={12} />
          </button>
          <button onClick={() => stepFrame(1)} title="Следующий кадр" className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)]">
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => jumpToBoundary(1)}
            title="К следующей границе клипа"
            className="w-7 h-7 grid place-items-center rounded-md hover:bg-[var(--op-10)]"
          >
            <SkipForward size={13} />
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
            <div className="flex-1 overflow-hidden p-4 flex items-center justify-center">
              <CutscenePreview
                entry={entry}
                t={t}
                tLive={awaitingDialogue ? tLive : t}
                playing={playing}
                hiddenTracks={hiddenTracks}
                awaitingDialogueEntry={awaitingDialogueEntry}
                onDialogueDone={() => {
                  setAwaitingDialogue(null);
                  setPlaying(true);
                }}
              />
            </div>
            <div className="shrink-0 border-t border-[var(--op-10)]">
              <button
                onClick={() => setTimelineCollapsed((v) => !v)}
                title={timelineCollapsed ? "Развернуть таймлайн" : "Свернуть таймлайн (превью на весь экран)"}
                className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] text-[var(--op-40)] hover:bg-[var(--op-5)] hover:text-[var(--op-70)]"
              >
                {timelineCollapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                Таймлайн{timelineCollapsed ? " (свёрнут)" : ""}
              </button>
              {!timelineCollapsed && (
                <div className="overflow-x-auto px-3 pb-3">
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
              )}
            </div>
          </div>
          <div className="w-72 shrink-0 border-l border-[var(--op-10)] overflow-y-auto p-3 space-y-3">
            <ClipInspector entry={entry} selected={selected} onClose={() => setSelected(null)} onOpenDialogue={openDialogueInEditor} />
            <CutsceneDebugPanel entry={entry} t={t} totalMs={totalMs} awaitingDialogueEntry={awaitingDialogueEntry} />
          </div>
        </div>
      </div>

    </div>,
    document.body
  );
}
