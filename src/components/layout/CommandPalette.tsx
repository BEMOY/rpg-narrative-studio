import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, CornerDownLeft } from "lucide-react";
import { CAT_ICON } from "../../lib/categoryIcons";
import { useProjectStore } from "../../store/useProjectStore";
import { CAT_COLOR, CAT_LABEL, type Category, type Entry } from "../../types/database";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useProjectStore((s) => s.project.entries);
  const openEntry = useProjectStore((s) => s.openEntry);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      // wait a tick for the element to mount
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 30);
    return entries
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [entries, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const e2 = results[activeIdx];
        if (e2) {
          openEntry(e2.id);
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, onClose, openEntry]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-28" onClick={onClose}>
      <div
        className="popover rounded-lg w-full max-w-xl mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--op-10)]">
          <Search size={16} className="text-[var(--op-40)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Поиск по всему проекту…"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--op-80)] placeholder:text-[var(--op-30)]"
          />
          <span className="text-[10px] mono text-[var(--op-30)] px-1.5 py-0.5 rounded border border-[var(--op-15)]">Esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--op-30)]">Ничего не найдено.</div>
          ) : (
            results.map((e, i) => {
              const Icon = CAT_ICON[e.category];
              const color = CAT_COLOR[e.category];
              const active = i === activeIdx;
              return (
                <button
                  key={e.id}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => {
                    openEntry(e.id);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    active ? "bg-[var(--op-10)]" : "hover:bg-[var(--op-7)]"
                  }`}
                >
                  <span className="w-7 h-7 rounded-md grid place-items-center shrink-0" style={{ background: color + "29", color }}>
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-[var(--op-85)] truncate">{e.name}</span>
                    <span className="block text-xs text-[var(--op-35)] truncate">{CAT_LABEL[e.category]}</span>
                  </span>
                  {active && <CornerDownLeft size={13} className="text-[var(--op-30)] shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
