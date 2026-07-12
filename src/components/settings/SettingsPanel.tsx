import { useState } from "react";
import { X, Check, Plus, Trash2, RotateCcw } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { useTheme, type ThemeSpec } from "../../lib/theme";

// The dialogue toolbar used to have a color-palette icon that only opened the dialogue markup
// "Стили" manager (named text-color styles for [c=...] tags — a genuinely different feature,
// still reachable from its own button right next to this one). This panel is the NEW gear icon
// next to it: app-wide preferences that aren't dialogue content at all — interface theme,
// interactive tutorials, and clearing away any "не показывать снова" dismissals — grouped in
// one place since none of it belongs inside any single window's own toolbar.
function Swatch({ theme }: { theme: ThemeSpec }) {
  return (
    <span className="flex shrink-0 rounded-full overflow-hidden w-5 h-5 border border-[var(--op-15)]">
      <span className="w-1/3 h-full" style={{ background: theme.bg }} />
      <span className="w-1/3 h-full" style={{ background: theme.ink }} />
      <span className="w-1/3 h-full" style={{ background: theme.accent }} />
    </span>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-sm text-[var(--op-60)]">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-7 rounded-md border border-[var(--op-15)] bg-transparent cursor-pointer" />
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { activeId, activeTheme, presets, customThemes, selectTheme, saveCustomTheme, deleteCustomTheme } = useTheme();
  const uiSettings = useProjectStore((s) => s.project.uiSettings);
  const updateUiSettings = useProjectStore((s) => s.updateUiSettings);
  const resetDeleteConfirmSuppression = useProjectStore((s) => s.resetDeleteConfirmSuppression);

  const [creatingTheme, setCreatingTheme] = useState(false);
  const [draftName, setDraftName] = useState("Моя тема");
  const [draftBg, setDraftBg] = useState(activeTheme.bg);
  const [draftInk, setDraftInk] = useState(activeTheme.ink);
  const [draftAccent, setDraftAccent] = useState(activeTheme.accent);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  const startCreatingTheme = () => {
    setDraftName("Моя тема");
    setDraftBg(activeTheme.bg);
    setDraftInk(activeTheme.ink);
    setDraftAccent(activeTheme.accent);
    setCreatingTheme(true);
  };
  const saveTheme = () => {
    saveCustomTheme({ name: draftName.trim() || "Моя тема", bg: draftBg, ink: draftInk, accent: draftAccent });
    setCreatingTheme(false);
  };

  const tutorialsEnabled = uiSettings?.tutorialsEnabled ?? true;
  const dismissedCount = uiSettings?.dismissedTutorials?.length ?? 0;

  const flash = (msg: string) => {
    setResetNotice(msg);
    setTimeout(() => setResetNotice(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onMouseDown={onClose}>
      <div
        className="popover rounded-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--op-10)] shrink-0">
          <div className="text-sm font-medium text-[var(--op-85)]">Настройки</div>
          <div className="flex-1" />
          <button onClick={onClose} className="w-7 h-7 grid place-items-center rounded-md glass hover:bg-[var(--op-10)]">
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ---- Theme management ---- */}
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Тема интерфейса</div>
            {!creatingTheme ? (
              <>
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
                    <div className="text-[10px] uppercase tracking-wider text-[var(--op-30)] px-1 pt-2 pb-1">Мои темы</div>
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
                          <button onClick={(e) => { e.stopPropagation(); deleteCustomTheme(t.id); }} className="opacity-40 hover:opacity-100 hover:text-red-300 shrink-0">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={startCreatingTheme}
                    className="flex-1 flex items-center gap-1.5 justify-center text-xs px-2 py-2 rounded-md border border-dashed border-[var(--op-20)] text-[var(--op-50)] hover:text-[var(--op-80)] hover:border-[var(--op-35)]"
                  >
                    <Plus size={12} /> Создать свою тему
                  </button>
                  <button
                    onClick={() => {
                      selectTheme("dark");
                      flash("Тема сброшена на стандартную.");
                    }}
                    title="Сбросить тему на стандартную (Тёмное стекло)"
                    className="flex items-center gap-1.5 text-xs px-2 py-2 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-55)]"
                  >
                    <RotateCcw size={12} /> По умолчанию
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <input className="input" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Название темы" />
                <ColorRow label="Фон" value={draftBg} onChange={setDraftBg} />
                <ColorRow label="Текст и поверхности" value={draftInk} onChange={setDraftInk} />
                <ColorRow label="Акцент" value={draftAccent} onChange={setDraftAccent} />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setCreatingTheme(false)} className="flex-1 text-sm px-3 py-1.5 rounded-md hover:bg-[var(--op-10)]">
                    Отмена
                  </button>
                  <button onClick={saveTheme} className="flex-1 text-sm px-3 py-1.5 rounded-md bg-accent/80 hover:bg-accent transition-colors">
                    Сохранить
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Interactive tutorials ---- */}
          <div className="pt-4 border-t border-[var(--op-8)]">
            <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Обучение</div>
            <label className="flex items-center gap-2.5 text-sm text-[var(--op-75)] cursor-pointer select-none py-1">
              <input
                type="checkbox"
                checked={tutorialsEnabled}
                onChange={(e) => updateUiSettings({ tutorialsEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <span className="w-4 h-4 rounded-[4px] border border-[var(--op-20)] bg-[var(--op-5)] grid place-items-center shrink-0 transition-colors peer-checked:bg-accent/80 peer-checked:border-accent">
                <Check size={11} className="text-[var(--popover-bg)] opacity-0 peer-checked:opacity-100" strokeWidth={3} />
              </span>
              Показывать интерактивные подсказки-туры по окнам
            </label>
            <div className="text-[11px] text-[var(--op-35)] pl-6 -mt-0.5 mb-2">
              {dismissedCount > 0 ? `Скрыто туров: ${dismissedCount}.` : "Все туры ещё не показаны ни разу."}
            </div>
            <button
              onClick={() => {
                updateUiSettings({ dismissedTutorials: [] });
                flash("Все подсказки будут показаны заново.");
              }}
              disabled={dismissedCount === 0}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-55)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw size={12} /> Сбросить «не показывать снова»
            </button>
          </div>

          {/* ---- Dialogue-specific settings ---- */}
          <div className="pt-4 border-t border-[var(--op-8)]">
            <div className="text-sm font-medium text-[var(--op-80)] mb-3">Диалоги</div>
            <div className="text-xs uppercase tracking-wider text-[var(--op-35)] mb-2">Подтверждение удаления нод</div>
            <div className="text-[11px] text-[var(--op-40)] mb-2">
              {uiSettings?.skipDeleteConfirmGlobal
                ? "Окно подтверждения отключено везде."
                : "Окно подтверждения активно (кроме диалогов, где вы его отключили индивидуально)."}
            </div>
            <button
              onClick={() => {
                resetDeleteConfirmSuppression();
                flash("Окно подтверждения удаления снова включено везде.");
              }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md glass hover:bg-[var(--op-10)] text-[var(--op-55)]"
            >
              <RotateCcw size={12} /> Вернуть окно подтверждения
            </button>
          </div>

          {resetNotice && (
            <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">{resetNotice}</div>
          )}
        </div>
      </div>
    </div>
  );
}
