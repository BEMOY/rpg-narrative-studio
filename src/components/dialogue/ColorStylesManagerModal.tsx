import { useState } from "react";
import { X, Plus, Trash2, Palette } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { MarkupText } from "./MarkupText";
import type { ColorStyleMode, DialogueColorStyle } from "../../types/database";

const MODE_LABEL: Record<ColorStyleMode, string> = {
  solid: "Сплошной",
  gradient: "Градиент (статичный, по буквам)",
  pulse: "Пульс (весь текст, по времени)",
  gradient_anim: "Градиент + анимация",
  rainbow: "Радуга",
};

const MODE_NEEDS_B: Record<ColorStyleMode, boolean> = {
  solid: false,
  gradient: true,
  pulse: true,
  gradient_anim: true,
  rainbow: false,
};

const MODE_NEEDS_SPEED: Record<ColorStyleMode, boolean> = {
  solid: false,
  gradient: false,
  pulse: true,
  gradient_anim: true,
  rainbow: true,
};

function StyleRow({ style }: { style: DialogueColorStyle }) {
  const setColorStyle = useProjectStore((s) => s.setColorStyle);
  const removeColorStyle = useProjectStore((s) => s.removeColorStyle);
  const patch = (p: Partial<DialogueColorStyle>) => setColorStyle({ ...style, ...p });

  return (
    <div className="rounded-md border border-[var(--op-7)] p-2.5 space-y-2 bg-[var(--op-3)]">
      <div className="flex items-center gap-1.5">
        <span className="mono text-xs text-accent px-2 py-1 rounded bg-accent/10 shrink-0">[c={style.name}]</span>
        <div className="flex-1 min-w-0 px-2 py-1 rounded bg-black/20 overflow-hidden">
          <MarkupText text={`[c=${style.name}]Пример текста в диалоге[/c]`} styles={[style]} className="text-xs" />
        </div>
        <button
          onClick={() => confirm(`Удалить стиль «${style.name}»? Уже вставленные [c=${style.name}] теги в тексте останутся как есть.`) && removeColorStyle(style.name)}
          className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={style.mode}
          onChange={(e) => patch({ mode: e.target.value as ColorStyleMode })}
          className="input text-xs py-1 flex-1 min-w-[160px]"
        >
          {(Object.keys(MODE_LABEL) as ColorStyleMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-[var(--op-40)]">
          A
          <input type="color" value={style.a || "#ffffff"} onChange={(e) => patch({ a: e.target.value })} className="w-7 h-7 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer" />
        </label>
        {MODE_NEEDS_B[style.mode] && (
          <label className="flex items-center gap-1 text-[10px] text-[var(--op-40)]">
            B
            <input type="color" value={style.b || "#ffffff"} onChange={(e) => patch({ b: e.target.value })} className="w-7 h-7 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer" />
          </label>
        )}
        {MODE_NEEDS_SPEED[style.mode] && (
          <label className="flex items-center gap-1 text-[10px] text-[var(--op-40)]">
            Скорость
            <input
              type="number"
              step={0.1}
              value={style.speed}
              onChange={(e) => patch({ speed: Number(e.target.value) || 0 })}
              className="input text-xs py-1 w-16"
            />
          </label>
        )}
      </div>
    </div>
  );
}

export function ColorStylesManagerModal({ onClose }: { onClose: () => void }) {
  const styles = useProjectStore((s) => s.project.colorStyles);
  const setColorStyle = useProjectStore((s) => s.setColorStyle);
  const [draft, setDraft] = useState("");

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (styles.some((s) => s.name === name)) {
      alert(`Стиль «${name}» уже существует.`);
      return;
    }
    setColorStyle({ name, mode: "gradient", a: "#ff7043", b: "#8b5cf6", speed: 1 });
    setDraft("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="popover rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <Palette size={14} className="text-accent" />
          <span className="text-sm font-medium text-[var(--op-85)]">Цветовые стили ([c=имя])</span>
          <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
        <div className="px-4 pt-3 pb-1 text-[11px] text-[var(--op-40)] leading-relaxed shrink-0">
          Соответствуют вашему global.colors — цвет вычисляется точно по вашей формуле
          (color_eval_glyph): по позиции буквы и, для анимированных режимов, по времени.
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {styles.length === 0 && <div className="text-xs text-[var(--op-30)] text-center py-4">Пока нет стилей — добавьте первый ниже.</div>}
          {styles.map((s) => (
            <StyleRow key={s.name} style={s} />
          ))}
        </div>
        <div className="flex items-center gap-2 p-3 border-t border-[var(--op-10)] shrink-0">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="имя нового стиля (fire, cursed, rainbow…)"
            className="input flex-1 text-sm py-1.5"
          />
          <button onClick={add} className="w-8 h-8 shrink-0 grid place-items-center rounded-md bg-accent/80 hover:bg-accent">
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
