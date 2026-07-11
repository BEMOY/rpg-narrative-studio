import { useRef } from "react";
import { Star, Trash2, Plus, X, GripHorizontal } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { ConditionEditor } from "./ConditionEditor";
import { SearchSelect } from "./SearchSelect";
import { MarkupText } from "./MarkupText";
import type { Dialogue, DialogueChoice, DialogueLine, DialogueNode, DialogueSide } from "../../types/database";
import { MARKUP_TAGS } from "../../lib/dialogueMarkup";

function LineTextEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Applying an effect: select a range of text first, then click the effect's name — for
  // "paired" tags (wave/shake/c=...) the selection gets wrapped in [tag]...[/tag]; for
  // point-in-time codes (speed/pause, which aren't ranges in the engine) the code is just
  // inserted at the caret/selection start. Falls back to inserting an empty pair at the
  // caret if nothing is selected, so the tags are still reachable via typing between them.
  const applyTag = (def: (typeof MARKUP_TAGS)[number]) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;

    let arg: string | undefined;
    if (def.promptForValue) {
      const entered = prompt(def.promptLabel ?? `Значение для ${def.label}`, def.defaultValue ?? "");
      if (entered === null) return; // cancelled
      arg = entered.trim();
    }
    const openTag = arg ? `[${def.id}=${arg}]` : `[${def.id}]`;

    let next: string;
    let caretStart: number;
    let caretEnd: number;
    if (def.paired) {
      const closeTag = `[/${def.id}]`;
      const selected = value.slice(start, end);
      next = value.slice(0, start) + openTag + selected + closeTag + value.slice(end);
      caretStart = start + openTag.length;
      caretEnd = caretStart + selected.length;
    } else {
      next = value.slice(0, start) + openTag + value.slice(end);
      caretStart = caretEnd = start + openTag.length;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caretStart, caretEnd);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {MARKUP_TAGS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTag(t)}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--op-6)] text-[var(--op-40)] hover:text-[var(--op-70)] hover:bg-[var(--op-10)] mono"
            title={t.paired ? `Выделите текст и нажмите, чтобы обернуть в ${t.label}` : `Вставить ${t.label} в курсор`}
          >
            {t.label}
          </button>
        ))}
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
          <MarkupText text={value} />
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
      <input
        value={fs.value}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="значение"
        className="input text-[11px] py-1 flex-1 min-w-0"
      />
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
        <input
          value={line.speaker}
          onChange={(e) => patch({ speaker: e.target.value })}
          placeholder="спикер: имя (или привяжите персонажа справа)"
          className="input text-xs py-1 flex-1 min-w-0"
        />
        <div className="w-36 shrink-0">
          <SearchSelect
            value={line.speakerEntryId}
            onChange={(id) => {
              const ent = characters.find((c) => c.id === id);
              patch({ speakerEntryId: id, speaker: ent ? ent.name : line.speaker });
            }}
            options={characters.map((c) => ({ id: c.id, label: c.name }))}
            placeholder="персонаж…"
            searchPlaceholder="Поиск персонажа…"
            clearLabel="— не привязан —"
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

  return (
    <div className="relative rounded-md border border-[var(--op-7)] p-2 space-y-1.5 bg-[var(--op-3)]">
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

      {targetNode ? (
        <div className="flex items-center gap-1.5 text-[11px] text-teal-300">
          <span
            ref={(el) => registerAnchor(`choice:${choice.id}`, el)}
            className="p-2 -m-2 shrink-0 cursor-crosshair grid place-items-center hover:bg-teal-400/10 rounded-full transition-colors"
            onMouseDown={(e) => onLinkDragStart(`choice:${choice.id}`, e)}
            title="Перетяните на другую ноду, чтобы изменить связь"
          >
            <span className="block w-2.5 h-2.5 rounded-full bg-teal-400" />
          </span>
          → ветка {targetNode.lines[0]?.speaker || targetNode.id}
          <button onClick={() => setChoiceTarget(dialogue.id, node.id, choice.id, undefined)} className="opacity-50 hover:opacity-100 ml-auto">
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--op-35)]">
          <span
            ref={(el) => registerAnchor(`choice:${choice.id}`, el)}
            className="p-2 -m-2 shrink-0 cursor-crosshair grid place-items-center hover:bg-teal-400/10 rounded-full transition-colors"
            onMouseDown={(e) => onLinkDragStart(`choice:${choice.id}`, e)}
            title="Перетяните на другую ноду"
          >
            <span className="block w-2.5 h-2.5 rounded-full border border-dashed border-teal-400/60" />
          </span>
          перетяните кружок на другую ноду — ветка
        </div>
      )}
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
              ▼ продолжение — перетяните вниз к другой ноде
            </div>
          )
        ) : (
          <div className="text-center text-[10px] text-[var(--op-25)] py-1">▼ продолжение недоступно: есть выборы — они завершают реплику</div>
        )}
      </div>
    </div>
  );
}
