// The IDE shell's bottom information hub (Problems / Console / References / History), spanning
// the full width below the Explorer+Workspace+Inspector row — see the Dynarain vision's
// "Информационный хаб". Problems and References used to live inside Inspector.tsx (as
// per-selected-entry tabs); Problems is now project-wide (scans everything, not just whatever's
// selected) and References now reflects whatever tab is currently active in the Workspace,
// matching the vision's split between the right Inspector (contextual properties) and this
// bottom panel (cross-cutting project health/navigation info).
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, Link2, Terminal, History as HistoryIcon } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { computeProblems } from "../../lib/problems";
import { exportToGameMaker } from "../../export/gameMakerExporter";

const TABS = ["Problems", "References", "Console", "History"] as const;
type HubTab = (typeof TABS)[number];

export function BottomHub() {
  const [collapsed, setCollapsed] = useState(true);
  const [tab, setTab] = useState<HubTab>("Problems");
  const project = useProjectStore((s) => s.project);
  const problems = useMemo(() => computeProblems(project), [project]);

  const TAB_ICON: Record<HubTab, React.ComponentType<any>> = {
    Problems: AlertTriangle,
    References: Link2,
    Console: Terminal,
    History: HistoryIcon,
  };

  return (
    <div className="w-full glass border-t border-[var(--op-10)] flex flex-col shrink-0" style={{ height: collapsed ? 34 : 220 }}>
      <div className="h-[34px] flex items-center shrink-0 border-b border-[var(--op-10)]" style={{ borderBottomWidth: collapsed ? 0 : 1 }}>
        {TABS.map((t) => {
          const Icon = TAB_ICON[t];
          const badge = t === "Problems" ? problems.length : undefined;
          return (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (collapsed) setCollapsed(false);
              }}
              className={`h-full flex items-center gap-1.5 px-3 text-xs transition-colors border-r border-[var(--op-10)] ${
                !collapsed && tab === t ? "text-[var(--op-90)] bg-[var(--op-6)]" : "text-[var(--op-45)] hover:text-[var(--op-70)]"
              }`}
            >
              <Icon size={12} />
              {t}
              {badge !== undefined && badge > 0 && (
                <span className="ml-0.5 text-[10px] mono px-1 rounded-full bg-yellow-500/20 text-yellow-200/90">{badge}</span>
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="h-full px-3 text-[var(--op-45)] hover:text-[var(--op-80)]"
          title={collapsed ? "Развернуть панель" : "Свернуть панель"}
        >
          {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3 text-xs">
          {tab === "Problems" && <ProblemsTab />}
          {tab === "References" && <ReferencesTab />}
          {tab === "Console" && <ConsoleTab />}
          {tab === "History" && <div className="text-[var(--op-30)]">История не записывается в этой сессии.</div>}
        </div>
      )}
    </div>
  );
}

function ProblemsTab() {
  const project = useProjectStore((s) => s.project);
  const problems = useMemo(() => computeProblems(project), [project]);
  const openEntry = useProjectStore((s) => s.openEntry);
  const setActiveDialogue = useProjectStore((s) => s.setActiveDialogue);
  const showDialogues = useProjectStore((s) => s.showDialogues);

  if (problems.length === 0) return <div className="text-[var(--op-30)]">Проблем не найдено.</div>;

  return (
    <div className="space-y-1.5">
      {problems.map((p) => (
        <button
          key={p.id}
          onClick={() => {
            if (p.target.kind === "entry") openEntry(p.target.id);
            else {
              setActiveDialogue(p.target.id);
              showDialogues();
            }
          }}
          className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--op-6)] text-[var(--op-70)]"
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5 text-yellow-400/80" />
          <span>{p.message}</span>
        </button>
      ))}
    </div>
  );
}

function ReferencesTab() {
  const openTabs = useProjectStore((s) => s.openTabs);
  const activeTabIndex = useProjectStore((s) => s.activeTabIndex);
  const entries = useProjectStore((s) => s.project.entries);
  const activeTab = activeTabIndex >= 0 ? openTabs[activeTabIndex] : undefined;
  const entry = activeTab ? entries.find((e) => e.id === activeTab.id) : undefined;

  if (!entry) return <div className="text-[var(--op-30)]">Откройте объект во вкладке, чтобы увидеть его связи.</div>;

  const incoming = entries.filter((e) => e.id !== entry.id && e.references.includes(entry.id));
  const outgoingEntries = entry.references.map((id) => entries.find((e) => e.id === id)).filter((e): e is typeof entry => Boolean(e));

  return (
    <div className="text-[var(--op-40)]">
      <div className="mb-1.5 text-[var(--op-60)]">Ссылаются на «{entry.name}»</div>
      {incoming.length === 0 ? (
        <div className="mb-3">Пока нет объектов, ссылающихся на этот.</div>
      ) : (
        <div className="space-y-1 mb-3">
          {incoming.map((e) => (
            <div key={e.id} className="text-[var(--op-70)]">{e.name}</div>
          ))}
        </div>
      )}
      <div className="mb-1.5 text-[var(--op-60)]">«{entry.name}» ссылается на</div>
      {outgoingEntries.length === 0 && !entry.rarityId ? (
        <div>нет исходящих ссылок</div>
      ) : (
        <div className="space-y-1">
          {outgoingEntries.map((e) => (
            <div key={e.id} className="text-[var(--op-70)]">{e.name}</div>
          ))}
          {entry.rarityId && (
            <div>
              rarity → <span className="mono">{entry.rarityId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConsoleTab() {
  const project = useProjectStore((s) => s.project);
  const result = useMemo(() => exportToGameMaker(project), [project]);
  return (
    <div className="space-y-1">
      <div className="text-[var(--op-50)] mono">
        Готово к экспорту: {result.files.length} файл(ов), {result.warnings.length} предупреждени(й).
      </div>
      {result.warnings.map((w, i) => (
        <div key={i} className="text-yellow-200/80 mono">
          <span className="text-[var(--op-40)]">{w.objectId}</span> — {w.message}
        </div>
      ))}
    </div>
  );
}
