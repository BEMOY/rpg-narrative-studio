import { useRef, useState } from "react";
import { ChevronDown, Lock, Search } from "lucide-react";
import { PortalMenu } from "../common/PortalMenu";

export interface SearchSelectOption {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
  // Shown greyed-out with a lock icon and not selectable — e.g. a quest that would create a
  // contradictory/circular dependency if picked (see questAncestorIds + QuestPanel).
  disabled?: boolean;
}

// Reusable searchable single-select combobox — used wherever the dialogue editor needs to
// pick one item out of a potentially long list (character speakers, quests, objects/items).
// Replaces plain <select> pickers, which had no search/filter at all.
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "Выбрать…",
  searchPlaceholder = "Поиск…",
  allowClear = true,
  clearLabel = "— нет —",
  onCreate,
  createLabel = "Создать",
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  // v77 инлайн-создание: when provided, the dropdown grows a "+ Создать «…»" row — the host
  // mints a new properly-shaped entity from the typed name (usually via createEntryQuick) and
  // is expected to select it itself (call onChange with the fresh id inside onCreate).
  onCreate?: (name: string) => void;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));

  const pick = (id: string | undefined) => {
    onChange(id);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input text-xs py-1 w-full flex items-center justify-between gap-1 text-left"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {selected?.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: selected.color }} />}
          <span className={`truncate ${selected ? "text-[var(--op-85)]" : "text-[var(--op-35)]"}`}>{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown size={12} className="text-[var(--op-35)] shrink-0" />
      </button>
      <PortalMenu anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div className="w-56 p-1.5">
          <div className="glass rounded-md px-2 py-1 flex items-center gap-1.5 mb-1">
            <Search size={11} className="text-[var(--op-35)] shrink-0" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="bg-transparent outline-none text-xs w-full text-[var(--op-80)] placeholder:text-[var(--op-30)]"
            />
          </div>
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {allowClear && (
              <button onClick={() => pick(undefined)} className="w-full text-left px-2 py-1.5 rounded-md text-[11px] text-[var(--op-40)] hover:bg-[var(--op-7)]">
                {clearLabel}
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={o.disabled}
                onClick={() => {
                  if (o.disabled) return;
                  pick(o.id);
                }}
                title={o.disabled ? "Недоступно: это привело бы к противоречивой/циклической зависимости" : undefined}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] flex items-center gap-1.5 ${
                  o.disabled
                    ? "text-[var(--op-25)] cursor-not-allowed"
                    : o.id === value
                      ? "bg-accent/20 text-[var(--op-90)]"
                      : "text-[var(--op-70)] hover:bg-[var(--op-7)]"
                }`}
              >
                {o.disabled ? (
                  <Lock size={10} className="shrink-0 text-[var(--op-25)]" />
                ) : (
                  o.color && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: o.color }} />
                )}
                <span className="truncate">{o.label}</span>
                {o.sublabel && <span className="text-[var(--op-30)] ml-auto shrink-0">{o.sublabel}</span>}
              </button>
            ))}
            {filtered.length === 0 && !onCreate && (
              <div className="text-[10px] text-[var(--op-30)] px-2 py-2 text-center">Ничего не найдено</div>
            )}
            {onCreate && (
              <button
                type="button"
                onClick={() => {
                  const name = q.trim();
                  onCreate(name || "Новый объект");
                  setOpen(false);
                  setQ("");
                }}
                className="w-full text-left px-2 py-1.5 rounded-md text-[11px] flex items-center gap-1.5 text-accent hover:bg-accent/10 border-t border-[var(--op-8)] mt-0.5"
                title="Создать новую запись и сразу привязать сюда — не покидая контекста"
              >
                <span className="text-sm leading-none">＋</span>
                <span className="truncate">
                  {createLabel}
                  {q.trim() ? ` «${q.trim()}»` : "…"}
                </span>
              </button>
            )}
          </div>
        </div>
      </PortalMenu>
    </>
  );
}
