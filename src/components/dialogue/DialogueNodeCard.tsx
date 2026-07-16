import { useEffect, useRef, useState } from "react";
import { Star, Trash2, Plus, X, GripHorizontal, Palette, Check, Play } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { ConditionEditor } from "./ConditionEditor";
import { SearchSelect } from "./SearchSelect";
import { MarkupText } from "./MarkupText";
import { PortalMenu } from "../common/PortalMenu";
import { FlagValueInput } from "./FlagValueInput";
import type { ColorStyleMode, Dialogue, DialogueChoice, DialogueLine, DialogueNode, DialogueSide, QuestAction, QuestActionKind } from "../../types/database";
import { CAT_COLOR, isQuest } from "../../types/database";
import { MARKUP_TAGS, FALLBACK_COLOR_GUESSES, mixHex, parseDialogueMarkup } from "../../lib/dialogueMarkup";
import { nextId } from "../../lib/mapDefaults";
import { objectiveDisplayMode } from "../../lib/questCompile";
import { ThemedSelect } from "../common/ThemedSelect";
import { themedConfirm, themedPrompt } from "../../lib/modals";

// Same per-glyph typewriter timing TestPlayModal.tsx uses for the real dialogue test-runner —
// kept identical here so the "▶" preview button in the reply editor plays a line at the exact
// same pace (including [speed=N]/[pause=N] markup and a linked character's own text_speed) as
// it would actually appear in-game, not just a generic/simplified animation.
const BASE_MS_PER_CHAR = 26;

// Applies a markup tag around the current selection (or right before it, for "prefix" tags)
// in a plain <textarea>. Shared between the generic tag-button row and the dedicated color
// picker below, so both go through the exact same insertion logic.
function insertMarkup(
  el: HTMLTextAreaElement | null,
  value: string,
  onChange: (v: string) => void,
  id: string,
  mode: "wrap" | "prefix",
  arg?: string
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const openTag = arg ? `[${id}=${arg}]` : `[${id}]`;

  let next: string;
  let caretStart: number;
  let caretEnd: number;
  if (mode === "wrap") {
    // Wrap the selection: [tag]...selected...[/tag]. With an empty selection this just drops
    // an empty pair at the caret, ready to type between.
    const closeTag = `[/${id}]`;
    const selected = value.slice(start, end);
    next = value.slice(0, start) + openTag + selected + closeTag + value.slice(end);
    caretStart = start + openTag.length;
    caretEnd = caretStart + selected.length;
  } else {
    // "prefix": insert only [tag] right before the selection start — never delete/replace the
    // selected text.
    next = value.slice(0, start) + openTag + value.slice(start);
    caretStart = start + openTag.length;
    caretEnd = caretStart + (end - start);
  }
  onChange(next);
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(caretStart, caretEnd);
  });
}


// Static CSS approximation of a color style for a small swatch button (the real, exact
// per-glyph/animated rendering only happens in the live line preview and test-play mode,
// which run the actual color_eval_glyph-equivalent formula against a ticking clock).
function swatchPreviewStyle(mode: ColorStyleMode, a: string, b: string): React.CSSProperties {
  if (mode === "solid") return { background: a || "#ffffff" };
  if (mode === "rainbow") return { backgroundImage: "linear-gradient(90deg, #ff5f6d, #ffc371, #47e0a1, #5b8def, #c56cf0)" };
  return { backgroundImage: `linear-gradient(90deg, ${a || "#fff"}, ${mixHex(a, b, 0.5)}, ${b || a || "#fff"})` };
}

