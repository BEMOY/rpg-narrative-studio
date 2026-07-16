import { Trash2, ExternalLink } from "lucide-react";
import type {
  AudioFxClip,
  AudioFxKind,
  CameraClip,
  CharacterAnimState,
  CharacterClip,
  ClipEasing,
  CutsceneDialogueClip,
  Entry,
} from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { ThemedSelect } from "../common/ThemedSelect";
import { SearchSelect } from "../dialogue/SearchSelect";
import type { ClipRef } from "./CutsceneTimeline";

// Small inline label+number-input pair packing several numeric params onto one inspector row --
// Field (EntryEditor.tsx) is a full-width label/input row meant for general Section forms, too
// wide for this.
function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
      {label}
      <input type="number" step={step} className="input text-xs w-20" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const AUDIOFX_KIND_LABEL: Record<AudioFxKind, string> = {
  sound: "Звук",
  music: "Музыка",
  fade: "Затемнение",
  flash: "Вспышка",
};

const ANIM_STATE_LABEL: Record<CharacterAnimState, string> = {
  idle: "Idle (стоит)",
  walk: "Walk (шаг)",
  run: "Run (бег)",
};

const CHAR_ANIM_OPTIONS: CharacterAnimState[] = ["idle", "walk", "run"];

const EASING_LABEL: Record<ClipEasing, string> = {
  linear: "Linear",
  easeIn: "Ease In",
  easeOut: "Ease Out",
  bounce: "Bounce",
};
const EASING_OPTIONS: ClipEasing[] = ["linear", "easeIn", "easeOut", "bounce"];

function EasingField({ value, onChange }: { value: ClipEasing | undefined; onChange: (v: ClipEasing) => void }) {
  return (
    <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
      Плавность
      <ThemedSelect
        className="input w-28"
        value={value ?? "linear"}
        onChange={(v) => onChange(v as ClipEasing)}
        options={EASING_OPTIONS.map((e) => ({ value: e, label: EASING_LABEL[e] }))}
      />
    </label>
  );
}

