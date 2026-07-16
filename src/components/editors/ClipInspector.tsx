import { Trash2, ExternalLink } from "lucide-react";
import type {
  AudioFxKind,
  CharacterAnchor,
  CharacterAnimState,
  CharacterPositionKeyframe,
  ClipEasing,
  CutsceneEventKind,
  Entry,
  Keyframe,
} from "../../types/database";
import { useProjectStore } from "../../store/useProjectStore";
import { castLabel, findClipAnywhere, trackClips, withTrackClips } from "../../lib/cutsceneTracks";
import { ThemedSelect } from "../common/ThemedSelect";
import { SearchSelect } from "../dialogue/SearchSelect";
import { EVENT_KIND_LABEL } from "./CutsceneTimeline";
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

// 3x3 anchor/pivot picker -- which point of the character's sprite box the clip's x/y refers to
// (default "center", same behavior as before this field existed). Small square-button grid
// rather than a dropdown so the spatial meaning (top-left vs bottom-center vs ...) is immediate.
const ANCHOR_GRID: CharacterAnchor[][] = [
  ["top-left", "top-center", "top-right"],
  ["middle-left", "center", "middle-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];

function AnchorField({ value, onChange }: { value: CharacterAnchor | undefined; onChange: (v: CharacterAnchor) => void }) {
  const current = value ?? "center";
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[10px] text-[var(--op-40)] pt-1">Точка привязки</span>
      <div className="grid grid-cols-3 gap-0.5 w-[54px]">
        {ANCHOR_GRID.flat().map((a) => (
          <button
            key={a}
            type="button"
            title={a}
            onClick={() => onChange(a)}
            className={`w-4 h-4 rounded-sm border ${
              a === current ? "bg-accent border-accent" : "bg-[var(--op-6)] border-[var(--op-15)] hover:bg-[var(--op-15)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function TagsField({ value, onChange }: { value: string[] | undefined; onChange: (v: string[]) => void }) {
  return (
    <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1 flex-1">
      Теги
      <input
        className="input text-xs flex-1"
        value={(value ?? []).join(", ")}
        placeholder="радость, важное…"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          )
        }
      />
    </label>
  );
}

// Shared "Ждёт диалог" toggle for camera/character/audiofx clips -- default true (respects a
// currently-blocking dialogue elsewhere on the timeline and freezes along with it); unchecking
// it lets this specific clip keep animating on real elapsed time while the rest of the scene is
// paused for the conversation. See the "shake" CutsceneComponent's doc comment for the full
// rationale (this used to be one blanket checkbox on the dialogue clip itself).
function PausesForDialogueField({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[var(--op-50)]">
      <input type="checkbox" checked={value ?? true} onChange={(e) => onChange(e.target.checked)} />
      Ждёт диалог
    </label>
  );
}

// Precise numeric/kind-specific property editor for whichever clip is currently selected on the
// CutsceneTimeline (rendered alongside it in CutsceneEditorModal) -- the rough position/duration
// are set by dragging on the timeline, this panel is for exact values and kind-specific params
// (camera intensity/easing, actor appearance fields, dialogue reference + a quick jump into the
// dialogue graph editor itself, audio/fx asset name & color, etc). Every clip kind here is a
// generic CutsceneClip from entry.cutsceneTracks (see the Track+Clip+Component doc comment above
// CutsceneTrackKind in types/database.ts) -- each section below just reads/writes that particular
// clip's typed `component` payload.
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
  const tracks = entry.cutsceneTracks ?? [];

  if (!selected) {
    return <div className="glass rounded-lg p-4 text-xs text-[var(--op-30)]">Выберите клип на таймлайне, чтобы отредактировать его параметры точно.</div>;
  }

  if (selected.trackKind === "camera") {
    const clips = trackClips(tracks, "camera");
    const clip = clips.find((c) => c.id === selected.id);
    if (!clip || clip.component.kind !== "shake") return null;
    const component = clip.component;
    const patch = (p: { startMs?: number; durationMs?: number; intensity?: number; pausesForDialogue?: boolean }) =>
      updateEntry(entry.id, {
        cutsceneTracks: withTrackClips(
          tracks,
          "camera",
          clips.map((c) =>
            c.id === clip.id
              ? {
                  ...c,
                  ...(p.startMs !== undefined ? { startMs: p.startMs } : {}),
                  ...(p.durationMs !== undefined ? { durationMs: p.durationMs } : {}),
                  component: { ...component, ...(p.intensity !== undefined ? { intensity: p.intensity } : {}), ...(p.pausesForDialogue !== undefined ? { pausesForDialogue: p.pausesForDialogue } : {}) },
                }
              : c
          )
        ),
      });
    const remove = () => {
      updateEntry(entry.id, { cutsceneTracks: withTrackClips(tracks, "camera", clips.filter((c) => c.id !== clip.id)) });
      onClose();
    };
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Камера — тряска</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="text-[10px] text-[var(--op-30)]">
          Позиция и зум камеры теперь задаются ключами (ромбики на дорожках «Камера: X/Y/Zoom») — выберите ключ на
          таймлайне, чтобы отредактировать его. Здесь — только клип тряски.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Начало мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
          <NumField label="Длит. мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
          <NumField label="Сила" value={component.intensity ?? 0.3} step={0.05} onChange={(v) => patch({ intensity: v })} />
        </div>
        <PausesForDialogueField value={component.pausesForDialogue} onChange={(v) => patch({ pausesForDialogue: v })} />
      </div>
    );
  }

  if (selected.trackKind === "cameraKey") {
    const channelField =
      selected.channel === "x" ? "cutsceneCameraPosX" : selected.channel === "y" ? "cutsceneCameraPosY" : "cutsceneCameraZoomKeys";
    const keys = (entry[channelField] ?? []) as Keyframe[];
    const key = keys.find((k) => k.id === selected.id);
    if (!key) return null;
    const patch = (p: Partial<Keyframe>) => updateEntry(entry.id, { [channelField]: keys.map((k) => (k.id === key.id ? { ...k, ...p } : k)) });
    const remove = () => {
      updateEntry(entry.id, { [channelField]: keys.filter((k) => k.id !== key.id) });
      onClose();
    };
    const channelLabel = selected.channel === "x" ? "X" : selected.channel === "y" ? "Y" : "Zoom";
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Камера — ключ {channelLabel}</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Время мс" value={key.atMs} onChange={(v) => patch({ atMs: Math.max(0, v) })} />
          <NumField label={channelLabel} value={key.value} step={selected.channel === "zoom" ? 0.1 : 0.1} onChange={(v) => patch({ value: v })} />
          <EasingField value={key.easing} onChange={(v) => patch({ easing: v })} />
        </div>
        <div className="text-[10px] text-[var(--op-30)]">
          Интерполяция идёт только между этим ключом и его соседями — изменение не затронет остальную часть таймлайна.
        </div>
      </div>
    );
  }

  if (selected.trackKind === "character") {
    const found = findClipAnywhere(tracks, "character", selected.id);
    if (!found) return null;
    const { track, clip } = found;
    if (clip.component.kind !== "animation") return null;
    const characterId = track.characterId!;
    const clips = trackClips(tracks, "character", characterId);
    const component = clip.component;
    const patch = (p: Partial<typeof component> & { startMs?: number; durationMs?: number }) => {
      const { startMs, durationMs, ...componentPatch } = p;
      updateEntry(entry.id, {
        cutsceneTracks: withTrackClips(
          tracks,
          "character",
          clips.map((c) =>
            c.id === clip.id
              ? {
                  ...c,
                  ...(startMs !== undefined ? { startMs } : {}),
                  ...(durationMs !== undefined ? { durationMs } : {}),
                  component: { ...component, ...componentPatch },
                }
              : c
          ),
          characterId
        ),
      });
    };
    const remove = () => {
      updateEntry(entry.id, { cutsceneTracks: withTrackClips(tracks, "character", clips.filter((c) => c.id !== clip.id), characterId) });
      onClose();
    };
    const actorLabel = castLabel(entry.cutsceneCast ?? [], allEntries, characterId);
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Персонаж — анимация ({actorLabel})</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="text-[10px] text-[var(--op-30)]">
          Позиция теперь задаётся ключами (ромбики на дорожках «X»/«Y» этого персонажа) — выберите ключ на таймлайне,
          чтобы отредактировать его. Здесь — состояние/внешний вид на этом отрезке времени.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Начало мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
          <NumField label="Длит. мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Действие
            <ThemedSelect
              className="input w-24"
              value={component.anim ?? "idle"}
              onChange={(v) => patch({ anim: v as CharacterAnimState })}
              options={CHAR_ANIM_OPTIONS.map((a) => ({ value: a, label: ANIM_STATE_LABEL[a] }))}
            />
          </label>
          <NumField label="Скорость %" value={component.speed ?? 100} onChange={(v) => patch({ speed: v })} />
          <NumField label="Слой отрисовки" value={component.zIndex ?? 0} onChange={(v) => patch({ zIndex: v })} />
          <NumField label="Непрозрачность %" value={component.opacity ?? 100} onChange={(v) => patch({ opacity: v })} />
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <AnchorField value={component.anchor} onChange={(v) => patch({ anchor: v })} />
          <label className="flex items-center gap-1.5 text-xs text-[var(--op-50)]">
            <input type="checkbox" checked={component.flipX ?? false} onChange={(e) => patch({ flipX: e.target.checked })} />
            Отражение по X
          </label>
        </div>
        <PausesForDialogueField value={component.pausesForDialogue} onChange={(v) => patch({ pausesForDialogue: v })} />
        <div className="pt-1 space-y-1.5 border-t border-[var(--op-10)] mt-1">
          <div className="text-[10px] uppercase tracking-wider text-[var(--op-30)] pt-1.5">Дополнительно</div>
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Условия запуска
            <input
              className="input text-xs flex-1"
              value={component.conditionExpr ?? ""}
              placeholder="!flag.intro_end"
              onChange={(e) => patch({ conditionExpr: e.target.value })}
            />
          </label>
          <TagsField value={component.tags} onChange={(v) => patch({ tags: v })} />
          <label className="text-[10px] text-[var(--op-40)] flex flex-col gap-1">
            Заметки
            <textarea
              className="input text-xs w-full min-h-[44px] resize-y"
              value={component.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>
        </div>
      </div>
    );
  }

  if (selected.trackKind === "characterKey") {
    const posKeys = entry.cutsceneCharacterPositionKeys ?? [];
    const key = posKeys.find((k) => k.id === selected.id);
    if (!key) return null;
    const cast = entry.cutsceneCast ?? [];
    const actorLabel = castLabel(cast, allEntries, key.characterId);
    const patch = (p: Partial<CharacterPositionKeyframe>) =>
      updateEntry(entry.id, { cutsceneCharacterPositionKeys: posKeys.map((k) => (k.id === key.id ? { ...k, ...p } : k)) });
    const remove = () => {
      updateEntry(entry.id, { cutsceneCharacterPositionKeys: posKeys.filter((k) => k.id !== key.id) });
      onClose();
    };
    if (key.axis === "active") {
      // Step channel (see resolveActiveChannel in lib/cutscenePreview.ts) -- no in-between
      // value, so this shows a plain appear/disappear toggle instead of a numeric field, and
      // skips the easing dropdown entirely (a presence switch has nothing to ease between).
      const isActive = key.value >= 0.5;
      return (
        <div className="glass rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">{actorLabel} — ключ «Активен»</div>
            <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
              <Trash2 size={13} />
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <NumField label="Время мс" value={key.atMs} onChange={(v) => patch({ atMs: Math.max(0, v) })} />
            <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1.5">
              <input type="checkbox" checked={isActive} onChange={(e) => patch({ value: e.target.checked ? 1 : 0 })} />
              Активен с этого момента
            </label>
          </div>
          <div className="text-[10px] text-[var(--op-30)]">
            С этой точки актёр {isActive ? "появляется на сцене" : "исчезает со сцены"} и остаётся так до следующего ключа «Активен».
          </div>
        </div>
      );
    }
    const axisLabel = key.axis === "x" ? "X" : "Y";
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">
            {actorLabel} — ключ {axisLabel}
          </div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Время мс" value={key.atMs} onChange={(v) => patch({ atMs: Math.max(0, v) })} />
          <NumField label={axisLabel} value={key.value} step={0.1} onChange={(v) => patch({ value: v })} />
          <EasingField value={key.easing} onChange={(v) => patch({ easing: v })} />
        </div>
        <div className="text-[10px] text-[var(--op-30)]">
          Интерполяция идёт только между этим ключом и его соседями — изменение не затронет остальную часть таймлайна.
        </div>
      </div>
    );
  }

  if (selected.trackKind === "dialogue") {
    const clips = trackClips(tracks, "dialogue");
    const clip = clips.find((c) => c.id === selected.id);
    if (!clip || clip.component.kind !== "dialogue") return null;
    const component = clip.component;
    const patch = (p: { startMs?: number; durationMs?: number; dialogueId?: string }) =>
      updateEntry(entry.id, {
        cutsceneTracks: withTrackClips(
          tracks,
          "dialogue",
          clips.map((c) =>
            c.id === clip.id
              ? {
                  ...c,
                  ...(p.startMs !== undefined ? { startMs: p.startMs } : {}),
                  ...(p.durationMs !== undefined ? { durationMs: p.durationMs } : {}),
                  component: { ...component, ...(p.dialogueId !== undefined ? { dialogueId: p.dialogueId } : {}) },
                }
              : c
          )
        ),
      });
    const remove = () => {
      updateEntry(entry.id, { cutsceneTracks: withTrackClips(tracks, "dialogue", clips.filter((c) => c.id !== clip.id)) });
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
          value={component.dialogueId}
          onChange={(id) => patch({ dialogueId: id })}
          options={dialogues.map((d) => ({ id: d.id, label: d.name }))}
          placeholder="Диалог…"
        />
        {component.dialogueId && (
          <button
            onClick={() => onOpenDialogue(component.dialogueId!)}
            className="flex items-center gap-1.5 text-xs text-[var(--op-50)] hover:text-[var(--op-80)]"
          >
            <ExternalLink size={12} /> Открыть в редакторе диалогов
          </button>
        )}
        <div className="text-[10px] text-[var(--op-30)]">
          Катсцена всегда ждёт окончания диалога. Чтобы конкретный клип камеры/персонажа/аудио продолжал
          действовать во время этого диалога — снимите «Ждёт диалог» в его собственной панели параметров.
        </div>
        <div className="flex items-center gap-2">
          <NumField label="Начало мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
          <NumField label="Показ мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
        </div>
      </div>
    );
  }

  if (selected.trackKind === "event") {
    const clips = trackClips(tracks, "event");
    const clip = clips.find((c) => c.id === selected.id);
    if (!clip || clip.component.kind !== "event") return null;
    const component = clip.component;
    const patch = (p: { startMs?: number } & Partial<typeof component>) => {
      const { startMs, ...componentPatch } = p;
      updateEntry(entry.id, {
        cutsceneTracks: withTrackClips(
          tracks,
          "event",
          clips.map((c) =>
            c.id === clip.id
              ? {
                  ...c,
                  ...(startMs !== undefined ? { startMs } : {}),
                  component: { ...component, ...componentPatch },
                }
              : c
          )
        ),
      });
    };
    const remove = () => {
      updateEntry(entry.id, { cutsceneTracks: withTrackClips(tracks, "event", clips.filter((c) => c.id !== clip.id)) });
      onClose();
    };
    const objectOptions = allEntries
      .filter((e) => e.category === "object" || e.category === "item" || e.category === "character")
      .map((e) => ({ id: e.id, label: `${e.name} (${e.category})` }));
    const locationOptions = allEntries.filter((e) => e.category === "location").map((e) => ({ id: e.id, label: e.name }));
    const battleOptions = allEntries.filter((e) => e.category === "battle").map((e) => ({ id: e.id, label: e.name }));
    return (
      <div className="glass rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-[var(--op-35)]">Событие — клип</div>
          <button onClick={remove} className="text-[var(--op-40)] hover:text-[var(--op-80)]">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="text-[10px] text-[var(--op-30)]">
          Игровое действие, срабатывающее в момент проигрывания катсцены. Данные — заготовка для будущего экспорта
          в GML, вживую в этом превью не выполняются (как и ассеты звука на дорожке Аудио/FX).
        </div>
        <ThemedSelect
          className="input"
          value={component.eventKind}
          onChange={(v) => patch({ eventKind: v as CutsceneEventKind })}
          options={(Object.keys(EVENT_KIND_LABEL) as CutsceneEventKind[]).map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <NumField label="Момент мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
          {component.eventKind === "setFlag" && (
            <>
              <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
                Флаг
                <input
                  className="input text-xs w-28"
                  value={component.flagName ?? ""}
                  placeholder="intro_end"
                  onChange={(e) => patch({ flagName: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--op-50)]">
                <input type="checkbox" checked={component.flagValue ?? true} onChange={(e) => patch({ flagValue: e.target.checked })} />
                Значение
              </label>
            </>
          )}
        </div>
        {component.eventKind === "teleport" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-40">
              <SearchSelect value={component.targetMapId} onChange={(id) => patch({ targetMapId: id })} options={locationOptions} placeholder="Локация…" />
            </div>
            <NumField label="X" value={component.targetX ?? 0} onChange={(v) => patch({ targetX: v })} />
            <NumField label="Y" value={component.targetY ?? 0} onChange={(v) => patch({ targetY: v })} />
          </div>
        )}
        {(component.eventKind === "spawnObject" || component.eventKind === "destroyObject") && (
          <div className="w-52">
            <SearchSelect value={component.objectId} onChange={(id) => patch({ objectId: id })} options={objectOptions} placeholder="Объект…" />
          </div>
        )}
        {component.eventKind === "startBattle" && (
          <div className="w-52">
            <SearchSelect value={component.battleId} onChange={(id) => patch({ battleId: id })} options={battleOptions} placeholder="Бой…" />
          </div>
        )}
        {component.eventKind === "runScript" && (
          <label className="text-[10px] text-[var(--op-40)] flex flex-col gap-1">
            Скрипт (GML, справочно)
            <textarea
              className="input text-xs w-full min-h-[44px] resize-y"
              value={component.script ?? ""}
              onChange={(e) => patch({ script: e.target.value })}
            />
          </label>
        )}
        <PausesForDialogueField value={component.pausesForDialogue} onChange={(v) => patch({ pausesForDialogue: v })} />
      </div>
    );
  }

  const clips = trackClips(tracks, "audiofx");
  const clip = clips.find((c) => c.id === selected.id);
  if (!clip || clip.component.kind !== "audio") return null;
  const component = clip.component;
  const patch = (p: { startMs?: number; durationMs?: number } & Partial<typeof component>) => {
    const { startMs, durationMs, ...componentPatch } = p;
    updateEntry(entry.id, {
      cutsceneTracks: withTrackClips(
        tracks,
        "audiofx",
        clips.map((c) =>
          c.id === clip.id
            ? {
                ...c,
                ...(startMs !== undefined ? { startMs } : {}),
                ...(durationMs !== undefined ? { durationMs } : {}),
                component: { ...component, ...componentPatch },
              }
            : c
        )
      ),
    });
  };
  const remove = () => {
    updateEntry(entry.id, { cutsceneTracks: withTrackClips(tracks, "audiofx", clips.filter((c) => c.id !== clip.id)) });
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
        value={component.audioKind}
        onChange={(v) => patch({ audioKind: v as AudioFxKind })}
        options={(Object.keys(AUDIOFX_KIND_LABEL) as AudioFxKind[]).map((k) => ({ value: k, label: AUDIOFX_KIND_LABEL[k] }))}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <NumField label="Момент мс" value={clip.startMs} onChange={(v) => patch({ startMs: v })} />
        {(component.audioKind === "sound" || component.audioKind === "music") && (
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Ассет (GML)
            <input
              className="input text-xs w-32"
              value={component.assetName ?? ""}
              placeholder="snd_..."
              onChange={(e) => patch({ assetName: e.target.value })}
            />
          </label>
        )}
        {(component.audioKind === "fade" || component.audioKind === "flash") && (
          <NumField label="Длит. мс" value={clip.durationMs} onChange={(v) => patch({ durationMs: v })} />
        )}
        {component.audioKind === "fade" && (
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Направление
            <ThemedSelect
              className="input w-28"
              value={component.direction ?? "out"}
              onChange={(v) => patch({ direction: v as "in" | "out" })}
              options={[
                { value: "out", label: "В темноту" },
                { value: "in", label: "Из темноты" },
              ]}
            />
          </label>
        )}
        {component.audioKind === "flash" && (
          <label className="text-[10px] text-[var(--op-40)] flex items-center gap-1">
            Цвет
            <input
              type="color"
              className="w-8 h-6 rounded border border-[var(--op-10)] bg-transparent"
              value={component.color ?? "#ffffff"}
              onChange={(e) => patch({ color: e.target.value })}
            />
          </label>
        )}
      </div>
      <PausesForDialogueField value={component.pausesForDialogue} onChange={(v) => patch({ pausesForDialogue: v })} />
    </div>
  );
}