function ColorTagButton({
  getEl,
  value,
  onChange,
}: {
  getEl: () => HTMLTextAreaElement | null;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);

  const apply = (colorName: string) => {
    insertMarkup(getEl(), value, onChange, "c", "wrap", colorName);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-[var(--op-6)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:bg-[var(--op-10)] mono"
        title="Выделите текст и выберите цвет/стиль"
      >
        <Palette size={9} /> [c=…]
      </button>
      <PortalMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div className="w-56 p-2">
          {colorStyles.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-[var(--op-35)] mb-1.5">Ваши стили (Стили…)</div>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {colorStyles.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => apply(c.name)}
                    title={`${c.name} (${c.mode})`}
                    className="w-full aspect-square rounded-md border border-[var(--op-15)] hover:scale-105 transition-transform"
                    style={swatchPreviewStyle(c.mode, c.a, c.b)}
                  />
                ))}
              </div>
            </>
          )}
          <div className="text-[10px] uppercase tracking-wider text-[var(--op-35)] mb-1.5">Примерные (не зарегистрированы)</div>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {Object.keys(FALLBACK_COLOR_GUESSES).map((name) => (
              <button
                key={name}
                onClick={() => apply(name)}
                title={name}
                className="w-full aspect-square rounded-md border border-[var(--op-15)] hover:scale-105 transition-transform"
                style={{ background: FALLBACK_COLOR_GUESSES[name] }}
              />
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--op-35)] mb-1.5">Свой цвет</div>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              className="w-8 h-8 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer shrink-0"
              onChange={(e) => apply(e.target.value)}
            />
            <span className="text-[10px] text-[var(--op-35)]">Выберите — применится к выделению (как обычный сплошной цвет)</span>
          </div>
        </div>
      </PortalMenu>
    </>
  );
}

