import { useRef, useState } from "react";
import { Star, Trash2, Plus, X, GripHorizontal, Palette } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { ConditionEditor } from "./ConditionEditor";
import { SearchSelect } from "./SearchSelect";
import { MarkupText } from "./MarkupText";
import { PortalMenu } from "../common/PortalMenu";
import { FlagValueInput } from "./FlagValueInput";
import type { ColorStyleMode, Dialogue, DialogueChoice, DialogueLine, DialogueNode, DialogueSide, QuestAction, QuestActionKind } from "../../types/database";
import { isQuest } from "../../types/database";
import { MARKUP_TAGS, FALLBACK_COLOR_GUESSES, mixHex } from "../../lib/dialogueMarkup";
import { nextId } from "../../lib/mapDefaults";

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

function LineTextEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const colorStyles = useProjectStore((s) => s.project.colorStyles);

  // Applying an effect: select a range of text first, then click the effect's name — "wrap"
  // tags (wave/shake/c=.../speed) wrap the selection in [tag]...[/tag]; "prefix" (pause, a
  // point-in-time marker in the engine, not a range) inserts only right before the selection
  // without touching it. Falls back to inserting an empty pair at the caret if nothing is
  // selected, so the tags are still reachable via typing between them.
  const applyTag = (def: (typeof MARKUP_TAGS)[number]) => {
    let arg: string | undefined;
    if (def.promptForValue) {
      const entered = prompt(def.promptLabel ?? `Значение для ${def.label}`, def.defaultValue ?? "");
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
        <div className="mt-1 px-2 py-1.5 rounded bg-black/25 text-[11px] leading-relaxed">
          <MarkupText text={value} styles={colorStyles} />
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
  const dialogueFlagTypes = useProjectStore((s) => s.project.dialogueFlagTypes);
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
      <FlagValueInput value={fs.value} onChange={(v) => onChange({ value: v })} className="flex-1" flagType={dialogueFlagTypes[fs.key]} />
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
}: {
  dialogue: Dialogue;
  node: DialogueNode;
  line: DialogueLine;
  index: number;
  canRemove: boolean;
}) {
  const updateDialogueLine = useProjectStore((s) => s.updateDialogueLine);
  const deleteDialogueLine = useProjectStore((s) => s.deleteDialogueLine);
  const entries = useProjectStore((s) => s.project.entries);
  const characters = entries.filter((e) => e.category === "character");

  const patch = (p: Partial<DialogueLine>) => updateDialogueLine(dialogue.id, node.id, line.id, p);

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
          />
        </div>
      </div>

      <div className="flex gap-1.5">
        <select value={line.side} onChange={(e) => patch({ side: e.target.value as DialogueSide })} className="input text-xs py-1 flex-1">
          <option value="left">сторона: left</option>
          <option value="default">сторона: default</option>
          <option value="right">сторона: right</option>
          <option value="none">сторона: none (без портрета)</option>
        </select>
        <input
          value={line.emotion ?? ""}
          onChange={(e) => patch({ emotion: e.target.value })}
          placeholder="эмоция"
          className="input text-xs py-1 flex-1"
        />
      </div>

      <LineTextEditor value={line.text} onChange={(text) => patch({ text })} />

      <div className="flex items-center justify-between gap-2">
        <ConditionEditor value={line.condition} onChange={(c) => patch({ condition: c })} label="показывать реплику если…" />
      </div>

      <label className="flex items-center gap-1.5 text-[10px] text-[var(--op-45)]">
        <input type="checkbox" checked={line.noSkip} onChange={(e) => patch({ noSkip: e.target.checked })} />
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
  const quests = entries.filter((e) => isQuest(e.category));
  const quest = quests.find((q) => q.id === action.questId);
  const objectives = quest?.objectives ?? [];

  return (
    <div className="rounded-md border border-[var(--op-7)] p-1.5 space-y-1 bg-[var(--op-4)]">
      <div className="flex items-center gap-1">
        <select
          value={action.kind}
          onChange={(e) => onChange({ kind: e.target.value as QuestActionKind })}
          className="input text-[11px] py-1 w-32 shrink-0"
        >
          {(Object.keys(QUEST_ACTION_LABEL) as QuestActionKind[]).map((k) => (
            <option key={k} value={k}>
              {QUEST_ACTION_LABEL[k]}
            </option>
          ))}
        </select>
        <div className="flex-1 min-w-0">
          <SearchSelect
            value={action.questId || undefined}
            onChange={(id) => onChange({ questId: id ?? "" })}
            options={quests.map((q) => ({ id: q.id, label: q.name }))}
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
            <select
              value={action.objectiveIndex ?? 0}
              onChange={(e) => onChange({ objectiveIndex: Number(e.target.value) })}
              className="input text-[11px] py-1 flex-1 min-w-0"
            >
              {objectives.map((o, i) => (
                <option key={i} value={i}>
                  {o.text || `Цель ${i + 1}`}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex-1 text-[10px] text-[var(--op-35)] italic">{quest ? "у этого квеста нет подцелей" : "сначала выберите квест"}</div>
          )}
          <input
            type="number"
            value={action.amount ?? 1}
            onChange={(e) => onChange({ amount: Number(e.target.value) || 1 })}
            title="на сколько продвинуть"
            className="input text-[11px] py-1 w-14 shrink-0"
          />
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
      <span
        ref={(el) => registerAnchor(`in:${node.id}`, el)}
        className="absolute -left-1.5 top-5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[var(--popover-bg)]"
      />

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
          onClick={() => {
            if (confirm("Удалить эту ноду?")) deleteDialogueNode(dialogue.id, node.id);
          }}
          title="Удалить ноду"
          className="text-[var(--op-30)] hover:text-red-300 shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        {node.lines.map((l, i) => (
          <LineBlock key={l.id} dialogue={dialogue} node={node} line={l} index={i} canRemove={node.lines.length > 0} />
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
