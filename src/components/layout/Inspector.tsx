// The IDE shell's right-hand context panel — shows properties for whatever's open in the
// active Workspace tab. References/History/Diagnostics used to live here as extra tabs, but
// per the Dynarain vision those are project-wide/cross-cutting concerns and now live in
// BottomHub.tsx instead (Problems replaces the old per-entry Diagnostics with a project-wide
// scan, References now reflects the active tab from the bottom panel, History stays a shared
// placeholder). Inspector itself is left as a single Properties view for now — the richer,
// per-editor contextual panels described in the vision (stats, equipment slots, dependency
// pickers) are a later phase's work once each editor gets its own reskin.
import { useProjectStore } from "../../store/useProjectStore";
import { UsageRows, useUsages } from "../editors/UsageSection";

export function Inspector() {
  const activeIndex = useProjectStore((s) => s.activeTabIndex);
  const openTabs = useProjectStore((s) => s.openTabs);
  const entries = useProjectStore((s) => s.project.entries);
  const activeTab = activeIndex >= 0 ? openTabs[activeIndex] : undefined;
  const entry = activeTab ? entries.find((e) => e.id === activeTab.id) : undefined;

  return (
    <div className="w-full h-full glass flex flex-col overflow-hidden">
      <div className="flex border-b border-[var(--op-10)] text-xs">
        <div className="flex-1 py-2.5 text-center text-white border-b-2 border-accent">Properties</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {!entry && <div className="text-[var(--op-30)]">Ничего не выбрано — откройте объект из проводника или галереи.</div>}

        {entry && (
          <div className="space-y-3">
            <Row label="UUID" value={entry.uuid} mono />
            <Row label="Readable ID" value={entry.id} mono />
            <Row label="Version" value={String(entry.version || 1)} />
            <Row label="Category" value={entry.category} />
            {entry.chapter && <Row label="Chapter" value={entry.chapter} />}
            <InspectorUsages entryId={entry.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// v77 — compact live reverse-references right in the Inspector (full block lives on the card).
function InspectorUsages({ entryId }: { entryId: string }) {
  const usages = useUsages(entryId);
  return (
    <div className="pt-3 border-t border-[var(--op-8)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--op-35)] mb-2">Где используется ({usages.length})</div>
      <UsageRows usages={usages} compact />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--op-40)]">{label}</span>
      <span className={mono ? "mono text-[var(--op-80)]" : "text-[var(--op-80)]"}>{value}</span>
    </div>
  );
}