function LineTextEditor({ value, onChange, speakerEntryId }: { value: string; onChange: (v: string) => void; speakerEntryId?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);
  const entries = useProjectStore((s) => s.project.entries);
  const speakerData = speakerEntryId ? entries.find((e) => e.id === speakerEntryId)?.dialogueSpeaker : undefined;

  // Mini preview "play" button — reveals the reply the same way the real dialogue would
  // (typewriter, glyph-by-glyph, respecting [speed=N]/[pause=N] markup and the linked
  // character's own text_speed). Hidden while actively playing, shown again once it's done
  // (or before it's ever been played, so the button is there to press in the first place).
  const [playPhase, setPlayPhase] = useState<"idle" | "playing" | "done">("idle");
  const [revealCount, setRevealCount] = useState(0);
  const playTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, []);

  const playLine = () => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    const glyphs = parseDialogueMarkup(value);
    if (glyphs.length === 0) {
      setPlayPhase("done");
      return;
    }
    setRevealCount(0);
    setPlayPhase("playing");
    const speedFactor = speakerData?.textSpeed ? speakerData.textSpeed / 0.3 : 1;
    let i = 0;
    const step = () => {
      i++;
      setRevealCount(i);
      if (i >= glyphs.length) {
        setPlayPhase("done");
        return;
      }
      const g = glyphs[i - 1];
      const delay = Math.max(4, (BASE_MS_PER_CHAR * speedFactor) / (g.speed || 1)) + g.pauseAfter * 16;
      playTimerRef.current = setTimeout(step, delay);
    };
    playTimerRef.current = setTimeout(step, Math.max(4, BASE_MS_PER_CHAR * speedFactor));
  };

  // Applying an effect: select a range of text first, then click the effect's name — "wrap"
  // tags (wave/shake/c=.../speed) wrap the selection in [tag]...[/tag]; "prefix" (pause, a
  // point-in-time marker in the engine, not a range) inserts only right before the selection
  // without touching it. Falls back to inserting an empty pair at the caret if nothing is
  // selected, so the tags are still reachable via typing between them.
  const applyTag = async (def: (typeof MARKUP_TAGS)[number]) => {
    let arg: string | undefined;
    if (def.promptForValue) {
      const entered = await themedPrompt(def.promptLabel ?? `Значение для ${def.label}`, def.defaultValue ?? "");
      if (entered === null) return; // cancelled
      arg = entered.trim();
    }
    insertMarkup(ref.current, value, onChange, def.id, def.mode, arg);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {MARKUP_TAGS.filter((t) => t.id !== "c").map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTag(t)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--op-6)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:bg-[var(--op-10)] mono"
            title={t.mode === "wrap" ? `Выделите текст и нажмите, чтобы обернуть в ${t.label}` : `Вставится перед выделенным текстом: ${t.label}`}
          >
            {t.label}
          </button>
        ))}
        <ColorTagButton getEl={() => ref.current} value={value} onChange={onChange} />
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Текст реплики…"
        className="input text-xs w-full resize-y min-h-[52px]"
      />
      {value.trim() && (
        <div className="relative mt-1 pl-2 pr-7 py-1.5 rounded bg-black/25 text-[11px] leading-relaxed">
          <MarkupText text={value} styles={colorStyles} revealCount={playPhase === "playing" ? revealCount : undefined} />
          {playPhase !== "playing" && (
            <button
              type="button"
              onClick={playLine}
              title="Проиграть реплику"
              className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-[var(--op-10)] text-[var(--op-50)] hover:text-accent hover:bg-[var(--op-15)] transition-colors"
            >
              <Play size={10} fill="currentColor" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FlagSetRow({
  fs,
  onChange,
  onRemove,
}: {
  fs: { key: string; value: string };
  onChange: (patch: Partial<{ key: string; value: string }>) => void;
  onRemove: () => void;
}) {
  const addDialogueFlag = useProjectStore((s) => s.addDialogueFlag);
  const dialogueFlagDefs = useProjectStore((s) => s.project.dialogueFlagDefs);
  return (
    <div className="flex items-center gap-1">
      <input
        list="dialogue-flags-list"
        value={fs.key}
        onChange={(e) => onChange({ key: e.target.value })}
        onBlur={() => fs.key.trim() && addDialogueFlag(fs.key.trim())}
        placeholder="флаг"
        className="input text-[11px] py-1 flex-1 min-w-0"
      />
      <FlagValueInput value={fs.value} onChange={(v) => onChange({ value: v })} className="flex-1" flagType={dialogueFlagDefs[fs.key]?.type} />
      <button onClick={onRemove} className="opacity-40 hover:opacity-100 shrink-0">
        <X size={11} />
      </button>
    </div>
  );
}

function LineBlock({
  dialogue,
  node,
  line,
  index,
  canRemove,
  registerAnchor,
  onLinkDragStart,
}: {
  dialogue: Dialogue;
  node: DialogueNode;
  line: DialogueLine;
  index: number;
  canRemove: boolean;
  registerAnchor: (key: string, el: HTMLElement | null) => void;
  onLinkDragStart: (from: string, e: React.MouseEvent) => void;
}) {
  const updateDialogueLine = useProjectStore((s) => s.updateDialogueLine);
  const deleteDialogueLine = useProjectStore((s) => s.deleteDialogueLine);
  const entries = useProjectStore((s) => s.project.entries);
  const createEntryQuick = useProjectStore((s) => s.createEntryQuick);
  const characters = entries.filter((e) => e.category === "character");
  const elseTarget = dialogue.nodes.find((n) => n.id === line.elseNodeId);

  const patch = (p: Partial<DialogueLine>) => updateDialogueLine(dialogue.id, node.id, line.id, p);

  // v77 emotions pipeline: the linked character's registered emotion list (see the character
  // card's "Диалог (speaker_define)" section) drives the emotion picker for this line, and the
  // matching uploaded portrait picture (if any) is shown right next to it.
  const speakerEntry = line.speakerEntryId ? characters.find((c) => c.id === line.speakerEntryId) : undefined;
  const speakerEmotions = (speakerEntry?.dialogueSpeaker?.portraits ?? []).filter((p) => p.emotion.trim() !== "");
  const activePortrait = line.emotion ? speakerEmotions.find((p) => p.emotion === line.emotion) : undefined;

  // Same flag_set()/quest_* side effects a choice can fire — here they trigger the moment this
  // REPLICA is shown, not on a player choice (see renderLinePage in dialogueCompile.ts).
  const lineFlagSets = line.flagSets ?? [];
  const addLineFlagSet = () => patch({ flagSets: [...lineFlagSets, { key: "", value: "true" }] });
  const updateLineFlagSet = (i: number, p: Partial<{ key: string; value: string }>) =>
    patch({ flagSets: lineFlagSets.map((fs, idx) => (idx === i ? { ...fs, ...p } : fs)) });
  const removeLineFlagSet = (i: number) => patch({ flagSets: lineFlagSets.filter((_, idx) => idx !== i) });

  const lineQuestActions = line.questActions ?? [];
  const addLineQuestAction = () => patch({ questActions: [...lineQuestActions, { id: nextId("qact"), kind: "start", questId: "" }] });
  const updateLineQuestAction = (i: number, p: Partial<QuestAction>) =>
    patch({ questActions: lineQuestActions.map((qa, idx) => (idx === i ? { ...qa, ...p } : qa)) });
  const removeLineQuestAction = (i: number) => patch({ questActions: lineQuestActions.filter((_, idx) => idx !== i) });

  return (
    <div className="rounded-md border border-[var(--op-7)] p-2 space-y-1.5 bg-[var(--op-3)]">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-[var(--op-35)]">Реплика {index + 1}</span>
        {canRemove && (
          <button onClick={() => deleteDialogueLine(dialogue.id, node.id, line.id)} className="text-[10px] text-[var(--op-35)] hover:text-red-300 flex items-center gap-0.5">
            <X size={10} /> реплика
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <div className="flex-1 min-w-0">
          <SearchSelect
            value={line.speakerEntryId}
            onChange={(id) => {
              const ent = characters.find((c) => c.id === id);
              patch({ speakerEntryId: id, speaker: ent ? ent.name : "" });
            }}
            options={characters.map((c) => ({ id: c.id, label: c.name }))}
            placeholder="персонаж… (пусто — рассказчик)"
            searchPlaceholder="Поиск персонажа…"
            clearLabel="— без персонажа (рассказчик) —"
            onCreate={(name) => {
              const id = createEntryQuick("character", name);
              patch({ speakerEntryId: id, speaker: name });
            }}
            createLabel="Создать персонажа"
          />
        </div>
      </div>

      <div className="flex gap-1.5 items-center">
        <ThemedSelect
          value={line.side}
          onChange={(v) => patch({ side: v as DialogueSide })}
          options={[
            { value: "left", label: "сторона: left" },
            { value: "default", label: "сторона: default" },
            { value: "right", label: "сторона: right" },
            { value: "none", label: "сторона: none (без портрета)" },
          ]}
          className="input text-xs py-1 flex-1"
          panelClassName="min-w-[190px]"
        />
        {/* v77 emotions pipeline: when the linked character has registered emotions, this is a
            dropdown over exactly those (each option previewing its uploaded portrait); the free
            text input remains only for lines with no linked character / characters with no
            registered emotions, so nothing existing breaks. */}
        {speakerEmotions.length > 0 ? (
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            {activePortrait?.image && (
              <img
                src={activePortrait.image}
                alt=""
                title={`Портрет: ${line.emotion || "?"}`}
                className="w-6 h-6 rounded shrink-0 object-cover border border-[var(--op-15)]"
                style={{ imageRendering: "pixelated" }}
              />
            )}
            <div className="flex-1 min-w-0">
              <SearchSelect
                value={line.emotion || undefined}
                onChange={(v) => patch({ emotion: v ?? "" })}
                options={speakerEmotions.map((p) => ({ id: p.emotion, label: p.emotion }))}
                placeholder="эмоция…"
                searchPlaceholder="Поиск эмоции…"
                clearLabel="— без эмоции —"
              />
            </div>
          </div>
        ) : (
          <input
            value={line.emotion ?? ""}
            onChange={(e) => patch({ emotion: e.target.value })}
            placeholder="эмоция"
            className="input text-xs py-1 flex-1"
          />
        )}
      </div>

      <LineTextEditor value={line.text} onChange={(text) => patch({ text })} speakerEntryId={line.speakerEntryId} />

      <div className="flex items-center justify-between gap-2">
        <ConditionEditor value={line.condition} onChange={(c) => patch({ condition: c })} label="показывать реплику если…" />
      </div>

      {line.condition && (
        elseTarget ? (
          <div className="flex items-center gap-1.5 text-[10px] text-orange-300 bg-orange-500/10 rounded-md px-2 py-1.5">
            <span
              ref={(el) => registerAnchor(`else:${line.id}`, el)}
              onMouseDown={(e) => onLinkDragStart(`else:${line.id}`, e)}
              title="Перетяните, чтобы изменить альтернативную ноду"
              className="p-2 -m-2 shrink-0 cursor-crosshair grid place-items-center hover:bg-orange-400/15 rounded-full transition-colors"
            >
              <span className="block w-2.5 h-2.5 rounded-full bg-orange-400" />
            </span>
            если условие НЕ выполнено → {elseTarget.lines[0]?.speaker || elseTarget.id}
            <button onClick={() => patch({ elseNodeId: undefined })} className="opacity-50 hover:opacity-100 ml-auto">
              <X size={11} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-orange-300/70 bg-orange-500/5 border border-dashed border-orange-500/30 rounded-md px-2 py-1.5">
            {/* A dedicated port, same treatment as the choice connector — generous invisible
                hit-area (p-2 -m-2), hover highlight, a tooltip, AND a slow pulsing ring so the
                eye is drawn to "this is the draggable thing" instead of reading as decoration
                next to the sentence. Only this dot starts the drag now (not the whole row),
                matching how the choice port works, so the interaction model is consistent. */}
            <span
              ref={(el) => registerAnchor(`else:${line.id}`, el)}
              onMouseDown={(e) => onLinkDragStart(`else:${line.id}`, e)}
              title="Перетяните на другую ноду (или в пустое место — создастся новая)"
              className="relative shrink-0 w-5 h-5 grid place-items-center cursor-crosshair rounded-full hover:bg-orange-400/20 transition-colors"
            >
              <span className="absolute inset-0.5 rounded-full border-2 border-dashed border-orange-400/70 else-port-pulse" />
              <span className="block w-2 h-2 rounded-full bg-orange-400/90" />
            </span>
            <span>если условие НЕ выполнено — перетяните точку слева к ноде (или в пустое место — создастся новая)</span>
          </div>
        )
      )}

      <div className="space-y-1">
        {lineFlagSets.map((fs, i) => (
          <FlagSetRow key={i} fs={fs} onChange={(p) => updateLineFlagSet(i, p)} onRemove={() => removeLineFlagSet(i)} />
        ))}
        <button onClick={addLineFlagSet} className="w-full text-[10px] text-[var(--op-35)] hover:text-[var(--op-65)] py-1 rounded bg-[var(--op-5)]">
          + flag_set
        </button>
      </div>

      <div className="space-y-1">
        {lineQuestActions.map((qa, i) => (
          <QuestActionRow key={qa.id} action={qa} onChange={(p) => updateLineQuestAction(i, p)} onRemove={() => removeLineQuestAction(i)} />
        ))}
        <button onClick={addLineQuestAction} className="w-full text-[10px] text-[var(--op-35)] hover:text-[var(--op-65)] py-1 rounded bg-[var(--op-5)]">
          + действие с квестом
        </button>
      </div>

      <label className="flex items-center gap-1.5 text-[10px] text-[var(--op-45)] cursor-pointer select-none w-fit">
        <input type="checkbox" checked={line.noSkip ?? false} onChange={(e) => patch({ noSkip: e.target.checked })} className="sr-only peer" />
        <span className="w-3.5 h-3.5 rounded-[4px] border border-[var(--op-20)] bg-[var(--op-5)] grid place-items-center shrink-0 transition-colors peer-checked:bg-accent/80 peer-checked:border-accent">
          <Check size={10} className="text-[var(--popover-bg)] opacity-0 peer-checked:opacity-100" strokeWidth={3} />
        </span>
        непропускаемая (нельзя проскипать печать)
      </label>
    </div>
  );
}

const QUEST_ACTION_LABEL: Record<QuestActionKind, string> = { start: "Начать квест", advance: "Продвинуть цель", complete: "Завершить квест" };

function QuestActionRow({
  action,
  onChange,
  onRemove,
}: {
  action: QuestAction;
  onChange: (p: Partial<QuestAction>) => void;
  onRemove: () => void;
}) {
  const entries = useProjectStore((s) => s.project.entries);
  const dialogueFlagDefs = useProjectStore((s) => s.project.dialogueFlagDefs);
  const quests = entries.filter((e) => isQuest(e.category));
  const quest = quests.find((q) => q.id === action.questId);
  const objectives = quest?.objectives ?? [];
  const selectedObjective = objectives[action.objectiveIndex ?? 0];
  // Slider-type objectives (see objectiveDisplayMode, shared with the Quests roadmap card)
  // make "amount" a meaningful number to tune; plain checkbox objectives only ever go from
  // 0 to their max in one shot, so the amount field is just noise there — hide it.
  const isSliderObjective = selectedObjective ? objectiveDisplayMode(selectedObjective, dialogueFlagDefs).kind === "slider" : false;

  return (
    <div className="rounded-md border border-[var(--op-7)] p-1.5 space-y-1 bg-[var(--op-4)]">
      <div className="flex items-center gap-1">
        <ThemedSelect
          value={action.kind}
          onChange={(v) => onChange({ kind: v as QuestActionKind })}
          options={(Object.keys(QUEST_ACTION_LABEL) as QuestActionKind[]).map((k) => ({ value: k, label: QUEST_ACTION_LABEL[k] }))}
          className="input text-[11px] py-1 w-32 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <SearchSelect
            value={action.questId || undefined}
            onChange={(id) => onChange({ questId: id ?? "" })}
            options={quests.map((q) => ({ id: q.id, label: q.name, color: CAT_COLOR[q.category] }))}
            placeholder="выбрать квест…"
            searchPlaceholder="Поиск квеста…"
            clearLabel="— не выбрано —"
          />
        </div>
        <button onClick={onRemove} className="opacity-40 hover:opacity-100 shrink-0">
          <X size={11} />
        </button>
      </div>
      {action.kind === "advance" && (
        <div className="flex items-center gap-1">
          {objectives.length > 0 ? (
            <ThemedSelect
              value={String(action.objectiveIndex ?? 0)}
              onChange={(v) => onChange({ objectiveIndex: Number(v) })}
              options={objectives.map((o, i) => ({ value: String(i), label: o.text || `Цель ${i + 1}` }))}
              className="input text-[11px] py-1 flex-1 min-w-0"
              panelClassName="min-w-[200px]"
            />
          ) : (
            <div className="flex-1 text-[10px] text-[var(--op-35)] italic">{quest ? "у этого квеста нет подцелей" : "сначала выберите квест"}</div>
          )}
          {isSliderObjective ? (
            <input
              type="number"
              value={action.amount ?? 1}
              onChange={(e) => onChange({ amount: Number(e.target.value) || 1 })}
              title="на сколько продвинуть"
              className="input text-[11px] py-1 w-14 shrink-0"
            />
          ) : (
            selectedObjective && <span className="text-[9px] text-[var(--op-30)] shrink-0" title="чекбокс-цель — выполняется целиком">✓ целиком</span>
          )}
        </div>
      )}
    </div>
  );
}

function ChoiceRow({
  dialogue,
  node,
  choice,
  registerAnchor,
  onLinkDragStart,
}: {
  dialogue: Dialogue;
  node: DialogueNode;
  choice: DialogueChoice;
  registerAnchor: (key: string, el: HTMLElement | null) => void;
  onLinkDragStart: (from: string, e: React.MouseEvent) => void;
}) {
  const updateDialogueChoice = useProjectStore((s) => s.updateDialogueChoice);
  const deleteDialogueChoice = useProjectStore((s) => s.deleteDialogueChoice);
  const setChoiceTarget = useProjectStore((s) => s.setChoiceTarget);
  const targetNode = dialogue.nodes.find((n) => n.id === choice.targetNodeId);

  const patch = (p: Partial<DialogueChoice>) => updateDialogueChoice(dialogue.id, node.id, choice.id, p);

  const addFlagSet = () => patch({ flagSets: [...choice.flagSets, { key: "", value: "true" }] });
  const updateFlagSet = (i: number, p: Partial<{ key: string; value: string }>) =>
    patch({ flagSets: choice.flagSets.map((fs, idx) => (idx === i ? { ...fs, ...p } : fs)) });
  const removeFlagSet = (i: number) => patch({ flagSets: choice.flagSets.filter((_, idx) => idx !== i) });

  const questActions = choice.questActions ?? [];
  const addQuestAction = () => patch({ questActions: [...questActions, { id: nextId("qact"), kind: "start", questId: "" }] });
  const updateQuestAction = (i: number, p: Partial<QuestAction>) =>
    patch({ questActions: questActions.map((qa, idx) => (idx === i ? { ...qa, ...p } : qa)) });
  const removeQuestAction = (i: number) => patch({ questActions: questActions.filter((_, idx) => idx !== i) });

  return (
    <div className="relative rounded-md border border-[var(--op-7)] p-2 pr-5 space-y-1.5 bg-[var(--op-3)]">
      <div className="flex items-center gap-1.5">
        <input value={choice.text} onChange={(e) => patch({ text: e.target.value })} placeholder="текст выбора" className="input text-xs py-1 flex-1 min-w-0" />
        <button onClick={() => deleteDialogueChoice(dialogue.id, node.id, choice.id)} className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0">
          <X size={13} />
        </button>
      </div>

      <ConditionEditor value={choice.condition} onChange={(c) => patch({ condition: c })} label="условие: выбери квест/цель/флаг" />

      <div className="space-y-1">
        {choice.flagSets.map((fs, i) => (
          <FlagSetRow key={i} fs={fs} onChange={(p) => updateFlagSet(i, p)} onRemove={() => removeFlagSet(i)} />
        ))}
        <button onClick={addFlagSet} className="w-full text-[10px] text-[var(--op-35)] hover:text-[var(--op-65)] py-1 rounded bg-[var(--op-5)]">
          + flag_set
        </button>
      </div>

      <div className="space-y-1">
        {questActions.map((qa, i) => (
          <QuestActionRow key={qa.id} action={qa} onChange={(p) => updateQuestAction(i, p)} onRemove={() => removeQuestAction(i)} />
        ))}
        <button onClick={addQuestAction} className="w-full text-[10px] text-[var(--op-35)] hover:text-[var(--op-65)] py-1 rounded bg-[var(--op-5)]">
          + действие с квестом
        </button>
      </div>

      {targetNode ? (
        <div className="flex items-center gap-1.5 text-[11px] text-teal-300">
          → ветка {targetNode.lines[0]?.speaker || targetNode.id}
          <button onClick={() => setChoiceTarget(dialogue.id, node.id, choice.id, undefined)} className="opacity-50 hover:opacity-100 ml-auto">
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className="text-[10px] text-[var(--op-35)]">перетяните точку справа на другую ноду — ветка</div>
      )}

      {/* Connector "port" docked to the right edge of the choice box — was previously inline
          with the text, easy to miss/misclick; now it's a consistent, larger handle sitting
          on the card's edge, matching common node-editor conventions (output on the right). */}
      <span
        ref={(el) => registerAnchor(`choice:${choice.id}`, el)}
        onMouseDown={(e) => onLinkDragStart(`choice:${choice.id}`, e)}
        title={targetNode ? "Перетяните, чтобы изменить связь" : "Перетяните на другую ноду (или в пустое место — создастся новая)"}
        className="absolute top-1/2 -translate-y-1/2 -right-2 p-2.5 -m-2.5 cursor-crosshair grid place-items-center hover:bg-teal-400/15 rounded-full transition-colors z-10"
      >
        <span className={`block w-3 h-3 rounded-full ${targetNode ? "bg-teal-400" : "border-2 border-dashed border-teal-400/70"}`} />
      </span>
    </div>
  );
}

export function DialogueNodeCard({
  node,
  dialogue,
  isStart,
  isDropTarget = false,
  onMakeStart,
  onDragHandleDown,
  registerAnchor,
  onLinkDragStart,
}: {
  node: DialogueNode;
  dialogue: Dialogue;
  isStart: boolean;
  isDropTarget?: boolean;
  onMakeStart: () => void;
  onDragHandleDown: (e: React.MouseEvent) => void;
  registerAnchor: (key: string, el: HTMLElement | null) => void;
  onLinkDragStart: (from: string, e: React.MouseEvent) => void;
}) {
  const addDialogueLine = useProjectStore((s) => s.addDialogueLine);
  const addDialogueChoice = useProjectStore((s) => s.addDialogueChoice);
  const deleteDialogueNode = useProjectStore((s) => s.deleteDialogueNode);
  const setNodeContinuation = useProjectStore((s) => s.setNodeContinuation);
  const continueTarget = dialogue.nodes.find((n) => n.id === node.continueTo);

  return (
    <div
      className={`popover rounded-lg relative transition-shadow ${isStart ? "ring-1 ring-accent" : ""} ${
        isDropTarget ? "ring-2 ring-teal-400 shadow-[0_0_0_4px_rgba(45,212,191,0.15)]" : ""
      }`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        onMouseDown={onDragHandleDown}
        className="flex items-center gap-2 px-3 py-2 border-b border-[var(--op-10)] cursor-grab active:cursor-grabbing"
      >
        <GripHorizontal size={12} className="text-[var(--op-30)] shrink-0" />
        {isStart && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/30 text-accent font-medium shrink-0">START</span>}
        <span className="text-xs mono text-[var(--op-40)] truncate flex-1">{node.id}</span>
        {!isStart && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onMakeStart}
            title="Сделать стартовой"
            className="text-[var(--op-30)] hover:text-accent shrink-0"
          >
            <Star size={12} />
          </button>
        )}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={async () => {
            if (await themedConfirm("Удалить эту ноду?")) deleteDialogueNode(dialogue.id, node.id);
          }}
          title="Удалить ноду"
          className="text-[var(--op-30)] hover:text-red-300 shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        {node.lines.map((l, i) => (
          <LineBlock
            key={l.id}
            dialogue={dialogue}
            node={node}
            line={l}
            index={i}
            canRemove={node.lines.length > 0}
            registerAnchor={registerAnchor}
            onLinkDragStart={onLinkDragStart}
          />
        ))}
        <button
          onClick={() => addDialogueLine(dialogue.id, node.id)}
          className="w-full text-xs py-1.5 rounded-md border border-dashed border-[var(--op-15)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:border-[var(--op-30)] flex items-center justify-center gap-1"
        >
          <Plus size={11} /> реплика в эту ноду
        </button>

        <div className="text-[9px] uppercase tracking-wider text-[var(--op-35)] pt-1">Выборы</div>
        <div className="space-y-1.5">
          {node.choices.map((c) => (
            <ChoiceRow key={c.id} dialogue={dialogue} node={node} choice={c} registerAnchor={registerAnchor} onLinkDragStart={onLinkDragStart} />
          ))}
        </div>
        <button
          onClick={() => addDialogueChoice(dialogue.id, node.id)}
          className="w-full text-xs py-1.5 rounded-md border border-dashed border-[var(--op-15)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:border-[var(--op-30)] flex items-center justify-center gap-1"
        >
          <Plus size={11} /> выбор
        </button>

        {node.choices.length === 0 ? (
          continueTarget ? (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 rounded-md px-2 py-1.5">
              <span
                ref={(el) => registerAnchor(`cont:${node.id}`, el)}
                className="p-2 -m-2 shrink-0 cursor-crosshair grid place-items-center hover:bg-amber-400/10 rounded-full transition-colors"
                onMouseDown={(e) => onLinkDragStart(`cont:${node.id}`, e)}
              >
                <span className="block w-2.5 h-2.5 rounded-full bg-amber-400" />
              </span>
              продолжение → {continueTarget.id}
              <button onClick={() => setNodeContinuation(dialogue.id, node.id, undefined)} className="opacity-50 hover:opacity-100 ml-auto">
                <X size={11} />
              </button>
            </div>
          ) : (
            <div
              ref={(el) => registerAnchor(`cont:${node.id}`, el)}
              onMouseDown={(e) => onLinkDragStart(`cont:${node.id}`, e)}
              className="text-center text-[10px] text-amber-300/70 bg-amber-500/5 border border-dashed border-amber-500/30 rounded-md py-1.5 cursor-crosshair hover:bg-amber-500/10"
            >
              ▼ продолжение — перетяните к другой ноде (или в пустое место — создастся новая)
            </div>
          )
        ) : (
          <div className="text-center text-[10px] text-[var(--op-25)] py-1">▼ продолжение недоступно: есть выборы — они завершают реплику</div>
        )}
      </div>
    </div>
  );
}