// Precise numeric/kind-specific property editor for whichever clip is currently selected on the
// CutsceneTimeline (rendered alongside it in CutsceneEditorModal) -- the rough position/duration
// are set by dragging on the timeline, this panel is for exact values and kind-specific params
// (camera x/y/zoom/intensity/easing, dialogue reference + a quick jump into the dialogue graph
// editor itself, audio/fx asset name & color, etc).
export function ClipInspector({
  entry,
  selected,
  onClose,
  onOpenDialogue,
}: {
  entry: Entry;
  selected: ClipRef | null;
  onClose: () => void;
  onOpenDialogue: (dialogueId: string) => void;
}) {
  const updateEntry = useProjectStore((s) => s.updateEntry);
  const dialogues = useProjectStore((s) => s.project.dialogues);
  const allEntries = useProjectStore((s) => s.project.entries);

  if (!selected) {
    return <div className="glass rounded-lg p-4 text-xs text-[var(--op-30)]">Выберите клип на таймлайне, чтобы отредактировать его параметры точно.</div>;
  }

  if (selected.trackKind === "camera") {
    const track = entry.cutsceneCameraTrack ?? [];
    const clip = track.find((c) => c.id === selected.id);
    if (!clip) return null;
    const patch = (p: Partial<CameraClip>) => updateEntry(entry.id, { cutsceneCameraTrack: track.map((c) => (c.id === clip.id ? { ...c, ...p } : c)) });
    const remove = () => {
      updateEntry(entry.id, { cutsceneCameraTrack: track.filter((c) => c.id !== clip.id) });
      onClose();
    };
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Камера — клип</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <ThemedSelect
          className="input"
          value={clip.kind}
          onChange={(v) => patch({ kind: v as CameraClip["kind"] })}
          options={[
            { value: "move", label: "Движение" },
            { value: "zoom", label: "Зум" },
            { value: "shake", label: "Тряска" },
          ]}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Начало мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
          <NumField label="Длит. мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
          {clip.kind === "move" && (
            <>
              <NumField label="X" value={clip.x ?? 0} onChange={(v) => patch({ x: v })} />
              <NumField label="Y" value={clip.y ?? 0} onChange={(v) => patch({ y: v })} />
              <EasingField value={clip.easing} onChange={(v) => patch({ easing: v })} />
            </>
          )}
          {clip.kind === "zoom" && (
            <>
              <NumField label="Зум" value={clip.zoom ?? 1} step={0.1} onChange={(v) => patch({ zoom: v })} />
              <EasingField value={clip.easing} onChange={(v) => patch({ easing: v })} />
            </>
          )}
          {clip.kind === "shake" && <NumField label="Сила" value={clip.intensity ?? 0.3} step={0.05} onChange={(v) => patch({ intensity: v })} />}
        </div>
      </div>
    );
  }

  if (selected.trackKind === "character") {
    const track = entry.cutsceneCharacterTrack ?? [];
    const clip = track.find((c) => c.id === selected.id);
    if (!clip) return null;
    const patch = (p: Partial<CharacterClip>) => updateEntry(entry.id, { cutsceneCharacterTrack: track.map((c) => (c.id === clip.id ? { ...c, ...p } : c)) });
    const remove = () => {
      updateEntry(entry.id, { cutsceneCharacterTrack: track.filter((c) => c.id !== clip.id) });
      onClose();
    };
    const character = allEntries.find((e) => e.id === clip.characterId);
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Персонаж — клип{character ? ` (${character.name})` : ""}</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <ThemedSelect
          className="input"
          value={clip.kind}
          onChange={(v) => patch({ kind: v as CharacterClip["kind"] })}
          options={[
            { value: "move", label: "Движение" },
            { value: "animate", label: "Анимация" },
          ]}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Начало мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
          <NumField label="Длит. мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
          {clip.kind === "move" && (
            <>
              <NumField label="X" value={clip.x ?? 0} onChange={(v) => patch({ x: v })} />
              <NumField label="Y" value={clip.y ?? 0} onChange={(v) => patch({ y: v })} />
              <EasingField value={clip.easing} onChange={(v) => patch({ easing: v })} />
            </>
          )}
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Анимация
            <ThemedSelect
              className="input w-24"
              value={clip.anim ?? (clip.kind === "move" ? "walk" : "idle")}
              onChange={(v) => patch({ anim: v as CharacterAnimState })}
              options={CHAR_ANIM_OPTIONS.map((a) => ({ value: a, label: ANIM_STATE_LABEL[a] }))}
            />
          </label>
        </div>
      </div>
    );
  }

  if (selected.trackKind === "dialogue") {
    const track = entry.cutsceneDialogueTrack ?? [];
    const clip = track.find((c) => c.id === selected.id);
    if (!clip) return null;
    const patch = (p: Partial<CutsceneDialogueClip>) =>
      updateEntry(entry.id, { cutsceneDialogueTrack: track.map((c) => (c.id === clip.id ? { ...c, ...p } : c)) });
    const remove = () => {
      updateEntry(entry.id, { cutsceneDialogueTrack: track.filter((c) => c.id !== clip.id) });
      onClose();
    };
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Диалог — клип</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <SearchSelect
          value={clip.dialogueId}
          onChange={(id) => patch({ dialogueId: id })}
          options={dialogues.map((d) => ({ id: d.id, label: d.name }))}
          placeholder="Диалог…"
        />
        {clip.dialogueId && (
          <button
            onClick={() => onOpenDialogue(clip.dialogueId!)}
            className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]"
          >
            <ExternalLink size={12} /> Открыть в редакторе диалогов
          </button>
        )}
        <label className="flex items-center gap-1.5 text-xs text-[var(--op-50)]">
          <input type="checkbox" checked={clip.blocking ?? true} onChange={(e) => patch({ blocking: e.target.checked })} />
          Катсцена ждёт окончания диалога
        </label>
        {!(clip.blocking ?? true) && (
          <div className="text-[10px] text-[var(--op-30)]">
            Исключение: остальные дорожки продолжают идти, пока показывается этот диалог.
          </div>
        )}
        <div className="flex items-center gap-2">
          <NumField label="Начало мс" value={clip.atMs} onChange={(v) => patch({ atMs: v })} />
          <NumField label="Показ мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
        </div>
      </div>
    );
  }

  const track = entry.cutsceneAudioFxTrack ?? [];
  const clip = track.find((c) => c.id === selected.id);
  if (!clip) return null;
  const patch = (p: Partial<AudioFxClip>) => updateEntry(entry.id, { cutsceneAudioFxTrack: track.map((c) => (c.id === clip.id ? { ...c, ...p } : c)) });
  const remove = () => {
    updateEntry(entry.id, { cutsceneAudioFxTrack: track.filter((c) => c.id !== clip.id) });
    onClose();
  };
  return (
    <div className="glass rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Аудио/FX — клип</div>
        <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
          <Trash2 size={13} />
        </button>
      </div>
      <ThemedSelect
        className="input"
        value={clip.kind}
        onChange={(v) => patch({ kind: v as AudioFxKind })}
        options={(Object.keys(AUDIOFX_KIND_LABEL) as AudioFxKind[]).map((k) => ({ value: k, label: AUDIOFX_KIND_LABEL[k] }))}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <NumField label="Момент мс" value={clip.atMs} onChange={(v) => patch({ atMs: v })} />
        {(clip.kind === "sound" || clip.kind === "music") && (
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Ассет (GML)
            <input className="input text-xs w-32" value={clip.assetName ?? ""} placeholder="snd_..." onChange={(e) => patch({ assetName: e.target.value })} />
          </label>
        )}
        {(clip.kind === "fade" || clip.kind === "flash") && (
          <NumField label="Длит. мс" value={clip.durationMs ?? 500} onChange={(v) => patch({ durationMs: v })} />
        )}
        {clip.kind === "fade" && (
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Направление
            <ThemedSelect
              className="input w-28"
              value={clip.direction ?? "out"}
              onChange={(v) => patch({ direction: v as "in" | "out" })}
              options={[
                { value: "out", label: "В темноту" },
                { value: "in", label: "Из темноты" },
              ]}
            />
          </label>
        )}
        {clip.kind === "flash" && (
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Цвет
            <input
              type="color"
              className="w-8 h-6 rounded border border-[var(--op-10)] bg-transparent"
              value={clip.color ?? "#ffffff"}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </label>
        )}
      </div>
    </div>
  );
}
