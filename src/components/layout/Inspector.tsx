import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";

const TABS = ["Properties", "References", "History", "Diagnostics"] as const;

export function Inspector() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Properties");
  const activeIndex = useProjectStore((s) => s.activeTabIndex);
  const openTabs = useProjectStore((s) => s.openTabs);
  const entries = useProjectStore((s) => s.project.entries);
  const activeTab = activeIndex >= 0 ? openTabs[activeIndex] : undefined;
  const entry = activeTab ? entries.find((e) => e.id === activeTab.id) : undefined;

  return (
    <div className="w-[360px] glass shrink-0 flex flex-col overflow-hidden">
      <div className="flex border-b border-white/10 text-xs">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 transition-colors ${
              tab === t ? "text-white border-b-2 border-accent" : "text-white/40 hover:text-white/70"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {!entry && <div className="text-white/30">Ничего не выбрано — откройте объект из галереи.</div>}

        {entry && tab === "Properties" && (
          <div className="space-y-3">
            <Row label="UUID" value={entry.uuid} mono />
            <Row label="Readable ID" value={entry.id} mono />
            <Row label="Version" value={String(entry.version || 1)} />
            <Row label="Category" value={entry.category} />
          </div>
        )}

        {entry && tab === "References" && (
          <div className="text-white/40">
            <div className="mb-2 text-white/60">Incoming</div>
            <div className="text-xs mb-4">Пока нет объектов, ссылающихся на этот.</div>
            <div className="mb-2 text-white/60">Outgoing</div>
            <div className="text-xs">
              {entry.rarityId ? (
                <>
                  rarity → <span className="mono">{entry.rarityId}</span>
                </>
              ) : (
                "нет исходящих ссылок"
              )}
            </div>
          </div>
        )}

        {entry && tab === "History" && <div className="text-white/30 text-xs">История не записывается в этой сессии.</div>}

        {entry && tab === "Diagnostics" && <Diagnostics entryId={entry.id} />}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40">{label}</span>
      <span className={mono ? "mono text-white/80" : "text-white/80"}>{value}</span>
    </div>
  );
}

function Diagnostics({ entryId }: { entryId: string }) {
  const entry = useProjectStore((s) => s.project.entries.find((e) => e.id === entryId));
  if (!entry) return null;
  const warnings: string[] = [];
  if (entry.stats && Object.values(entry.stats).some((v) => v !== undefined && Math.abs(v) >= 9999)) {
    warnings.push("Подозрительная величина стата — похоже на min-clamp хак (см. docs/12_Editors.md).");
  }
  if (entry.category === "equipment" && !entry.overlay) {
    warnings.push("Не задан overlay — предмет не будет виден на персонаже при экипировке.");
  }
  if (warnings.length === 0) return <div className="text-white/30 text-xs">Проблем не найдено.</div>;
  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="text-xs px-2 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90">
          {w}
        </div>
      ))}
    </div>
  );
}
