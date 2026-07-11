import { useRef, useState } from "react";
import { Palette, Check, Plus, Trash2 } from "lucide-react";
import { useTheme, type ThemeSpec } from "../lib/theme";

function Swatch({ theme }: { theme: ThemeSpec }) {
  return (
    <span className="flex shrink-0 rounded-full overflow-hidden w-5 h-5 border border-[var(--op-15)]">
      <span className="w-1/3 h-full" style={{ background: theme.bg }} />
      <span className="w-1/3 h-full" style={{ background: theme.ink }} />
      <span className="w-1/3 h-full" style={{ background: theme.accent }} />
    </span>
  );
}

export function ThemeMenu() {
  const { activeId, activeTheme, presets, customThemes, selectTheme, saveCustomTheme, deleteCustomTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("Моя тема");
  const [draftBg, setDraftBg] = useState(activeTheme.bg);
  const [draftInk, setDraftInk] = useState(activeTheme.ink);
  const [draftAccent, setDraftAccent] = useState(activeTheme.accent);
  const btnRef = useRef<HTMLButtonElement>(null);

  const startCreating = () => {
    setDraftName("Моя тема");
    setDraftBg(activeTheme.bg);
    setDraftInk(activeTheme.ink);
    setDraftAccent(activeTheme.accent);
    setCreating(true);
  };

  const save = () => {
    saveCustomTheme({ name: draftName.trim() || "Моя тема", bg: draftBg, ink: draftInk, accent: draftAccent });
    setCreating(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Тема интерфейса"
        className="w-8 h-8 grid place-items-center rounded-md hover:bg-[var(--op-10)] text-[var(--op-50)] hover:text-[var(--op-90)] transition-colors"
      >
        <Palette size={15} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-72 glass rounded-lg p-3 space-y-3 shadow-xl">
            {!creating ? (
              <>
                <div className="text-xs uppercase tracking-wider text-[var(--op-35)] px-1">Готовые темы</div>
                <div className="space-y-1">
                  {presets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTheme(t.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[var(--op-7)] text-left text-sm text-[var(--op-80)]"
                    >
                      <Swatch theme={t} />
                      <span className="flex-1 truncate">{t.name}</span>
                      {activeId === t.id && <Check size={14} className="text-accent shrink-0" />}
                    </button>
                  ))}
                </div>

                {customThemes.length > 0 && (
                  <>
                    <div className="text-xs uppercase tracking-wider text-[var(--op-35)] px-1 pt-1">Мои темы</div>
                    <div className="space-y-1">
                      {customThemes.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => selectTheme(t.id)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[var(--op-7)] cursor-pointer text-sm text-[var(--op-80)]"
                        >
                          <Swatch theme={t} />
                          <span className="flex-1 truncate">{t.name}</span>
                          {activeId === t.id && <Check size={14} className="text-accent shrink-0" />}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCustomTheme(t.id);
                            }}
                            className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button
                  onClick={startCreating}
                  className="w-full flex items-center gap-1.5 justify-center text-xs px-2 py-2 rounded-md border border-dashed border-[var(--op-20)] text-[var(--op-50)] hover:text-[var(--op-80)] hover:border-[var(--op-35)]"
                >
                  <Plus size={12} /> Создать свою тему
                </button>
              </>
            ) : (
              <>
                <div className="text-xs uppercase tracking-wider text-[var(--op-35)] px-1">Своя тема</div>
                <input
                  className="input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Название темы"
                />
                <ColorRow label="Фон" value={draftBg} onChange={setDraftBg} />
                <ColorRow label="Текст и поверхности" value={draftInk} onChange={setDraftInk} />
                <ColorRow label="Акцент" value={draftAccent} onChange={setDraftAccent} />
                <div className="text-[10px] text-[var(--op-30)] px-1 leading-relaxed">
                  Совет: для тёмной темы «Текст и поверхности» должен быть светлым, для светлой — тёмным.
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setCreating(false)}
                    className="flex-1 text-sm px-3 py-1.5 rounded-md hover:bg-[var(--op-10)]"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={save}
                    className="flex-1 text-sm px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors"
                  >
                    Сохранить
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-sm text-[var(--op-60)]">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-7 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer"
      />
    </div>
  );
}
